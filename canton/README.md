# Confidential Agent Network — experimental starter for HackCanton Season 4

**Working title only.** This is a DIFFERENT product concept from CAREL, while following DXJ Labs' multichain-by-design approach. Canton is the first intended execution/authorization integration.

## Problem

CAREL is a user-facing DeFi execution interface. This project experiments with bilateral, confidential, policy-bounded **agent-to-agent financial mandates**: two off-chain agents can propose and evaluate offers without obtaining free-form custody of user assets. Real settlement needs participant authorization and ledger enforcement.

## Prototype today

- Two counterparties with separate scoped mandates.
- Strict positive integer amounts (base units, no floating point).
- Per-mandate expiry, token allowlist, action allowlist, counterparty allowlist, maximum notional in units.
- Proposal IDs, basic **in-memory** nonce and acceptance replay checks.
- Fail-closed Canton integration seam; no wallet signatures or ledger submission.
- Node built-in tests, zero dependencies.

This is a POLICY/WORKFLOW SIMULATOR, **not** an on-chain integration, not private messaging, not cryptographically confidential, not production-ready, and not executable DeFi. Never use it to control actual funds.

## Run on Termux (Node >=20)

```bash
npm test
npm run demo
```

## Product distinction

- CAREL: helps one user plan and execute DeFi workflows with privacy options.
- Confidential Agent Network: establishes bilateral agent mandates, private quotes, counterparty authorization, and verifiable settlement workflows.
- Chance: different focus on verifying agent-originated transactions (based on public claims); avoid copying their product.

## Canton implementation milestones

1. **Daml authorization**: model owner party, counterparty party, permitted actions, expiry and controllers. Choose signatories/observers deliberately.
2. **Real identity binding**: agent acts on a scoped participant-authorized mandate; off-chain agent IDs are not Canton Party signatures.
3. **CIP-56 settlement**: research token-standard holdings, allocations and transfers supported by the actual asset/provider. No invented escrow calls.
4. **Privacy boundary**: keep raw portfolio policies and prompts off-chain unless explicitly consented; avoid logging strategies in backend/model telemetry. Canton subtransaction privacy protects authorized ledger views, not off-chain prompts.
5. **End-to-end test**: create two real Canton parties on dev/test environment, sign/accept terms, settle a supported asset, inspect visibility from a third unrelated party.
6. **Multichain adapters** later: maintain typed provider-neutral intents, but do not assume privacy properties transport across chains.

Documentation: https://github.com/canton-network/cf-docs/blob/main/docs-main/appdev/deep-dives/privacy-model.mdx and https://github.com/canton-foundation/cips/blob/main/cip-0056/cip-0056.md

## Critical rule for Season 4

Registration form may be open, but competition schedule, judging rules, repeat-submission restrictions and use of pre-existing code have NOT been verified in this starter. Check organizer terms before final submission.
