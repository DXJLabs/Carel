# 03 — Customer Discovery

## Objective

Customer discovery should identify the users for whom CAREL removes a frequent and meaningful problem.

The goal is not to prove the original idea correct.

The goal is to discover:

```text
who has the problem
how they solve it today
how painful it is
what they already trust
what would make them switch
```

## Primary discovery segments

### Active DeFi users

Users who regularly:

- swap;
- bridge;
- lend;
- borrow;
- stake;
- manage more than one on-chain position.

Why they matter:

They already understand the primitives and can reveal whether CAREL reduces real workflow friction.

### Cross-chain users

Users who move assets between ecosystems.

Why they matter:

Cross-chain execution creates some of the strongest coordination problems:

- route discovery;
- asset representation;
- settlement delay;
- destination handling.

### Privacy-aware users

Users who care about reducing public exposure of balances or transaction flows.

Why they matter:

They can test whether CAREL's Normal / Shield / Unshield model is understandable and useful.

### Power users and builders

Users familiar with wallets, protocols, and on-chain infrastructure.

Why they matter:

They can identify trust, security, and composability requirements before a wider audience encounters them.

## Interview goals

A discovery interview should focus on past behavior.

Good questions:

- What was the last DeFi action you completed?
- Which apps did you open?
- Did you compare routes?
- How did you decide which protocol to use?
- What part took the most time?
- What information did you verify before signing?
- Have you ever abandoned a transaction because the route became confusing?
- When moving between chains, what usually goes wrong?
- Do you ever want a transaction or resulting asset to be private?
- What would make you trust an Agent to prepare a transaction?
- Which decisions would you never delegate?

Avoid:

- "Would you use CAREL?"
- "Do you like AI agents?"
- "Would this feature be useful?"

Those questions produce weak validation.

## Observation template

For each interview, capture:

```text
User type:
Experience level:
Chains used:
Wallets used:
Protocols used:

Recent task:
Goal:
Steps taken:
Apps opened:
Time spent:
Failure points:
Manual checks:
Fear / trust issues:

Current workaround:
Why they use it:
What they dislike:

Agent reaction:
What they would delegate:
What they would always review:
Privacy needs:
Cross-chain needs:

Strongest quote:
Key insight:
Follow-up experiment:
```

## Discovery signals

### Strong signal

A user describes the same coordination problem repeatedly without being prompted.

### Medium signal

A user already uses manual workarounds such as:

- multiple browser tabs;
- spreadsheets;
- protocol aggregators;
- saved routes;
- chat / research tools;
- repeated wallet checks.

### Weak signal

A user says the idea sounds "cool" but cannot name a recent situation where the problem occurred.

## Trust discovery

Trust is a core product question.

Research should specifically test:

- whether users understand the Agent does not hold keys;
- whether route transparency improves confidence;
- whether provider names matter before approval;
- whether users want simulation before signing;
- whether users prefer exact calls or a simplified explanation;
- what warning language causes unnecessary fear.

## Privacy discovery

Privacy users should be asked to distinguish:

```text
I want my balance private
I want this transfer private
I want this resulting asset private
I want the final protocol position private
I want to hide only part of the flow
```

These are different jobs.

CAREL should avoid assuming that one Shield button solves all of them.

## Output of customer discovery

Discovery should eventually produce:

- a primary user segment;
- top recurring jobs;
- ranked pain points;
- trust requirements;
- common workflow patterns;
- reasons users abandon execution;
- evidence for or against the current roadmap.

Until enough interviews exist, persona definitions remain hypotheses.
