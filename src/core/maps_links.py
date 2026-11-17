"""Google Maps official URL builders (pure string formatting, no network)."""


def pin_url(lat: float, lon: float) -> str:
    """Build Google Maps search pin URL at 6 decimals. Time: O(1); Space: O(1)."""
    return f"https://www.google.com/maps/search/?api=1&query={lat:.6f},{lon:.6f}"


def directions_url(lat0: float, lon0: float, lat: float, lon: float) -> str:
    """Build Google Maps walking directions URL at 6 decimals. Time: O(1); Space: O(1)."""
    return (
        f"https://www.google.com/maps/dir/?api=1"
        f"&origin={lat0:.6f},{lon0:.6f}&destination={lat:.6f},{lon:.6f}&travelmode=walking"
    )
