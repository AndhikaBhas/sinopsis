"""Grid search parameter diarization untuk meminimalkan DER (Bab 3.3.1).

Contoh:
    python scripts/grid_search.py --config configs/baseline_b.yaml \\
        --grid configs/grid.yaml --subset-dir data/ami/dev \\
        --out results/grid_dev_baseline_b.csv --write-best configs/tuned.yaml

Efisiensi: segmentasi & embedding (bagian mahal) dihitung sekali per rapat
memakai cache training pyannote; setiap kombinasi parameter hanya mengulang
clustering. Probabilitas Silero VAD juga dihitung sekali per rapat.

Grid search dijalankan pada subset *dev*; parameter terbaik lalu diuji
sekali pada subset *test* (scripts/run_diarization.py + evaluate_der.py).
"""

import argparse
import csv
import itertools
import sys
import time
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

import yaml  # noqa: E402

from sinopsis_research.audio import load_audio  # noqa: E402
from sinopsis_research.diarization.cache import (  # noqa: E402
    load_training_cache,
    pipeline_cache_key,
    save_training_cache,
)
from sinopsis_research.diarization.pipelines import DiarizationConfig, Diarizer  # noqa: E402
from sinopsis_research.diarization.postprocess import apply_vad_mask  # noqa: E402
from sinopsis_research.evaluation.der import make_metric  # noqa: E402
from sinopsis_research.rttm import load_rttm_dir, load_uem_dir  # noqa: E402
from sinopsis_research.vad import SileroVAD, VADParams, binarize  # noqa: E402

COMPONENTS = ("false alarm", "missed detection", "confusion", "total")


def expand(grid: dict) -> list:
    """{"a.b": [1, 2], "c.d": [3]} -> [{"a.b": 1, "c.d": 3}, {"a.b": 2, "c.d": 3}]"""
    if not grid:
        return [{}]
    keys = list(grid)
    return [dict(zip(keys, values)) for values in itertools.product(*(grid[k] for k in keys))]


def nest(flat: dict) -> dict:
    """{"clustering.threshold": 0.6} -> {"clustering": {"threshold": 0.6}}"""
    nested: dict = {}
    for key, value in flat.items():
        node = nested
        *parents, leaf = key.split(".")
        for part in parents:
            node = node.setdefault(part, {})
        node[leaf] = value
    return nested


def vad_combinations(vad_grid: dict) -> list:
    combos = []
    for combo in expand(vad_grid or {"threshold": [None]}):
        if combo.get("threshold") is None:
            combos.append(None)  # tanpa masker VAD
        else:
            combos.append(VADParams(**combo))
    # hilangkan duplikat "tanpa VAD" yang muncul untuk setiap min_speech_duration
    unique = []
    for c in combos:
        if c not in unique:
            unique.append(c)
    return unique


def vad_key(params) -> tuple:
    if params is None:
        return (None, None, None)
    return (params.threshold, params.min_speech_duration, params.min_silence_duration)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--config", type=Path, required=True, help="varian dasar, mis. configs/baseline_b.yaml")
    parser.add_argument("--grid", type=Path, default=Path("configs/grid.yaml"))
    parser.add_argument("--subset-dir", type=Path, required=True, help="folder berisi audio/, rttm/, uem/")
    parser.add_argument("--limit", type=int, default=None, help="jumlah rapat maksimum")
    parser.add_argument("--collar", type=float, default=0.25, help="collar per sisi (detik)")
    parser.add_argument("--out", type=Path, required=True, help="CSV hasil seluruh kombinasi")
    parser.add_argument("--write-best", type=Path, default=None, help="tulis config varian C (tuned)")
    parser.add_argument(
        "--cache-dir",
        type=Path,
        default=Path("cache/grid"),
        help="simpan segmentasi & embedding ke disk agar grid berikutnya tidak menghitung ulang",
    )
    args = parser.parse_args()

    config = DiarizationConfig.from_yaml(args.config)
    grid = yaml.safe_load(args.grid.read_text())
    pipeline_combos = expand(grid.get("pipeline") or {})
    vad_combos = vad_combinations(grid.get("vad"))
    print(f"{len(pipeline_combos)} kombinasi pipeline × {len(vad_combos)} kombinasi VAD", flush=True)

    references = load_rttm_dir(args.subset_dir / "rttm")
    uems = load_uem_dir(args.subset_dir / "uem") if (args.subset_dir / "uem").exists() else {}
    audio_files = sorted((args.subset_dir / "audio").glob("*.wav"))
    audio_files = [p for p in audio_files if p.stem in references][: args.limit]
    if not audio_files:
        sys.exit("Tidak ada audio yang punya RTTM referensi.")

    diarizer = Diarizer(config)
    diarizer.pipeline.training = True  # aktifkan cache segmentasi & embedding
    vad = SileroVAD() if any(v is not None for v in vad_combos) else None
    metric = make_metric(args.collar)

    totals = defaultdict(lambda: dict.fromkeys(COMPONENTS, 0.0))
    for n, path in enumerate(audio_files, 1):
        t0 = time.perf_counter()
        audio = load_audio(path)
        file = dict(audio)  # dict yang sama dipakai ulang agar cache pyannote berlaku
        cache_path = args.cache_dir / pipeline_cache_key(config) / f"{path.stem}.pkl"
        file.update(load_training_cache(cache_path))
        reference, uem = references[path.stem], uems.get(path.stem)
        probs = vad.speech_probabilities(audio["waveform"], audio["sample_rate"]) if vad else None

        for pipeline_combo in pipeline_combos:
            diarizer.set_params(deep_override(config.params, nest(pipeline_combo)))
            hypothesis = diarizer(file).annotation
            save_training_cache(file, cache_path)
            for vad_params in vad_combos:
                hyp = hypothesis
                if vad_params is not None:
                    hyp = apply_vad_mask(hypothesis, binarize(probs, vad_params, uri=path.stem))
                components = metric(reference, hyp, uem=uem, detailed=True)
                key = (tuple(sorted(pipeline_combo.items())), vad_key(vad_params))
                for c in COMPONENTS:
                    totals[key][c] += components[c]

        print(f"[{n}/{len(audio_files)}] {path.stem}: {time.perf_counter() - t0:.0f} s", flush=True)

    rows = []
    for (pipeline_items, (vad_threshold, min_speech, min_silence)), comp in totals.items():
        errors = comp["false alarm"] + comp["missed detection"] + comp["confusion"]
        row = dict(pipeline_items)
        row.update(
            {
                "vad.threshold": vad_threshold if vad_threshold is not None else "none",
                "vad.min_speech_duration": min_speech if min_speech is not None else "",
                "vad.min_silence_duration": min_silence if min_silence is not None else "",
                "der": errors / comp["total"],
                "false_alarm_rate": comp["false alarm"] / comp["total"],
                "missed_rate": comp["missed detection"] / comp["total"],
                "confusion_rate": comp["confusion"] / comp["total"],
            }
        )
        rows.append(row)
    rows.sort(key=lambda r: r["der"])

    args.out.parent.mkdir(parents=True, exist_ok=True)
    with open(args.out, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)

    default_row = _find_default(rows, diarizer.default_params)
    print("\n5 kombinasi terbaik:")
    for row in rows[:5]:
        print(f"  DER {row['der']:.2%}  {_describe(row)}")
    if default_row:
        print(f"\nDefault (tanpa tuning): DER {default_row['der']:.2%}")
    print(f"\nTersimpan: {args.out}")

    if args.write_best:
        write_tuned_config(config, rows[0], args)


def deep_override(base: dict, overrides: dict) -> dict:
    from sinopsis_research.diarization.pipelines import deep_merge

    return deep_merge(base, overrides)


def _describe(row: dict) -> str:
    return ", ".join(f"{k}={v}" for k, v in row.items() if not k.endswith("_rate") and k != "der" and v != "")


def _find_default(rows: list, default_params: dict):
    """Baris dengan parameter pipeline default dan tanpa VAD (jika ada di grid)."""
    for row in rows:
        if row["vad.threshold"] != "none":
            continue
        if all(
            abs(float(row[k]) - float(_get(default_params, k))) < 1e-9
            for k in row
            if "." in k and not k.startswith("vad.") and _get(default_params, k) is not None
        ):
            return row
    return None


def _get(params: dict, dotted: str):
    node = params
    for part in dotted.split("."):
        if not isinstance(node, dict) or part not in node:
            return None
        node = node[part]
    return node


def write_tuned_config(config: DiarizationConfig, best: dict, args) -> None:
    pipeline_params = nest({k: v for k, v in best.items() if "." in k and not k.startswith("vad.")})
    tuned = {
        "name": "tuned",
        "description": (
            f"Varian C — {config.name} dengan parameter hasil grid search pada "
            f"{args.subset_dir} (DER dev {best['der']:.2%})."
        ),
        "pipeline": config.pipeline,
        "params": deep_override(config.params, pipeline_params),
    }
    if best["vad.threshold"] != "none":
        tuned["vad"] = {
            "threshold": float(best["vad.threshold"]),
            "min_speech_duration": float(best["vad.min_speech_duration"]),
            "min_silence_duration": float(best["vad.min_silence_duration"]),
        }
    args.write_best.write_text(yaml.safe_dump(tuned, sort_keys=False, allow_unicode=True))
    print(f"Config varian C ditulis ke {args.write_best}")


if __name__ == "__main__":
    main()
