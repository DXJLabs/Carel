const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
const read = (pathName) => fs.readFileSync(path.join(root, pathName), "utf8");
const managerPath = "components/borrow/VesuRepay.tsx";
const manager = read(managerPath);
const css = read("components/borrow/VesuPositionManager.module.css");
const add = read("components/borrow/VesuAddCollateral.tsx");
const withdraw = read("components/borrow/VesuWithdrawCollateral.tsx");
const close = read("components/borrow/VesuClosePosition.tsx");

test("Vesu manager TSX parses and retains all four actions", () => {
  const transpiled = ts.transpileModule(manager, {
    fileName: path.join(root, managerPath),
    reportDiagnostics: true,
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 },
  });
  const errors = (transpiled.diagnostics ?? []).filter(x => x.category === ts.DiagnosticCategory.Error);
  assert.deepEqual(errors.map(x => ts.flattenDiagnosticMessageText(x.messageText, "\n")), []);
  assert.match(manager, /<VesuAddCollateral\b/);
  assert.match(manager, /<VesuWithdrawCollateral\b/);
  assert.match(manager, /<VesuClosePosition\b/);
  assert.match(manager, /void repay\(\)/);
});

test("Compact action groups keep all transaction forms mounted and separately accessible", () => {
  assert.equal((manager.match(/<details\s+className=/g) ?? []).length, 4);
  assert.equal((manager.match(/<summary\s+className=\{ui\.summary\}/g) ?? []).length, 4);
  for (const name of ["Partial Repay", "Add Collateral", "Withdraw Collateral", "Close Position"]) {
    assert.ok(manager.includes(name), "Missing Vesu action: " + name);
  }
  assert.match(manager, /<details className=\{ui\.group\} open>/);
  assert.match(manager, /aria-label="Manage Vesu position"/);
  assert.match(manager, /aria-label="Close position manager"/);
  assert.match(manager, /onClick=\{onClose\}/);
});

test("Observed debt and collateral overview respects privacy masking", () => {
  assert.match(manager, /hidden \? "••••••" : formatUnits\(collateralAmount/);
  assert.match(manager, /const formattedDebt =/);
  assert.match(manager, /hidden\s*\? "••••••"/);
  assert.match(manager, /onComplete=\{/);
  assert.match(manager, /wallet\.busy/);
});

test("Repay preserves partial-only validation and fresh Vesu review", () => {
  assert.match(manager, /parsed >=\s*debtAmount/);
  assert.match(manager, /parsed === null \|\|\s*!enoughBalance/);
  assert.match(manager, /Review & Repay/);
  assert.match(manager, /repay\(\)/);
  assert.match(manager, /Vesu&apos;s minimum/);
});

test("Risky collateral withdrawal still requires review and eligible server response", () => {
  assert.match(withdraw, /reviewWithdrawal\(\)/);
  assert.match(withdraw, /confirmWithdrawal\(\)/);
  assert.match(withdraw, /setReview\(null\)/);
  assert.match(withdraw, /\/api\/vesu\/collateral\/withdraw/);
  assert.match(withdraw, /projectedLtv/);
  assert.match(withdraw, /review\.evaluation/);
  assert.match(withdraw, /eligible/);
});

test("Full close remains an explicit two-step native-debt transaction", () => {
  assert.match(close, /reviewClose\(\)/);
  assert.match(close, /closePosition\(\)/);
  assert.match(close, /debtSnapshot/);
  assert.match(close, /approvalCap/);
  assert.match(close, /!enoughDebtBalance/);
  assert.match(close, /Native denomination/);
});

test("Add collateral still uses exact token approval, never silently assumes funds", () => {
  assert.match(add, /\/api\/vesu\/collateral\/add/);
  assert.match(add, /publicBalance/);
  assert.match(add, /parseUnits\(/);
  assert.match(add, /exact token approval/);
  assert.match(add, /void submit\(\)/);
});

test("Manager responsive styles are scoped, keyboard-friendly and defined", () => {
  const selectors = [...new Set([...manager.matchAll(/ui\.([a-zA-Z0-9_]+)/g)].map(m => m[1]))];
  for (const c of selectors) {
    assert.match(css, new RegExp("\\." + c + "(?=[\\s:{,.>])"), "Undefined CSS: " + c);
  }
  assert.match(css, /\.summary:focus-visible/);
  assert.match(css, /@media\(max-width:420px\)/);
  assert.match(css, /prefers-reduced-motion:reduce/);
});
