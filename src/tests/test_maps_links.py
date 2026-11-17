"""Unit tests for core/maps_links.py (SPEC §6.4)."""

from pathlib import Path
import sys
import unittest

SRC_DIR = Path(__file__).resolve().parent.parent
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))


class TestMapsLinks(unittest.TestCase):
    """Verify official Google Maps search pin and walking directions URLs with 6 decimals."""

    def setUp(self) -> None:
        from core import maps_links
        self.maps = maps_links

    def test_pin_url_formats_six_decimals(self) -> None:
        """pin_url(7.0657, 125.5966) -> exact Google Maps search URL with 6 decimal places."""
        url = self.maps.pin_url(7.0657, 125.5966)
        self.assertEqual(
            url,
            "https://www.google.com/maps/search/?api=1&query=7.065700,125.596600",
        )

    def test_directions_url_formats_six_decimals_walking(self) -> None:
        """directions_url(lat0, lon0, lat, lon) -> exact Google Maps walking directions URL."""
        url = self.maps.directions_url(7.0657, 125.5966, 7.0675, 125.5966)
        self.assertEqual(
            url,
            "https://www.google.com/maps/dir/?api=1&origin=7.065700,125.596600"
            "&destination=7.067500,125.596600&travelmode=walking",
        )


if __name__ == "__main__":
    unittest.main()
