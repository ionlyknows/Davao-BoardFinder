"""Unit tests for core/validation.py (SPEC §6.2-§6.3)."""

from datetime import date
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
VALID_ROW = (
    "L1,Matina Student Dorm,Dorm,Matina Crossing Davao City,"
    "7.0675,125.5966,3000,2,Mixed,0900-000-0001,2026-11-10,Near gate"
)


class TestValidation(unittest.TestCase):
    """Verify CSV schema validation, row-level rules, Davao box, and user input validators."""

    def setUp(self) -> None:
        from core import validation
        self.val = validation
        self.today = date(2026, 11, 16)

    def test_empty_csv_and_header_only(self) -> None:
        """Empty string -> 'Empty CSV: missing header'; header-only -> ([], [])."""
        listings, errors = self.val.parse_csv_text("", self.today)
        self.assertEqual(listings, [])
        self.assertEqual(errors, ["Empty CSV: missing header"])

        listings_ws, errors_ws = self.val.parse_csv_text("   \n  \n", self.today)
        self.assertEqual(listings_ws, [])
        self.assertEqual(errors_ws, ["Empty CSV: missing header"])

        listings_hdr, errors_hdr = self.val.parse_csv_text(HEADER + "\n", self.today)
        self.assertEqual(listings_hdr, [])
        self.assertEqual(errors_hdr, [])

    def test_missing_required_column(self) -> None:
        """CSV missing 'monthly_rent' column -> ([], ['Missing column: monthly_rent'])."""
        bad_header = "listing_id,name,type,address,lat,lon,available_slots,gender_policy,contact,last_updated,notes\n"
        listings, errors = self.val.parse_csv_text(bad_header, self.today)
        self.assertEqual(listings, [])
        self.assertEqual(errors, ["Missing column: monthly_rent"])

    def test_extra_columns_trimming_and_case_insensitive_enums(self) -> None:
        """Extra columns ignored, whitespace trimmed, enums normalized to canonical case."""
        csv_text = (
            HEADER + ",extra_col\n"
            "  L1 , Sampaguita House , boarding house , Matina Rd , 7.0675 , 125.5966 , "
            "2500 , 3 , female , 0900-000-0001 , 2026-11-10 , quiet , ignored_val\n"
        )
        listings, errors = self.val.parse_csv_text(csv_text, self.today)
        self.assertEqual(errors, [])
        self.assertEqual(len(listings), 1)
        row = listings[0]
        self.assertEqual(row["listing_id"], "L1")
        self.assertEqual(row["name"], "Sampaguita House")
        self.assertEqual(row["type"], "Boarding House")
        self.assertEqual(row["gender_policy"], "Female")
        self.assertEqual(row["monthly_rent"], 2500)
        self.assertEqual(row["available_slots"], 3)

    def test_davao_bounding_box_boundaries_and_outside(self) -> None:
        """Exact Davao box corners (6.90..7.60, 125.20..125.75) pass; outside/NaN/inf fail."""
        csv_text = (
            HEADER + "\n"
            "B_MIN,Min Corner,Room,Toril Border,6.90,125.20,2000,1,Mixed,0900-1,2026-11-10,\n"
            "B_MAX,Max Corner,Room,Paquibato Border,7.60,125.75,2000,1,Mixed,0900-2,2026-11-10,\n"
            "BAD_LAT_LOW,Low Lat,Room,South,6.8999,125.50,2000,1,Mixed,0900-3,2026-11-10,\n"
            "BAD_LON_HIGH,High Lon,Room,East,7.06,125.7501,2000,1,Mixed,0900-4,2026-11-10,\n"
            "BAD_NAN,NaN Lat,Room,Nowhere,nan,125.59,2000,1,Mixed,0900-5,2026-11-10,\n"
            "BAD_INF,Inf Lon,Room,Nowhere,7.06,inf,2000,1,Mixed,0900-6,2026-11-10,\n"
        )
        listings, errors = self.val.parse_csv_text(csv_text, self.today)
        self.assertEqual([x["listing_id"] for x in listings], ["B_MIN", "B_MAX"])
        expected_prefixes = ["Row 4: lat", "Row 5: lon", "Row 6: lat", "Row 7: lon"]
        self.assertEqual(len(errors), len(expected_prefixes))
        for err, prefix in zip(errors, expected_prefixes):
            self.assertTrue(err.startswith(prefix), f"Expected '{prefix}', got '{err}'")

    def test_strict_integers_dates_duplicates_and_max_lengths(self) -> None:
        """Decimals, negative rent, bad slots, Feb 30, future date, duplicate ID, and max length -> Row n: field."""
        csv_text = "\n".join([
            HEADER,
            VALID_ROW,
            "L1,Dup ID,Room,Addr,7.0675,125.5966,3000,2,Mixed,0900-1,2026-11-10,",
            "L2,Decimal Rent,Room,Addr,7.0675,125.5966,3000.5,2,Mixed,0900-1,2026-11-10,",
            "L3,High Rent,Room,Addr,7.0675,125.5966,100001,2,Mixed,0900-1,2026-11-10,",
            "L4,High Slots,Room,Addr,7.0675,125.5966,3000,501,Mixed,0900-1,2026-11-10,",
            "L5,Bad Gender,Room,Addr,7.0675,125.5966,3000,2,Coed,0900-1,2026-11-10,",
            "L6,Feb 30 Date,Room,Addr,7.0675,125.5966,3000,2,Mixed,0900-1,2026-02-30,",
            "L7,Future Date,Room,Addr,7.0675,125.5966,3000,2,Mixed,0900-1,2026-11-17,",
            f"L8,{'N' * 81},Room,Addr,7.0675,125.5966,3000,2,Mixed,0900-1,2026-11-10,",
            f"L9,Valid Name,Room,Addr,7.0675,125.5966,3000,2,Mixed,0900-1,2026-11-10,{'X' * 201}",
        ])
        listings, errors = self.val.parse_csv_text(csv_text, self.today)
        self.assertEqual([x["listing_id"] for x in listings], ["L1"])
        expected_prefixes = [
            "Row 3: listing_id",
            "Row 4: monthly_rent",
            "Row 5: monthly_rent",
            "Row 6: available_slots",
            "Row 7: gender_policy",
            "Row 8: last_updated",
            "Row 9: last_updated",
            "Row 10: name",
            "Row 11: notes",
        ]
        self.assertEqual(len(errors), len(expected_prefixes))
        for err, prefix in zip(errors, expected_prefixes):
            self.assertTrue(err.startswith(prefix), f"Expected '{prefix}', got '{err}'")

    def test_user_input_validators(self) -> None:
        """validate_budget, validate_coordinates, validate_today -> (value, None) or (None, error)."""
        self.assertEqual(self.val.validate_budget(""), (None, None))
        self.assertEqual(self.val.validate_budget("4000"), (4000, None))
        for bad_b in ("0", "100001", "-500", "3500.0", "abc"):
            val, err = self.val.validate_budget(bad_b)
            self.assertIsNone(val)
            self.assertIsInstance(err, str)

        coords, err = self.val.validate_coordinates("7.0657", "125.5966")
        self.assertEqual(coords, (7.0657, 125.5966))
        self.assertIsNone(err)
        for bad_lat, bad_lon in (("14.5995", "125.5966"), ("7.06", "120.98"), ("nan", "125.59"), ("", "125.59")):
            c_val, c_err = self.val.validate_coordinates(bad_lat, bad_lon)
            self.assertIsNone(c_val)
            self.assertIsInstance(c_err, str)

        d_val, d_err = self.val.validate_today("2026-11-16")
        self.assertEqual(d_val, date(2026, 11, 16))
        self.assertIsNone(d_err)
        for bad_d in ("2026-02-30", "11/16/2026", "not-a-date"):
            dv, de = self.val.validate_today(bad_d)
            self.assertIsNone(dv)
            self.assertIsInstance(de, str)


if __name__ == "__main__":
    unittest.main()
