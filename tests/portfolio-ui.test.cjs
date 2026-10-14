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
  const mapped = ["strk", "usdc", "eth", "usdt", "wbtc", "btc", "xstrk", "strkbtc"];
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
  assert.match(source, /XSTRK: "xstrk"/);
  assert.match(source, /STRKBTC: "strkbtc"/);
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

const multichainComponentPath = path.join(__dirname, "..", "components", "portfolio", "PortfolioViews.tsx");
const multichainSource = fs.readFileSync(multichainComponentPath, "utf8");
const multiCSS = fs.readFileSync(path.join(__dirname, "..", "components", "portfolio", "PortfolioViews.module.css"), "utf8");

test("Portfolio offers navigable All Networks, network detail and per-asset detail", () => {
  assert.match(source, /portfolioView, setPortfolioView/);
  assert.match(source, /function renderPortfolioOverview\(/);
  assert.match(source, /function renderPortfolioAssetDetail\(/);
  assert.match(source, /portfolioNetworkFocus/);
  assert.match(source, /setPortfolioView\("asset"\)/);
  assert.match(source, /setPortfolioView\("network"\)/);
  assert.match(multichainSource, /export function PortfolioOverview/);
  assert.match(multichainSource, /export function PortfolioAssetDetail/);
});

test("All Networks cannot fabricate prices, APR or unsupported balances", () => {
  assert.match(multichainSource, /USD value unavailable/);
  assert.match(multichainSource, /Not connected to CAREL Portfolio/);
  assert.match(multichainSource, /Starknet wallet only/);
  assert.match(multichainSource, /USD value unavailable/);
  assert.doesNotMatch(multichainSource, /2,845\.32|1,658\.42|538\.12|7\.2%/);
  assert.ok(multichainSource.indexOf('PORTFOLIO_NETWORKS') >= 0);
});

test("asset detail routes by scoped AssetRef.id and avoids double-counting receipts", () => {
  assert.match(source, /portfolioSelectedAssetId/);
  assert.match(source, /holding\.asset\.id === portfolioSelectedAssetId/);
  assert.match(multichainSource, /position\.asset\.id === holding\.asset\.id/);
  assert.match(multichainSource, /Positions also describe receipt tokens; they are not additional holdings/);
  assert.match(multichainSource, /Viewing assets does not approve transactions/);
});

test("registered ecosystems are not advertised as connected wallets", () => {
  assert.match(multichainSource, /Ethereum/);
  assert.match(multichainSource, /Bitcoin/);
  assert.match(multichainSource, /Solana/);
  assert.match(multichainSource, /Starknet wallet only/);
  assert.match(multichainSource, /Testnet balances are excluded/);
});

test("Portfolio views have scoped mobile styles and valid TSX syntax", () => {
  const transpiled = ts.transpileModule(multichainSource, {
    fileName: multichainComponentPath,
    reportDiagnostics: true,
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 },
  });
  const errors = (transpiled.diagnostics ?? []).filter(error => error.category === ts.DiagnosticCategory.Error);
  assert.deepEqual(errors.map(error => ts.flattenDiagnosticMessageText(error.messageText, "\n")), []);
  assert.match(multiCSS, /@media\(max-width:360px\)/);
});

test("Agentic DeFi overview prioritizes observed balance and actual Agent action", () => {
  const overview = multichainSource.slice(multichainSource.indexOf("export function PortfolioOverview("), multichainSource.indexOf("export function PortfolioUnavailableNetwork("));
  assert.match(overview, /Observed public STRK/);
  assert.match(overview, /Observed STRK · public \+ revealed private/);
  assert.match(overview, /USD value unavailable/);
  assert.match(overview, /CAREL Insights/);
  assert.match(overview, /onAgent/);
  assert.doesNotMatch(overview, /Total portfolio value/);
  assert.doesNotMatch(overview, /className=\{styles\.stats\}/);
  assert.match(overview, /hideAmounts && <p className=\{styles\.privacyHidden\}/);
});

test("Portfolio asset lists default to observed positives, with Show all action", () => {
  assert.match(multichainSource, /showAllAssets, setShowAllAssets/);
  assert.match(multichainSource, /observedAmount !== null && holding\.observedAmount > 0n/);
  assert.match(multichainSource, /Show all assets/);
  assert.match(multichainSource, /onClick=\{\(\) => setShowAllAssets\(x => !x\)\}/);
  assert.match(multichainSource, /holding\.asset\.name/);
  assert.doesNotMatch(multichainSource, /holding\.asset\.chain\.name/);
});

test("Private allocation cannot be shown without opt-in reveal or when hidden", () => {
  assert.match(source, /!hideAmounts && wallet\.privateRevealed/);
  assert.match(source, /wallet\.publicStrk !== null && privateBalance !== null/);
  assert.match(multichainSource, /privacyShare !== null && Number\.isFinite\(privacyShare\)/);
  assert.match(multichainSource, /Private balance not revealed/);
  assert.match(source, /position\.borrow && !hideAmounts/);
});

test("Portfolio quick actions open the existing Shield review, never sign immediately", () => {
  assert.match(source, /function openPortfolioPrivacyAction\(/);
  assert.match(source, /setQuickAction\(action\)/);
  assert.match(source, /setPortfolioView\("network"\)/);
  assert.match(source, /id="carel-portfolio-quick"/);
  assert.match(source, /wallet\.shield\(quickAmount\)/);
  assert.match(source, /wallet\.unshield\(quickAmount\)/);
  assert.match(multichainSource, /disabled=\{!canPrivacyAction\}/);
});

test("xSTRK and strkBTC use issuer artwork rather than substitute token marks", () => {
  assert.match(multichainSource, /XSTRK: "xstrk", STRKBTC: "strkbtc"/);
  assert.match(source, /XSTRK: "xstrk"/);
  assert.match(source, /STRKBTC: "strkbtc"/);
  const issuerSvg = fs.readFileSync(path.join(__dirname, "..", "public", "token-icons", "xstrk.svg"), "utf8");
  const btcSvg = fs.readFileSync(path.join(__dirname, "..", "public", "token-icons", "strkbtc.svg"), "utf8");
  assert.match(issuerSvg, /<svg/);
  assert.match(btcSvg, /<svg/);
  assert.doesNotMatch(issuerSvg + btcSvg, /<script|onload=|<foreignObject/i);
});

test("Portfolio differentiates unrevealed private assets from total balance", () => {
  assert.match(multichainSource, /Private balance not revealed — total is unknown/);
  assert.match(multichainSource, /privateRevealed \? "Observed STRK/);
  assert.match(multichainSource, /privateRevealed && privacyShare !== null/);
  assert.match(multichainSource, /Private positions are not yet visible/);
  assert.match(source, /onRevealPrivate=\{\(\) => void run\(\(\) => wallet\.revealPrivateBalance\(\)\)\}/);
  assert.match(source, /positionsLoading=\{portfolioPositionsLoading\}/);
  assert.match(source, /positionsWarning=\{portfolioPositionWarning\}/);
});

test("Network chooser expands at header without duplicate global banner", () => {
  const view = multichainSource.slice(multichainSource.indexOf("export function PortfolioOverview("), multichainSource.indexOf("export function PortfolioUnavailableNetwork("));
  assert.match(view, /showNetworks, setShowNetworks/);
  assert.match(view, /aria-expanded=\{showNetworks\}/);
  assert.match(view, /aria-controls="carel-network-options"/);
  assert.match(view, /showNetworks && <section/);
  assert.match(source, /tab !== "portfolio" && <div className=\{styles\.networkLine\}/);
});

test("Pending or inaccessible private positions are never labelled verified zero", () => {
  assert.match(multichainSource, /positionsLoading \? "Checking positions"/);
  assert.match(multichainSource, /positionsWarning \? "Positions partially unavailable"/);
  assert.match(multichainSource, /"Private positions not checked"/);
  assert.match(multichainSource, /onRetryPositions/);
  assert.match(multichainSource, /Private positions are not yet visible/);
});

test("Compact mobile Portfolio retains wallet review and removes feature grid", () => {
  const workspaceCSS = fs.readFileSync(path.join(__dirname, "..", "components", "CarelWorkspace.module.css"), "utf8");
  assert.match(multiCSS, /\.cockpit \.quickActions button\.agentAction/);
  assert.match(multiCSS, /\.privateStatus/);
  assert.match(workspaceCSS, /\.app\[data-current-tab="portfolio"\] \.main/);
  assert.match(source, /setQuickAction\(action\)/);
  assert.doesNotMatch(source, /aria-label="Portfolio features"/);
});
