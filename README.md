# CAREL

**Agentic DeFi execution with optional privacy.**

CAREL is a goal-driven financial interface that converts user intent into reviewed on-chain actions while preserving explicit wallet approval and clear public/private execution boundaries.

CAREL is not designed as a collection of protocol buttons. Swap, Bridge, Staking, Lend, Borrow, Shield, and Unshield are execution tools coordinated by the CAREL Agent.

## Core flow

```text
User Goal
   ↓
CAREL Agent
   ↓
Intent Parsing
   ↓
Provider-Neutral Execution Intent
   ↓
Capability / Route Resolution
   ↓
Protocol-Specific Review
   ↓
Wallet Approval
   ↓
On-Chain Execution
```

The Agent determines which supported execution path matches the user's goal. It does **not** own wallet keys and it does **not** bypass wallet approval.

## Agent

The current CAREL Agent is a deterministic execution coordinator.

It can:

- parse a financial goal;
- detect the requested action;
- compile supported requests into provider-neutral execution intents;
- select compatible execution capabilities;
- preserve explicit multi-stage flows when privacy semantics require them;
- route the user into the correct reviewed execution surface.

Example:

```text
"Swap 10 STRK for USDC"
          ↓
Agent Router
          ↓
Swap Intent
          ↓
Capability Registry
          ↓
AVNU
          ↓
Quote + Review
          ↓
Wallet Approval
          ↓
Execution
```

The current Agent is not an unrestricted autonomous fund manager and is not presented as an LLM that can generate arbitrary calldata.

See [Agent Architecture](docs/technical/AGENT.md).

## Execution modes

```text
NORMAL
Public → Public

SHIELD
Public → Private

UNSHIELD
Private → Public
```

Privacy is treated as an execution property, not a blanket label applied to an entire workflow.

## Current integrations

### AVNU
- public Swap;
- public Starknet Staking.

### STRK20 / Starknet Privacy
- explicit private balance reveal;
- Shield;
- Unshield;
- private-note maturity tracking;
- private execution composition.

### Endur
- Shield Staking;
- private xSTRK flow.

### Vesu
- Borrow;
- Repay;
- Close Position;
- Add Collateral;
- Withdraw Collateral;
- multi-asset Lend;
- ERC-4626 vToken lending;
- Shield Lend through a verified `VesuLendingAnonymizer`;
- public lending-position discovery;
- public vToken redemption execution engine.

### Garden
- Bitcoin Testnet4 ↔ Starknet Sepolia bridge routes when supported by Garden's live catalogue.

## Current lending status

```text
Normal Lend
public underlying
→ vToken.deposit()
→ public vToken shares

Shield Lend
public underlying
→ STRK20 privacy flow
→ Vesu Lending Anonymizer
→ private vToken note

Unshield Lend
private underlying
→ public underlying
→ vToken.deposit()
→ public vToken shares
```

Public lending positions can be reconstructed from live vToken state.

The current codebase also contains the public vToken redemption execution engine. Private vToken portfolio disclosure and private vToken redemption should not be documented as production-complete until their UI/runtime integration is finished.

## Network model

### Starknet Sepolia
- STRK
- USDC
- STRK20 privacy
- Garden testnet bridge integration

### Starknet Mainnet
- STRK
- USDC
- ETH
- USDT
- WBTC
- strkBTC
- xSTRK
- AVNU
- Endur
- Vesu
- STRK20 privacy

The CAREL core already contains generic multi-ecosystem abstractions so additional chains do not need to be embedded directly into the Agent parser.

## High-level architecture

```text
┌──────────────────────────┐
│        CAREL UI          │
└────────────┬─────────────┘
             │
             ▼
┌──────────────────────────┐
│       Agent Layer        │
│ parse / compile / route  │
└────────────┬─────────────┘
             │
             ▼
┌──────────────────────────┐
│   Execution Intent       │
│   provider-neutral       │
└────────────┬─────────────┘
             │
             ▼
┌──────────────────────────┐
│ Capability Registry      │
└────────────┬─────────────┘
             │
             ▼
┌───────────────────────────────┐
│ Protocol / Ecosystem Adapters │
│ AVNU · Garden · Endur · Vesu  │
└────────────┬──────────────────┘
             │
             ▼
┌──────────────────────────┐
│ Review / Validation      │
└────────────┬─────────────┘
             │
             ▼
┌──────────────────────────┐
│ Wallet Approval          │
└────────────┬─────────────┘
             │
             ▼
         Blockchain
```

## Agent safety boundary

```text
Agent decides WHAT supported path matches intent
                 ↓
CAREL verifies WHAT will execute
                 ↓
Wallet decides WHETHER to sign
```

CAREL currently does not enable unrestricted autonomous capital management or background transaction signing.

## Repository structure

```text
app/
├── api/
└── ...

components/
├── CarelWorkspace.tsx
├── swap/
├── bridge/
├── staking/
├── lending/
├── borrow/
└── testnet/

lib/
├── agent/
│   ├── router.ts
│   ├── execution.ts
│   ├── workspace.ts
│   └── livePlanner.ts
│
└── carel/
    ├── core/
    ├── ecosystems/
    ├── protocols/
    ├── portfolio/
    ├── runtime/
    └── points/
```

## Technical documentation

- [Architecture](docs/technical/ARCHITECTURE.md)
- [Agent](docs/technical/AGENT.md)
- [Privacy](docs/technical/PRIVACY.md)
- [Protocols](docs/technical/PROTOCOLS.md)
- [Security](docs/technical/SECURITY.md)
- [Deployment](docs/technical/DEPLOYMENT.md)

## Development

```bash
npm install
npx tsc --noEmit
npm test
```

Protocol-specific tests:

```bash
npm run test:garden
npm run test:vesu
```

Development server:

```bash
npm run dev
```

Production build:

```bash
npm run build
```

## Verified baseline

```text
Full regression: 117 tests
Pass:            117
Fail:            0
```

## Production

```text
https://carel-v2-mock.vercel.app
```

Repository:

```text
https://github.com/DXJLabs/Carel
```

## Documentation layers

```text
Technical
→ how CAREL works

Product
→ what problem CAREL solves

Business
→ how CAREL can become a sustainable product
```

This directory covers the technical layer. Product and business documentation should remain separate.

---

**CAREL — DXJ Labs**
