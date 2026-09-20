# CAREL Privacy Architecture

## Execution modes

CAREL models privacy direction explicitly.

```text
NORMAL
Public → Public

SHIELD
Public → Private

UNSHIELD
Private → Public
```

A workflow is not described as private merely because one part of it uses privacy infrastructure.

## Wallet boundary

CAREL integrates privacy through the supported Starknet privacy Wallet API.

The wallet remains responsible for:

```text
keys
private notes
proof handling
authorization
signing
```

CAREL does not require direct custody of those secrets.

## Private balance disclosure

Private balances are not requested automatically merely to detect wallet capability.

The user explicitly chooses to reveal private balances.

```text
Wallet connected
      ↓
privacy capability detected
      ↓
User chooses Reveal
      ↓
private balance request
```

## Shield

```text
Public token
    ↓
privacy deposit
    ↓
Private note
```

Fresh notes may require maturity before they can be spent.

CAREL tracks note maturity where applicable.

## Unshield

```text
Private note
    ↓
withdraw
    ↓
Public wallet
```

Once unshielded, the resulting public transfer is observable on-chain.

## Privacy lifecycle

Privacy is a state machine, not a boolean.

```text
public
↓
shield submitted
↓
private note created
↓
maturing
↓
private spendable
↓
unshield submitted
↓
public
```

## Shield Borrow

CAREL does not claim that the Vesu debt position becomes private.

Current semantics:

```text
Public collateral
     ↓
Public Vesu Borrow
     ↓
Borrowed asset arrives publicly
     ↓
Shield borrowed asset
     ↓
Private asset
```

The Vesu position itself remains public.

## Unshield Borrow

```text
Private collateral
      ↓
Unshield
      ↓
Public collateral confirmed
      ↓
Fresh Vesu review
      ↓
Public Borrow
```

CAREL deliberately avoids preparing the Vesu Borrow before the Unshield stage has completed.

## Shield Lend

```text
Public underlying
      ↓
privacy flow
      ↓
Vesu Lending Anonymizer
      ↓
Vesu vToken
      ↓
Private vToken note
```

CAREL validates the anonymizer implementation and Vesu vault bindings before execution.

## Vesu Lending Anonymizer

The admitted Mainnet anonymizer is protected by a pinned class hash.

CAREL also verifies live relationships such as:

```text
PoolFactory
pool
vToken
underlying asset
```

An environment-provided address is not trusted merely because it is configured.

## Private vToken state

Shield Lend produces a private vToken representation.

The current documented production baseline should not claim private vToken portfolio reveal or private vToken redemption UI as complete until those runtime surfaces are finished and tested.

## Design principle

Privacy is treated as an execution property with explicit boundaries:

```text
what is public?
what becomes private?
what becomes public again?
when is a note spendable?
what protocol position remains public?
```
