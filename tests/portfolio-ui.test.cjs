const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const componentPath = path.join(__dirname, "..", "components", "CarelWorkspace.tsx");
const source = fs.readFileSync(componentPath, "utf8");
const start = source.indexOf("  function renderPortfolio() {");
const end = source.indexOf("  function renderActivity()", start);
const portfolio = source.slice(start, end);

test("Portfolio refactor preserves valid TSX syntax", () => {
  const result = ts.transpileModule(source, {
    fileName: componentPath,
    reportDiagnostics: true,
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 },
  });
  const errors = (result.diagnostics ?? []).filter(item => item.category === ts.DiagnosticCategory.Error);
  assert.deepEqual(errors.map(error => ts.flattenDiagnosticMessageText(error.messageText, "\n")), []);
});

test("disconnected Portfolio has one purposeful wallet CTA before data sections", () => {
  assert.ok(start >= 0 && end > start, "Portfolio renderer must exist");
  const disconnected = portfolio.indexOf("if (!wallet.connected)");
  assert.ok(disconnected >= 0);
  assert.ok(portfolio.indexOf("See what you own.") > disconnected);
  assert.ok(portfolio.indexOf("Connect wallet") > disconnected);
  assert.ok(portfolio.indexOf("return <div className=", disconnected) > disconnected);
  assert.ok(portfolio.indexOf("Observed STRK balance") > disconnected);
});

test("connected Portfolio uses real STRK observations and preserves transaction protections", () => {
  assert.match(portfolio, /Observed STRK balance/);
  assert.match(portfolio, /amount\(visibleBalance, hideAmounts\)/);
  assert.match(portfolio, /privateShare !== null && !hideAmounts/);
  assert.match(portfolio, /wallet\.revealPrivateBalance\(\)/);
  assert.match(portfolio, /executeQuick\(\)/);
  assert.match(portfolio, /<VesuRepay/);
  assert.match(portfolio, /selectedRepayPositionId/);
});

test("history period selection remains possible when selected period has no points", () => {
  assert.match(portfolio, /hasRecordedHistory && !hideAmounts/);
  assert.match(portfolio, /chartPoints\.length >= 2 \?/);
  assert.match(portfolio, /No balance observations in this period/);
  assert.match(portfolio, /setPeriod\(value\)/);
});


test("Portfolio maps token symbols to local SVG assets with derivatives explicitly marked", () => {
  const svgDir = path.join(__dirname, "..", "public", "token-icons");
  const mapped = ["strk", "usdc", "eth", "usdt", "wbtc", "btc"];
  for (const symbol of mapped) {
    const iconFile = path.join(svgDir, symbol + ".svg");
    assert.ok(fs.existsSync(iconFile), "Missing local icon: " + symbol);
    const svg = fs.readFileSync(iconFile, "utf8");
    assert.match(svg, /^<svg\b/);
    assert.doesNotMatch(svg, /<script|onload=|<foreignObject/i);
  }
  assert.match(source, /function AssetLogo/);
  assert.match(source, /<AssetLogo symbol={holding\.asset\.symbol}\/>/);
  assert.match(source, /<AssetLogo symbol={position\.asset\.symbol}\/>/);
  assert.match(source, /key === "XSTRK"/);
  assert.match(source, /key === "STRKBTC"/);
});

test("Portfolio draws actual observed allocation and avoids invented chart history", () => {
  assert.match(portfolio, /privateShare !== null && !hideAmounts/);
  assert.match(portfolio, /<svg className={styles\.portfolioDonut}/);
  assert.match(portfolio, /strokeDasharray={`\$\{privateShare\}/);
  assert.match(portfolio, /hasRecordedHistory && !hideAmounts/);
  assert.match(source, /if \(points\.length < 2\)/);
  assert.match(source, /styles\.chartAnimatedLine/);
  assert.doesNotMatch(portfolio, /Math\.random\(/);
});

test("Portfolio animations honor reduced-motion preference", () => {
  const css = fs.readFileSync(path.join(__dirname, "..", "components", "CarelWorkspace.module.css"), "utf8");
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /\.portfolioDonutSegment/);
  assert.match(css, /\.chartAnimatedLine/);
});
