"""Contract tests for core/service.py (SPEC §6.11)."""

from pathlib import Path
import sys
import unittest

SRC_DIR = Path(__file__).resolve().parent.parent
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

HEADER = (
    "listing_id,name,type,address,lat,lon,monthly_rent,"
    "available_slots,gender_policy,contact,last_updated,notes"
)


class TestService(unittest.TestCase):
    """Verify handle_landmarks and handle_rank 200/400/413 shapes, trace cap, and fuzz safety."""

    def setUp(self) -> None:
        from core import service
        self.svc = service

    def test_handle_landmarks_200_shape(self) -> None:
        """handle_landmarks() -> (200, {'landmarks': 15 hubs, 'bbox': Davao bounds})."""
        status, body = self.svc.handle_landmarks()
        self.assertEqual(status, 200)
        self.assertIn("landmarks", body)
        self.assertEqual(len(body["landmarks"]), 15)
        self.assertEqual(
            body["bbox"],
            {"lat_min": 6.90, "lat_max": 7.60, "lon_min": 125.20, "lon_max": 125.75},
        )
        first = body["landmarks"][0]
        self.assertIn("name", first)
        self.assertIn("lat", first)
        self.assertIn("lon", first)

    def test_handle_rank_200_tc1_and_enriched_fields(self) -> None:
        """handle_rank on tc1 -> 200 with ranked results, YYYY-MM-DD, stale flag, URLs, formulas."""
        status, body = self.svc.handle_rank({
            "dataset": "tc1",
            "landmark": "UM Matina Campus",
            "budget": "4000",
            "room_type": "ALL",
            "gender": "Female",
            "include_full": False,
            "sort_by": "distance",
            "today": "2026-11-16",
        })
        self.assertEqual(status, 200)
        self.assertTrue(body["ok"])
        self.assertEqual(body["loaded"], 8)
        self.assertEqual(body["matched"], 5)
        self.assertFalse(body["trace_truncated"])
        self.assertEqual(body["counts"], {"comparisons": 8, "shifts": 6})
        self.assertEqual(body["formulas"], {"best": 4, "worst": 10})
        self.assertEqual([r["listing_id"] for r in body["results"]], ["L7", "L5", "L8", "L4", "L6"])

        by_id = {r["listing_id"]: r for r in body["results"]}
        self.assertTrue(by_id["L5"]["stale"])
        self.assertFalse(by_id["L7"]["stale"])
        self.assertEqual(by_id["L7"]["last_updated"], "2026-11-15")
        self.assertTrue(by_id["L7"]["pin_url"].startswith("https://www.google.com/maps/search/?api=1&query="))
        self.assertTrue(by_id["L7"]["directions_url"].startswith("https://www.google.com/maps/dir/?api=1&origin="))

    def test_handle_rank_custom_landmark_and_all_datasets(self) -> None:
        """handle_rank supports 'Custom' landmark and all named datasets (demo, tc1..tc5)."""
        for ds in ("demo", "tc1", "tc2", "tc3", "tc4_empty", "tc4_single", "tc5"):
            status, body = self.svc.handle_rank({
                "dataset": ds,
                "landmark": "Custom",
                "custom_lat": "7.0657",
                "custom_lon": "125.5966",
                "today": "2026-11-16",
            })
            self.assertEqual(status, 200, f"Dataset {ds} failed: {body}")
            self.assertTrue(body["ok"])

    def test_handle_rank_trace_cap_above_50(self) -> None:
        """When k > 50 -> trace is [] and trace_truncated is True while counts remain exact."""
        rows = [HEADER]
        for idx in range(1, 56):
            rent = 5000 - idx * 10
            rows.append(
                f"R{idx:02d},Room {idx},Room,Matina Davao,7.0675,125.5966,"
                f"{rent},2,Mixed,0900-000-{idx:04d},2026-11-10,Note"
            )
        status, body = self.svc.handle_rank({
            "csv_text": "\n".join(rows),
            "landmark": "UM Matina Campus",
            "sort_by": "rent",
            "today": "2026-11-16",
        })
        self.assertEqual(status, 200)
        self.assertEqual(body["matched"], 55)
        self.assertEqual(body["trace"], [])
        self.assertTrue(body["trace_truncated"])
        self.assertEqual(body["counts"], {"comparisons": 55 * 54 // 2, "shifts": 55 * 54 // 2})

    def test_handle_rank_400_and_413_error_contracts(self) -> None:
        """Bad inputs return 400; >256 KB or >1000 data rows return 413; never 500."""
        bad_payloads = [
            None,
            [],
            "not-a-dict",
            {"dataset": "nonexistent"},
            {"landmark": "Unknown Hub"},
            {"landmark": "Custom", "custom_lat": "14.5995", "custom_lon": "125.5966"},
            {"budget": "-10"},
            {"room_type": "Mansion"},
            {"gender": "Unknown"},
            {"include_full": "false"},
            {"sort_by": "popularity"},
            {"today": "2026-02-30"},
            {"csv_text": "   "},
            {"csv_text": "listing_id,name\nL1,Test\n"},
        ]
        for payload in bad_payloads:
            status, body = self.svc.handle_rank(payload)  # type: ignore[arg-type]
            self.assertEqual(status, 400, f"Expected 400 for {payload}, got {status}: {body}")
            self.assertFalse(body.get("ok", True))
            self.assertIsInstance(body.get("error"), str)

        many_rows = [HEADER] + [
            f"ID{i},Room {i},Room,Matina,7.0675,125.5966,2500,1,Mixed,0900,2026-11-10,"
            for i in range(1001)
        ]
        s_rows, b_rows = self.svc.handle_rank({"csv_text": "\n".join(many_rows)})
        self.assertEqual(s_rows, 413)
        self.assertFalse(b_rows["ok"])

        oversized_csv = HEADER + "\n" + ("A" * 270000)
        s_big, b_big = self.svc.handle_rank({"csv_text": oversized_csv})
        self.assertEqual(s_big, 413)
        self.assertFalse(b_big["ok"])


if __name__ == "__main__":
    unittest.main()
