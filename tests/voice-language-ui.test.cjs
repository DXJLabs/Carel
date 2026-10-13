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

test("multilingual picker is inline, searchable and avoids native Android selector", () => {
  const html = renderToStaticMarkup(React.createElement(CarelVoiceAssistant, { onCommand: () => "" }));
  assert.match(html, /aria-label="Choose speech language"/);
  assert.match(html, /aria-expanded="false"/);
  assert.ok(!html.includes("<select"), "Native select must not appear");
  assert.ok(html.includes(">English</span>"), "Selected language must be readable");
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

test("default English language shows command support and no wallet approval action", () => {
  const html = renderToStaticMarkup(React.createElement(CarelVoiceAssistant, { onCommand: () => "" }));
  assert.match(html, /English/);
  assert.match(html, /Speak/);
  assert.match(html, /never signs/);
});
