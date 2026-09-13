# CAREL v2 Agentic Private DeFi Interactive Mock

Standalone responsive mock for **CAREL — Agentic Private DeFi by DXJ Labs**.

## What is included

- Landing page kept as the primary entry point.
- Bridge stays first-class and interactive.
- Privacy toggle + route/fee simulation (mock only).
- CAREL Agent strategy simulation with dummy opportunities.
- Portfolio, opportunities, privacy, ecosystem sections.
- Mobile navigation and responsive layouts.
- Desktop/mobile visual references under `design-reference/`.

## Important

This package intentionally contains **no live wallet, bridge, STRK20, protocol, or backend integration**. Values and protocols shown in the UI are mock data for product-design validation.

## Run

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Build

```bash
npm run build
npm start
```

## Suggested next transplant into DXJLabs/carel

Keep the UI shell first, then replace mocked domains one at a time:

1. wallet state
2. STRK20 privacy adapter
3. bridge quote/route adapter
4. agent simulation API
5. protocol discovery/adapters
6. mandate + approval execution layer


## Agentic v2 mock

This revision keeps Swap, Bridge, Borrow and Stake as the DeFi workbench, and models STRK20 separately as a privacy rail: Shield (public deposit), note maturity, private transfer/private DeFi, and Withdraw (public exit). It also adds a goal-driven agent planner and policy/approval simulation. See `AGENTIC_INTEGRATION.md`.
