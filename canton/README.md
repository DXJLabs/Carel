# Confidential Agent Network — experimental starter for HackCanton Season 4

**Working title only.** This is a DIFFERENT product concept from CAREL, while following DXJ Labs' multichain-by-design approach. Canton is the first intended execution/authorization integration.

## Problem

CAREL is a user-facing DeFi execution interface. This project experiments with bilateral, confidential, policy-bounded **agent-to-agent financial mandates**: two off-chain agents can propose and evaluate offers without obtaining free-form custody of user assets. Real settlement needs participant authorization and ledger enforcement.

## Implemented vertical slice

- Two counterparties with separate scoped mandates.
- Strict positive integer amounts (base units, no floating point).
- Per-mandate expiry, token allowlist, action allowlist, counterparty allowlist, maximum notional in units.
- Proposal IDs, in-memory nonce and acceptance replay checks, expired-proposal checks and per-mandate transaction caps.
- A non-custodial authorization gate: the agent accepts an opaque participant approval and never accepts private keys.
- A real HTTP client for Canton JSON Ledger API v2 endpoints (`/livez`, `/v2/commands/submit-and-wait`, and `/v2/state/active-contracts`).
- Daml templates for mandates, bilateral proposals and user-authorized settlement records, with signatories, observers and controllers explicitly defined.
- Deterministic adapter tests that verify the exact command body without pretending that a fake response is an on-ledger settlement.
- Node built-in tests, zero dependencies.

The workflow and Daml model are an MVP, not a deployed Canton application. The adapter is a real Ledger API client, but no network is configured in this repository and no token-standard asset transfer is implemented. Never use the demo to control actual funds.

## Run the verified local slice

```bash
npm test --prefix canton
npm run demo --prefix canton
```

The demo stops safely when `CANTON_LEDGER_API_URL` is absent. To connect a real participant, supply the participant URL and the exact deployed template identifier; do not use placeholders:

```bash
export CANTON_LEDGER_API_URL='https://<your-participant-host>'
export CANTON_LEDGER_API_TOKEN='<participant-issued-token-if-required>'
export CANTON_SETTLEMENT_TEMPLATE_ID='#<package-id>:ConfidentialAgentNetwork:SettlementAuthorization'
```

`CANTON_SETTLEMENT_TEMPLATE_ID` must come from the DAR/package deployed to the participant. The adapter sends a JSON Ledger API command using the approved `userId`, `commandId`, `actAs`, and `readAs` values; it does not hold a private key or silently fall back to a simulator.

## Daml package

`daml/ConfidentialAgentNetwork.daml` defines the contract visibility and authorization boundary. The owner controls proposal creation, both parties control acceptance and cancellation, and agents are observers only. `daml.yaml` pins the Daml SDK toolchain but a local `dpm`/Daml SDK installation is required to build a DAR; this repository does not claim that a DAR has been deployed.

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

1. **Daml authorization**: model owner party, counterparty party, permitted actions, expiry and controllers. Choose signatories/observers deliberately. **Implemented in `daml/`.**
2. **Real identity binding**: agent acts on a scoped participant-authorized mandate; off-chain agent IDs are not Canton Party signatures. **The adapter requires explicit `actAs` authorization.**
3. **CIP-56 settlement**: research token-standard holdings, allocations and transfers supported by the actual asset/provider. No invented escrow calls.
4. **Privacy boundary**: keep raw portfolio policies and prompts off-chain unless explicitly consented; avoid logging strategies in backend/model telemetry. Canton subtransaction privacy protects authorized ledger views, not off-chain prompts.
5. **End-to-end test**: create two real Canton parties on dev/test environment, sign/accept terms, settle a supported asset, inspect visibility from a third unrelated party.
6. **Multichain adapters** later: maintain typed provider-neutral intents, but do not assume privacy properties transport across chains. **The current code remains Canton-specific at the ledger boundary.**

The Ledger API request shape follows Digital Asset's JSON Ledger API v2 documentation: `POST /v2/commands/submit-and-wait` for commands, `POST /v2/state/active-contracts` for queries, and `/livez` for health. A successful command response means the participant accepted the command; it is not proof that a token transfer settled until the returned update is inspected and the asset provider's real contract is integrated.

Documentation: https://github.com/canton-network/cf-docs/blob/main/docs-main/appdev/deep-dives/privacy-model.mdx and https://github.com/canton-foundation/cips/blob/main/cip-0056/cip-0056.md

## Critical rule for Season 4

Registration form may be open, but competition schedule, judging rules, repeat-submission restrictions and use of pre-existing code have NOT been verified in this starter. Check organizer terms before final submission.
