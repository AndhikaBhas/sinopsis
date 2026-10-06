"""Pembangun pipeline diarization dari berkas konfigurasi YAML.

Tiga varian penelitian (lihat configs/):
  A  baseline_a  — pyannote/speaker-diarization-community-1, parameter default.
                   Identik dengan bw-worker-diarizer (sistem Sinopsis saat ini).
  B  baseline_b  — Segmentation-3.0 + ECAPA-TDNN (SpeechBrain) + AHC,
                   parameter default pyannote 3.1. Pipeline sesuai proposal.
  C  tuned       — varian B dengan parameter hasil grid search.

Format konfigurasi:

    name: baseline_b
    pipeline:
      # salah satu dari:
      pretrained: pyannote/speaker-diarization-community-1
      # atau:
      segmentation: pyannote/segmentation-3.0
      embedding: speechbrain/spkrec-ecapa-voxceleb
      clustering: AgglomerativeClustering
    params:            # ditimpa di atas parameter default pipeline
      clustering:
        threshold: 0.65
    num_speakers: null  # opsional: paksa jumlah pembicara
"""

import copy
import os

# pyannote.audio 4.x mengirim telemetri (durasi berkas, jumlah pembicara) ke
# server pyannote. Dimatikan secara default agar sistem benar-benar on-premise.
# Harus di-set sebelum pyannote.audio diimpor.
os.environ.setdefault("PYANNOTE_METRICS_ENABLED", "false")

from dataclasses import dataclass  # noqa: E402
from pathlib import Path  # noqa: E402
from typing import Any, Dict, Optional, Union  # noqa: E402

import numpy as np  # noqa: E402
import torch  # noqa: E402
import yaml  # noqa: E402
from pyannote.core import Annotation  # noqa: E402

# Parameter default pyannote/speaker-diarization-3.1, dipakai sebagai titik
# awal varian dengan komponen custom (B dan C).
PYANNOTE_31_DEFAULT_PARAMS = {
    "segmentation": {"min_duration_off": 0.0},
    "clustering": {"method": "centroid", "min_cluster_size": 12, "threshold": 0.7045654963945799},
}


@dataclass
class DiarizationConfig:
    name: str
    pipeline: Dict[str, Any]
    params: Dict[str, Any]
    num_speakers: Optional[int] = None
    min_speakers: Optional[int] = None
    max_speakers: Optional[int] = None

    @classmethod
    def from_yaml(cls, path: Union[str, Path]) -> "DiarizationConfig":
        with open(path, encoding="utf-8") as f:
            raw = yaml.safe_load(f)
        return cls(
            name=raw.get("name", Path(path).stem),
            pipeline=raw["pipeline"],
            params=raw.get("params") or {},
            num_speakers=raw.get("num_speakers"),
            min_speakers=raw.get("min_speakers"),
            max_speakers=raw.get("max_speakers"),
        )

    def with_params(self, overrides: Dict[str, Any], name: Optional[str] = None) -> "DiarizationConfig":
        """Salinan config dengan parameter tambahan (dipakai grid search)."""
        clone = copy.deepcopy(self)
        clone.params = deep_merge(clone.params, overrides)
        if name:
            clone.name = name
        return clone


@dataclass
class DiarizationOutput:
    annotation: Annotation
    # Embedding rata-rata per pembicara, urut sesuai annotation.labels().
    # Dipakai oleh cross-segment speaker tracking. None jika tidak tersedia.
    speaker_embeddings: Optional[np.ndarray]


def hf_token() -> Optional[str]:
    for key in ("HF_TOKEN", "HUGGINGFACE_AUTH_TOKEN", "HUGGINGFACE_HUB_TOKEN"):
        if os.environ.get(key):
            return os.environ[key]
    return None


def deep_merge(base: Dict[str, Any], overrides: Dict[str, Any]) -> Dict[str, Any]:
    merged = copy.deepcopy(base)
    for key, value in (overrides or {}).items():
        if isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key] = deep_merge(merged[key], value)
        else:
            merged[key] = value
    return merged


def _patch_speechbrain_compat() -> None:
    """Jembatani pyannote.audio 4.0.1 dengan SpeechBrain >= 1.1.

    pyannote memanggil `EncoderClassifier.from_hparams(use_auth_token=...,
    huggingface_cache_dir=..., revision=...)`, sedangkan SpeechBrain 1.1
    memindahkan argumen tersebut ke `fetch_config=FetchConfig(...)`. Selain
    itu pyannote menyimpan model di "None/speechbrain" jika cache_dir kosong, dan
    mengirim device sebagai torch.device padahal SpeechBrain 1.1 butuh string.
    Patch hanya berlaku di proses ini; berkas library tidak diubah.
    """
    try:
        from pyannote.audio.pipelines import speaker_verification as sv
        from speechbrain.utils.fetching import FetchConfig
    except ImportError:
        return
    base = getattr(sv, "SpeechBrain_EncoderClassifier", None)
    if base is None or getattr(base, "_sinopsis_compat", False):
        return

    class CompatEncoderClassifier(base):
        _sinopsis_compat = True

        @classmethod
        def from_hparams(cls, source, *args, use_auth_token=None, huggingface_cache_dir=None, revision=None, **kwargs):
            savedir = kwargs.get("savedir")
            if savedir is None or str(savedir).startswith("None"):
                kwargs["savedir"] = str(Path.home() / ".cache" / "speechbrain" / source.replace("/", "--"))
            run_opts = dict(kwargs.get("run_opts") or {})
            if "device" in run_opts:
                run_opts["device"] = str(run_opts["device"])  # SpeechBrain 1.1 butuh string
                kwargs["run_opts"] = run_opts
            kwargs.setdefault(
                "fetch_config",
                FetchConfig(token=use_auth_token or False, revision=revision, huggingface_cache_dir=huggingface_cache_dir),
            )
            return base.from_hparams(source, *args, **kwargs)

    sv.SpeechBrain_EncoderClassifier = CompatEncoderClassifier


def default_device() -> torch.device:
    return torch.device("cuda" if torch.cuda.is_available() else "cpu")


class Diarizer:
    """Membungkus satu pipeline pyannote yang sudah dimuat.

    Model hanya dimuat sekali; `set_params` dapat dipanggil berulang kali
    (grid search) tanpa memuat ulang bobot model.
    """

    def __init__(self, config: DiarizationConfig, device: Optional[torch.device] = None):
        self.config = config
        self.device = device or default_device()
        self.pipeline = self._build(config.pipeline)
        self.default_params = self.pipeline.parameters(instantiated=True)
        self.set_params(config.params)
        self.pipeline.to(self.device)

    @staticmethod
    def _build(spec: Dict[str, Any]):
        token = hf_token()
        if "pretrained" in spec:
            from pyannote.audio import Pipeline

            pipeline = Pipeline.from_pretrained(spec["pretrained"], token=token)
            if pipeline is None:
                raise RuntimeError(
                    f"Gagal memuat {spec['pretrained']}. Pastikan HF_TOKEN di .env benar "
                    f"dan syarat model sudah disetujui di halaman Hugging Face-nya."
                )
            return pipeline

        from pyannote.audio.pipelines import SpeakerDiarization

        _patch_speechbrain_compat()
        pipeline = SpeakerDiarization(
            segmentation=spec.get("segmentation", "pyannote/segmentation-3.0"),
            embedding=spec.get("embedding", "speechbrain/spkrec-ecapa-voxceleb"),
            clustering=spec.get("clustering", "AgglomerativeClustering"),
            embedding_exclude_overlap=spec.get("embedding_exclude_overlap", True),
            token=token,
        )
        pipeline.instantiate(PYANNOTE_31_DEFAULT_PARAMS)
        return pipeline

    def set_params(self, overrides: Dict[str, Any]) -> Dict[str, Any]:
        """Terapkan parameter di atas default pipeline. Mengembalikan parameter final."""
        params = deep_merge(self.default_params, overrides)
        self.pipeline.instantiate(params)
        return params

    @property
    def params(self) -> Dict[str, Any]:
        return self.pipeline.parameters(instantiated=True)

    def __call__(self, audio: dict) -> DiarizationOutput:
        kwargs = {
            key: getattr(self.config, key)
            for key in ("num_speakers", "min_speakers", "max_speakers")
            if getattr(self.config, key) is not None
        }
        output = self.pipeline(audio, **kwargs)

        # pyannote 4.x mengembalikan DiarizeOutput; pyannote 3.x bisa
        # mengembalikan Annotation atau (Annotation, embeddings).
        if hasattr(output, "speaker_diarization"):
            annotation = output.speaker_diarization
            embeddings = getattr(output, "speaker_embeddings", None)
        elif isinstance(output, tuple):
            annotation, embeddings = output
        else:
            annotation, embeddings = output, None

        annotation.uri = audio.get("uri", annotation.uri)
        return DiarizationOutput(annotation=annotation, speaker_embeddings=embeddings)
