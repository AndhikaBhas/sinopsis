"""Hitung DER hipotesis terhadap referensi, plus statistik overlap per rapat.

Contoh:
    python scripts/evaluate_der.py \\
        --ref data/ami/test/rttm --uem data/ami/test/uem \\
        --hyp outputs/test/baseline_a \\
        --out results/test_baseline_a.csv

Hanya uri yang ada di folder hipotesis yang dievaluasi, kecuali --all-refs
diberikan (uri tanpa hipotesis dihitung sebagai missed detection penuh).
"""

import argparse
import csv
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sinopsis_research.evaluation.der import evaluate_der  # noqa: E402
from sinopsis_research.evaluation.overlap import overlap_stats  # noqa: E402
from sinopsis_research.rttm import load_rttm_dir, load_uem_dir  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--ref", type=Path, required=True, help="folder RTTM referensi")
    parser.add_argument("--hyp", type=Path, required=True, help="folder RTTM hipotesis")
    parser.add_argument("--uem", type=Path, default=None, help="folder UEM (opsional)")
    parser.add_argument("--collar", type=float, default=0.25, help="collar per sisi, detik (default 0.25)")
    parser.add_argument("--skip-overlap", action="store_true", help="abaikan wilayah overlap")
    parser.add_argument("--all-refs", action="store_true", help="evaluasi semua referensi")
    parser.add_argument("--out", type=Path, default=None, help="simpan hasil ke CSV")
    args = parser.parse_args()

    references = load_rttm_dir(args.ref)
    hypotheses = load_rttm_dir(args.hyp)
    uems = load_uem_dir(args.uem) if args.uem else None
    if not args.all_refs:
        references = {uri: ann for uri, ann in references.items() if uri in hypotheses}
    if not references:
        sys.exit("Tidak ada uri yang cocok antara referensi dan hipotesis.")

    results = evaluate_der(references, hypotheses, uems, args.collar, args.skip_overlap)
    overlaps = {uri: overlap_stats(ann) for uri, ann in references.items()}

    rows = []
    for r in results:
        row = r.as_dict()
        stats = overlaps.get(r.uri)
        row["overlap_ratio"] = stats.ratio if stats else ""
        row["overlap_class"] = stats.overlap_class if stats else ""
        row["ref_speakers"] = stats.num_speakers if stats else ""
        row["hyp_speakers"] = len(hypotheses[r.uri].labels()) if r.uri in hypotheses else ""
        rows.append(row)

    print(f"{'uri':<10} {'DER':>7} {'FA':>7} {'MISS':>7} {'CONF':>7} {'overlap':>8}  spk(ref/hyp)")
    for row in rows:
        overlap = f"{row['overlap_ratio']:.1%}" if row["overlap_ratio"] != "" else ""
        speakers = f"{row['ref_speakers']}/{row['hyp_speakers']}" if row["ref_speakers"] != "" else ""
        print(
            f"{row['uri']:<10} {row['der']:>7.2%} {row['false_alarm_rate']:>7.2%} "
            f"{row['missed_rate']:>7.2%} {row['confusion_rate']:>7.2%} {overlap:>8}  {speakers}"
        )

    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        with open(args.out, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
            writer.writeheader()
            writer.writerows(rows)
        print(f"\nTersimpan: {args.out}")


if __name__ == "__main__":
    main()
