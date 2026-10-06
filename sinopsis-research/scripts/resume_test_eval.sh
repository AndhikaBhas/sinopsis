#!/usr/bin/env bash
# Lanjutkan evaluasi akhir A/B/C pada AMI test bila sempat terhenti.
# Varian A dilewati untuk berkas yang RTTM-nya sudah ada; varian B & C memakai
# cache embedding (cache/grid) sehingga rapat yang sudah diproses hanya butuh detik.
set -eu
cd "$(dirname "$0")/.."
nice -n 5 .venv/bin/python -u scripts/run_diarization.py --config configs/baseline_a.yaml --audio-dir data/ami/test/audio --out-dir outputs/test
nice -n 5 .venv/bin/python -u scripts/run_variants.py --configs configs/baseline_b.yaml configs/tuned.yaml --audio-dir data/ami/test/audio --out-dir outputs/test
for v in baseline_a baseline_b tuned; do
  echo "== HASIL $v"
  .venv/bin/python scripts/evaluate_der.py --ref data/ami/test/rttm --uem data/ami/test/uem --hyp outputs/test/$v --out results/test_$v.csv
  .venv/bin/python scripts/evaluate_der.py --ref data/ami/test/rttm --uem data/ami/test/uem --hyp outputs/test/$v --collar 0 --out results/test_${v}_collar0.csv
done
