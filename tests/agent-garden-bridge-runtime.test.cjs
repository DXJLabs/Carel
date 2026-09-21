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


const planner =
  require(
    "../lib/agent/bridge-planner.ts",
  );

const executor =
  require(
    "../lib/agent/executor.ts",
  );

const machine =
  require(
    "../lib/agent/state-machine.ts",
  );

const garden =
  require(
    "../lib/agent/garden-bridge-runtime.ts",
  );

const bitcoin =
  require(
    "../lib/carel/ecosystems/bitcoin/chains.ts",
  );

const starknet =
  require(
    "../lib/carel/ecosystems/starknet/chains.ts",
  );


const BTC =
  bitcoin
    .BITCOIN_TESTNET4
    .chainId;

const SEPOLIA =
  starknet
    .STARKNET_SEPOLIA
    .chainId;

const ORDER =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";


function incomingPlan() {
  return planner
    .buildBridgeAgentPlan({
      goal:
        "Bridge 0.0005 BTC to Starknet Sepolia.",

      connectedChainId:
        SEPOLIA,

      sourceChainId:
        BTC,

      destinationChainId:
        SEPOLIA,

      sourceAssetSymbol:
        "BTC",

      destinationAssetSymbol:
        "WBTC",

      amountText:
        "0.0005",

      mode:
        "normal",
    });
}


function context(
  runId,
) {
  return {
    runId,

    chainId:
      SEPOLIA,

    account:
      "0x123",
  };
}


test(
  "Bridge planner preserves real source and destination chains",
  () => {
    const plan =
      incomingPlan();

    assert.equal(
      plan.status,
      "ready",
    );

    assert.equal(
      plan.objective
        .chainId,
      SEPOLIA,
    );

    assert.equal(
      plan.stages[0]
        .sourceChainId,
      BTC,
    );

    assert.equal(
      plan.stages[0]
        .destinationChainId,
      SEPOLIA,
    );

    assert.equal(
      plan.stages[0]
        .action,
      "bridge",
    );
  },
);


test(
  "incoming BTC bridge may execute from the connected destination wallet",
  async () => {
    const plan =
      incomingPlan();

    let observed =
      null;

    const runtime =
      garden
        .createGardenBridgeAgentRuntime({
          async createOrder(
            input,
          ) {
            observed =
              input;

            return {
              orderId:
                ORDER,
            };
          },

          async readOrder() {
            return {
              state:
                "awaiting-deposit",
            };
          },
        });

    let session =
      executor
        .createAgentExecutionSession(
          plan,
          "garden-incoming",
        );

    session =
      (
        await executor
          .executeAgentStage(
            plan,
            session,
            "bridge-1",
            context(
              session.runId,
            ),
            runtime.registry,
          )
      ).session;

    const stage =
      machine
        .getAgentRuntimeStage(
          session.run,
          "bridge-1",
        );

    assert.equal(
      observed.sourceChainId,
      BTC,
    );

    assert.equal(
      observed.destinationChainId,
      SEPOLIA,
    );

    assert.deepEqual(
      stage.executionReference,
      {
        kind:
          "provider-order",

        id:
          ORDER,
      },
    );

    assert.equal(
      stage.txHash,
      undefined,
    );
  },
);


test(
  "Garden Bridge remains submitted until destination delivery is verified",
  async () => {
    const plan =
      incomingPlan();

    let state =
      "confirming";

    const runtime =
      garden
        .createGardenBridgeAgentRuntime({
          async createOrder() {
            return {
              orderId:
                ORDER,
            };
          },

          async readOrder() {
            if (
              state ===
                "completed"
            ) {
              return {
                state,

                destinationAssetSymbol:
                  "WBTC",

                destinationAmountText:
                  "0.00049",
              };
            }

            return {
              state,
            };
          },
        });

    let session =
      executor
        .createAgentExecutionSession(
          plan,
          "garden-confirm",
        );

    session =
      (
        await executor
          .executeAgentStage(
            plan,
            session,
            "bridge-1",
            context(
              session.runId,
            ),
            runtime.registry,
          )
      ).session;

    await assert.rejects(
      () =>
        runtime
          .confirmSubmittedStage(
            plan,
            session,
            "bridge-1",
            context(
              session.runId,
            ),
          ),
      /still confirming/i,
    );

    assert.equal(
      machine
        .getAgentRuntimeStage(
          session.run,
          "bridge-1",
        )
        .status,
      "submitted",
    );

    state =
      "completed";

    session =
      await runtime
        .confirmSubmittedStage(
          plan,
          session,
          "bridge-1",
          context(
            session.runId,
          ),
        );

    assert.equal(
      session.run.status,
      "completed",
    );

    assert.deepEqual(
      session
        .outputs["bridge-1"],
      {
        assetSymbol:
          "WBTC",

        amountText:
          "0.00049",
      },
    );
  },
);


test(
  "refunded Garden order fails the Bridge Agent run",
  async () => {
    const plan =
      incomingPlan();

    const runtime =
      garden
        .createGardenBridgeAgentRuntime({
          async createOrder() {
            return {
              orderId:
                ORDER,
            };
          },

          async readOrder() {
            return {
              state:
                "refunded",
            };
          },
        });

    let session =
      executor
        .createAgentExecutionSession(
          plan,
          "garden-refund",
        );

    session =
      (
        await executor
          .executeAgentStage(
            plan,
            session,
            "bridge-1",
            context(
              session.runId,
            ),
            runtime.registry,
          )
      ).session;

    session =
      await runtime
        .confirmSubmittedStage(
          plan,
          session,
          "bridge-1",
          context(
            session.runId,
          ),
        );

    assert.equal(
      session.run.status,
      "failed",
    );

    assert.match(
      machine
        .getAgentRuntimeStage(
          session.run,
          "bridge-1",
        )
        .error,
      /refunded/i,
    );
  },
);
