"""Framework-free API service layer for BoardFinder Davao."""

import csv
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
import os

from core.algorithm import LANDMARKS, rank_listings
from core.maps_links import directions_url, pin_url
from core.validation import (
    DAVAO_LAT_MAX,
    DAVAO_LAT_MIN,
    DAVAO_LON_MAX,
    DAVAO_LON_MIN,
    TYPE_MAP,
    load_csv,
    parse_csv_text,
    validate_budget,
    validate_coordinates,
    validate_today,
)

MAX_BYTES = 262144
MAX_DATA_ROWS = 1000
TRACE_CAP = 50
MANILA = timezone(timedelta(hours=8))  # Philippines has no daylight saving time
DATA_DIR = Path(__file__).resolve().parent.parent / "data"
DATASETS = {
    "demo": "listings_demo.csv",
    "research": "listings_research.csv",  # optional: real listings gathered from public sources
    "tc1": "tc1.csv",
    "tc2": "tc2.csv",
    "tc3": "tc3.csv",
    "tc4_empty": "tc4_empty.csv",
    "tc4_single": "tc4_single.csv",
    "tc5": "tc5.csv",
}
EXTRAS_FILE = DATA_DIR / "listings_research_extras.csv"
RESEARCH_FILE = DATA_DIR / "listings_research.csv"


def _load_research_extras() -> dict[tuple[str, str], dict[str, str]]:
    """Load optional research extras metadata keyed by (listing_id, name). Time: O(n); Space: O(n)."""
    if not EXTRAS_FILE.exists() or not RESEARCH_FILE.exists():
        return {}
    names: dict[str, str] = {}
    with open(RESEARCH_FILE, "r", encoding="utf-8") as rf:
        for row in csv.DictReader(rf):
            lid = (row.get("listing_id") or "").strip()
            name = (row.get("name") or "").strip()
            if lid and name:
                names[lid] = name
    extras: dict[tuple[str, str], dict[str, str]] = {}
    with open(EXTRAS_FILE, "r", encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            lid = (row.get("listing_id") or "").strip()
            if lid and lid in names:
                extras[(lid, names[lid])] = row
    return extras


def manila_today() -> date:
    """Return today's date in Asia/Manila (the server clock may be UTC). Time: O(1); Space: O(1)."""
    return datetime.now(MANILA).date()


def _client_today_allowed() -> bool:
    """A client-sent "today" is only honoured outside production (tests, local dev). Vercel sets VERCEL."""
    return not os.environ.get("VERCEL")


def handle_landmarks() -> tuple[int, dict]:
    """Return Davao preset hubs and bounding box. Time: O(1); Space: O(1)."""
    items = [{"name": name, "lat": coords[0], "lon": coords[1]} for name, coords in LANDMARKS.items()]
    bbox = {
        "lat_min": DAVAO_LAT_MIN,
        "lat_max": DAVAO_LAT_MAX,
        "lon_min": DAVAO_LON_MIN,
        "lon_max": DAVAO_LON_MAX,
    }
    return 200, {"landmarks": items, "bbox": bbox}


def _err(status: int, message: str) -> tuple[int, dict]:
    """Return error status and JSON dict."""
    return status, {"ok": False, "error": message}


def _resolve_landmark(payload: dict) -> tuple[str, tuple[float, float]] | tuple[None, str]:
    """Resolve landmark name or Custom coordinates."""
    name = payload.get("landmark", "UM Matina Campus")
    if not isinstance(name, str):
        return None, "Unknown landmark"
    if name == "Custom":
        lat_text = str(payload.get("custom_lat", ""))
        lon_text = str(payload.get("custom_lon", ""))
        coords, err = validate_coordinates(lat_text, lon_text)
        if err is not None or coords is None:
            return None, err or "Invalid custom coordinates"
        return "Custom", coords
    if name not in LANDMARKS:
        return None, f"Unknown landmark: {name}"
    return name, LANDMARKS[name]


def _resolve_filters(payload: dict) -> dict | str:
    """Validate budget, room_type, gender, include_full, sort_by, today."""
    budget_raw = payload.get("budget", "")
    budget_str = "" if budget_raw is None else str(budget_raw)
    budget, b_err = validate_budget(budget_str)
    if b_err is not None:
        return b_err
    rt_raw = payload.get("room_type", "ALL")
    if not isinstance(rt_raw, str):
        return "Invalid room_type"
    if rt_raw.strip().upper() == "ALL":
        room_type = "ALL"
    else:
        room_type = TYPE_MAP.get(rt_raw.strip().lower(), "")
        if not room_type:
            return f"Invalid room_type: {rt_raw}"
    g_raw = payload.get("gender", "ANY")
    if not isinstance(g_raw, str):
        return "Invalid gender"
    g_low = g_raw.strip().lower()
    gender = {"any": "ANY", "male": "Male", "female": "Female", "mixed": "Mixed"}.get(g_low, "")
    if not gender:
        return f"Invalid gender: {g_raw}"
    inc = payload.get("include_full", False)
    if not isinstance(inc, bool):
        return "include_full must be a boolean"
    sort_by = payload.get("sort_by", "distance")
    if sort_by not in ("distance", "rent"):
        return f"Invalid sort_by: {sort_by}"
    today_raw = payload.get("today")
    if not _client_today_allowed() or today_raw is None or (isinstance(today_raw, str) and not today_raw.strip()):
        today_val = manila_today()
    elif isinstance(today_raw, str):
        today_val, t_err = validate_today(today_raw)
        if t_err is not None or today_val is None:
            return t_err or "Invalid today date"
    else:
        return "Invalid today date"
    return {
        "budget": budget, "room_type": room_type, "gender": gender,
        "include_full": inc, "sort_by": sort_by, "today": today_val,
    }


def _load_input_csv(payload: dict, today_val: date) -> tuple[int, list[dict], list[str]] | tuple[int, str]:
    """Load and validate CSV from csv_text or named dataset."""
    csv_text = payload.get("csv_text")
    if csv_text is not None:
        if not isinstance(csv_text, str):
            return 400, "csv_text must be a string or null"
        if len(csv_text.encode("utf-8")) > MAX_BYTES:
            return 413, "CSV exceeds 256 KB limit"
        non_blank = [ln for ln in csv_text.splitlines() if ln.strip()]
        if len(non_blank) - 1 > MAX_DATA_ROWS:
            return 413, "CSV exceeds 1000 data rows limit"
        listings, errors = parse_csv_text(csv_text, today_val)
    else:
        ds = payload.get("dataset", "demo")
        if not isinstance(ds, str) or ds not in DATASETS:
            return 400, f"Unknown dataset: {ds}"
        listings, errors = load_csv(str(DATA_DIR / DATASETS[ds]), today_val)
    if not listings and errors and (errors[0].startswith("Missing column:") or errors[0].startswith("Empty CSV:")):
        return 400, errors[0]
    return 200, listings, errors


def handle_rank(payload: dict) -> tuple[int, dict]:
    """Validate payload, rank matching listings, and return (HTTP status, JSON dict)."""
    if not isinstance(payload, dict):
        return _err(400, "Request body must be a JSON object")
    lm_res = _resolve_landmark(payload)
    if lm_res[0] is None:
        return _err(400, lm_res[1])
    lm_name, coords = lm_res
    flt = _resolve_filters(payload)
    if isinstance(flt, str):
        return _err(400, flt)
    csv_res = _load_input_csv(payload, flt["today"])
    if len(csv_res) == 2:
        return _err(csv_res[0], csv_res[1])
    _, listings, errors = csv_res
    ranked, trace, counts = rank_listings(
        listings, coords, flt["budget"], flt["room_type"],
        flt["gender"], flt["include_full"], flt["sort_by"], TRACE_CAP,
    )
    k = len(ranked)
    truncated = k > TRACE_CAP
    out_trace = [] if truncated else trace
    lat0, lon0 = coords
    extras_map = _load_research_extras()
    results = []
    for item in ranked:
        row = dict(item)
        row["stale"] = (flt["today"] - item["last_updated"]).days > 30
        row["last_updated"] = item["last_updated"].isoformat()
        row["pin_url"] = pin_url(item["lat"], item["lon"])
        row["directions_url"] = directions_url(lat0, lon0, item["lat"], item["lon"])
        ex = extras_map.get((item["listing_id"], item["name"]))
        if ex is not None:
            row["coord_accuracy"] = (ex.get("coord_accuracy") or "").strip()
            row["source_url"] = (ex.get("source_url_1") or "").strip()
            row["source_name"] = (ex.get("source_name") or "").strip()
            row["date_accessed"] = (ex.get("date_accessed") or "").strip()
            row["slots_unconfirmed"] = "slots not stated" in (item.get("notes") or "").lower()
        results.append(row)
    return 200, {
        "ok": True,
        "landmark": {"name": lm_name, "lat": lat0, "lon": lon0},
        "loaded": len(listings),
        "errors": errors,
        "matched": k,
        "results": results,
        "trace": out_trace,
        "trace_truncated": truncated,
        "counts": counts,
        "formulas": {"best": (k - 1 if k >= 1 else 0), "worst": k * (k - 1) // 2},
    }
