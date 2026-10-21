"""Geofencing service - distance checks for clock-in, office locations,
employee location requests and review of flagged attendance."""

import math
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy.orm import Session

from app.models.attendance_record import AttendanceRecord
from app.models.company import Company
from app.models.employee import Employee
from app.models.geofence import EmployeeLocationRequest, OfficeLocation
from app.models.notification import Notification
from app.services.audit_service import log_action

MIN_RADIUS_M = 50
MAX_RADIUS_M = 5000
DEFAULT_RADIUS_M = 100
MAX_EMPLOYEE_LOCATIONS = 3  # approved + pending per employee
MAX_ACCURACY_M = 200  # readings worse than this are not trusted
GEOFENCED_SOURCES = {"web", "mobile"}  # biometric devices are fixed in place
MODES = {"block", "flag"}


def haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Great-circle distance in metres."""
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = p2 - p1
    dlmb = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def _validate_point(lat: float, lng: float, radius: int) -> None:
    if not (-90 <= lat <= 90) or not (-180 <= lng <= 180):
        raise ValueError("Invalid latitude/longitude.")
    if not (MIN_RADIUS_M <= radius <= MAX_RADIUS_M):
        raise ValueError(f"Radius must be between {MIN_RADIUS_M} m and {MAX_RADIUS_M} m.")


def _notify(db: Session, company_id: UUID, recipient_id: UUID, actor_id: UUID | None,
            type_: str, title: str, message: str, entity_type: str, entity_id: UUID | None,
            link: str | None = None) -> None:
    db.add(Notification(
        company_id=company_id,
        recipient_employee_id=recipient_id,
        actor_employee_id=actor_id,
        type=type_,
        title=title,
        message=message,
        entity_type=entity_type,
        entity_id=entity_id,
        link=link,
    ))


class GeofenceService:
    def __init__(self, db: Session, company_id: UUID):
        self.db = db
        self.company_id = company_id

    # ── company settings ──────────────────────────────────────────────
    def _company(self) -> Company:
        return self.db.query(Company).filter(Company.id == self.company_id).first()

    def get_config(self, employee_id: UUID | None = None) -> dict:
        company = self._company()
        cfg = {
            "enabled": bool(company.geofence_enabled),
            "mode": company.geofence_mode,
            "min_radius_m": MIN_RADIUS_M,
            "max_radius_m": MAX_RADIUS_M,
            "default_radius_m": DEFAULT_RADIUS_M,
            "max_employee_locations": MAX_EMPLOYEE_LOCATIONS,
            "offices": self.list_offices(),
        }
        if employee_id:
            cfg["my_locations"] = self.list_employee_requests(employee_id=employee_id)
        return cfg

    def update_config(self, actor_id: UUID | None, enabled: bool | None, mode: str | None,
                      office: dict | None) -> dict:
        company = self._company()
        if mode is not None:
            if mode not in MODES:
                raise ValueError("Mode must be 'block' or 'flag'.")
            company.geofence_mode = mode
        if office is not None:
            self._add_office(actor_id, office)
        if enabled is not None:
            if enabled and not self._active_offices():
                raise ValueError("Add at least one office location before enabling geofencing.")
            changed = company.geofence_enabled != enabled
            company.geofence_enabled = enabled
            if changed:
                log_action(self.db, self.company_id, actor_id,
                           "geofence_enabled" if enabled else "geofence_disabled",
                           "company", self.company_id, {"mode": company.geofence_mode})
        self.db.commit()
        return self.get_config()

    # ── offices ───────────────────────────────────────────────────────
    def _active_offices(self) -> list[OfficeLocation]:
        return (self.db.query(OfficeLocation)
                .filter(OfficeLocation.company_id == self.company_id, OfficeLocation.is_active.is_(True))
                .all())

    def list_offices(self) -> list[dict]:
        rows = (self.db.query(OfficeLocation)
                .filter(OfficeLocation.company_id == self.company_id, OfficeLocation.is_active.is_(True))
                .order_by(OfficeLocation.created_at).all())
        return [self._office_dict(o) for o in rows]

    @staticmethod
    def _office_dict(o: OfficeLocation) -> dict:
        return {"id": o.id, "name": o.name, "latitude": o.latitude,
                "longitude": o.longitude, "radius_m": o.radius_m}

    def _add_office(self, actor_id: UUID | None, data: dict) -> OfficeLocation:
        name = (data.get("name") or "").strip()
        if not name:
            raise ValueError("Office name is required.")
        radius = int(data.get("radius_m") or DEFAULT_RADIUS_M)
        _validate_point(data["latitude"], data["longitude"], radius)
        office = OfficeLocation(company_id=self.company_id, name=name,
                                latitude=data["latitude"], longitude=data["longitude"],
                                radius_m=radius)
        self.db.add(office)
        self.db.flush()
        log_action(self.db, self.company_id, actor_id, "office_location_added",
                   "office_location", office.id,
                   {"name": name, "radius_m": radius})
        return office

    def create_office(self, actor_id: UUID | None, data: dict) -> dict:
        office = self._add_office(actor_id, data)
        self.db.commit()
        return self._office_dict(office)

    def update_office(self, actor_id: UUID | None, office_id: UUID, data: dict) -> dict:
        office = self._get_office(office_id)
        name = data.get("name", office.name)
        lat = data.get("latitude", office.latitude)
        lng = data.get("longitude", office.longitude)
        radius = data.get("radius_m", office.radius_m)
        if not (name or "").strip():
            raise ValueError("Office name is required.")
        _validate_point(lat, lng, radius)
        office.name, office.latitude, office.longitude, office.radius_m = name.strip(), lat, lng, radius
        log_action(self.db, self.company_id, actor_id, "office_location_updated",
                   "office_location", office.id, {"name": office.name, "radius_m": radius})
        self.db.commit()
        return self._office_dict(office)

    def delete_office(self, actor_id: UUID | None, office_id: UUID) -> None:
        office = self._get_office(office_id)
        company = self._company()
        if company.geofence_enabled and len(self._active_offices()) <= 1:
            raise ValueError("Cannot remove the last office while geofencing is enabled.")
        office.is_active = False
        log_action(self.db, self.company_id, actor_id, "office_location_removed",
                   "office_location", office.id, {"name": office.name})
        self.db.commit()

    def _get_office(self, office_id: UUID) -> OfficeLocation:
        office = (self.db.query(OfficeLocation)
                  .filter(OfficeLocation.id == office_id,
                          OfficeLocation.company_id == self.company_id,
                          OfficeLocation.is_active.is_(True)).first())
        if not office:
            raise ValueError("Office location not found.")
        return office

    # ── employee location requests ────────────────────────────────────
    @staticmethod
    def _request_dict(r: EmployeeLocationRequest) -> dict:
        return {
            "id": r.id, "employee_id": r.employee_id,
            "employee_name": r.employee.full_name if r.employee else None,
            "name": r.name, "latitude": r.latitude, "longitude": r.longitude,
            "radius_m": r.radius_m, "status": r.status, "review_note": r.review_note,
            "reviewed_at": r.reviewed_at, "created_at": r.created_at,
        }

    def list_employee_requests(self, employee_id: UUID | None = None,
                               status: str | None = None) -> list[dict]:
        q = self.db.query(EmployeeLocationRequest).filter(
            EmployeeLocationRequest.company_id == self.company_id)
        if employee_id:
            q = q.filter(EmployeeLocationRequest.employee_id == employee_id,
                         EmployeeLocationRequest.status != "revoked")
        if status:
            q = q.filter(EmployeeLocationRequest.status == status)
        return [self._request_dict(r) for r in q.order_by(EmployeeLocationRequest.created_at.desc()).all()]

    def create_request(self, employee_id: UUID, name: str, lat: float, lng: float,
                       radius_m: int | None) -> dict:
        radius = int(radius_m or DEFAULT_RADIUS_M)
        _validate_point(lat, lng, radius)
        if not name.strip():
            raise ValueError("Location name is required.")
        active = (self.db.query(EmployeeLocationRequest)
                  .filter(EmployeeLocationRequest.company_id == self.company_id,
                          EmployeeLocationRequest.employee_id == employee_id,
                          EmployeeLocationRequest.status.in_(["pending", "approved"])).count())
        if active >= MAX_EMPLOYEE_LOCATIONS:
            raise ValueError(
                f"You can have at most {MAX_EMPLOYEE_LOCATIONS} locations (approved or pending). "
                "Remove one before requesting another.")
        req = EmployeeLocationRequest(company_id=self.company_id, employee_id=employee_id,
                                      name=name.strip(), latitude=lat, longitude=lng,
                                      radius_m=radius)
        self.db.add(req)
        self.db.flush()
        emp = self.db.query(Employee).filter(Employee.id == employee_id).first()
        for admin_id in self._reviewer_ids():
            _notify(self.db, self.company_id, admin_id, employee_id, "geofence_location_request",
                    "New clock-in location request",
                    f"{emp.full_name if emp else 'An employee'} requested location '{req.name}'.",
                    "employee_location_request", req.id, "/settings")
        self.db.commit()
        self.db.refresh(req)
        return self._request_dict(req)

    def withdraw_request(self, employee_id: UUID, request_id: UUID) -> None:
        """Employee removes their own pending/approved location. Approved ones
        are marked revoked (kept for history) so past clock-ins stay explainable."""
        req = self._get_request(request_id)
        if req.employee_id != employee_id:
            raise ValueError("Location request not found.")
        if req.status not in ("pending", "approved"):
            raise ValueError("This request can no longer be removed.")
        req.status = "revoked"
        self.db.commit()

    def review_request(self, reviewer_id: UUID | None, request_id: UUID, approve: bool,
                       radius_m: int | None, note: str | None) -> dict:
        req = self._get_request(request_id)
        if req.status != "pending":
            raise ValueError("This request has already been reviewed.")
        if approve:
            radius = int(radius_m or req.radius_m or DEFAULT_RADIUS_M)
            _validate_point(req.latitude, req.longitude, radius)
            req.radius_m = radius
        req.status = "approved" if approve else "rejected"
        req.reviewed_by_employee_id = reviewer_id
        req.reviewed_at = datetime.now(timezone.utc)
        req.review_note = (note or None)
        log_action(self.db, self.company_id, reviewer_id,
                   "location_request_approved" if approve else "location_request_rejected",
                   "employee_location_request", req.id,
                   {"employee_id": str(req.employee_id), "name": req.name, "radius_m": req.radius_m})
        _notify(self.db, self.company_id, req.employee_id, reviewer_id,
                "geofence_location_reviewed",
                f"Location request {'approved' if approve else 'rejected'}",
                f"Your location '{req.name}' was {'approved' if approve else 'rejected'}."
                + (f" Note: {note}" if note else ""),
                "employee_location_request", req.id, "/attendance")
        self.db.commit()
        self.db.refresh(req)
        return self._request_dict(req)

    def _get_request(self, request_id: UUID) -> EmployeeLocationRequest:
        req = (self.db.query(EmployeeLocationRequest)
               .filter(EmployeeLocationRequest.id == request_id,
                       EmployeeLocationRequest.company_id == self.company_id).first())
        if not req:
            raise ValueError("Location request not found.")
        return req

    def _reviewer_ids(self) -> list[UUID]:
        """Employees holding the Admin or HR Manager role."""
        from app.models.role import Role
        from app.models.user_account import UserAccount
        users = (self.db.query(UserAccount)
                 .filter(UserAccount.company_id == self.company_id).all())
        ids = []
        for u in users:
            if u.employee_id and any(r.name in ("Admin", "HR Manager") for r in u.all_roles):
                ids.append(u.employee_id)
        return list(dict.fromkeys(ids))

    # ── clock-in evaluation ───────────────────────────────────────────
    def _allowed_locations(self, employee_id: UUID) -> list[tuple[str, float, float, int]]:
        locs = [(o.name, o.latitude, o.longitude, o.radius_m) for o in self._active_offices()]
        approved = (self.db.query(EmployeeLocationRequest)
                    .filter(EmployeeLocationRequest.company_id == self.company_id,
                            EmployeeLocationRequest.employee_id == employee_id,
                            EmployeeLocationRequest.status == "approved").all())
        locs += [(r.name, r.latitude, r.longitude, r.radius_m) for r in approved]
        return locs

    def evaluate_clock_in(self, employee_id: UUID, source: str, latitude: float | None,
                          longitude: float | None, accuracy_m: float | None) -> dict | None:
        """Returns None when geofencing doesn't apply; otherwise a dict of
        attendance-record fields. Raises ValueError to block the clock-in."""
        company = self._company()
        if not company or not company.geofence_enabled or source not in GEOFENCED_SOURCES:
            return None
        block = company.geofence_mode == "block"

        if latitude is None or longitude is None:
            if block:
                raise ValueError(
                    "Location is required to clock in. Please allow location access in your browser and try again.")
            return {"geofence_status": "unavailable", "geofence_review_status": "pending"}

        fields = {"latitude": latitude, "longitude": longitude, "accuracy_m": accuracy_m,
                  "location": f"{latitude:.6f},{longitude:.6f}"}

        if accuracy_m is not None and accuracy_m > MAX_ACCURACY_M:
            if block:
                raise ValueError(
                    f"Your location signal is too weak (accuracy ~{int(accuracy_m)} m). "
                    "Move to an open area or turn on GPS, then try again.")
            fields.update(geofence_status="unavailable", geofence_review_status="pending")
            return fields

        best = None  # (distance_to_edge, name, distance, radius)
        for name, lat, lng, radius in self._allowed_locations(employee_id):
            d = haversine_m(latitude, longitude, lat, lng)
            if best is None or d - radius < best[0]:
                best = (d - radius, name, d, radius)

        if best and best[0] <= 0:
            fields.update(geofence_status="inside", geofence_location_name=best[1],
                          distance_m=round(best[2], 1))
            return fields

        if best:
            fields.update(geofence_location_name=best[1], distance_m=round(best[2], 1))
        if block:
            if best:
                raise ValueError(
                    f"You are {int(best[2])} m from '{best[1]}' (allowed radius {best[3]} m). "
                    "Clock-in is only allowed within an approved location.")
            raise ValueError("No approved clock-in location found for you. Contact your admin.")
        fields.update(geofence_status="outside", geofence_review_status="pending")
        return fields

    # ── flagged attendance review ─────────────────────────────────────
    def list_flagged(self, status: str | None = "pending", limit: int = 200) -> list[dict]:
        q = (self.db.query(AttendanceRecord)
             .filter(AttendanceRecord.company_id == self.company_id,
                     AttendanceRecord.geofence_review_status.isnot(None)))
        if status:
            q = q.filter(AttendanceRecord.geofence_review_status == status)
        out = []
        for r in q.order_by(AttendanceRecord.clock_in.desc()).limit(limit).all():
            out.append({
                "id": r.id, "employee_id": r.employee_id,
                "employee_name": r.employee.full_name if r.employee else None,
                "clock_in": r.clock_in, "clock_out": r.clock_out,
                "latitude": r.latitude, "longitude": r.longitude,
                "accuracy_m": r.accuracy_m, "distance_m": r.distance_m,
                "geofence_status": r.geofence_status,
                "geofence_location_name": r.geofence_location_name,
                "review_status": r.geofence_review_status,
                "review_note": r.geofence_review_note,
                "reviewed_at": r.geofence_reviewed_at,
            })
        return out

    def review_flagged(self, reviewer_id: UUID | None, record_id: UUID, approve: bool,
                       note: str | None) -> dict:
        rec = (self.db.query(AttendanceRecord)
               .filter(AttendanceRecord.id == record_id,
                       AttendanceRecord.company_id == self.company_id).first())
        if not rec or rec.geofence_review_status is None:
            raise ValueError("Flagged attendance record not found.")
        if rec.geofence_review_status != "pending":
            raise ValueError("This record has already been reviewed.")
        rec.geofence_review_status = "approved" if approve else "rejected"
        rec.geofence_reviewed_by = reviewer_id
        rec.geofence_reviewed_at = datetime.now(timezone.utc)
        rec.geofence_review_note = note or None
        log_action(self.db, self.company_id, reviewer_id,
                   "flagged_attendance_approved" if approve else "flagged_attendance_rejected",
                   "attendance_record", rec.id,
                   {"employee_id": str(rec.employee_id), "distance_m": rec.distance_m})
        msg = ("Your out-of-range clock-in was approved." if approve else
               "Your out-of-range clock-in was rejected and will not be counted. "
               "You can submit an attendance regularization request.")
        if note:
            msg += f" Note: {note}"
        _notify(self.db, self.company_id, rec.employee_id, reviewer_id,
                "geofence_attendance_reviewed",
                f"Flagged clock-in {'approved' if approve else 'rejected'}", msg,
                "attendance_record", rec.id, "/attendance")
        self.db.commit()
        return {"id": rec.id, "review_status": rec.geofence_review_status}

    def notify_flagged(self, employee_id: UUID, record: AttendanceRecord) -> None:
        emp = self.db.query(Employee).filter(Employee.id == employee_id).first()
        for admin_id in self._reviewer_ids():
            _notify(self.db, self.company_id, admin_id, employee_id, "geofence_flagged_attendance",
                    "Clock-in flagged for review",
                    f"{emp.full_name if emp else 'An employee'} clocked in outside an approved location.",
                    "attendance_record", record.id, "/settings")
