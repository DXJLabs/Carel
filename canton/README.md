# Confidential Agent Network — experimental starter for HackCanton Season 4

**Working title only.** This is a DIFFERENT product concept from CAREL, while following DXJ Labs' multichain-by-design approach. Canton is the first intended execution/authorization integration.

## Problem

CAREL is a user-facing DeFi execution interface. This project experiments with bilateral, confidential, policy-bounded **agent-to-agent financial mandates**: two off-chain agents can propose and evaluate offers without obtaining free-form custody of user assets. Real settlement needs participant authorization and ledger enforcement.

## Implemented vertical slice

- Two counterparties with separate scoped mandates.
- Strict positive integer amounts (base units, no floating point).
- Per-mandate expiry, token allowlist, action allowlist, counterparty allowlist, maximum notional in units.
- Proposal IDs, in-memory nonce and acceptance replay checks, expired-proposal checks and per-mandate transaction caps.
- A non-custodial authorization gate: each required Canton party must provide an Ed25519 signature over the exact operation, command, parties and proposal terms; the agent never accepts private keys.
- A real HTTP client for Canton JSON Ledger API v2 endpoints (`/livez`, `/v2/commands/submit-and-wait-for-transaction`, and `/v2/state/active-contracts`).
- Daml templates for mandates, bilateral proposals and user-authorized settlement records, with signatories, observers and controllers explicitly defined.
- Deterministic adapter tests that verify the exact `ExerciseCommand` body without pretending that a fake response is an on-ledger settlement.
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
export CANTON_MANDATE_TEMPLATE_ID='#<package-id>:ConfidentialAgentNetwork:Mandate'
export CANTON_PROPOSAL_TEMPLATE_ID='#<package-id>:ConfidentialAgentNetwork:Proposal'
export CANTON_PARTY_PUBLIC_KEYS_JSON='{"Alice::<fingerprint>":"<base64-DER-SPKI>","Bob::<fingerprint>":"<base64-DER-SPKI>"}'
export CANTON_AUTHORIZATION_JSON='<wallet-produced JSON with userId, commandId and one signature per required party>'
```

The two template IDs must come from the DAR/package deployed to the participant. The adapter first exercises `Mandate.Propose` and then exercises `Proposal.Accept`; it never creates `SettlementAuthorization` directly. `CANTON_PARTY_PUBLIC_KEYS_JSON` is an out-of-band party-to-key binding. The wallet/participant must sign the canonical authorization message; a caller-provided status is not accepted as proof. The adapter derives `actAs` from the verified parties and does not hold a private key or silently fall back to a simulator.

## Daml package

`daml/ConfidentialAgentNetwork.daml` defines the contract visibility and authorization boundary. The owner controls proposal creation, both parties control acceptance and cancellation, and agents are observers only. `Mandate.Propose` is non-consuming so the current mandate remains available while a proposal is reviewed. `Proposal.Accept` consumes that mandate, increments usage, and creates a new mandate with a new contract ID; the next proposal must use that returned/current ID. A stale proposal therefore cannot spend the same mandate after another acceptance. `ConfidentialAgentNetworkTest.daml` covers this sequential lifecycle and the transaction cap. `daml.yaml` pins the Daml SDK toolchain but a local `dpm`/Daml SDK installation is required to build a DAR; this repository does not claim that a DAR has been deployed.

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
2. **Real identity binding**: agent acts on a scoped participant-authorized mandate; off-chain agent IDs are not Canton Party signatures. **The adapter requires verified party signatures and derives `actAs` from them.**
3. **CIP-56 settlement**: research token-standard holdings, allocations and transfers supported by the actual asset/provider. No invented escrow calls.
4. **Privacy boundary**: keep raw portfolio policies and prompts off-chain unless explicitly consented; avoid logging strategies in backend/model telemetry. Canton subtransaction privacy protects authorized ledger views, not off-chain prompts.
5. **End-to-end test**: create two real Canton parties on dev/test environment, compile/deploy the DAR, sign/accept terms, exercise the ledger choices, settle a supported asset, inspect visibility from a third unrelated party.
6. **Multichain adapters** later: maintain typed provider-neutral intents, but do not assume privacy properties transport across chains. **The current code remains Canton-specific at the ledger boundary.**

The Ledger API request shape follows Digital Asset's JSON Ledger API v2 documentation: `POST /v2/commands/submit-and-wait-for-transaction` for workflow commands, `POST /v2/state/active-contracts` for queries, and `/livez` for health. The adapter requires the returned transaction events after proposal and acceptance so it can return the created Proposal CID and replacement Mandate CID. A successful command response means the participant accepted the command; it is not proof that a token transfer settled until the returned update is inspected and the asset provider's real contract is integrated.

Documentation: https://github.com/canton-network/cf-docs/blob/main/docs-main/appdev/deep-dives/privacy-model.mdx and https://github.com/canton-foundation/cips/blob/main/cip-0056/cip-0056.md

## Critical rule for Season 4

Registration form may be open, but competition schedule, judging rules, repeat-submission restrictions and use of pre-existing code have NOT been verified in this starter. Check organizer terms before final submission.
