# 02 — Business Model & Monetization

## Objective

CAREL needs a business model that aligns with user trust.

The Agent coordinates financial execution, so monetization can create conflicts if it changes which route the Agent selects.

Every revenue model should therefore be evaluated against:

```text
Does this improve CAREL's incentives?
or
Does this create pressure to route users unfairly?
```

## Potential revenue models

These are business hypotheses, not current revenue claims.

## 1. Execution fee

CAREL could charge a transparent fee for selected successful actions.

Example model:

```text
User executes through CAREL
→ transaction succeeds
→ CAREL receives disclosed execution fee
```

Possible advantages:

- directly tied to product usage;
- simple value exchange;
- scales with execution activity.

Risks:

- users are sensitive to DeFi fees;
- multiple protocol/network fees already exist;
- fee stacking can make routes unattractive.

Principle:

The fee must be visible before approval.

---

## 2. Subscription

CAREL could offer a paid plan for advanced Agent capabilities.

Potential paid features:

- advanced multi-step strategies;
- persistent portfolio monitoring;
- alerts;
- automation policies;
- richer analytics;
- custom risk rules;
- larger execution limits;
- professional portfolio workflows.

Advantages:

- revenue less dependent on transaction volume;
- aligns with recurring product value.

Risk:

Subscription only works if users return frequently enough.

---

## 3. Protocol integration / distribution revenue

Protocols may pay for:

- integration work;
- co-marketing;
- sponsored campaigns;
- usage incentives;
- qualified distribution.

This can be useful but creates an incentive risk.

CAREL should separate:

```text
commercial relationship
from
route-selection logic
```

Sponsored placement, if ever used, should be clearly distinguishable from Agent route selection.

---

## 4. Partner API / Agent infrastructure

If CAREL's routing and execution architecture matures, parts of it could become infrastructure used by:

- wallets;
- DeFi apps;
- ecosystem portals;
- agents;
- financial dashboards.

Possible offering:

```text
Intent API
Execution API
Capability registry
Privacy-aware workflow API
Portfolio action API
```

This could create B2B revenue without requiring every user to interact through CAREL's own frontend.

---

## 5. Professional / team product

Longer term, CAREL could serve teams or advanced operators with:

- shared policy controls;
- multi-wallet monitoring;
- approval workflows;
- execution logs;
- treasury strategies;
- role-based permissions.

This is significantly different from the current consumer-style product and should not be pursued before demand is validated.

---

# Recommended monetization sequence

## Stage A — no forced monetization

Goal:

Prove repeated execution and user trust.

Measure:

- active wallets;
- successful goals;
- repeat usage;
- action diversity.

## Stage B — optional transparent fee experiments

Test whether users accept small fees on high-value coordinated workflows.

Do not charge merely because a simple protocol action passes through CAREL.

## Stage C — premium Agent functionality

If users repeatedly return for monitoring and strategy workflows, test subscription value.

## Stage D — B2B infrastructure

If CAREL develops reliable cross-provider execution primitives, expose them to partners.

# Fee design principles

Any CAREL fee should answer:

```text
What am I paying for?
When is the fee charged?
How much is it?
Is it separate from protocol/network fees?
Does it affect route selection?
```

The product should never hide a CAREL fee inside an unrelated protocol fee.

# Revenue-model scorecard

Evaluate each business model against:

| Model | User alignment | Recurring potential | Trust risk | Requires scale |
|---|---:|---:|---:|---:|
| Execution fee | Medium-High | Medium | Medium | Medium |
| Subscription | High if recurring value exists | High | Low | Medium |
| Protocol distribution | Medium | Medium | High if opaque | Low-Medium |
| B2B API | High | High | Low-Medium | Medium-High |
| Professional product | High for niche | High | Low | High product maturity |

This is a strategic comparison, not a final pricing decision.
