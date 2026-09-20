# CAREL Product Documentation

This directory explains CAREL as a product: who it is for, what problem it solves, how the experience is designed, which assumptions still need validation, and how the product should evolve.

Technical implementation is documented separately in `docs/technical/`.

## Product thesis

CAREL is a goal-driven financial interface for on-chain users.

Instead of forcing users to manually discover protocols, understand every execution path, choose between public and private flows, and monitor each step themselves, CAREL turns a financial goal into a reviewed execution plan.

```text
User Goal
   ↓
CAREL Agent
   ↓
Plan / Route
   ↓
Review
   ↓
Wallet Approval
   ↓
Execution
   ↓
Portfolio / Activity
```

The Agent is the product layer. Swap, Bridge, Staking, Lend, Borrow, Shield, and Unshield are tools available to that layer.

## Documents

1. [Product Vision](01_PRODUCT_VISION.md)
2. [Problem & Market Validation](02_PROBLEM_AND_MARKET_VALIDATION.md)
3. [Customer Discovery](03_CUSTOMER_DISCOVERY.md)
4. [Personas & Jobs To Be Done](04_PERSONAS_AND_JTBD.md)
5. [Product Strategy](05_PRODUCT_STRATEGY.md)
6. [User Journeys](06_USER_JOURNEYS.md)
7. [Roadmap & Metrics](07_ROADMAP_AND_METRICS.md)
8. [Product Risks & Open Questions](08_PRODUCT_RISKS_AND_OPEN_QUESTIONS.md)

## Product vs business documentation

Product documentation answers:

```text
Who is the user?
What problem do they have?
What should CAREL do for them?
How should the experience work?
How do we know the product is improving?
```

Business documentation should separately answer:

```text
How does CAREL make money?
How does it reach users?
Who are the partners?
What is the competitive landscape?
What is the go-to-market strategy?
```

Keeping these layers separate prevents product design from being driven only by monetization assumptions.
