# MVP acceptance criteria

## Demonstrable product loop
1. Alice connects Canton party identity and grants bounded authorization (future ledger implementation).
2. Bob connects independently, with his own bounded mandate.
3. Alice's agent proposes trade terms (only necessary terms shared with Bob).
4. Bob's agent checks allowed asset, counterparty, amount, expiry and authorization scope.
5. Both parties review/authorize a ledger-level agreement.
6. Token-standard adapter settles only if the asset's real protocol supports it.
7. Explorer/test queries demonstrate third-party non-visibility for private contract views.

## Hard stops
- Unknown counterparties, expired or over-limit mandates, reused nonces.
- Unavailable Canton adapter: no fallback simulated 'transaction successful'.
- Ledger identity mismatch, changed instrument admin, expired quote.
- No autonomous transfers until an audited scoped delegation/account abstraction exists.

## Privacy model
Canton ledger visibility is specified by Daml signatories, observers and controllers; agent app-side encryption must be independent. Counterparties necessarily see the terms needed to agree. Do not promise fully hidden trade data to the actual trade participants.

## Production gaps
- No Daml smart contract or DAR yet.
- No ledger connectivity, no CIP-56 implementation, no wallet signatures.
- In-memory replay protection resets on restart.
- No authenticated transport, secure storage, market data, prices, slippage checks or transaction simulations.
- No risk/financial model, audit, UI, testnet smoke test, deployment or app security review.
