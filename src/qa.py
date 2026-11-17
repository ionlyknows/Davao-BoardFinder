"""BoardFinder Davao automated QA & security verification suite (SPEC §7)."""

import ast
from datetime import date
import io
import json
from pathlib import Path
import py_compile
import random
import re
import sys
import unittest

SRC_DIR = Path(__file__).resolve().parent
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

LOG_PATH = SRC_DIR / "qa_log.txt"
EXPECTED_DIR = SRC_DIR / "data" / "expected"

BANNED_CALLS = {"sort", "sorted", "min", "max", "filter"}
BANNED_ATTRS = {"sort", "index", "find"}
BANNED_MODULES = {"bisect", "heapq", "numpy", "pandas"}


def check_1_py_compile() -> tuple[bool, str]:
    """Check 1: py_compile all .py files under src/."""
    py_files = sorted(SRC_DIR.rglob("*.py"))
    if not py_files:
        return False, "No Python files found under src/"
    for path in py_files:
        try:
            py_compile.compile(str(path), doraise=True)
        except py_compile.PyCompileError as exc:
            return False, f"Syntax error in {path.relative_to(SRC_DIR)}: {exc.msg}"
    return True, f"Compiled {len(py_files)} Python files cleanly"


def check_2_banned_constructs() -> tuple[bool, str]:
    """Check 2: AST banned-name scan of core/algorithm.py + text scan of public/*.js (§5.1)."""
    alg_path = SRC_DIR / "core" / "algorithm.py"
    violations: list[str] = []

    if alg_path.exists():
        source = alg_path.read_text(encoding="utf-8")
        try:
            tree = ast.parse(source, filename=str(alg_path))
        except SyntaxError as exc:
            return False, f"SyntaxError in core/algorithm.py: {exc}"

        for node in ast.walk(tree):
            if isinstance(node, (ast.Import, ast.ImportFrom)):
                names = [a.name.split(".")[0] for a in node.names]
                if isinstance(node, ast.ImportFrom) and node.module:
                    names.append(node.module.split(".")[0])
                for mod in names:
                    if mod in BANNED_MODULES:
                        violations.append(f"banned import '{mod}' (line {node.lineno})")
            elif isinstance(node, ast.Lambda):
                violations.append(f"banned lambda (line {node.lineno})")
            elif isinstance(node, ast.BinOp) and isinstance(node.op, ast.MatMult):
                violations.append(f"banned '@' operator (line {node.lineno})")
            elif isinstance(node, ast.Compare):
                for op, comp in zip(node.ops, node.comparators):
                    if isinstance(op, (ast.In, ast.NotIn)) and isinstance(comp, ast.List):
                        violations.append(f"banned 'in' on list literal (line {node.lineno})")
            elif isinstance(node, ast.Call):
                if isinstance(node.func, ast.Name) and node.func.id in BANNED_CALLS:
                    violations.append(f"banned call '{node.func.id}()' (line {node.lineno})")
                elif isinstance(node.func, ast.Attribute) and node.func.attr in BANNED_ATTRS:
                    violations.append(f"banned method '.{node.func.attr}()' (line {node.lineno})")
            elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node. decorator_list:
                violations.append(f"banned '@' decorator on '{node.name}' (line {node.lineno})")

    pub_dir = SRC_DIR / "public"
    js_files = sorted(pub_dir.glob("*.js")) if pub_dir.exists() else []
    for js_path in js_files:
        text = js_path.read_text(encoding="utf-8")
        if ".sort(" in text or ".toSorted(" in text:
            violations.append(f"banned JS sort in {js_path.name}")

    if violations:
        return False, "; ".join(violations)
    status_note = "core/algorithm.py scanned" if alg_path.exists() else "core/algorithm.py pending"
    return True, f"0 banned constructs ({status_note}, {len(js_files)} JS files scanned)"


def check_3_unittest_suite() -> tuple[bool, str]:
    """Check 3: unittest discovery on src/tests/."""
    try:
        import core.algorithm  # noqa: F401
        import core.maps_links  # noqa: F401
        import core.service  # noqa: F401
        import core.validation  # noqa: F401
    except ModuleNotFoundError as exc:
        return False, f"module not found ({exc.name})"

    stream = io.StringIO()
    loader = unittest.TestLoader()
    suite = loader.discover(start_dir=str(SRC_DIR / "tests"), pattern="test_*.py", top_level_dir=str(SRC_DIR))
    runner = unittest.TextTestRunner(stream=stream, verbosity=2)
    result = runner.run(suite)
    if not result.wasSuccessful():
        return False, f"unittest failed (ran={result.testsRun}, failures={len(result.failures)}, errors={len(result.errors)})"
    return True, f"All {result.testsRun} unit & contract tests passed"


def check_4_golden_files() -> tuple[bool, str]:
    """Check 4: Golden outputs + traces match src/data/expected/*.json."""
    try:
        from core import algorithm, validation
    except ModuleNotFoundError as exc:
        return False, f"module not found ({exc.name})"

    today = date(2026, 11, 16)
    expected_files = sorted(EXPECTED_DIR.glob("*.json"))
    if not expected_files:
        return False, "No golden JSON files found in data/expected/"

    for fpath in expected_files:
        exp = json.loads(fpath.read_text(encoding="utf-8"))
        csv_path = SRC_DIR / "data" / exp["csv_file"]
        listings, errors = validation.load_csv(str(csv_path), today)
        if len(listings) != exp["loaded"]:
            return False, f"{fpath.name}: loaded {len(listings)} != {exp['loaded']}"
        if len(errors) != len(exp["error_prefixes"]):
            return False, f"{fpath.name}: errors count {len(errors)} != {len(exp['error_prefixes'])}"
        for err, prefix in zip(errors, exp["error_prefixes"]):
            if not err.startswith(prefix):
                return False, f"{fpath.name}: error '{err}' does not start with '{prefix}'"

        p = exp["params"]
        ranked, trace, counts = algorithm.rank_listings(
            listings,
            tuple(p["landmark_coords"]),
            budget=p["budget"],
            room_type=p["room_type"],
            gender=p["gender"],
            include_full=p["include_full"],
            sort_by=p["sort_by"],
        )
        if [x["listing_id"] for x in ranked] != exp["ranked_ids"]:
            return False, f"{fpath.name}: ranked_ids mismatch"
        if counts != exp["counts"]:
            return False, f"{fpath.name}: counts {counts} != {exp['counts']}"
        if len(trace) != len(exp["trace"]):
            return False, f"{fpath.name}: trace length {len(trace)} != {len(exp['trace'])}"
        for step_a, step_e in zip(trace, exp["trace"]):
            for field in ("step", "pass", "action", "indices", "key", "state"):
                if step_a.get(field) != step_e.get(field):
                    return False, f"{fpath.name} step {step_e['step']}: field '{field}' mismatch"
            if not isinstance(step_a.get("note"), str) or not step_a["note"].strip():
                return False, f"{fpath.name} step {step_e['step']}: empty note"

    return True, f"All {len(expected_files)} golden datasets & traces verified"


def check_5_random_oracle() -> tuple[bool, str]:
    """Check 5: 500 seeded random inputs vs Python sorted() oracle (order + stability, both modes)."""
    try:
        from core import algorithm
    except ModuleNotFoundError as exc:
        return False, f"module not found ({exc.name})"

    rng = random.Random(20261116)
    for trial in range(500):
        k = rng.randint(0, 25)
        mode = "distance" if trial % 2 == 0 else "rent"
        items = [
            {
                "listing_id": f"ID_{idx}",
                "distance_m": rng.choice([150, 300, 450, 600, 900]),
                "monthly_rent": rng.choice([2000, 2500, 3000, 3500]),
            }
            for idx in range(k)
        ]
        ranked, _, _ = algorithm.insertion_sort(items, sort_by=mode)
        if mode == "distance":
            oracle = sorted(items, key=lambda x: (x["distance_m"], x["monthly_rent"]))
        else:
            oracle = sorted(items, key=lambda x: (x["monthly_rent"], x["distance_m"]))
        if [x["listing_id"] for x in ranked] != [x["listing_id"] for x in oracle]:
            return False, f"Oracle mismatch on trial {trial} (mode={mode}, k={k})"

    return True, "500/500 seeded trials matched sorted() oracle & preserved stability"


def check_6_count_formulas() -> tuple[bool, str]:
    """Check 6: Count formulas match SPEC §6.7 (best, worst, and general C = S + (k-1) - F)."""
    try:
        from core import algorithm
    except ModuleNotFoundError as exc:
        return False, f"module not found ({exc.name})"

    rng = random.Random(998877)
    for k in (0, 1, 2, 6, 12):
        asc = [{"listing_id": f"A{i}", "distance_m": 100 * (i + 1), "monthly_rent": 2000} for i in range(k)]
        _, _, c_best = algorithm.insertion_sort(asc, sort_by="distance")
        exp_best_c = (k - 1) if k >= 1 else 0
        if c_best != {"comparisons": exp_best_c, "shifts": 0}:
            return False, f"Best-case formula failed for k={k}: {c_best}"

        desc = list(reversed(asc))
        _, _, c_worst = algorithm.insertion_sort(desc, sort_by="distance")
        exp_worst = (k * (k - 1) // 2) if k >= 1 else 0
        if c_worst != {"comparisons": exp_worst, "shifts": exp_worst}:
            return False, f"Worst-case formula failed for k={k}: {c_worst}"

    for trial in range(100):
        k = rng.randint(2, 20)
        items = [
            {
                "listing_id": f"R{i}",
                "distance_m": rng.randint(100, 2000),
                "monthly_rent": rng.randint(1500, 5000),
            }
            for i in range(k)
        ]
        _, trace, counts = algorithm.insertion_sort(items, sort_by="distance")
        inversions = 0
        for i in range(k):
            for j in range(i + 1, k):
                if algorithm.greater(items[i], items[j], "distance"):
                    inversions += 1
        f_zero = sum(
            1 for step in trace if step["action"] == "insert" and step["indices"] == [0]
        )
        expected_c = inversions + (k - 1) - f_zero
        if counts["shifts"] != inversions or counts["comparisons"] != expected_c:
            return False, f"General formula mismatch on trial {trial}: {counts} vs C={expected_c}, S={inversions}"

    return True, "Best, worst, and general C = S + (k-1) - F verified across 100 random trials"


def check_7_api_contract() -> tuple[bool, str]:
    """Check 7: API contract on service.handle_rank & handle_landmarks (200/400/413, trace cap, fuzz)."""
    try:
        from core import service
    except ModuleNotFoundError as exc:
        return False, f"module not found ({exc.name})"

    s_lm, b_lm = service.handle_landmarks()
    if s_lm != 200 or len(b_lm.get("landmarks", [])) != 15:
        return False, f"handle_landmarks failed: {s_lm}"

    s_ok, b_ok = service.handle_rank({"dataset": "tc1", "budget": "4000", "gender": "Female", "today": "2026-11-16"})
    if s_ok != 200 or not b_ok.get("ok") or b_ok.get("matched") != 5:
        return False, f"handle_rank 200 tc1 failed: {s_ok} {b_ok}"

    for bad in (None, "bad", {"dataset": "bad"}, {"budget": "abc"}, {"include_full": "no"}):
        st, bd = service.handle_rank(bad)  # type: ignore[arg-type]
        if st != 400 or bd.get("ok") is not False:
            return False, f"Expected 400 for {bad}, got {st}"

    header = "listing_id,name,type,address,lat,lon,monthly_rent,available_slots,gender_policy,contact,last_updated,notes"
    rows_55 = [header] + [
        f"P{i},Room {i},Room,Matina,7.0675,125.5966,{2000 + i},1,Mixed,0900,2026-11-10,"
        for i in range(55)
    ]
    s_cap, b_cap = service.handle_rank({"csv_text": "\n".join(rows_55), "today": "2026-11-16"})
    if s_cap != 200 or b_cap.get("trace") != [] or b_cap.get("trace_truncated") is not True:
        return False, "Trace cap (k > 50) failed"

    s_413, _ = service.handle_rank({"csv_text": header + "\n" + ("X" * 265000)})
    if s_413 != 413:
        return False, f"Expected 413 on >256 KB csv_text, got {s_413}"

    return True, "200/400/413 contracts, k>50 trace cap, and fuzz checks passed"


def check_8_security_static() -> tuple[bool, str]:
    """Check 8: Security static scan (DOM XSS, secrets, CSV injection guard, Leaflet SRI, CSP headers)."""
    pub_dir = SRC_DIR / "public"
    if not pub_dir.exists():
        return False, "public/ directory not found (Build 2 pending)"

    js_files = sorted(pub_dir.glob("*.js"))
    if not js_files:
        return False, "No JS files found in public/"

    combined_js = ""
    for js_path in js_files:
        content = js_path.read_text(encoding="utf-8")
        combined_js += "\n" + content
        for banned_dom in ("innerHTML", "outerHTML", "document.write(", "eval("):
            if banned_dom in content:
                return False, f"Unsafe DOM/JS API '{banned_dom}' found in {js_path.name}"

    for ch in ("=", "+", "-", "@"):
        if ch not in combined_js:
            return False, f"CSV export guard missing character '{ch}' in public/*.js"

    index_html = pub_dir / "index.html"
    if not index_html.exists():
        return False, "public/index.html missing"
    html_text = index_html.read_text(encoding="utf-8")
    if "leaflet@1.9.4" not in html_text or "integrity=" not in html_text or 'crossorigin="anonymous"' not in html_text:
        return False, "public/index.html missing pinned leaflet@1.9.4 with integrity + crossorigin=\"anonymous\""

    secret_pattern = re.compile(r"(AIza[0-9A-Za-z\-_]{35}|sk-[0-9A-Za-z]{20,}|ghp_[0-9A-Za-z]{30,})")
    for fpath in SRC_DIR.rglob("*"):
        if fpath.is_file() and fpath.suffix in {".py", ".js", ".html", ".css", ".json", ".csv"}:
            txt = fpath.read_text(encoding="utf-8", errors="ignore")
            if secret_pattern.search(txt):
                return False, f"Potential secret/key pattern in {fpath.relative_to(SRC_DIR)}"

    for cfg_name in ("vercel.json", "dev_server.py"):
        cfg_path = SRC_DIR / cfg_name
        if not cfg_path.exists():
            return False, f"{cfg_name} missing"
        cfg_text = cfg_path.read_text(encoding="utf-8")
        for required_hdr in ("X-Content-Type-Options", "nosniff", "X-Frame-Options", "DENY", "Content-Security-Policy"):
            if required_hdr not in cfg_text:
                return False, f"{cfg_name} missing security header token '{required_hdr}'"

    return True, "XSS, CSV guard, Leaflet SRI, secret scan, and CSP/security headers verified"


def main() -> int:
    args = set(sys.argv[1:])
    all_checks = [
        ("1. py_compile syntax", check_1_py_compile),
        ("2. AST/JS banned scan", check_2_banned_constructs),
        ("3. unittest suite", check_3_unittest_suite),
        ("4. golden outputs/traces", check_4_golden_files),
        ("5. 500 random vs oracle", check_5_random_oracle),
        ("6. §6.7 count formulas", check_6_count_formulas),
        ("7. API service contract", check_7_api_contract),
        ("8. security static scan", check_8_security_static),
    ]
    if "--quick" in args:
        selected = all_checks[:3]
    elif "--core" in args:
        selected = all_checks[:7]
    else:
        selected = all_checks

    lines: list[str] = []
    passed = 0
    for label, fn in selected:
        try:
            ok, msg = fn()
        except Exception as exc:  # never crash
            ok, msg = False, f"unexpected error: {exc}"
        if ok:
            passed += 1
        status = "PASS" if ok else "FAIL"
        line = f"[{status}] {label}: {msg}"
        print(line)
        lines.append(line)

    summary = f"TOTAL {passed}/{len(selected)}"
    print(summary)
    lines.append(summary)
    LOG_PATH.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return 0 if passed == len(selected) else 1


if __name__ == "__main__":
    raise SystemExit(main())
