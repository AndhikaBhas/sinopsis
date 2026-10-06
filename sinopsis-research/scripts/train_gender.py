"""Latih & evaluasi klasifikasi gender pada AMI (label dari ID pembicara M/F).

Contoh:
    python scripts/train_gender.py --train data/ami/dev --test data/ami/test \\
        --model models/gender_mlp.joblib --out results/gender_test.csv

Fitur diekstrak dari segmen referensi tanpa overlap (maks. 60 detik per
pembicara per rapat). Akurasi dilaporkan per segmen dan per pembicara.
"""

import argparse
import csv
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import numpy as np  # noqa: E402

from sinopsis_research.audio import load_audio  # noqa: E402
from sinopsis_research.gender import GenderClassifier, ami_gender, segment_features, speaker_segments  # noqa: E402
from sinopsis_research.rttm import load_rttm_dir  # noqa: E402


def collect(subset_dir: Path):
    """[(uri, speaker, gender, [fitur, ...]), ...]"""
    references = load_rttm_dir(subset_dir / "rttm")
    rows = []
    for path in sorted((subset_dir / "audio").glob("*.wav")):
        if path.stem not in references:
            continue
        audio = load_audio(path)
        waveform = audio["waveform"].numpy()
        for speaker, segments in speaker_segments(references[path.stem]).items():
            gender = ami_gender(speaker)
            if gender is None:
                continue
            features = segment_features(waveform, audio["sample_rate"], segments)
            rows.append((path.stem, speaker, gender, features))
        print(f"  {path.stem}: {len(references[path.stem].labels())} pembicara", flush=True)
    return rows


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--train", type=Path, required=True)
    parser.add_argument("--test", type=Path, required=True)
    parser.add_argument("--model", type=Path, default=Path("models/gender_mlp.joblib"))
    parser.add_argument("--out", type=Path, default=None)
    args = parser.parse_args()

    print("Ekstraksi fitur data latih...", flush=True)
    train = collect(args.train)
    x = np.stack([f for *_, feats in train for f in feats])
    y = [g for _, _, g, feats in train for _ in feats]
    print(f"  {len(y)} segmen ({y.count('pria')} pria, {y.count('wanita')} wanita)")

    classifier = GenderClassifier.train(x, y)
    classifier.save(args.model)
    print(f"Model disimpan: {args.model}")

    print("Ekstraksi fitur data uji...", flush=True)
    test = collect(args.test)

    seg_correct = seg_total = spk_correct = 0
    report = []
    for uri, speaker, gender, feats in test:
        if not feats:
            continue
        predictions = [
            ("pria", "wanita")[int(np.argmax(p))] for p in classifier.predict_proba(np.stack(feats))
        ]
        seg_correct += sum(p == gender for p in predictions)
        seg_total += len(predictions)
        predicted, confidence = classifier.predict_speaker(feats)
        spk_correct += predicted == gender
        report.append(
            {
                "uri": uri,
                "speaker": speaker,
                "gender": gender,
                "predicted": predicted,
                "confidence": round(confidence, 3),
                "segments": len(feats),
            }
        )

    print(f"\nAkurasi per segmen   : {seg_correct / seg_total:.1%} ({seg_correct}/{seg_total})")
    print(f"Akurasi per pembicara: {spk_correct / len(report):.1%} ({spk_correct}/{len(report)})")
    for row in report:
        mark = "✓" if row["predicted"] == row["gender"] else "✗"
        print(f"  {mark} {row['uri']} {row['speaker']:<8} {row['gender']:<7} -> {row['predicted']} ({row['confidence']:.2f})")

    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        with open(args.out, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=list(report[0].keys()))
            writer.writeheader()
            writer.writerows(report)


if __name__ == "__main__":
    main()
