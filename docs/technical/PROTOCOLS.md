# CAREL Protocol Integrations

## Overview

Protocols are execution providers used by the CAREL Agent.

The Agent should reason about actions such as:

```text
swap
bridge
stake
lend
borrow
```

rather than hard-coding one provider into the parser.

## AVNU

### Swap

AVNU provides public Starknet swap routing.

```text
Sell Asset
→ AVNU quote
→ reviewed calls
→ wallet approval
→ public swap
```

The generic capability registry can select AVNU for compatible public Swap intents.

### Staking

CAREL also supports public STRK staking through the AVNU staking integration.

## Garden

Garden provides supported Bitcoin ↔ Starknet bridge routes.

Current CAREL integration focuses on:

```text
Bitcoin Testnet4
↔
Starknet Sepolia
```

Available routes and assets are derived from Garden's live catalogue instead of being guessed by CAREL.

## Endur

Endur provides the liquid-staking path used by CAREL Shield Staking.

```text
STRK
↓
privacy composition
↓
Endur
↓
xSTRK
↓
private xSTRK
```

xSTRK is represented as a CAREL Starknet Mainnet asset.

## Vesu

Vesu is used for lending and borrowing.

### Borrow

Current functionality includes:

```text
Borrow
Repay
Close Position
Add Collateral
Withdraw Collateral
```

CAREL currently keeps STRK as the reviewed collateral boundary for Borrow while supporting multiple debt assets.

### Borrow debt assets

Reviewed Mainnet debt candidates include:

```text
USDC
ETH
USDT
WBTC
strkBTC
```

Actual availability still depends on live pool/pair state and CAREL's pool allowlist.

### Lend

Current CAREL lending assets include:

```text
STRK
USDC
ETH
USDT
WBTC
strkBTC
```

Public lending uses Vesu ERC-4626 vTokens.

```text
underlying
↓ approve
vToken.deposit()
↓
public vToken shares
```

### Vesu PoolFactory

CAREL resolves vaults from the Vesu PoolFactory instead of maintaining a hand-written list of every vToken.

```text
pool + asset
→ v_token_for_asset
→ vToken
```

The vToken is independently checked through:

```text
vToken.asset()
vToken.pool_contract()
```

### Public lending positions

A public lending position is reconstructed from:

```text
vToken.balance_of(owner)
vToken.convert_to_assets(shares)
vToken.max_redeem(owner)
```

### Public redemption engine

Public exit semantics use ERC-4626:

```text
vToken.redeem(
  shares,
  receiver,
  owner
)
```

Before execution, CAREL re-reads the current position and redeemable share limit.

### Shield Lend

Shield Lend uses the admitted Vesu lending anonymizer.

CAREL verifies:

```text
anonymizer class hash
Vesu PoolFactory resolution
vToken underlying
vToken pool
wallet account
network
review expiry
```

## STRK20 / Starknet Privacy

The privacy Wallet API supplies CAREL's privacy primitives.

CAREL uses wallet-mediated privacy infrastructure rather than implementing a separate proving system.

## Provider-neutral rule

Desired architecture:

```text
User says:
"Swap 10 STRK for USDC"

Agent compiles:
SwapIntent

Registry selects:
compatible provider

Adapter builds:
provider-specific execution
```

Not:

```text
User says Swap
→ parser immediately hard-codes AVNU
```

This distinction is what allows CAREL to expand to multiple providers and ecosystems.
