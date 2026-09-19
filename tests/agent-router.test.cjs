const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

const ROOT =
  path.resolve(__dirname, "..");

require.extensions[".ts"] = (
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
      typeof request === "string" &&
      request.startsWith("@/")
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

const router =
  require(
    "../lib/agent/router.ts",
  );

const garden =
  require(
    "../lib/garden/protocol.ts",
  );


test(
  "Agent routes actions without selecting protocol providers",
  () => {
    for (
      const goal of [
        "Swap 1 STRK for USDC.",
        "Stake 1 STRK.",
        "Borrow 10 USDC against 1000 STRK.",
        "Bridge 0.0005 BTC to Starknet Sepolia.",
      ]
    ) {
      const route =
        router.routeAgentGoal(
          goal,
        );

      assert.equal(
        "provider" in route,
        false,
      );
    }
  },
);


test(
  "Bridge parsing remains provider-neutral",
  () => {
    const route =
      router.routeAgentGoal(
        "Bridge 1 ETH to Base.",
      );

    assert.equal(
      route.tool,
      "Bridge",
    );

    assert.equal(
      route.status,
      "ready",
    );

    assert.deepEqual(
      route.bridgeRequest,
      {
        amountText:
          "1",

        symbol:
          "ETH",

        destination:
          "Base",
      },
    );
  },
);


test(
  "Garden resolves only its current supported Bridge routes",
  () => {
    const incoming =
      garden.gardenBridgeIntentFromRequest({
        amountText:
          "0.0005",

        symbol:
          "BTC",

        destination:
          "Starknet Sepolia",
      });

    assert.deepEqual(
      incoming,
      {
        direction:
          "to-starknet",

        amount:
          "0.0005",

        symbol:
          "BTC",
      },
    );

    assert.throws(
      () =>
        garden
          .gardenBridgeIntentFromRequest({
            amountText:
              "1",

            symbol:
              "ETH",

            destination:
              "Base",
          }),
      /Garden/i,
    );
  },
);


test(
  "Borrow parsing stays independent from Vesu",
  () => {
    const route =
      router.routeAgentGoal(
        "Borrow 50 USDC against 500 STRK.",
      );

    assert.equal(
      route.tool,
      "Borrow",
    );

    assert.equal(
      route.status,
      "ready",
    );

    assert.deepEqual(
      route.borrowRequest,
      {
        borrowAmountText:
          "50",

        borrowSymbol:
          "USDC",

        collateralAmountText:
          "500",

        collateralSymbol:
          "STRK",
      },
    );

    assert.equal(
      "provider" in route,
      false,
    );
  },
);
