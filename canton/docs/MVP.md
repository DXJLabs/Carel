# MVP acceptance criteria

## Demonstrable product loop
1. Alice connects Canton party identity and grants bounded authorization (workflow and command gate implemented; participant credentials remain deployment-specific).
2. Bob connects independently, with his own bounded mandate.
3. Alice's agent proposes trade terms (only necessary terms shared with Bob).
4. Bob's agent checks allowed asset, counterparty, amount, expiry and authorization scope.
5. Both parties review/authorize a ledger-level agreement.
6. The JSON Ledger API adapter records the bilateral settlement authorization only if a real participant URL, deployed template ID and participant approval are configured. Token-standard settlement remains separate.
7. Explorer/test queries demonstrate third-party non-visibility for private contract views.

## Hard stops
- Unknown counterparties, expired or over-limit mandates, reused nonces.
- Unavailable Canton adapter: no fallback simulated 'transaction successful'.
- Ledger identity mismatch, changed instrument admin, expired quote.
- No autonomous transfers until an audited scoped delegation/account abstraction exists.

## Privacy model
Canton ledger visibility is specified by Daml signatories, observers and controllers; agent app-side encryption must be independent. Counterparties necessarily see the terms needed to agree. Do not promise fully hidden trade data to the actual trade participants.

## Production gaps
- Daml source exists, but no DAR has been built or deployed in this repository.
- Ledger API connectivity is implemented but requires a real participant endpoint and authorization; no network is bundled.
- No CIP-56 implementation or token transfer settlement.
- In-memory replay protection resets on restart; production requires durable storage and authenticated transport.
- No authenticated transport, secure storage, market data, prices, slippage checks or transaction simulations.
- No risk/financial model, audit, UI, testnet smoke test, deployment or app security review.
