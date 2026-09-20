const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");

const path =
  require("node:path");

const Module =
  require("node:module");

const ts =
  require("typescript");

const ROOT =
  path.resolve(
    __dirname,
    "..",
  );

require.extensions[".ts"] =
  (
    mod,
    filename,
  ) => {
    const source =
      ts.transpileModule(
        fs.readFileSync(
          filename,
          "utf8",
        ),
        {
          compilerOptions: {
            module:
              ts.ModuleKind.CommonJS,

            target:
              ts.ScriptTarget.ES2020,

            esModuleInterop:
              true,
          },
        },
      ).outputText;

    mod._compile(
      source,
      filename,
    );
  };

const originalResolveFilename =
  Module._resolveFilename;

Module._resolveFilename =
  function (
    request,
    parent,
    isMain,
    options,
  ) {
    const resolved =
      typeof request ===
        "string" &&
      request.startsWith(
        "@/",
      )
        ? path.join(
            ROOT,
            request.slice(2),
          )
        : request;

    return originalResolveFilename.call(
      this,
      resolved,
      parent,
      isMain,
      options,
    );
  };


const runtime =
  require(
    "../lib/carel/runtime/bridge.ts",
  );

const router =
  require(
    "../lib/agent/router.ts",
  );


test(
  "runtime boundary converts BTC Agent route into current Bridge surface state",
  () => {
    const result =
      runtime
        .bridgeSurfaceIntentFromGoal(
          "Bridge 0.0005 BTC to Starknet Sepolia.",
        );

    assert.deepEqual(
      result,
      {
        direction:
          "to-starknet",

        amount:
          "0.0005",

        symbol:
          "BTC",
      },
    );
  },
);


test(
  "runtime boundary preserves Starknet Bitcoin token to Bitcoin direction",
  () => {
    const result =
      runtime
        .bridgeSurfaceIntentFromGoal(
          "Bridge 0.001 WBTC to Bitcoin Testnet4.",
        );

    assert.deepEqual(
      result,
      {
        direction:
          "to-bitcoin",

        amount:
          "0.001",

        symbol:
          "WBTC",
      },
    );
  },
);


test(
  "unsupported provider-neutral Bridge routes fail closed at runtime boundary",
  () => {
    const route =
      router
        .routeAgentGoal(
          "Bridge 1 ETH to Base.",
        );

    assert.equal(
      runtime
        .bridgeSurfaceIntentFromRoute(
          route,
        ),
      null,
    );
  },
);
