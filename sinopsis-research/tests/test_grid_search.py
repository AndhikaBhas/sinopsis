import importlib.util
from pathlib import Path

spec = importlib.util.spec_from_file_location(
    "grid_search", Path(__file__).resolve().parents[1] / "scripts" / "grid_search.py"
)
grid_search = importlib.util.module_from_spec(spec)
spec.loader.exec_module(grid_search)


def test_expand_cartesian_product():
    combos = grid_search.expand({"a.x": [1, 2], "b.y": [3]})
    assert combos == [{"a.x": 1, "b.y": 3}, {"a.x": 2, "b.y": 3}]


def test_nest_dotted_keys():
    assert grid_search.nest({"clustering.threshold": 0.6, "segmentation.min_duration_off": 0.0}) == {
        "clustering": {"threshold": 0.6},
        "segmentation": {"min_duration_off": 0.0},
    }


def test_vad_combinations_dedupes_no_vad():
    combos = grid_search.vad_combinations(
        {"threshold": [None, 0.5], "min_speech_duration": [0.2, 0.3], "min_silence_duration": [0.1]}
    )
    assert combos.count(None) == 1
    assert len(combos) == 3


def test_find_default_row():
    rows = [
        {"clustering.threshold": 0.6, "vad.threshold": "none", "der": 0.2},
        {"clustering.threshold": 0.7045654963945799, "vad.threshold": 0.5, "der": 0.1},
        {"clustering.threshold": 0.7045654963945799, "vad.threshold": "none", "der": 0.3},
    ]
    default = grid_search._find_default(rows, {"clustering": {"threshold": 0.7045654963945799}})
    assert default["der"] == 0.3
