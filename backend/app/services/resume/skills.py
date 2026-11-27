"""Skills taxonomy + matcher.

The taxonomy is a global JSON file in the repo (skills_taxonomy.json). Every
alias maps to one canonical skill name, so "reactjs", "React.js" and "React"
all count as "React". Matching is regex on word boundaries; aliases written
with a leading '=' are case-sensitive (Go, R, C, Excel) so ordinary words
like "go" do not count as a skill.

A skill can list "implies": knowing Django proves Python, knowing React
proves Frontend Development. expand() follows these links transitively, so a
job asking for Python is matched by a resume that only says Django, and the
recruiter sees "Python via Django".

Unknown skills typed by a recruiter on a job (not in the taxonomy) still work:
they are matched literally against the resume text."""

import json
import os
import re
from functools import lru_cache

_PATH = os.path.join(os.path.dirname(__file__), "skills_taxonomy.json")
# A skill must not be glued to letters/digits or to + # (so "C" never matches inside "C++").
_BEFORE = r"(?<![\w+#.])"
_AFTER = r"(?![\w+#])"


def _norm(s: str) -> str:
    return re.sub(r"\s+", " ", s.strip().lower())


class Taxonomy:
    def __init__(self, data: dict):
        self.category: dict[str, str] = {}
        self.implies: dict[str, list[str]] = {}
        self._alias_ci: dict[str, str] = {}   # lowercased alias -> canonical
        self._alias_cs: dict[str, str] = {}   # exact alias -> canonical
        for canonical, info in data["skills"].items():
            self.category[canonical] = info.get("category", "Other")
            self.implies[canonical] = [s for s in info.get("implies", []) if s != canonical]
            self._alias_ci[_norm(canonical)] = canonical
            for alias in info.get("aliases", []):
                if alias.startswith("="):
                    self._alias_cs[alias[1:]] = canonical
                else:
                    self._alias_ci[_norm(alias)] = canonical
        # Single-letter / case-sensitive canonicals (C, R, Go) must not be
        # matched case-insensitively from the canonical name itself.
        for alias, canonical in list(self._alias_cs.items()):
            if _norm(alias) == _norm(canonical):
                self._alias_ci.pop(_norm(canonical), None)
        # Skill names typed by a recruiter ("go", "r") are names, not prose,
        # so canonical() may resolve case-sensitive aliases case-insensitively.
        self._name_lookup = {_norm(a): c for a, c in self._alias_cs.items()}
        self._name_lookup.update(self._alias_ci)
        self._re_ci = self._compile(self._alias_ci.keys(), re.IGNORECASE)
        self._re_cs = self._compile(self._alias_cs.keys(), 0)

    @staticmethod
    def _compile(aliases, flags):
        aliases = sorted(aliases, key=len, reverse=True)  # longest first: "react native" before "react"
        if not aliases:
            return None
        body = "|".join(re.escape(a).replace(r"\ ", r"\s+") for a in aliases)
        return re.compile(f"{_BEFORE}(?:{body}){_AFTER}", flags)

    def canonical(self, name: str) -> str:
        """Canonical taxonomy name for a skill, or the cleaned input if unknown."""
        cleaned = re.sub(r"\s+", " ", (name or "").strip())
        return self._name_lookup.get(_norm(cleaned)) or cleaned

    def is_known(self, name: str) -> bool:
        return self.canonical(name) in self.category

    def expand(self, skills) -> dict[str, str | None]:
        """Skills plus everything they imply (transitively).

        Returns skill -> None for a skill in the input, or skill -> the input
        skill it was reached from ("Python" -> "Django")."""
        out: dict[str, str | None] = {s: None for s in skills}
        queue = [(s, s) for s in out]
        while queue:
            skill, root = queue.pop(0)
            for implied in self.implies.get(skill, []):
                if implied not in out:
                    out[implied] = root
                    queue.append((implied, root))
        return out

    def catalog(self) -> list[dict]:
        """Every canonical skill with its category, for pickers in the UI."""
        return [{"name": n, "category": c}
                for n, c in sorted(self.category.items(), key=lambda kv: (kv[1], kv[0].lower()))]

    def find(self, text: str) -> dict[str, int]:
        """Canonical skill -> number of mentions in the text."""
        counts: dict[str, int] = {}
        if not text:
            return counts
        if self._re_ci:
            for m in self._re_ci.finditer(text):
                c = self._alias_ci.get(_norm(m.group(0)))
                if c:
                    counts[c] = counts.get(c, 0) + 1
        if self._re_cs:
            for m in self._re_cs.finditer(text):
                c = self._alias_cs.get(m.group(0))
                if c:
                    counts[c] = counts.get(c, 0) + 1
        return counts


@lru_cache(maxsize=1)
def get_taxonomy() -> Taxonomy:
    with open(_PATH, encoding="utf-8") as f:
        return Taxonomy(json.load(f))


def text_mentions(text: str, skill: str) -> bool:
    """Literal word-boundary search, used for skills not in the taxonomy."""
    if not skill.strip():
        return False
    pattern = _BEFORE + re.escape(skill.strip()).replace(r"\ ", r"\s+") + _AFTER
    return re.search(pattern, text or "", re.IGNORECASE) is not None


def suggest_skills(text: str, limit: int = 25) -> list[str]:
    """Skills found in a job description, most-mentioned first."""
    counts = get_taxonomy().find(text)
    return [s for s, _ in sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))][:limit]


def canonical_skill_list(skills: list[str] | None) -> list[str]:
    """Clean a recruiter-entered skill list: canonical names, no blanks or duplicates."""
    tax = get_taxonomy()
    seen, out = set(), []
    for s in skills or []:
        c = tax.canonical(str(s))[:80]
        if c and c.lower() not in seen:
            seen.add(c.lower())
            out.append(c)
    return out


MAX_DECLARED_SKILLS = 30


def clean_declared_skills(items) -> list[dict]:
    """Validate the skill list a candidate sends with an application.

    Accepts [{"name": str, "years": number | null}] (or bare strings).
    Names become canonical taxonomy names; unknown names are kept as typed
    (max 80 chars). Years are clamped to 0..50. Duplicates and blanks are
    dropped; at most MAX_DECLARED_SKILLS are kept."""
    tax = get_taxonomy()
    seen, out = set(), []
    for item in items or []:
        if isinstance(item, str):
            item = {"name": item}
        if not isinstance(item, dict):
            continue
        name = tax.canonical(str(item.get("name") or ""))[:80].strip()
        if not name or name.lower() in seen:
            continue
        years = item.get("years")
        try:
            years = None if years in (None, "") else round(min(50.0, max(0.0, float(years))), 1)
        except (TypeError, ValueError):
            years = None
        seen.add(name.lower())
        out.append({"name": name, "years": years})
        if len(out) >= MAX_DECLARED_SKILLS:
            break
    return out
