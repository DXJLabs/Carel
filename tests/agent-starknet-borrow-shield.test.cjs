const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "..");

require.extensions[".ts"] = (mod, filename) => {
  const source = ts.transpileModule(
    fs.readFileSync(filename, "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
        esModuleInterop: true,
      },
    },
  ).outputText;

  mod._compile(source, filename);
};

const originalResolveFilename = Module._resolveFilename;

Module._resolveFilename = function (
  request,
  parent,
  isMain,
  options,
) {
  const resolved =
    typeof request === "string" &&
    request.startsWith("@/")
      ? path.join(ROOT, request.slice(2))
      : request;

  return originalResolveFilename.call(
    this,
    resolved,
    parent,
    isMain,
    options,
  );
};

const {
  buildStarknetAgentPlan,
} = require(
  "../lib/agent/starknet-planner.ts",
);

const {
  createAgentExecutionSession,
  executeAgentStage,
} = require(
  "../lib/agent/executor.ts",
);

const {
  getAgentRuntimeStage,
} = require(
  "../lib/agent/state-machine.ts",
);

const {
  createStarknetBorrowShieldRuntime,
} = require(
  "../lib/agent/starknet-borrow-shield.ts",
);

const {
  findCarelAssetBySymbol,
} = require(
  "../lib/carel/assets.ts",
);

const {
  STARKNET_MAINNET,
} = require(
  "../lib/carel/ecosystems/starknet/chains.ts",
);


function createFixture(
  borrowStatus = "confirmed",
) {
  const chainId =
    STARKNET_MAINNET.chainId;

  const strk =
    findCarelAssetBySymbol(
      chainId,
      "STRK",
    );

  const usdc =
    findCarelAssetBySymbol(
      chainId,
      "USDC",
    );

  assert.ok(strk);
  assert.ok(usdc);

  const plan =
    buildStarknetAgentPlan({
      goal:
        "Borrow 50 USDC against 500 STRK but keep the result private.",

      chainId,

      mode:
        "normal",
    });

  const context = {
    runId:
      "agent-run-1",

    chainId,

    account:
      "0x123",
  };

  let publicUsdc =
    100_000_000n;

  let shieldedAmount =
    null;

  let waited =
    false;

  const runtime =
    createStarknetBorrowShieldRuntime({
      async prepareBorrow(input) {
        return {
          label:
            "Borrow 50 USDC against 500 STRK",

          execution: {
            chainId,

            poolId:
              "vesu-test",

            poolAddress:
              "0x456",

            owner:
              input.owner,

            collateralAssetId:
              strk.id,

            debtAssetId:
              usdc.id,

            collateralAmount:
              "500000000000000000000",

            borrowAmount:
              "50000000",

            preparedAt:
              Date.now(),

            expiresAt:
              Date.now() + 45_000,

            calls: [],
          },
        };
      },

      async executeBorrow() {
        if (
          borrowStatus ===
            "confirmed"
        ) {
          publicUsdc +=
            50_000_000n;
        }

        return {
          hash:
            "0x111",

          status:
            borrowStatus,
        };
      },

      async executeShieldAsset(
        assetId,
        amountText,
      ) {
        assert.equal(
          assetId,
          usdc.id,
        );

        shieldedAmount =
          amountText;

        return {
          hash:
            "0x222",

          status:
            "confirmed",
        };
      },

      async readPublicBalance({
        assetId,
      }) {
        assert.equal(
          assetId,
          usdc.id,
        );

        return publicUsdc;
      },

      async waitForTransaction({
        transactionId,
      }) {
        assert.equal(
          transactionId,
          "0x111",
        );

        waited = true;

        publicUsdc +=
          50_000_000n;
      },
    });

  return {
    plan,
    context,
    runtime,

    getShieldedAmount:
      () => shieldedAmount,

    getWaited:
      () => waited,
  };
}


test(
  "confirmed Borrow records verified output and unlocks Shield",
  async () => {
    const {
      plan,
      context,
      runtime,
    } =
      createFixture();

    const initial =
      createAgentExecutionSession(
        plan,
        context.runId,
      );

    const result =
      await executeAgentStage(
        plan,
        initial,
        "borrow-1",
        context,
        runtime.registry,
      );

    assert.equal(
      result.receipt.status,
      "confirmed",
    );

    assert.equal(
      result.session
        .outputs["borrow-1"]
        .assetSymbol,
      "USDC",
    );

    assert.equal(
      result.session
        .outputs["borrow-1"]
        .amountText,
      "50",
    );

    assert.equal(
      getAgentRuntimeStage(
        result.session.run,
        "shield-2",
      ).status,
      "review",
    );
  },
);


test(
  "Shield consumes verified Borrow output",
  async () => {
    const {
      plan,
      context,
      runtime,
      getShieldedAmount,
    } =
      createFixture();

    let session =
      createAgentExecutionSession(
        plan,
        context.runId,
      );

    const borrow =
      await executeAgentStage(
        plan,
        session,
        "borrow-1",
        context,
        runtime.registry,
      );

    session =
      borrow.session;

    const shield =
      await executeAgentStage(
        plan,
        session,
        "shield-2",
        context,
        runtime.registry,
      );

    assert.equal(
      getShieldedAmount(),
      "50",
    );

    assert.equal(
      shield.session.run.status,
      "completed",
    );
  },
);


test(
  "submitted Borrow keeps Shield locked until confirmation",
  async () => {
    const {
      plan,
      context,
      runtime,
      getWaited,
    } =
      createFixture(
        "submitted",
      );

    const initial =
      createAgentExecutionSession(
        plan,
        context.runId,
      );

    const borrow =
      await executeAgentStage(
        plan,
        initial,
        "borrow-1",
        context,
        runtime.registry,
      );

    assert.equal(
      borrow.receipt.status,
      "submitted",
    );

    assert.equal(
      getAgentRuntimeStage(
        borrow.session.run,
        "shield-2",
      ).status,
      "locked",
    );

    const confirmed =
      await runtime
        .confirmSubmittedStage(
          plan,
          borrow.session,
          "borrow-1",
          context,
        );

    assert.equal(
      getWaited(),
      true,
    );

    assert.equal(
      confirmed
        .outputs["borrow-1"]
        .amountText,
      "50",
    );

    assert.equal(
      getAgentRuntimeStage(
        confirmed.run,
        "shield-2",
      ).status,
      "review",
    );
  },
);
