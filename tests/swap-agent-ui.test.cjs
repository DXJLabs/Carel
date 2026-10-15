const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const root = path.join(__dirname, "..");
const swapPath = path.join(root, "components", "swap", "SwapView.tsx");
const workspacePath = path.join(root, "components", "CarelWorkspace.tsx");
const controllerPath = path.join(root, "components", "swap", "useSwapController.ts");
const networksPath = path.join(root, "lib", "carel", "networks.ts");
const swap = fs.readFileSync(swapPath, "utf8");
const workspace = fs.readFileSync(workspacePath, "utf8");
const controller = fs.readFileSync(controllerPath, "utf8");
const networks = fs.readFileSync(networksPath, "utf8");
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
  assert.match(swap, /availableTokens\.map\(asset => <button/);
  assert.match(swap, /STRKBTC: "strkbtc", XSTRK: "xstrk"/);
  assert.match(swap, /Select token/);
  assert.match(swap, /Search token by name or symbol/);
});

test("Original swap execution, recovery and verification actions remain wired", () => {
  // React can wire a handler as a function reference (onClick={resetFlow})
  // or with an inline call (onClick={() => void loadQuote()}).
  // Verify the actual button wiring rather than searching for a call anywhere.
  const actionHandlers = {
    loadQuote: /onClick=\{\(\) => void loadQuote\(\)\}/,
    startFlow: /onClick=\{\(\) => void startFlow\(\)\}/,
    executeNextStage: /onClick=\{\(\) => void executeNextStage\(\)\}/,
    confirmSubmitted: /onClick=\{\(\) => void confirmSubmitted\(\)\}/,
    resetFlow: /onClick=\{resetFlow\}/,
  };
  for (const [action, pattern] of Object.entries(actionHandlers)) {
    assert.match(swap, pattern, action + " must remain wired to a button");
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

test("Public Swap uses every registered mainnet token instead of a two-asset hardcode", () => {
  assert.match(controller, /mode === "normal"\s*\? \[\.\.\.network\.assetList\]/);
  for (const symbol of ["STRK", "USDC", "ETH", "USDT", "WBTC", "STRKBTC", "XSTRK"]) {
    assert.ok(
      swap.includes(symbol === "STRKBTC" ? 'STRKBTC: "strkbtc"' : symbol === "XSTRK" ? 'XSTRK: "xstrk"' : symbol + ': "' + symbol.toLowerCase() + '"'),
      "Missing " + symbol + " icon",
    );
  }
  for (const symbol of ["STARKNET_MAINNET_STRK", "STARKNET_MAINNET_USDC", "STARKNET_MAINNET_ETH", "STARKNET_MAINNET_USDT", "STARKNET_MAINNET_WBTC", "STARKNET_MAINNET_STRKBTC", "STARKNET_MAINNET_XSTRK"]) {
    assert.ok(networks.includes(symbol), "Missing mainnet registry asset " + symbol);
  }
  assert.match(controller, /mode === "normal"/);
  assert.match(controller, /network\.assets\.strk/);
  assert.match(controller, /network\.assets\.usdc/);
});

test("Token picker does not claim a live route and selection clears stale quote", () => {
  assert.match(swap, /aria-modal="true"/);
  assert.match(swap, /availableTokens\.map\(asset => <button/);
  assert.match(swap, /Token registration does not guarantee an AVNU route/);
  assert.match(swap, /onClick=\{\(\) => selectToken\(asset\.symbol\)\}/);
  assert.match(controller, /function selectSellAsset\(/);
  assert.match(controller, /function selectBuyAsset\(/);
  assert.match(controller, /setQuote\(null\)/);
  assert.match(controller, /!network \|\| flowLocked \|\| swapAssets\.length < 2/);
});

test("Android token picker avoids white input focus rings and forced keyboard", () => {
  assert.doesNotMatch(swap, /autoFocus value=\{tokenSearch\}/);
  assert.match(swap, /aria-label="Search token by name or symbol"/);
  assert.match(swap, /aria-label="Clear token search"/);
  assert.match(swapCss, /\.pickerSearch input:focus,\.pickerSearch input:focus-visible/);
  assert.match(swapCss, /outline:none!important/);
  assert.match(swapCss, /\.pickerSearch:focus-within/);
});

test("Token picker keeps full registry scrollable instead of masking last tokens", () => {
  const picker = swap.slice(swap.indexOf("{tokenPicker &&"), swap.indexOf("{quote && sellAsset"));
  assert.match(picker, /\{swapAssets\.length\} registered assets/);
  assert.match(picker, /availableTokens\.map\(asset => <button/);
  assert.match(picker, /aria-pressed=\{asset\.symbol ===/);
  assert.match(picker, /Token registration does not guarantee an AVNU route/);
  const lastOption = picker.indexOf("availableTokens.length === 0");
  const note = picker.indexOf("className={ui.pickerNote}");
  const listClose = picker.indexOf("</div>\n      </div>");
  assert.ok(note > lastOption && note < listClose, "Quote caution belongs inside the scrolling list");
  assert.match(swapCss, /\.pickerList\{[\s\S]*?overflow-y:auto/);
  assert.match(swapCss, /max-height:min\(88dvh,630px\)/);
  assert.match(swapCss, /\.pickerOption\[aria-pressed="true"\]/);
});

test("Swap quote visual hierarchy avoids duplicate receipt rows and keeps review data", () => {
  const start = swap.indexOf('{quote && sellAsset && buyAsset && <section');
  const end = swap.indexOf('{swapAgentSession && <section', start);
  assert.ok(start >= 0 && end > start);
  const quoteSection = swap.slice(start, end);
  assert.match(quoteSection, /className=\{ui\.quoteHead\}/);
  assert.match(quoteSection, /className=\{ui\.quoteExchange\}/);
  assert.match(quoteSection, /className=\{ui\.quoteMetrics\}/);
  assert.match(quoteSection, /className=\{ui\.quoteDisclaimer\}/);
  assert.match(quoteSection, /formatUnits\(quote\.sellAmount, sellAsset\.decimals, 6\)/);
  assert.match(quoteSection, /formatUnits\(quote\.buyAmount, buyAsset\.decimals, 6\)|\{output\}/);
  assert.match(quoteSection, /quote\.priceImpact/);
  assert.match(quoteSection, /quote\.fee\.avnuFeesInUsd/);
  assert.match(quoteSection, /Slippage limit/);
  assert.match(quoteSection, /Indicative quote only/);
  assert.match(quoteSection, /Network and Agent fees may also apply/);
  assert.doesNotMatch(quoteSection, /Preview pay/);
  assert.match(swap, /\(!quote \|\| mode !== "normal"\)/);
  assert.match(swap, /Wallet approval required/);
  assert.match(swap, /onClick=\{\(\) => void startFlow\(\)\}/);
});

test("Compact financial metrics retain mobile sizing and visible safeguards", () => {
  for (const className of ["quoteHead", "quoteHeadTitle", "quoteExchange", "quoteAmount",
    "quoteArrow", "quoteMetrics", "quoteMetric", "quoteDisclaimer"]) {
    assert.match(swapCss, new RegExp("\\." + className + "[\\s:{]"));
  }
  assert.match(swapCss, /\.quoteMetrics\{display:grid;grid-template-columns:repeat\(3/);
  assert.match(swapCss, /@media\(max-width:380px\)/);
  assert.match(swapCss, /\.actions \.primary/);
});
