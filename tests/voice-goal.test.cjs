const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const Module = require("node:module");

const file = path.join(__dirname, "..", "lib/voice/voice-goal.ts");
const transformed = ts.transpileModule(fs.readFileSync(file, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const mod = new Module(file);
mod.filename = file;
mod.paths = module.paths;
mod._compile(transformed, file);
const { normalizeVoiceGoal, describeVoicePlan } = mod.exports;

test("English commands remain unchanged except whitespace", () => {
  assert.equal(normalizeVoiceGoal("  Swap 10 STRK for USDC  ", "en-US"), "Swap 10 STRK for USDC");
});

test("Indonesian spoken swap becomes a parsable English command", () => {
  assert.equal(normalizeVoiceGoal("Tolong tukar 10 STRK ke USDC dan simpan hasilnya privat", "id-ID"), "Swap 10 STRK for USDC and keep it private");
});

test("Unknown utterances are never turned into an executable action", () => {
  assert.equal(normalizeVoiceGoal("Bagaimana kondisi pasar?", "id-ID"), "Bagaimana kondisi pasar?");
});

test("Ready feedback describes a preview, not a completed transaction", () => {
  const result = describeVoicePlan({ status: "ready", stages: [{ action: "swap" }, { action: "shield" }] }, "en-US");
  assert.match(result, /2 step preview: swap, shield/);
  assert.match(result, /No transaction was executed/);
  assert.match(result, /wallet approval/);
});

test("Blocked feedback never implies execution", () => {
  const result = describeVoicePlan({ status: "blocked", stages: [] }, "id-ID");
  assert.match(result, /belum siap/);
  assert.match(result, /Tidak ada transaksi/);
});
