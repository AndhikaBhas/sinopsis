"""Jalankan antarmuka web notulensi di http://127.0.0.1:5000 (hanya localhost)."""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

from sinopsis_research.app.pipeline import AppConfig  # noqa: E402
from sinopsis_research.web.app import create_app  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path, default=Path(__file__).resolve().parents[1] / "configs" / "app.yaml")
    parser.add_argument("--port", type=int, default=5000)
    args = parser.parse_args()
    app = create_app(AppConfig.load(args.config))
    print(f"Buka http://127.0.0.1:{args.port} di browser. Tekan Ctrl+C untuk berhenti.")
    app.run(host="127.0.0.1", port=args.port, threaded=True)


if __name__ == "__main__":
    main()
