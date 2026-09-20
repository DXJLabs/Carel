# CAREL Technical Architecture

## Overview

CAREL separates product intent, provider selection, protocol validation, wallet execution, and privacy lifecycle.

```text
UI
↓
Agent
↓
Execution Core
↓
Capability / Adapter Registry
↓
Protocol Integration
↓
Wallet
↓
Blockchain
```

## Presentation layer

The primary workspace is centered around:

```text
components/CarelWorkspace.tsx
```

Protocol-oriented UI components are separated into areas such as:

```text
components/swap/
components/bridge/
components/staking/
components/lending/
components/borrow/
```

Wallet and privacy Wallet API integration currently lives primarily in:

```text
components/testnet/Strk20Testnet.tsx
```

The historical directory name should not be interpreted as a Sepolia-only limitation. The current Starknet runtime includes Mainnet and Sepolia configuration.

## Agent layer

```text
lib/agent/
```

Responsibilities include:

```text
parse goals
compile intents
resolve capabilities
coordinate execution surfaces
```

The Agent should not be the layer that owns raw protocol calldata.

## Core execution layer

```text
lib/carel/core/
```

Core abstractions include:

```text
ChainRef
AssetRef
ExecutionIntent
ExecutionAdapter
ExecutionCapability
ExecutionAdapterRegistry
ExecutionCapabilityRegistry
```

These abstractions are designed to remain independent of one specific protocol.

## Ecosystem layer

```text
lib/carel/ecosystems/
```

Starknet currently contains most live protocol integrations.

The core model also contains generic chain and asset concepts that allow additional ecosystems to be represented without rewriting Agent semantics.

## Protocol layer

Protocol-specific logic is kept outside the Agent.

Current integrations include:

```text
AVNU
Endur
Vesu
Garden
STRK20 / Starknet Privacy
```

## Capability vs execution adapters

```text
Capability
→ describes supported intent

Execution Adapter
→ performs execution when runtime dependency exists
```

This allows the Agent to discover supported actions without pretending that every provider is executable at all times.

## Portfolio

Portfolio combines:

```text
wallet holdings
protocol positions
public/private observations
```

Where possible, positions are reconstructed from protocol state instead of relying only on CAREL transaction history.

### Vesu lending example

```text
PoolFactory.v_token_for_asset()
vToken.asset()
vToken.pool_contract()
vToken.balance_of(owner)
vToken.convert_to_assets(shares)
vToken.max_redeem(owner)
```

## API routes

Server routes are used for tasks such as:

```text
live market verification
quote preparation
execution preparation
risk checks
protocol catalogue discovery
position preparation
```

Prepared payloads are not automatically trusted by the client. Critical wallet execution paths reconstruct or validate expected calls again before signing.

## Execution lifecycle

```text
Intent
↓
Live protocol read
↓
Prepared execution
↓
Short expiry window
↓
Wallet-side validation
↓
Account/network re-check
↓
Wallet approval
↓
Transaction submission
↓
Confirmation / activity state
```

## Fail-closed design

```text
unknown asset       → reject
unknown chain       → reject
unknown protocol    → reject
stale preparation   → reject
changed account     → reject
changed network     → reject
altered calldata    → reject
unsupported route   → reject
invalid pool        → reject
invalid vault       → reject
```

## Multi-ecosystem direction

The Agent and core execution model are organized around generic:

```text
Chain
Asset
Action
Intent
Capability
Adapter
```

rather than around one Starknet-specific command system.

That makes future ecosystem expansion an adapter/runtime problem rather than an Agent rewrite.
