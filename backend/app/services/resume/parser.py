"""Rule-based resume parser: plain text -> structured suggestions.

No ML models. Everything here is a suggestion the recruiter can correct;
the application form (name, email, phone, location, years) stays the
source of truth for contact details."""

import re
from datetime import date

from app.services.resume.skills import get_taxonomy

PARSER_VERSION = 1
MAX_STORED_TEXT = 30000

# ── Sections ──────────────────────────────────────────────

SECTION_HEADINGS = {
    "summary": ["summary", "professional summary", "profile", "profile summary", "career objective",
                "objective", "about me", "about", "career summary"],
    "experience": ["experience", "work experience", "professional experience", "employment history",
                   "work history", "career history", "employment", "internships", "internship",
                   "internship experience", "relevant experience", "professional background"],
    "education": ["education", "academic background", "academics", "educational qualifications",
                  "education and training", "qualifications", "academic qualifications"],
    "skills": ["skills", "technical skills", "key skills", "core skills", "core competencies",
               "competencies", "technologies", "tech stack", "tools and technologies", "skills & tools",
               "skill set", "skillset", "areas of expertise", "expertise"],
    "projects": ["projects", "personal projects", "academic projects", "key projects", "project experience"],
    "certifications": ["certifications", "certificates", "licenses and certifications", "courses",
                       "training", "achievements", "awards", "achievements and awards"],
    "other": ["languages", "hobbies", "interests", "references", "declaration", "personal details",
              "personal information", "extra curricular activities", "volunteering"],
}
_HEADING_LOOKUP = {h: key for key, heads in SECTION_HEADINGS.items() for h in heads}


def _heading_key(line: str) -> str | None:
    cleaned = re.sub(r"[^a-z& ]", " ", line.lower())
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    if not cleaned or len(cleaned.split()) > 5:
        return None
    return _HEADING_LOOKUP.get(cleaned) or _HEADING_LOOKUP.get(cleaned.replace("&", "and"))


def split_sections(text: str) -> dict[str, str]:
    """Section key -> text. Lines before the first heading go to 'header'."""
    sections: dict[str, list[str]] = {"header": []}
    current = "header"
    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            continue
        key = _heading_key(line)
        if key:
            current = key
            sections.setdefault(current, [])
            continue
        sections.setdefault(current, []).append(line)
    return {k: "\n".join(v) for k, v in sections.items() if v}


# ── Contact ───────────────────────────────────────────────

_EMAIL = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
_PHONE = re.compile(r"(?<!\d)(?:\+?\d{1,3}[\s-]?)?(?:\(?\d{3,5}\)?[\s-]?)?\d{3,5}[\s-]?\d{4,5}(?!\d)")
_LINKEDIN = re.compile(r"(?:https?://)?(?:[a-z]{2,3}\.)?linkedin\.com/in/[A-Za-z0-9_-]+/?", re.I)
_GITHUB = re.compile(r"(?:https?://)?github\.com/[A-Za-z0-9_-]+/?", re.I)


def _first_phone(text: str) -> str | None:
    for m in _PHONE.finditer(text):
        digits = re.sub(r"\D", "", m.group(0))
        if 10 <= len(digits) <= 13:
            return m.group(0).strip()
    return None


def _guess_name(header: str) -> str | None:
    """First short line made only of letters, e.g. 'PRIYA SHARMA'."""
    for line in header.splitlines()[:6]:
        line = line.split(",")[0].split("|")[0].strip()  # "John Huber, UX Designer"
        if _EMAIL.search(line) or any(ch.isdigit() for ch in line) or _heading_key(line):
            continue
        words = line.split()
        if 2 <= len(words) <= 4 and all(re.fullmatch(r"[A-Za-z][A-Za-z.'-]*", w) for w in words):
            return " ".join(w.capitalize() if w.isupper() else w for w in words)
    return None


# ── Experience (date ranges) ──────────────────────────────

_MONTHS = {m: i + 1 for i, m in enumerate(
    ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"])}
_MONTH_RE = r"(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)"
# Lookarounds stop a date being read out of a phone number or the middle of a word.
_DATE_RE = rf"(?<![\w/.])(?:{_MONTH_RE}\.?,?\s*'?\d{{2,4}}|\d{{1,2}}\s*[/.]\s*\d{{2,4}}|(?:19|20)\d{{2}})(?![\d/])"
_PRESENT_RE = r"(?:present|current|currently|now|till\s+date|to\s+date|ongoing|today)"
_RANGE = re.compile(
    rf"(?P<start>{_DATE_RE})\s*(?:-|–|—|to|till|until|~)\s*(?P<end>{_DATE_RE}|{_PRESENT_RE})",
    re.IGNORECASE,
)
_YEARS_STATED = re.compile(
    r"(\d{1,2}(?:\.\d)?)\s*\+?\s*(?:years?|yrs?)(?:\s+of)?\s+(?:[\w-]+\s+){0,3}?experience", re.IGNORECASE)


def _parse_date(s: str, today: date, is_end: bool) -> date | None:
    s = s.strip().lower().replace("'", " ").replace(",", " ")
    if re.fullmatch(_PRESENT_RE, s, re.IGNORECASE):
        return today
    m = re.match(rf"({_MONTH_RE})\.?\s*(\d{{2,4}})$", s, re.IGNORECASE)
    if m:
        month = _MONTHS[m.group(1)[:3]]
        year = int(m.group(2))
    else:
        m = re.match(r"(\d{1,2})\s*[/.-]\s*(\d{2,4})$", s)
        if m:
            month, year = int(m.group(1)), int(m.group(2))
            if not 1 <= month <= 12:
                return None
        else:
            m = re.match(r"((?:19|20)\d{2})$", s)
            if not m:
                return None
            # A bare year: start counts from January, end through December.
            year, month = int(m.group(1)), (12 if is_end else 1)
    if year < 100:
        year += 2000 if year <= today.year % 100 else 1900
    if not 1970 <= year <= today.year + 1:
        return None
    return min(date(year, month, 1), today)


def _merge_months(ranges: list[tuple[date, date]]) -> int:
    """Total months covered by the ranges, counting overlaps once."""
    def idx(d: date) -> int:
        return d.year * 12 + d.month - 1
    spans = sorted((idx(a), idx(b) + 1) for a, b in ranges if b >= a)
    total, cur_s, cur_e = 0, None, None
    for s, e in spans:
        if cur_e is None or s > cur_e:
            if cur_e is not None:
                total += cur_e - cur_s
            cur_s, cur_e = s, e
        else:
            cur_e = max(cur_e, e)
    if cur_e is not None:
        total += cur_e - cur_s
    return total


def estimate_experience(sections: dict[str, str], full_text: str, today: date | None = None) -> dict:
    today = today or date.today()
    # Only read date ranges from the experience section when there is one,
    # otherwise from everything except education (school years are not work).
    source = sections.get("experience")
    if not source:
        source = "\n".join(v for k, v in sections.items() if k != "education")
    ranges = []
    for m in _RANGE.finditer(source):
        start = _parse_date(m.group("start"), today, is_end=False)
        end = _parse_date(m.group("end"), today, is_end=True)
        if start and end and end >= start:
            ranges.append((start, end))
    months = _merge_months(ranges)
    stated = [float(x) for x in _YEARS_STATED.findall(full_text) if float(x) <= 50]
    years_from_ranges = round(months / 12, 1) if ranges else None
    years_stated = max(stated) if stated else None
    years = years_from_ranges if years_from_ranges is not None else years_stated
    return {
        "total_experience_years": years,
        "years_from_date_ranges": years_from_ranges,
        "years_stated": years_stated,
        "date_ranges_found": len(ranges),
    }


# ── Education ─────────────────────────────────────────────

_DEGREES = [
    # (regex, label, level) level: 5 doctorate, 4 master, 3 bachelor, 2 diploma, 1 school
    (r"\bph\.?\s?d\b|\bdoctorate\b", "PhD", 5),
    # Short degrees need their dots (M.E., B.E., B.A.) so "me", "be", "ba" in prose don't match.
    (r"\bm\.?\s?tech\b|\bm\.\s?e\b\.?", "M.Tech / M.E.", 4),
    (r"\bmba\b|\bpgdm\b", "MBA / PGDM", 4),
    (r"\bmca\b", "MCA", 4),
    (r"\bm\.?\s?sc\b", "M.Sc", 4),
    (r"\bm\.?\s?com\b", "M.Com", 4),
    (r"\bm\.\s?a\.", "M.A.", 4),
    (r"\bmaster'?s?\b|\bmasters? of\b", "Master's", 4),
    (r"\bb\.?\s?tech\b|\bb\.\s?e\b\.?", "B.Tech / B.E.", 3),
    (r"\bbca\b", "BCA", 3),
    (r"\bb\.?\s?sc\b", "B.Sc", 3),
    (r"\bb\.?\s?com\b", "B.Com", 3),
    (r"\bbba\b|\bbbm\b", "BBA", 3),
    (r"\bb\.\s?a\.", "B.A.", 3),
    (r"\bbachelor'?s?\b|\bbachelors? of\b|\bundergraduate\b", "Bachelor's", 3),
    (r"\bdiploma\b|\bpolytechnic\b", "Diploma", 2),
    (r"\b12th\b|\bhsc\b|\bhigher secondary\b|\bintermediate\b|\bclass xii\b", "12th / HSC", 1),
    (r"\b10th\b|\bssc\b|\bmatriculation\b|\bclass x\b", "10th / SSC", 1),
]
_INSTITUTION = re.compile(r"\b(university|college|institute|iit|nit|iiit|iim|school|academy|vidyalaya)\b", re.I)
_YEAR = re.compile(r"\b(?:19|20)\d{2}\b")


def extract_education(sections: dict[str, str], full_text: str) -> dict:
    source = sections.get("education") or full_text
    lines = source.splitlines()
    entries = []
    for i, line in enumerate(lines):
        for pattern, label, level in _DEGREES:
            if re.search(pattern, line, re.IGNORECASE):
                window = lines[max(0, i - 1): i + 3]
                institution = next((l.strip() for l in window if _INSTITUTION.search(l)), None)
                years = _YEAR.findall(" ".join(window))
                entries.append({
                    "degree": label,
                    "level": level,
                    "line": line.strip()[:200],
                    "institution": institution[:200] if institution else None,
                    "year": max(years) if years else None,
                })
                break
    # one entry per degree label, keep the first seen
    seen, unique = set(), []
    for e in entries:
        if e["degree"] not in seen:
            seen.add(e["degree"])
            unique.append(e)
    highest = max(unique, key=lambda e: e["level"]) if unique else None
    return {"education": unique[:6], "highest_education": highest["degree"] if highest else None,
            "highest_education_level": highest["level"] if highest else None}


# ── Entry point ───────────────────────────────────────────

def parse_resume_text(text: str, today: date | None = None) -> dict:
    sections = split_sections(text)
    tax = get_taxonomy()
    counts = tax.find(text)
    skills_section = sections.get("skills", "")
    in_skills_section = set(tax.find(skills_section)) if skills_section else set()
    skills = sorted(counts, key=lambda s: (-(s in in_skills_section), -counts[s], s))

    header = sections.get("header", "") or text[:500]
    linkedin = _LINKEDIN.search(text)
    github = _GITHUB.search(text)
    email = _EMAIL.search(text)

    return {
        "name": _guess_name(header),
        "email": email.group(0) if email else None,
        "phone": _first_phone(text),
        "linkedin": linkedin.group(0) if linkedin else None,
        "github": github.group(0) if github else None,
        "skills": skills,
        "skill_mentions": counts,
        "skill_categories": {s: tax.category.get(s, "Other") for s in skills},
        **estimate_experience(sections, text, today),
        **extract_education(sections, text),
        "sections_found": [k for k in sections if k != "header"],
        "text": text[:MAX_STORED_TEXT],
        "text_length": len(text),
    }
