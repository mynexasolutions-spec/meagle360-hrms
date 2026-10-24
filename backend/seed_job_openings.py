"""
Seed script to populate 11 dynamic Job Openings for Meagle360 Corp.
"""

import sys
import os
import uuid
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
from app.models.department import Department
from app.models.designation import Designation
from app.models.user_account import UserAccount
from app.models.ats import JobOpening

JOBS_DATA = [
    {
        "title": "Frontend Developer",
        "department_name": "Engineering",
        "designation_name": "Frontend Engineer",
        "location": "Bengaluru, India",
        "job_type": "Full-time",
        "experience_range": "2-4 years",
        "number_of_openings": 3,
        "status": "Open",
        "description": "We are seeking a skilled Frontend Developer proficient in modern React.js ecosystem to craft responsive, scalable, and delightful enterprise web applications for our workforce platform.",
        "responsibilities": (
            "• Build and maintain robust user interfaces using React 18, Tailwind CSS, and TypeScript/JavaScript.\n"
            "• Collaborate closely with UI/UX designers, backend architects, and product managers.\n"
            "• Optimize web applications for maximum speed, scalability, and responsiveness across all devices.\n"
            "• Write maintainable, testable, and well-documented modular components."
        ),
        "requirements": (
            "• 2-4 years of hands-on experience in frontend engineering with React.js.\n"
            "• Strong command over modern JavaScript (ES6+), HTML5, CSS3, and responsive styling.\n"
            "• Familiarity with state management libraries (Redux Toolkit, Zustand, Context API).\n"
            "• Experience consuming RESTful APIs and websockets.\n"
            "• Strong analytical and problem-solving skills."
        ),
    },
    {
        "title": "Backend Developer",
        "department_name": "Engineering",
        "designation_name": "Backend Engineer",
        "location": "Bengaluru, India",
        "job_type": "Full-time",
        "experience_range": "3-6 years",
        "number_of_openings": 2,
        "status": "Open",
        "description": "Join our backend team to architect, build, and maintain high-performance microservices, REST APIs, and database models powering our comprehensive HRMS SaaS platform.",
        "responsibilities": (
            "• Architect and develop scalable REST APIs and microservices using Python and FastAPI / PostgreSQL.\n"
            "• Design efficient database schemas, optimize SQL queries, and implement Redis caching layers.\n"
            "• Implement robust multi-tenant authorization, authentication (JWT), and role-based access control (RBAC).\n"
            "• Ensure high availability, code quality, and low latency for mission-critical HR operations."
        ),
        "requirements": (
            "• 3-6 years of experience in backend development using Python (FastAPI/Django/Flask).\n"
            "• Strong proficiency in PostgreSQL, database indexing, and query optimization.\n"
            "• Experience with asynchronous programming, task queues (Celery/Redis), and Docker.\n"
            "• Solid understanding of secure coding practices and API security."
        ),
    },
    {
        "title": "Full Stack Engineer",
        "department_name": "Engineering",
        "designation_name": "Full Stack Developer",
        "location": "Bengaluru, India",
        "job_type": "Full-time",
        "experience_range": "3-5 years",
        "number_of_openings": 2,
        "status": "Open",
        "description": "We are looking for an experienced Full Stack Engineer to drive feature delivery from end to end, bridging intuitive frontend interfaces with scalable backend business services.",
        "responsibilities": (
            "• Design, build, and deploy full-stack features across our React frontend and FastAPI backend.\n"
            "• Integrate third-party webhooks, payments, biometrics, and notification pipelines.\n"
            "• Participate in system architecture reviews and maintain high standards of code hygiene.\n"
            "• Troubleshoot and resolve performance bottlenecks across the entire application stack."
        ),
        "requirements": (
            "• 3-5 years of full-stack engineering experience using React.js and Python / Node.js.\n"
            "• Experience with relational databases like PostgreSQL.\n"
            "• Solid understanding of REST APIs, Git workflows, and CI/CD basics.\n"
            "• Strong sense of product ownership and attention to detail."
        ),
    },
    {
        "title": "UI/UX Designer",
        "department_name": "Design",
        "designation_name": "Product Designer",
        "location": "Bengaluru, India",
        "job_type": "Full-time",
        "experience_range": "2-5 years",
        "number_of_openings": 1,
        "status": "Open",
        "description": "We are hiring a passionate UI/UX Designer to craft intuitive, accessible, and elegant enterprise experiences for our desktop and mobile web workforce suites.",
        "responsibilities": (
            "• Create wireframes, user journeys, prototypes, and high-fidelity production designs in Figma.\n"
            "• Maintain, evolve, and document our Meagle360 design system components.\n"
            "• Conduct user interviews, collect feedback from HR administrators, and iterate on usability.\n"
            "• Partner closely with frontend engineers to guarantee design integrity in live releases."
        ),
        "requirements": (
            "• 2-5 years of professional UI/UX design experience for web and mobile products.\n"
            "• Strong portfolio highlighting complex SaaS dashboards, user workflows, and typography.\n"
            "• Mastery of Figma, auto-layout, design tokens, and interactive components.\n"
            "• Empathy for enterprise workflows and clean visual aesthetic."
        ),
    },
    {
        "title": "DevOps & Cloud Engineer",
        "department_name": "Engineering",
        "designation_name": "DevOps Engineer",
        "location": "Bengaluru, India",
        "job_type": "Full-time",
        "experience_range": "3-6 years",
        "number_of_openings": 2,
        "status": "Open",
        "description": "We are looking for a DevOps & Cloud Engineer to scale our cloud infrastructure, manage CI/CD deployment pipelines, and ensure high reliability, security, and automated observability.",
        "responsibilities": (
            "• Manage and scale AWS / Cloud infrastructure using Docker and container orchestration.\n"
            "• Automate CI/CD release pipelines for seamless zero-downtime updates.\n"
            "• Set up comprehensive system telemetry, centralized logging, and proactive alerting.\n"
            "• Maintain rigorous security compliance, automated backups, and disaster recovery drills."
        ),
        "requirements": (
            "• 3-6 years of experience in DevOps, Cloud Engineering, or Site Reliability.\n"
            "• Hands-on expertise with AWS services (EC2, S3, RDS, CloudFront), Linux, and Docker.\n"
            "• Experience setting up Nginx, SSL termination, and PostgreSQL administration.\n"
            "• Familiarity with Infrastructure as Code (Terraform) is a plus."
        ),
    },
    {
        "title": "Data Analyst",
        "department_name": "Data & Analytics",
        "designation_name": "Data Analyst Intern",
        "location": "Bengaluru, India",
        "job_type": "Internship",
        "experience_range": "0-1 years",
        "number_of_openings": 2,
        "status": "Open",
        "description": "Kickstart your career in Data Analytics with our HR tech team. You will analyze workforce trends, generate KPI dashboards, and extract insights to empower people management decisions.",
        "responsibilities": (
            "• Extract and transform HRMS operational data using SQL and Python (Pandas).\n"
            "• Create intuitive visualization dashboards tracking employee turnover, attendance, and payroll trends.\n"
            "• Audit data integrity and prepare scheduled monthly organizational reports.\n"
            "• Assist product leadership with statistical hypothesis testing and feature utilization analysis."
        ),
        "requirements": (
            "• Recent graduate or final year student in Computer Science, Statistics, Mathematics, or related field.\n"
            "• Strong command of SQL queries, joins, aggregations, and window functions.\n"
            "• Basic knowledge of Python for data manipulation and visualization (Pandas, Matplotlib/Seaborn).\n"
            "• Eagerness to learn, strong attention to detail, and good communication skills."
        ),
    },
    {
        "title": "AI / ML Engineer",
        "department_name": "AI Labs",
        "designation_name": "Machine Learning Engineer",
        "location": "Bengaluru, India",
        "job_type": "Full-time",
        "experience_range": "2-5 years",
        "number_of_openings": 1,
        "status": "Open",
        "description": "Join our AI Labs to build next-generation smart workforce features, including biometric facial recognition attendance verification, AI resume parsing, and conversational HR agents.",
        "responsibilities": (
            "• Develop and optimize computer vision models for secure facial biometric verification and anti-spoofing.\n"
            "• Integrate Large Language Models (LLMs) and vector embeddings for AI assistant and semantic search.\n"
            "• Optimize model inference latency for edge devices and cloud microservices.\n"
            "• Evaluate and monitor model performance, precision-recall metrics, and ethical fairness."
        ),
        "requirements": (
            "• 2-5 years of practical experience with Machine Learning, Deep Learning, and Computer Vision.\n"
            "• Proficiency in Python, PyTorch/TensorFlow, OpenCV, and ONNX Runtime.\n"
            "• Experience deploying models into production via FastAPI or containerized endpoints.\n"
            "• Knowledge of biometric face embeddings or modern LLM prompt engineering/RAG."
        ),
    },
    {
        "title": "HR Generalist",
        "department_name": "People & Culture",
        "designation_name": "HR Specialist",
        "location": "Bengaluru, India",
        "job_type": "Full-time",
        "experience_range": "2-4 years",
        "number_of_openings": 2,
        "status": "Open",
        "description": "We are seeking an empathetic and driven HR Generalist to lead talent acquisition, streamline employee onboarding, champion engagement activities, and foster an exceptional team culture.",
        "responsibilities": (
            "• Coordinate end-to-end recruitment pipelines from job posting to offer generation.\n"
            "• Facilitate smooth onboarding and orientation programs for new hires.\n"
            "• Handle employee queries regarding leaves, policies, attendance, and benefits.\n"
            "• Organize culture initiatives, pulse surveys, and team engagement events."
        ),
        "requirements": (
            "• 2-4 years of experience as an HR Generalist or Talent Acquisition Specialist.\n"
            "• Solid understanding of HR operations, employment laws, and statutory compliance.\n"
            "• Exceptional interpersonal, verbal, and written communication skills.\n"
            "• Ability to handle sensitive and confidential information with high integrity."
        ),
    },
    {
        "title": "Product Manager (HR Tech)",
        "department_name": "Product",
        "designation_name": "Product Manager",
        "location": "Bengaluru, India",
        "job_type": "Full-time",
        "experience_range": "4-7 years",
        "number_of_openings": 1,
        "status": "Open",
        "description": "Drive the vision, strategy, and execution of Meagle360 HRMS modules. You will collaborate with engineering, design, and sales to launch customer-obsessed features that redefine workforce software.",
        "responsibilities": (
            "• Define product vision, create data-backed roadmaps, and author clear PRDs and user stories.\n"
            "• Run discovery interviews with HR leaders to uncover unarticulated workflow pain points.\n"
            "• Lead agile sprint ceremonies in partnership with engineering and design leads.\n"
            "• Measure product adoption KPIs and iterate rapidly based on user telemetry."
        ),
        "requirements": (
            "• 4-7 years of Product Management experience, preferably in B2B SaaS or HR/payroll tech.\n"
            "• Proven track record of taking complex features from concept to successful market launch.\n"
            "• Strong technical fluency to communicate effectively with engineering architects.\n"
            "• Analytical mindset with data-driven decision-making abilities."
        ),
    },
    {
        "title": "Mobile App Developer",
        "department_name": "Mobile Engineering",
        "designation_name": "Mobile Engineer",
        "location": "Bengaluru, India",
        "job_type": "Full-time",
        "experience_range": "2-5 years",
        "number_of_openings": 1,
        "status": "Open",
        "description": "Help us build the premier mobile companion app for employees and managers, featuring offline-first geo-attendance, face check-in, leaves, and notifications on iOS and Android.",
        "responsibilities": (
            "• Build and maintain high-performance mobile applications using React Native or Flutter.\n"
            "• Integrate native device capabilities: GPS geofencing, camera biometrics, and push notifications.\n"
            "• Implement robust offline data synchronization with local SQLite/WatermelonDB.\n"
            "• Ensure 60fps smooth animations and intuitive tactile UI interactions."
        ),
        "requirements": (
            "• 2-5 years of experience building and releasing cross-platform iOS & Android applications.\n"
            "• Proficiency in React Native / Flutter and modern TypeScript/Dart.\n"
            "• Experience with background geolocation services and offline-first architectures.\n"
            "• Apps published on Google Play Store or Apple App Store."
        ),
    },
    {
        "title": "Product Marketing Specialist",
        "department_name": "Marketing",
        "designation_name": "Marketing Specialist",
        "location": "Bengaluru, India",
        "job_type": "Full-time",
        "experience_range": "2-4 years",
        "number_of_openings": 1,
        "status": "Open",
        "description": "Lead product positioning, customer case studies, feature release communications, and go-to-market storytelling for our fast-growing enterprise HRMS suite.",
        "responsibilities": (
            "• Craft compelling product positioning, value propositions, and customer success narratives.\n"
            "• Produce high-impact feature release notes, blog posts, whitepapers, and product guides.\n"
            "• Plan and execute digital marketing campaigns, webinars, and email newsletters.\n"
            "• Analyze campaign ROI and conversion funnels to refine go-to-market strategies."
        ),
        "requirements": (
            "• 2-4 years of experience in B2B SaaS product marketing or content strategy.\n"
            "• Outstanding written and verbal storytelling capabilities in English.\n"
            "• Experience with SEO, HubSpot/Mailchimp, Google Analytics, and Canva/Figma.\n"
            "• Proactive self-starter with enthusiasm for high-growth tech environments."
        ),
    },
]

def seed_jobs():
    db = SessionLocal()
    try:
        # Find Meagle360 company
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

        # Find or create admin user for created_by
        admin_user = (
            db.query(UserAccount)
            .filter(UserAccount.company_id == company.id)
            .first()
        )
        user_id = admin_user.id if admin_user else None

        # Fetch existing departments & designations for linking
        dept_map = {d.name.lower(): d for d in db.query(Department).filter(Department.company_id == company.id).all()}
        desig_map = {d.title.lower(): d for d in db.query(Designation).filter(Designation.company_id == company.id).all()}

        inserted_count = 0
        updated_count = 0

        for item in JOBS_DATA:
            dept_obj = dept_map.get(item["department_name"].lower())
            desig_obj = desig_map.get(item["designation_name"].lower())

            # Check if job with same title & company already exists
            existing_job = (
                db.query(JobOpening)
                .filter(
                    JobOpening.company_id == company.id,
                    JobOpening.title == item["title"],
                )
                .first()
            )

            if existing_job:
                existing_job.department_id = dept_obj.id if dept_obj else existing_job.department_id
                existing_job.department_name = item["department_name"]
                existing_job.designation_id = desig_obj.id if desig_obj else existing_job.designation_id
                existing_job.designation_name = item["designation_name"]
                existing_job.number_of_openings = item["number_of_openings"]
                existing_job.description = item["description"]
                existing_job.responsibilities = item["responsibilities"]
                existing_job.requirements = item["requirements"]
                existing_job.location = item["location"]
                existing_job.job_type = item["job_type"]
                existing_job.status = item["status"]
                existing_job.experience_range = item["experience_range"]
                updated_count += 1
                print(f"Updated existing job: {item['title']}")
            else:
                new_job = JobOpening(
                    id=uuid.uuid4(),
                    company_id=company.id,
                    title=item["title"],
                    department_id=dept_obj.id if dept_obj else None,
                    department_name=item["department_name"],
                    designation_id=desig_obj.id if desig_obj else None,
                    designation_name=item["designation_name"],
                    number_of_openings=item["number_of_openings"],
                    description=item["description"],
                    responsibilities=item["responsibilities"],
                    requirements=item["requirements"],
                    location=item["location"],
                    job_type=item["job_type"],
                    status=item["status"],
                    experience_range=item["experience_range"],
                    created_by_id=user_id,
                )
                db.add(new_job)
                inserted_count += 1
                print(f"Inserted new job: {item['title']}")

        db.commit()
        print(f"\nSUCCESS! Seeded jobs for {company.name}: {inserted_count} inserted, {updated_count} updated.")

    except Exception as e:
        db.rollback()
        print(f"ERROR seeding jobs: {e}")
        raise
    finally:
        db.close()

if __name__ == "__main__":
    seed_jobs()
