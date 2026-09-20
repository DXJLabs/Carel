# 07 — Product Roadmap & Metrics

## Roadmap principle

Roadmap priority should be driven by validated user jobs, not only by technical possibility.

## Phase 1 — Reliable reviewed execution

Goal:

Make supported individual actions dependable.

Focus:

- Agent tool recognition;
- wallet connection;
- Swap;
- Bridge;
- Staking;
- Borrow;
- Lend;
- Normal / Shield / Unshield;
- execution review;
- activity state.

Success signal:

Users can complete supported actions without needing external instructions.

## Phase 2 — Portfolio continuity

Goal:

Connect execution to position management.

Focus:

- consistent position discovery;
- clearer protocol position cards;
- public lending management UI;
- private position disclosure where appropriate;
- stronger post-execution state refresh.

Success signal:

Users return to CAREL to manage positions, not only to initiate transactions.

## Phase 3 — Multi-step Agent goals

Goal:

Let one goal coordinate several supported primitives.

Examples:

```text
Bridge → Swap
Swap → Shield
Unshield → Borrow
Bridge → Swap → Lend
```

Requirements:

- stateful stage management;
- explicit dependencies;
- failure recovery;
- fresh review before sensitive downstream actions.

Success signal:

Users complete multi-step goals with fewer manual protocol transitions.

## Phase 4 — Route comparison

Goal:

Where multiple providers exist, allow CAREL to compare compatible routes.

Possible criteria:

- expected output;
- fees;
- liquidity;
- execution complexity;
- privacy compatibility;
- settlement time.

The Agent should explain the comparison rather than silently claiming one route is universally best.

## Phase 5 — Monitoring and replan

Goal:

Move from one-time execution into position assistance.

```text
position
→ monitor meaningful condition
→ propose action
→ user review
→ execute
```

This stage should come after users demonstrate trust in earlier execution stages.

# Product metrics

## North-star candidate

A useful early candidate:

**Successfully completed reviewed goals per active wallet.**

Why:

It measures whether the Agent helps users achieve outcomes rather than merely opening the app.

## Funnel metrics

```text
Goal entered
↓
Goal understood
↓
Review opened
↓
Wallet request opened
↓
Transaction submitted
↓
Transaction confirmed
```

Track conversion between each stage.

## Reliability metrics

- transaction preparation failure rate;
- provider route failure rate;
- stale review rate;
- wallet rejection rate;
- on-chain failure rate;
- recovery success rate.

## Engagement metrics

- weekly active wallets;
- goals per active wallet;
- repeat execution rate;
- number of different tools used per wallet;
- portfolio revisit rate;
- multi-step goal usage.

## Privacy metrics

Measure carefully without collecting sensitive state unnecessarily.

Possible non-sensitive events:

- Shield mode selected;
- Unshield mode selected;
- explicit private reveal requested;
- privacy flow completed;
- maturity-related abandonment.

Do not design analytics that undermine the privacy promise.

## Product-quality metrics

- median time from goal to review;
- median time from review to submitted transaction;
- percentage of goals requiring manual correction;
- user-reported confidence before signing;
- support incidents per execution.

## Validation milestones

Before expanding heavily, CAREL should prove:

1. repeated usage by real wallets;
2. successful completion of more than one action category;
3. user understanding of Agent vs wallet authority;
4. user understanding of privacy direction;
5. evidence that goal-based execution saves meaningful effort.
