"""Unit tests for core/algorithm.py (SPEC §6.4-§6.8)."""

from datetime import date
import json
from pathlib import Path
import sys
import unittest

SRC_DIR = Path(__file__).resolve().parent.parent
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

EXPECTED_DIR = SRC_DIR / "data" / "expected"


class TestAlgorithm(unittest.TestCase):
    """Verify Haversine, filtering, comparison, Insertion Sort, trace, and counts."""

    def setUp(self) -> None:
        from core import algorithm, validation
        self.alg = algorithm
        self.val = validation
        self.um_matina = (7.0657, 125.5966)
        self.today = date(2026, 11, 16)

    def test_landmarks_catalog_and_um_matina_exact(self) -> None:
        """LANDMARKS dict -> 15 Davao hubs inside bounding box with exact UM Matina coords."""
        landmarks = self.alg.LANDMARKS
        self.assertEqual(len(landmarks), 15)
        self.assertEqual(landmarks["UM Matina Campus"], (7.0657, 125.5966))
        for name, (lat, lon) in landmarks.items():
            self.assertTrue(6.90 <= lat <= 7.60, f"{name} lat out of box: {lat}")
            self.assertTrue(125.20 <= lon <= 125.75, f"{name} lon out of box: {lon}")

    def test_haversine_m_zero_and_anchor_points(self) -> None:
        """UM Matina to P1..P6 anchors -> exact integer meters (200, 373, 600, 914, 1413, 1826)."""
        lat0, lon0 = self.um_matina
        self.assertEqual(self.alg.haversine_m(lat0, lon0, lat0, lon0), 0)
        anchors = [
            ((7.0675, 125.5966), 200),
            ((7.0630, 125.5986), 373),
            ((7.0702, 125.5936), 600),
            ((7.0585, 125.6006), 914),
            ((7.0540, 125.5916), 1413),
            ((7.0810, 125.6026), 1826),
        ]
        for (lat, lon), expected_m in anchors:
            d1 = self.alg.haversine_m(lat0, lon0, lat, lon)
            d2 = self.alg.haversine_m(lat, lon, lat0, lon0)
            self.assertEqual(d1, d2)
            self.assertAlmostEqual(d1, expected_m, delta=1)
            self.assertEqual(d1, expected_m)

    def test_matches_all_filter_combinations_and_mixed_gender(self) -> None:
        """matches(listing, B, T, G, include_full) -> respects slots, budget, type, and Mixed gender rule."""
        sample = {
            "listing_id": "M1",
            "type": "Dorm",
            "monthly_rent": 3000,
            "available_slots": 2,
            "gender_policy": "Mixed",
        }
        self.assertTrue(self.alg.matches(sample, None, "ALL", "ANY", False))
        self.assertTrue(self.alg.matches(sample, 3000, "Dorm", "Female", False))
        self.assertTrue(self.alg.matches(sample, 3000, "Dorm", "Male", False))
        self.assertFalse(self.alg.matches(sample, 2999, "Dorm", "ANY", False))
        self.assertFalse(self.alg.matches(sample, 3000, "Room", "ANY", False))

        female_only = dict(sample, gender_policy="Female")
        self.assertTrue(self.alg.matches(female_only, None, "ALL", "Female", False))
        self.assertFalse(self.alg.matches(female_only, None, "ALL", "Male", False))

        full_item = dict(sample, available_slots=0)
        self.assertFalse(self.alg.matches(full_item, None, "ALL", "ANY", False))
        self.assertTrue(self.alg.matches(full_item, None, "ALL", "ANY", True))

    def test_greater_distance_and_rent_modes_with_strict_ties(self) -> None:
        """greater(a, b, sort_by) -> primary key, secondary tie-breaker, False on exact ties."""
        a = {"listing_id": "A", "distance_m": 500, "monthly_rent": 3000}
        b = {"listing_id": "B", "distance_m": 300, "monthly_rent": 4000}
        c = {"listing_id": "C", "distance_m": 500, "monthly_rent": 2500}
        d = {"listing_id": "D", "distance_m": 500, "monthly_rent": 3000}

        self.assertTrue(self.alg.greater(a, b, "distance"))
        self.assertFalse(self.alg.greater(b, a, "distance"))
        self.assertTrue(self.alg.greater(a, c, "distance"))
        self.assertFalse(self.alg.greater(c, a, "distance"))
        self.assertFalse(self.alg.greater(a, d, "distance"))

        self.assertTrue(self.alg.greater(b, a, "rent"))
        self.assertFalse(self.alg.greater(a, b, "rent"))
        e = {"listing_id": "E", "distance_m": 200, "monthly_rent": 3000}
        self.assertTrue(self.alg.greater(a, e, "rent"))
        self.assertFalse(self.alg.greater(e, a, "rent"))
        self.assertFalse(self.alg.greater(a, d, "rent"))

    def test_insertion_sort_empty_and_single_element(self) -> None:
        """k=0 and k=1 inputs -> empty trace and zero comparisons/shifts."""
        res0, trace0, counts0 = self.alg.insertion_sort([], sort_by="distance")
        self.assertEqual(res0, [])
        self.assertEqual(trace0, [])
        self.assertEqual(counts0, {"comparisons": 0, "shifts": 0})

        one = [{"listing_id": "S1", "distance_m": 200, "monthly_rent": 3000}]
        res1, trace1, counts1 = self.alg.insertion_sort(one, sort_by="distance")
        self.assertEqual([x["listing_id"] for x in res1], ["S1"])
        self.assertEqual(trace1, [])
        self.assertEqual(counts1, {"comparisons": 0, "shifts": 0})

    def test_non_mutation_of_caller_list_and_dicts(self) -> None:
        """insertion_sort and rank_listings -> never mutate caller list or listing dicts."""
        raw = [
            {
                "listing_id": "L1",
                "name": "Far Room",
                "type": "Room",
                "address": "Maa Rd",
                "lat": 7.0810,
                "lon": 125.6026,
                "monthly_rent": 3500,
                "available_slots": 2,
                "gender_policy": "Mixed",
                "contact": "0900-000-0001",
                "last_updated": date(2026, 11, 10),
                "notes": "",
            },
            {
                "listing_id": "L2",
                "name": "Near Room",
                "type": "Room",
                "address": "Matina Gate",
                "lat": 7.0675,
                "lon": 125.5966,
                "monthly_rent": 2500,
                "available_slots": 2,
                "gender_policy": "Mixed",
                "contact": "0900-000-0002",
                "last_updated": date(2026, 11, 10),
                "notes": "",
            },
        ]
        snapshot_ids = [x["listing_id"] for x in raw]
        ranked, _, _ = self.alg.rank_listings(raw, self.um_matina)
        self.assertEqual([x["listing_id"] for x in raw], snapshot_ids)
        for item in raw:
            self.assertNotIn("distance_m", item)
        self.assertEqual([x["listing_id"] for x in ranked], ["L2", "L1"])

    def test_golden_files_tc1_through_tc5(self) -> None:
        """All golden JSONs (tc1_distance, tc1_rent, tc2, tc3, tc4_*, tc5) -> exact order, trace, and counts."""
        golden_files = [
            "tc1_distance.json",
            "tc1_rent.json",
            "tc2.json",
            "tc3.json",
            "tc4_empty.json",
            "tc4_single.json",
            "tc4_no_match.json",
            "tc5.json",
        ]
        for fname in golden_files:
            with self.subTest(golden=fname):
                expected = json.loads((EXPECTED_DIR / fname).read_text(encoding="utf-8"))
                csv_path = SRC_DIR / "data" / expected["csv_file"]
                listings, errors = self.val.load_csv(str(csv_path), self.today)
                self.assertEqual(len(listings), expected["loaded"])
                self.assertEqual(len(errors), len(expected["error_prefixes"]))
                for err, prefix in zip(errors, expected["error_prefixes"]):
                    self.assertTrue(err.startswith(prefix), f"Expected prefix '{prefix}', got '{err}'")

                p = expected["params"]
                ranked, trace, counts = self.alg.rank_listings(
                    listings,
                    tuple(p["landmark_coords"]),
                    budget=p["budget"],
                    room_type=p["room_type"],
                    gender=p["gender"],
                    include_full=p["include_full"],
                    sort_by=p["sort_by"],
                )
                self.assertEqual([x["listing_id"] for x in ranked], expected["ranked_ids"])
                for x in ranked:
                    self.assertEqual(x["distance_m"], expected["distances_m"][x["listing_id"]])
                self.assertEqual(counts, expected["counts"])
                self.assertEqual(len(trace), len(expected["trace"]))
                for actual_step, exp_step in zip(trace, expected["trace"]):
                    for key in ("step", "pass", "action", "indices", "key", "state"):
                        self.assertEqual(actual_step[key], exp_step[key])
                    self.assertIsInstance(actual_step.get("note"), str)
                    self.assertTrue(len(actual_step["note"].strip()) > 0)


if __name__ == "__main__":
    unittest.main()
