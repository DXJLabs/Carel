const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const root = path.join(__dirname, "..");
const swapPath = path.join(root, "components", "swap", "SwapView.tsx");
const workspacePath = path.join(root, "components", "CarelWorkspace.tsx");
const swap = fs.readFileSync(swapPath, "utf8");
const workspace = fs.readFileSync(workspacePath, "utf8");
const swapCss = fs.readFileSync(path.join(root, "components", "swap", "SwapView.module.css"), "utf8");
const workspaceCss = fs.readFileSync(path.join(root, "components", "CarelWorkspace.module.css"), "utf8");

test("CAREL Swap and Agent UI remain syntactically valid TSX", () => {
  for (const [name, source] of [[swapPath, swap], [workspacePath, workspace]]) {
    const transpiled = ts.transpileModule(source, {
      fileName: name,
      reportDiagnostics: true,
      compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 },
    });
    const errors = (transpiled.diagnostics ?? []).filter(d => d.category === ts.DiagnosticCategory.Error);
    assert.deepEqual(errors.map(d => ts.flattenDiagnosticMessageText(d.messageText, "\n")), []);
  }
});

test("Swap presents one composite pay/receive and quote panel", () => {
  assert.match(swap, /id="carel-swap-amount"/);
  assert.match(swap, /id="carel-swap-sell"/);
  assert.match(swap, /id="carel-swap-buy"/);
  assert.match(swap, /Estimated receive/);
  assert.match(swap, /Price impact/);
  assert.match(swap, /AVNU fee/);
  assert.match(swap, /Slippage limit/);
  assert.match(swap, /Indicative quote only/);
  assert.match(swap, /formatUnits\(quote\.buyAmount, buyAsset\.decimals, 6\)/);
});

test("Asset icons identify supported swap assets without altering contracts", () => {
  assert.match(swap, /STRK: "strk", USDC: "usdc"/);
  assert.match(swap, /\/token-icons\//);
  assert.doesNotMatch(swap, /Tether Gold|logo\-diamond/);
  assert.match(swap, /swapAssets\.map\(asset => <option/);
});

test("Original swap execution, recovery and verification actions remain wired", () => {
  for (const action of ["loadQuote", "startFlow", "executeNextStage", "confirmSubmitted", "resetFlow"]) {
    assert.match(swap, new RegExp(action + "\\("));
  }
  assert.match(swap, /swapAgentSession\.run\.stages\.map/);
  assert.match(swap, /verifiedSwapOutput\.amountText/);
  assert.match(swap, /Wallet approvals remain required/);
  assert.match(swap, /Network and Agent fees may also apply/);
  assert.doesNotMatch(swap, /wallet\.execute\(/);
});

test("Simple Swap eliminates redundant full Agent plan while multi-stage still shows it", () => {
  assert.match(workspace, /agentPlan && selectedRuntimeSurface === "swap" && mode === "normal" && agentPlan\.stages\.length === 1/);
  assert.match(workspace, /agentPlan && !\(selectedRuntimeSurface === "swap" && mode === "normal" && agentPlan\.stages\.length === 1\)/);
  assert.match(workspace, /CAREL prepared a one-step Swap/);
  assert.match(workspace, /<AvnuSwap mode=\{mode\} goal=\{goalText\}/);
  assert.match(workspace, /carel-agent-execution/);
});

test("Mobile layout and controlled buttons have real styles", () => {
  for (const className of ["shell", "exchange", "tokenField", "quoteDetails", "routeStatus", "actions", "primary", "runPanel"]) {
    assert.match(swapCss, new RegExp("\\." + className + "[\\s:{]"));
  }
  assert.match(workspaceCss, /\.agentPage \.agentTools\{display:flex/);
  assert.match(workspaceCss, /\.agentSwapReady/);
  assert.match(swapCss, /prefers-reduced-motion:reduce/);
});
