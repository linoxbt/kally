"""Immutable demo benchmark reports published to IPFS.

Start an IPFS Kubo daemon separately and set IPFS_API if needed.
"""
import json
import hashlib
import os
import re
import secrets
from contextlib import contextmanager
from functools import lru_cache

import ipfshttpclient
from fastapi import FastAPI, HTTPException, UploadFile, File, Header
from pydantic import BaseModel, Field

from benchmark.scoring import FIXTURE, score_predictions
from benchmark.validator_v2 import parse_artifact

app = FastAPI(title="Kally benchmark service")
CID_RE = re.compile(r"^[a-zA-Z0-9]{40,100}$")


class Submission(BaseModel):
    model: str = Field(min_length=1, max_length=100)
    metric: str = "accuracy"
    checkpoint_cid: str = Field(min_length=40, max_length=100)
    predictions: list[str] = Field(min_length=10, max_length=10)


def require_operator(authorization: str | None) -> None:
    token = os.getenv("KALLY_SERVICE_TOKEN", "")
    if not token:
        raise HTTPException(503, "report service is not configured")
    if not authorization or not secrets.compare_digest(authorization, f"Bearer {token}"):
        raise HTTPException(401, "operator authorization required")


@contextmanager
def ipfs_client():
    # ipfshttpclient.connect() rejects modern Kubo versions before issuing any
    # request. The stable HTTP endpoints we use are compatible with Client().
    client = ipfshttpclient.Client(os.getenv("IPFS_API", "/ip4/127.0.0.1/tcp/5001/http"), timeout=(3, 10))
    try:
        yield client
    finally:
        client.close()


@app.get("/health")
def health():
    return {"status": "ok", "dataset": FIXTURE["dataset"]}


@app.get("/ready")
def ready():
    if not os.getenv("KALLY_SERVICE_TOKEN"):
        raise HTTPException(503, "report service is not configured")
    try:
        with ipfs_client() as client:
            client.id()
    except Exception as exc:
        raise HTTPException(503, "IPFS unavailable") from exc
    return {"status": "ready", "dataset": FIXTURE["dataset"]}


@app.post("/checkpoints")
async def upload_checkpoint(file: UploadFile = File(...), authorization: str | None = Header(default=None)):
    require_operator(authorization)
    data = await file.read(20_000_001)
    if not data or len(data) > 20_000_000:
        raise HTTPException(413, "checkpoint must be 1 byte to 20 MB")
    try:
        with ipfs_client() as client:
            cid = client.add_bytes(data)
            client.pin.add(cid)
    except Exception as exc:
        raise HTTPException(503, "IPFS unavailable") from exc
    return {"cid": cid, "bytes": len(data)}


@app.post("/v2/artifacts/{kind}")
async def upload_v2_artifact(kind: str, file: UploadFile = File(...), authorization: str | None = Header(default=None)):
    """Pin a bounded JSON model or dataset and return the on-chain commitment."""
    require_operator(authorization)
    if kind not in ("model", "dataset"):
        raise HTTPException(404, "unknown artifact kind")
    data = await file.read(65_537)
    try:
        parse_artifact(data, kind)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    try:
        with ipfs_client() as client:
            cid = client.add_bytes(data)
            client.pin.add(cid)
    except Exception as exc:
        raise HTTPException(503, "IPFS unavailable") from exc
    return {"cid": cid, "sha256": hashlib.sha256(data).hexdigest(), "bytes": len(data), "kind": kind}


@app.post("/reports")
def create_report(submission: Submission, authorization: str | None = Header(default=None)):
    require_operator(authorization)
    if submission.metric != "accuracy" or not CID_RE.fullmatch(submission.checkpoint_cid):
        raise HTTPException(422, "metric must be accuracy and checkpoint_cid must be a CID")
    try:
        score = score_predictions(submission.predictions)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    report = {
        "schema": "kally.report.v1",
        "model": submission.model,
        "metric": submission.metric,
        "dataset": FIXTURE["dataset"],
        "checkpoint_cid": submission.checkpoint_cid,
        "predictions": submission.predictions,
        "score_bps": score,
    }
    try:
        with ipfs_client() as client:
            cid = client.add_bytes(json.dumps(report, sort_keys=True, separators=(",", ":")).encode())
            client.pin.add(cid)
    except Exception as exc:
        raise HTTPException(503, "IPFS unavailable") from exc
    return {"cid": cid, "report": report}


@app.get("/reports/{cid}")
def get_report(cid: str):
    if not CID_RE.fullmatch(cid):
        raise HTTPException(422, "invalid CID")
    return load_report(cid)


@lru_cache(maxsize=128)
def load_report(cid: str):
    try:
        with ipfs_client() as client:
            raw = client.cat(cid)
        if len(raw) > 65536:
            raise HTTPException(413, "report too large")
        return json.loads(raw)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(503, "IPFS unavailable") from exc
