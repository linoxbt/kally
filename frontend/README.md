# Kally web app

Kally's landing page, docs, market explorer, portfolio, and creator form are in `app/`. The app uses Reown AppKit for wallet connection and `genlayer-js` for Studio Dev contract reads and writes. The contract is the source of truth for balances and settlement; additional market addresses are currently stored per browser.

## Local development

Use Node.js 22.13 or newer. Set `NEXT_PUBLIC_REOWN_PROJECT_ID` in `.env.local` to a Reown project ID authorized for your local origin. The project ID is public; wallet keys must never be placed in frontend environment variables.

```bash
npm ci
npm run dev
npm run lint
npm test
npm run typecheck
npm run build
```

The app uses Next.js locally and on Vercel. This repository no longer includes the unused Cloudflare/Vinext starter framework.

## Deployment

The deployed frontend is configured for GenLayer Studio Dev (chain ID 61997) and needs `NEXT_PUBLIC_REOWN_PROJECT_ID` in its Vercel environment. Reown's project settings must allow the deployed domain. `app/markets/page.tsx` contains the current demo contract address; new user-created markets are not globally indexed yet.

The current contract settles a ten-item demonstration report supplied through IPFS. It does not execute checkpoint models or prove prediction provenance. Treat the app as a testnet prototype until a trusted benchmark pipeline and replacement contract are deployed.
