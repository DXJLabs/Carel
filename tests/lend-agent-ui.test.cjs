const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const root = path.join(__dirname, "..");
const viewPath = path.join(root, "components/lending/VesuLend.tsx");
const view = fs.readFileSync(viewPath, "utf8");
const css = fs.readFileSync(path.join(root, "components/lending/VesuLend.module.css"), "utf8");
const workspace = fs.readFileSync(path.join(root, "components/CarelWorkspace.tsx"), "utf8");
const lending = fs.readFileSync(path.join(root, "lib/carel/ecosystems/starknet/protocols/vesu/lending.ts"), "utf8");

test("Lend view transpiles as TSX and uses scoped mobile layout", () => {
  const r = ts.transpileModule(view, {
    fileName: viewPath, reportDiagnostics: true,
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 },
  });
  const errors = (r.diagnostics ?? []).filter(d => d.category === ts.DiagnosticCategory.Error);
  assert.deepEqual(errors.map(d => ts.flattenDiagnosticMessageText(d.messageText, "\n")), []);
  assert.match(view, /import ui from "\.\/VesuLend\.module\.css"/);
});

test("Vesu Lend keeps registered asset options and live market gate", () => {
  assert.match(view, /VESU_LEND_ASSETS\.map\(asset => <button/);
  assert.match(view, /onClick=\{\(\) => chooseLendAsset\(asset\.id\)\}/);
  assert.match(view, /markets\.map\(market => <button/);
  assert.match(view, /setSelectedPoolId\(market\.pool\.id\)/);
  assert.match(view, /disabled=\{busy \|\| !selectedMarket/);
  assert.match(view, /\/api\/vesu\/lend\/markets/);
  assert.match(view, /"mainnet"/);
  for (const sym of ["STRK", "USDC", "ETH", "USDT", "WBTC", "STRKBTC"]) {
    assert.match(lending, new RegExp("STARKNET_MAINNET_" + sym));
  }
  assert.doesNotMatch(view, /<select\b/);
});

test("Market utilization is not advertised as lending APY", () => {
  assert.match(view, /percentFromBps\(selectedMarket\.market\.utilizationBps\)/);
  assert.match(view, /Supply APY/);
  assert.match(view, /Not available/);
  assert.match(view, /Utilization is not APY/);
  assert.match(view, /Yield is variable and not verified here/);
  assert.doesNotMatch(view, /guaranteed\s+return|estimated\s+earnings/i);
});

test("Private lending retains explicit reveal and protected multi-stage execution", () => {
  assert.match(view, /mode === "shield"/);
  assert.match(view, /mode === "unshield"/);
  assert.match(view, /!wallet\.strk20Capable/);
  assert.match(view, /!wallet\.privateRevealed/);
  assert.match(view, /!privateEnough/);
  assert.match(view, /wallet\.revealPrivateBalance\(\)/);
  assert.match(view, /Unshield output is confirmed and verified/);
  assert.match(view, /private vToken/);
  assert.match(view, /wallet\.executeAgentFee/);
});

test("Existing Agent fee, recovery and signing execution callbacks stay wired", () => {
  for (const fn of ["startAgentLend", "confirmSubmitted", "executeNextStage"]) {
    assert.match(view, new RegExp("void " + fn + "\\(\\)"), fn);
  }
  assert.match(view, /onClick=\{resetAgentLend\}/);
  assert.match(view, /lendAgentSession\.run\.stages\.map/);
  assert.match(view, /feeGateRef\.current/);
  assert.match(view, /rememberLendRecovery/);
  assert.match(view, /createLiveVesuLendRuntime/);
  assert.match(view, /executeAgentStage/);
  assert.match(view, /loadActiveAgentRecoveryPointer/);
});

test("One-step public Lend has concise Agent note while complex privacy plans remain", () => {
  assert.match(workspace, /CAREL prepared a one-step Lend plan/);
  assert.match(workspace, /selectedRuntimeSurface === "lend" && mode === "normal" && agentPlan\.stages\.length === 1/);
  assert.match(workspace, /mode === "normal" && agentPlan\.stages\.length === 1/);
  assert.match(workspace, /selectedRuntimeSurface === "lend"/);
  assert.match(workspace, /<VesuLend/);
});

test("No fake position, withdraw or yield action is added to the deposit form", () => {
  assert.match(view, /reviewed in Portfolio/);
  assert.match(view, /does not estimate unverified balances, rewards, or APY/);
  assert.doesNotMatch(view, /onClick=\{\(\) =>.*withdraw/);
  assert.match(view, /Your wallet approves each transaction/);
});

test("Mobile styling references are present and reduced motion is respected", () => {
  const required = [...new Set([...view.matchAll(/ui\.([A-Za-z0-9_]+)/g)].map(x => x[1]))];
  for (const k of required) {
    assert.match(css, new RegExp("\\." + k + "(?=[\\s:{,.>])"), "Missing CSS: " + k);
  }
  assert.match(css, /@media\(max-width:420px\)/);
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)/);
});
