const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "..");
const FILE = path.join(ROOT, "components/bridge/GardenBridge.tsx");
const view = fs.readFileSync(FILE, "utf8");
const css = fs.readFileSync(path.join(ROOT, "components/bridge/GardenBridge.module.css"), "utf8");
const workspace = fs.readFileSync(path.join(ROOT, "components/CarelWorkspace.tsx"), "utf8");

test("Garden Bridge and Workspace render valid TSX", () => {
  for (const [name, content] of [[FILE, view], ["components/CarelWorkspace.tsx", workspace]]) {
    const result = ts.transpileModule(content, {
      fileName: name, reportDiagnostics: true,
      compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 },
    });
    const errors = (result.diagnostics ?? []).filter(d => d.category === ts.DiagnosticCategory.Error);
    assert.deepEqual(errors.map(d => ts.flattenDiagnosticMessageText(d.messageText, "\n")), []);
  }
});

test("Bridge UI explicitly limits the public route to Bitcoin Testnet4 and Starknet Sepolia", () => {
  assert.match(view, /TESTNET ONLY/);
  assert.match(view, /Bitcoin Testnet4 ↔ Starknet Sepolia/);
  assert.match(view, /Do not send real BTC/);
  assert.match(view, /Garden does not fund this bridge from your privacy pool/);
  assert.match(view, /wallet\.chainId === constants\.StarknetChainId\.SN_SEPOLIA/);
  assert.match(view, /Use a connected Sepolia wallet and Normal public route/);
});

test("Bridge assets come only from Garden catalog and inputs invalidate the old quote", () => {
  assert.match(view, /catalog\.starknet\.map\(asset => <button/);
  assert.match(view, /aria-pressed=\{asset\.id === assetId\}/);
  assert.match(view, /invalidate\(\); setAssetId\(asset\.id\)/);
  assert.match(view, /invalidate\(\); setAmount\(event\.target\.value\)/);
  assert.match(view, /invalidate\(\); setBtcAddress\(event\.target\.value\.trim\(\)\)/);
  assert.match(view, /Reverse bridge direction/);
  assert.match(view, /!catalog\.starknet\.some\(asset => asset\.symbol === "strkBTC"\)/);
  assert.doesNotMatch(view, /<select\b/);
});

test("Garden amount and BTC refund/receive address retain validation", () => {
  assert.match(view, /parseBitcoinAmount\(amount\)/);
  assert.match(view, /bitcoinAddress\(btcAddress\)/);
  assert.match(view, /aria-label="Amount to bridge"/);
  assert.match(view, /garden-btc-address/);
  assert.match(view, /Garden will deliver Testnet4 BTC to this address only after settlement/);
  assert.match(view, /Signet, Testnet3 and real BTC cannot fund this route/);
});

test("Live quote remains sourced from Garden and is refreshed on expiration", () => {
  assert.match(view, /post<BridgeQuote>\(\{ action: "quote", direction, assetId, amount \}\)/);
  assert.match(view, /formatBitcoinAmount\(quote\.sourceAmount\)/);
  assert.match(view, /formatBitcoinAmount\(quote\.destinationAmount\)/);
  assert.match(view, /quote\.expiresAt - now/);
  assert.match(view, /quoteExpired \? loadQuote\(\) : create\(\)/);
  assert.match(view, /Provider fees/);
  assert.match(view, /Source network fee/);
  assert.match(view, /Creating an order does not deliver funds/);
});

test("Garden order progress distinguishes deposit, delivery and refund", () => {
  for (const stage of ["awaiting-deposit", "confirming", "exchanging", "settling", "completed", "expired", "refunding", "refunded"]) {
    assert.ok(view.includes(stage), "Missing real Garden stage " + stage);
  }
  assert.match(view, /aria-label="Bridge order progress"/);
  assert.match(view, /index < stage \? styles\.progressDone/);
  assert.match(view, /index === stage \? styles\.progressCurrent/);
  assert.match(css, /\.progressCurrent/);
  assert.match(css, /\.progressDone/);
  assert.match(view, /Order expired · do not deposit/);
  assert.match(view, /Refund is being processed/);
  assert.match(view, /Refund completed/);
  assert.match(view, /Do not send again after your deposit appears/);
  assert.match(view, /Request refund/);
  assert.match(view, /Refund timelock/);
});

test("Bridge Agent fee gate, recovery and wallet funding controls are preserved", () => {
  assert.match(view, /createAgentFeeGateCoordinator\(/);
  assert.match(view, /createGardenBridgeAgentRuntime\(/);
  assert.match(view, /restoreSubmittedAgentExecutionSession\(/);
  assert.match(view, /executeAgentStage\(/);
  assert.match(view, /createAgentExecutionSession\(/);
  assert.match(view, /Approve & fund bridge/);
  assert.match(view, /fundingAttempted && !retryChecked/);
  assert.match(view, /historyOnly/);
  assert.match(view, /visibleRecords\.map\(record =>/);
});

test("Agent Bridge one-step note replaces only normal-route duplicate summary", () => {
  assert.match(workspace, /CAREL prepared a one-step Bridge plan/);
  assert.match(workspace, /selectedRuntimeSurface === "bridge" && mode === "normal" && agentPlan\.stages\.length === 1/);
  assert.match(workspace, /selectedRuntimeSurface === "bridge"/);
  assert.match(workspace, /<GardenBridge/);
});

test("Responsive bridge style references exist and reduced motion is respected", () => {
  const selectors = [...new Set([...view.matchAll(/styles\.([A-Za-z0-9_]+)/g)].map(x => x[1]))];
  for (const selector of selectors) {
    assert.match(css, new RegExp("\\." + selector + "(?=[\\s:{,.>])"), "Missing Garden class " + selector);
  }
  assert.match(css, /\.assetChoices button\[aria-pressed="true"\]/);
  assert.match(css, /\.routeReverse:focus-visible/);
  assert.match(css, /\.progressSteps/);
  assert.match(css, /@media\(max-width:420px\)/);
  assert.match(css, /prefers-reduced-motion:reduce/);
});
