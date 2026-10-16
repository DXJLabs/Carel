# CAREL Portfolio token artwork and charts

## Token artwork
Portfolio rows show SVG icons shipped locally from `public/token-icons/`, not remote hotlinked images.

Source: [Open Crypto Icons](https://github.com/essamamdani/open-crypto-icons) by essamamdani (colored SVG set, `gh-pages` branch). The upstream project describes these assets as free for personal and commercial use. Third-party marks remain the property of their respective owners.

- `strk.svg`, `usdc.svg`, `eth.svg`, `wbtc.svg`, `btc.svg` are from the sources described above or their later verified replacements.
- `usdt.svg` uses the classic Tether token mark (white ₮ on green) from [spothq/cryptocurrency-icons](https://github.com/spothq/cryptocurrency-icons/blob/master/svg/color/usdt.svg), matching the USD₮ token identity; it is not the gold/diamond Tether Gold mark. Official Tether brand rules are at https://tether.io/media/.
- `xstrk.svg` uses the Endur issuer icon shown alongside xSTRK in Endur-fi/client src/components/Icons.tsx (`endurLogo`).
- `strkbtc.svg` uses Endur-fi/client public/strkbtc.svg. Both are attributed to the issuing protocol; artwork use does not imply endorsement or ownership.
- Unknown tokens retain a visible monogram, and missing images fall back gracefully.
- Assets remain identified by CAREL's chain-specific asset registry. Icon symbols affect only presentation, never token routing.

## Chart truthfulness
- The donut visualizes only the current **observed STRK** private/public split. It is shown after both balances are available and privacy is revealed; no private value is inferred.
- The historical line animates only with at least two actual observed balance samples in the selected period, with no fabricated points or financial-return claims.
- Balance history is currently scoped to the browsing session and wallet. Reloading may remove that history; it is not a historical price chart or investment performance graph.
- All chart animations stop when `prefers-reduced-motion: reduce` is set. Hidden amounts are never represented graphically.

## Validation
Run in Termux:
```bash
npx tsc --noEmit
npm test
```
Then use the Vercel deployment build. On Android in the wallet webview, check all token icons, the xSTRK badge, allocation donut at visible balances, zero-balance holdings, refresh, hide-amounts preference, and chart period selection after several genuine observations.
