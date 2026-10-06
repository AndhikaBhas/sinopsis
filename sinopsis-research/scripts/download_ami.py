"""Unduh subset AMI Meeting Corpus.

Contoh:
    python scripts/download_ami.py --subset dev --limit 4
    python scripts/download_ami.py --subset test --limit 4
    python scripts/download_ami.py --subset test --no-audio   # label saja
"""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sinopsis_research.data.ami import SUBSETS, download_subset  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--subset", choices=SUBSETS, required=True)
    parser.add_argument("--limit", type=int, default=None, help="jumlah rapat (default: semua)")
    parser.add_argument("--root", type=Path, default=Path("data/ami"))
    parser.add_argument("--no-audio", action="store_true", help="hanya unduh RTTM & UEM")
    args = parser.parse_args()

    meetings = download_subset(args.subset, args.root, limit=args.limit, with_audio=not args.no_audio)
    print(f"Selesai: {len(meetings)} rapat di {args.root / args.subset}")


if __name__ == "__main__":
    main()
