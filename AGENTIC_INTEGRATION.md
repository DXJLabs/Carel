# CAREL v2 — Agentic Private DeFi Integration Direction

This folder is still a UI simulation. No live wallet, STRK20, bridge, swap, lending, or staking transactions are sent.

## Product model

CAREL should be built around a bounded agent loop:

1. **Goal** — user states an outcome rather than selecting every transaction manually.
2. **Discovery** — agent reads permitted portfolio/market context and proposes candidate routes.
3. **Plan** — agent composes actions such as bridge → shield → swap → borrow/stake.
4. **Policy** — risk, exposure, allowed protocols, privacy preference, slippage, and approval policy are checked before execution.
5. **Simulation** — show calldata/route/economic effects before a wallet write.
6. **Approval** — user wallet or a constrained session policy authorizes the write.
7. **Execution + monitoring** — adapter invokes the chosen Starknet / STRK20 route and the agent watches the resulting position.

## Starknet agentic layer

Current Starknet agent infrastructure is available through the Starknet Agentic project. The official package documented by that project is:

```bash
npx @starknetfoundation/create-starknet-agent@latest
```

Use that scaffold as an agent runtime / tool reference rather than replacing the CAREL frontend automatically.

Target capabilities for CAREL:

- Starknet wallet and contract tools
- MCP/A2A-compatible tool access where useful
- policy-aware execution / session constraints
- protocol adapters for swap, lending, staking and bridge flows
- explicit simulation and approval boundary

## STRK20 knowledge / privacy layer

The community `strk20-skills` repository packages four useful skill areas:

- `strk20-privacy`
- `strk20-wallet-api`
- `strk20-anonymizer-contracts`
- `strk20-privacy-sdk`

These cover privacy concepts, wallet-driven private dapp actions, Cairo helpers for private DeFi, and lower-level SDK flows. Install the maintained skill repo into the coding-agent environment rather than copying its contents into production runtime code.

The UI deliberately does **not** present Shield/Withdraw as ordinary DeFi tabs. Shield is a separate public deposit into STRK20; after note maturity, mature notes can fund private transfers or eligible private DeFi actions. Withdraw is the explicit public exit back to ERC-20.

## Mock action mapping

| CAREL UI | Future adapter direction |
| --- | --- |
| Swap | Starknet swap router + eligible STRK20 private helper |
| Bridge | Bridge provider adapter, followed by optional Starknet Shield |
| Borrow | Lending protocol adapter + STRK20-aware helper where supported |
| Stake | Staking/yield strategy adapter, policy bounded |
| Shield | STRK20 Wallet API / privacy flow |
| Withdraw | STRK20 withdrawal flow to a public Starknet recipient |

Do not assume every protocol action can be made private. The agent must detect route capability and display the boundary to the user.
