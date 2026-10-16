const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
const viewPath = path.join(root, "components/staking/StakingView.tsx");
const controllerPath = path.join(root, "components/staking/useStakingController.ts");
const workspacePath = path.join(root, "components/CarelWorkspace.tsx");
const view = fs.readFileSync(viewPath, "utf8");
const controller = fs.readFileSync(controllerPath, "utf8");
const workspace = fs.readFileSync(workspacePath, "utf8");
const css = fs.readFileSync(path.join(root, "components/staking/StakingView.module.css"), "utf8");

test("Staking View TSX transpiles and keeps a dedicated CSS module", () => {
  const result = ts.transpileModule(view, {
    fileName: viewPath, reportDiagnostics: true,
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 },
  });
  const errors = (result.diagnostics ?? []).filter(d => d.category === ts.DiagnosticCategory.Error);
  assert.deepEqual(errors.map(d => ts.flattenDiagnosticMessageText(d.messageText, "\n")), []);
  assert.match(view, /import ui from "\.\/StakingView\.module\.css"/);
});

test("Staking assets remain capability-driven, not the full Swap token list", () => {
  assert.match(controller, /getStarknetStakingAssetOptions/);
  assert.match(view, /options\.map\(option => <button/);
  assert.match(view, /onClick=\{\(\) => selectAsset\(option\.asset\.id\)\}/);
  assert.match(view, /disabled=\{busy \|\| flowLocked\}/);
  assert.match(view, /No attached staking provider currently declares an executable asset/);
  assert.match(view, /Explore public staking/);
});

test("Staking APR and receipts are sourced from the provider, not invented", () => {
  assert.match(view, /mode === "normal" && pool \? formatApr\(pool\.apr\) : "Unavailable"/);
  assert.match(view, /Public pool rates are not used as private yield estimates/);
  assert.match(view, /Pool \{shortAddress\(pool\.poolAddress\)\}/);
  assert.match(view, /APR is not assumed/);
  assert.match(view, /Private \{output\.symbol\} receipt/);
  assert.match(view, /shieldFee !== null/);
  assert.match(view, /not treated as public balances/);
  assert.doesNotMatch(view, /guaranteed return|estimated earnings:/i);
});

test("Agent Staking preserves all transaction and confirmation callbacks", () => {
  for (const fn of ["startFlow", "executeNextStage", "confirmSubmitted", "resetFlow", "refreshPosition"]) {
    assert.match(view, fn === "resetFlow" ? /onClick=\{resetFlow\}/ : new RegExp("void " + fn + "\\(\\)"), fn);
  }
  for (const action of ["initiateUnstake", "completeUnstake", "claimRewards"]) {
    assert.match(view, new RegExp('runPositionAction\\("' + action + '"\\)'), action);
  }
  assert.match(view, /stakingAgentSession\.run\.stages\.map/);
  assert.match(view, /stageAction\(stage\.stageId\)/);
  assert.match(view, /!wallet\.strk20Capable/);
  assert.match(view, /mode === "shield" && shieldFee === null/);
});

test("Position controls remain locked to available real provider observations", () => {
  assert.match(view, /\{position \? <>/);
  assert.match(view, /position\.amount > 0n/);
  assert.match(view, /position\.unpoolAmount > 0n && position\.unpoolTime !== null/);
  assert.match(view, /Date\.now\(\) >= position\.unpoolTime/);
  assert.match(view, /position\.unclaimedRewards > 0n/);
  assert.match(view, /No public staking position is currently displayed/);
});

test("Normal one-step staking avoids duplicating the Agent plan but private multi-stage retains it", () => {
  assert.match(workspace, /CAREL prepared a one-step Staking plan/);
  assert.match(workspace, /selectedRuntimeSurface === "staking" && mode === "normal" && agentPlan\.stages\.length === 1/);
  assert.match(workspace, /mode === "normal" && agentPlan\.stages\.length === 1 &&/);
  assert.match(workspace, /selectedRuntimeSurface === "swap" \|\| selectedRuntimeSurface === "staking"/);
  assert.match(workspace, /<AvnuStaking/);
});

test("Staking mobile styles cover all UI classes without intruding on Swap", () => {
  const referenced = [...new Set([...view.matchAll(/ui\.([a-zA-Z0-9_]+)/g)].map(m => m[1]))];
  for (const c of referenced) assert.match(css, new RegExp("\\." + c + "(?=[\\s:{,.>])"), "CSS missing: " + c);
  assert.match(css, /@media\(max-width:420px\)/);
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)/);
});
