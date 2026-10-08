# Kally audit remediation status (2026-10-08)

This document tracks the findings from the independent audit. Passing a UI or service check does not establish that the deployed contract is safe for real-value wagering.

| Finding | Status | Verification |
|---|---|---|
| Exact GEN-to-wei conversion | Fixed locally | `node --experimental-strip-types --test tests/amount.test.mjs` passes; `npx next typegen` and TypeScript pass |
| Silent market import/read failure | Fixed locally | Runtime schema check and visible read errors; TypeScript and lint pass |
| Portfolio request race/loading | Fixed locally | Async request cancellation guard, loading and error states; TypeScript and lint pass |
| GenLayer `Address` calldata and amount types for portfolio reads | Fixed locally | A plain wallet string failed the live `get_position` call. The SDK's `CalldataAddress(hexToBytes(wallet))` recovered a real 0.01 GEN YES stake on Studio Dev. Amounts are handled as number/string/bigint without floating-point arithmetic |
| Missing-checkpoint cancellation button | Fixed locally | UI invokes the existing contract method; TypeScript and lint pass; wallet transaction not yet tested |
| Misleading open/cancelled market status | Fixed locally | Deadline, bond, and cancellation are included; TypeScript and lint pass |
| YES/NO control visibility | Fixed locally | The live market already rendered both sides after hydration; a visible market-detail shortcut now scrolls directly to the position controls. TypeScript and lint pass; browser click interaction still needs QA |
| Ineligible payout claim button | Partly fixed | UI checks known position state; bond claimant eligibility is not exposed by the deployed contract |
| Market import shape validation | Fixed locally | `get_market` response is validated before storage/rendering; TypeScript and lint pass |
| Newly deployed market address discovery | Partly fixed | Address is taken from decision receipt and stored locally; browser-wallet deployment still needs live verification and there is no global index |
| Unauthenticated uploader writes | Fixed locally | Bearer token is required for uploads/reports; direct and HTTP tests cover authorized, unauthorized, unconfigured, and oversized submissions |
| Unbounded report retrieval and misleading health | Fixed locally | 64 KiB response limit, bounded CID cache, and `/ready` that checks operator configuration plus IPFS; HTTP tests pass. Wider request rate limits are still needed before public hosting |
| Actual IPFS service integration | Verified locally | Against an isolated Kubo v0.43.1 node: `/ready`, checkpoint upload and pin, report creation and pin, and report retrieval all returned 200; the final score was 10,000 bps. The existing shared IPFS node cannot pin because its datastore is full, so it is not suitable for Kally hosting |
| Frontend build and deployment environment | Fixed for testnet UI | Next.js 16.4.0 deployed to the existing Vercel production alias after unused Vinext/Cloudflare code was removed; compilation, TypeScript, and static prerendering pass. A headless browser loaded the live market and position shortcut. Local `next build` is blocked by this container's Node child-process `EPERM`. Reown project ID is present in Production, Preview, and Development. Browser wallet signing remains unverified |
| Lint errors | Fixed locally | `npm run lint -- --quiet` passes |
| Dependency advisories and unused starter stack | Fixed locally | Next.js upgraded to 16.4.0; unused Cloudflare/Vinext/Drizzle/UI starter code and dependencies removed; compatible transitive overrides applied. Full `npm audit` reports zero advisories. TypeScript, lint, Python focused tests, amount tests, and hosted Next build pass |
| Incorrect generic docs source link and missing page ideas | Fixed locally | Docs link to Kally source and describe three possible next pages |
| Model execution and report provenance | **Open — release blocker** | Current contract accepts caller-generated predictions. Requires benchmark trust model and replacement contract |
| Public uploader/frontend integration | Open | Service is local only; no browser upload flow or hosted URL |
| SQLAlchemy persistence/global market index | Open | Chain state and browser storage only |
| Contract direct-mode tests | Open | Latest `genlayer-test` 0.29.2 cannot execute the pinned Studio Dev v0.3 runtime; three tests fail before assertions. `genvm-lint` AST checks pass, but SDK validation cannot find the pinned runner artifact. Live `get_market` and a nonzero `get_position` read succeed |
| Browser-wallet settlement/claims and payout invariants | Open | No verified end-to-end resolution, cancellation, or transfer receipts |
| Deployment environment verification | Partly fixed | Reown project ID is configured in Production, Preview, and Development; domain authorization and browser wallet connection remain unverified |
| Starter dependency cleanup and large bundle | Partly fixed | Unused starter code and dependencies removed; hosted Next build passes. Browser bundle size and Core Web Vitals still need a measured audit |

**Release decision:** Not production-ready. Do not use for real-value betting. The deployed Studio Dev market still runs the legacy report-scoring contract and has not been replaced.
