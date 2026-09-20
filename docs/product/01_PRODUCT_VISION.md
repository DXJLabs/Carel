# 01 — Product Vision

## Vision

CAREL aims to become a financial agent that lets users operate across on-chain ecosystems through goals instead of protocol-by-protocol workflows.

The long-term interaction should feel closer to:

```text
"Move part of my BTC exposure to Starknet,
keep the final asset private,
and use the rest as collateral."
```

than:

```text
Open bridge
→ choose route
→ choose destination token
→ switch network
→ open privacy tool
→ shield asset
→ open lending protocol
→ choose pool
→ configure collateral
→ sign several transactions
```

CAREL should reduce coordination complexity without hiding execution risk or removing user authorization.

## Product statement

**CAREL is an agentic on-chain execution interface that converts user intent into reviewed public or private financial actions across supported protocols and ecosystems.**

## Why CAREL exists

On-chain users often need to act as their own:

- protocol researcher;
- route planner;
- wallet operator;
- risk checker;
- privacy manager;
- transaction coordinator;
- portfolio monitor.

Each protocol may be usable by itself, but combining several protocols into one goal creates friction.

CAREL exists to coordinate that complexity.

## Product identity

CAREL is not primarily:

- a Swap UI;
- a Bridge UI;
- a lending dashboard;
- a privacy wallet;
- a portfolio tracker.

Those are capabilities.

The product identity is the **Agent + execution layer** that connects user intent to those capabilities.

## Core product promise

CAREL should help a user answer three questions:

1. **What should happen?**
2. **What exactly will be executed?**
3. **What becomes public or private at each stage?**

The final authorization remains with the wallet.

## Product principles

### Goal first

The user should be able to start from an outcome rather than from a protocol name.

### Explain before execute

The user should see what CAREL plans to do before the wallet request appears.

### Privacy is directional

CAREL should clearly distinguish:

```text
Normal   = public → public
Shield   = public → private
Unshield = private → public
```

### Protocols are replaceable tools

CAREL should not make one provider its product identity.

### No invisible autonomy

The Agent should not silently move funds in the background in the current product model.

### Fail closed

Unsupported routes should stop rather than degrade into an unsafe fallback.

### Multi-ecosystem by design

The product should expand through adapters and capability registration rather than through hard-coded chain-specific Agent behavior.

## Current product stage

CAREL is an MVP / early product-validation system with a working execution architecture and production deployment.

The product has already moved beyond a static mock interface: it contains live wallet, privacy, protocol, routing, portfolio, and execution integrations.

However, product-market fit, repeat usage, willingness to pay, and the strongest primary user segment still need real-world validation.

## Long-term product direction

The long-term product should evolve from:

```text
User chooses a tool
→ CAREL helps execute
```

toward:

```text
User states a financial objective
→ CAREL builds a structured strategy
→ CAREL compares supported routes
→ user reviews
→ CAREL coordinates execution
→ CAREL monitors the resulting position
```

The Agent should become smarter while the execution boundary remains deterministic and reviewable.
