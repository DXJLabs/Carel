# 02 — Problem & Market Validation

## Problem statement

DeFi gives users access to many protocols, but access does not equal usability.

A user trying to complete one financial objective may need to understand:

- which chain holds the source asset;
- which destination chain is required;
- which bridge supports the route;
- which token representation is valid;
- which swap provider has a usable route;
- whether an action should be public or private;
- whether a privacy note is mature;
- which lending pool supports the pair;
- which wallet prompts are expected;
- what state must be confirmed before the next step.

The complexity grows faster than the number of protocols.

## Core problem hypothesis

**The problem CAREL targets is coordination complexity across DeFi actions, protocols, networks, and privacy states.**

Users do not necessarily need another protocol.

They need a better way to coordinate the protocols they already use.

## Example of the coordination problem

A multi-step objective can look simple in natural language:

> "Bridge BTC to Starknet, swap part of it, and keep the result private."

But execution may require:

```text
bridge route discovery
→ source funding
→ bridge settlement
→ destination balance confirmation
→ token selection
→ swap quote
→ swap execution
→ privacy deposit
→ note maturity
```

Every transition creates another failure point.

## Product opportunity

CAREL's opportunity is to become the coordination layer above those protocols.

```text
Protocols solve:
individual financial primitives

CAREL solves:
how those primitives are composed around user intent
```

## Validation status

The following should be treated as **product hypotheses**, not as proven market facts.

### Hypothesis A — protocol fragmentation is painful

Users who actively use multiple DeFi protocols experience repeated friction from:

- provider discovery;
- route comparison;
- network switching;
- fragmented portfolio state;
- multi-step transaction management.

### Hypothesis B — goal-based execution is easier

Users prefer expressing:

> "Swap 100 STRK to USDC"

over first selecting a protocol and manually configuring every route detail.

### Hypothesis C — privacy needs context

Users do not only need a generic "private transaction" feature.

They need to understand:

- which stage is public;
- which asset becomes private;
- when a private note is usable;
- when Unshield makes information public again.

### Hypothesis D — users want control, not black-box autonomy

A useful Agent should reduce complexity while still showing:

- the planned route;
- the provider;
- the assets;
- the amount;
- the wallet approval.

### Hypothesis E — cross-ecosystem coordination increases value

CAREL becomes more useful as one Agent can coordinate assets and protocols across multiple ecosystems instead of being limited to one chain.

## What must still be validated

Real user research should determine:

- which user segment experiences the strongest pain;
- how often that pain occurs;
- whether users trust an Agent to propose transactions;
- which actions users most want automated;
- whether privacy is a primary need or an advanced mode;
- whether users prefer one-click tools or goal-based planning;
- how much explanation is enough before approval;
- which features create repeat usage;
- what users would pay for.

## Validation methods

### Product interviews

Talk to active users of:

- Starknet DeFi;
- cross-chain bridges;
- lending protocols;
- privacy tools;
- multi-wallet DeFi workflows.

Do not ask only whether CAREL sounds useful.

Ask about recent behavior:

> "Tell me about the last time you moved an asset between chains and then used it in DeFi."

### Task observation

Give users a real objective and observe:

- where they hesitate;
- which protocol names they already know;
- how many tabs they open;
- what information they verify externally;
- what makes them fear signing.

### Prototype comparison

Compare:

```text
protocol-first workflow
vs
goal-first CAREL workflow
```

Measure completion time, errors, and confidence.

### Live MVP signals

Track:

- Agent goals entered;
- goals reaching review;
- reviews reaching wallet;
- successful executions;
- repeated users;
- actions per active wallet;
- abandoned stages.

## Validation rule

A feature being technically impressive is not evidence that users need it.

Product decisions should increasingly be based on observed user behavior rather than architecture alone.
