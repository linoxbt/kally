import json
from pathlib import Path

FIXTURE = json.loads((Path(__file__).with_name("fixtures.json")).read_text())


def score_predictions(predictions: list[str]) -> int:
    """Return integer basis points (0..10000) for the fixed demo classification task."""
    labels = FIXTURE["labels"]
    if len(predictions) != len(labels) or any(p not in {"positive", "negative"} for p in predictions):
        raise ValueError("predictions must contain exactly 10 positive/negative labels")
    return sum(a == b for a, b in zip(predictions, labels)) * 10000 // len(labels)
