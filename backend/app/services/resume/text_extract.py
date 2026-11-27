"""PDF -> plain text in reading order.

Uses pdfplumber (MIT) word boxes. On each page we look for a vertical gutter
(an x position that almost no word crosses, with real text on both sides).
If one exists the page is a two-column layout: full-width lines (name/header)
come first, then the whole left column, then the whole right column, so
lines from the two columns never get mixed. Pages without a gutter are read
top-to-bottom.

pdfplumber is imported lazily so the app still starts if it is missing.
Scanned (image-only) PDFs have no text layer; we raise NoTextLayer and the
caller marks the parse as failed (OCR can be added later)."""

from io import BytesIO

MAX_PAGES = 6
LINE_TOLERANCE = 3.0  # points: words whose tops differ less than this share a line
MIN_TEXT_CHARS = 80
GUTTER_MIN_WIDTH = 10.0  # points
MIN_COLUMN_SHARE = 0.10  # each column needs at least this share of the page's words


class ExtractionUnavailable(Exception):
    """pdfplumber is not installed."""


class NoTextLayer(ValueError):
    """The PDF has (almost) no extractable text, e.g. a scanned image."""


def _join_line(line: list[dict]) -> str:
    """Join one line's words. Letter-spaced headings ("S K I L L S",
    "J U L I E  M O N R O E") come out as one word per letter; letters with
    a normal letter gap are glued back together, a wider gap stays a space."""
    line = sorted(line, key=lambda x: x["x0"])
    single = lambda w: len(w["text"]) == 1 and w["text"].isalpha()
    gaps = [b["x0"] - a["x1"] for a, b in zip(line, line[1:]) if single(a) and single(b)]
    letter_gap = sorted(gaps)[len(gaps) // 2] * 1.6 + 0.5 if len(gaps) >= 2 else None
    out = line[0]["text"]
    for a, b in zip(line, line[1:]):
        glue = letter_gap is not None and single(a) and single(b) and b["x0"] - a["x1"] <= letter_gap
        out += ("" if glue else " ") + b["text"]
    return out


def _group_lines(words: list[dict]) -> list[str]:
    """Group word boxes into text lines, top-to-bottom, left-to-right."""
    lines: list[list[dict]] = []
    for w in sorted(words, key=lambda w: (round(w["top"], 1), w["x0"])):
        if lines and abs(lines[-1][0]["top"] - w["top"]) <= LINE_TOLERANCE:
            lines[-1].append(w)
        else:
            lines.append([w])
    return [_join_line(line) for line in lines]


def find_gutter(words: list[dict], page_width: float) -> float | None:
    """Return the x of a column gutter, or None for a single-column page.

    Scans x positions in the middle 70% of the page and picks the one crossed
    by the fewest words, as long as both sides hold at least 10% of the words
    and almost nothing crosses it. 10% catches typical contact/skills
    sidebars (12-15% of words) while a narrow date-only column (6-8%) is
    still read row by row, so a date stays on the line with its job title."""
    if len(words) < 30 or page_width <= 0:
        return None
    best_x, best_cross = None, None
    step = page_width / 200
    x = page_width * 0.15
    total = len(words)
    # The gutter is a band, not a line: a normal word space (~3pt) must not
    # look like a column break in single-column text.
    half = GUTTER_MIN_WIDTH / 2
    while x < page_width * 0.85:
        left = sum(1 for w in words if w["x1"] <= x - half)
        right = sum(1 for w in words if w["x0"] >= x + half)
        cross = total - left - right
        if left >= total * MIN_COLUMN_SHARE and right >= total * MIN_COLUMN_SHARE:
            if best_cross is None or cross < best_cross:
                best_x, best_cross = x, cross
        x += step
    if best_x is None or best_cross > max(2, total * 0.04):
        return None
    return best_x


def _page_text(words: list[dict], page_width: float, page_height: float) -> str:
    gutter = find_gutter(words, page_width)
    if gutter is None:
        return "\n".join(_group_lines(words))
    # Words are assigned by their centre so a word touching the band edge
    # still lands in a column; only words straddling the gutter are full-width.
    left, right, spanning = [], [], []
    for w in words:
        if w["x0"] < gutter < w["x1"]:
            spanning.append(w)
        elif (w["x0"] + w["x1"]) / 2 < gutter:
            left.append(w)
        else:
            right.append(w)
    # A header (name, title) that sits above where BOTH columns start belongs
    # to neither column, even if it lies on one side of the gutter.
    if left and right:
        both_start = max(min(w["top"] for w in left), min(w["top"] for w in right))
        if both_start < page_height * 0.3:
            is_head = lambda w: w["top"] < both_start - LINE_TOLERANCE
            spanning += [w for w in left + right if is_head(w)]
            left = [w for w in left if not is_head(w)]
            right = [w for w in right if not is_head(w)]
    parts = []
    if spanning:
        parts.append("\n".join(_group_lines(spanning)))
    parts.append("\n".join(_group_lines(left)))
    parts.append("\n".join(_group_lines(right)))
    return "\n\n".join(p for p in parts if p)


def extract_text(pdf_bytes: bytes) -> str:
    try:
        import pdfplumber
    except ImportError as exc:  # pragma: no cover - depends on install
        raise ExtractionUnavailable("pdfplumber is not installed") from exc

    pages = []
    with pdfplumber.open(BytesIO(pdf_bytes)) as pdf:
        for page in pdf.pages[:MAX_PAGES]:
            words = page.extract_words(x_tolerance=1.5, y_tolerance=2, keep_blank_chars=False)
            if words:
                pages.append(_page_text(words, float(page.width), float(page.height)))
    text = "\n\n".join(pages).replace("\x00", "")
    if len(text.strip()) < MIN_TEXT_CHARS:
        raise NoTextLayer("No readable text found in the PDF (it may be a scanned image).")
    return text
