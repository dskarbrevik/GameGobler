"""No-Intro/Redump ROM filename metadata parser.

Parses the standard No-Intro naming convention:
  Title (Region1, Region2) (Tag1) (Tag2).ext

Handles regions, languages, release types (Beta/Proto/Demo/Kiosk),
revisions, dates, features, and BIOS markers.
"""

import re
from pathlib import Path

from pydantic import BaseModel, Field

# ─── Known region strings (No-Intro standard) ─────────────────────────────────

KNOWN_REGIONS: frozenset[str] = frozenset(
    {
        "USA",
        "Europe",
        "Japan",
        "World",
        "Australia",
        "Brazil",
        "Canada",
        "China",
        "France",
        "Germany",
        "Italy",
        "Korea",
        "Netherlands",
        "Spain",
        "Sweden",
        "Taiwan",
        "UK",
        "Hong Kong",
        "Asia",
        "Latin America",
        "Scandinavia",
        "Russia",
        "Poland",
        "Portugal",
        "Mexico",
        "Argentina",
        "Denmark",
        "Finland",
        "Norway",
        "Belgium",
        "Austria",
        "Switzerland",
        "Greece",
        "Hungary",
        "New Zealand",
        "South Africa",
        "Unknown",
    }
)

# ─── Known 2-letter language codes ────────────────────────────────────────────

KNOWN_LANG_CODES: frozenset[str] = frozenset(
    {
        "En",
        "Fr",
        "De",
        "Es",
        "It",
        "Nl",
        "Sv",
        "Pt",
        "Da",
        "Pl",
        "Ru",
        "No",
        "Fi",
        "Cs",
        "Zh",
        "Ko",
        "Ja",
        "Ar",
        "Tr",
        "Hu",
        "El",
        "He",
        "Hr",
        "Sk",
        "Sl",
        "Sr",
        "Uk",
        "Ro",
    }
)

# ─── Patterns ──────────────────────────────────────────────────────────────────

_RE_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_RE_REVISION = re.compile(r"^(Rev\s+[\w.]+|v\d+[\.\d]*)$", re.IGNORECASE)
_RE_BETA = re.compile(r"^Beta(?:\s+(\d+))?$", re.IGNORECASE)
_RE_PROTO = re.compile(r"^Proto(?:\s+(\d+))?$", re.IGNORECASE)
_RE_DEMO = re.compile(r"^Demo$", re.IGNORECASE)
_RE_KIOSK = re.compile(r"^Kiosk(?:\s+Demo)?$", re.IGNORECASE)
_RE_SAMPLE = re.compile(r"^Sample$", re.IGNORECASE)
_RE_UNL = re.compile(r"^Unl$", re.IGNORECASE)  # unlicensed

# Groups in square brackets (e.g. "[BIOS]", "[b]")
_RE_SQUARE_TAG = re.compile(r"^\[([^\]]+)\]$")


class RomMeta(BaseModel):
    """Parsed metadata from a No-Intro ROM filename."""

    title: str
    regions: list[str] = Field(default_factory=list)
    languages: list[str] = Field(default_factory=list)
    release_type: str | None = None  # "Beta" | "Proto" | "Demo" | "Kiosk" | "Sample" | "Unl" | None
    release_num: int | None = None   # e.g. 2 for "Beta 2"
    revision: str | None = None      # e.g. "Rev 1", "v1.1"
    features: list[str] = Field(default_factory=list)
    date: str | None = None
    is_bios: bool = False
    extension: str = ""


def parse_rom_filename(filename: str) -> RomMeta:
    """Parse a No-Intro/Redump ROM filename into structured metadata.

    Args:
        filename: The raw filename including extension.

    Returns:
        RomMeta with all parsed fields.
    """
    p = Path(filename)
    # Use only the last extension (.zip, .7z, .nds, etc.) — pathlib's p.stem
    # correctly strips only the final dot, avoiding false splits on titles like
    # "No. 1", "Jr.", "S.W.A.R.M.", "1.000", "Bit.Trip", etc.
    extension = p.suffix
    stem = p.stem

    # ── Square-bracket prefix tags (e.g. "[BIOS]") ─────────────────────────
    is_bios = False
    square_tags: list[str] = []
    while stem.startswith("["):
        m = _RE_SQUARE_TAG.match(stem.split(")")[0].split(" ")[0] if " " in stem else stem)
        bracket_end = stem.find("]")
        if bracket_end == -1:
            break
        tag_content = stem[1:bracket_end]
        square_tags.append(tag_content)
        if tag_content.upper() == "BIOS":
            is_bios = True
        stem = stem[bracket_end + 1 :].lstrip()

    # ── Split title from parenthesized groups ───────────────────────────────
    # Title is everything before the first "("
    paren_start = stem.find("(")
    if paren_start == -1:
        return RomMeta(
            title=stem.strip(),
            is_bios=is_bios,
            extension=extension,
        )

    raw_title = stem[:paren_start].strip()

    # Extract all parenthesized groups
    groups: list[str] = re.findall(r"\(([^)]*)\)", stem)

    # ── Classify each group ──────────────────────────────────────────────────
    regions: list[str] = []
    languages: list[str] = []
    release_type: str | None = None
    release_num: int | None = None
    revision: str | None = None
    features: list[str] = []
    date: str | None = None

    for group in groups:
        group = group.strip()
        if not group:
            continue

        # Date: YYYY-MM-DD
        if _RE_DATE.match(group):
            date = group
            continue

        # Revision: "Rev 1", "Rev A", "v1.1"
        if _RE_REVISION.match(group):
            revision = group
            continue

        # Release types
        m_beta = _RE_BETA.match(group)
        if m_beta:
            release_type = "Beta"
            release_num = int(m_beta.group(1)) if m_beta.group(1) else None
            continue

        m_proto = _RE_PROTO.match(group)
        if m_proto:
            release_type = "Proto"
            release_num = int(m_proto.group(1)) if m_proto.group(1) else None
            continue

        if _RE_DEMO.match(group):
            release_type = "Demo"
            continue

        if _RE_KIOSK.match(group):
            release_type = "Kiosk"
            continue

        if _RE_SAMPLE.match(group):
            release_type = "Sample"
            continue

        if _RE_UNL.match(group):
            release_type = "Unlicensed"
            continue

        # Region: comma-separated list where ALL items are known regions
        # No-Intro uses ", " (with space) between regions
        parts = [p.strip() for p in group.split(",")]
        if parts and all(p in KNOWN_REGIONS for p in parts):
            regions.extend(parts)
            continue

        # Language codes: comma-separated 2-letter codes (no space after comma)
        # e.g. "En,Fr,Es" or "En, Fr" — be flexible with spacing
        lang_parts = [p.strip() for p in group.split(",")]
        if len(lang_parts) >= 1 and all(p in KNOWN_LANG_CODES for p in lang_parts):
            languages.extend(lang_parts)
            continue

        # Everything else is a feature tag
        features.append(group)

    return RomMeta(
        title=raw_title,
        regions=regions,
        languages=languages,
        release_type=release_type,
        release_num=release_num,
        revision=revision,
        features=features,
        date=date,
        is_bios=is_bios,
        extension=extension,
    )
