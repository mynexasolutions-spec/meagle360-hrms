# ATS: resume parsing and job-match score (context + task for Claude Code)

## How to use this file

Read this whole file first. **Do not change any code yet.** Start with the "Step 1: investigate and report" section, then wait for my approval before implementing anything.

## Project context

- Meagle360 HRMS: multi-tenant SaaS (subdomain per tenant). Backend: FastAPI, SQLAlchemy, PostgreSQL, Alembic. Frontend: React + Vite.
- The ATS module is already built: Job Openings, public careers page (`/careers/page`), Applicants (table and Kanban), application detail drawer, interviews, offers, hire-to-employee conversion.
- Applicants flow through stages: Applied → Screening → Interview → Offer → Hired, plus Rejected.
- Resumes: PDF only, stored as private files in ImageKit. Candidates and applications are separate (one candidate can have many applications).
- Roles: org admin, recruiter, interviewer (assigned to existing employees). Permissions are checked in the backend.
- An AI assistant feature for org admins is planned or in progress and was leaning towards a free-tier LLM such as Groq. Reuse any existing LLM client if one exists.

## Goal

1. Parse each uploaded resume into structured data (skills, experience, education, past roles, contact details).
2. Compute a **job-match score** for each application against the job opening's requirements, with a breakdown that HR can understand.

UI placement (from the application detail drawer, Screening stage):
- A "Match 78%" badge next to the stage in the drawer header.
- A full-width **Match card** between "Candidate information" and "Pipeline actions": matched skills (green chips), missing skills (grey chips), experience fit, "last scored" time and a Re-score button.
- Later: a sortable and filterable Match column in the Applicants table, and a small badge on Kanban cards.

## Rules (non-negotiable)

1. **Advisory only.** The score never auto-rejects, auto-moves a stage or blocks anything. HR decides.
2. **No bias inputs.** Scoring must not use name, gender, age, photo, college name or location. Only job-relevant skills, experience and education.
3. **Visibility:** admin and recruiter see the score. Interviewers do not.
4. **The final number is computed in code**, not by the LLM. The LLM may judge each requirement (present / partial / absent, with a short evidence snippet), and code applies the weights.
5. **Never show 0 when scoring failed.** Show "Score unavailable" with the reason (parse failed, no requirements on the job, scanned PDF).
6. **Parsing runs in the background.** An application must be saved even if parsing fails. Do not block the apply form.
7. **Privacy:** do not write resume text to logs. Keep the LLM provider behind an abstraction so it can be swapped. Allow parsing to be turned off per tenant.
8. Keep user-entered form data and parsed data separate. Never overwrite what the candidate typed.

## Design

**Parsing (hybrid):**
- Extract text from the PDF (PyMuPDF or pdfplumber).
- Email and phone by regex.
- Everything else (name, skills, experience entries with date ranges, education, summary) by LLM with a JSON schema, validated with Pydantic. Prompt: extract only what is present in the resume, do not infer.
- Compute total experience in code from the date ranges.
- Normalize skills with a small synonym map (React / ReactJS / React.js are one skill).
- If the extracted text is empty or very short (scanned PDF), mark the parse as failed with a clear reason. OCR is out of scope for now.

**Job requirements:** the Job Opening needs structured fields: `required_skills`, `preferred_skills`, `min_experience`, optional education. Suggest an LLM draft from the job description when HR saves a job, and HR confirms or edits it.

**Scoring (starting weights, configurable later):** required skills 60%, preferred skills 15%, experience fit 25%.
- Phase 1 uses rule-based skill overlap.
- Phase 2 adds LLM per-requirement judgment with evidence.

**Data:**
- `resume_parses`: `application_id` (or resume file id), `status` (pending / done / failed), `failure_reason`, `parsed_json` (JSONB), `parser_version`, timestamps.
- `application_match_scores`: `application_id`, `score`, `breakdown` (JSONB: matched, missing, experience fit, evidence), `job_requirements_version`, `parser_version`, `scorer_version`, `status`, `computed_at`.
- If job requirements change, existing scores become "outdated" and can be re-scored.

## Step 1: investigate and report (read-only)

Read the codebase and answer these, with file paths:

1. Where are the ATS models, services, routes and the frontend components (application drawer, Applicants table, Kanban card)?
2. Does `job_openings` already have structured skill and experience fields, or only free text?
3. How are resumes stored, and how can the backend read the PDF bytes for parsing (ImageKit private files)?
4. Is there an existing background-task mechanism (FastAPI BackgroundTasks, a queue, a worker)? What is the simplest reliable option here?
5. Is there an existing LLM client or config (for example from the AI assistant work)? Which provider and env vars?
6. How are recruiter, admin and interviewer permissions defined and enforced, so score visibility can follow them?
7. What are the Alembic and testing conventions?
8. Does the application drawer have a natural place for the Match card and badge as described above?

Then give me a report:
- Feasibility of each phase below, with any blockers or risks you found.
- Files you would change or add per phase.
- Anything in this spec that conflicts with the existing code or should be changed.
- Open questions for me.

**Stop after the report and wait for my approval.**

## Phases (after approval)

1. **Parsing:** text extraction, regex fields, LLM structured extraction, `resume_parses`, background job, "parse failed" states. Show a parsed summary on the application detail.
2. **Requirements and rule-based score:** structured fields on Job Opening (with LLM-suggested draft), rule-based skill overlap, `application_match_scores`, Match card and header badge.
3. **LLM per-requirement judgment:** present / partial / absent with evidence, code-side weighting, Re-score, outdated handling.
4. **List and board:** sortable Match column, minimum-score filter, Kanban badge.

## How we will check accuracy

Take 30 to 50 real applications of different resume formats. For parsing, check each field separately (email, phone, skills, experience years). For scoring, check whether candidates the recruiter shortlisted score higher than the rest. One overall "accuracy %" is not meaningful.
