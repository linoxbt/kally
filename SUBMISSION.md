# GenLayer Portal — Kally Project submission

Application date: 2026-10-08
Contribution type: **Builder → Projects**

## Identity

- Logo: `frontend/public/kally-logo.png` (PNG, 1254 × 1254, 460 KB)
- Project name: **Kally**
- Primary tag: **Prediction Markets** if available; otherwise select the closest DeFi/gaming market category.
- Topic tags: **AI** and **Benchmarks** if available. The Portal's exact options may differ.

## Project summary

**One-liner** (110 characters):

> Kally turns measurable AI benchmark outcomes into GEN-backed prediction markets settled by GenLayer consensus.

## Project overview

**Description** (under 1,000 characters):

> Kally is a Studio Dev prediction market for measurable AI benchmark results. A creator deploys a Python Intelligent Contract with a model name, accuracy target, deadline, and bond. Participants stake test GEN on YES or NO through a Reown-connected app. At resolution, validators fetch a CID-addressed report, check market metadata, and recompute accuracy from ten fixed demo labels before settling the outcome. The contract holds stakes and the creator bond, then lets eligible participants claim payouts. The frontend reads markets and positions directly from GenLayer. A live Kally Demo Classifier market is deployed with an 80% target, a funded bond, and a verified YES position. This prototype records a checkpoint CID but does not execute arbitrary model binaries. Its FastAPI/IPFS uploader is included in the repository and currently runs locally.

## Demo video

Leave blank unless a direct YouTube video or X post has been published. The Portal marks it optional.

## How-to

1. **Open the live market** — Visit https://frontend-nu-dun-93.vercel.app/markets and select “Kally Demo Classifier.” The market targets 80% accuracy before 22 October 2026.
2. **Review the terms** — Read the target, deadline, YES/NO pools, and testnet notice in the market detail panel. The creator bond has been funded with 0.1 test GEN.
3. **Connect a wallet** — Click “Connect wallet” and use Reown AppKit to connect an EVM wallet. Switch to GenLayer Studio Dev (chain ID 61997) and ensure it holds test GEN.
4. **Predict YES or NO** — Under “Take a position,” select YES or NO, enter a test GEN amount, and click the matching “Place … position” button. Confirm the wallet transaction.
5. **Verify the result** — Wait for the validator decision, refresh the market, and check that the selected pool changes. The “My portfolio” tab displays the connected wallet’s position. Inspect the transaction in the Studio Dev explorer.
6. **Inspect the contract** — Open https://explorer-studio-dev.genlayer.com/address/0xdbCE247Dd96d108B36AF589Fa23E93797a71BbE5 and compare the live market state with the frontend. Read https://frontend-nu-dun-93.vercel.app/docs for the resolution and payout rules.

## Review verification

**Expected verification outcome** (under 500 characters):

> The Kally Demo Classifier market shows an 80% target, a 22 October 2026 deadline, a 0.1 test GEN creator bond, and at least 0.01 test GEN in the YES pool. A new YES/NO position increases its matching pool after GenLayer consensus and appears in the connected wallet’s portfolio. The deployed contract’s `get_market` read returns the same market state.

**Contract link 1:** https://explorer-studio-dev.genlayer.com/address/0xdbCE247Dd96d108B36AF589Fa23E93797a71BbE5

## Project links and evidence

- Website: https://frontend-nu-dun-93.vercel.app
- GitHub: https://github.com/linoxbt/kally
- Required evidence — GitHub Repository: https://github.com/linoxbt/kally
- Supporting deployment transaction: https://explorer-studio-dev.genlayer.com/tx/0x4733af18ca5d593cf69e80971ebf2d36ecb042fe180e58860eaade781dda3941
- Supporting YES position transaction: https://explorer-studio-dev.genlayer.com/tx/0x48f4a92a4c6e11bd331d0eb1b03e57ef0f419da2af95191615fae3cb92494c4d

The demo uploader requires a public IPFS service before a benchmark report can be resolved. The live submission demonstrates contract deployment, funded betting, on-chain market state, wallet integration, and the resolution code; it does not claim a completed benchmark resolution.
