"""Core ranking and distance algorithms for BoardFinder Davao (pure Python stdlib)."""

import math

LANDMARKS = {
    "UM Matina Campus": (7.0657, 125.5966),
    "UM Bolton Campus": (7.0672, 125.6096),
    "Ateneo de Davao University (Jacinto)": (7.0727, 125.6123),
    "USeP Obrero": (7.0861, 125.6169),
    "UIC Bajada": (7.1011, 125.6213),
    "SPMC": (7.0985, 125.6194),
    "Davao City Hall (Downtown)": (7.0647, 125.6088),
    "SM City Davao (Ecoland)": (7.0494, 125.5882),
    "SM Lanang / IT Park": (7.0990, 125.6305),
    "Abreeza / Bajada Hub": (7.0915, 125.6114),
    "Buhangin (Milan)": (7.0980, 125.6190),
    "Panacan / Sasa": (7.1515, 125.6587),
    "Mintal / UP Mindanao": (7.0848, 125.4843),
    "Toril (Poblacion)": (7.0185, 125.4970),
    "Calinan (Poblacion)": (7.1880, 125.4510),
}


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> int:
    """Compute straight-line distance in rounded meters. Time: O(1)/Omega(1)/Theta(1); Space: O(1)."""
    radius_m = 6371000.0
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lam = math.radians(lon2 - lon1)
    h = math.sin(d_phi / 2.0) ** 2 + math.cos(phi1) * math.cos(phi2) * (math.sin(d_lam / 2.0) ** 2)
    if h > 1.0:
        h = 1.0
    dist = 2.0 * radius_m * math.asin(math.sqrt(h))
    return int(dist + 0.5)


def matches(listing: dict, budget: int | None, room_type: str, gender: str, include_full: bool) -> bool:
    """Return True if listing meets all active filter rules. Time: O(1)/Omega(1)/Theta(1); Space: O(1)."""
    if not include_full and listing["available_slots"] <= 0:
        return False
    if budget is not None and listing["monthly_rent"] > budget:
        return False
    if room_type != "ALL" and listing["type"] != room_type:
        return False
    if gender != "ANY":
        policy = listing["gender_policy"]
        if policy != gender and policy != "Mixed":
            return False
    return True


def greater(a: dict, b: dict, sort_by: str) -> bool:
    """Strict comparison for stable Insertion Sort. Time: O(1)/Omega(1)/Theta(1); Space: O(1)."""
    if sort_by == "rent":
        if a["monthly_rent"] != b["monthly_rent"]:
            return a["monthly_rent"] > b["monthly_rent"]
        return a["distance_m"] > b["distance_m"]
    if a["distance_m"] != b["distance_m"]:
        return a["distance_m"] > b["distance_m"]
    return a["monthly_rent"] > b["monthly_rent"]


def _state_ids(items: list[dict]) -> list[str]:
    """Return snapshot list of listing_ids. Time: O(k); Space: O(k)."""
    ids = []
    for item in items:
        ids.append(item["listing_id"])
    return ids


def _make_step(step: int, pass_num: int, action: str, indices: list[int], key_id: str, items: list[dict], note: str) -> dict:
    """Build one trace step dict. Time: O(k); Space: O(k)."""
    return {
        "step": step,
        "pass": pass_num,
        "action": action,
        "indices": indices,
        "key": key_id,
        "state": _state_ids(items),
        "note": note,
    }


def _record(trace: list, on: bool, step: int, i: int, action: str, indices: list, key_id: str, A: list, note: str) -> None:
    """Append one trace step when tracing is on. Time: O(k) when on (state snapshot), O(1) off; Space: O(k)."""
    if on:
        trace.append(_make_step(step, i, action, indices, key_id, A, note))


def insertion_sort(
    listings: list[dict], sort_by: str = "distance", record_trace: bool = True
) -> tuple[list[dict], list[dict], dict]:
    """Sort a copy of listings ascending via Insertion Sort. Time: O(k^2) worst, Omega(k) best, Theta(k^2) avg; Space: O(1) extra.

    record_trace=False skips the per-step snapshots (each one costs O(k)); the order and counts are identical.
    """
    A = [dict(item) for item in listings]
    k = len(A)
    trace: list[dict] = []
    comparisons = 0
    shifts = 0
    step = 0
    for i in range(1, k):
        key = A[i]
        key_id = key["listing_id"]
        j = i - 1
        while j >= 0 and greater(A[j], key, sort_by):
            comparisons += 1
            step += 1
            note = f"{A[j]['listing_id']} > key {key_id} -> shift"
            _record(trace, record_trace, step, i, "compare", [j, j + 1], key_id, A, note)
            A[j + 1] = A[j]
            shifts += 1
            step += 1
            _record(trace, record_trace, step, i, "shift", [j, j + 1], key_id, A, f"Shift {A[j]['listing_id']} to {j + 1}")
            j = j - 1
        if j >= 0:
            comparisons += 1
            step += 1
            note = f"{A[j]['listing_id']} <= key {key_id} -> stop"
            _record(trace, record_trace, step, i, "compare", [j, j + 1], key_id, A, note)
        A[j + 1] = key
        step += 1
        _record(trace, record_trace, step, i, "insert", [j + 1], key_id, A, f"Insert key {key_id} at {j + 1}")
    return A, trace, {"comparisons": comparisons, "shifts": shifts}


def rank_listings(
    listings: list[dict],
    landmark: tuple[float, float],
    budget: int | None = None,
    room_type: str = "ALL",
    gender: str = "ANY",
    include_full: bool = False,
    sort_by: str = "distance",
    trace_cap: int | None = None,
) -> tuple[list[dict], list[dict], dict]:
    """Filter listings and rank via Insertion Sort. Time: O(n + k^2) worst, Omega(n) best, Theta(n + k^2) avg; Space: O(k) filtered.

    If trace_cap is given and more than trace_cap listings match, no trace is recorded (the trace is empty).
    """
    lat0, lon0 = landmark
    A: list[dict] = []
    for x in listings:
        copy_x = dict(x)
        copy_x["distance_m"] = haversine_m(lat0, lon0, copy_x["lat"], copy_x["lon"])
        if matches(copy_x, budget, room_type, gender, include_full):
            A.append(copy_x)
    record = trace_cap is None or len(A) <= trace_cap
    return insertion_sort(A, sort_by, record)
