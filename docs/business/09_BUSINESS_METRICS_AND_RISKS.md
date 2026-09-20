# 09 — Business Metrics & Risks

## Business metrics

The business should eventually track a layered metric system.

# Usage

- active wallets;
- successful goals;
- successful executions;
- actions per active wallet;
- distinct capabilities used;
- repeat execution rate.

# Retention

- 7-day returning wallets;
- 30-day returning wallets;
- cohort retention;
- Portfolio revisit rate;
- repeat Agent-input usage.

# Economic

Only once monetization exists:

- gross execution volume;
- CAREL fee revenue;
- revenue per active wallet;
- paid conversion;
- subscription retention;
- protocol/B2B revenue;
- infrastructure cost per execution.

# Reliability

Business quality depends on technical reliability.

Track:

- preparation failure;
- quote failure;
- transaction failure;
- stale review rate;
- bridge recovery rate;
- support requests.

# Partner metrics

- active protocol integrations;
- integrations with partner support;
- partner-sourced wallets;
- executions routed to each capability;
- co-marketing conversion.

## Business risks

## 1. Low repeat frequency

If users only need CAREL occasionally, consumer monetization may be difficult.

Response:

Increase portfolio continuity, monitoring, and multi-action utility before assuming subscription demand.

## 2. Wallet competition

Wallets can integrate similar execution features.

Response:

Build deep workflow orchestration and consider CAREL infrastructure/API distribution.

## 3. Provider concentration

If one protocol powers most execution, CAREL may become dependent on that provider.

Response:

Maintain provider-neutral architecture and add alternatives when user value justifies them.

## 4. Route-selection conflict

Revenue relationships can damage trust if they influence Agent recommendations.

Response:

Separate commercial incentives from routing policy and disclose sponsored relationships.

## 5. Infrastructure cost

Cross-chain monitoring, RPC, indexing, and simulation can become expensive.

Response:

Measure cost per active user and per successful execution before scaling free usage.

## 6. Regulatory uncertainty

Financial and privacy products may face changing requirements across jurisdictions.

Response:

Obtain appropriate legal guidance before offering regulated financial services, custody, or jurisdiction-specific products.

## 7. Security incident

A wallet or protocol execution error can severely damage trust.

Response:

Preserve deterministic validation, fail-closed behavior, external review, staged rollouts, and clear incident procedures.

## 8. Privacy reputation risk

Overstating privacy can create both user harm and reputational damage.

Response:

Describe public/private boundaries precisely.

# Business assumptions register

Maintain an explicit table as evidence develops.

| Assumption | Current status | Evidence needed |
|---|---|---|
| Users want goal-first execution | Hypothesis | Interviews + usage |
| Users return for multiple DeFi actions | Hypothesis | Retention |
| Privacy improves CAREL differentiation | Hypothesis | Segment usage |
| Users will pay execution fees | Untested | Pricing experiment |
| Users will pay subscription | Untested | Recurring-value test |
| Protocols value Agent distribution | Partially testable | Partner conversations |
| Cross-ecosystem expansion increases retention | Untested | Cohort data |

Update this table as real evidence appears.

# Business decision rule

Do not optimize the business around a metric that the product has not yet proven matters.

Sequence:

```text
value
→ usage
→ retention
→ monetization
→ scale
```

not:

```text
token / fees / growth
→ hope users find value later
```
