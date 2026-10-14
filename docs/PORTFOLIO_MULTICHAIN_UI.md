# CAREL Portfolio — Three-Screen Multichain UI

This update implements the approved black/orange UI direction without inventing cross-chain balances, prices, APY or protocol metrics.

## Screens

1. **All Networks:** one dashboard that shows the connected Starknet wallet's observed assets and protocol positions. A placeholder USD value states that verified asset pricing is unavailable. Registered Ethereum, Bitcoin (Testnet4 registry) and Solana entries are interactive navigation destinations, **not** connected wallets.
2. **Network Detail:** preserves CAREL's existing Starknet-specific operations: observed STRK balances, privacy allocation, Shield, Unshield, token holdings, and Endur/Vesu positions. Assets and positions link to Asset Detail.
3. **Asset Detail:** uses the registered chain-specific `AssetRef.id`, shows known public and explicitly revealed private components, matches protocol positions by asset ID, and links back to Network Detail or Agent. It never signs or executes.

## Financial-data boundaries

- The **All Networks** heading does not mean balances from other networks have been loaded.
- The connected network count is **1** only if the currently connected Starknet wallet has a supported chain; otherwise **0**.
- USD figures and price-performance graphs stay unavailable until trusted valuations are wired for each supported chain and token. Never add token quantities across different denominations.
- The optional line chart is **observed STRK balance history**, not USD portfolio returns.
- A liquid-staking receipt such as xSTRK may appear as both a holding and a protocol position. This is descriptive, **not two assets** and not double-counted in a total.
- Hidden or unrevealed private balances are not represented as zero; hide-amounts applies to balances in every view.
- Testnet balances are not production net worth. Bitcoin support in the global registry currently includes Testnet4 only.

## Next architecture milestone (not implemented here)

Add **per-chain wallet balance collectors** feeding one typed portfolio snapshot keyed by `{chainId, owner, assetId}`, together with authenticated price quotes, timestamp freshness, position-to-receipt accounting, liability/collateral valuation, and a consent-aware private-balance layer. Do not combine network data before these boundaries exist.

## Termux verification

```bash
cd ~/carel-v2-mock
git switch feat/voice-multilingual
git pull --ff-only origin feat/voice-multilingual
npx tsc --noEmit
npm test
```

No local `next build` is needed: deploy through Vercel after these checks pass. In Android Ready Wallet verify All Networks, unsupported-chain placeholders, tapping assets, opening Starknet Detail, Shield/Unshield review, Vesu position management and the Return links.
