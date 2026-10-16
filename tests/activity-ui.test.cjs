const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
const workspacePath = path.join(root, "components/CarelWorkspace.tsx");
const workspace = fs.readFileSync(workspacePath, "utf8");
const css = fs.readFileSync(path.join(root, "components/ActivityView.module.css"), "utf8");

test("Activity page remains valid TSX", () => {
  const output = ts.transpileModule(workspace, {
    fileName: workspacePath, reportDiagnostics: true,
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 },
  });
  const errors = (output.diagnostics ?? []).filter(d => d.category === ts.DiagnosticCategory.Error);
  assert.deepEqual(errors.map(d => ts.flattenDiagnosticMessageText(d.messageText, "\n")), []);
});

test("Activity makes its STRK20 wallet-only scope explicit", () => {
  assert.match(workspace, /CAREL ACTIVITY/);
  assert.match(workspace, /Not a complete transaction index/);
  assert.match(workspace, /Saved for this wallet/);
  assert.match(workspace, /STRK20 executions/);
  assert.match(workspace, /executions\.owner === sessionKey && wallet\.connected/);
  assert.match(workspace, /shortAddress\(wallet\.address\)/);
});

test("Activity status counts derive from the same actual records", () => {
  assert.match(workspace, /const confirmed = records\.filter\(record => record\.status === "confirmed"\)\.length/);
  assert.match(workspace, /const pending = records\.length - confirmed/);
  assert.match(workspace, /\{records\.length\}/);
  assert.match(workspace, /\{confirmed\}/);
  assert.match(workspace, /\{pending\}/);
});

test("Execution filters and explorer details are unchanged", () => {
  assert.match(workspace, /activityFilter === "pending"/);
  assert.match(workspace, /activityFilter === "confirmed"/);
  assert.match(workspace, /visibleRecords\.map\(renderExecution\)/);
  assert.match(workspace, /setSelectedHash\(null\)/);
  assert.match(workspace, /selectedExecution\.hash/);
  assert.match(workspace, /View on explorer/);
});

test("Garden Bridge history is presented as an independent source", () => {
  assert.match(workspace, /Bridge executions are tracked separately/);
  assert.match(workspace, /<GardenBridge mode=\{mode\} historyOnly activityFilter=\{activityFilter\}/);
  assert.doesNotMatch(workspace, /const confirmed = portfolioPositions/);
});

test("Activity style classes exist and are responsive", () => {
  const render = workspace.slice(workspace.indexOf('  function renderActivity() {'), workspace.indexOf('  function renderSettings()', workspace.indexOf('  function renderActivity() {')));
  const used = [...new Set([...render.matchAll(/activityUI\.([a-zA-Z0-9_]+)/g)].map(m => m[1]))];
  for (const name of used) {
    assert.match(css, new RegExp("\\." + name + "(?=[\\s:{,.>])"), "Missing Activity style " + name);
  }
  assert.match(css, /@media\(max-width:390px\)/);
  assert.match(css, /prefers-reduced-motion:reduce/);
});
