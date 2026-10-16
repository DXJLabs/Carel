const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const root = path.join(__dirname, "..");
const viewPath = path.join(root, "components/borrow/BorrowView.tsx");
const view = fs.readFileSync(viewPath, "utf8");
const controller = fs.readFileSync(path.join(root, "components/borrow/useBorrowController.ts"), "utf8");
const marketHook = fs.readFileSync(path.join(root, "components/borrow/useVesuBorrowMarkets.ts"), "utf8");
const css = fs.readFileSync(path.join(root, "components/borrow/BorrowView.module.css"), "utf8");
const pairs = fs.readFileSync(path.join(root, "lib/carel/ecosystems/starknet/protocols/vesu/pairs.ts"), "utf8");

test("Borrow view parses and keeps a scoped CSS module", () => {
  const output = ts.transpileModule(view, {
    fileName: viewPath, reportDiagnostics: true,
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 },
  });
  const errors = (output.diagnostics ?? []).filter(d => d.category === ts.DiagnosticCategory.Error);
  assert.deepEqual(errors.map(d => ts.flattenDiagnosticMessageText(d.messageText, "\n")), []);
  assert.match(view, /import ui from "\.\/BorrowView\.module\.css"/);
});

test("Collateral is STRK only and debt candidates stay in the validated Vesu registry", () => {
  assert.match(view, /aria-label="STRK collateral amount"/);
  assert.match(view, /network\.assets\.strk\.decimals/);
  assert.match(view, /VESU_BORROW_DEBT_ASSETS\.map\(asset =>/);
  assert.match(view, /onClick=\{\(\) => \{/);
  assert.match(view, /resetMarkets\(\)/);
  for (const sym of ["USDC", "ETH", "USDT", "WBTC", "STRKBTC"]) {
    assert.match(pairs, new RegExp("STARKNET_MAINNET_" + sym));
  }
  assert.match(pairs, /collateralAssetId !==/);
  assert.doesNotMatch(view, /<select\b/);
});

test("Vesu live market checks and stale risk reviews remain guarded", () => {
  assert.match(marketHook, /\/api\/vesu\/borrow\/markets/);
  assert.match(marketHook, /setReviewed\(withEvaluation\)/);
  assert.match(marketHook, /setReviewed\(false\)/);
  assert.match(marketHook, /selectPool/);
  assert.match(controller, /invalidateReview\(\)/);
  assert.match(view, /!reviewed/);
  assert.match(view, /reviewBorrow\(\)/);
  assert.match(view, /evaluation\s*\.eligible/);
  assert.match(view, /evaluation\s*\.blockers\.map/);
});

test("Borrow risk never mistakes utilization for interest rate or hides liquidation", () => {
  assert.match(view, /selectedMarket\.risk\.maxLtvBps/);
  assert.match(view, /selectedMarket\.risk\.utilizationBps/);
  assert.match(view, /Available \{selectedDebtAsset\.symbol\}/);
  assert.match(view, /Market utilization is not borrowing APR/);
  assert.match(view, /liquidation/i);
  assert.match(view, /requestedLtvBps/);
  assert.match(view, /liquidationFactorBps/);
  assert.match(view, /riskPosition/);
  assert.doesNotMatch(view, /guaranteed yield|guaranteed APY/i);
});

test("Shield and Unshield Borrow preserve distinct, verified execution stages", () => {
  for (const fn of ["startUnshieldBorrow", "refreshUnshieldConfirmation",
    "refreshNormalBorrowConfirmation", "refreshUnshieldBorrowConfirmation",
    "refreshShieldBorrowConfirmation", "shieldBorrowProceeds",
    "refreshShieldStageConfirmation", "reviewBorrow", "executeBorrow"]) {
    assert.match(view, new RegExp(fn + "\\(\\)"), fn + " must stay wired");
  }
  assert.match(view, /!wallet\.strk20Capable/);
  assert.match(view, /!wallet\.privateRevealed/);
  assert.match(view, /unshieldBorrowReady/);
  assert.match(view, /privateEnough/);
  assert.match(view, /publicEnough/);
  assert.match(view, /Shield mode[\s\S]*?public/);
});

test("CAREL Borrow keeps real submitted statuses and wallet approval path", () => {
  assert.match(view, /normalAgentBorrowStage/);
  assert.match(view, /unshieldBorrowStage/);
  assert.match(view, /shieldStage/);
  assert.match(controller, /createAgentFeeGateCoordinator/);
  assert.match(controller, /loadActiveAgentRecoveryPointer/);
  assert.match(controller, /executeAgentStage/);
  assert.match(view, /Current on-chain/);
  assert.match(view, /Review & Borrow/);
});

test("Mobile selector, input, and market layout classes are defined", () => {
  const classes = [...new Set([...view.matchAll(/ui\.([A-Za-z0-9_]+)/g)].map(m => m[1]))];
  for (const c of classes) {
    assert.match(css, new RegExp("\\." + c + "(?=[\\s:{,.>])"), "Missing CSS selector " + c);
  }
  assert.match(css, /\.riskStats/);
  assert.match(css, /@media\(max-width:420px\)/);
  assert.match(css, /prefers-reduced-motion:reduce/);
});
