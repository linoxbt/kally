# Kally deployment

- Web app: https://frontend-nu-dun-93.vercel.app
- Documentation: https://frontend-nu-dun-93.vercel.app/docs
- Network: GenLayer Studio Dev, chain ID 61997, RPC `https://studio-dev.genlayer.com/api`
- Corrected demo contract: `0xdbCE247Dd96d108B36AF589Fa23E93797a71BbE5`
- Deployment transaction: `0x4733af18ca5d593cf69e80971ebf2d36ecb042fe180e58860eaade781dda3941`
- Demo market: Kally Demo Classifier, 80% accuracy target, deadline 2026-10-22 00:00 UTC.
- Verification: transaction reached FINALIZED with successful leader execution; `get_market` returned the configured market on Studio Dev.
- Creator bond: 0.1 test GEN, verified by `get_market` after funding transaction `0x0c7de1d1f6c22dd8be2432fb4c87975cf803368c98d6306152d4e8aeb93b53ad`. YES/NO betting is open before the deadline. A 0.01 test GEN YES position succeeded (`0x48f4a92a4c6e11bd331d0eb1b03e57ef0f419da2af95191615fae3cb92494c4d`); `get_market` shows a 0.01 GEN YES pool.
- Benchmark uploader: local FastAPI service only; requires IPFS Kubo and public HTTPS hosting to produce reports.

The contract verifies report metadata and recomputes accuracy from the ten `kally-demo-v1` predictions. It does not execute model checkpoints. Studio Dev is a development testnet and may reset.

Local `gltest` version 0.29.2 does not load the Studio Dev runner; direct contract tests fail with `unexpected end of memory`. Uploader and scoring tests pass. The deployed contract's `get_market` read was verified on the live network.
