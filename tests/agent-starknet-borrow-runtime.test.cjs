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

const originalResolveFilename =
  Module._resolveFilename;

Module._resolveFilename = function (
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
  createStarknetBorrowRuntime,
} = require(
  "../lib/agent/starknet-borrow-runtime.ts",
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


function createFixture(mode) {
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
        "Borrow 50 USDC against 500 STRK",

      chainId,

      mode,
    });

  assert.equal(
    plan.status,
    "ready",
  );

  const context = {
    runId:
      `agent-${mode}-1`,

    chainId,

    account:
      "0x123",
  };

  const balances =
    new Map([
      [
        strk.id,
        100n *
          10n ** 18n,
      ],

      [
        usdc.id,
        100_000_000n,
      ],
    ]);

  const applied =
    new Set();

  let shieldedAmount =
    null;

  let unshieldedAmount =
    null;

  const runtime =
    createStarknetBorrowRuntime({
      async prepareBorrow(input) {
        return {
          label:
            `Borrow ${input.borrowAmountText} USDC against ${input.collateralAmountText} STRK`,

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
              (
                500n *
                10n ** 18n
              ).toString(),

            borrowAmount:
              "50000000",

            preparedAt:
              Date.now(),

            expiresAt:
              Date.now() +
              45_000,

            calls: [],
          },
        };
      },

      async executeBorrow() {
        return {
          hash:
            "0x111",

          /*
           * Runtime must still enter submitted first even when the wallet
           * reports confirmation immediately.
           */
          status:
            "confirmed",
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

      async executeUnshieldAsset(
        assetId,
        amountText,
      ) {
        assert.equal(
          assetId,
          strk.id,
        );

        unshieldedAmount =
          amountText;

        return {
          hash:
            "0x333",

          status:
            "confirmed",
        };
      },

      async readPublicBalance({
        assetId,
      }) {
        return (
          balances.get(
            assetId,
          ) ??
          0n
        );
      },

      async waitForTransaction({
        transactionId,
      }) {
        if (
          applied.has(
            transactionId,
          )
        ) {
          return;
        }

        applied.add(
          transactionId,
        );

        if (
          transactionId ===
            "0x111"
        ) {
          balances.set(
            usdc.id,
            (
              balances.get(
                usdc.id,
              ) ??
              0n
            ) +
              50_000_000n,
          );

          return;
        }

        if (
          transactionId ===
            "0x333"
        ) {
          balances.set(
            strk.id,
            (
              balances.get(
                strk.id,
              ) ??
              0n
            ) +
              500n *
                10n ** 18n,
          );

          return;
        }

        if (
          transactionId ===
            "0x222"
        ) {
          return;
        }

        throw new Error(
          `Unexpected transaction ${transactionId}`,
        );
      },
    });

  return {
    plan,
    context,
    runtime,

    getShieldedAmount:
      () =>
        shieldedAmount,

    getUnshieldedAmount:
      () =>
        unshieldedAmount,
  };
}


test(
  "Shield Borrow records tx before output verification",
  async () => {
    const {
      plan,
      context,
      runtime,
    } =
      createFixture(
        "shield",
      );

    const session =
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

    assert.equal(
      borrow.receipt.status,
      "submitted",
    );

    assert.equal(
      getAgentRuntimeStage(
        borrow.session.run,
        "borrow-1",
      ).status,
      "submitted",
    );

    assert.equal(
      getAgentRuntimeStage(
        borrow.session.run,
        "shield-2",
      ).status,
      "locked",
    );
  },
);


test(
  "confirmed and verified Borrow unlocks Shield",
  async () => {
    const {
      plan,
      context,
      runtime,
    } =
      createFixture(
        "shield",
      );

    const session =
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

    const confirmed =
      await runtime
        .confirmSubmittedStage(
          plan,
          borrow.session,
          "borrow-1",
          context,
        );

    assert.equal(
      confirmed.outputs[
        "borrow-1"
      ].amountText,
      "50",
    );

    assert.equal(
      confirmed.outputs[
        "borrow-1"
      ].assetSymbol,
      "USDC",
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


test(
  "Shield consumes only verified Borrow output",
  async () => {
    const {
      plan,
      context,
      runtime,
      getShieldedAmount,
    } =
      createFixture(
        "shield",
      );

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
      await runtime
        .confirmSubmittedStage(
          plan,
          borrow.session,
          "borrow-1",
          context,
        );

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
  "Normal Borrow uses the same Agent runtime and completes after verification",
  async () => {
    const {
      plan,
      context,
      runtime,
    } =
      createFixture(
        "normal",
      );

    const session =
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

    assert.equal(
      borrow.session.run.status,
      "executing",
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
      confirmed.run.status,
      "completed",
    );

    assert.equal(
      confirmed.outputs[
        "borrow-1"
      ].amountText,
      "50",
    );
  },
);


test(
  "Unshield Borrow verifies public collateral before unlocking Borrow",
  async () => {
    const {
      plan,
      context,
      runtime,
      getUnshieldedAmount,
    } =
      createFixture(
        "unshield",
      );

    let session =
      createAgentExecutionSession(
        plan,
        context.runId,
      );

    assert.equal(
      getAgentRuntimeStage(
        session.run,
        "unshield-1",
      ).status,
      "review",
    );

    assert.equal(
      getAgentRuntimeStage(
        session.run,
        "borrow-2",
      ).status,
      "locked",
    );

    const unshield =
      await executeAgentStage(
        plan,
        session,
        "unshield-1",
        context,
        runtime.registry,
      );

    assert.equal(
      getUnshieldedAmount(),
      "500",
    );

    assert.equal(
      getAgentRuntimeStage(
        unshield.session.run,
        "borrow-2",
      ).status,
      "locked",
    );

    session =
      await runtime
        .confirmSubmittedStage(
          plan,
          unshield.session,
          "unshield-1",
          context,
        );

    assert.equal(
      session.outputs[
        "unshield-1"
      ].assetSymbol,
      "STRK",
    );

    assert.equal(
      session.outputs[
        "unshield-1"
      ].amountText,
      "500",
    );

    assert.equal(
      getAgentRuntimeStage(
        session.run,
        "borrow-2",
      ).status,
      "review",
    );

    const borrow =
      await executeAgentStage(
        plan,
        session,
        "borrow-2",
        context,
        runtime.registry,
      );

    session =
      await runtime
        .confirmSubmittedStage(
          plan,
          borrow.session,
          "borrow-2",
          context,
        );

    assert.equal(
      session.run.status,
      "completed",
    );
  },
);
