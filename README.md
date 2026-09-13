# CAREL

**Agentic Private DeFi on Starknet**

CAREL turns a user's financial objective into a controlled DeFi strategy, checks it against user-defined risk and privacy rules, asks for approval, executes through supported Starknet tools, and continues monitoring the position.

> Set the goal. CAREL plans, protects, and executes under your rules.

## Product thesis

DeFi users still act as their own researcher, router, risk manager, execution operator, and privacy manager.

CAREL uses a goal-first loop:

```text
Goal
→ Understand portfolio
→ Search / compare opportunities
→ Risk + privacy policy
→ Build strategy
→ Simulate
→ User approval
→ Execute
→ Monitor
→ Replan when conditions change
```

Swap, bridge, lend, borrow, stake, shield, private transfer, and unshield are tools used by CAREL. They are not the product identity.

## Current status

CAREL is in early product validation and Starknet Sepolia integration.

### Live product surface

- responsive CAREL workspace for mobile and desktop;
- goal-driven mandate composer;
- simulated strategy generation;
- risk, concentration, liquidity, privacy, and approval guardrails;
- execution-plan preview;
- monitoring / replan UX.

### Testnet phase 1

- Starknet wallet discovery and connection;
- Sepolia network gate;
- STRK20 capability detection through Wallet API version/spec queries;
- public STRK balance read;
- explicit, consent-based private STRK balance read;
- STRK20 Shield;
- STRK20 Unshield;
- post-Shield note-maturity tracker;
- transaction hash + Sepolia explorer fallback.

Strategy APYs and protocol allocations are still **simulated**. CAREL does not claim mock opportunity data is live market data.

## STRK20 integration model

CAREL uses the **Privacy Wallet API via starknet.js**.

The wallet owns keys, notes, proving, and private-state handling. CAREL does not receive a viewing key and does not generate privacy proofs itself.

Pinned integration versions:

```text
@starknet-io/get-starknet-discovery      6.0.3
@starknet-io/get-starknet-wallet-standard 6.0.3
@starknet-io/types-js                    0.10.3
starknet                                 10.4.0
```

### Capability detection

CAREL does not call private-balance APIs just to detect STRK20 support.

It first uses Wallet API version/spec discovery. Private balances are requested only after the user explicitly chooses **Reveal private**.

### Honest privacy boundaries

```text
PUBLIC WALLET
     ↓
Shield / deposit          PUBLIC
     ↓
PRIVATE NOTE
     ↓
~10 blocks maturity
     ↓
Private execution        PROTECTED when supported
     ↓
Unshield                 PUBLIC amount + destination
```

CAREL labels these boundaries per step instead of describing the entire workflow as generically private.

A Shield flow can require two wallet confirmations:

1. ERC-20 approval;
2. privacy-pool deposit.

Fresh notes generally need around 10 blocks before they are spendable.

## Architecture

```text
CAREL UI
   ↓
Goal / mandate
   ↓
Planner
   ↓
Policy engine
   ↓
Simulation
   ↓
Approval
   ↓
Tool router
   ├── Starknet wallet
   ├── STRK20 Wallet API
   └── DeFi protocol adapters
   ↓
Execution
   ↓
Monitoring + replan
```

Current source areas:

```text
app/
  page.tsx

components/
  CarelApp.tsx
  testnet/
    Strk20Testnet.tsx

lib/
  carel.ts
  strk20/
    config.ts
    units.ts
```

## Run in Termux

```bash
npm install
npx tsc --noEmit --pretty false
npm run dev -- --hostname 0.0.0.0
```

Open:

```text
http://localhost:3000
```

Use a small Starknet Sepolia test amount.

## Test sequence

1. Open CAREL in Mises/Ready.
2. Connect Ready.
3. Confirm CAREL reports **Starknet Sepolia**.
4. Confirm **STRK20 Wallet API: Supported**.
5. Refresh public STRK balance.
6. Press **Reveal private** and approve disclosure if Ready asks.
7. Shield a small amount of STRK.
8. Expect the wallet to potentially show two confirmations.
9. Save the transaction hash.
10. Wait for the maturity indicator to reach zero.
11. Refresh private balance.
12. Unshield a small mature amount.
13. Save the unshield transaction hash.

Do not test with production funds.

## Next milestones

### Phase 2 — planner → real privacy action

Make a CAREL plan call a real STRK20 action only after policy checks and user approval.

### Phase 3 — one real DeFi route

Connect one supported Starknet DeFi path. Do not add many protocol adapters until one full goal → plan → execute → monitor loop works.

### Phase 4 — monitoring + replan

```text
position
→ monitor conditions
→ detect material change
→ propose action
→ policy check
→ approval
→ rebalance
```

## Product rules

- Explicit user approval for the testnet MVP.
- No unrestricted autonomous capital management.
- No viewing keys collected by CAREL.
- Private balances read only after explicit user action.
- Public/private boundaries shown per step.
- Mock APY and routes remain labeled as simulation until backed by real data.
- Unsupported wallets/networks fail closed for private execution.

## References

- STRK20 — https://strk20.starknet.io/
- STRK20 integration skill — https://github.com/starkience/strk20-agent-skills
- Starknet Privacy — https://github.com/starkware-libs/starknet-privacy
- STRK20 starter kit — https://github.com/Akashneelesh/strk20-starter-kit
- Starknet — https://www.starknet.io/

---

**CAREL by DXJ Labs**
