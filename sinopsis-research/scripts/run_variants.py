"""Jalankan beberapa varian yang memakai model sama (mis. B & C) dengan satu kali ekstraksi embedding.

Varian B dan C hanya berbeda pada parameter clustering/pasca-pemrosesan,
sehingga segmentasi & embedding cukup dihitung sekali (dan disimpan di cache).

Contoh:
    python scripts/run_variants.py --configs configs/baseline_b.yaml configs/tuned.yaml \\
        --audio-dir data/ami/test/audio --out-dir outputs/test

Keluaran sama seperti run_diarization.py: outputs/test/<nama>/<uri>.rttm + run.json.
Waktu proses yang dicatat untuk tiap varian = ekstraksi (bersama) + clustering
varian tersebut, yaitu waktu yang dibutuhkan bila varian dijalankan sendiri.
"""

import argparse
import json
import resource
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

from sinopsis_research.audio import duration, load_audio  # noqa: E402
from sinopsis_research.diarization.cache import cache_path, load_training_cache, save_training_cache  # noqa: E402
from sinopsis_research.diarization.pipelines import DiarizationConfig, Diarizer  # noqa: E402
from sinopsis_research.rttm import write_rttm  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--configs", type=Path, nargs="+", required=True)
    parser.add_argument("--audio-dir", type=Path, required=True)
    parser.add_argument("--out-dir", type=Path, required=True)
    parser.add_argument("--cache-dir", type=Path, default=Path("cache/grid"))
    args = parser.parse_args()

    configs = [DiarizationConfig.from_yaml(p) for p in args.configs]
    if any(c.pipeline != configs[0].pipeline for c in configs):
        sys.exit("Semua config harus memakai model (bagian 'pipeline') yang sama.")

    diarizer = Diarizer(configs[0])
    diarizer.pipeline.training = True
    runs = {}
    for config in configs:
        (args.out_dir / config.name).mkdir(parents=True, exist_ok=True)
        runs[config.name] = {"config": config.name, "params": None, "device": str(diarizer.device), "files": {}}

    files = sorted(args.audio_dir.glob("*.wav"))
    for i, path in enumerate(files, 1):
        audio = load_audio(path)
        audio_seconds = duration(audio)
        file = dict(audio)
        cpath = cache_path(configs[0], path.stem, args.cache_dir)
        file.update(load_training_cache(cpath))

        extraction_seconds = None
        for config in configs:
            diarizer.set_params(config.params)
            t0 = time.perf_counter()
            output = diarizer(file)
            seconds = time.perf_counter() - t0
            if extraction_seconds is None:
                # pemanggilan pertama mencakup segmentasi + embedding (kecuali sudah ada di cache)
                extraction_seconds = seconds
                save_training_cache(file, cpath)
                total = seconds
            else:
                total = extraction_seconds + seconds

            write_rttm(output.annotation, args.out_dir / config.name / f"{path.stem}.rttm", uri=path.stem)
            run = runs[config.name]
            run["params"] = diarizer.params
            run["files"][path.stem] = {
                "audio_seconds": round(audio_seconds, 2),
                "processing_seconds": round(total, 2),
                "seconds_per_audio_minute": round(total / (audio_seconds / 60), 2),
                "num_speakers": len(output.annotation.labels()),
                "peak_ram_mb": round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024, 1),
                "from_cache": cpath.exists() and extraction_seconds < 0.2 * audio_seconds,
            }
            (args.out_dir / config.name / "run.json").write_text(json.dumps(run, indent=2))
            print(
                f"[{i}/{len(files)}] {path.stem} {config.name}: {len(output.annotation.labels())} pembicara, "
                f"{total:.0f} s",
                flush=True,
            )

    print(f"Selesai. RTTM di {args.out_dir}/{{{','.join(c.name for c in configs)}}}")


if __name__ == "__main__":
    main()
