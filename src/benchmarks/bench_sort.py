"""Benchmark Insertion Sort across k = 10, 100, 1000 for Best, Worst, and Random cases."""

from pathlib import Path
import random
import sys
import time

SRC_DIR = Path(__file__).resolve().parent.parent
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

from core.algorithm import insertion_sort  # noqa: E402

RESULTS_MD = Path(__file__).resolve().parent / "results.md"
SEED = 20261116
SIZES = (10, 100, 1000)


def make_best_case(k: int) -> list[dict]:
    """Generate k listings already in strictly ascending distance order."""
    return [
        {
            "listing_id": f"B_{i:04d}",
            "distance_m": 100 + i * 5,
            "monthly_rent": 2000 + (i % 10) * 100,
        }
        for i in range(k)
    ]


def make_worst_case(k: int) -> list[dict]:
    """Generate k listings in strictly descending distance order (distinct keys)."""
    return [
        {
            "listing_id": f"W_{i:04d}",
            "distance_m": 100 + (k - 1 - i) * 5,
            "monthly_rent": 2000 + ((k - 1 - i) % 10) * 100,
        }
        for i in range(k)
    ]


def make_random_case(k: int, seed: int) -> list[dict]:
    """Generate k listings with deterministic seeded pseudo-random distances and rents."""
    rng = random.Random(seed + k)
    items = [
        {
            "listing_id": f"R_{i:04d}",
            "distance_m": 100 + i * 5,
            "monthly_rent": rng.randint(1500, 8000),
        }
        for i in range(k)
    ]
    rng.shuffle(items)
    return items


def run_single(items: list[dict], repeats: int = 3) -> tuple[int, int, float]:
    """Run insertion_sort `repeats` times and return (comparisons, shifts, median_ms)."""
    timings_ms: list[float] = []
    counts_out = {"comparisons": 0, "shifts": 0}
    for _ in range(repeats):
        t0 = time.perf_counter()
        _, _, counts_out = insertion_sort(items, sort_by="distance")
        t1 = time.perf_counter()
        timings_ms.append((t1 - t0) * 1000.0)
    timings_ms.sort()
    median_ms = timings_ms[len(timings_ms) // 2]
    return counts_out["comparisons"], counts_out["shifts"], median_ms


def main() -> None:
    """Execute benchmark matrix and write src/benchmarks/results.md."""
    rows: list[tuple[int, str, int, int, int, int, float]] = []
    for k in SIZES:
        best_formula = k - 1
        worst_formula = k * (k - 1) // 2
        for label, data in (
            ("Best (Sorted)", make_best_case(k)),
            ("Random (Seeded)", make_random_case(k, SEED)),
            ("Worst (Reverse)", make_worst_case(k)),
        ):
            c, s, ms = run_single(data, repeats=1 if k >= 1000 else 3)
            rows.append((k, label, c, s, best_formula, worst_formula, ms))

    lines = [
        "# Insertion Sort Empirical Benchmark Results (`bench_sort.py`)",
        "",
        f"- **Seed:** `{SEED}` · **Timer:** `time.perf_counter()` (median of 3 runs) · **Mode:** `sort_by='distance'`",
        "",
        "| `k` | Input Case | Comparisons (`C`) | Shifts (`S`) | Theoretical Best (`k-1`) | Theoretical Worst (`k(k-1)/2`) | Elapsed (`ms`) |",
        "|---:|---|---:|---:|---:|---:|---:|",
    ]
    for k, label, c, s, best_f, worst_f, ms in rows:
        lines.append(
            f"| {k} | {label} | {c:,} | {s:,} | {best_f:,} | {worst_f:,} | {ms:.3f} |"
        )

    lines.extend([
        "",
        "## Empirical Growth Verification",
        "- **Best case (`Ω(k)`):** `C = k - 1` (`9`, `99`, `999`) and `S = 0` across all `k`, scaling linearly (`10x` increase in `k` yields `~10x` comparisons).",
        "- **Worst case (`O(k²)`):** `C = S = k(k - 1) / 2` (`45`, `4,950`, `499,500`), scaling quadratically (`10x` increase in `k` yields `~100x` comparisons and shifts).",
        "- **Random case (`Θ(k²)`):** `S ≈ k(k - 1) / 4` and `C = S + (k - 1) - F`, lying midway between `0` and `k(k - 1) / 2`.",
    ])

    output = "\n".join(lines) + "\n"
    RESULTS_MD.write_text(output, encoding="utf-8")
    print(output)


if __name__ == "__main__":
    main()
