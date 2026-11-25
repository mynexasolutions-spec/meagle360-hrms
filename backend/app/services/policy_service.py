"""Company policies: admin editing and publishing, employee reading and agreeing."""

import uuid
from uuid import UUID

from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.employee import Employee
from app.models.policy import CompanyPolicy, CompanyPolicyAck, CompanyPolicyFile, CompanyPolicyVersion
from app.services.audit_service import log_action
from app.services.policy_templates import BY_KEY, TEMPLATES


class PolicyConflict(Exception):
    """The request no longer matches the policy's current state."""


class PolicyService:
    def __init__(self, db: Session, company_id: UUID):
        self.db = db
        self.company_id = company_id

    # ── Employee ─────────────────────────────────────────

    def list_published(self, employee_id: UUID | None) -> list[dict]:
        self.ensure_defaults()
        rows = (
            self.db.query(CompanyPolicy, CompanyPolicyVersion)
            .join(CompanyPolicyVersion, (CompanyPolicyVersion.policy_id == CompanyPolicy.id)
                  & (CompanyPolicyVersion.version == CompanyPolicy.published_version))
            .filter(CompanyPolicy.company_id == self.company_id, CompanyPolicy.status == "published")
            .order_by(CompanyPolicy.display_order, CompanyPolicy.title)
            .all()
        )
        acks = self._latest_acks([p.id for p, _ in rows], employee_id)
        out = []
        for p, v in rows:
            ack = acks.get(p.id)
            current = ack is not None and ack.version >= p.ack_version
            out.append({
                "id": p.id, "title": v.title, "body": v.body, "version": v.version,
                "published_at": v.published_at, "has_attachment": v.attachment_id is not None,
                "requires_ack": p.requires_ack,
                "acknowledged_at": ack.acknowledged_at if current else None,
                "acknowledged_version": ack.version if current else None,
                "pending": bool(employee_id) and p.requires_ack and not current,
            })
        return out

    def pending_count(self, employee_id: UUID | None) -> int:
        if not employee_id:
            return 0
        self.ensure_defaults()
        policies = self.db.query(
            CompanyPolicy.id, CompanyPolicy.ack_version,
        ).filter(
            CompanyPolicy.company_id == self.company_id,
            CompanyPolicy.status == "published", CompanyPolicy.requires_ack.is_(True),
        ).all()
        acks = self._latest_acks([p.id for p in policies], employee_id)
        return sum(1 for p in policies if p.id not in acks or acks[p.id].version < p.ack_version)

    def acknowledge(self, policy_id: UUID, employee_id: UUID, version: int) -> None:
        # Locked so a publish cannot slip in between the check and the record.
        p = self._get(policy_id, lock=True)
        if p.status != "published" or not p.requires_ack or version != p.published_version:
            raise PolicyConflict("This policy has changed. Please reload and read it again.")
        exists = self.db.query(CompanyPolicyAck.id).filter_by(
            policy_id=p.id, employee_id=employee_id, version=version).first()
        if not exists:
            self.db.add(CompanyPolicyAck(policy_id=p.id, employee_id=employee_id, version=version))
        self.db.commit()

    def attachment(self, policy_id: UUID, working_copy: bool) -> CompanyPolicyFile:
        p = self._get(policy_id)
        file_id = None
        if working_copy:
            file_id = p.attachment_id
        elif p.status == "published":
            file_id = self._version(p).attachment_id
        f = self.db.query(CompanyPolicyFile).filter_by(id=file_id, policy_id=p.id).first() if file_id else None
        if not f:
            raise LookupError("File not found")
        return f

    # ── Admin ────────────────────────────────────────────

    def ensure_defaults(self) -> None:
        """Publish any starter policy the company has never had. A deleted one
        keeps its row, so it does not come back."""
        have = {k for (k,) in self.db.query(CompanyPolicy.template_key).filter(
            CompanyPolicy.company_id == self.company_id, CompanyPolicy.template_key.isnot(None))}
        missing = [(i, t) for i, t in enumerate(TEMPLATES) if t["key"] not in have]
        if not missing:
            return
        try:
            for i, t in missing:
                p = CompanyPolicy(
                    id=uuid.uuid4(), company_id=self.company_id, template_key=t["key"], title=t["title"],
                    body=t["body"], requires_ack=t["requires_ack"], display_order=i,
                    status="published", published_version=1, ack_version=1)
                self.db.add(p)
                self.db.flush()
                self.db.add(CompanyPolicyVersion(policy_id=p.id, version=1, title=p.title, body=p.body))
            self.db.commit()
        except IntegrityError:
            self.db.rollback()  # another request added them at the same moment

    def manage_list(self) -> list[dict]:
        self.ensure_defaults()
        policies = self.db.query(CompanyPolicy).filter(
            CompanyPolicy.company_id == self.company_id, CompanyPolicy.status != "deleted",
        ).order_by(CompanyPolicy.display_order, CompanyPolicy.title).all()
        total = self.db.query(Employee.id).filter(
            Employee.company_id == self.company_id, Employee.employment_status == "active").count()
        agreed = self._agreed_counts()
        return [self._manage_out(p, total, agreed.get(p.id, 0)) for p in policies]

    def create(self, data: dict, actor: UUID | None) -> dict:
        last = self.db.query(func.max(CompanyPolicy.display_order)).filter(
            CompanyPolicy.company_id == self.company_id).scalar()
        p = CompanyPolicy(
            id=uuid.uuid4(), company_id=self.company_id, status="draft", published_version=0,
            ack_version=0, display_order=0 if last is None else last + 1, **data)
        self.db.add(p)
        self._log(actor, "policy.created", p)
        self.db.commit()
        return self._manage_out(p)

    def update(self, policy_id: UUID, data: dict, actor: UUID | None) -> dict:
        p = self._get(policy_id, lock=True)
        for key, value in data.items():
            setattr(p, key, value)
        self._log(actor, "policy.updated", p)
        self.db.commit()
        return self._manage_out(p)

    def reset(self, policy_id: UUID, actor: UUID | None) -> dict:
        """Put the starter text back in the working copy. Nothing is published."""
        p = self._get(policy_id, lock=True)
        template = BY_KEY.get(p.template_key)
        if not template:
            raise ValueError("This policy has no default text")
        p.title, p.body, p.attachment_id = template["title"], template["body"], None
        self._log(actor, "policy.reset", p)
        self.db.commit()
        return self._manage_out(p)

    def publish(self, policy_id: UUID, ask_again: bool, actor: UUID | None) -> dict:
        p = self._get(policy_id, lock=True)
        if not p.body.strip() and not p.attachment_id:
            raise ValueError("Add some text or a PDF before publishing")
        if p.status == "published" and not self._changed(p):
            raise ValueError("There are no changes to publish")
        p.published_version += 1
        if ask_again or p.published_version == 1:
            p.ack_version = p.published_version
        p.status = "published"
        self.db.add(CompanyPolicyVersion(
            policy_id=p.id, version=p.published_version, title=p.title, body=p.body,
            attachment_id=p.attachment_id, published_by_employee_id=actor))
        self._log(actor, "policy.published", p)
        self.db.commit()
        return self._manage_out(p)

    def set_hidden(self, policy_id: UUID, hidden: bool, actor: UUID | None) -> dict:
        p = self._get(policy_id, lock=True)
        if hidden:
            p.status = "hidden"
        else:
            p.status = "published" if p.published_version else "draft"
        self._log(actor, "policy.hidden" if hidden else "policy.shown", p)
        self.db.commit()
        return self._manage_out(p)

    def delete(self, policy_id: UUID, actor: UUID | None) -> None:
        """Gone for everyone, but the row stays: it keeps who agreed to what."""
        p = self._get(policy_id, lock=True)
        p.status = "deleted"
        self._log(actor, "policy.deleted", p)
        self.db.commit()

    def reorder(self, ids: list[UUID]) -> None:
        policies = {p.id: p for p in self.db.query(CompanyPolicy).filter(
            CompanyPolicy.company_id == self.company_id, CompanyPolicy.status != "deleted")}
        if len(ids) != len(policies) or set(ids) != set(policies):
            raise PolicyConflict("The list has changed. Please reload.")
        for i, policy_id in enumerate(ids):
            policies[policy_id].display_order = i
        self.db.commit()

    def attach(self, policy_id: UUID, filename: str, content: bytes, actor: UUID | None) -> dict:
        p = self._get(policy_id, lock=True)
        f = CompanyPolicyFile(id=uuid.uuid4(), policy_id=p.id, filename=filename, content=content)
        self.db.add(f)
        return self._set_attachment(p, f.id, actor)

    def detach(self, policy_id: UUID, actor: UUID | None) -> dict:
        return self._set_attachment(self._get(policy_id, lock=True), None, actor)

    def versions(self, policy_id: UUID) -> list[dict]:
        p = self._get(policy_id)
        rows = self.db.query(CompanyPolicyVersion, Employee.full_name).outerjoin(
            Employee, Employee.id == CompanyPolicyVersion.published_by_employee_id,
        ).filter(CompanyPolicyVersion.policy_id == p.id).order_by(CompanyPolicyVersion.version.desc()).all()
        return [{"version": v.version, "title": v.title, "body": v.body,
                 "published_at": v.published_at, "published_by": name} for v, name in rows]

    def report(self, policy_id: UUID) -> list[dict]:
        """Every active employee, and the latest version they agreed to."""
        p = self._get(policy_id)
        latest = {}
        for ack in self.db.query(CompanyPolicyAck).filter_by(policy_id=p.id).order_by(CompanyPolicyAck.version):
            latest[ack.employee_id] = ack
        people = self.db.query(Employee).filter(
            Employee.company_id == self.company_id, Employee.employment_status == "active",
        ).order_by(Employee.full_name).all()
        out = []
        for e in people:
            ack = latest.get(e.id)
            out.append({
                "employee_id": e.id, "employee_name": e.full_name, "employee_code": e.employee_code,
                "version": ack.version if ack else None,
                "acknowledged_at": ack.acknowledged_at if ack else None,
                "agreed": ack is not None and ack.version >= p.ack_version,
            })
        return out

    # ── Helpers ──────────────────────────────────────────

    def _get(self, policy_id: UUID, lock: bool = False) -> CompanyPolicy:
        q = self.db.query(CompanyPolicy).filter(
            CompanyPolicy.id == policy_id, CompanyPolicy.company_id == self.company_id,
            CompanyPolicy.status != "deleted")
        if lock:
            q = q.populate_existing().with_for_update()
        p = q.first()
        if not p:
            raise LookupError("Policy not found")
        return p

    def _set_attachment(self, p: CompanyPolicy, file_id: UUID | None, actor: UUID | None) -> dict:
        p.attachment_id = file_id
        self._log(actor, "policy.updated", p)
        self.db.commit()
        return self._manage_out(p)

    def _version(self, p: CompanyPolicy) -> CompanyPolicyVersion | None:
        return self.db.query(CompanyPolicyVersion).filter_by(
            policy_id=p.id, version=p.published_version).first()

    def _changed(self, p: CompanyPolicy) -> bool:
        v = self._version(p)
        return v is None or (v.title, v.body, v.attachment_id) != (p.title, p.body, p.attachment_id)

    def _latest_acks(self, policy_ids: list[UUID], employee_id: UUID | None) -> dict:
        if not policy_ids or not employee_id:
            return {}
        rows = self.db.query(CompanyPolicyAck).filter(
            CompanyPolicyAck.policy_id.in_(policy_ids), CompanyPolicyAck.employee_id == employee_id,
        ).order_by(CompanyPolicyAck.version).all()
        return {a.policy_id: a for a in rows}

    def _agreed_counts(self) -> dict:
        rows = self.db.query(
            CompanyPolicyAck.policy_id, func.count(func.distinct(CompanyPolicyAck.employee_id)),
        ).join(CompanyPolicy, CompanyPolicy.id == CompanyPolicyAck.policy_id).join(
            Employee, Employee.id == CompanyPolicyAck.employee_id,
        ).filter(
            CompanyPolicy.company_id == self.company_id,
            Employee.employment_status == "active",
            CompanyPolicyAck.version >= CompanyPolicy.ack_version,
        ).group_by(CompanyPolicyAck.policy_id).all()
        return {policy_id: count for policy_id, count in rows}

    def _manage_out(self, p: CompanyPolicy, total: int | None = None, agreed: int | None = None) -> dict:
        filename = None
        if p.attachment_id:
            filename = self.db.query(CompanyPolicyFile.filename).filter_by(id=p.attachment_id).scalar()
        return {
            "id": p.id, "title": p.title, "body": p.body, "attachment_name": filename,
            "requires_ack": p.requires_ack, "status": p.status,
            "published_version": p.published_version,
            "has_changes": bool(p.published_version) and self._changed(p),
            "is_default": p.template_key is not None,
            "agreed_count": agreed, "employee_count": total,
        }

    def _log(self, actor: UUID | None, action: str, p: CompanyPolicy) -> None:
        log_action(self.db, self.company_id, actor, action, "company_policy", p.id,
                   {"title": p.title, "version": p.published_version})
