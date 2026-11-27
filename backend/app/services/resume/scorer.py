"""Explainable job-match score (0-100). No ML model.

Components and default weights:
  skills           55%  required (80%) + preferred (20%) skills found in the resume
  experience       25%  candidate years vs the job's minimum years
  text_similarity  20%  term-frequency cosine between resume and job text

A component the job gives no data for (no skills, no minimum years) is left
out and the remaining weights are scaled back up to 100%, so a job without
skills is not punished. If the job has no skills set at all, required
skills are suggested from its description/requirements via the taxonomy.

Skill credit per job skill:
  1.0  found in the resume, directly or implied by a skill in the resume
       ("Python" via "Django"; the breakdown records the "via" skill)
  0.5  not in the resume, but the candidate picked it on the application
       form (self-declared, unverified)
  0    neither

Education is parsed and shown but not scored: job openings have no
education requirement field yet.

The score is for sorting and highlighting only. It must never be used to
auto-reject a candidate."""

import math
import re
from collections import Counter

from app.services.resume.skills import get_taxonomy, suggest_skills, text_mentions

SCORE_VERSION = 2
DECLARED_CREDIT = 0.5
WEIGHTS = {"skills": 0.55, "experience": 0.25, "text_similarity": 0.20}

# Raw cosine between a resume and a JD rarely goes above ~0.4 even for a
# strong fit, so it is stretched: <= LOW -> 0, >= HIGH -> 1.
SIM_LOW, SIM_HIGH = 0.05, 0.40

_STOPWORDS = set("""
a about above after again against all also am an and any are as at be because been before being below
between both but by can could did do does doing down during each etc few for from further had has have
having he her here hers him his how i if in into is it its itself just me more most my no nor not now
of off on once only or other our ours out over own per same she should so some such than that the their
them then there these they this those through to too under until up us very via was we were what when
where which while who whom why will with within without would you your yours
candidate candidates role job position team company work working looking seeking strong good excellent
ability able skills skill knowledge experience experienced years year required requirements preferred
responsibilities responsible including plus etc must nice understanding hands using use used new well
""".split())
_TOKEN = re.compile(r"[a-z][a-z0-9+#.]*[a-z0-9+#]|[a-z]")


def _tokens(text: str) -> list[str]:
    toks = [t for t in _TOKEN.findall((text or "").lower()) if t not in _STOPWORDS and len(t) > 1]
    bigrams = [f"{a} {b}" for a, b in zip(toks, toks[1:])]
    return toks + bigrams


def text_similarity(resume_text: str, job_text: str) -> float:
    """Cosine similarity of sublinear term-frequency vectors (0..1).

    With a single resume and a single JD there is no corpus for IDF, so the
    stopword list (common English + JD boilerplate) does that job instead."""
    a, b = Counter(_tokens(resume_text)), Counter(_tokens(job_text))
    if not a or not b:
        return 0.0
    wa = {t: 1 + math.log(c) for t, c in a.items()}
    wb = {t: 1 + math.log(c) for t, c in b.items()}
    dot = sum(wa[t] * wb[t] for t in wa.keys() & wb.keys())
    na = math.sqrt(sum(v * v for v in wa.values()))
    nb = math.sqrt(sum(v * v for v in wb.values()))
    return dot / (na * nb) if na and nb else 0.0


def job_text(job) -> str:
    parts = [job.title, job.description, job.responsibilities, job.requirements]
    return "\n".join(p for p in parts if p)


def _skill_match(job_skills: list[str], resume_has: dict[str, str | None], resume_text: str,
                 declared_has: dict[str, str | None]) -> dict:
    """Sort a job's skills into matched / declared-only / missing.

    resume_has and declared_has are Taxonomy.expand() results:
    skill -> None (stated) or the skill that implies it."""
    tax = get_taxonomy()
    matched, declared, missing, implied, seen = [], [], [], {}, set()
    declared_lower = {d.lower() for d in declared_has}
    for raw in job_skills:
        name = tax.canonical(raw)
        if not name or name.lower() in seen:
            continue
        seen.add(name.lower())
        if tax.is_known(name):
            in_resume = name in resume_has
            if in_resume and resume_has[name]:
                implied[name] = resume_has[name]
        else:
            in_resume = text_mentions(resume_text, name)
        if in_resume:
            matched.append(name)
        elif name in declared_has or name.lower() in declared_lower:
            declared.append(name)
        else:
            missing.append(name)
    return {"matched": matched, "declared": declared, "missing": missing, "implied": implied}


def _ratio(m: dict) -> float | None:
    total = len(m["matched"]) + len(m["declared"]) + len(m["missing"])
    if not total:
        return None
    return (len(m["matched"]) + DECLARED_CREDIT * len(m["declared"])) / total


def _declared_report(declared: list[dict], resume_has: dict, resume_text: str) -> list[dict]:
    """The candidate's own skill list, each marked as seen in the resume or not."""
    tax = get_taxonomy()
    out = []
    for d in declared:
        name = d.get("name")
        if not name:
            continue
        seen = name in resume_has if tax.is_known(name) else text_mentions(resume_text, name)
        out.append({"name": name, "years": d.get("years"), "in_resume": bool(seen)})
    return out


def score_application(job, parsed: dict, overrides: dict | None = None,
                      form_years: float | None = None,
                      declared_skills: list[dict] | None = None) -> dict:
    """Return {"score": float, "breakdown": {...}} for one application.

    `parsed` is the parser output; recruiter `overrides` win over it.
    `form_years` is the years of experience the candidate typed on the
    application form, used when the resume has no readable dates.
    `declared_skills` is the candidate's own skill list from the form:
    [{"name": canonical, "years": float | None}]."""
    overrides = overrides or {}
    resume_text = parsed.get("text") or ""
    if overrides.get("skills") is not None:
        resume_skills = set(overrides["skills"])
    else:
        resume_skills = set(parsed.get("skills") or [])
    tax = get_taxonomy()
    resume_has = tax.expand(resume_skills)
    declared_skills = [d for d in (declared_skills or []) if d.get("name")]
    declared_has = tax.expand(d["name"] for d in declared_skills)
    components: dict[str, dict] = {}

    # ── Skills ──
    required = list(job.required_skills or [])
    preferred = list(job.preferred_skills or [])
    skills_source = "job"
    if not required and not preferred:
        required = suggest_skills(job_text(job), limit=15)
        skills_source = "job_description"
    if required or preferred:
        req = _skill_match(required, resume_has, resume_text, declared_has)
        pref = _skill_match(preferred, resume_has, resume_text, declared_has)
        req_ratio, pref_ratio = _ratio(req), _ratio(pref)
        if req_ratio is not None and pref_ratio is not None:
            value = 0.8 * req_ratio + 0.2 * pref_ratio
        else:
            value = req_ratio if req_ratio is not None else pref_ratio
        components["skills"] = {
            "value": round(value, 4),
            "source": skills_source,
            "matched_required": req["matched"], "missing_required": req["missing"],
            "matched_preferred": pref["matched"], "missing_preferred": pref["missing"],
            # job skills only the candidate claims (form), not seen in the resume
            "declared_required": req["declared"], "declared_preferred": pref["declared"],
            # job skill -> resume skill that implies it ("Python" -> "Django")
            "implied": {**pref["implied"], **req["implied"]},
        }

    # ── Experience ──
    min_years = float(job.min_experience_years) if job.min_experience_years is not None else None
    if overrides.get("total_experience_years") is not None:
        cand_years, years_source = float(overrides["total_experience_years"]), "recruiter"
    elif parsed.get("total_experience_years") is not None:
        cand_years, years_source = float(parsed["total_experience_years"]), "resume"
    elif form_years is not None:
        cand_years, years_source = float(form_years), "application_form"
    else:
        cand_years, years_source = None, None
    if min_years is not None and min_years > 0:
        if cand_years is None:
            value = 0.0
        else:
            value = min(1.0, cand_years / min_years)
        components["experience"] = {
            "value": round(value, 4),
            "candidate_years": cand_years, "required_years": min_years,
            "gap_years": round(max(0.0, min_years - (cand_years or 0.0)), 1),
            "source": years_source,
        }

    # ── Text similarity ──
    jt = job_text(job)
    if jt.strip() and resume_text.strip():
        raw = text_similarity(resume_text, jt)
        value = min(1.0, max(0.0, (raw - SIM_LOW) / (SIM_HIGH - SIM_LOW)))
        components["text_similarity"] = {"value": round(value, 4), "raw_cosine": round(raw, 4)}

    total_weight = sum(WEIGHTS[k] for k in components)
    score = 0.0
    for key, comp in components.items():
        comp["weight"] = round(WEIGHTS[key] / total_weight, 4) if total_weight else 0
        comp["points"] = round(comp["value"] * comp["weight"] * 100, 1)
        score += comp["points"]

    return {
        "score": round(score, 1) if components else None,
        "breakdown": {
            "components": components,
            "candidate_skills": sorted(resume_skills),
            "declared_skills": _declared_report(declared_skills, resume_has, resume_text),
            "highest_education": overrides.get("highest_education") or parsed.get("highest_education"),
            "score_version": SCORE_VERSION,
            "note": "Suggestion for sorting only. Never auto-reject based on this score.",
        },
    }
