# DXJ Labs — concurrent tracks

## CAREL (existing product)
Week 1: basic UX preview fix; manual E2E smoke test of swap/shield/borrow mainnet with small amount; isolate service-fee transfer UX and failure policy; add CI gates.
Week 2: unify agent plan -> validation -> quote -> review -> submission -> confirmation/recovery. Add policy preflight; do not add unsafe autonomous signing.

## Confidential Agent Network (new HackCanton S4 concept)
Week 1: make two-party mandate policy prototype; specify Daml authorization/visibility; verify S4 submission rules.
Week 2: Daml contract + Canton client adapter + tested devnet/demo ledger visibility; only add CIP-56 token flows after verifying asset/provider support.

## Shared tools (without making them the same product)
Common typed intents, test tooling, wallet adapters, policy semantics. Separate product repositories and brands, distinct user narratives.

Note: these are planning targets, not promised deadlines or claims of work already complete.
