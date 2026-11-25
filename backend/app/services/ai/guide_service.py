"""Finds how-to guides locally (no tokens) and renders them."""

from __future__ import annotations

import logging
import math
import re
from dataclasses import dataclass
from typing import Any, Iterable

from rapidfuzz import fuzz

from app.services.ai.guides import GUIDES, GUIDES_BY_ID, Guide

logger = logging.getLogger(__name__)

NOT_GUIDE = "NOT_GUIDE"
MATCH_THRESHOLD = 0.66
CLOSE_SCORE = 0.15
MAX_GUIDES_IN_PROMPT = 3

_HOW_TO = re.compile(
    r"\b(kaise|kese|kaisey|how (do|to|can|should|does)|steps?|guide|tarika|tareeka|procedure|sikha\w*|samjha\w*|"
    r"where (do|can|is the|to)|kahan? (se|par|pe|jaake|jakar|milega|milegi|jaana)|kidhar (se|milega)|"
    r"kya karna (hai|hoga|padega))\b"
)
# "How is my attendance", "attendance kaise hai": live-data questions.
_DATA_QUESTION = re.compile(
    r"\b(how (is|are|many|much|was|were)|kaise (hai|hain|thi|tha|rahi)|kitn[aeiy]\w*|kaun\w*|who|status)\b"
)
_SOFT = re.compile(
    r"\b(chahiye|chahie|banan[aei]|banao|bana do|bana de|nikaln[aei]|nikalo|nikalu\w*|karna hai|karni hai|"
    r"dena hai|deni hai|want to|need|create|generate|make|add|help)\b"
)
_PAGE_REFERENCE = re.compile(r"\b(yeh|ye|is page|this|yahan|yaha|here|iska|isko|ise)\b")

_HINGLISH = re.compile(
    r"\b(kaise|kese|hai|hain|karu|karna|karo|kare|kya|mujhe|mera|meri|uska|iska|chahiye|banta|bana|banao|nahi|aur|"
    r"kahan|yeh|agar|kab|kyun|batao|raha|rahi|ka|ki|ko)\b"
)

_STOP = set(
    """a an the i me my to of for in on is are do does can could should how what where which and or with from this
    that it be please pls kaise kese kaisey kare karu karun karna karni karte karta karein kiya ka ki ke ko se mein
    main mai hai hain ho hota hoti hote hoga hogi raha rahi rahe kya koi ek yeh ye woh wo is us uska iska mujhe
    mujhko hum hame apna apni apne batao bata bataiye banta banti bante banao bana banau banaun banate banaye banaun
    banega banegi bnega bnta steps step guide help tarika process want need chahiye hun hoon par pe liye kisi aap tum
    ji sir bhai zara du dun doon de do will would get lete leta leti""".split()
)
_SAME_MEANING = {
    "chutti": "leave", "chhutti": "leave", "chuttiyan": "leave", "leaves": "leave",
    "salaries": "salary", "tankhwah": "salary", "tankha": "salary", "payslips": "payslip",
    "expenses": "expense", "employees": "employee", "karmachari": "employee", "candidates": "candidate",
    "letters": "letter", "shifts": "shift", "goals": "goal", "holidays": "holiday", "policies": "policy",
    "chhodna": "chhod", "chod": "chhod", "chhodkar": "chhod", "resigned": "resign", "resignation": "resign",
}


def _tokens(text: str) -> list[str]:
    words = re.findall(r"[a-z0-9]+", text.lower())
    return [_SAME_MEANING.get(w, w) for w in words if w not in _STOP]


# Alias words per guide, and in how many guides each word appears.
_ALIASES: dict[str, set[tuple[str, ...]]] = {
    g.id: {tuple(t) for t in (_tokens(a) for a in (*g.aliases, g.title)) if t} for g in GUIDES
}
_GUIDES_WITH_WORD: dict[str, int] = {}
for _alias_set in _ALIASES.values():
    for _word in {w for alias in _alias_set for w in alias}:
        _GUIDES_WITH_WORD[_word] = _GUIDES_WITH_WORD.get(_word, 0) + 1


def _weight(word: str) -> float:
    """Rare words say more about the topic than common ones like 'employee'."""
    return 1 + math.log(len(GUIDES) / _GUIDES_WITH_WORD.get(word, len(GUIDES)))


def _same_word(a: str, b: str) -> bool:
    if a == b:
        return True
    return min(len(a), len(b)) >= 4 and fuzz.ratio(a, b) >= 80


def _score(query: list[str], guide: Guide) -> float:
    best = 0.0
    for alias in _ALIASES[guide.id]:
        hit = sum(_weight(w) for w in alias if any(_same_word(w, q) for q in query))
        if not hit:
            continue
        alias_cover = hit / sum(_weight(w) for w in alias)
        query_cover = sum(1 for q in query if any(_same_word(q, w) for w in alias)) / len(query)
        best = max(best, 0.7 * alias_cover + 0.3 * query_cover)
    return best


def _on_page(guide: Guide, page: str | None) -> bool:
    if not page:
        return False
    current = page.split("?")[0].rstrip("/") or "/"
    target = guide.path.split("?")[0]
    return current == target or (target != "/" and current.startswith(target + "/"))


@dataclass
class UserAccess:
    permissions: dict[str, Any]
    is_admin: bool

    @classmethod
    def of(cls, user: Any) -> "UserAccess":
        roles = {(r.name or "").strip().lower() for r in user.all_roles if r}
        return cls(permissions=user.merged_permissions or {}, is_admin="admin" in roles)

    def allows(self, guide: Guide) -> bool:
        if not guide.permissions or self.is_admin:
            return True
        return any(self.permissions.get(p) for p in guide.permissions)


def search(query: str, page: str | None = None) -> list[tuple[Guide, float]]:
    """All guides that clearly match, best first."""
    words = _tokens(query)
    scored = []
    for guide in GUIDES:
        score = _score(words, guide) if words else 0
        if score >= MATCH_THRESHOLD:
            scored.append((guide, score + (0.1 if _on_page(guide, page) else 0)))
    return sorted(scored, key=lambda match: -match[1])


def guides_for(access: UserAccess, page: str | None = None) -> list[Guide]:
    return [g for g in GUIDES if access.allows(g) and (page is None or _on_page(g, page))]


def find_for_message(message: str, page: str | None, previous_id: str | None) -> list[Guide]:
    """Guides to answer this message with; empty means it is not a guide question."""
    text = message.lower()
    if _DATA_QUESTION.search(text):
        return []

    how_to = bool(_HOW_TO.search(text))
    matches = search(message, page)
    if matches:
        close = [g for g, score in matches if score >= matches[0][1] - CLOSE_SCORE][:MAX_GUIDES_IN_PROMPT]
        if how_to:
            return close
        only_the_topic = len(message.split()) <= 4 and len(_tokens(message)) <= 3
        if close[0].soft and (_SOFT.search(text) or only_the_topic):
            return [g for g in close if g.soft]
        return []

    if how_to and _PAGE_REFERENCE.search(text):
        on_page = [g for g in GUIDES if _on_page(g, page)]
        if on_page:
            return on_page[:MAX_GUIDES_IN_PROMPT]

    # Follow-up to a guide. The model replies NOT_GUIDE if the topic changed.
    previous = GUIDES_BY_ID.get(previous_id or "")
    if previous:
        return [previous]

    if how_to:
        logger.info("No guide for how-to question: %s", message[:120])
    return []


def render(guide: Guide) -> str:
    lines = [f"**{guide.title}**", ""]
    lines += [f"{i}. {step}" for i, step in enumerate(guide.steps, 1)]
    if guide.notes:
        lines += ["", "**Good to know**", *(f"- {note}" for note in guide.notes)]
    return "\n".join(lines)


def render_denied(guide: Guide) -> str:
    return (
        f"**{guide.title}** needs a permission your account does not have. "
        "Please ask your HR or Admin, or raise a ticket from My Space > Helpdesk."
    )


def link(guide: Guide) -> dict[str, str]:
    return {"id": guide.id, "title": guide.title, "path": guide.path, "button": guide.button}


def is_how_to(message: str) -> bool:
    return bool(_HOW_TO.search(message.lower()))


def system_prompt(
    guides: Iterable[Guide], page: str | None, denied: Iterable[Guide] = (), may_leave: bool = False
) -> str:
    denied_titles = ", ".join(g.title for g in denied)
    rules = [
        "You are Meagle 360 AI, the in-app guide for an HRMS. Answer using ONLY the guides below.",
        "- Roman letters only, never Devanagari. Keep button and menu names exactly as in the guide.",
        "- Fit the answer to their exact situation; numbered steps, short. No tables.",
        "- Never invent a button, menu, step or feature. If a guide says something is not possible, say so plainly and give "
        "the nearest way it offers. Only if no guide touches it, say you have no guide and suggest Helpdesk.",
        "- You only explain here. Never say you created, sent or approved anything.",
        "- Start with the line GUIDE: <id> for the guide you used most.",
    ]
    if may_leave:
        rules.append(
            "- If the user asks for live data about people, attendance, leave or pay, or orders an action unrelated "
            f"to the guides, reply with exactly {NOT_GUIDE} and nothing else."
        )
    if page:
        rules.append(f"- The user is on page {page}.")
    if denied_titles:
        rules.append(f"- The user lacks permission for: {denied_titles}. For those, tell them to ask HR/Admin.")
    return "\n".join(rules) + "\n\nGUIDES\n" + "\n\n".join(f"[{g.id}] {render(g)}" for g in guides)


def reply_language(message: str) -> str:
    """Told to the model next to the question; the small model misses it in the long prompt."""
    if _HINGLISH.search(message.lower()):
        return (
            "(Poora jawab Hinglish mein do, Roman letters, jaise: 'Employee Directory kholo aur Offer Letter "
            "par click karo'. Sirf button aur menu ke naam English mein rakho.)"
        )
    return "(Reply in English.)"


SEARCH_GUIDE_TOOL: dict[str, Any] = {
    "type": "function",
    "function": {
        "name": "search_guide",
        "description": "Get the HRMS how-to steps for a feature. Use for 'how do I' or 'why can't I' questions.",
        "parameters": {
            "type": "object",
            "properties": {"topic": {"type": "string", "description": "e.g. 'approve leave'"}},
            "required": ["topic"],
        },
    },
}


def search_guide(topic: str, access: UserAccess | None) -> dict[str, Any]:
    found = [g for g, _ in search(topic)][:2]
    allowed = [g for g in found if access and access.allows(g)]
    if allowed:
        return {"guides": [{"title": g.title, "steps": g.steps, "notes": g.notes} for g in allowed]}
    if found:
        return {"error": "The user does not have permission for this. They should ask HR or Admin."}
    return {"error": "No guide for this topic. Do not invent steps; suggest Helpdesk."}
