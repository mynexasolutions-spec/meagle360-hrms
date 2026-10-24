"""
Seed script to populate 7 realistic sample applicants with resumes from Downloads/resumes-sample.
"""

import sys
import os
import uuid
from decimal import Decimal
from datetime import datetime, timezone
from dotenv import load_dotenv

# Ensure backend root is on sys.path
backend_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, backend_dir)

# Explicitly load backend/.env
env_path = os.path.join(backend_dir, ".env")
load_dotenv(env_path)

from app.database import SessionLocal
from app.models.company import Company
from app.models.ats import Candidate, Application, ApplicationActivity, JobOpening, Stage
from app.services.ats_file_service import compress_pdf_bytes, upload_resume_to_imagekit, validate_pdf_content
import asyncio

APPLICANTS_DATA = [
    {
        "full_name": "Rohan Sharma",
        "email": "rohan.sharma@example.com",
        "phone": "+91 98765 43210",
        "current_location": "Bengaluru, India",
        "years_of_experience": 3.5,
        "job_title": "Frontend Developer",
        "resume_filename": "Amsterdam-Modern-Resume-Template.pdf",
        "cover_note": "Passionate React developer with 3.5 years of experience building scalable, responsive UI components and state management architectures.",
    },
    {
        "full_name": "Aarav Patel",
        "email": "aarav.patel@example.com",
        "phone": "+91 98234 56789",
        "current_location": "Pune, India",
        "years_of_experience": 2.5,
        "job_title": "Frontend Developer",
        "resume_filename": "Sydney-Resume-Template-Modern.pdf",
        "cover_note": "Frontend engineer specializing in modern React 18, Tailwind CSS, and performant web workflows.",
    },
    {
        "full_name": "Pooja Verma",
        "email": "pooja.verma@example.com",
        "phone": "+91 99123 45678",
        "current_location": "Bengaluru, India",
        "years_of_experience": 4.0,
        "job_title": "Backend Developer",
        "resume_filename": "Dublin-Resume-Template-Modern.pdf",
        "cover_note": "Backend developer with 4 years building high-concurrency Python/FastAPI microservices and PostgreSQL schemas.",
    },
    {
        "full_name": "Ananya Iyer",
        "email": "ananya.iyer@example.com",
        "phone": "+91 97654 32109",
        "current_location": "Mumbai, India",
        "years_of_experience": 3.0,
        "job_title": "UI/UX Designer",
        "resume_filename": "Ux-designer-resume-example-5.pdf",
        "cover_note": "Product and UI/UX designer focused on enterprise design systems, Figma workflows, and user empathy.",
    },
    {
        "full_name": "Vikram Malhotra",
        "email": "vikram.malhotra@example.com",
        "phone": "+91 98450 12345",
        "current_location": "Gurugram, India",
        "years_of_experience": 5.0,
        "job_title": "Product Manager (HR Tech)",
        "resume_filename": "New-York-Resume-Template-Creative.pdf",
        "cover_note": "Product manager with 5 years experience scaling B2B SaaS products and driving cross-functional agile teams.",
    },
    {
        "full_name": "Neha Singhania",
        "email": "neha.singhania@example.com",
        "phone": "+91 98112 34567",
        "current_location": "Delhi NCR, India",
        "years_of_experience": 3.2,
        "job_title": "HR Generalist",
        "resume_filename": "Personal-trainer-resume-example-3.pdf",
        "cover_note": "HR Generalist passionate about employee onboarding, talent acquisition, people engagement, and organizational culture.",
    },
    {
        "full_name": "Kunal Deshmukh",
        "email": "kunal.deshmukh@example.com",
        "phone": "+91 98901 23456",
        "current_location": "Hyderabad, India",
        "years_of_experience": 4.5,
        "job_title": "Product Marketing Specialist",
        "resume_filename": "Account-Manager-Example-1-PDF.pdf",
        "cover_note": "Results-oriented Product Marketing & Client Relationship specialist skilled in storytelling, content strategy, and GTM execution.",
    },
]

async def seed_applicants():
    # Resolve resumes folder
    user_home = os.environ.get("USERPROFILE") or os.path.expanduser("~")
    resumes_dir = os.path.join(user_home, "Downloads", "resumes-sample")
    
    if not os.path.exists(resumes_dir):
        # Fallback to local copy or current directory
        alt_dir = os.path.join(backend_dir, "resumes-sample")
        if os.path.exists(alt_dir):
            resumes_dir = alt_dir
        else:
            print(f"ERROR: Resumes directory not found at {resumes_dir}")
            return

    print(f"Using resumes source directory: {resumes_dir}")

    db = SessionLocal()
    try:
        # 1. Resolve Company
        company = (
            db.query(Company)
            .filter((Company.name.ilike("%meagle%")) | (Company.subdomain == "meagle360"))
            .first()
        )
        if not company:
            company = db.query(Company).first()

        if not company:
            print("ERROR: No company found in DB!")
            return

        print(f"Target Company: {company.name} (ID: {company.id}, Subdomain: {company.subdomain})")

        # 2. Resolve initial stage
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

        print(f"Target Initial Stage: {initial_stage.name} (ID: {initial_stage.id})")

        # 3. Process each applicant
        processed_count = 0
        skipped_count = 0

        for applicant_data in APPLICANTS_DATA:
            full_name = applicant_data["full_name"]
            email = applicant_data["email"].strip().lower()
            job_title = applicant_data["job_title"]
            resume_name = applicant_data["resume_filename"]

            # Match Job Opening
            job = (
                db.query(JobOpening)
                .filter(
                    JobOpening.company_id == company.id,
                    JobOpening.title.ilike(job_title),
                )
                .first()
            )
            if not job:
                # Try fallback substring match or take first open job
                job = (
                    db.query(JobOpening)
                    .filter(
                        JobOpening.company_id == company.id,
                        JobOpening.title.ilike(f"%{job_title[:8]}%"),
                    )
                    .first()
                )
            if not job:
                print(f"WARNING: Job '{job_title}' not found for company. Skipping applicant {full_name}.")
                skipped_count += 1
                continue

            # Check if file exists
            resume_path = os.path.join(resumes_dir, resume_name)
            if not os.path.exists(resume_path):
                print(f"WARNING: Resume file {resume_name} not found in {resumes_dir}. Skipping.")
                skipped_count += 1
                continue

            with open(resume_path, "rb") as f:
                file_bytes = f.read()

            is_valid, err_msg = validate_pdf_content(file_bytes)
            if not is_valid:
                print(f"WARNING: File {resume_name} is not a valid PDF ({err_msg}). Skipping.")
                skipped_count += 1
                continue

            # Compress PDF
            compressed_bytes = compress_pdf_bytes(file_bytes)

            # Upload to ImageKit or fallback storage
            upload_res = await upload_resume_to_imagekit(
                file_bytes=compressed_bytes,
                original_filename=resume_name,
                tenant_id=company.id,
            )

            # Find or create Candidate
            candidate = (
                db.query(Candidate)
                .filter(Candidate.company_id == company.id, Candidate.email == email)
                .first()
            )
            if not candidate:
                candidate = Candidate(
                    id=uuid.uuid4(),
                    company_id=company.id,
                    email=email,
                    full_name=full_name,
                    phone=applicant_data["phone"],
                    current_location=applicant_data["current_location"],
                    years_of_experience=Decimal(str(applicant_data["years_of_experience"])),
                )
                db.add(candidate)
                db.flush()
            else:
                candidate.full_name = full_name
                candidate.phone = applicant_data["phone"]
                candidate.current_location = applicant_data["current_location"]
                candidate.years_of_experience = Decimal(str(applicant_data["years_of_experience"]))

            # Check if application already exists for candidate + job
            existing_app = (
                db.query(Application)
                .filter(Application.candidate_id == candidate.id, Application.job_id == job.id)
                .first()
            )
            if existing_app:
                print(f"NOTICE: Application already exists for {full_name} -> {job.title}. Updating resume.")
                existing_app.resume_file_id = upload_res.get("file_id")
                existing_app.resume_path = upload_res.get("file_path")
                existing_app.resume_file_name = upload_res.get("file_name")
                existing_app.cover_note = applicant_data["cover_note"]
            else:
                new_app = Application(
                    id=uuid.uuid4(),
                    company_id=company.id,
                    candidate_id=candidate.id,
                    job_id=job.id,
                    stage_id=initial_stage.id,
                    resume_file_id=upload_res.get("file_id"),
                    resume_path=upload_res.get("file_path"),
                    resume_file_name=upload_res.get("file_name"),
                    cover_note=applicant_data["cover_note"],
                    source="careers_page",
                )
                db.add(new_app)
                db.flush()

                # Add Application Activity log
                activity = ApplicationActivity(
                    id=uuid.uuid4(),
                    company_id=company.id,
                    application_id=new_app.id,
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

            processed_count += 1
            print(f"SUCCESS: [{processed_count}/7] Added/Updated applicant '{full_name}' for job '{job.title}' with resume '{resume_name}'.")

        db.commit()
        print(f"\nALL DONE! Successfully processed {processed_count} applicants (Skipped: {skipped_count}).")

    except Exception as e:
        db.rollback()
        print(f"FATAL ERROR during seeding: {e}")
        import traceback
        traceback.print_exc()
        raise
    finally:
        db.close()

if __name__ == "__main__":
    asyncio.run(seed_applicants())
