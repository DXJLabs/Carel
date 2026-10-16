const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
const pathToWorkspace = path.join(root, "components/CarelWorkspace.tsx");
const workspace = fs.readFileSync(pathToWorkspace, "utf8");
const css = fs.readFileSync(path.join(root, "components/CarelWorkspace.module.css"), "utf8");

test("Home route and Agent workflow JSX remain parseable", () => {
  const transpiled = ts.transpileModule(workspace, {
    fileName: pathToWorkspace, reportDiagnostics: true,
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 },
  });
  const errors = (transpiled.diagnostics ?? []).filter(d => d.category === ts.DiagnosticCategory.Error);
  assert.deepEqual(errors.map(d => ts.flattenDiagnosticMessageText(d.messageText, "\n")), []);
});

test("Home promotes Agent workflow entry without auto-signing or submitting", () => {
  const home = workspace.slice(workspace.indexOf("  function renderHome() {"), workspace.indexOf("  function renderPoints()", workspace.indexOf("  function renderHome() {")));
  assert.match(home, /Ask CAREL/);
  assert.match(home, /Or start with a workflow/);
  assert.match(home, /TOOLS\.map\(tool => <button/);
  assert.match(home, /setMode\("normal"\); chooseTool\(tool\); navigate\("agent"\)/);
  assert.match(home, /CAREL prepares a plan first/);
  assert.doesNotMatch(home, /wallet\.execute\(|wallet\.sendTransaction\(|executeAgentStage\(/);
});

test("Home does not label observed STRK as complete net portfolio wealth", () => {
  const home = workspace.slice(workspace.indexOf("  function renderHome() {"), workspace.indexOf("  function renderPoints()", workspace.indexOf("  function renderHome() {")));
  assert.match(home, /Observed STRK balance/);
  assert.doesNotMatch(home, />Net portfolio</);
  assert.match(home, /amount\(visibleBalance, hideAmounts\)/);
  assert.match(home, /Latest STRK20 activity/);
  assert.match(home, /Other protocol activity is tracked separately/);
});

test("Home workflow controls are responsive and keyboard accessible", () => {
  for (const name of ["homeQuickStart", "homeQuickActions"]) {
    assert.match(css, new RegExp("\\." + name + "(?=[\\s:{,.>])"));
  }
  assert.match(css, /\.homeQuickActions button:focus-visible/);
  assert.match(css, /@media\(max-width:420px\)/);
  assert.match(css, /prefers-reduced-motion:reduce/);
});
