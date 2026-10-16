const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "..");
for (const ext of [".ts", ".tsx"]) {
  require.extensions[ext] = (mod, filename) => {
    const output = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
      },
    }).outputText;
    mod._compile(output, filename);
  };
}
require.extensions[".css"] = mod => {
  mod.exports = new Proxy({}, { get: (_target, prop) => String(prop) });
};
const resolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  const pathname = typeof request === "string" && request.startsWith("@/")
    ? path.join(ROOT, request.slice(2))
    : request;
  return resolve.call(this, pathname, parent, isMain, options);
};
const { CarelVoiceAssistant } = require("../components/voice/CarelVoiceAssistant.tsx");

const { VOICE_LANGUAGES } = require("../lib/voice/voice-languages.ts");

test("voice assistant starts as a compact goal microphone, not a large language card", () => {
  const html = renderToStaticMarkup(React.createElement(CarelVoiceAssistant, { onCommand: () => "" }));
  assert.match(html, /aria-label="Open voice assistant"/);
  assert.ok(!html.includes("Voice assistant</strong>"), "Voice card must be hidden until requested");
  assert.ok(!html.includes("<select"), "Never render a native Android language selector");
  assert.ok(!html.includes("Speech language"), "Settings belong inside the on-demand sheet");
});

test("microphone entry stays a safe user action without transaction approval", () => {
  const html = renderToStaticMarkup(React.createElement(CarelVoiceAssistant, { onCommand: () => "" }));
  assert.match(html, /type="button"/);
  assert.match(html, /aria-label="Open voice assistant"/);
  assert.doesNotMatch(html, /Execute transaction|Confirm transfer/);
});

test("language catalogue contains at least 15 unique browser locales", () => {
  assert.ok(VOICE_LANGUAGES.length >= 15);
  assert.equal(new Set(VOICE_LANGUAGES.map(entry => entry.code)).size, VOICE_LANGUAGES.length);
  for (const entry of VOICE_LANGUAGES) {
    assert.match(entry.code, /^[a-z]{2}-[A-Z]{2}$/);
    assert.ok(entry.label.length > 0);
    assert.ok(entry.nativeName.length > 0);
  }
});

test("language catalogue remains available for compact speech sheet", () => {
  const english = VOICE_LANGUAGES.find(item => item.code === "en-US");
  const indonesia = VOICE_LANGUAGES.find(item => item.code === "id-ID");
  assert.equal(english.label, "English");
  assert.equal(indonesia.label, "Indonesia");
});
