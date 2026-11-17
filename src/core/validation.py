"""CSV and user-input validation for BoardFinder Davao (pure Python stdlib)."""

import csv
from datetime import date
import io
import math

DAVAO_LAT_MIN = 6.90
DAVAO_LAT_MAX = 7.60
DAVAO_LON_MIN = 125.20
DAVAO_LON_MAX = 125.75

REQUIRED_COLUMNS = (
    "listing_id",
    "name",
    "type",
    "address",
    "lat",
    "lon",
    "monthly_rent",
    "available_slots",
    "gender_policy",
    "contact",
    "last_updated",
)
ALL_COLUMNS = REQUIRED_COLUMNS + ("notes",)

TYPE_MAP = {
    "bedspace": "Bedspace",
    "boarding house": "Boarding House",
    "dorm": "Dorm",
    "apartment": "Apartment",
    "room": "Room",
}
GENDER_MAP = {"male": "Male", "female": "Female", "mixed": "Mixed"}


def _parse_strict_int(text: str) -> int | None:
    """Parse strict base-10 integer string without decimals or booleans."""
    s = text.strip()
    if not s:
        return None
    digits = s[1:] if s[0] in ("+", "-") else s
    if not digits.isdigit():
        return None
    return int(s)


def _parse_finite_float(text: str) -> float | None:
    """Parse finite float; return None on NaN/inf/invalid."""
    s = text.strip()
    if not s:
        return None
    try:
        val = float(s)
    except ValueError:
        return None
    return val if math.isfinite(val) else None


def validate_budget(text: str) -> tuple[int | None, str | None]:
    """Validate optional budget input (blank=None, or int 1..100000). Time: O(1); Space: O(1)."""
    s = text.strip()
    if not s:
        return None, None
    val = _parse_strict_int(s)
    if val is None or val < 1 or val > 100000:
        return None, "Budget must be a whole number from 1 to 100000"
    return val, None


def validate_coordinates(lat_text: str, lon_text: str) -> tuple[tuple[float, float] | None, str | None]:
    """Validate custom coordinates inside Davao City bounding box. Time: O(1); Space: O(1)."""
    lat = _parse_finite_float(lat_text)
    lon = _parse_finite_float(lon_text)
    if lat is None or lon is None:
        return None, "Coordinates must be valid numbers"
    if not (DAVAO_LAT_MIN <= lat <= DAVAO_LAT_MAX and DAVAO_LON_MIN <= lon <= DAVAO_LON_MAX):
        return None, "Coordinates must be inside Davao City area (lat 6.90..7.60, lon 125.20..125.75)"
    return (lat, lon), None


def validate_today(text: str) -> tuple[date | None, str | None]:
    """Validate YYYY-MM-DD calendar date string. Time: O(1); Space: O(1)."""
    s = text.strip()
    if len(s) != 10 or s[4] != "-" or s[7] != "-":
        return None, "Today date must be YYYY-MM-DD"
    try:
        return date.fromisoformat(s), None
    except ValueError:
        return None, "Today date is not a valid calendar date"


def _bad(row_num: int, field: str, value: str, allowed: str) -> tuple[None, str]:
    """Build a row error that shows the bad value and what is allowed."""
    shown = value if len(value) <= 30 else value[:30] + "..."
    return None, f"Row {row_num}: {field} '{shown}' is not valid. Allowed: {allowed}"


def _validate_row(raw: dict, row_num: int, today: date, seen_ids: set[str]) -> tuple[dict | None, str | None]:
    """Validate one CSV row in SPEC §6.2 column order; return (clean_dict, error)."""
    lid = (raw.get("listing_id") or "").strip()
    if not lid or len(lid) > 40:
        return _bad(row_num, "listing_id", lid, "1 to 40 characters")
    if lid in seen_ids:
        return None, f"Row {row_num}: listing_id '{lid}' is a duplicate (each id may be used once)"
    name = (raw.get("name") or "").strip()
    if not name or len(name) > 80:
        return _bad(row_num, "name", name, "1 to 80 characters")
    type_text = (raw.get("type") or "").strip()
    rtype = TYPE_MAP.get(type_text.lower())
    if rtype is None:
        return _bad(row_num, "type", type_text, "Bedspace, Boarding House, Dorm, Apartment, Room")
    addr = (raw.get("address") or "").strip()
    if not addr or len(addr) > 120:
        return _bad(row_num, "address", addr, "1 to 120 characters")
    lat_text = (raw.get("lat") or "").strip()
    lat = _parse_finite_float(lat_text)
    if lat is None or not (DAVAO_LAT_MIN <= lat <= DAVAO_LAT_MAX):
        return _bad(row_num, "lat (outside Davao City area)", lat_text, "a number from 6.90 to 7.60")
    lon_text = (raw.get("lon") or "").strip()
    lon = _parse_finite_float(lon_text)
    if lon is None or not (DAVAO_LON_MIN <= lon <= DAVAO_LON_MAX):
        return _bad(row_num, "lon (outside Davao City area)", lon_text, "a number from 125.20 to 125.75")
    rent_text = (raw.get("monthly_rent") or "").strip()
    rent = _parse_strict_int(rent_text)
    if rent is None or rent < 1 or rent > 100000:
        return _bad(row_num, "monthly_rent", rent_text, "a whole number from 1 to 100000")
    slots_text = (raw.get("available_slots") or "").strip()
    slots = _parse_strict_int(slots_text)
    if slots is None or slots < 0 or slots > 500:
        return _bad(row_num, "available_slots", slots_text, "a whole number from 0 to 500")
    gender_text = (raw.get("gender_policy") or "").strip()
    gender = GENDER_MAP.get(gender_text.lower())
    if gender is None:
        return _bad(row_num, "gender_policy", gender_text, "Male, Female, Mixed")
    contact = (raw.get("contact") or "").strip()
    if not contact or len(contact) > 60:
        return _bad(row_num, "contact", contact, "1 to 60 characters")
    date_text = (raw.get("last_updated") or "").strip()
    updated, err = validate_today(date_text)
    if err is not None or updated > today:
        return _bad(row_num, "last_updated", date_text, "a date like 2026-11-16 that is not in the future")
    notes = (raw.get("notes") or "").strip()
    if len(notes) > 200:
        return None, f"Row {row_num}: notes is too long ({len(notes)} characters, the limit is 200)"
    seen_ids.add(lid)
    return {
        "listing_id": lid, "name": name, "type": rtype, "address": addr,
        "lat": lat, "lon": lon, "monthly_rent": rent, "available_slots": slots,
        "gender_policy": gender, "contact": contact, "last_updated": updated, "notes": notes,
    }, None


def _missing_column_error(header_row: list[str], header_fields: list[str]) -> str | None:
    """Return a 'Missing column' message (with a semicolon hint when it applies) or None."""
    for req in REQUIRED_COLUMNS:
        if req not in header_fields:
            msg = f"Missing column: {req}"
            if len(header_row) == 1 and ";" in header_row[0]:
                msg += " (this file looks semicolon-separated; save it as a comma-separated CSV)"
            return msg
    return None


def parse_rows(text: str, today: date) -> tuple[list[dict], list[str]]:
    """Parse CSV text (header + rows) with the csv module so quoted fields may span lines. Time: O(n); Space: O(n)."""
    reader = csv.reader(io.StringIO(text, newline=""))
    header_fields: list[str] | None = None
    listings: list[dict] = []
    errors: list[str] = []
    seen_ids: set[str] = set()
    seen_places: dict[tuple, str] = {}
    prev_line = 0
    for cells in reader:
        row_num = prev_line + 1  # file line where this record starts
        prev_line = reader.line_num
        if not any(c.strip() for c in cells):
            continue
        if header_fields is None:
            header_fields = [col.strip() for col in cells]
            missing = _missing_column_error(cells, header_fields)
            if missing:
                return [], [missing]
            continue
        raw = {header_fields[i]: (cells[i] if i < len(cells) else "") for i in range(len(header_fields)) if header_fields[i]}
        item, err = _validate_row(raw, row_num, today, seen_ids)
        if item is not None:
            place = (item["name"].lower(), item["lat"], item["lon"])
            if place in seen_places:
                err = f"Row {row_num}: duplicate of {seen_places[place]} (same name and same coordinates)"
                item = None
            else:
                seen_places[place] = item["listing_id"]
        if err is not None:
            errors.append(err)
        elif item is not None:
            listings.append(item)
    if header_fields is None:
        return [], ["Empty CSV: missing header"]
    return listings, errors


def parse_csv_text(text: str, today: date) -> tuple[list[dict], list[str]]:
    """Parse UTF-8 CSV text into validated listings and row errors. Time: O(n); Space: O(n)."""
    cleaned = text.lstrip("\ufeff")
    return parse_rows(cleaned, today)


def load_csv(path: str, today: date) -> tuple[list[dict], list[str]]:
    """Load and validate CSV file from disk. Time: O(n); Space: O(n)."""
    with open(path, "r", encoding="utf-8") as fh:
        return parse_csv_text(fh.read(), today)
