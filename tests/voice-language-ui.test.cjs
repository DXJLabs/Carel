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

test("voice language chooser is inline and never opens Android native select", () => {
  const html = renderToStaticMarkup(React.createElement(CarelVoiceAssistant, { onCommand: () => "" }));
  assert.match(html, /role="group" aria-label="Voice recognition language"/);
  assert.doesNotMatch(html, /<select\b/i);
  assert.match(html, />English<\/button>/);
  assert.match(html, />Indonesia<\/button>/);
});

test("English is selected by default, Indonesian remains available", () => {
  const html = renderToStaticMarkup(React.createElement(CarelVoiceAssistant, { onCommand: () => "" }));
  const chooser = html.split('aria-label="Voice recognition language"')[1].split("</div>")[0];
  assert.match(chooser, /aria-pressed="true"[^>]*>English<\/button>/);
  assert.match(chooser, /aria-pressed="false"[^>]*>Indonesia<\/button>/);
  assert.match(chooser, /type="button"/);
});
