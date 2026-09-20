# CAREL Agent Architecture

## Purpose

The CAREL Agent converts human financial intent into controlled execution.

Its purpose is not to replace wallet ownership. Its purpose is to remove protocol-routing complexity while preserving deterministic validation and explicit user authorization.

```text
Goal
→ Understand
→ Compile
→ Route
→ Review
→ Execute
```

## Current Agent model

The current CAREL Agent is deterministic.

It is composed from:

```text
Goal parser
+
Intent compiler
+
Capability resolver
+
Workspace coordinator
+
Protocol execution surfaces
```

Important source areas:

```text
lib/agent/router.ts
lib/agent/execution.ts
lib/agent/workspace.ts
lib/agent/livePlanner.ts

lib/carel/core/
lib/carel/adapters.ts
lib/carel/runtime/
```

## Goal routing

`routeAgentGoal()` identifies the requested financial tool without selecting a provider.

Current tool classes include:

```text
Swap
Bridge
Staking
Lend
Borrow
Balance
```

Example:

```text
"Borrow 100 USDC against STRK"
          ↓
Borrow parser
          ↓
ParsedBorrowRequest
```

The parser should not encode assumptions such as:

```text
Borrow = Vesu
Swap   = AVNU
Bridge = Garden
```

Those decisions belong downstream.

## Provider-neutral intent

```text
Natural-language goal
       ↓
Parsed request
       ↓
ExecutionIntent
```

This keeps protocol choice out of the natural-language parser and avoids tightly coupling the UI to one provider.

## Capability registry

Planning-time provider discovery uses CAREL's execution capability registry.

Current registered planning capabilities include:

```text
AVNU Swap
AVNU Staking
Endur Shield Staking
Vesu Borrow
Garden Bridge
```

A capability means that an adapter can support a class of intent. It does not imply that a runtime executor is currently connected.

## Execution registry

Runtime adapters are created only when their corresponding executor dependency exists.

```text
Capability
    ↓
Runtime dependency available?
    ↓ yes
Execution Adapter
    ↓
Executable Registry
```

Unsupported runtime execution therefore fails closed.

## Workspace coordinator

`resolveWorkspaceAgentGoal()` bridges Agent reasoning and UI execution surfaces.

Its decisions include:

```text
execution
explicit
balance
error
```

### Generic execution

```text
goal
→ compile intent
→ resolve adapter
→ open runtime surface
```

### Explicit reviewed execution

Some privacy flows intentionally remain explicit because they have multi-stage semantics that are not yet safely represented by one generic execution intent.

Examples include:

```text
Shield / Unshield Swap
Unshield Staking
non-normal Bridge modes
Shield / Unshield Borrow
Vesu Lend modes
```

## Agent vs wallet

```text
CAREL Agent
    │
    │ proposes
    ▼
Execution Review
    │
    │ user accepts
    ▼
Wallet
    │
    │ signs
    ▼
Blockchain
```

The Agent never owns signing authority.

## Agent vs future AI planner

The current Agent should not be described as an unrestricted language model controlling funds.

A future LLM or learned planner may help with:

```text
goal interpretation
strategy explanation
opportunity comparison
multi-step planning
cross-ecosystem reasoning
```

But the trusted execution boundary remains deterministic:

```text
LLM / Planner
      ↓
structured intent
      ↓
CAREL validators
      ↓
approved adapter
      ↓
wallet review
```

An AI-generated suggestion must never become executable solely because an AI produced it.

## Live privacy-target planner

`livePlanner.ts` supports target-oriented STRK privacy goals.

```text
Goal:
Keep at least 10 STRK private

Current:
Public  = 20 STRK
Private = 7 STRK

Required delta:
3 STRK

Plan:
Shield exactly 3 STRK
```

The planner calculates the minimum required delta rather than moving unnecessary capital.

## Why the Agent is the product layer

Without the Agent:

```text
User
→ choose protocol
→ understand route
→ understand assets
→ understand network
→ construct transaction
→ monitor result
```

With the Agent:

```text
User Goal
→ CAREL resolves supported route
→ user reviews
→ wallet signs
```

That difference is the core technical reason CAREL is more than a DeFi dashboard.

## Design principles

1. Parsing does not choose protocols.
2. Protocol selection comes from registered capabilities.
3. Execution adapters are explicit.
4. Unknown routes fail closed.
5. Multi-stage privacy flows preserve lifecycle state.
6. User approval remains mandatory.
7. The Agent does not hold wallet keys.
8. AI reasoning must not bypass deterministic validation.
9. Provider-neutral intents should remain reusable across ecosystems.
10. Runtime execution exists only when the required dependency is attached.

## Long-term direction

```text
One goal
   ↓
multiple ecosystem intents
   ↓
multiple route candidates
   ↓
cost / risk / privacy evaluation
   ↓
reviewed strategy
   ↓
user-authorized execution
```

This is the basis for CAREL becoming a cross-ecosystem financial agent rather than a collection of protocol-specific tools.
