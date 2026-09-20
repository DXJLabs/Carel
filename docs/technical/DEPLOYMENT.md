# CAREL Development and Deployment

## Stack

Current application stack includes:

```text
Next.js
React
TypeScript
Node.js
starknet.js
AVNU SDK
Starknet Wallet Standard
STRK20 Wallet API types
```

## Requirements

```text
Node.js 24+
npm
```

## Install

```bash
npm install
```

## Development

```bash
npm run dev
```

## Typecheck

```bash
npx tsc --noEmit
```

## Tests

Full regression:

```bash
npm test
```

Garden:

```bash
npm run test:garden
```

Vesu:

```bash
npm run test:vesu
```

## Production build

```bash
npm run build
```

## Starknet RPC configuration

Optional environment variables:

```text
NEXT_PUBLIC_STARKNET_SEPOLIA_RPC
NEXT_PUBLIC_STARKNET_MAINNET_RPC
```

If absent, CAREL currently falls back to configured public RPC endpoints.

## Vesu Lending Anonymizer

CAREL contains an admitted Mainnet Vesu Lending Anonymizer address and expected implementation class hash.

An environment override may be supported by the application, but the live contract still needs to pass CAREL's class-hash verification before Shield Lend preparation/execution.

## Release checks

Before production deployment:

```bash
npx tsc --noEmit
npm test
git diff --check
git status
```

Current documented regression baseline:

```text
117 tests
117 pass
0 fail
```

## Vercel

Production deployment:

```bash
vercel --prod
```

Current production alias:

```text
https://carel-v2-mock.vercel.app
```

## Git workflow

Typical documentation release:

```bash
git add README.md docs/technical
git commit -m "docs: add CAREL technical documentation"
git push origin main
vercel --prod
```
