"""
ATS Service — Business logic for Job Openings, Applications, and Public Careers page.
"""

from datetime import date, datetime, timezone
from decimal import Decimal
from uuid import UUID
import uuid
import os
import secrets
import logging
from fastapi import HTTPException, UploadFile, status

logger = logging.getLogger(__name__)
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.ats import (
    Application,
    ApplicationActivity,
    Candidate,
    JobOpening,
    Stage,
    Interview,
    InterviewPanel,
    InterviewFeedback,
    InterviewRoundTemplate,
    RejectionReason,
    Offer,
    CareersPageSettings,
)
from app.models.company import Company
from app.models.department import Department
from app.models.designation import Designation
from app.models.employee import Employee
from app.models.user_account import UserAccount
from app.models.role import Role
from app.models.user_account_role import UserAccountRole
from app.models.leave_type import LeaveType
from app.models.leave_balance import LeaveBalance
from app.models.employee_document import EmployeeDocument
from app.schemas.ats import JobOpeningCreate, JobOpeningUpdate
from app.services.ats_file_service import (
    compress_pdf_bytes,
    upload_resume_to_imagekit,
    validate_pdf_content,
)
from app.services.auth_service import hash_password, create_invite_token
from app.services.email_service import try_send_invite_email
from app.services.audit_service import log_action


class AtsService:
    @staticmethod
    def get_job_openings(
        db: Session,
        company_id: UUID,
        status_filter: str | None = None,
        search: str | None = None,
    ) -> list[dict]:
        """Fetch all job openings for the tenant with applicants count."""
        query = (
            db.query(
                JobOpening,
                func.count(Application.id).label("applicants_count"),
            )
            .outerjoin(Application, Application.job_id == JobOpening.id)
            .filter(JobOpening.company_id == company_id)
            .group_by(JobOpening.id)
            .order_by(JobOpening.created_at.desc())
        )

        if status_filter:
            query = query.filter(JobOpening.status == status_filter)

        if search:
            query = query.filter(JobOpening.title.ilike(f"%{search}%"))

        results = query.all()
        out = []
        for job, app_count in results:
            item = {
                "id": job.id,
                "company_id": job.company_id,
                "title": job.title,
                "department_id": job.department_id,
                "department_name": job.department_name,
                "designation_id": job.designation_id,
                "designation_name": job.designation_name,
                "number_of_openings": job.number_of_openings,
                "description": job.description,
                "responsibilities": job.responsibilities,
                "requirements": job.requirements,
                "location": job.location,
                "job_type": job.job_type,
                "status": job.status,
                "experience_range": job.experience_range,
                "created_at": job.created_at,
                "updated_at": job.updated_at,
                "applicants_count": app_count,
            }
            out.append(item)
        return out

    @staticmethod
    def get_job_opening_by_id(db: Session, company_id: UUID, job_id: UUID) -> JobOpening:
        job = (
            db.query(JobOpening)
            .filter(JobOpening.company_id == company_id, JobOpening.id == job_id)
            .first()
        )
        if not job:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Job opening not found.",
            )
        return job

    @staticmethod
    def create_job_opening(
        db: Session,
        company_id: UUID,
        data: JobOpeningCreate,
        user_id: UUID | None,
    ) -> JobOpening:
        # Snapshot department name if department_id supplied
        dept_name = data.department_name
        if data.department_id and not dept_name:
            dept = db.query(Department).filter(Department.id == data.department_id).first()
            if dept:
                dept_name = dept.name

        desig_name = data.designation_name
        if data.designation_id and not desig_name:
            desig = db.query(Designation).filter(Designation.id == data.designation_id).first()
            if desig:
                desig_name = desig.title

        job = JobOpening(
            id=uuid.uuid4(),
            company_id=company_id,
            title=data.title,
            department_id=data.department_id,
            department_name=dept_name,
            designation_id=data.designation_id,
            designation_name=desig_name,
            number_of_openings=data.number_of_openings,
            description=data.description,
            responsibilities=data.responsibilities,
            requirements=data.requirements,
            location=data.location,
            job_type=data.job_type,
            status=data.status or "Open",
            experience_range=data.experience_range,
            created_by_id=user_id,
        )
        db.add(job)
        db.commit()
        db.refresh(job)
        return job

    @staticmethod
    def update_job_opening(
        db: Session,
        company_id: UUID,
        job_id: UUID,
        data: JobOpeningUpdate,
    ) -> JobOpening:
        job = AtsService.get_job_opening_by_id(db, company_id, job_id)
        update_data = data.model_dump(exclude_unset=True)

        if "department_id" in update_data and update_data["department_id"] and not update_data.get("department_name"):
            dept = db.query(Department).filter(Department.id == update_data["department_id"]).first()
            if dept:
                update_data["department_name"] = dept.name

        if "designation_id" in update_data and update_data["designation_id"] and not update_data.get("designation_name"):
            desig = db.query(Designation).filter(Designation.id == update_data["designation_id"]).first()
            if desig:
                update_data["designation_name"] = desig.title

        for key, val in update_data.items():
            setattr(job, key, val)

        db.commit()
        db.refresh(job)
        return job

    @staticmethod
    def delete_job_opening(db: Session, company_id: UUID, job_id: UUID) -> None:
        job = AtsService.get_job_opening_by_id(db, company_id, job_id)
        db.delete(job)
        db.commit()

    # ── Public Careers Page Logic ─────────────────────────────

    @staticmethod
    def get_public_careers(db: Session, company: Company) -> dict:
        """Returns tenant branding, open jobs list, and available filter options."""
        open_jobs = (
            db.query(JobOpening)
            .filter(JobOpening.company_id == company.id, JobOpening.status == "Open")
            .order_by(JobOpening.created_at.desc())
            .all()
        )

        departments = sorted(list({j.department_name for j in open_jobs if j.department_name}))
        locations = sorted(list({j.location for j in open_jobs if j.location}))
        job_types = sorted(list({j.job_type for j in open_jobs if j.job_type}))

        # Load tenant custom careers settings if configured
        settings = (
            db.query(CareersPageSettings)
            .filter(CareersPageSettings.company_id == company.id)
            .first()
        )

        brand_name = (settings.brand_name if settings and settings.brand_name else None) or company.name
        logo_url = (settings.logo_url if settings and settings.logo_url else None) or company.logo_url

        branding = {
            "id": str(company.id),
            "name": brand_name,
            "subdomain": company.subdomain,
            "logo_url": logo_url,
            "website": company.website,
            "tagline": (settings.title_prefix + " " + settings.title_highlight) if settings else "Join our team",
            "open_jobs_count": len(open_jobs),
            "settings": {
                "badge_text": settings.badge_text if settings else "CAREERS",
                "title_prefix": settings.title_prefix if settings else "Join our",
                "title_highlight": settings.title_highlight if settings else "team",
                "subtitle": settings.subtitle if settings else f"Build amazing products, work with great people, and grow your career with {brand_name}.",
                "hero_image_url": settings.hero_image_url if settings else "https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=900&q=80",
                "hero_card_badge": settings.hero_card_badge if settings else "Better Together",
                "hero_card_quote": settings.hero_card_quote if settings else "Better Code.\nBigger Dreams.",
                "primary_color": settings.primary_color if settings else "#1d68f5",
            },
        }

        jobs_list = [
            {
                "id": str(j.id),
                "title": j.title,
                "department_name": j.department_name,
                "designation_name": j.designation_name,
                "number_of_openings": j.number_of_openings,
                "description": j.description,
                "responsibilities": j.responsibilities,
                "requirements": j.requirements,
                "location": j.location,
                "job_type": j.job_type,
                "experience_range": j.experience_range,
                "created_at": j.created_at.isoformat() if j.created_at else None,
            }
            for j in open_jobs
        ]

        return {
            "company": branding,
            "jobs": jobs_list,
            "filters": {
                "departments": departments,
                "locations": locations,
                "job_types": job_types,
            },
        }

    @staticmethod
    async def process_public_application(
        db: Session,
        company: Company,
        job_id: UUID,
        full_name: str,
        email: str,
        phone: str | None,
        current_location: str | None,
        years_of_experience: float | None,
        cover_note: str | None,
        honeypot: str | None,
        resume_file: UploadFile,
    ) -> Application:
        """
        Processes candidate application with strict validation:
        1. Honeypot check (anti-spam).
        2. Job status check (must be Open).
        3. Resume PDF validation & in-memory compression.
        4. Duplicate check ((candidate_id, job_id) uniqueness).
        5. Private upload to ImageKit.
        6. Append-only activity log within same transaction.
        """
        # 1. Anti-spam honeypot
        if honeypot and honeypot.strip():
            # Bot filled hidden field — silently reject or raise error
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Spam detected.",
            )

        # 2. Check Job status
        job = (
            db.query(JobOpening)
            .filter(JobOpening.id == job_id, JobOpening.company_id == company.id)
            .first()
        )
        if not job or job.status != "Open":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="This job opening is no longer open for new applications.",
            )

        # 3. Read and validate PDF
        file_bytes = await resume_file.read()
        is_valid, err_msg = validate_pdf_content(file_bytes)
        if not is_valid:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=err_msg,
            )

        # 4. Duplicate application check
        norm_email = email.strip().lower()
        candidate = (
            db.query(Candidate)
            .filter(Candidate.company_id == company.id, Candidate.email == norm_email)
            .first()
        )

        if candidate:
            existing_app = (
                db.query(Application)
                .filter(Application.candidate_id == candidate.id, Application.job_id == job.id)
                .first()
            )
            if existing_app:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="You have already submitted an application for this position.",
                )

        # 5. Compress PDF in-memory
        compressed_bytes = compress_pdf_bytes(file_bytes)

        # 6. Upload to ImageKit (private file)
        upload_res = await upload_resume_to_imagekit(
            file_bytes=compressed_bytes,
            original_filename=resume_file.filename,
            tenant_id=company.id,
        )

        # 7. Find or create candidate
        if not candidate:
            candidate = Candidate(
                id=uuid.uuid4(),
                company_id=company.id,
                email=norm_email,
                full_name=full_name.strip(),
                phone=phone.strip() if phone else None,
                current_location=current_location.strip() if current_location else None,
                years_of_experience=Decimal(str(years_of_experience)) if years_of_experience is not None else None,
            )
            db.add(candidate)
            db.flush()
        else:
            # Update basic contact info if provided
            if phone:
                candidate.phone = phone.strip()
            if current_location:
                candidate.current_location = current_location.strip()
            if years_of_experience is not None:
                candidate.years_of_experience = Decimal(str(years_of_experience))

        # 8. Resolve initial stage
        initial_stage = (
            db.query(Stage)
            .filter(Stage.company_id == company.id, Stage.is_initial == True)
            .first()
        )
        if not initial_stage:
            initial_stage = (
                db.query(Stage)
                .filter(Stage.company_id == company.id, Stage.name == "Applied")
                .first()
            )

        if not initial_stage:
            # Fallback create initial stage if tenant was not seeded
            initial_stage = Stage(
                id=uuid.uuid4(),
                company_id=company.id,
                name="Applied",
                code="APPLIED",
                display_order=1,
                is_initial=True,
                is_terminal=False,
                is_active=True,
            )
            db.add(initial_stage)
            db.flush()

        # 9. Create Application
        application = Application(
            id=uuid.uuid4(),
            company_id=company.id,
            candidate_id=candidate.id,
            job_id=job.id,
            stage_id=initial_stage.id,
            resume_file_id=upload_res.get("file_id"),
            resume_path=upload_res.get("file_path"),
            resume_file_name=upload_res.get("file_name"),
            cover_note=cover_note.strip() if cover_note else None,
            source="careers_page",
        )
        db.add(application)
        db.flush()

        # 10. Append-only activity log (in the same transaction)
        activity = ApplicationActivity(
            id=uuid.uuid4(),
            company_id=company.id,
            application_id=application.id,
            actor_id=None,
            actor_type="candidate",
            event_type="applied",
            from_stage_id=None,
            to_stage_id=initial_stage.id,
            metadata_json={
                "stage_name": initial_stage.name,
                "job_title": job.title,
                "candidate_name": candidate.full_name,
                "resume_file": upload_res.get("file_name"),
            },
            created_at=datetime.now(timezone.utc),
        )
        db.add(activity)

        db.commit()
        db.refresh(application)
        return application


    # ── Phase 2: Applicants & Application Detail Logic ─────────

    @staticmethod
    def get_stages_with_counts(db: Session, company_id: UUID) -> list[dict]:
        """Fetch all stages for the tenant with applicant counts."""
        stages = (
            db.query(Stage)
            .filter(Stage.company_id == company_id, Stage.is_active == True)
            .order_by(Stage.display_order.asc())
            .all()
        )
        counts_query = (
            db.query(Application.stage_id, func.count(Application.id))
            .filter(Application.company_id == company_id)
            .group_by(Application.stage_id)
            .all()
        )
        counts_map = {stage_id: count for stage_id, count in counts_query}

        result = []
        for s in stages:
            result.append({
                "id": s.id,
                "name": s.name,
                "code": s.code,
                "display_order": s.display_order,
                "is_initial": s.is_initial,
                "is_terminal": s.is_terminal,
                "terminal_type": s.terminal_type,
                "is_active": s.is_active,
                "applicants_count": counts_map.get(s.id, 0),
            })
        return result

    @staticmethod
    def get_applicants(
        db: Session,
        company_id: UUID,
        stage_id: UUID | None = None,
        job_id: UUID | None = None,
        department_id: UUID | None = None,
        search: str | None = None,
    ) -> list[dict]:
        """Query applicants with candidate, job, stage info and days in stage."""
        query = (
            db.query(Application, Candidate, JobOpening, Stage)
            .join(Candidate, Application.candidate_id == Candidate.id)
            .join(JobOpening, Application.job_id == JobOpening.id)
            .join(Stage, Application.stage_id == Stage.id)
            .filter(Application.company_id == company_id)
            .order_by(Application.updated_at.desc())
        )

        if stage_id:
            query = query.filter(Application.stage_id == stage_id)

        if job_id:
            query = query.filter(Application.job_id == job_id)

        if department_id:
            query = query.filter(JobOpening.department_id == department_id)

        if search:
            s = f"%{search.strip()}%"
            query = query.filter(
                (Candidate.full_name.ilike(s)) |
                (Candidate.email.ilike(s)) |
                (JobOpening.title.ilike(s))
            )

        rows = query.all()
        now = datetime.now(timezone.utc)
        out = []

        for app, cand, job, st in rows:
            ref_date = app.updated_at or app.created_at
            days_in_stage = max(0, (now - ref_date).days)

            out.append({
                "id": app.id,
                "candidate_id": cand.id,
                "candidate_name": cand.full_name,
                "candidate_email": cand.email,
                "candidate_phone": cand.phone,
                "candidate_location": cand.current_location,
                "years_of_experience": float(cand.years_of_experience) if cand.years_of_experience is not None else None,
                "job_id": job.id,
                "job_title": job.title,
                "department_name": job.department_name,
                "stage_id": st.id,
                "stage_name": st.name,
                "is_initial": st.is_initial,
                "is_terminal": st.is_terminal,
                "terminal_type": st.terminal_type,
                "days_in_stage": days_in_stage,
                "has_resume": bool(app.resume_file_id or app.resume_path),
                "resume_file_name": app.resume_file_name,
                "source": app.source,
                "rejection_reason": app.rejection_reason,
                "created_at": app.created_at,
                "updated_at": app.updated_at,
            })
        return out

    @staticmethod
    def get_application_detail(db: Session, company_id: UUID, application_id: UUID) -> dict:
        """Full application detail with candidate info, job info, and activity log."""
        app = (
            db.query(Application)
            .filter(Application.id == application_id, Application.company_id == company_id)
            .first()
        )
        if not app:
            raise HTTPException(status_code=404, detail="Application not found.")

        cand = app.candidate
        job = app.job
        stage = app.stage

        activities = []
        for act in app.activities:
            actor_name = "Candidate" if act.actor_type == "candidate" else "System"
            if act.actor and act.actor.employee:
                actor_name = act.actor.employee.full_name
            elif act.actor:
                actor_name = act.actor.email

            activities.append({
                "id": str(act.id),
                "actor_name": actor_name,
                "actor_type": act.actor_type,
                "event_type": act.event_type,
                "from_stage_name": act.from_stage.name if act.from_stage else None,
                "to_stage_name": act.to_stage.name if act.to_stage else None,
                "metadata": act.metadata_json or {},
                "created_at": act.created_at.isoformat() if act.created_at else None,
            })

        now = datetime.now(timezone.utc)
        ref_date = app.updated_at or app.created_at
        days_in_stage = max(0, (now - ref_date).days)

        offers_data = []
        for o in app.offers:
            mgr_name = None
            if o.reporting_manager:
                mgr_name = o.reporting_manager.full_name
            offers_data.append({
                "id": str(o.id),
                "version_number": o.version_number,
                "designation": o.designation,
                "ctc": float(o.ctc),
                "joining_date": o.joining_date.isoformat() if o.joining_date else None,
                "reporting_manager_id": str(o.reporting_manager_id) if o.reporting_manager_id else None,
                "reporting_manager_name": mgr_name,
                "probation_period_months": o.probation_period_months,
                "validity_date": o.validity_date.isoformat() if o.validity_date else None,
                "status": o.status,
                "offer_letter_template": o.offer_letter_template,
                "declined_reason": o.declined_reason,
                "notes": o.notes,
                "created_at": o.created_at.isoformat() if o.created_at else None,
                "updated_at": o.updated_at.isoformat() if o.updated_at else None,
            })

        return {
            "id": app.id,
            "company_id": app.company_id,
            "candidate": {
                "id": cand.id,
                "full_name": cand.full_name,
                "email": cand.email,
                "phone": cand.phone,
                "current_location": cand.current_location,
                "years_of_experience": float(cand.years_of_experience) if cand.years_of_experience is not None else None,
                "notes": cand.notes,
            },
            "job": {
                "id": job.id,
                "title": job.title,
                "department_name": job.department_name,
                "location": job.location,
                "job_type": job.job_type,
                "status": job.status,
            },
            "stage": {
                "id": stage.id,
                "name": stage.name,
                "is_initial": stage.is_initial,
                "is_terminal": stage.is_terminal,
                "terminal_type": stage.terminal_type,
            },
            "days_in_stage": days_in_stage,
            "cover_note": app.cover_note,
            "source": app.source,
            "resume_file_id": app.resume_file_id,
            "resume_path": app.resume_path,
            "resume_file_name": app.resume_file_name,
            "rejection_reason": app.rejection_reason,
            "rejection_note": app.rejection_note,
            "converted_employee_id": app.converted_employee_id,
            "created_at": app.created_at,
            "updated_at": app.updated_at,
            "activities": activities,
            "offers": offers_data,
        }

    @staticmethod
    def change_stage(
        db: Session,
        company_id: UUID,
        application_id: UUID,
        current_user: UserAccount,
        current_stage_id: UUID,
        target_stage_id: UUID,
        reason: str | None = None,
        note: str | None = None,
    ) -> Application:
        """Unified stage change service with strict business & permission checks."""
        app = (
            db.query(Application)
            .filter(Application.id == application_id, Application.company_id == company_id)
            .first()
        )
        if not app:
            raise HTTPException(status_code=404, detail="Application not found.")

        # 1. Concurrency check
        if app.stage_id != current_stage_id:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Stale state: This application was updated by another team member. Please refresh and review.",
            )

        current_stage = db.query(Stage).filter(Stage.id == current_stage_id).first()
        target_stage = db.query(Stage).filter(Stage.id == target_stage_id).first()

        if not target_stage or target_stage.company_id != company_id:
            raise HTTPException(status_code=400, detail="Invalid target stage.")

        # 2. Permission enforcement
        is_admin = any(r.name == "Admin" for r in current_user.all_roles)
        user_perms = current_user.merged_permissions or {}

        # Moving to Offer / Hired requires ats:offer:manage or Admin
        if target_stage.terminal_type == "hired" or "offer" in target_stage.name.lower():
            if not is_admin and not user_perms.get("ats:offer:manage"):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Recruiters are not permitted to move applications to Offer or Hired stage. Only Admin/HR has permission to manage offers.",
                )

        # Rejecting rule: Recruiter can only reject in Applied or Screening
        is_rejecting = target_stage.terminal_type == "rejected" or "reject" in target_stage.name.lower()
        if is_rejecting:
            if not reason or not reason.strip():
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="A rejection reason is mandatory when rejecting an application.",
                )

            if current_stage and current_stage.name.lower() in ("interview", "offer", "hired"):
                if not is_admin and not user_perms.get("ats:offer:manage"):
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="Recruiters can only reject applications in Applied and Screening stages. Rejecting from Interview stage onward requires Admin.",
                    )

            app.rejection_reason = reason.strip()
            app.rejection_note = note.strip() if note else None

        # 3. Apply stage change
        from_stage_name = current_stage.name if current_stage else "Unknown"
        to_stage_name = target_stage.name
        app.stage_id = target_stage.id
        app.updated_at = datetime.now(timezone.utc)

        # Auto-create first interview round if moving into Interview stage
        if to_stage_name.lower() == "interview":
            existing_iv = (
                db.query(Interview)
                .filter(Interview.application_id == app.id, Interview.company_id == company_id)
                .first()
            )
            if not existing_iv:
                first_round = Interview(
                    id=uuid.uuid4(),
                    company_id=company_id,
                    application_id=app.id,
                    round_name="Round 1 - Technical Interview",
                    round_number=1,
                    interview_type="Virtual",
                    status="Needs interviewer",
                )
                db.add(first_round)

        # 4. Activity log in same transaction
        actor_name = current_user.employee.full_name if current_user.employee else current_user.email
        event_name = "rejected" if is_rejecting else "stage_changed"
        activity = ApplicationActivity(
            id=uuid.uuid4(),
            company_id=company_id,
            application_id=app.id,
            actor_id=current_user.id,
            actor_type="user",
            event_type=event_name,
            from_stage_id=current_stage.id if current_stage else None,
            to_stage_id=target_stage.id,
            metadata_json={
                "from_stage_name": from_stage_name,
                "to_stage_name": to_stage_name,
                "actor_name": actor_name,
                "reason": reason,
                "note": note,
            },
            created_at=datetime.now(timezone.utc),
        )
        db.add(activity)

        db.commit()
        db.refresh(app)
        return app

    @staticmethod
    def add_note(
        db: Session,
        company_id: UUID,
        application_id: UUID,
        current_user: UserAccount,
        note_text: str,
    ) -> ApplicationActivity:
        """Add private recruiter note to application activity timeline."""
        app = (
            db.query(Application)
            .filter(Application.id == application_id, Application.company_id == company_id)
            .first()
        )
        if not app:
            raise HTTPException(status_code=404, detail="Application not found.")

        actor_name = current_user.employee.full_name if current_user.employee else current_user.email
        activity = ApplicationActivity(
            id=uuid.uuid4(),
            company_id=company_id,
            application_id=app.id,
            actor_id=current_user.id,
            actor_type="user",
            event_type="note_added",
            from_stage_id=app.stage_id,
            to_stage_id=app.stage_id,
            metadata_json={
                "actor_name": actor_name,
                "note": note_text.strip(),
            },
            created_at=datetime.now(timezone.utc),
        )
        db.add(activity)
        db.commit()
        db.refresh(activity)
        return activity

    @staticmethod
    def bulk_shortlist(
        db: Session,
        company_id: UUID,
        current_user: UserAccount,
        application_ids: list[UUID],
    ) -> int:
        """Bulk move selected applications from Applied to Screening."""
        screening_stage = (
            db.query(Stage)
            .filter(Stage.company_id == company_id, Stage.name == "Screening")
            .first()
        )
        if not screening_stage:
            raise HTTPException(status_code=400, detail="Screening stage not found.")

        actor_name = current_user.employee.full_name if current_user.employee else current_user.email
        moved_count = 0

        for app_id in application_ids:
            app = (
                db.query(Application)
                .filter(Application.id == app_id, Application.company_id == company_id)
                .first()
            )
            if not app or app.stage_id == screening_stage.id:
                continue

            old_stage_id = app.stage_id
            app.stage_id = screening_stage.id
            app.updated_at = datetime.now(timezone.utc)

            activity = ApplicationActivity(
                id=uuid.uuid4(),
                company_id=company_id,
                application_id=app.id,
                actor_id=current_user.id,
                actor_type="user",
                event_type="stage_changed",
                from_stage_id=old_stage_id,
                to_stage_id=screening_stage.id,
                metadata_json={
                    "actor_name": actor_name,
                    "from_stage_name": "Applied",
                    "to_stage_name": "Screening",
                    "action": "bulk_shortlist",
                },
                created_at=datetime.now(timezone.utc),
            )
            db.add(activity)
            moved_count += 1

        db.commit()
        return moved_count

    @staticmethod
    async def get_resume_blob(
        db: Session,
        company_id: UUID,
        application_id: UUID,
    ) -> tuple[bytes, str]:
        """Fetches the resume PDF file as a blob for in-app preview."""
        app = (
            db.query(Application)
            .filter(Application.id == application_id, Application.company_id == company_id)
            .first()
        )
        if not app or not (app.resume_file_id or app.resume_path):
            raise HTTPException(status_code=404, detail="Resume not found for this application.")

        filename = app.resume_file_name or "resume.pdf"
        file_path = app.resume_path or ""
        clean_path = file_path.lstrip("/")

        # 1. Local disk fallback checks across possible working directories
        candidate_paths = [
            clean_path,
            os.path.join(os.getcwd(), clean_path),
            os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), clean_path),
            os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "backend", clean_path),
        ]
        for cp in candidate_paths:
            if os.path.exists(cp) and os.path.isfile(cp):
                try:
                    with open(cp, "rb") as f:
                        return f.read(), filename
                except Exception as e:
                    logger.warning("Failed to read local resume file %s: %s", cp, e)

        # 2. Remote storage (ImageKit) retrieval
        from app.services.ats_file_service import _get_imagekit_credentials, generate_signed_resume_url
        private_key, public_key, url_endpoint = _get_imagekit_credentials()

        # If file_path is full URL, normalize clean_path
        if file_path.startswith("http://") or file_path.startswith("https://"):
            clean_path = file_path.replace(url_endpoint, "").lstrip("/")

        import httpx
        async with httpx.AsyncClient(timeout=25.0, follow_redirects=True) as client:
            # Attempt A: Signed ImageKit URL (time-based signature)
            try:
                signed_url = generate_signed_resume_url(clean_path, expiry_seconds=600)
                if signed_url.startswith("http"):
                    res = await client.get(signed_url)
                    if res.status_code == 200 and len(res.content) > 0:
                        return res.content, filename
                    logger.warning("ImageKit signed URL returned %s for %s", res.status_code, clean_path)
            except Exception as e:
                logger.warning("ImageKit signed URL fetch error: %s", e)

            # Attempt B: Direct URL with ImageKit Private Key Basic Auth
            if private_key:
                try:
                    direct_url = f"{url_endpoint}/{clean_path}"
                    res = await client.get(direct_url, auth=(private_key, ""))
                    if res.status_code == 200 and len(res.content) > 0:
                        return res.content, filename
                    logger.warning("ImageKit Basic Auth returned %s for %s", res.status_code, direct_url)
                except Exception as e:
                    logger.warning("ImageKit Basic Auth fetch error: %s", e)

            # Attempt C: Direct public URL without signature
            try:
                direct_url = f"{url_endpoint}/{clean_path}"
                res = await client.get(direct_url)
                if res.status_code == 200 and len(res.content) > 0:
                    return res.content, filename
            except Exception as e:
                logger.warning("ImageKit direct URL fetch error: %s", e)

            # Attempt D: File details lookup via ImageKit API if resume_file_id is available
            if app.resume_file_id and not app.resume_file_id.startswith("local_") and private_key:
                try:
                    details_url = f"https://api.imagekit.io/v1/files/{app.resume_file_id}/details"
                    d_res = await client.get(details_url, auth=(private_key, ""))
                    if d_res.status_code == 200:
                        d_json = d_res.json()
                        remote_url = d_json.get("url")
                        if remote_url:
                            f_res = await client.get(remote_url, auth=(private_key, ""))
                            if f_res.status_code == 200 and len(f_res.content) > 0:
                                return f_res.content, filename
                except Exception as e:
                    logger.warning("ImageKit file details lookup error: %s", e)

        raise HTTPException(
            status_code=404,
            detail=f"Unable to retrieve resume file '{filename}' from storage."
        )


    # ── Phase 3: Interviews & ATS Settings Logic ───────────────

    @staticmethod
    def get_round_templates(db: Session, company_id: UUID) -> list[InterviewRoundTemplate]:
        return (
            db.query(InterviewRoundTemplate)
            .filter(InterviewRoundTemplate.company_id == company_id)
            .order_by(InterviewRoundTemplate.display_order.asc())
            .all()
        )

    @staticmethod
    def create_round_template(db: Session, company_id: UUID, name: str, display_order: int) -> InterviewRoundTemplate:
        template = InterviewRoundTemplate(
            id=uuid.uuid4(),
            company_id=company_id,
            name=name.strip(),
            display_order=display_order,
            is_active=True,
        )
        db.add(template)
        db.commit()
        db.refresh(template)
        return template

    @staticmethod
    def toggle_round_template(db: Session, company_id: UUID, template_id: UUID, is_active: bool) -> InterviewRoundTemplate:
        """Deactivate, never delete."""
        template = (
            db.query(InterviewRoundTemplate)
            .filter(InterviewRoundTemplate.id == template_id, InterviewRoundTemplate.company_id == company_id)
            .first()
        )
        if not template:
            raise HTTPException(status_code=404, detail="Round template not found.")
        template.is_active = is_active
        db.commit()
        db.refresh(template)
        return template

    @staticmethod
    def get_rejection_reasons(db: Session, company_id: UUID) -> list[RejectionReason]:
        return (
            db.query(RejectionReason)
            .filter(RejectionReason.company_id == company_id, RejectionReason.is_active == True)
            .order_by(RejectionReason.created_at.asc())
            .all()
        )

    @staticmethod
    def create_rejection_reason(db: Session, company_id: UUID, reason_text: str) -> RejectionReason:
        r = RejectionReason(
            id=uuid.uuid4(),
            company_id=company_id,
            reason=reason_text.strip(),
            is_active=True,
        )
        db.add(r)
        db.commit()
        db.refresh(r)
        return r

    @staticmethod
    def get_eligible_interviewers(db: Session, company_id: UUID) -> list[dict]:
        """Dropdown shows only active employees with the Interviewer role (or Admin)."""
        employees = (
            db.query(Employee)
            .filter(Employee.company_id == company_id, Employee.employment_status == "active")
            .all()
        )

        eligible = []
        for emp in employees:
            user_acc = emp.user_account
            if not user_acc:
                continue
            is_admin = any(r.name == "Admin" for r in user_acc.all_roles)
            is_interviewer = any(r.name == "Interviewer" for r in user_acc.all_roles) or (user_acc and bool(user_acc.merged_permissions.get("ats:feedback:submit")))
            if is_admin or is_interviewer:
                eligible.append({
                    "id": str(emp.id),
                    "full_name": emp.full_name,
                    "employee_code": emp.employee_code,
                    "department_name": emp.department.name if emp.department else None,
                    "role_names": [r.name for r in user_acc.all_roles],
                })
        return eligible

    @staticmethod
    def _ensure_ats_role(db: Session, company_id: UUID, role_name: str) -> Role:
        """Finds role by name for the company or creates it if missing."""
        role = db.query(Role).filter(Role.company_id == company_id, Role.name == role_name).first()
        if not role:
            from app.services.platform_service import DEFAULT_ROLE_PERMISSIONS
            perms = DEFAULT_ROLE_PERMISSIONS.get(role_name, {})
            role = Role(
                company_id=company_id,
                name=role_name,
                permissions=perms,
            )
            db.add(role)
            db.commit()
            db.refresh(role)
        return role

    @staticmethod
    def get_hiring_team(db: Session, company_id: UUID) -> dict:
        """Fetch all employees with ATS recruitment role statuses and interview stats."""
        try:
            employees = (
                db.query(Employee)
                .filter(Employee.company_id == company_id, Employee.employment_status == "active")
                .order_by(Employee.full_name.asc())
                .all()
            )

            interview_counts = {}
            feedback_counts = {}
            try:
                panel_rows = (
                    db.query(
                        InterviewPanel.employee_id,
                        func.count(InterviewPanel.id).label("total_interviews")
                    )
                    .join(Interview, InterviewPanel.interview_id == Interview.id)
                    .filter(Interview.company_id == company_id)
                    .group_by(InterviewPanel.employee_id)
                    .all()
                )
                interview_counts = {str(r[0]): r[1] for r in panel_rows if r[0] is not None}

                feedback_rows = (
                    db.query(
                        InterviewFeedback.interviewer_id,
                        func.count(InterviewFeedback.id).label("completed_interviews")
                    )
                    .join(Interview, InterviewFeedback.interview_id == Interview.id)
                    .filter(Interview.company_id == company_id)
                    .group_by(InterviewFeedback.interviewer_id)
                    .all()
                )
                feedback_counts = {str(r[0]): r[1] for r in feedback_rows if r[0] is not None}
            except Exception as iv_err:
                db.rollback()
                logger.warning("Could not calculate interview counts: %s", iv_err)

            team_members = []
            recruiters_count = 0
            interviewers_count = 0

            for emp in employees:
                user_acc = emp.user_account
                all_roles = user_acc.all_roles if user_acc else []
                role_names = [r.name for r in all_roles]
                is_admin = any(r.name == "Admin" for r in all_roles)
                is_recruiter = any(r.name == "Recruiter" for r in all_roles) or (user_acc and bool(user_acc.merged_permissions.get("ats:job:manage")))
                is_interviewer = any(r.name == "Interviewer" for r in all_roles) or (user_acc and bool(user_acc.merged_permissions.get("ats:feedback:submit")))

                if is_recruiter or is_admin:
                    recruiters_count += 1
                if is_interviewer or is_admin:
                    interviewers_count += 1

                team_members.append({
                    "employee_id": str(emp.id),
                    "full_name": emp.full_name,
                    "employee_code": emp.employee_code,
                    "email": user_acc.email if user_acc else None,
                    "department_name": emp.department.name if emp.department else None,
                    "designation_name": emp.designation.name if emp.designation else None,
                    "photo_url": emp.photo_url,
                    "role_names": role_names,
                    "primary_role": user_acc.role.name if (user_acc and user_acc.role) else "Employee",
                    "is_admin": is_admin,
                    "is_recruiter": is_recruiter,
                    "is_interviewer": is_interviewer,
                    "is_hiring_team": is_admin or is_recruiter or is_interviewer,
                    "total_interviews": interview_counts.get(str(emp.id), 0),
                    "completed_interviews": feedback_counts.get(str(emp.id), 0),
                    "has_account": bool(user_acc),
                })

            return {
                "members": team_members,
                "stats": {
                    "total_employees": len(employees),
                    "total_hiring_team": sum(1 for m in team_members if m["is_hiring_team"]),
                    "total_recruiters": recruiters_count,
                    "total_interviewers": interviewers_count,
                }
            }
        except Exception as e:
            logger.exception("Error in get_hiring_team: %s", e)
            raise HTTPException(status_code=500, detail=f"Hiring team query failed: {str(e)}")

    @staticmethod
    def update_hiring_team_member(
        db: Session,
        company_id: UUID,
        employee_id: UUID,
        is_recruiter: bool,
        is_interviewer: bool,
        actor_employee_id: UUID | None = None,
    ) -> dict:
        """Add or remove Recruiter and Interviewer roles from an employee."""
        emp = db.query(Employee).filter(Employee.id == employee_id, Employee.company_id == company_id).first()
        if not emp:
            raise HTTPException(status_code=404, detail="Employee not found.")
        if not emp.user_account:
            raise HTTPException(status_code=400, detail="Employee does not have an active user account yet.")

        recruiter_role = AtsService._ensure_ats_role(db, company_id, "Recruiter")
        interviewer_role = AtsService._ensure_ats_role(db, company_id, "Interviewer")

        user_acc = emp.user_account

        # Existing additional roles (preserve other roles like Manager, Payroll etc.)
        existing_role_ids = [
            link.role_id for link in user_acc.role_links
            if link.role_id not in (recruiter_role.id, interviewer_role.id)
        ]

        if is_recruiter and user_acc.role_id != recruiter_role.id:
            existing_role_ids.append(recruiter_role.id)

        if is_interviewer and user_acc.role_id != interviewer_role.id:
            existing_role_ids.append(interviewer_role.id)

        # Clear and re-add cleanly
        db.query(UserAccountRole).filter(UserAccountRole.user_account_id == user_acc.id).delete()
        for rid in set(existing_role_ids):
            db.add(UserAccountRole(user_account_id=user_acc.id, role_id=rid))

        log_action(db, company_id, actor_employee_id, "ats.hiring_team.roles_updated", "employee", employee_id)
        db.commit()
        db.refresh(user_acc)

        all_roles = user_acc.all_roles
        return {
            "employee_id": str(emp.id),
            "full_name": emp.full_name,
            "role_names": [r.name for r in all_roles],
            "is_recruiter": any(r.name == "Recruiter" for r in all_roles),
            "is_interviewer": any(r.name == "Interviewer" for r in all_roles),
        }

    @staticmethod
    def create_interview(
        db: Session,
        company_id: UUID,
        current_user: UserAccount,
        application_id: UUID,
        round_name: str,
        round_template_id: UUID | None = None,
        round_number: int = 1,
        interview_type: str = "Virtual",
    ) -> Interview:
        """Step 1: Admin picks the round for an application (creates an interview in Needs interviewer)."""
        app = (
            db.query(Application)
            .filter(Application.id == application_id, Application.company_id == company_id)
            .first()
        )
        if not app:
            raise HTTPException(status_code=404, detail="Application not found.")

        # Ensure application is in Interview stage (stays in Interview across all rounds)
        interview_stage = (
            db.query(Stage)
            .filter(Stage.company_id == company_id, Stage.name == "Interview")
            .first()
        )
        if interview_stage and app.stage_id != interview_stage.id:
            app.stage_id = interview_stage.id
            app.updated_at = datetime.now(timezone.utc)

        interview = Interview(
            id=uuid.uuid4(),
            company_id=company_id,
            application_id=app.id,
            round_template_id=round_template_id,
            round_name=round_name.strip(),
            round_number=round_number,
            interview_type=interview_type,
            status="Needs interviewer",
        )
        db.add(interview)

        # Activity log
        actor_name = current_user.employee.full_name if current_user.employee else current_user.email
        act = ApplicationActivity(
            id=uuid.uuid4(),
            company_id=company_id,
            application_id=app.id,
            actor_id=current_user.id,
            actor_type="user",
            event_type="interview_created",
            from_stage_id=app.stage_id,
            to_stage_id=app.stage_id,
            metadata_json={
                "actor_name": actor_name,
                "round_name": round_name,
                "round_number": round_number,
                "action": "Interview round created (Needs interviewer)",
            },
            created_at=datetime.now(timezone.utc),
        )
        db.add(act)

        db.commit()
        db.refresh(interview)
        return interview

    @staticmethod
    def assign_interviewer(
        db: Session,
        company_id: UUID,
        current_user: UserAccount,
        interview_id: UUID,
        interviewer_employee_id: UUID,
    ) -> Interview:
        """Step 2: Recruiter or admin assigns an interviewer (Status becomes Assigned)."""
        interview = (
            db.query(Interview)
            .filter(Interview.id == interview_id, Interview.company_id == company_id)
            .first()
        )
        if not interview:
            raise HTTPException(status_code=404, detail="Interview not found.")

        interviewer_emp = (
            db.query(Employee)
            .filter(Employee.id == interviewer_employee_id, Employee.company_id == company_id)
            .first()
        )
        if not interviewer_emp:
            raise HTTPException(status_code=400, detail="Invalid interviewer employee.")

        # Clear existing panel if any and set primary interviewer
        db.query(InterviewPanel).filter(InterviewPanel.interview_id == interview.id).delete()
        panel_entry = InterviewPanel(
            id=uuid.uuid4(),
            interview_id=interview.id,
            employee_id=interviewer_emp.id,
            is_primary=True,
        )
        db.add(panel_entry)

        interview.status = "Assigned"
        interview.updated_at = datetime.now(timezone.utc)

        actor_name = current_user.employee.full_name if current_user.employee else current_user.email
        act = ApplicationActivity(
            id=uuid.uuid4(),
            company_id=company_id,
            application_id=interview.application_id,
            actor_id=current_user.id,
            actor_type="user",
            event_type="interviewer_assigned",
            metadata_json={
                "actor_name": actor_name,
                "round_name": interview.round_name,
                "interviewer_name": interviewer_emp.full_name,
                "status": "Assigned",
            },
            created_at=datetime.now(timezone.utc),
        )
        db.add(act)

        db.commit()
        db.refresh(interview)
        return interview

    @staticmethod
    def set_slot_and_confirm(
        db: Session,
        company_id: UUID,
        current_user: UserAccount,
        interview_id: UUID,
        scheduled_at: datetime,
        duration_minutes: int = 45,
        meeting_link_or_location: str | None = None,
        interview_type: str | None = None,
    ) -> tuple[Interview, bool]:
        """
        Step 3: Interviewer sets slot and confirms.
        Returns (interview, has_overlap_warning).
        """
        from datetime import timedelta
        interview = (
            db.query(Interview)
            .filter(Interview.id == interview_id, Interview.company_id == company_id)
            .first()
        )
        if not interview:
            raise HTTPException(status_code=404, detail="Interview not found.")

        primary_panel = (
            db.query(InterviewPanel)
            .filter(InterviewPanel.interview_id == interview.id, InterviewPanel.is_primary == True)
            .first()
        )
        interviewer_id = primary_panel.employee_id if primary_panel else None

        # Check for overlapping confirmed slots for the same interviewer
        has_overlap_warning = False
        if interviewer_id:
            end_time = scheduled_at + timedelta(minutes=duration_minutes)
            overlap_query = (
                db.query(Interview)
                .join(InterviewPanel, InterviewPanel.interview_id == Interview.id)
                .filter(
                    Interview.id != interview.id,
                    Interview.company_id == company_id,
                    InterviewPanel.employee_id == interviewer_id,
                    Interview.status == "Confirmed",
                    Interview.scheduled_at != None,
                )
                .all()
            )
            for other in overlap_query:
                other_end = other.scheduled_at + timedelta(minutes=other.duration_minutes)
                if max(scheduled_at, other.scheduled_at) < min(end_time, other_end):
                    has_overlap_warning = True
                    break

        was_confirmed = interview.status == "Confirmed"
        interview.scheduled_at = scheduled_at
        interview.duration_minutes = duration_minutes
        interview.meeting_link_or_location = meeting_link_or_location.strip() if meeting_link_or_location else None
        if interview_type:
            interview.interview_type = interview_type.strip()
        interview.status = "Confirmed"
        interview.updated_at = datetime.now(timezone.utc)

        actor_name = current_user.employee.full_name if current_user.employee else current_user.email
        event_name = "interview_rescheduled" if was_confirmed else "interview_confirmed"
        act = ApplicationActivity(
            id=uuid.uuid4(),
            company_id=company_id,
            application_id=interview.application_id,
            actor_id=current_user.id,
            actor_type="user",
            event_type=event_name,
            metadata_json={
                "actor_name": actor_name,
                "round_name": interview.round_name,
                "interview_type": interview.interview_type,
                "scheduled_at": scheduled_at.isoformat(),
                "duration_minutes": duration_minutes,
                "overlap_warning": has_overlap_warning,
            },
            created_at=datetime.now(timezone.utc),
        )
        db.add(act)

        db.commit()
        db.refresh(interview)
        return interview, has_overlap_warning

    @staticmethod
    def submit_feedback(
        db: Session,
        company_id: UUID,
        current_user: UserAccount,
        interview_id: UUID,
        attended: bool,
        rating: int | None = None,
        recommendation: str | None = None,
        notes: str | None = None,
    ) -> InterviewFeedback:
        """
        Step 5: Interviewer submits feedback.
        If attended is False -> Status becomes Absent.
        If attended is True -> Status becomes Completed.
        """
        interview = (
            db.query(Interview)
            .filter(Interview.id == interview_id, Interview.company_id == company_id)
            .first()
        )
        if not interview:
            raise HTTPException(status_code=404, detail="Interview not found.")

        # Check interviewer employee
        interviewer_emp_id = current_user.employee_id
        if not interviewer_emp_id:
            # If admin testing without linked employee
            panel = db.query(InterviewPanel).filter(InterviewPanel.interview_id == interview.id).first()
            if panel:
                interviewer_emp_id = panel.employee_id
            else:
                emp = db.query(Employee).filter(Employee.company_id == company_id).first()
                interviewer_emp_id = emp.id if emp else None

        if not attended:
            interview.status = "Absent"
            recommendation = "Absent"
            rating = None
            notes = "Candidate did not attend interview."
        else:
            interview.status = "Completed"

        interview.updated_at = datetime.now(timezone.utc)

        feedback = InterviewFeedback(
            id=uuid.uuid4(),
            interview_id=interview.id,
            interviewer_id=interviewer_emp_id,
            attended=attended,
            rating=rating,
            recommendation=recommendation,
            notes=notes,
            submitted_at=datetime.now(timezone.utc),
        )
        db.add(feedback)

        actor_name = current_user.employee.full_name if current_user.employee else current_user.email
        act = ApplicationActivity(
            id=uuid.uuid4(),
            company_id=company_id,
            application_id=interview.application_id,
            actor_id=current_user.id,
            actor_type="user",
            event_type="feedback_submitted",
            metadata_json={
                "actor_name": actor_name,
                "round_name": interview.round_name,
                "attended": attended,
                "recommendation": recommendation,
                "rating": rating,
            },
            created_at=datetime.now(timezone.utc),
        )
        db.add(act)

        db.commit()
        db.refresh(feedback)
        return feedback

    @staticmethod
    def get_admin_interviews(
        db: Session,
        company_id: UUID,
        current_user: UserAccount,
        tab_filter: str | None = None,
        include_history: bool = False,
    ) -> list[dict]:
        """
        Admin Interviews tab filters:
        - Needs interviewer
        - Awaiting slot
        - Confirmed
        - Feedback pending
        - Awaiting decision
        Rule: Recruiter sees only feedback status (submitted/pending), not content.
        Only the active/latest round per candidate is shown by default (superseded completed rounds are hidden).
        """
        is_admin = any(r.name == "Admin" for r in current_user.all_roles)
        can_view_feedback_content = is_admin or current_user.merged_permissions.get("ats:feedback:view_all")

        # Auto-heal: Ensure applications currently in Interview stage have at least Round 1
        interview_stage = (
            db.query(Stage)
            .filter(Stage.company_id == company_id, Stage.name == "Interview")
            .first()
        )
        if interview_stage:
            uninit_apps = (
                db.query(Application)
                .filter(
                    Application.company_id == company_id,
                    Application.stage_id == interview_stage.id,
                )
                .all()
            )
            created_any = False
            for u_app in uninit_apps:
                has_iv = (
                    db.query(Interview)
                    .filter(Interview.application_id == u_app.id, Interview.company_id == company_id)
                    .first()
                )
                if not has_iv:
                    new_iv = Interview(
                        id=uuid.uuid4(),
                        company_id=company_id,
                        application_id=u_app.id,
                        round_name="Round 1 - Technical Interview",
                        round_number=1,
                        interview_type="Virtual",
                        status="Needs interviewer",
                    )
                    db.add(new_iv)
                    created_any = True
            if created_any:
                db.commit()

        query = (
            db.query(Interview)
            .filter(Interview.company_id == company_id)
            .order_by(Interview.round_number.desc(), Interview.updated_at.desc())
        )

        now = datetime.now(timezone.utc)
        all_interviews = query.all()

        # Map all interviews per application to compute max round and gather history
        app_rounds = {}
        for iv in all_interviews:
            if iv.application_id not in app_rounds:
                app_rounds[iv.application_id] = []
            app_rounds[iv.application_id].append(iv)

        max_round_by_app = {
            app_id: max(iv.round_number for iv in iv_list)
            for app_id, iv_list in app_rounds.items()
        }

        out = []

        for iv in all_interviews:
            max_rnd = max_round_by_app.get(iv.application_id, iv.round_number)
            is_latest_round = (iv.round_number == max_rnd)
            stage_name = iv.application.stage.name if (iv.application and iv.application.stage) else ""
            app_in_interview_stage = (stage_name == "Interview")

            # An interview is actively pending in the interview coordination pipeline if:
            # 1. It is the latest round scheduled for this candidate
            # 2. The candidate's application is currently in the "Interview" stage (not yet moved to Offer, Hired, etc.)
            is_active_round = is_latest_round and app_in_interview_stage

            # If not including historical rounds, hide any round that is not actively in progress in the interview stage
            if not include_history and not is_active_round:
                continue

            cand = iv.application.candidate if iv.application else None
            job = iv.application.job if iv.application else None
            panel = iv.panel[0] if iv.panel else None
            interviewer_name = panel.employee.full_name if panel and panel.employee else None
            feedback = iv.feedback_list[0] if iv.feedback_list else None

            # Determine filter bucket
            bucket = "Needs interviewer"
            if iv.status == "Needs interviewer":
                bucket = "Needs interviewer"
            elif iv.status == "Assigned":
                bucket = "Awaiting slot"
            elif iv.status == "Confirmed":
                if iv.scheduled_at and iv.scheduled_at <= now and not feedback:
                    bucket = "Feedback pending"
                else:
                    bucket = "Confirmed"
            elif iv.status in ("Completed", "Absent"):
                bucket = "Awaiting decision"

            if tab_filter and tab_filter != "ALL" and bucket != tab_filter:
                continue

            # Gather historical previous rounds for this candidate
            previous_rounds = []
            if iv.application_id in app_rounds:
                for prev_iv in sorted(app_rounds[iv.application_id], key=lambda x: x.round_number):
                    if prev_iv.round_number < iv.round_number:
                        p_panel = prev_iv.panel[0] if prev_iv.panel else None
                        p_feedback = prev_iv.feedback_list[0] if prev_iv.feedback_list else None
                        previous_rounds.append({
                            "round_id": str(prev_iv.id),
                            "round_number": prev_iv.round_number,
                            "round_name": prev_iv.round_name,
                            "status": prev_iv.status,
                            "interview_type": prev_iv.interview_type,
                            "interviewer_name": p_panel.employee.full_name if p_panel and p_panel.employee else None,
                            "recommendation": p_feedback.recommendation if p_feedback else None,
                            "rating": p_feedback.rating if p_feedback else None,
                            "notes": p_feedback.notes if (p_feedback and can_view_feedback_content) else None,
                        })

            item = {
                "id": str(iv.id),
                "application_id": str(iv.application_id),
                "candidate_name": cand.full_name if cand else "Unknown",
                "candidate_email": cand.email if cand else "",
                "job_title": job.title if job else "",
                "stage_name": stage_name,
                "round_name": iv.round_name,
                "round_number": iv.round_number,
                "interview_type": iv.interview_type,
                "status": iv.status,
                "bucket": bucket,
                "is_latest_round": is_latest_round,
                "is_active_round": is_active_round,
                "previous_rounds": previous_rounds,
                "scheduled_at": iv.scheduled_at.isoformat() if iv.scheduled_at else None,
                "duration_minutes": iv.duration_minutes,
                "meeting_link_or_location": iv.meeting_link_or_location,
                "interviewer_employee_id": str(panel.employee_id) if panel else None,
                "interviewer_name": interviewer_name,
                "feedback_status": "submitted" if feedback else "pending",
                "feedback": {
                    "attended": feedback.attended,
                    "rating": feedback.rating,
                    "recommendation": feedback.recommendation,
                    "notes": feedback.notes,
                } if (feedback and can_view_feedback_content) else None,
            }
            out.append(item)
        return out

    @staticmethod
    def get_my_interviews(
        db: Session,
        company_id: UUID,
        current_user: UserAccount,
    ) -> list[dict]:
        """
        Interviewer opens My Interviews:
        Interviewers see ONLY their own interviews and cannot see other interviewers' feedback.
        """
        emp_id = current_user.employee_id
        if not emp_id:
            return []

        query = (
            db.query(Interview)
            .join(InterviewPanel, InterviewPanel.interview_id == Interview.id)
            .filter(
                Interview.company_id == company_id,
                InterviewPanel.employee_id == emp_id,
            )
            .order_by(Interview.updated_at.desc())
        )

        results = query.all()
        out = []
        for iv in results:
            cand = iv.application.candidate if iv.application else None
            job = iv.application.job if iv.application else None
            feedback = iv.feedback_list[0] if iv.feedback_list else None

            out.append({
                "id": str(iv.id),
                "application_id": str(iv.application_id),
                "candidate_id": str(cand.id) if cand else None,
                "candidate_name": cand.full_name if cand else "Unknown",
                "candidate_email": cand.email if cand else "",
                "candidate_phone": cand.phone if cand else "",
                "job_title": job.title if job else "",
                "round_name": iv.round_name,
                "round_number": iv.round_number,
                "interview_type": iv.interview_type,
                "status": iv.status,
                "scheduled_at": iv.scheduled_at.isoformat() if iv.scheduled_at else None,
                "duration_minutes": iv.duration_minutes,
                "meeting_link_or_location": iv.meeting_link_or_location,
                "has_resume": bool(iv.application.resume_file_id or iv.application.resume_path) if iv.application else False,
                "feedback_submitted": bool(feedback),
                "my_feedback": {
                    "attended": feedback.attended,
                    "rating": feedback.rating,
                    "recommendation": feedback.recommendation,
                    "notes": feedback.notes,
                } if feedback else None,
            })
        return out


    # ── Phase 4: Offer and Hired Logic ───────────────────────

    @staticmethod
    def create_offer(
        db: Session,
        company_id: UUID,
        current_user: UserAccount,
        application_id: UUID,
        payload,
    ) -> Offer:
        """Create a new Offer version for an application."""
        app = (
            db.query(Application)
            .filter(Application.id == application_id, Application.company_id == company_id)
            .first()
        )
        if not app:
            raise HTTPException(status_code=404, detail="Application not found.")

        # Determine next version number
        max_ver = (
            db.query(func.max(Offer.version_number))
            .filter(Offer.application_id == application_id)
            .scalar()
        ) or 0
        new_version = max_ver + 1

        offer = Offer(
            id=uuid.uuid4(),
            company_id=company_id,
            application_id=application_id,
            version_number=new_version,
            designation=payload.designation,
            ctc=payload.ctc,
            joining_date=payload.joining_date,
            reporting_manager_id=payload.reporting_manager_id,
            probation_period_months=payload.probation_period_months,
            validity_date=payload.validity_date,
            status="Draft",
            offer_letter_template=payload.offer_letter_template,
            notes=payload.notes,
        )
        db.add(offer)

        # Move application to "Offer" stage if it's currently before Offer and not terminal
        offer_stage = (
            db.query(Stage)
            .filter(
                Stage.company_id == company_id,
                Stage.name.ilike("Offer"),
                Stage.is_active == True,
            )
            .first()
        )
        prev_stage_id = app.stage_id
        if offer_stage and app.stage_id != offer_stage.id and not app.stage.is_terminal:
            app.stage_id = offer_stage.id
            app.updated_at = datetime.now(timezone.utc)

        actor_emp = current_user.employee
        actor_name = actor_emp.full_name if actor_emp else current_user.email

        activity = ApplicationActivity(
            id=uuid.uuid4(),
            company_id=company_id,
            application_id=application_id,
            actor_id=current_user.id,
            actor_type="user",
            event_type="offer_created",
            from_stage_id=prev_stage_id if app.stage_id != prev_stage_id else None,
            to_stage_id=app.stage_id,
            metadata_json={
                "version_number": new_version,
                "designation": payload.designation,
                "ctc": str(payload.ctc),
                "joining_date": payload.joining_date.isoformat(),
                "status": "Draft",
                "created_by": actor_name,
            },
            created_at=datetime.now(timezone.utc),
        )
        db.add(activity)

        db.commit()
        db.refresh(offer)
        return offer

    @staticmethod
    def get_offers(db: Session, company_id: UUID, application_id: UUID) -> list[dict]:
        """Fetch all offer versions for an application."""
        offers = (
            db.query(Offer)
            .filter(Offer.application_id == application_id, Offer.company_id == company_id)
            .order_by(Offer.version_number.desc())
            .all()
        )
        out = []
        for o in offers:
            mgr_name = o.reporting_manager.full_name if o.reporting_manager else None
            out.append({
                "id": str(o.id),
                "company_id": str(o.company_id),
                "application_id": str(o.application_id),
                "version_number": o.version_number,
                "designation": o.designation,
                "ctc": float(o.ctc),
                "joining_date": o.joining_date.isoformat() if o.joining_date else None,
                "reporting_manager_id": str(o.reporting_manager_id) if o.reporting_manager_id else None,
                "reporting_manager_name": mgr_name,
                "probation_period_months": o.probation_period_months,
                "validity_date": o.validity_date.isoformat() if o.validity_date else None,
                "status": o.status,
                "offer_letter_template": o.offer_letter_template,
                "declined_reason": o.declined_reason,
                "notes": o.notes,
                "created_at": o.created_at.isoformat() if o.created_at else None,
                "updated_at": o.updated_at.isoformat() if o.updated_at else None,
            })
        return out

    @staticmethod
    def update_offer_status(
        db: Session,
        company_id: UUID,
        current_user: UserAccount,
        offer_id: UUID,
        status: str,
        declined_reason: str | None = None,
        notes: str | None = None,
    ) -> Offer:
        """Update offer status (Draft -> Approved -> Sent -> Accepted / Declined / Expired / Withdrawn)."""
        offer = (
            db.query(Offer)
            .filter(Offer.id == offer_id, Offer.company_id == company_id)
            .first()
        )
        if not offer:
            raise HTTPException(status_code=404, detail="Offer not found.")

        valid_statuses = {"Draft", "Approved", "Sent", "Accepted", "Declined", "Expired", "Withdrawn"}
        if status not in valid_statuses:
            raise HTTPException(status_code=400, detail=f"Invalid status '{status}'. Must be one of {valid_statuses}")

        prev_status = offer.status
        offer.status = status
        if declined_reason:
            offer.declined_reason = declined_reason
        if notes:
            offer.notes = f"{offer.notes}\n{notes}" if offer.notes else notes
        offer.updated_at = datetime.now(timezone.utc)

        activity = ApplicationActivity(
            id=uuid.uuid4(),
            company_id=company_id,
            application_id=offer.application_id,
            actor_id=current_user.id,
            actor_type="user",
            event_type="offer_status_changed",
            from_stage_id=None,
            to_stage_id=offer.application.stage_id,
            metadata_json={
                "version_number": offer.version_number,
                "previous_status": prev_status,
                "new_status": status,
                "declined_reason": declined_reason,
            },
            created_at=datetime.now(timezone.utc),
        )
        db.add(activity)

        db.commit()
        db.refresh(offer)
        return offer

    @staticmethod
    def get_offer_print_data(db: Session, company_id: UUID, offer_id: UUID) -> dict:
        """Return structured data ready for browser-print offer letter."""
        offer = (
            db.query(Offer)
            .filter(Offer.id == offer_id, Offer.company_id == company_id)
            .first()
        )
        if not offer:
            raise HTTPException(status_code=404, detail="Offer not found.")

        app = offer.application
        cand = app.candidate
        job = app.job
        company = db.query(Company).filter(Company.id == company_id).first()
        mgr = offer.reporting_manager

        ctc_float = float(offer.ctc)
        return {
            "offer_id": str(offer.id),
            "version_number": offer.version_number,
            "status": offer.status,
            "designation": offer.designation,
            "ctc": ctc_float,
            "ctc_monthly": round(ctc_float / 12, 2),
            "joining_date": offer.joining_date.isoformat() if offer.joining_date else None,
            "probation_period_months": offer.probation_period_months,
            "validity_date": offer.validity_date.isoformat() if offer.validity_date else None,
            "notes": offer.notes,
            "offer_letter_template": offer.offer_letter_template,
            "candidate": {
                "id": str(cand.id),
                "full_name": cand.full_name,
                "email": cand.email,
                "phone": cand.phone,
                "current_location": cand.current_location,
            },
            "company": {
                "id": str(company.id) if company else None,
                "name": company.name if company else "Company",
                "subdomain": company.subdomain if company else "",
                "logo_url": company.logo_url if company else None,
            },
            "job": {
                "id": str(job.id),
                "title": job.title,
                "department_name": job.department_name,
                "location": job.location,
                "job_type": job.job_type,
            },
            "reporting_manager": {
                "name": mgr.full_name,
                "employee_code": mgr.employee_code,
            } if mgr else None,
        }

    @staticmethod
    def convert_to_employee(
        db: Session,
        company_id: UUID,
        current_user: UserAccount,
        application_id: UUID,
        payload,
    ) -> dict:
        """
        Idempotent conversion of a Candidate into an Employee.
        1. Guard: Check application.converted_employee_id (if already converted, return existing).
        2. Guard: Check duplicate UserAccount email across platform.
        3. Check/Generate unique employee_code.
        4. Create Employee record.
        5. Create UserAccount & send invite token if create_user_account is true.
        6. Initialize LeaveBalance for each active company LeaveType.
        7. Attach candidate resume to EmployeeDocument.
        8. Transition application to 'Hired' stage & update converted_employee_id.
        9. Auto-close job opening if number_of_openings filled.
        """
        app = (
            db.query(Application)
            .filter(Application.id == application_id, Application.company_id == company_id)
            .first()
        )
        if not app:
            raise HTTPException(status_code=404, detail="Application not found.")

        # 1. Idempotency Check
        if app.converted_employee_id:
            existing_emp = (
                db.query(Employee)
                .filter(Employee.id == app.converted_employee_id, Employee.company_id == company_id)
                .first()
            )
            if existing_emp:
                return {
                    "success": True,
                    "already_converted": True,
                    "employee_id": str(existing_emp.id),
                    "employee_code": existing_emp.employee_code,
                    "full_name": existing_emp.full_name,
                    "message": f"Candidate is already converted to employee ({existing_emp.employee_code}).",
                }

        cand = app.candidate
        job = app.job
        latest_offer = app.offers[0] if app.offers else None

        # 2. Check duplicate email platform-wide
        if payload.create_user_account:
            existing_user = db.query(UserAccount).filter(UserAccount.email == cand.email).first()
            if existing_user:
                raise HTTPException(
                    status_code=400,
                    detail=f"A user account with email '{cand.email}' already exists in the system.",
                )

        # 3. Check or generate Employee Code
        emp_code = (payload.employee_code or "").strip()
        if emp_code:
            code_conflict = (
                db.query(Employee)
                .filter(Employee.company_id == company_id, Employee.employee_code == emp_code)
                .first()
            )
            if code_conflict:
                raise HTTPException(
                    status_code=400,
                    detail=f"Employee code '{emp_code}' is already assigned in your organization.",
                )
        else:
            count = db.query(Employee).filter(Employee.company_id == company_id).count()
            seq = count + 1
            while True:
                candidate_code = f"EMP-{seq:04d}"
                exists = (
                    db.query(Employee)
                    .filter(Employee.company_id == company_id, Employee.employee_code == candidate_code)
                    .first()
                )
                if not exists:
                    emp_code = candidate_code
                    break
                seq += 1

        # 4. Resolve dates & relationships
        hire_date = payload.date_of_hire or (latest_offer.joining_date if latest_offer else date.today())
        dept_id = payload.department_id or job.department_id
        desig_id = payload.designation_id or job.designation_id
        mgr_id = payload.manager_id or (latest_offer.reporting_manager_id if latest_offer else None)

        new_emp = Employee(
            id=uuid.uuid4(),
            company_id=company_id,
            employee_code=emp_code,
            full_name=cand.full_name,
            personal_email=cand.email,
            phone=cand.phone,
            department_id=dept_id,
            designation_id=desig_id,
            manager_id=mgr_id,
            site_id=payload.site_id,
            date_of_hire=hire_date,
            employment_status="active",
            employment_type="full_time",
        )
        db.add(new_emp)
        db.flush()

        # 5. User account creation & invite
        user_account_id = None
        invite_sent = False
        token = None
        if payload.create_user_account:
            role_id = payload.role_id
            if not role_id:
                emp_role = (
                    db.query(Role)
                    .filter(Role.company_id == company_id, Role.name == "Employee")
                    .first()
                )
                role_id = emp_role.id if emp_role else None

            placeholder_hash = hash_password(secrets.token_urlsafe(32))
            user_acc = UserAccount(
                id=uuid.uuid4(),
                company_id=company_id,
                employee_id=new_emp.id,
                role_id=role_id,
                email=cand.email,
                password_hash=placeholder_hash,
                mfa_enabled=False,
            )
            db.add(user_acc)
            db.flush()
            user_account_id = user_acc.id

            token = create_invite_token(user_acc.id)
            invite_sent = try_send_invite_email(user_acc.email, new_emp.full_name, token)

        # 6. Initialize Leave Balances
        leave_types = db.query(LeaveType).filter(LeaveType.company_id == company_id).all()
        hire_year = hire_date.year
        for lt in leave_types:
            initial_bal = (lt.accrual_rate or Decimal(0)) * 12
            lb = LeaveBalance(
                id=uuid.uuid4(),
                company_id=company_id,
                employee_id=new_emp.id,
                leave_type_id=lt.id,
                balance=initial_bal,
                year=hire_year,
            )
            db.add(lb)

        # 7. Attach Resume to EmployeeDocument
        if app.resume_path or app.resume_file_id:
            doc = EmployeeDocument(
                id=uuid.uuid4(),
                company_id=company_id,
                employee_id=new_emp.id,
                doc_type="Resume",
                file_url=app.resume_path or app.resume_file_id,
                e_signed=False,
            )
            db.add(doc)

        # 8. Update Application to Hired stage
        hired_stage = (
            db.query(Stage)
            .filter(
                Stage.company_id == company_id,
                (Stage.name.ilike("Hired") | (Stage.terminal_type == "hired") | (Stage.code == "HIRED")),
                Stage.is_active == True,
            )
            .first()
        )
        if not hired_stage:
            hired_stage = Stage(
                id=uuid.uuid4(),
                company_id=company_id,
                name="Hired",
                code="HIRED",
                display_order=99,
                is_initial=False,
                is_terminal=True,
                terminal_type="hired",
                is_active=True,
            )
            db.add(hired_stage)
            db.flush()

        prev_stage_id = app.stage_id
        app.converted_employee_id = new_emp.id
        app.stage_id = hired_stage.id
        app.updated_at = datetime.now(timezone.utc)

        # If latest offer exists, set to Accepted
        if latest_offer and latest_offer.status != "Accepted":
            latest_offer.status = "Accepted"
            latest_offer.updated_at = datetime.now(timezone.utc)

        # 9. Auto-close Job Opening if quota met
        job_auto_closed = False
        if job.number_of_openings:
            hired_count = (
                db.query(Application)
                .filter(
                    Application.job_id == job.id,
                    Application.converted_employee_id.isnot(None),
                )
                .count()
            )
            if hired_count >= job.number_of_openings:
                job.status = "Closed"
                job.updated_at = datetime.now(timezone.utc)
                job_auto_closed = True

        # Activity log & audit
        activity = ApplicationActivity(
            id=uuid.uuid4(),
            company_id=company_id,
            application_id=app.id,
            actor_id=current_user.id,
            actor_type="user",
            event_type="hired",
            from_stage_id=prev_stage_id if app.stage_id != prev_stage_id else None,
            to_stage_id=app.stage_id,
            metadata_json={
                "employee_id": str(new_emp.id),
                "employee_code": new_emp.employee_code,
                "full_name": new_emp.full_name,
                "date_of_hire": hire_date.isoformat(),
                "job_auto_closed": job_auto_closed,
            },
            created_at=datetime.now(timezone.utc),
        )
        db.add(activity)

        log_action(
            db,
            company_id,
            current_user.employee_id,
            "ats.candidate_hired",
            "employee",
            new_emp.id,
        )

        db.commit()
        db.refresh(new_emp)

        return {
            "success": True,
            "already_converted": False,
            "employee_id": str(new_emp.id),
            "employee_code": new_emp.employee_code,
            "full_name": new_emp.full_name,
            "email": cand.email,
            "invite_token": token if payload.create_user_account else None,
            "date_of_hire": hire_date.isoformat(),
            "job_auto_closed": job_auto_closed,
            "invite_sent": invite_sent,
            "message": f"Successfully hired {new_emp.full_name} as {new_emp.employee_code}.",
        }

    # ── Careers Page Customization Settings ──────────────────

    @staticmethod
    def get_careers_settings(db: Session, company_id: UUID) -> CareersPageSettings:
        """Fetch tenant's custom careers page configuration or auto-create defaults."""
        settings = (
            db.query(CareersPageSettings)
            .filter(CareersPageSettings.company_id == company_id)
            .first()
        )
        if not settings:
            company = db.query(Company).filter(Company.id == company_id).first()
            company_name = company.name if company else "Company"
            settings = CareersPageSettings(
                id=uuid.uuid4(),
                company_id=company_id,
                brand_name=company_name,
                logo_url=company.logo_url if company else None,
                badge_text="CAREERS",
                title_prefix="Join our",
                title_highlight="team",
                subtitle=f"Build amazing products, work with great people, and grow your career with {company_name}.",
                hero_image_url="https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=900&q=80",
                hero_card_badge="Better Together",
                hero_card_quote="Better Code.\nBigger Dreams.",
                primary_color="#1d68f5",
            )
            db.add(settings)
            db.commit()
            db.refresh(settings)

        return settings

    @staticmethod
    def update_careers_settings(
        db: Session,
        company_id: UUID,
        payload,
    ) -> CareersPageSettings:
        """Update tenant's careers page customization settings."""
        settings = AtsService.get_careers_settings(db, company_id)

        update_fields = [
            "brand_name", "logo_url", "badge_text", "title_prefix", "title_highlight",
            "subtitle", "hero_image_url", "hero_card_badge", "hero_card_quote", "primary_color",
        ]

        for field in update_fields:
            val = getattr(payload, field, None)
            if val is not None:
                setattr(settings, field, val)

        settings.updated_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(settings)
        return settings
