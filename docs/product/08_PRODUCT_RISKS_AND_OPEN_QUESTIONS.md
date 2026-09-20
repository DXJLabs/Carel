# 08 — Product Risks & Open Questions

## Why this document exists

Early products often confuse technical progress with product certainty.

CAREL has substantial technical execution capability, but several product questions remain open.

These should stay visible.

# Product risks

## Risk 1 — Too many features before one dominant use case

CAREL supports many primitives.

That creates a risk that the product becomes:

```text
a good Swap
+ a good Bridge
+ a good Borrow
+ a good Lend
```

without becoming one indispensable workflow.

Mitigation:

Identify the user segment and repeated goal where Agent coordination creates the clearest advantage.

## Risk 2 — Agent value is not obvious

Users may interpret CAREL as another DeFi dashboard if they mostly navigate manually through tool pages.

Mitigation:

Make goal-based execution the primary product story and progressively increase the number of goals the Agent can coordinate.

## Risk 3 — "AI Agent" expectations exceed current behavior

The current Agent is deterministic.

Users may assume "Agent" means autonomous intelligence, background execution, or portfolio management.

Mitigation:

Explain current capabilities precisely.

Future intelligence should expand planning, not bypass deterministic execution controls.

## Risk 4 — Privacy confusion

A user may assume a Shield flow makes the entire protocol position private.

That is not always true.

Mitigation:

Show privacy state per stage.

Example:

```text
Borrow position: public
Borrowed proceeds after Shield: private
```

## Risk 5 — Wallet approval fatigue

Multi-stage workflows can create several wallet prompts.

Mitigation:

- explain why each approval is required;
- avoid unnecessary transactions;
- batch only when safety semantics remain intact;
- investigate safe session-key patterns in the future.

## Risk 6 — Cross-chain latency

Bridge workflows are asynchronous.

Users may leave before settlement.

Mitigation:

Make order lifecycle and recovery visible, and eventually support persistent monitoring.

## Risk 7 — Protocol dependency

CAREL relies on external protocols.

Provider changes can affect:

- route availability;
- fees;
- liquidity;
- contract behavior;
- APIs.

Mitigation:

Keep providers behind adapters and verify live state before execution.

# Open product questions

## Primary segment

Which group has the strongest recurring need?

- Starknet power users?
- privacy-aware users?
- cross-chain users?
- active DeFi portfolio users?
- crypto-native users who want simpler execution?

## Primary wedge

Which first promise creates repeat usage?

Examples:

- "One Agent for Starknet DeFi"
- "Public/private DeFi from one interface"
- "Cross-chain goal execution"
- "Agentic portfolio actions"

This should be tested, not selected only from internal preference.

## Agent input

Should most users interact through:

- free-form natural language;
- structured goal templates;
- suggested commands;
- hybrid chat + forms?

## Route transparency

How much detail should appear before wallet approval?

Too little creates distrust.

Too much recreates protocol complexity.

## Privacy demand

Is privacy:

- a core acquisition driver;
- a power-user feature;
- a requirement only for specific actions?

## Autonomy

Which actions would users eventually allow CAREL to prepare or execute with reduced friction?

Which actions must always require fresh explicit approval?

## Portfolio role

Should CAREL become the primary place users manage positions, or primarily the Agent that coordinates execution across external protocols?

## Monetization influence

Future business-model choices must not create route-selection conflicts that reduce user trust.

For example, if CAREL receives provider revenue, the product should preserve transparent routing behavior.

# Decision rule

When uncertain, prefer:

```text
real user evidence
over
internal assumptions
```

and:

```text
clear execution
over
feature count
```
