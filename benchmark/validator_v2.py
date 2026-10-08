"""Bounded, deterministic benchmark supported by Kally V2 validators.

The exact algorithm is embedded in the standalone GenLayer contract. This
module provides upload validation and golden vectors for parity tests.
"""
import hashlib
import json

MAX_BYTES = 65_536
MAX_DIMENSIONS = 16
MAX_EXAMPLES = 32
MAX_INTEGER = 1_000_000


def canonical_bytes(value: object) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode("utf-8")


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _bounded_integer(value: object) -> bool:
    return type(value) is int and -MAX_INTEGER <= value <= MAX_INTEGER


def validate_model(model: object) -> int:
    if not isinstance(model, dict) or set(model) != {"schema", "weights", "bias"} or model["schema"] != "kally.linear.v1":
        raise ValueError("expected kally.linear.v1 model with weights and bias")
    weights = model["weights"]
    if not isinstance(weights, list) or not 1 <= len(weights) <= MAX_DIMENSIONS or not all(_bounded_integer(w) for w in weights):
        raise ValueError("weights must be 1 to 16 bounded integers")
    if not _bounded_integer(model["bias"]):
        raise ValueError("bias must be a bounded integer")
    return len(weights)


def validate_dataset(dataset: object, dimensions: int | None = None) -> int:
    if not isinstance(dataset, dict) or set(dataset) != {"schema", "examples", "nonce"} or dataset["schema"] != "kally.dataset.v1":
        raise ValueError("expected kally.dataset.v1 dataset with examples")
    if not isinstance(dataset["nonce"], str) or len(dataset["nonce"]) != 64 or any(c not in "0123456789abcdef" for c in dataset["nonce"]):
        raise ValueError("dataset nonce must be 32 random bytes as lowercase hex")
    examples = dataset["examples"]
    if not isinstance(examples, list) or not 1 <= len(examples) <= MAX_EXAMPLES:
        raise ValueError("dataset must have 1 to 32 examples")
    for example in examples:
        if not isinstance(example, dict) or set(example) != {"features", "label"}:
            raise ValueError("each example needs features and label")
        features = example["features"]
        if not isinstance(features, list) or not 1 <= len(features) <= MAX_DIMENSIONS or (dimensions is not None and len(features) != dimensions) or not all(_bounded_integer(v) for v in features):
            raise ValueError("invalid example features")
        if type(example["label"]) is not int or example["label"] not in (0, 1):
            raise ValueError("labels must be 0 or 1")
    return len(examples)


def score(model: object, dataset: object) -> int:
    dimensions = validate_model(model)
    count = validate_dataset(dataset, dimensions)
    correct = 0
    for example in dataset["examples"]:
        prediction = int(model["bias"]) + sum(w * v for w, v in zip(model["weights"], example["features"])) >= 0
        correct += int(prediction == example["label"])
    return correct * 10_000 // count


def parse_artifact(data: bytes, kind: str) -> dict:
    if not data or len(data) > MAX_BYTES:
        raise ValueError("artifact must be 1 to 65536 bytes")
    try:
        value = json.loads(data)
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ValueError("artifact must be JSON") from exc
    if kind == "model":
        validate_model(value)
    elif kind == "dataset":
        validate_dataset(value)
    else:
        raise ValueError("invalid artifact kind")
    return value
