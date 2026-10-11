# Canton participant smoke test

The smoke test is intentionally manual and branch-scoped. It runs only when dispatched from `canton`, downloads a DAR from a selected successful Canton CI run, uploads that DAR to the configured participant, and exercises:

`Mandate → Propose → Accept`

It also checks that acceptance archives the original mandate, creates a replacement mandate and settlement authorization, and that an unrelated party cannot see those contracts through the active-contracts query. It does not transfer a token or call a CIP-56 contract.

## Required GitHub configuration

Create the protected `canton-devnet` environment and add these secrets. Use real participant-issued values; do not add example party IDs, URLs, or keys.

- `CANTON_LEDGER_API_URL`: participant JSON Ledger API base URL.
- `CANTON_LEDGER_API_TOKEN`: JWT accepted by that participant and authorized for the configured user and parties.
- `CANTON_LEDGER_USER_ID`: Ledger API user ID represented by the JWT.
- `CANTON_OWNER_PARTY`: full Canton party ID for the mandate owner.
- `CANTON_COUNTERPARTY_PARTY`: full Canton party ID for the accepting counterparty.
- `CANTON_AGENT_PARTY`: full Canton party ID used as the agent observer.
- `CANTON_UNRELATED_PARTY`: a third party hosted by the participant and not a stakeholder of these contracts.
- `CANTON_SMOKE_ASSET_ID`: an identifier for the test mandate. This is metadata only; the smoke test does not settle an asset.
- `CANTON_PARTY_PUBLIC_KEYS_JSON`: JSON mapping the owner and counterparty party IDs to base64 DER SPKI Ed25519 public keys.
- `CANTON_PARTY_PRIVATE_KEYS_JSON`: JSON mapping the same owner and counterparty IDs to base64 DER PKCS#8 Ed25519 private keys for test-only signing.

The private keys are used only by this isolated test harness to produce bilateral test approvals. They must be dedicated development keys, never production wallet keys. The application adapter itself receives only the resulting approvals and trusted public keys; it does not hold a private key.

The participant JWT must permit the owner to create and propose, both owner and counterparty to accept, and the smoke-test user to query the unrelated party's view. Canton must be configured with the parties hosted and with the DAR's packages uploaded/vetted on the relevant synchronizer.

## Running it

1. Run `Canton CI` on `canton` and copy the successful run ID.
2. Open `Canton participant smoke test`, select branch `canton`, and enter that run ID.
3. Approve the protected `canton-devnet` environment if required.

The workflow has read-only GitHub permissions and no push or deployment step. A missing secret or unavailable participant fails the job rather than falling back to a simulator.

The API calls follow Digital Asset's JSON Ledger API documentation:

- DAR upload: `POST /v2/dars`.
- Commands: `POST /v2/commands/submit-and-wait-for-transaction`.
- Visibility check: `POST /v2/state/active-contracts`.
