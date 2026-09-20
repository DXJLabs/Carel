# 06 — User Journeys

## Journey 1 — Public Swap

### Goal

> Swap 10 STRK to USDC.

### CAREL journey

```text
Enter goal
↓
Agent identifies Swap
↓
Compile Swap intent
↓
Resolve compatible provider
↓
Load quote
↓
Review amount / route
↓
Wallet approval
↓
Execution
↓
Activity / updated balance
```

### Product requirement

The user should understand:

- input asset;
- output asset;
- amount;
- provider;
- execution mode;
- wallet action.

---

## Journey 2 — Shield Swap

### Goal

> Swap STRK and keep the result private.

### Journey

```text
Enter goal
↓
Agent identifies Swap + Shield mode
↓
Reviewed privacy-aware flow
↓
Swap / privacy composition
↓
Wallet approval stages
↓
Private resulting asset
```

### Product requirement

The UI must not imply that every intermediate stage is private if that is not true.

---

## Journey 3 — Bitcoin Bridge

### Goal

> Bridge BTC from Bitcoin Testnet4 to Starknet Sepolia.

### Journey

```text
Enter bridge goal
↓
Agent identifies Bridge
↓
Choose supported destination representation
↓
Garden route review
↓
Funding
↓
Order lifecycle
↓
Settlement
↓
Destination balance
```

### Product requirement

Do not guess unsupported destination assets.

Bridge settlement should be treated as asynchronous state rather than an immediate balance change.

---

## Journey 4 — Borrow

### Goal

> Borrow USDC against STRK.

### Journey

```text
Agent identifies Borrow
↓
Resolve reviewed Vesu market
↓
Read live risk state
↓
Review collateral / debt
↓
Wallet approval
↓
Public Vesu position
↓
Portfolio
```

### Product requirement

Risk information should support the decision without pretending to predict future safety.

---

## Journey 5 — Shield Borrow

### Goal

> Borrow USDC and keep the borrowed USDC private.

### Journey

```text
Public Vesu Borrow
↓
Borrow confirmation
↓
Refresh public USDC balance
↓
Shield exact borrowed proceeds
↓
Private USDC
```

### Product requirement

The product must clearly state:

```text
Vesu debt position = public
borrowed proceeds after Shield = private
```

---

## Journey 6 — Lend

### Goal

> Lend USDC on Vesu.

### Journey

```text
Agent identifies Lend
↓
Select reviewed market
↓
Resolve Vesu vToken
↓
Review
↓
approve vToken
↓
vToken.deposit()
↓
public vToken position
↓
Portfolio discovery
```

### Product requirement

The position should be described in underlying asset terms even though ownership is represented by vToken shares.

---

## Journey 7 — Shield Lend

### Goal

> Lend USDC and keep the resulting position private.

### Journey

```text
Public USDC
↓
privacy flow
↓
Vesu Lending Anonymizer
↓
Vesu vToken
↓
private vToken note
```

### Product requirement

The user should know that the private representation is the vToken position token, not simply the original USDC balance.

---

## Journey 8 — Manage an existing position

### Goal

> What positions do I have?

### Journey

```text
Open Portfolio
↓
Read wallet holdings
↓
Read supported protocol positions
↓
Show position type / provider / amount
↓
Offer reviewed management action where supported
```

### Product requirement

Portfolio should increasingly become the continuity layer after Agent execution.

Execution should not feel like the end of the product journey.
