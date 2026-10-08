# Kally

Kally is a GenLayer prediction market for whether a model reaches a target score on a fixed benchmark by a deadline. This repository contains one GenLayer contract per market, a small IPFS backed benchmark service, and direct contract tests.

The web experience is in `frontend/`. It has a landing page and a Studio Dev app for market discovery, wallet connection, betting, claims, and market creation. Run `cd frontend && npm install && npm run dev` for local development, or `npm run build` for a production build. The app includes the deployed demo market by default and stores additional contract addresses in browser storage. Reown AppKit connects EVM wallets; set `NEXT_PUBLIC_REOWN_PROJECT_ID` for local development.

## What this demo measures

The supplied benchmark is a ten item binary classification task. The service scores an uploaded list of predictions against the checked in labels and records an integer score in basis points (0 to 10,000). The contract recomputes that score from the report predictions during resolution. The checkpoint upload gives the market an immutable artifact CID, but **this demo does not execute the checkpoint** or prove that predictions came from it. Do not use it for real money until a reproducible, isolated model runner and an attested binding between checkpoint, dataset, and predictions are in place. GenLayer validators independently fetch the report and agree on the recomputed score; they do not run arbitrary Docker images through a built in `runbenchmark` API.

## Setup

Requires Python 3.12+, a running IPFS Kubo API, and a publicly reachable HTTPS URL for the service so GenLayer validators can fetch reports.

```bash
cd /root/kally
uv venv .venv
uv pip install --python .venv/bin/python -r requirements.txt
.venv/bin/python -m pytest tests/test_uploader.py tests/test_kally.py::test_demo_score -q
export KALLY_SERVICE_TOKEN="replace-with-a-long-random-token"
.venv/bin/uvicorn uploader:app --host 0.0.0.0 --port 8000
```

Set `IPFS_API` if the Kubo API is not at `/ip4/127.0.0.1/tcp/5001/http`. Write endpoints require `Authorization: Bearer <KALLY_SERVICE_TOKEN>` and fail closed if the token is unset. Keep this token on the server; never put it in a `NEXT_PUBLIC_` variable. Expose the service through HTTPS; do not use localhost for the contract's `report_base_url`.

## Market walkthrough

1. Deploy `contracts/KallyMarket.py` in GenLayer Studio with `model="DemoModel"`, `target_bps=7800`, a future Unix `deadline`, and `report_base_url="https://ipfs.io/ipfs/"` (or your own HTTPS report endpoint ending in `/reports/`). The CLI equivalent is `genlayer deploy --contract contracts/KallyMarket.py --args DemoModel 7800 DEADLINE https://ipfs.io/ipfs/` after configuring your GenLayer account and network.
2. The creator calls `fund_bond()` with GEN value. Bettors call `place_bet(true)` or `place_bet(false)` with GEN value before the deadline. Amounts use wei (1 GEN = 10¹⁸ wei).
3. Upload a file using `POST /checkpoints` (multipart field `file`) and call `submit_checkpoint(cid)` as the creator before the deadline.
4. Submit predictions to `POST /reports`, for example:

   ```json
   {"model":"DemoModel","metric":"accuracy","checkpoint_cid":"YOUR_CHECKPOINT_CID","predictions":["positive","negative","positive","negative","positive","negative","positive","negative","positive","negative"]}
   ```

   The service scores and pins the result to IPFS and returns its report CID.
5. After the deadline, anyone calls `resolve(report_cid)`. The contract fetches the immutable report through the configured HTTPS service, checks its schema, model, metric, dataset, and checkpoint CID, then recomputes the score from the ten predictions under `strict_eq`.
6. Winning bettors call `claim()`. Payouts return their stake plus a proportional share of the losing pool. If neither side backed the winning outcome, all bettors can reclaim their stakes. The creator calls `claim_bond()` on success; the resolver gets the bond if the target is missed.

If no checkpoint was submitted, anyone can call `cancel_missing_checkpoint()` after the deadline. If a checkpoint was submitted but cannot be resolved, `cancel_unresolved()` becomes available seven days after the deadline. Both paths refund bets and award the bond to the cancelling caller.

## Notes

- The contract is the source of truth for bets and resolution. No SQL database is needed for this prototype.
- The report service must keep its IPFS node and HTTPS endpoint available during resolution. Use `/ready` to check the operator token and IPFS connectivity. The CID protects report contents from mutation. The score is recomputed on-chain, but predictions are not cryptographically bound to the uploaded checkpoint.
- The installed `ipfshttpclient` performs an outdated Kubo version check in `connect()`, so the service uses its `Client` constructor with a short timeout. Upload, pin, and retrieval were verified against an isolated Kubo v0.43.1 node. The shared local IPFS datastore is full and cannot pin new content.
- The current local `genlayer-test` runner cannot load the Studio Dev runtime pin, so direct contract tests fail with `unexpected end of memory`. The corrected contract was deployed and `get_market` was verified on Studio Dev; see `DEPLOYMENT.md`.

GenLayer references: [contract syntax](https://docs.genlayer.com/developers/intelligent-contracts/first-intelligent-contract), [value transfers](https://docs.genlayer.com/developers/intelligent-contracts/features/value-transfers), [web access](https://docs.genlayer.com/developers/intelligent-contracts/features/web-access), [testing](https://docs.genlayer.com/developers/intelligent-contracts/testing).
