"""Audio rapat -> Risalah Rapat, dari terminal (pipeline yang sama dengan web).

Contoh:
    python scripts/run_pipeline.py rapat.wav --judul "Evaluasi Pengadaan Q3" \\
        --tanggal 2026-10-06 --mulai 09:00 --tempat "Ruang Rapat Lt. 3"

Nama pembicara ditanyakan setelah analisis, atau diberikan langsung:
    --nama "SPEAKER_00=Budi Santoso,SPEAKER_01=Sari Dewi"
"""

import argparse
import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

from sinopsis_research.app.pipeline import AppConfig, NotulensiPipeline, create_job  # noqa: E402


def parse_names(text: str) -> dict:
    names = {}
    for pair in filter(None, (p.strip() for p in text.split(","))):
        label, _, name = pair.partition("=")
        names[label.strip()] = name.strip()
    return names


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("audio", type=Path)
    parser.add_argument("--judul", required=True)
    parser.add_argument("--tanggal", default="")
    parser.add_argument("--mulai", default="")
    parser.add_argument("--tempat", default="")
    parser.add_argument("--nama", default=None, help='"SPEAKER_00=Nama,SPEAKER_01=Nama"')
    parser.add_argument("--config", type=Path, default=Path(__file__).resolve().parents[1] / "configs" / "app.yaml")
    args = parser.parse_args()

    config = AppConfig.load(args.config)
    pipeline = NotulensiPipeline(config)
    job = create_job(config.hasil_dir, args.audio.name, args.judul, args.tanggal, args.tempat, args.mulai)
    shutil.copyfile(args.audio, job.audio_path)

    print(f"Memproses {args.audio.name} -> {job.dir}")
    pipeline.analyze(job)
    meta = job.read()
    for key, step in meta["steps"].items():
        if step["status"] != "menunggu":
            print(f"  {step['status']:<9} {step['label']}{' — ' + step['detail'] if step['detail'] else ''}")
    if meta["status"] == "gagal":
        sys.exit(f"Gagal: {meta['error']}")

    names = parse_names(args.nama) if args.nama is not None else {}
    if args.nama is None:
        print(f"\nTerdeteksi {len(meta['speakers'])} pembicara. Contoh suara: {job.dir / 'contoh'}")
        for label, info in sorted(meta["speakers"].items(), key=lambda kv: -kv[1]["porsi"]):
            gender = f", {info['gender']}" if info.get("gender") else ""
            print(f"\n▶ {label} ({info['porsi']:.0%} waktu bicara{gender})")
            if info.get("contoh_kalimat"):
                print(f'  "{info["contoh_kalimat"]}"')
            names[label] = input("  Nama: ").strip()

    pipeline.finalize(job, names)
    meta = job.read()
    if meta["status"] == "gagal":
        sys.exit(f"Gagal: {meta['error']}")
    print(f"\n✓ {job.dir / 'risalah.docx'}\n✓ {job.dir / 'risalah.md'}")


if __name__ == "__main__":
    main()
