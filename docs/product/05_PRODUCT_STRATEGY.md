# 05 — Product Strategy

## Strategic focus

CAREL should win by becoming the coordination layer for on-chain execution.

The product should not try to beat every underlying protocol at its own primitive.

```text
AVNU can optimize swaps.
Garden can operate bridge infrastructure.
Vesu can operate lending markets.
Endur can provide staking primitives.

CAREL should coordinate these primitives around user intent.
```

## Strategic wedge

The first strong product wedge is:

**Reviewed multi-action DeFi execution with explicit public/private modes.**

This combines two forms of complexity:

1. protocol coordination;
2. privacy-state coordination.

## Why the Agent matters strategically

A traditional aggregator still often starts from a tool category:

```text
Swap
Bridge
Lend
```

CAREL should increasingly start from:

```text
What do you want to achieve?
```

That gives the product room to coordinate several primitives in one goal.

## Product architecture as strategy

The provider-neutral execution model is not only an engineering choice.

It enables product flexibility.

If a better provider becomes available:

```text
same user intent
→ different capability
→ different adapter
```

The user-facing mental model can remain stable.

## MVP strategy

The MVP should prove:

- users can express a goal;
- CAREL maps it to the correct execution surface;
- the user understands what will happen;
- the wallet remains the final approval boundary;
- supported actions complete reliably;
- users return for more than one action.

## What not to optimize too early

Avoid expanding too quickly into:

- dozens of chains;
- dozens of protocols;
- fully autonomous trading;
- opaque strategy generation;
- complex token incentives;
- excessive gamification.

Breadth without repeated usage would make the product look larger without proving value.

## Product pillars

### 1. Agentic execution

Goal → intent → capability → reviewed execution.

### 2. Privacy-aware execution

Normal / Shield / Unshield should remain first-class concepts.

### 3. Cross-ecosystem coordination

CAREL should gradually connect routes across chains without changing the user's core interaction model.

### 4. Portfolio continuity

Execution should lead into position understanding and management.

### 5. Trustworthy automation

Automation should increase only as execution constraints and user trust are proven.

## Differentiation hypothesis

CAREL's differentiation is not simply "AI + DeFi."

The stronger hypothesis is:

**A provider-neutral Agent that understands execution lifecycle and privacy direction can coordinate on-chain actions more safely and conveniently than users manually composing protocol UIs.**

## Product maturity path

### Stage 1 — Tool routing

```text
Goal
→ correct tool
```

### Stage 2 — Provider routing

```text
Goal
→ typed intent
→ compatible provider
```

### Stage 3 — Multi-step coordination

```text
Goal
→ several dependent stages
→ lifecycle management
```

### Stage 4 — Strategy planning

```text
Goal
→ compare routes / positions / constraints
→ propose strategy
```

### Stage 5 — Monitored agent

```text
position
→ monitor
→ detect meaningful change
→ propose adjustment
→ user approval
```

The product should not jump to Stage 5 before users trust Stages 1–3.

## Scope rule

Every new integration should answer:

> Does this make the Agent more useful for an existing user goal?

If the answer is only:

> It adds another protocol logo,

it may not deserve roadmap priority.
