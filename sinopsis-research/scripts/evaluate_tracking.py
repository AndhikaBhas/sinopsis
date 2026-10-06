"""Uji manfaat cross-segment speaker tracking (Bab 3.2.2, Permasalahan 4).

Untuk setiap rapat, audio dipotong di keheningan (-40 dBFS, maks. --max-chunk
detik) lalu dibandingkan tiga kondisi:

    utuh           diarization pada audio utuh (batas atas)
    tanpa_tracking potongan diproses terpisah, label lokal dibiarkan
    tracking       potongan diproses terpisah, label disatukan oleh tracker

Contoh:
    python scripts/evaluate_tracking.py --config configs/baseline_b.yaml \\
        --subset-dir data/ami/dev --thresholds 0.6 0.7 0.85 \\
        --out results/tracking_dev.csv
"""

import argparse
import csv
import sys
import time
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

from sinopsis_research.audio import load_audio  # noqa: E402
from sinopsis_research.diarization.pipelines import DiarizationConfig, Diarizer  # noqa: E402
from sinopsis_research.diarization.segmented import diarize_segmented  # noqa: E402
from sinopsis_research.evaluation.der import make_metric  # noqa: E402
from sinopsis_research.rttm import load_rttm_dir, load_uem_dir, write_rttm  # noqa: E402
from sinopsis_research.splicing import SpliceParams  # noqa: E402

COMPONENTS = ("false alarm", "missed detection", "confusion", "total")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--config", type=Path, required=True)
    parser.add_argument("--subset-dir", type=Path, required=True)
    parser.add_argument("--max-chunk", type=float, default=300.0, help="panjang potongan maksimum (detik)")
    parser.add_argument("--thresholds", type=float, nargs="+", default=[0.85], help="ambang cosine tracker")
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--collar", type=float, default=0.25)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--rttm-dir", type=Path, default=None, help="simpan RTTM tiap kondisi")
    args = parser.parse_args()

    config = DiarizationConfig.from_yaml(args.config)
    references = load_rttm_dir(args.subset_dir / "rttm")
    uems = load_uem_dir(args.subset_dir / "uem") if (args.subset_dir / "uem").exists() else {}
    files = [p for p in sorted((args.subset_dir / "audio").glob("*.wav")) if p.stem in references][: args.limit]

    diarizer = Diarizer(config)
    metric = make_metric(args.collar)
    splice_params = SpliceParams(max_chunk=args.max_chunk)
    totals = defaultdict(lambda: dict.fromkeys(COMPONENTS, 0.0))
    per_file = []

    for n, path in enumerate(files, 1):
        t0 = time.perf_counter()
        audio = load_audio(path)
        reference, uem = references[path.stem], uems.get(path.stem)

        hypotheses = {"utuh": diarizer(audio).annotation}
        # Diarization per potongan tidak bergantung pada ambang tracker:
        # potongan didiarize sekali (cache), tracker diulang per ambang.
        cache = {}
        hypotheses["tanpa_tracking"] = diarize_segmented(
            diarizer, audio, splice_params, use_tracking=False, chunk_cache=cache
        ).annotation
        for threshold in args.thresholds:
            hypotheses[f"tracking_{threshold:.2f}"] = diarize_segmented(
                diarizer, audio, splice_params, tracking_threshold=threshold, chunk_cache=cache
            ).annotation

        for condition, hypothesis in hypotheses.items():
            components = metric(reference, hypothesis, uem=uem, detailed=True)
            for c in COMPONENTS:
                totals[condition][c] += components[c]
            per_file.append(
                {
                    "uri": path.stem,
                    "condition": condition,
                    "der": components["diarization error rate"],
                    "confusion_rate": components["confusion"] / components["total"],
                    "hyp_speakers": len(hypothesis.labels()),
                    "ref_speakers": len(reference.labels()),
                }
            )
            if args.rttm_dir:
                write_rttm(hypothesis, args.rttm_dir / condition / f"{path.stem}.rttm", uri=path.stem)
        print(f"[{n}/{len(files)}] {path.stem}: {time.perf_counter() - t0:.0f} s", flush=True)

    rows = []
    for condition, comp in totals.items():
        rows.append(
            {
                "uri": "TOTAL",
                "condition": condition,
                "der": (comp["false alarm"] + comp["missed detection"] + comp["confusion"]) / comp["total"],
                "confusion_rate": comp["confusion"] / comp["total"],
                "hyp_speakers": "",
                "ref_speakers": "",
            }
        )

    print(f"\n{'kondisi':<22} {'DER':>7} {'CONF':>7}")
    for row in rows:
        print(f"{row['condition']:<22} {row['der']:>7.2%} {row['confusion_rate']:>7.2%}")
    print("\nJumlah pembicara (hipotesis/referensi):")
    for row in per_file:
        print(f"  {row['uri']} {row['condition']:<22} {row['hyp_speakers']}/{row['ref_speakers']}")

    args.out.parent.mkdir(parents=True, exist_ok=True)
    with open(args.out, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(per_file + rows)
    print(f"\nTersimpan: {args.out}")


if __name__ == "__main__":
    main()
