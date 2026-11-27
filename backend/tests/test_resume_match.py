"""Resume parsing + match score: extraction, parser, skills, scorer, job wiring.

Sample PDFs are generated with reportlab inside the tests, so no real
candidate resume is committed to the repo."""

import uuid
from datetime import date
from decimal import Decimal
from io import BytesIO
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

from app.services.resume import match_service
from app.services.resume.parser import estimate_experience, extract_education, parse_resume_text, split_sections
from app.services.resume.scorer import score_application, text_similarity
from app.services.resume.skills import canonical_skill_list, get_taxonomy, suggest_skills
from app.services.resume.text_extract import NoTextLayer, extract_text

TODAY = date(2026, 11, 27)


# ── PDF fixtures ──────────────────────────────────────────

def _pdf(draw) -> bytes:
    from reportlab.lib.pagesizes import A4
    from reportlab.pdfgen import canvas
    buf = BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    draw(c, *A4)
    c.save()
    return buf.getvalue()


def _lines(c, x, y, lines, size=10, gap=14):
    c.setFont("Helvetica", size)
    for line in lines:
        c.drawString(x, y, line)
        y -= gap
    return y


SIDEBAR = ["CONTACT", "priya.sharma@example.com", "+91 98765 43210", "Pune, India", "",
           "SKILLS", "ReactJS", "Node", "PostgreSQL", "Docker", "Tailwind", "Git", "",
           "EDUCATION", "B.Tech Computer Science", "VIT University", "2014 - 2018"]
MAIN = ["PROFESSIONAL SUMMARY", "Full stack developer building SaaS products for HR teams.", "",
        "WORK EXPERIENCE", "Senior Software Engineer, Acme Labs", "Jan 2022 - Present",
        "Built REST APIs with Express and led the React frontend.", "Moved services to AWS with Docker.",
        "Software Engineer, Beta Corp", "Jul 2018 - Dec 2021",
        "Developed dashboards with React and Redux.", "Wrote unit tests with Jest."]


def two_column_pdf() -> bytes:
    def draw(c, w, h):
        c.setFont("Helvetica-Bold", 18)
        c.drawString(w / 2 - 60, h - 50, "PRIYA SHARMA")
        _lines(c, 40, h - 100, SIDEBAR)          # left sidebar, x 40..~190
        _lines(c, 230, h - 100, MAIN, size=9)    # main column, x 230..~560
    return _pdf(draw)


def one_column_pdf() -> bytes:
    def draw(c, w, h):
        c.setFont("Helvetica-Bold", 16)
        c.drawString(50, h - 50, "Rahul Verma")
        lines = ["rahul.verma@example.com | +91 91234 56789", "", "SKILLS",
                 "Python, Django, FastAPI, PostgreSQL, Redis, Docker, Linux", "", "EXPERIENCE",
                 "Backend Engineer at Gamma Tech (Mar 2020 - Present)",
                 "Designed microservices and REST APIs used by 2 million users across the country.",
                 "Intern at Delta Soft (Jun 2019 - Feb 2020)",
                 "Automated reports with Python and Pandas for the finance team every week.", "",
                 "EDUCATION", "B.E. Information Technology, Pune University, 2019"]
        _lines(c, 50, h - 80, lines)
    return _pdf(draw)


def blank_pdf() -> bytes:
    return _pdf(lambda c, w, h: c.rect(50, 50, 100, 100))


# ── Text extraction ───────────────────────────────────────

def test_two_column_text_does_not_mix_columns():
    text = extract_text(two_column_pdf())
    lines = [l for l in text.splitlines() if l.strip()]
    # The sidebar and the main column each come out as one unbroken block
    sidebar = [l for l in SIDEBAR if l]
    main = [l for l in MAIN if l]
    i = lines.index(sidebar[0])
    assert lines[i:i + len(sidebar)] == sidebar
    j = lines.index(main[0])
    assert lines[j:j + len(main)] == main
    assert lines[0] == "PRIYA SHARMA"


def test_one_column_keeps_lines_whole():
    text = extract_text(one_column_pdf())
    assert "Backend Engineer at Gamma Tech (Mar 2020 - Present)" in text
    assert "Python, Django, FastAPI, PostgreSQL, Redis, Docker, Linux" in text


def test_letter_spaced_headings_are_joined():
    def draw(c, w, h):
        c.setFont("Helvetica", 12)
        # "J U L I E   M O N R O E" with wide letter spacing, bigger gap between words
        x = 50
        for word in ("JULIE", "MONROE"):
            for ch in word:
                c.drawString(x, h - 50, ch)
                x += c.stringWidth(ch, "Helvetica", 12) + 5  # constant tracking, like real templates
            x += 14
        _lines(c, 50, h - 90, ["S K I L L S", "Python and SQL for reporting."] + ["This filler line is long enough to run across most of the page width for sure."] * 8)
    text = extract_text(_pdf(draw))
    assert "JULIE MONROE" in text
    parsed = parse_resume_text(text, today=TODAY)
    assert "C" not in parsed["skills"] and "R" not in parsed["skills"]
    assert "skills" in parsed["sections_found"]


def test_narrow_sidebar_with_few_words_is_a_column():
    """A contact sidebar holding ~12% of the words must still be split off."""
    def draw(c, w, h):
        _lines(c, 30, h - 60, ["Details", "1515 Pacific Ave", "Los Angeles", "United States"] * 3, size=8)
        main = [f"Delivered project number {i} for a large retail client on time." for i in range(15)]
        _lines(c, 200, h - 60, main, size=9, gap=12)
    lines = [l for l in extract_text(_pdf(draw)).splitlines() if l.strip()]
    assert not any("Pacific" in l and "Delivered" in l for l in lines)


def test_name_guess_skips_headings_and_titles():
    from app.services.resume.parser import _guess_name
    assert _guess_name("PROFESSIONAL SUMMARY\nKristi Travis") == "Kristi Travis"
    assert _guess_name("John Huber, UX Designer\n9 Wall St") == "John Huber"


def test_scanned_or_empty_pdf_raises():
    with pytest.raises(NoTextLayer):
        extract_text(blank_pdf())


# ── Skills ────────────────────────────────────────────────

def test_aliases_map_to_canonical_names():
    found = get_taxonomy().find("Worked with ReactJS, node js, Postgres and k8s. Tailwind for styling.")
    assert {"React", "Node.js", "PostgreSQL", "Kubernetes", "Tailwind CSS"} <= set(found)


def test_ambiguous_words_are_not_skills():
    found = get_taxonomy().find("I go to market weekly with the rest of the team and express ideas.")
    assert "Go" not in found and "REST API" not in found and "Express.js" not in found


def test_short_case_sensitive_skills():
    tax = get_taxonomy()
    assert "Go" in tax.find("Services written in Go and Python")
    found = tax.find("Strong in C++ and C#")
    assert "C++" in found and "C#" in found and "C" not in found
    assert "React Native" in tax.find("Apps in React Native") and "React" not in tax.find("Apps in React Native")


def test_canonical_skill_list_cleans_recruiter_input():
    assert canonical_skill_list(["reactjs", "React", " golang ", "", "Kafka"]) == ["React", "Go", "Kafka"]


def test_suggest_skills_from_job_text():
    skills = suggest_skills("We need a React developer. React, TypeScript and Node.js. Docker is a plus.")
    assert skills[0] == "React"
    assert {"TypeScript", "Node.js", "Docker"} <= set(skills)


# ── Parser ────────────────────────────────────────────────

def test_section_split_and_headings():
    sec = split_sections("Asha Rao\nSKILLS:\nPython\nWork Experience\nDev at X\nEducation\nBCA, 2019")
    assert sec["header"] == "Asha Rao"
    assert sec["skills"] == "Python"
    assert sec["experience"] == "Dev at X"
    assert sec["education"] == "BCA, 2019"


def test_experience_merges_overlaps_and_present():
    sections = {"experience": "A Corp Jan 2020 - Dec 2021\nB Corp (part-time) Jun 2021 - Present"}
    exp = estimate_experience(sections, "", today=TODAY)
    # Jan 2020 .. Nov 2026 = 83 months, the overlap is counted once
    assert exp["total_experience_years"] == pytest.approx(83 / 12, abs=0.05)
    assert exp["date_ranges_found"] == 2


def test_experience_ignores_education_dates_and_phone_numbers():
    sections = {"header": "+91 98765-43210", "education": "B.Tech 2014 - 2018"}
    exp = estimate_experience(sections, "", today=TODAY)
    assert exp["total_experience_years"] is None


def test_experience_falls_back_to_stated_years():
    exp = estimate_experience({"summary": "x"}, "Engineer with 5+ years of hands-on experience", today=TODAY)
    assert exp["total_experience_years"] == 5.0


def test_education_levels_and_no_false_degrees():
    edu = extract_education({"education": "M.Tech, IIT Delhi, 2020\nB.Tech CSE\nNIT Trichy 2018"}, "")
    assert edu["highest_education"] == "M.Tech / M.E."
    assert edu["education"][0]["institution"] == "M.Tech, IIT Delhi, 2020"
    none = extract_education({}, "Please contact me. It would be good to be part of the team.")
    assert none["education"] == []


def test_full_parse_of_two_column_resume():
    parsed = parse_resume_text(extract_text(two_column_pdf()), today=TODAY)
    assert parsed["name"] == "Priya Sharma"
    assert parsed["email"] == "priya.sharma@example.com"
    assert parsed["phone"].replace(" ", "") == "+919876543210"
    assert {"React", "Node.js", "PostgreSQL", "Docker", "AWS", "Redux"} <= set(parsed["skills"])
    # Jul 2018 .. Nov 2026, education years 2014-2018 not counted
    assert parsed["total_experience_years"] == pytest.approx(101 / 12, abs=0.05)
    assert parsed["highest_education"] == "B.Tech / B.E."


# ── Scorer ────────────────────────────────────────────────

def _job(**kw):
    base = dict(title="Full Stack Developer", description="Build our HR SaaS with React and Node.js.",
                responsibilities=None, requirements="React, Node.js, PostgreSQL, AWS",
                required_skills=["React", "nodejs", "PostgreSQL", "Kubernetes"],
                preferred_skills=["Redux"], min_experience_years=Decimal("4"))
    base.update(kw)
    return SimpleNamespace(**base)


PARSED = {"skills": ["React", "Node.js", "PostgreSQL", "Redux", "Docker"],
          "total_experience_years": 3.0, "text": "React Node.js PostgreSQL Redux developer building HR SaaS"}


def test_score_breakdown_matched_missing_and_gap():
    res = score_application(_job(), PARSED)
    comp = res["breakdown"]["components"]
    assert comp["skills"]["matched_required"] == ["React", "Node.js", "PostgreSQL"]
    assert comp["skills"]["missing_required"] == ["Kubernetes"]
    assert comp["skills"]["matched_preferred"] == ["Redux"]
    assert comp["skills"]["value"] == pytest.approx(0.8 * 0.75 + 0.2 * 1.0)
    assert comp["experience"]["gap_years"] == 1.0
    assert comp["experience"]["value"] == pytest.approx(0.75)
    assert 0 <= res["score"] <= 100
    assert sum(c["weight"] for c in comp.values()) == pytest.approx(1.0)


def test_missing_components_are_reweighted():
    job = _job(min_experience_years=None, description=None, requirements=None, title="")
    res = score_application(job, {**PARSED, "text": ""})
    comp = res["breakdown"]["components"]
    assert set(comp) == {"skills"}
    assert comp["skills"]["weight"] == 1.0
    assert res["score"] == pytest.approx(comp["skills"]["value"] * 100, abs=0.1)


def test_job_without_skills_uses_description():
    job = _job(required_skills=[], preferred_skills=[])
    comp = score_application(job, PARSED)["breakdown"]["components"]["skills"]
    assert comp["source"] == "job_description"
    assert "AWS" in comp["missing_required"]


def test_recruiter_overrides_win():
    res = score_application(_job(), PARSED, overrides={"skills": ["React", "Node.js", "PostgreSQL", "Kubernetes"],
                                                        "total_experience_years": 6})
    comp = res["breakdown"]["components"]
    assert comp["skills"]["missing_required"] == []
    assert comp["experience"]["value"] == 1.0
    assert comp["experience"]["source"] == "recruiter"


def test_unknown_job_skill_matched_literally():
    job = _job(required_skills=["Zoho Creator"], preferred_skills=[])
    comp = score_application(job, {**PARSED, "text": "Built apps on Zoho Creator"})["breakdown"]["components"]
    assert comp["skills"]["matched_required"] == ["Zoho Creator"]


def test_form_years_used_when_resume_has_none():
    comp = score_application(_job(), {**PARSED, "total_experience_years": None}, form_years=4)
    assert comp["breakdown"]["components"]["experience"]["source"] == "application_form"


def test_text_similarity_orders_related_text_higher():
    jd = "Backend Python developer with Django, REST APIs and PostgreSQL"
    good = "Python Django developer, built REST APIs on PostgreSQL"
    bad = "Sales executive handling B2B clients and field sales targets"
    assert text_similarity(good, jd) > text_similarity(bad, jd)


# ── Background job ────────────────────────────────────────

def _fake_session(app):
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = app
    return db


def test_run_parse_failure_marks_failed_and_keeps_application():
    app = SimpleNamespace(id=uuid.uuid4(), company_id=uuid.uuid4(), parse_status="pending", parse_error=None)
    db = _fake_session(app)
    with patch.object(match_service, "SessionLocal", return_value=db):
        match_service.run_parse(app.id, app.company_id, b"%PDF-1.4 not really a pdf")
    assert app.parse_status == "failed"
    assert app.parse_error
    db.close.assert_called_once()


def test_run_parse_success_sets_done_and_scores():
    app = SimpleNamespace(id=uuid.uuid4(), company_id=uuid.uuid4(), job_id=uuid.uuid4(),
                          parse_status="pending", parse_error=None, parsed_overrides=None,
                          candidate=SimpleNamespace(years_of_experience=None),
                          parsed_data=None, parsed_at=None, parser_version=None,
                          match_score=None, match_breakdown=None, scored_at=None, score_version=None)
    db = MagicMock()
    # first query -> application, second -> job
    db.query.return_value.filter.return_value.first.side_effect = [app, _job()]
    with patch.object(match_service, "SessionLocal", return_value=db):
        match_service.run_parse(app.id, app.company_id, two_column_pdf())
    assert app.parse_status == "done"
    assert app.match_score is not None
    assert "React" in app.match_breakdown["components"]["skills"]["matched_required"]
    payload = match_service.match_payload(app)
    assert "text" not in payload["parsed"]
