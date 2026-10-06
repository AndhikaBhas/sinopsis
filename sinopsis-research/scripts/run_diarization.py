"""Jalankan satu varian diarization pada sekumpulan audio, simpan RTTM + metrik efisiensi.

Contoh:
    python scripts/run_diarization.py --config configs/baseline_a.yaml \\
        --audio-dir data/ami/test/audio --out-dir outputs/test

Keluaran (outputs/test/<nama_config>/):
    <uri>.rttm          hasil diarization
    run.json            parameter final, waktu proses & puncak memori per berkas
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

import torch  # noqa: E402

from sinopsis_research.audio import duration, load_audio  # noqa: E402
from sinopsis_research.diarization.pipelines import DiarizationConfig, Diarizer  # noqa: E402
from sinopsis_research.rttm import write_rttm  # noqa: E402

AUDIO_EXTENSIONS = (".wav", ".flac")


def peak_ram_mb() -> float:
    # ru_maxrss dalam KB di Linux
    return resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--config", type=Path, required=True)
    parser.add_argument("--audio-dir", type=Path, required=True)
    parser.add_argument("--out-dir", type=Path, required=True)
    parser.add_argument("--limit", type=int, default=None, help="jumlah berkas maksimum")
    parser.add_argument("--overwrite", action="store_true", help="proses ulang berkas yang sudah ada")
    args = parser.parse_args()

    config = DiarizationConfig.from_yaml(args.config)
    out_dir = args.out_dir / config.name
    out_dir.mkdir(parents=True, exist_ok=True)

    files = sorted(p for p in args.audio_dir.iterdir() if p.suffix.lower() in AUDIO_EXTENSIONS)[: args.limit]
    if not files:
        sys.exit(f"Tidak ada audio di {args.audio_dir}")

    print(f"Memuat pipeline '{config.name}'...", flush=True)
    t0 = time.perf_counter()
    diarizer = Diarizer(config)
    load_seconds = time.perf_counter() - t0
    print(f"  dimuat dalam {load_seconds:.1f} s pada {diarizer.device}", flush=True)

    run_path = out_dir / "run.json"
    run = json.loads(run_path.read_text()) if run_path.exists() and not args.overwrite else {"files": {}}
    run.update(config=config.name, params=diarizer.params, device=str(diarizer.device), load_seconds=load_seconds)

    for i, path in enumerate(files, 1):
        rttm_path = out_dir / f"{path.stem}.rttm"
        if rttm_path.exists() and not args.overwrite:
            print(f"[{i}/{len(files)}] {path.stem}: sudah ada, dilewati", flush=True)
            continue

        audio = load_audio(path)
        audio_seconds = duration(audio)
        if torch.cuda.is_available():
            torch.cuda.reset_peak_memory_stats()

        t0 = time.perf_counter()
        output = diarizer(audio)
        seconds = time.perf_counter() - t0

        write_rttm(output.annotation, rttm_path, uri=path.stem)
        if output.speaker_embeddings is not None:
            import numpy as np

            np.save(out_dir / f"{path.stem}.embeddings.npy", output.speaker_embeddings)

        stats = {
            "audio_seconds": round(audio_seconds, 2),
            "processing_seconds": round(seconds, 2),
            "seconds_per_audio_minute": round(seconds / (audio_seconds / 60), 2),
            "num_speakers": len(output.annotation.labels()),
            "peak_ram_mb": round(peak_ram_mb(), 1),
            "peak_vram_mb": round(torch.cuda.max_memory_allocated() / 2**20, 1) if torch.cuda.is_available() else None,
        }
        run["files"][path.stem] = stats
        run_path.write_text(json.dumps(run, indent=2))
        print(
            f"[{i}/{len(files)}] {path.stem}: {audio_seconds / 60:.1f} menit audio, "
            f"{seconds:.1f} s ({stats['seconds_per_audio_minute']} s/menit), "
            f"{stats['num_speakers']} pembicara",
            flush=True,
        )
        del audio, output
        if torch.cuda.is_available():
            torch.cuda.empty_cache()

    print(f"Selesai. RTTM di {out_dir}")


if __name__ == "__main__":
    main()
