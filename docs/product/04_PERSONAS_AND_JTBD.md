# 04 — Personas & Jobs To Be Done

## Purpose

Personas are working hypotheses for product design.

They should be updated or removed when customer discovery contradicts them.

## Persona A — Multi-Protocol DeFi User

### Profile

Uses several DeFi products and understands wallet signing, but does not want to repeatedly research every route.

### Current behavior

```text
goal
→ search protocol
→ compare route
→ switch network
→ connect wallet
→ inspect quote
→ execute
→ repeat in next protocol
```

### Pain

- too many separate interfaces;
- repeated route discovery;
- fragmented execution history;
- duplicated mental work.

### Job To Be Done

> When I want to complete a DeFi objective, help me find and execute a supported route without making me manually orchestrate every protocol.

### Desired outcome

A reviewed plan with fewer coordination steps.

---

## Persona B — Cross-Chain Operator

### Profile

Moves assets between chains and then performs another financial action after settlement.

### Pain

- route support is inconsistent;
- destination assets are easy to misunderstand;
- settlement is asynchronous;
- the next action cannot safely start until funds arrive.

### Job To Be Done

> When I move assets between ecosystems, keep the workflow coherent from source funding through destination execution.

### Desired outcome

One understandable lifecycle rather than disconnected bridge and DeFi interfaces.

---

## Persona C — Privacy-Aware DeFi User

### Profile

Wants to reduce public exposure for selected assets or execution stages.

### Pain

Existing products may describe a workflow as "private" without clearly showing which stages are still public.

### Job To Be Done

> When I use privacy, show me exactly what becomes private, what remains public, and when the asset can be used again.

### Desired outcome

Predictable privacy boundaries.

---

## Persona D — Advanced User / Builder

### Profile

Understands protocols and cares deeply about transaction correctness, safety checks, and composability.

### Pain

Black-box agent systems may hide too much.

### Job To Be Done

> When an Agent proposes an action, let me verify that the route is structured, constrained, and wallet-authorized.

### Desired outcome

Agent convenience without sacrificing control.

---

# Core Jobs To Be Done

## JTBD 1 — Execute a financial goal

> When I know the outcome I want but not the best supported protocol path, help me translate the goal into an executable plan.

## JTBD 2 — Coordinate multiple stages

> When one objective requires several transactions, preserve the state between stages so I do not accidentally execute the next action too early.

## JTBD 3 — Understand privacy direction

> When I choose privacy, tell me whether the action is public, Shield, or Unshield and what the result means.

## JTBD 4 — Reduce provider research

> When several providers could perform a financial primitive, resolve supported capabilities without forcing me to start from a protocol name.

## JTBD 5 — Review before signing

> When an Agent prepares a transaction, show me enough context to decide whether I want to approve it.

## JTBD 6 — Understand resulting positions

> After execution, show me what I now hold or owe instead of leaving me to reconstruct the result from transaction history.

# Functional, emotional, and trust jobs

A financial Agent must solve more than the mechanical transaction.

### Functional

- execute the intended route;
- use the intended asset;
- use the intended network;
- preserve stage order.

### Emotional

- reduce uncertainty;
- reduce fear of signing the wrong action;
- reduce cognitive overload.

### Trust

- do not move more than requested;
- do not hide provider behavior;
- do not bypass the wallet;
- do not mislabel privacy;
- fail safely when unsupported.

These trust jobs are part of the product, not merely security implementation details.
