from contextlib import contextmanager
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

import uploader


class FakeIPFS:
    def __init__(self):
        self.data = None
        self.pinned = None
        self.pin = self

    def add_bytes(self, data):
        self.data = data
        return "Qm" + "c" * 44

    def add(self, cid):
        self.pinned = cid

    def id(self):
        return {"ID": "test-node"}


def test_report_is_scored_and_pinned(monkeypatch):
    monkeypatch.setenv("KALLY_SERVICE_TOKEN", "test-operator-token")
    fake = FakeIPFS()

    @contextmanager
    def client():
        yield fake

    monkeypatch.setattr(uploader, "ipfs_client", client)
    result = uploader.create_report(uploader.Submission(
        model="DemoModel", checkpoint_cid="Qm" + "a" * 44,
        predictions=["positive", "negative"] * 5,
    ), authorization="Bearer test-operator-token")
    assert result["report"]["score_bps"] == 10000
    assert fake.pinned == result["cid"]
    assert b'"score_bps":10000' in fake.data


def test_report_write_requires_operator_token(monkeypatch):
    monkeypatch.setenv("KALLY_SERVICE_TOKEN", "test-operator-token")
    submission = uploader.Submission(model="DemoModel", checkpoint_cid="Qm" + "a" * 44, predictions=["positive"] * 10)
    with pytest.raises(HTTPException) as error:
        uploader.create_report(submission, authorization="Bearer wrong-token")
    assert error.value.status_code == 401


def test_report_write_fails_closed_without_token(monkeypatch):
    monkeypatch.delenv("KALLY_SERVICE_TOKEN", raising=False)
    submission = uploader.Submission(model="DemoModel", checkpoint_cid="Qm" + "a" * 44, predictions=["positive"] * 10)
    with pytest.raises(HTTPException) as error:
        uploader.create_report(submission, authorization="Bearer anything")
    assert error.value.status_code == 503


def test_report_http_requires_authorization(monkeypatch):
    monkeypatch.setenv("KALLY_SERVICE_TOKEN", "test-operator-token")
    client = TestClient(uploader.app)
    payload = {"model": "DemoModel", "checkpoint_cid": "Qm" + "a" * 44, "predictions": ["positive"] * 10}
    assert client.post("/reports", json=payload).status_code == 401
    assert client.post("/reports", json={**payload, "predictions": ["positive"] * 100}, headers={"Authorization": "Bearer test-operator-token"}).status_code == 422


def test_report_http_rejects_large_ipfs_response(monkeypatch):
    fake = FakeIPFS()
    fake.cat = lambda cid: b"x" * 65537

    @contextmanager
    def client():
        yield fake

    monkeypatch.setattr(uploader, "ipfs_client", client)
    response = TestClient(uploader.app).get("/reports/" + "Qm" + "a" * 44)
    assert response.status_code == 413


def test_ipfs_report_is_cached_by_content_id(monkeypatch):
    calls = []
    fake = FakeIPFS()
    fake.cat = lambda cid: calls.append(cid) or b'{"schema":"kally.report.v1"}'

    @contextmanager
    def client():
        yield fake

    monkeypatch.setattr(uploader, "ipfs_client", client)
    cid = "Qm" + "d" * 44
    uploader.load_report.cache_clear()
    assert uploader.get_report(cid) == uploader.get_report(cid)
    assert calls == [cid]


def test_readiness_checks_operator_configuration_and_ipfs(monkeypatch):
    monkeypatch.delenv("KALLY_SERVICE_TOKEN", raising=False)
    assert TestClient(uploader.app).get("/ready").status_code == 503
    monkeypatch.setenv("KALLY_SERVICE_TOKEN", "test-operator-token")

    @contextmanager
    def client():
        yield FakeIPFS()

    monkeypatch.setattr(uploader, "ipfs_client", client)
    assert TestClient(uploader.app).get("/ready").json()["status"] == "ready"
