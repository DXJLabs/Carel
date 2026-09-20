# CAREL Security Model

## Core principle

CAREL separates route selection from signing authority.

```text
Agent
→ proposes / routes

CAREL
→ validates

Wallet
→ authorizes
```

## No custody

CAREL does not hold the user's private wallet key.

Transactions are signed through the connected wallet.

## Account and network verification

Before sensitive execution, CAREL re-checks conditions such as:

```text
connected account
chain id
expected owner
approved pool
approved asset
prepared payload expiry
```

If account or network state changes, execution is rejected.

## Prepared execution expiry

Protocol state can change between review and signing.

CAREL therefore uses short preparation windows for sensitive operations.

```text
preparedAt
expiresAt
```

Expired reviews must be rebuilt.

## Call reconstruction and validation

Critical Vesu execution paths independently reconstruct expected calls.

Server-provided calldata is not blindly forwarded to the wallet.

Validators compare fields such as:

```text
contract address
entrypoint
calldata length
amount
owner
spender
protocol target
```

Unexpected mutations are blocked.

## Exact approvals

Where practical, CAREL uses exact required approval amounts rather than unnecessary unlimited allowances.

## Live protocol verification

Sensitive execution paths re-read protocol state.

Examples include:

```text
Vesu pool state
pair state
vToken mapping
vToken underlying
vToken pool
redeemable shares
wallet balances
```

## Vesu anonymizer admission

CAREL pins the expected Vesu Lending Anonymizer implementation class hash.

The configured contract must match the admitted class before Shield Lend execution.

The currently admitted Mainnet instance was independently checked through read-only Mainnet calls before integration.

## Privacy-state safety

Private balance disclosure requires explicit user action.

After operations that invalidate a previous private-balance snapshot, CAREL clears that disclosed state instead of presenting stale private data as current.

## Agent safety

Natural language is not converted directly into arbitrary calldata.

```text
natural language
↓
known parser
↓
typed intent
↓
registered capability
↓
known adapter
↓
deterministic validation
↓
wallet
```

Unknown intent does not become arbitrary execution.

## Multi-stage privacy safety

Some workflows require multiple independently reviewed stages.

```text
Unshield collateral
↓
wait for confirmation
↓
fresh protocol review
↓
public protocol execution
```

CAREL should not collapse these into a single step if doing so removes an important safety boundary.

## Background execution

The current production model requires explicit wallet approval.

Unrestricted background signing is not enabled.

## Remaining risks

CAREL reduces execution complexity but does not eliminate:

```text
smart-contract risk
market risk
liquidity risk
oracle risk
bridge risk
wallet risk
network risk
protocol upgrade risk
```

Users must still review wallet prompts and understand that DeFi actions carry protocol and market risk.
