import hashlib
import io
import json
import asyncio
from contextlib import contextmanager
from tempfile import SpooledTemporaryFile

import pytest
from fastapi import HTTPException, UploadFile

import uploader
from benchmark.validator_v2 import canonical_bytes, parse_artifact, score


MODEL = {"schema": "kally.linear.v1", "weights": [2, -1], "bias": 0}
DATASET = {"schema": "kally.dataset.v1", "nonce": "a" * 64, "examples": [
    {"features": [2, 0], "label": 1},
    {"features": [-2, 0], "label": 0},
    {"features": [0, 3], "label": 0},
    {"features": [0, -3], "label": 1},
]}


def test_validator_scoring_and_bounds():
    assert score(MODEL, DATASET) == 10_000
    assert score({**MODEL, "weights": [-2, 1]}, DATASET) == 0
    for invalid in ({**MODEL, "weights": [True]}, {**MODEL, "weights": [10**9]}, {**MODEL, "weights": []}):
        with pytest.raises(ValueError):
            score(invalid, DATASET)
    with pytest.raises(ValueError):
        score(MODEL, {**DATASET, "nonce": "0"})
    with pytest.raises(ValueError):
        score(MODEL, {**DATASET, "examples": [{"features": [1], "label": 1}]})
    assert parse_artifact(canonical_bytes(MODEL), "model") == MODEL


def test_v2_upload_returns_commitment(monkeypatch):
    def upload(data):
        file = SpooledTemporaryFile()
        file.write(data)
        file.seek(0)
        return UploadFile(file=file)

    class FakeIPFS:
        def __init__(self):
            self.pin = self

        def add_bytes(self, data):
            assert data == canonical_bytes(MODEL)
            return "Qm" + "a" * 44

        def add(self, cid):
            assert cid.startswith("Qm")

        def close(self):
            pass

    monkeypatch.setenv("KALLY_SERVICE_TOKEN", "test-token")
    @contextmanager
    def client():
        yield FakeIPFS()

    monkeypatch.setattr(uploader, "ipfs_client", client)
    raw = canonical_bytes(MODEL)
    response = asyncio.run(uploader.upload_v2_artifact("model", upload(raw), authorization="Bearer test-token"))
    assert response["sha256"] == hashlib.sha256(raw).hexdigest()
    with pytest.raises(HTTPException) as error:
        asyncio.run(uploader.upload_v2_artifact("model", upload(raw), authorization=None))
    assert error.value.status_code == 401
    with pytest.raises(HTTPException) as error:
        asyncio.run(uploader.upload_v2_artifact("model", upload(json.dumps({**MODEL, "weights": [True]}).encode()), authorization="Bearer test-token"))
    assert error.value.status_code == 422
