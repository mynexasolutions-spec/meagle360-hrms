"""Resume parse + match-score jobs and the payload the API returns.

Runs in-process, like selfie verification. Jobs are started with FastAPI
BackgroundTasks after the response is sent, so an upload is never blocked.
The job functions are sync and open their own DB session (the request's
session is closed by then). A semaphore lets only one parse run at a time
so a burst of applications cannot starve the API on a 2-vCPU box.

Parsing is expensive and done once per resume; scoring is cheap and is
redone whenever the job's requirements or the recruiter's corrections
change. Every query is scoped by company_id.

Results made by an older parser or scorer (e.g. before the taxonomy grew)
are brought up to date lazily by refresh_if_outdated() when a recruiter
opens the application. The stored resume text is re-parsed, so the PDF is
not downloaded again.

A failure only sets parse_status = 'failed' with a short reason; it never
touches the rest of the application."""

import logging
import threading
from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models.ats import Application, JobOpening
from app.services.resume.parser import PARSER_VERSION, parse_resume_text
from app.services.resume.scorer import SCORE_VERSION, score_application
from app.services.resume.skills import canonical_skill_list
from app.services.resume.text_extract import ExtractionUnavailable, NoTextLayer, extract_text

logger = logging.getLogger(__name__)

_parse_slot = threading.BoundedSemaphore(1)
STALE_AFTER = timedelta(minutes=10)
# Fields of a job opening that change the score when edited
SCORE_FIELDS = {"required_skills", "preferred_skills", "min_experience_years",
                "title", "description", "responsibilities", "requirements"}
OVERRIDE_KEYS = ("skills", "total_experience_years", "education", "location")


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ── Scoring ───────────────────────────────────────────────

def apply_score(db: Session, app: Application) -> None:
    """(Re)compute the match score for an already parsed application."""
    if app.parse_status != "done" or not app.parsed_data:
        return
    job = (db.query(JobOpening)
           .filter(JobOpening.id == app.job_id, JobOpening.company_id == app.company_id)
           .first())
    if not job:
        return
    cand = app.candidate
    form_years = (float(cand.years_of_experience)
                  if cand is not None and cand.years_of_experience is not None else None)
    result = score_application(job, app.parsed_data, app.parsed_overrides, form_years,
                               declared_skills=getattr(app, "declared_skills", None))
    app.match_score = result["score"]
    app.match_breakdown = result["breakdown"]
    app.scored_at = _now()
    app.score_version = SCORE_VERSION


def rescore_job(company_id: UUID, job_id: UUID) -> None:
    """Background job: rescore every parsed application of one job."""
    db = SessionLocal()
    try:
        apps = (db.query(Application)
                .filter(Application.company_id == company_id, Application.job_id == job_id,
                        Application.parse_status == "done")
                .all())
        for app in apps:
            apply_score(db, app)
        db.commit()
    except Exception:
        db.rollback()
        logger.exception("Rescoring applications of job %s failed", job_id)
    finally:
        db.close()


def refresh_if_outdated(db: Session, app: Application) -> bool:
    """Re-parse (from the stored text) and/or rescore an application whose
    results came from an older parser or scorer. Returns True if it changed
    anything; the caller commits."""
    if app.parse_status != "done" or not app.parsed_data:
        return False
    changed = False
    text = app.parsed_data.get("text")
    if (app.parser_version or 0) < PARSER_VERSION and text:
        app.parsed_data = parse_resume_text(text)
        app.parser_version = PARSER_VERSION
        changed = True
    if changed or (app.score_version or 0) < SCORE_VERSION:
        apply_score(db, app)
        changed = True
    return changed


# ── Parsing ───────────────────────────────────────────────

def mark_pending(app: Application) -> None:
    app.parse_status = "pending"
    app.parse_error = None


def _fail(db: Session, application_id: UUID, company_id: UUID, reason: str) -> None:
    db.rollback()
    app = (db.query(Application)
           .filter(Application.id == application_id, Application.company_id == company_id)
           .first())
    if app:
        app.parse_status = "failed"
        app.parse_error = reason[:255]
        db.commit()


def run_parse(application_id: UUID, company_id: UUID, pdf_bytes: bytes) -> None:
    """Background job: extract, parse and score one resume."""
    with _parse_slot:
        db = SessionLocal()
        try:
            app = (db.query(Application)
                   .filter(Application.id == application_id, Application.company_id == company_id)
                   .first())
            if not app:
                return
            app.parse_status = "processing"
            db.commit()
            try:
                parsed = parse_resume_text(extract_text(pdf_bytes))
            except NoTextLayer as exc:
                return _fail(db, application_id, company_id, str(exc))
            except ExtractionUnavailable:
                return _fail(db, application_id, company_id, "Resume parser is not installed on the server.")
            except Exception:
                logger.exception("Resume parse failed for application %s", application_id)
                return _fail(db, application_id, company_id, "This resume could not be read.")

            app.parsed_data = parsed
            app.parsed_at = _now()
            app.parser_version = PARSER_VERSION
            app.parse_status = "done"
            app.parse_error = None
            apply_score(db, app)
            db.commit()
        except Exception:
            logger.exception("Resume parse job crashed for application %s", application_id)
            try:
                _fail(db, application_id, company_id, "Unexpected error while parsing.")
            except Exception:
                logger.exception("Could not mark application %s as failed", application_id)
        finally:
            db.close()


def sweep_stale(db: Session) -> int:
    """Mark parses that never finished (e.g. the server restarted) as failed
    so the UI offers a re-scan instead of spinning forever."""
    cutoff = _now() - STALE_AFTER
    stale = (db.query(Application)
             .filter(Application.parse_status.in_(("pending", "processing")),
                     Application.updated_at < cutoff)
             .all())
    for app in stale:
        app.parse_status = "failed"
        app.parse_error = "Parsing was interrupted. Click Re-scan to try again."
    if stale:
        db.commit()
    return len(stale)


def start_sweeper(stop: threading.Event, every_seconds: int = 300) -> threading.Thread:
    def loop():
        while True:
            try:
                with SessionLocal() as db:
                    sweep_stale(db)
            except Exception:
                logger.exception("Resume parse sweeper failed")
            if stop.wait(every_seconds):
                return

    thread = threading.Thread(target=loop, name="resume-parse-sweeper", daemon=True)
    thread.start()
    return thread


# ── Recruiter corrections ─────────────────────────────────

def save_overrides(db: Session, app: Application, changes: dict) -> None:
    overrides = dict(app.parsed_overrides or {})
    for key in OVERRIDE_KEYS:
        if key not in changes:
            continue
        value = changes[key]
        if key == "skills" and value is not None:
            value = canonical_skill_list(value)
        if value is None:
            overrides.pop(key, None)
        else:
            overrides[key] = value
    app.parsed_overrides = overrides or None
    apply_score(db, app)


# ── API payload ───────────────────────────────────────────

def match_payload(app: Application) -> dict:
    """Parse/score info for the application detail response. The full
    resume text is left out (it can be large and the PDF is viewable)."""
    parsed = dict(app.parsed_data or {})
    parsed.pop("text", None)
    parsed.pop("skill_mentions", None)
    return {
        "parse_status": app.parse_status,
        "parse_error": app.parse_error,
        "parsed_at": app.parsed_at.isoformat() if app.parsed_at else None,
        "match_score": float(app.match_score) if app.match_score is not None else None,
        "match_breakdown": app.match_breakdown,
        "parsed": parsed or None,
        "overrides": app.parsed_overrides or {},
        "declared_skills": getattr(app, "declared_skills", None) or [],
    }
