"""
ATS Routes — Job Openings CRUD and Public Careers Endpoints.
"""

import os
from uuid import UUID
from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    Request,
    UploadFile,
    status,
)
from fastapi.responses import FileResponse, Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import (
    get_company_from_subdomain,
    get_company_id,
    get_current_user,
    require_permissions,
)
from app.models.company import Company
from app.models.department import Department
from app.models.designation import Designation
from app.models.role import Role
from app.models.site import Site
from app.models.user_account import UserAccount
from app.schemas.ats import (
    JobOpeningCreate,
    JobOpeningResponse,
    JobOpeningUpdate,
    StageResponse,
    StageChangeRequest,
    AddNoteRequest,
    BulkShortlistRequest,
    RoundTemplateCreate,
    RoundTemplateResponse,
    RejectionReasonResponse,
    CreateInterviewRequest,
    AssignInterviewerRequest,
    SetSlotRequest,
    SubmitFeedbackRequest,
    CreateOfferRequest,
    UpdateOfferStatusRequest,
    OfferResponse,
    ConvertToEmployeeRequest,
    CareersSettingsUpdate,
    CareersSettingsResponse,
    UpdateHiringTeamRoleRequest,
)
from app.services.ats_service import AtsService

router = APIRouter(prefix="/api/ats", tags=["ATS"])


def resolve_public_tenant(
    request: Request,
    db: Session = Depends(get_db),
    tenant_param: str | None = Query(default=None, alias="tenant"),
) -> Company:
    """
    Resolves tenant Company for public careers endpoints:
    1. From subdomain (e.g., demo.meagle360.com).
    2. From query parameter ?tenant=demo.
    3. From header X-Tenant-Subdomain.
    4. Fallback to first company in DB for local developer environment.
    """
    company = get_company_from_subdomain(request, db)
    if company:
        return company

    query_sub = tenant_param or request.headers.get("X-Tenant-Subdomain")
    if query_sub:
        company = db.query(Company).filter(Company.subdomain == query_sub).first()
        if company:
            return company

    # Local development fallback: prefer Meagle360 Corp
    company = (
        db.query(Company)
        .filter((Company.subdomain == "meagle360-corp") | (Company.name.ilike("%meagle%")))
        .first()
    )
    if company:
        return company

    # Fallback to first company in DB if Meagle360 does not exist
    company = db.query(Company).first()
    if company:
        return company

    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="Tenant not found. Please access using a valid company subdomain.",
    )


# ── Public Careers Page Endpoints (No Auth Required) ─────────

@router.get("/public/careers")
def get_public_careers(
    db: Session = Depends(get_db),
    tenant: Company = Depends(resolve_public_tenant),
):
    """
    Public endpoint for candidate careers portal:
    Returns tenant branding (logo, name), list of open jobs, and filter options.
    """
    return AtsService.get_public_careers(db, tenant)


@router.post("/public/apply")
async def submit_public_application(
    job_id: str = Form(...),
    full_name: str = Form(...),
    email: str = Form(...),
    phone: str | None = Form(None),
    current_location: str | None = Form(None),
    years_of_experience: float | None = Form(None),
    cover_note: str | None = Form(None),
    honeypot: str | None = Form(None),
    resume: UploadFile = File(...),
    db: Session = Depends(get_db),
    tenant: Company = Depends(resolve_public_tenant),
):
    """
    Public candidate application endpoint:
    - Validates PDF format (magic bytes) & size limit.
    - Compresses PDF in-memory.
    - Prevents duplicate applications for the same job.
    - Uploads to ImageKit as private file.
    - Creates Candidate, Application, and Activity audit log.
    """
    try:
        job_uuid = UUID(job_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid job_id format.",
        )

    application = await AtsService.process_public_application(
        db=db,
        company=tenant,
        job_id=job_uuid,
        full_name=full_name,
        email=email,
        phone=phone,
        current_location=current_location,
        years_of_experience=years_of_experience,
        cover_note=cover_note,
        honeypot=honeypot,
        resume_file=resume,
    )

    return {
        "success": True,
        "message": "Application submitted successfully!",
        "application_id": str(application.id),
    }


# ── Internal ATS Job Openings Management (Protected) ──────────

@router.get("/jobs", response_model=list[JobOpeningResponse])
def list_job_openings(
    status: str | None = None,
    search: str | None = None,
    company_id: UUID = Depends(get_company_id),
    db: Session = Depends(get_db),
    _: UserAccount = Depends(require_permissions("ats:job:manage")),
):
    """List all job openings for the authenticated tenant."""
    return AtsService.get_job_openings(db, company_id, status_filter=status, search=search)


@router.post("/jobs", response_model=JobOpeningResponse, status_code=status.HTTP_201_CREATED)
def create_job_opening(
    payload: JobOpeningCreate,
    company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(get_current_user),
    db: Session = Depends(get_db),
    _: UserAccount = Depends(require_permissions("ats:job:manage")),
):
    """Create a new job opening."""
    job = AtsService.create_job_opening(db, company_id, payload, current_user.id)
    return {
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
        "applicants_count": 0,
    }


@router.get("/jobs/{job_id}", response_model=JobOpeningResponse)
def get_job_opening(
    job_id: UUID,
    company_id: UUID = Depends(get_company_id),
    db: Session = Depends(get_db),
    _: UserAccount = Depends(require_permissions("ats:job:manage")),
):
    """Get single job opening detail."""
    job = AtsService.get_job_opening_by_id(db, company_id, job_id)
    return {
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
        "applicants_count": len(job.applications) if job.applications else 0,
    }


@router.put("/jobs/{job_id}", response_model=JobOpeningResponse)
def update_job_opening(
    job_id: UUID,
    payload: JobOpeningUpdate,
    company_id: UUID = Depends(get_company_id),
    db: Session = Depends(get_db),
    _: UserAccount = Depends(require_permissions("ats:job:manage")),
):
    """Update a job opening."""
    job = AtsService.update_job_opening(db, company_id, job_id, payload)
    return {
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
        "applicants_count": len(job.applications) if job.applications else 0,
    }


@router.delete("/jobs/{job_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_job_opening(
    job_id: UUID,
    company_id: UUID = Depends(get_company_id),
    db: Session = Depends(get_db),
    _: UserAccount = Depends(require_permissions("ats:job:manage")),
):
    """Delete a job opening."""
    AtsService.delete_job_opening(db, company_id, job_id)
    return None


@router.get("/departments-and-designations")
def get_departments_and_designations(
    company_id: UUID = Depends(get_company_id),
    db: Session = Depends(get_db),
    current_user: UserAccount = Depends(get_current_user),
):
    """Helper for populating dropdowns when creating/editing job postings & onboarding employees."""
    depts = db.query(Department).filter(Department.company_id == company_id).order_by(Department.name.asc()).all()
    desigs = db.query(Designation).filter(Designation.company_id == company_id).order_by(Designation.title.asc()).all()
    roles = db.query(Role).filter(Role.company_id == company_id).order_by(Role.name.asc()).all()
    sites = db.query(Site).filter(Site.company_id == company_id).order_by(Site.name.asc()).all()

    return {
        "departments": [{"id": str(d.id), "name": d.name} for d in depts],
        "designations": [{"id": str(d.id), "title": d.title} for d in desigs],
        "roles": [{"id": str(r.id), "name": r.name} for r in roles],
        "sites": [{"id": str(s.id), "name": s.name} for s in sites],
    }


@router.get("/applications/resume-file")
def get_local_resume_file(path: str):
    """Fallback route to serve local development resumes securely."""
    clean_path = path.lstrip("/")
    if not clean_path.startswith("uploads/resumes/"):
        raise HTTPException(status_code=403, detail="Forbidden")
    if not os.path.exists(clean_path):
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(clean_path, media_type="application/pdf")


# ── Phase 2: Applicants Pipeline & Application Detail ─────────

@router.get("/stages", response_model=list[StageResponse])
def get_stages(
    company_id: UUID = Depends(get_company_id),
    db: Session = Depends(get_db),
    _: UserAccount = Depends(require_permissions("ats:applicants:view")),
):
    """List dynamic stages for the tenant with applicant count per stage."""
    return AtsService.get_stages_with_counts(db, company_id)


@router.get("/applicants")
def list_applicants(
    stage_id: UUID | None = None,
    job_id: UUID | None = None,
    department_id: UUID | None = None,
    search: str | None = None,
    company_id: UUID = Depends(get_company_id),
    db: Session = Depends(get_db),
    _: UserAccount = Depends(require_permissions("ats:applicants:view")),
):
    """
    List applicants with filters:
    Supports stage tabs, job filter, department filter, and name/email search.
    """
    return AtsService.get_applicants(
        db=db,
        company_id=company_id,
        stage_id=stage_id,
        job_id=job_id,
        department_id=department_id,
        search=search,
    )


@router.get("/applications/{application_id}")
def get_application_detail(
    application_id: UUID,
    company_id: UUID = Depends(get_company_id),
    db: Session = Depends(get_db),
    _: UserAccount = Depends(require_permissions("ats:applicants:view")),
):
    """Full application detail with candidate info, job info, and activity log."""
    return AtsService.get_application_detail(db, company_id, application_id)


@router.get("/applications/{application_id}/resume-blob")
async def get_resume_blob(
    application_id: UUID,
    company_id: UUID = Depends(get_company_id),
    db: Session = Depends(get_db),
    _: UserAccount = Depends(require_permissions("ats:applicants:view")),
):
    """
    Stream resume PDF file as a blob so authenticated iframe/embed
    can preview it securely in the browser without public exposure.
    """
    file_bytes, filename = await AtsService.get_resume_blob(db, company_id, application_id)
    return Response(
        content=file_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'inline; filename="{filename}"',
        },
    )


@router.post("/applications/{application_id}/change-stage")
def change_stage(
    application_id: UUID,
    payload: StageChangeRequest,
    company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(get_current_user),
    db: Session = Depends(get_db),
    _: UserAccount = Depends(require_permissions("ats:application:move_stage")),
):
    """
    Unified stage-change endpoint:
    - Concurrency check via current_stage_id.
    - Recruiter restrictions enforced (cannot move to Offer/Hired, cannot reject from Interview onward).
    - Mandatory rejection reason.
    - Append-only activity log written in same transaction.
    """
    app = AtsService.change_stage(
        db=db,
        company_id=company_id,
        application_id=application_id,
        current_user=current_user,
        current_stage_id=payload.current_stage_id,
        target_stage_id=payload.target_stage_id,
        reason=payload.reason,
        note=payload.note,
    )
    return {
        "success": True,
        "message": "Stage updated successfully.",
        "stage_id": str(app.stage_id),
    }


@router.post("/applications/{application_id}/notes")
def add_note(
    application_id: UUID,
    payload: AddNoteRequest,
    company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(get_current_user),
    db: Session = Depends(get_db),
    _: UserAccount = Depends(require_permissions("ats:applicants:view")),
):
    """Add a private note to candidate application timeline."""
    activity = AtsService.add_note(db, company_id, application_id, current_user, payload.note)
    return {
        "success": True,
        "activity_id": str(activity.id),
        "message": "Note added successfully.",
    }


@router.post("/applications/bulk-shortlist")
def bulk_shortlist(
    payload: BulkShortlistRequest,
    company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(get_current_user),
    db: Session = Depends(get_db),
    _: UserAccount = Depends(require_permissions("ats:application:move_stage")),
):
    """Bulk move selected applications from Applied to Screening."""
    count = AtsService.bulk_shortlist(db, company_id, current_user, payload.application_ids)
    return {
        "success": True,
        "moved_count": count,
        "message": f"{count} applications moved to Screening.",
    }


# ── Phase 3: Interviews & ATS Settings Endpoints ──────────

@router.get("/settings/round-templates", response_model=list[RoundTemplateResponse])
def get_round_templates(
    company_id: UUID = Depends(get_company_id),
    db: Session = Depends(get_db),
    _: UserAccount = Depends(require_permissions("ats:job:manage")),
):
    """List interview round templates (Technical, HR, Managerial, etc.)."""
    return AtsService.get_round_templates(db, company_id)


@router.post("/settings/round-templates", response_model=RoundTemplateResponse)
def create_round_template(
    payload: RoundTemplateCreate,
    company_id: UUID = Depends(get_company_id),
    db: Session = Depends(get_db),
    _: UserAccount = Depends(require_permissions("ats:settings:manage")),
):
    """Admin: Create an interview round template."""
    return AtsService.create_round_template(db, company_id, payload.name, payload.display_order)


@router.put("/settings/round-templates/{template_id}/toggle", response_model=RoundTemplateResponse)
def toggle_round_template(
    template_id: UUID,
    is_active: bool = Query(...),
    company_id: UUID = Depends(get_company_id),
    db: Session = Depends(get_db),
    _: UserAccount = Depends(require_permissions("ats:settings:manage")),
):
    """Admin: Deactivate, never delete interview round templates."""
    return AtsService.toggle_round_template(db, company_id, template_id, is_active)


@router.get("/settings/rejection-reasons", response_model=list[RejectionReasonResponse])
def get_rejection_reasons(
    company_id: UUID = Depends(get_company_id),
    db: Session = Depends(get_db),
    _: UserAccount = Depends(require_permissions("ats:applicants:view")),
):
    """Get list of active rejection reasons."""
    return AtsService.get_rejection_reasons(db, company_id)


@router.post("/settings/rejection-reasons", response_model=RejectionReasonResponse)
def create_rejection_reason(
    reason: str = Form(...),
    company_id: UUID = Depends(get_company_id),
    db: Session = Depends(get_db),
    _: UserAccount = Depends(require_permissions("ats:settings:manage")),
):
    """Admin: Add a rejection reason."""
    return AtsService.create_rejection_reason(db, company_id, reason)


def require_hiring_team_manage(current_user: UserAccount = Depends(get_current_user)):
    is_admin = any(r.name == "Admin" for r in current_user.all_roles)
    perms = current_user.merged_permissions
    if not (is_admin or perms.get("ats:settings:manage") or perms.get("settings:write")):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions to manage hiring team",
        )
    return current_user


@router.get("/hiring-team")
def get_hiring_team(
    company_id: UUID = Depends(get_company_id),
    db: Session = Depends(get_db),
    _: UserAccount = Depends(require_hiring_team_manage),
):
    """Admin/Lead HR: View all employees with their ATS Recruiter & Interviewer assignments."""
    return AtsService.get_hiring_team(db, company_id)


@router.put("/hiring-team/{employee_id}/roles")
def update_hiring_team_member_roles(
    employee_id: UUID,
    payload: UpdateHiringTeamRoleRequest,
    company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(get_current_user),
    db: Session = Depends(get_db),
    _: UserAccount = Depends(require_hiring_team_manage),
):
    """Admin/Lead HR: Assign or revoke Recruiter and Interviewer roles for an employee."""
    return AtsService.update_hiring_team_member(
        db,
        company_id,
        employee_id,
        payload.is_recruiter,
        payload.is_interviewer,
        current_user.employee_id,
    )


@router.get("/interviewers")
def get_eligible_interviewers(
    company_id: UUID = Depends(get_company_id),
    db: Session = Depends(get_db),
    _: UserAccount = Depends(require_permissions("ats:interview:assign")),
):
    """Dropdown shows only active employees with the Interviewer role (or Admin)."""
    return AtsService.get_eligible_interviewers(db, company_id)


@router.post("/interviews")
def create_interview(
    payload: CreateInterviewRequest,
    company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(get_current_user),
    db: Session = Depends(get_db),
    _: UserAccount = Depends(require_permissions("ats:interview:assign")),
):
    """Admin/Recruiter: Step 1 - Pick the round for an application (Needs interviewer)."""
    iv = AtsService.create_interview(
        db=db,
        company_id=company_id,
        current_user=current_user,
        application_id=payload.application_id,
        round_name=payload.round_name,
        round_template_id=payload.round_template_id,
        round_number=payload.round_number,
        interview_type=payload.interview_type,
    )
    return {"success": True, "interview_id": str(iv.id), "status": iv.status}


@router.post("/interviews/{interview_id}/assign")
def assign_interviewer(
    interview_id: UUID,
    payload: AssignInterviewerRequest,
    company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(get_current_user),
    db: Session = Depends(get_db),
    _: UserAccount = Depends(require_permissions("ats:interview:assign")),
):
    """Step 2: Recruiter or admin assigns an interviewer (Status -> Assigned)."""
    iv = AtsService.assign_interviewer(
        db=db,
        company_id=company_id,
        current_user=current_user,
        interview_id=interview_id,
        interviewer_employee_id=payload.interviewer_employee_id,
    )
    return {"success": True, "interview_id": str(iv.id), "status": iv.status}


@router.post("/interviews/{interview_id}/slot")
def set_slot_and_confirm(
    interview_id: UUID,
    payload: SetSlotRequest,
    company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(get_current_user),
    db: Session = Depends(get_db),
    _: UserAccount = Depends(require_permissions("ats:interview:view_own")),
):
    """Step 3: Interviewer opens My Interviews, sets slot and confirms (Status -> Confirmed)."""
    iv, has_overlap_warning = AtsService.set_slot_and_confirm(
        db=db,
        company_id=company_id,
        current_user=current_user,
        interview_id=interview_id,
        scheduled_at=payload.scheduled_at,
        duration_minutes=payload.duration_minutes,
        meeting_link_or_location=payload.meeting_link_or_location,
        interview_type=payload.interview_type,
    )
    return {
        "success": True,
        "interview_id": str(iv.id),
        "status": iv.status,
        "overlap_warning": has_overlap_warning,
        "warning_message": "Warning: You have another interview confirmed around the same time." if has_overlap_warning else None,
    }


@router.post("/interviews/{interview_id}/feedback")
def submit_feedback(
    interview_id: UUID,
    payload: SubmitFeedbackRequest,
    company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(get_current_user),
    db: Session = Depends(get_db),
    _: UserAccount = Depends(require_permissions("ats:feedback:submit")),
):
    """Step 5: Interviewer submits feedback (Attended -> Completed, Not attended -> Absent)."""
    fb = AtsService.submit_feedback(
        db=db,
        company_id=company_id,
        current_user=current_user,
        interview_id=interview_id,
        attended=payload.attended,
        rating=payload.rating,
        recommendation=payload.recommendation,
        notes=payload.notes,
    )
    return {"success": True, "feedback_id": str(fb.id), "recommendation": fb.recommendation}


@router.get("/interviews")
def get_admin_interviews(
    tab: str | None = Query(default="ALL"),
    include_history: bool = Query(default=False),
    company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(get_current_user),
    db: Session = Depends(get_db),
    _: UserAccount = Depends(require_permissions("ats:interview:assign")),
):
    """
    Admin Interviews tab:
    Filters: Needs interviewer, Awaiting slot, Confirmed, Feedback pending, Awaiting decision.
    """
    return AtsService.get_admin_interviews(
        db, company_id, current_user, tab_filter=tab, include_history=include_history
    )


@router.get("/my-interviews")
def get_my_interviews(
    company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(get_current_user),
    db: Session = Depends(get_db),
    _: UserAccount = Depends(require_permissions("ats:interview:view_own")),
):
    """Interviewer personal portal: view only interviews assigned to the current user."""
    return AtsService.get_my_interviews(db, company_id, current_user)


# ── Phase 4: Offer and Hired Routes ──────────────────────

@router.post("/applications/{id}/offers", response_model=OfferResponse, status_code=status.HTTP_201_CREATED)
def create_offer(
    id: UUID,
    payload: CreateOfferRequest,
    company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(get_current_user),
    db: Session = Depends(get_db),
    _: UserAccount = Depends(require_permissions("ats:offer:manage")),
):
    """Admin/HR creates a new Offer version for a candidate."""
    return AtsService.create_offer(db, company_id, current_user, id, payload)


@router.get("/applications/{id}/offers")
def get_offers(
    id: UUID,
    company_id: UUID = Depends(get_company_id),
    db: Session = Depends(get_db),
    _: UserAccount = Depends(require_permissions("ats:applicants:view")),
):
    """Fetch all offer versions for an application."""
    return AtsService.get_offers(db, company_id, id)


@router.put("/offers/{id}/status")
def update_offer_status(
    id: UUID,
    payload: UpdateOfferStatusRequest,
    company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(get_current_user),
    db: Session = Depends(get_db),
    _: UserAccount = Depends(require_permissions("ats:offer:manage")),
):
    """Update offer status (Draft -> Approved -> Sent -> Accepted / Declined / Expired / Withdrawn)."""
    offer = AtsService.update_offer_status(
        db,
        company_id,
        current_user,
        id,
        payload.status,
        payload.declined_reason,
        payload.notes,
    )
    return {
        "success": True,
        "offer_id": str(offer.id),
        "status": offer.status,
        "version_number": offer.version_number,
    }


@router.get("/offers/{id}/print-data")
def get_offer_print_data(
    id: UUID,
    company_id: UUID = Depends(get_company_id),
    db: Session = Depends(get_db),
    _: UserAccount = Depends(require_permissions("ats:applicants:view")),
):
    """Fetch structured company, candidate, and compensation data for browser-print offer letter."""
    return AtsService.get_offer_print_data(db, company_id, id)


@router.post("/applications/{id}/convert-to-employee")
def convert_to_employee(
    id: UUID,
    payload: ConvertToEmployeeRequest,
    company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(get_current_user),
    db: Session = Depends(get_db),
    _: UserAccount = Depends(require_permissions("ats:hire:convert")),
):
    """
    Idempotent conversion of Candidate into Employee.
    Creates employee, credentials, leave balances, attaches resume, and marks Hired.
    """
    return AtsService.convert_to_employee(db, company_id, current_user, id, payload)


# ── Careers Page Settings ────────────────────────────────

@router.get("/careers-settings", response_model=CareersSettingsResponse)
def get_careers_settings(
    company_id: UUID = Depends(get_company_id),
    db: Session = Depends(get_db),
    _: UserAccount = Depends(require_permissions("ats:job:manage")),
):
    """Get tenant customization settings for their public careers portal."""
    return AtsService.get_careers_settings(db, company_id)


@router.put("/careers-settings", response_model=CareersSettingsResponse)
def update_careers_settings(
    payload: CareersSettingsUpdate,
    company_id: UUID = Depends(get_company_id),
    db: Session = Depends(get_db),
    _: UserAccount = Depends(require_permissions("ats:job:manage")),
):
    """Update tenant customization settings for their public careers portal."""
    return AtsService.update_careers_settings(db, company_id, payload)


