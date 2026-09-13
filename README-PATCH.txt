CAREL UI App v3 — UI-only patch

Replace only:
- app/page.tsx
- app/layout.tsx
- app/globals.css
- components/CarelApp.tsx
- lib/carel.ts

Do NOT replace .vercel, package.json, package-lock.json, next.config.ts, node_modules, public, or docs.

This patch uses the existing lucide-react dependency already present in carel-v2-mock.
Data shown in plans/routes/APY is explicitly simulated prototype data.
