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


const executor =
  require(
    "../lib/agent/executor.ts",
  );

const machine =
  require(
    "../lib/agent/state-machine.ts",
  );

const {
  buildStarknetAgentPlan,
} = require(
  "../lib/agent/starknet-planner.ts",
);

const {
  STARKNET_MAINNET,
} = require(
  "../lib/carel/ecosystems/starknet/chains.ts",
);


const MAINNET =
  STARKNET_MAINNET.chainId;


function shieldBorrowPlan() {
  return buildStarknetAgentPlan({
    goal:
      "Borrow 50 USDC against 500 STRK but keep the result private.",

    chainId:
      MAINNET,

    mode:
      "normal",
  });
}


function context(
  runId = "run-1",
) {
  return {
    runId,

    chainId:
      MAINNET,

    account:
      "0x123",
  };
}


test(
  "Agent executor registry rejects duplicate ids",
  () => {
    const item = {
      id:
        "test",

      actions:
        ["borrow"],

      supports:
        () => true,

      execute:
        async () => ({
          transactionId:
            "0x1",

          status:
            "submitted",
        }),
    };

    assert.throws(
      () =>
        executor
          .createAgentStageExecutorRegistry([
            item,
            item,
          ]),
      /duplicate/i,
    );
  },
);


test(
  "confirmed Borrow with verified output unlocks Shield",
  async () => {
    const plan =
      shieldBorrowPlan();

    let session =
      executor
        .createAgentExecutionSession(
          plan,
          "run-1",
        );

    const registry =
      executor
        .createAgentStageExecutorRegistry([
          {
            id:
              "vesu",

            actions:
              ["borrow"],

            supports:
              () => true,

            review:
              async (input) => {
                assert.equal(
                  input.executionKey,
                  "run-1:borrow-1",
                );
              },

            execute:
              async () => ({
                transactionId:
                  "0x111",

                status:
                  "confirmed",

                output: {
                  assetSymbol:
                    "USDC",

                  amountText:
                    "50",

                  amountUnits:
                    "50000000",
                },
              }),
          },
        ]);

    const result =
      await executor
        .executeAgentStage(
          plan,
          session,
          "borrow-1",
          context(),
          registry,
        );

    session =
      result.session;

    assert.equal(
      result.needsOutputVerification,
      false,
    );

    assert.equal(
      machine
        .getAgentRuntimeStage(
          session.run,
          "borrow-1",
        )
        .status,
      "confirmed",
    );

    assert.equal(
      machine
        .getAgentRuntimeStage(
          session.run,
          "shield-2",
        )
        .status,
      "review",
    );

    assert.deepEqual(
      session.outputs[
        "borrow-1"
      ],
      {
        assetSymbol:
          "USDC",

        amountText:
          "50",

        amountUnits:
          "50000000",
      },
    );
  },
);


test(
  "Shield receives exact verified Borrow output",
  async () => {
    const plan =
      shieldBorrowPlan();

    let session =
      executor
        .createAgentExecutionSession(
          plan,
          "run-1",
        );

    const borrowRegistry =
      executor
        .createAgentStageExecutorRegistry([
          {
            id:
              "vesu",

            actions:
              ["borrow"],

            supports:
              () => true,

            execute:
              async () => ({
                transactionId:
                  "0x111",

                status:
                  "confirmed",

                output: {
                  assetSymbol:
                    "USDC",

                  amountText:
                    "49.75",

                  amountUnits:
                    "49750000",
                },
              }),
          },
        ]);

    session =
      (
        await executor
          .executeAgentStage(
            plan,
            session,
            "borrow-1",
            context(),
            borrowRegistry,
          )
      ).session;

    let receivedAmount =
      null;

    const shieldRegistry =
      executor
        .createAgentStageExecutorRegistry([
          {
            id:
              "strk20",

            actions:
              ["shield"],

            supports:
              () => true,

            execute:
              async (input) => {
                receivedAmount =
                  input
                    .resolvedAmountText;

                return {
                  transactionId:
                    "0x222",

                  status:
                    "confirmed",
                };
              },
          },
        ]);

    session =
      (
        await executor
          .executeAgentStage(
            plan,
            session,
            "shield-2",
            context(),
            shieldRegistry,
          )
      ).session;

    assert.equal(
      receivedAmount,
      "49.75",
    );

    assert.equal(
      session.run.status,
      "completed",
    );
  },
);


test(
  "confirmed transaction cannot unlock stage-output dependency without verified output",
  async () => {
    const plan =
      shieldBorrowPlan();

    const session =
      executor
        .createAgentExecutionSession(
          plan,
          "run-1",
        );

    const registry =
      executor
        .createAgentStageExecutorRegistry([
          {
            id:
              "vesu",

            actions:
              ["borrow"],

            supports:
              () => true,

            execute:
              async () => ({
                transactionId:
                  "0x111",

                status:
                  "confirmed",
              }),
          },
        ]);

    const result =
      await executor
        .executeAgentStage(
          plan,
          session,
          "borrow-1",
          context(),
          registry,
        );

    assert.equal(
      result
        .needsOutputVerification,
      true,
    );

    assert.equal(
      machine
        .getAgentRuntimeStage(
          result.session.run,
          "borrow-1",
        )
        .status,
      "submitted",
    );

    assert.equal(
      machine
        .getAgentRuntimeStage(
          result.session.run,
          "shield-2",
        )
        .status,
      "locked",
    );
  },
);


test(
  "later verified observation confirms Borrow and unlocks Shield",
  async () => {
    const plan =
      shieldBorrowPlan();

    let session =
      executor
        .createAgentExecutionSession(
          plan,
          "run-1",
        );

    const registry =
      executor
        .createAgentStageExecutorRegistry([
          {
            id:
              "vesu",

            actions:
              ["borrow"],

            supports:
              () => true,

            execute:
              async () => ({
                transactionId:
                  "0x111",

                status:
                  "submitted",
              }),
          },
        ]);

    session =
      (
        await executor
          .executeAgentStage(
            plan,
            session,
            "borrow-1",
            context(),
            registry,
          )
      ).session;

    session =
      executor
        .confirmAgentStageExecution(
          plan,
          session,
          "borrow-1",
          {
            assetSymbol:
              "USDC",

            amountText:
              "50",

            amountUnits:
              "50000000",
          },
        );

    assert.equal(
      machine
        .getAgentRuntimeStage(
          session.run,
          "shield-2",
        )
        .status,
      "review",
    );
  },
);


test(
  "wrong observed output asset fails closed",
  async () => {
    const plan =
      shieldBorrowPlan();

    let session =
      executor
        .createAgentExecutionSession(
          plan,
          "run-1",
        );

    const registry =
      executor
        .createAgentStageExecutorRegistry([
          {
            id:
              "vesu",

            actions:
              ["borrow"],

            supports:
              () => true,

            execute:
              async () => ({
                transactionId:
                  "0x111",

                status:
                  "submitted",
              }),
          },
        ]);

    session =
      (
        await executor
          .executeAgentStage(
            plan,
            session,
            "borrow-1",
            context(),
            registry,
          )
      ).session;

    assert.throws(
      () =>
        executor
          .confirmAgentStageExecution(
            plan,
            session,
            "borrow-1",
            {
              assetSymbol:
                "ETH",

              amountText:
                "50",
            },
          ),
      /expected USDC/i,
    );

    assert.equal(
      machine
        .getAgentRuntimeStage(
          session.run,
          "shield-2",
        )
        .status,
      "locked",
    );
  },
);


test(
  "locked dependent stage cannot execute",
  async () => {
    const plan =
      shieldBorrowPlan();

    const session =
      executor
        .createAgentExecutionSession(
          plan,
          "run-1",
        );

    const registry =
      executor
        .createAgentStageExecutorRegistry([
          {
            id:
              "strk20",

            actions:
              ["shield"],

            supports:
              () => true,

            execute:
              async () => ({
                transactionId:
                  "0x222",

                status:
                  "confirmed",
              }),
          },
        ]);

    await assert.rejects(
      () =>
        executor
          .executeAgentStage(
            plan,
            session,
            "shield-2",
            context(),
            registry,
          ),
      /not ready/i,
    );
  },
);


test(
  "all Starknet Agent stage actions share the generic executor contract",
  () => {
    const actions = [
      "swap",
      "bridge",
      "stake",
      "lend",
      "borrow",
      "shield",
      "unshield",
    ];

    const registry =
      executor
        .createAgentStageExecutorRegistry(
          actions.map(
            (action) => ({
              id:
                `executor:${action}`,

              actions:
                [action],

              supports:
                (input) =>
                  input.stage.action ===
                    action,

              execute:
                async () => ({
                  transactionId:
                    "0x1",

                  status:
                    "submitted",
                }),
            }),
          ),
        );

    assert.deepEqual(
      registry.map(
        (item) =>
          item.actions[0],
      ),
      actions,
    );
  },
);



test(
  "Agent executor accepts asynchronous provider order references",
  async () => {
    const base =
      shieldBorrowPlan();

    const plan = {
      ...base,

      objective: {
        ...base.objective,

        goal:
          "Bridge 0.0005 BTC to Starknet Sepolia.",

        tool:
          "Bridge",
      },

      stages: [
        {
          id:
            "bridge-1",

          action:
            "bridge",

          sourceChainId:
            MAINNET,

          destinationChainId:
            "bitcoin:testnet4",

          inputAssetSymbol:
            "BTC",

          outputAssetSymbol:
            "WBTC",

          amount: {
            kind:
              "exact",

            amountText:
              "0.0005",
          },

          privacyBefore:
            "public",

          privacyAfter:
            "public",

          dependsOn: [],

          status:
            "planned",
        },
      ],
    };

    let session =
      executor
        .createAgentExecutionSession(
          plan,
          "bridge-run",
        );

    const registry =
      executor
        .createAgentStageExecutorRegistry([
          {
            id:
              "garden",

            actions:
              ["bridge"],

            supports:
              () => true,

            execute:
              async () => ({
                executionReference: {
                  kind:
                    "provider-order",

                  id:
                    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
                },

                status:
                  "submitted",
              }),
          },
        ]);

    session =
      (
        await executor
          .executeAgentStage(
            plan,
            session,
            "bridge-1",
            {
              runId:
                session.runId,

              chainId:
                MAINNET,

              account:
                "0x123",
            },
            registry,
          )
      ).session;

    const stage =
      machine
        .getAgentRuntimeStage(
          session.run,
          "bridge-1",
        );

    assert.deepEqual(
      stage.executionReference,
      {
        kind:
          "provider-order",

        id:
          "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      },
    );

    assert.equal(
      stage.txHash,
      undefined,
    );

    assert.equal(
      stage.status,
      "submitted",
    );
  },
);


test(
  "browser Agent execution fails closed without fee-policy authorization",
  () => {
    const previousWindow =
      global.window;


    global.window = {};


    try {
      assert.throws(
        () =>
          executor
            .createAgentExecutionSession(
              shieldBorrowPlan(),
              "browser-run",
            ),
        /fee-policy authorization/i,
      );
    } finally {
      if (
        previousWindow ===
          undefined
      ) {
        delete global.window;
      } else {
        global.window =
          previousWindow;
      }
    }
  },
);


test(
  "opaque fee authorization is bound to the exact Agent run and plan",
  async () => {
    const feeGate =
      require(
        "../lib/agent/client-fee-gate.ts",
      );


    const firstPlan =
      shieldBorrowPlan();


    const coordinator =
      feeGate
        .createAgentFeeGateCoordinator({
          async httpClient() {
            return {
              ok:
                true,

              status:
                200,

              async json() {
                return {
                  enabled:
                    false,
                };
              },
            };
          },
        });


    const gate =
      await coordinator
        .prepare(
          firstPlan,
          {
            prefix:
              "borrow",

            chainId:
              MAINNET,

            payer:
              "0x123",

            async executeAgentFee() {
              throw new Error(
                "disabled fee policy must not call wallet",
              );
            },
          },
        );


    const previousWindow =
      global.window;


    global.window = {};


    try {
      const session =
        executor
          .createAgentExecutionSession(
            firstPlan,
            gate.runId,
            gate.authorization,
          );


      assert.equal(
        session.runId,
        gate.runId,
      );


      assert.throws(
        () =>
          executor
            .createAgentExecutionSession(
              {
                ...firstPlan,

                objective: {
                  ...firstPlan
                    .objective,

                  goal:
                    "tampered goal",
                },
              },
              gate.runId,
              gate.authorization,
            ),
        /another Agent plan/i,
      );


      assert.throws(
        () =>
          executor
            .createAgentExecutionSession(
              firstPlan,
              "another-run",
              gate.authorization,
            ),
        /another execution run/i,
      );
    } finally {
      if (
        previousWindow ===
          undefined
      ) {
        delete global.window;
      } else {
        global.window =
          previousWindow;
      }
    }
  },
);
