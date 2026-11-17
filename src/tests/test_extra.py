"""Extra tests for the finalize pass (new file; the original tests are frozen)."""

from datetime import date, datetime, timezone
from pathlib import Path
import os
import re
import sys
import time
import unittest
from unittest import mock

SRC_DIR = Path(__file__).resolve().parent.parent
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

from core import algorithm, service, validation  # noqa: E402

HEADER = "listing_id,name,type,address,lat,lon,monthly_rent,available_slots,gender_policy,contact,last_updated,notes"
APP_JS = (SRC_DIR / "public" / "app.js").read_text(encoding="utf-8")


def row(i: int, **kw) -> str:
    """One valid CSV line; any column can be overridden."""
    cols = {
        "listing_id": f"R{i}", "name": f"Room {i}", "type": "Room", "address": "Matina",
        "lat": f"{7.0600 + i * 0.0001:.4f}", "lon": "125.5966", "monthly_rent": str(1500 + i),
        "available_slots": "2", "gender_policy": "Mixed", "contact": "0917-000-0000",
        "last_updated": "2026-11-10", "notes": "",
    }
    cols.update(kw)
    return ",".join(cols[c] for c in validation.ALL_COLUMNS)


def make_csv(lines: list[str]) -> str:
    return "\n".join([HEADER] + lines) + "\n"


class MixedGenderTests(unittest.TestCase):
    def test_mixed_filter_is_accepted(self) -> None:
        status, body = service.handle_rank({"gender": "Mixed", "today": "2026-11-16"})
        self.assertEqual(status, 200, body)
        for item in body["results"]:
            self.assertEqual(item["gender_policy"], "Mixed")

    def test_mixed_rooms_still_show_for_anyone_and_female(self) -> None:
        csv_text = make_csv([row(1), row(2, gender_policy="Female"), row(3, gender_policy="Male")])
        _, any_body = service.handle_rank({"csv_text": csv_text, "gender": "Any", "today": "2026-11-16"})
        _, fem_body = service.handle_rank({"csv_text": csv_text, "gender": "Female", "today": "2026-11-16"})
        self.assertEqual(any_body["matched"], 3)
        self.assertEqual(sorted(i["listing_id"] for i in fem_body["results"]), ["R1", "R2"])


class SpeedAndTraceTests(unittest.TestCase):
    def test_500_rows_rank_in_under_2_seconds(self) -> None:
        csv_text = make_csv([row(i) for i in range(500, 0, -1)])
        start = time.perf_counter()
        status, body = service.handle_rank({"csv_text": csv_text, "include_full": True, "today": "2026-11-16"})
        elapsed = time.perf_counter() - start
        self.assertEqual(status, 200, body)
        self.assertEqual(body["matched"], 500)
        self.assertEqual(body["trace"], [])
        self.assertTrue(body["trace_truncated"])
        self.assertLess(elapsed, 2.0, f"took {elapsed:.2f}s")

    def test_small_results_keep_identical_trace(self) -> None:
        listings, _ = validation.parse_csv_text(make_csv([row(i) for i in (5, 3, 9, 1, 7)]), date(2026, 11, 16))
        lm = algorithm.LANDMARKS["UM Matina Campus"]
        full = algorithm.rank_listings(listings, lm, None, "ALL", "ANY", True, "rent")
        capped = algorithm.rank_listings(listings, lm, None, "ALL", "ANY", True, "rent", 50)
        self.assertEqual(full, capped)
        self.assertGreater(len(full[1]), 0)

    def test_counts_are_the_same_without_trace(self) -> None:
        listings, _ = validation.parse_csv_text(make_csv([row(i) for i in range(30, 0, -1)]), date(2026, 11, 16))
        for item in listings:
            item["distance_m"] = algorithm.haversine_m(7.0657, 125.5966, item["lat"], item["lon"])
        with_trace = algorithm.insertion_sort(listings, "distance", True)
        without = algorithm.insertion_sort(listings, "distance", False)
        self.assertEqual(with_trace[0], without[0])
        self.assertEqual(with_trace[2], without[2])
        self.assertEqual(without[1], [])


class ManilaDateTests(unittest.TestCase):
    def fake_clock(self):
        """Pretend it is 2026-11-17 01:00 in Manila (= 2026-11-16 17:00 UTC)."""
        class FakeDateTime(datetime):
            @classmethod
            def now(cls, tz=None):
                return datetime(2026, 11, 16, 17, 0, tzinfo=timezone.utc).astimezone(tz)
        return mock.patch.object(service, "datetime", FakeDateTime)

    def test_manila_today_is_next_day_at_1am(self) -> None:
        with self.fake_clock():
            self.assertEqual(service.manila_today(), date(2026, 11, 17))

    def test_row_added_at_1am_manila_is_accepted(self) -> None:
        csv_text = make_csv([row(1, last_updated="2026-11-17")])
        with self.fake_clock(), mock.patch.dict(os.environ, {"VERCEL": "1"}):
            status, body = service.handle_rank({"csv_text": csv_text})
        self.assertEqual(status, 200)
        self.assertEqual(body["loaded"], 1)
        self.assertEqual(body["errors"], [])

    def test_client_today_is_ignored_in_production(self) -> None:
        csv_text = make_csv([row(1, last_updated="2026-11-17")])
        with self.fake_clock(), mock.patch.dict(os.environ, {"VERCEL": "1"}):
            status, body = service.handle_rank({"csv_text": csv_text, "today": "2020-01-01"})
        self.assertEqual(status, 200)
        self.assertEqual(body["loaded"], 1)


class CsvTests(unittest.TestCase):
    today = date(2026, 11, 16)

    def test_multiline_quoted_field(self) -> None:
        text = make_csv([row(1, notes='"Wi-Fi\nfree water"'), row(2)])
        listings, errors = validation.parse_csv_text(text, self.today)
        self.assertEqual(errors, [])
        self.assertEqual(len(listings), 2)
        self.assertEqual(listings[0]["notes"], "Wi-Fi\nfree water")

    def test_duplicate_name_and_coordinates(self) -> None:
        text = make_csv([row(1, lat="7.0650"), row(2, name="Room 1", lat="7.0650")])
        listings, errors = validation.parse_csv_text(text, self.today)
        self.assertEqual(len(listings), 1)
        self.assertEqual(len(errors), 1)
        self.assertIn("duplicate of R1", errors[0])

    def test_same_name_different_place_is_not_a_duplicate(self) -> None:
        text = make_csv([row(1, lat="7.0650"), row(2, name="Room 1", lat="7.0700")])
        listings, errors = validation.parse_csv_text(text, self.today)
        self.assertEqual((len(listings), errors), (2, []))

    def test_row_error_shows_value_and_allowed_values(self) -> None:
        _, errors = validation.parse_csv_text(make_csv([row(1, type="Hostel")]), self.today)
        self.assertIn("'Hostel'", errors[0])
        self.assertIn("Bedspace", errors[0])

    def test_semicolon_file_gets_a_hint(self) -> None:
        text = HEADER.replace(",", ";") + "\n" + row(1).replace(",", ";") + "\n"
        listings, errors = validation.parse_csv_text(text, self.today)
        self.assertEqual(listings, [])
        self.assertTrue(errors[0].startswith("Missing column:"))
        self.assertIn("semicolon", errors[0])

    def test_script_in_notes_stays_plain_text(self) -> None:
        payload = "<script>alert(1)</script>"
        status, body = service.handle_rank({"csv_text": make_csv([row(1, notes=payload)]), "today": "2026-11-16"})
        self.assertEqual(status, 200)
        self.assertEqual(body["results"][0]["notes"], payload)  # returned as data, never as HTML
        for name in ("app.js", "map.js", "trace.js"):
            source = (SRC_DIR / "public" / name).read_text(encoding="utf-8")
            self.assertNotIn("innerHTML", source)
            self.assertNotIn("outerHTML", source)


class FrontendContractTests(unittest.TestCase):
    """The browser code is plain JS, so these check the source text."""

    def test_export_columns_match_import_columns(self) -> None:
        block = re.search(r"const CSV_COLUMNS = \[(.*?)\];", APP_JS, re.S)
        self.assertIsNotNone(block)
        columns = re.findall(r'"([a-z_]+)"', block.group(1))
        self.assertEqual(tuple(columns), validation.ALL_COLUMNS)

    def test_add_listing_does_not_rebuild_from_filtered_results(self) -> None:
        start = APP_JS.index("async function ensureAllListings")
        end = APP_JS.index("function closeAddDrawer")
        add_code = APP_JS[start:end]
        self.assertNotIn("appState.results", add_code)
        self.assertIn("include_full: true", add_code)
        self.assertIn('budget: ""', add_code)

    def test_add_listing_keeps_all_rooms_at_logic_level(self) -> None:
        """Mimic Add Listing: full dataset + one new row -> every old room is still there."""
        _, full = service.handle_rank({"include_full": True, "today": "2026-11-16"})
        old_ids = {i["listing_id"] for i in full["results"]}
        lines = [HEADER]
        for item in full["results"]:
            cells = [str(item[c]) for c in validation.ALL_COLUMNS]
            lines.append(",".join('"' + c.replace('"', '""') + '"' for c in cells))
        lines.append(row(999, listing_id="ADD-1", name="Brand New", lat="7.0001".replace("7.0001", "7.0900")))
        _, after = service.handle_rank({"csv_text": "\n".join(lines), "include_full": True, "today": "2026-11-16"})
        self.assertEqual(after["errors"], [])
        self.assertEqual(after["matched"], len(old_ids) + 1)
        self.assertTrue(old_ids <= {i["listing_id"] for i in after["results"]})


class ResearchDatasetTests(unittest.TestCase):
    def test_research_dataset_loads_cleanly(self) -> None:
        status, body = service.handle_rank({"dataset": "research", "include_full": True, "today": "2026-11-17"})
        self.assertEqual(status, 200, body)
        self.assertEqual(body["errors"], [])
        self.assertEqual(body["loaded"], 52)

    def test_research_extras_metadata_is_merged(self) -> None:
        status, body = service.handle_rank({"dataset": "research", "include_full": True, "today": "2026-11-17"})
        self.assertEqual(status, 200, body)
        results = body["results"]
        exact = [r for r in results if r.get("coord_accuracy") == "exact"]
        approx = [r for r in results if r.get("coord_accuracy") in ("street", "approximate")]
        unconfirmed = [r for r in results if r.get("slots_unconfirmed")]
        self.assertEqual(len(exact), 21)
        self.assertEqual(len(approx), 31)
        self.assertEqual(len(unconfirmed), 36)
        self.assertTrue(all(r.get("date_accessed") == "2026-11-17" for r in results))
        self.assertTrue(all(r.get("source_url", "").startswith("https://") for r in results))

    def test_demo_is_still_the_default(self) -> None:
        _, default_body = service.handle_rank({"today": "2026-11-16"})
        _, demo_body = service.handle_rank({"dataset": "demo", "today": "2026-11-16"})
        self.assertEqual(default_body["results"], demo_body["results"])
        self.assertNotIn("coord_accuracy", demo_body["results"][0])

    def test_custom_csv_reusing_research_id_does_not_inherit_extras(self) -> None:
        csv_text = make_csv([row(1, listing_id="R001", name="Unrelated Custom Boarding House")])
        status, body = service.handle_rank({"csv_text": csv_text, "today": "2026-11-17"})
        self.assertEqual(status, 200, body)
        self.assertNotIn("coord_accuracy", body["results"][0])
        self.assertNotIn("source_url", body["results"][0])


class LayoutContractTests(unittest.TestCase):
    """Source-level checks of the floating-panel design (no browser needed)."""

    html = (SRC_DIR / "public" / "index.html").read_text(encoding="utf-8")
    css = (SRC_DIR / "public" / "styles.css").read_text(encoding="utf-8")
    map_js = (SRC_DIR / "public" / "map.js").read_text(encoding="utf-8")

    def test_filters_panel_is_hidden_by_default_and_uses_dropdowns(self) -> None:
        self.assertRegex(self.html, r'id="filtersPanel"[^>]*class="[^"]*hidden')
        for select_id in ("budgetSelect", "typeSelect", "genderSelect"):
            self.assertIn(f'<select id="{select_id}">', self.html)

    def test_map_is_the_full_screen_background(self) -> None:
        self.assertRegex(self.css, r"\.map-container \{[^}]*position: fixed; inset: 0")
        self.assertNotIn('class="hero"', self.html)

    def test_menu_and_labels(self) -> None:
        for text in ("Export results", "Upload CSV", "Add Listing", "Show more rooms"):
            self.assertIn(text, self.html + APP_JS)
        self.assertNotIn("Shortlist", self.html + APP_JS)

    def test_renter_trust_honesty_and_safety_elements(self) -> None:
        combined = self.html + APP_JS + self.map_js
        for text in (
            "Availability not confirmed",
            "Pin is approximate",
            "Confirmed ",
            "Copy details",
            "Before you pay checklist",
            "Never pay a reservation fee",
        ):
            self.assertIn(text, combined)

    def test_icon_only_buttons_have_aria_labels(self) -> None:
        for button_id in ("filtersBtn", "useLocationBtn", "placeSearchBtn"):
            self.assertRegex(self.html, rf'id="{button_id}"[^>]*aria-label=')
        self.assertNotIn('role="application"', self.html)

    def test_all_referenced_dom_ids_exist_in_index_html(self) -> None:
        dom_ids = set(re.findall(r'\$\("([A-Za-z0-9_]+)"\)', APP_JS))
        missing = [dom_id for dom_id in sorted(dom_ids) if f'id="{dom_id}"' not in self.html]
        self.assertEqual(missing, [])


class PlaceSearchContractTests(unittest.TestCase):
    """Place search suggestions (read-source style, like the layout tests)."""

    MAP_JS = (SRC_DIR / "public" / "map.js").read_text(encoding="utf-8")

    def test_alias_table_has_the_common_short_names(self):
        block = self.MAP_JS[self.MAP_JS.index("const PLACE_ALIASES"):self.MAP_JS.index("const DAVAO_BARANGAYS")]
        for alias in ('"um"', '"addu"', '"spc"', '"usep"', '"upmin"', '"ddc"', '"hcdc"'):
            self.assertIn(alias, block)

    def test_csp_allows_photon_in_both_places(self):
        from core import http_common
        self.assertIn("https://photon.komoot.io", http_common.CSP_VALUE)
        vercel = (SRC_DIR / "vercel.json").read_text(encoding="utf-8")
        self.assertIn("https://photon.komoot.io", vercel)

    def test_suggestions_use_text_content_not_inner_html(self):
        start = APP_JS.index("function renderSuggestions")
        block = APP_JS[start:APP_JS.index("function noPlaceMessage")]
        self.assertIn('mk("span", "suggest-name", place.name)', block)
        self.assertNotIn("innerHTML", block)
        self.assertNotIn("innerHTML", self.MAP_JS)

    def test_requests_are_debounced_and_cancellable(self):
        self.assertIn("SUGGEST_DELAY_MS = 250", APP_JS)
        self.assertIn("new AbortController()", APP_JS)
        self.assertIn("MIN_REQUEST_GAP_MS = 250", self.MAP_JS)


class TestCaseSelectorTests(unittest.TestCase):
    """The More menu lists every course test dataset, and the service accepts each one."""

    HTML = (SRC_DIR / "public" / "index.html").read_text(encoding="utf-8")

    def test_every_option_is_a_known_dataset(self):
        block = self.HTML[self.HTML.index('id="testCaseSelect"'):]
        block = block[:block.index("</select>")]
        values = re.findall(r'value="([a-z0-9_]+)"', block)
        self.assertEqual(values, ["demo", "tc1", "tc2", "tc3", "tc4_empty", "tc4_single", "tc5"])
        for name in values:
            status, body = service.handle_rank({"dataset": name, "landmark": "UM Matina Campus"})
            self.assertEqual(status, 200, name)
            self.assertTrue(body["ok"], name)


if __name__ == "__main__":
    unittest.main()
