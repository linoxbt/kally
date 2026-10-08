from contextlib import contextmanager

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


def test_report_is_scored_and_pinned(monkeypatch):
    fake = FakeIPFS()

    @contextmanager
    def client():
        yield fake

    monkeypatch.setattr(uploader, "ipfs_client", client)
    result = uploader.create_report(uploader.Submission(
        model="DemoModel", checkpoint_cid="Qm" + "a" * 44,
        predictions=["positive", "negative"] * 5,
    ))
    assert result["report"]["score_bps"] == 10000
    assert fake.pinned == result["cid"]
    assert b'"score_bps":10000' in fake.data
