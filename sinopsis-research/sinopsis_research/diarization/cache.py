"""Cache segmentasi & embedding pyannote di disk.

Dalam mode training, pipeline pyannote menyimpan hasil segmentasi dan
embedding di dict file (kunci "training_cache/*") dan memakainya ulang ketika
hanya parameter clustering/pasca-pemrosesan yang berubah. Modul ini menyimpan
entri tersebut ke disk sehingga eksperimen berikutnya (grid search lanjutan,
evaluasi beberapa varian) tidak perlu menjalankan ulang model.

Cache hanya sah untuk kombinasi model yang sama (lihat `pipeline_cache_key`).
"""

import hashlib
import json
import pickle
from pathlib import Path

from .pipelines import DiarizationConfig

DEFAULT_CACHE_DIR = Path("cache/grid")


def pipeline_cache_key(config: DiarizationConfig) -> str:
    return hashlib.sha1(json.dumps(config.pipeline, sort_keys=True).encode()).hexdigest()[:10]


def cache_path(config: DiarizationConfig, uri: str, cache_dir: Path = DEFAULT_CACHE_DIR) -> Path:
    return Path(cache_dir) / pipeline_cache_key(config) / f"{uri}.pkl"


def load_training_cache(path: Path) -> dict:
    if not Path(path).exists():
        return {}
    with open(path, "rb") as f:
        return pickle.load(f)


def save_training_cache(file: dict, path: Path) -> None:
    """Simpan entri "training_cache/*" dari dict file pyannote (sekali per rapat)."""
    path = Path(path)
    if path.exists():
        return
    cache = {k: v for k, v in file.items() if k.startswith("training_cache/")}
    if not cache:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    with open(tmp, "wb") as f:
        pickle.dump(cache, f)
    tmp.rename(path)
