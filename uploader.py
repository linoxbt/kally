"""Immutable demo benchmark reports published to IPFS.

Start an IPFS Kubo daemon separately and set IPFS_API if needed.
"""
import json
import os
import re
from contextlib import contextmanager

import ipfshttpclient
from fastapi import FastAPI, HTTPException, UploadFile, File
from pydantic import BaseModel, Field

from benchmark.scoring import FIXTURE, score_predictions

app = FastAPI(title="Kally benchmark service")
CID_RE = re.compile(r"^[a-zA-Z0-9]{40,100}$")


class Submission(BaseModel):
    model: str = Field(min_length=1, max_length=100)
    metric: str = "accuracy"
    checkpoint_cid: str = Field(min_length=40, max_length=100)
    predictions: list[str]


@contextmanager
def ipfs_client():
    client = ipfshttpclient.connect(os.getenv("IPFS_API", "/ip4/127.0.0.1/tcp/5001/http"))
    try:
        yield client
    finally:
        client.close()


@app.get("/health")
def health():
    return {"status": "ok", "dataset": FIXTURE["dataset"]}


@app.post("/checkpoints")
async def upload_checkpoint(file: UploadFile = File(...)):
    data = await file.read(20_000_001)
    if not data or len(data) > 20_000_000:
        raise HTTPException(413, "checkpoint must be 1 byte to 20 MB")
    try:
        with ipfs_client() as client:
            cid = client.add_bytes(data)
            client.pin.add(cid)
    except Exception as exc:
        raise HTTPException(503, f"IPFS unavailable: {exc}") from exc
    return {"cid": cid, "bytes": len(data)}


@app.post("/reports")
def create_report(submission: Submission):
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
        raise HTTPException(503, f"IPFS unavailable: {exc}") from exc
    return {"cid": cid, "report": report}


@app.get("/reports/{cid}")
def get_report(cid: str):
    if not CID_RE.fullmatch(cid):
        raise HTTPException(422, "invalid CID")
    try:
        with ipfs_client() as client:
            raw = client.cat(cid)
        return json.loads(raw)
    except Exception as exc:
        raise HTTPException(503, f"IPFS unavailable: {exc}") from exc
