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
    "../lib/agent/starknet-planner.ts",
  );

const executor =
  require(
    "../lib/agent/executor.ts",
  );

const machine =
  require(
    "../lib/agent/state-machine.ts",
  );

const staking =
  require(
    "../lib/agent/starknet-staking-runtime.ts",
  );

const assets =
  require(
    "../lib/carel/assets.ts",
  );

const amounts =
  require(
    "../lib/carel/core/amounts.ts",
  );

const chains =
  require(
    "../lib/carel/ecosystems/starknet/chains.ts",
  );


const MAINNET =
  chains
    .STARKNET_MAINNET
    .chainId;


function strk() {
  const asset =
    assets
      .findCarelAssetBySymbol(
        MAINNET,
        "STRK",
      );

  assert.ok(
    asset,
  );

  return asset;
}


function context(
  runId,
) {
  return {
    runId,

    chainId:
      MAINNET,

    account:
      "0x123",
  };
}


function createRuntime({
  exposeStake =
    true,

  recovery =
    undefined,
} = {}) {
  const STRK =
    strk();

  const ten =
    amounts.parseUnits(
      "10",
      STRK.decimals,
    );

  let publicBalance =
    100n *
    10n ** 18n;

  let position =
    25n *
    10n ** 18n;

  let tx =
    1;

  let shieldCalls =
    0;


  const runtime =
    staking
      .createStarknetStakingRuntime({
        ...(recovery
          ? {
              recovery,
            }
          : {}),

        async preparePublicStake(
          input,
        ) {
          assert.equal(
            input.assetId,
            STRK.id,
          );

          return {
            label:
              "Stake STRK",

            assetId:
              STRK.id,

            assetSymbol:
              STRK.symbol,

            decimals:
              STRK.decimals,

            amountUnits:
              amounts
                .parseUnits(
                  input.amountText,
                  STRK.decimals,
                ),

            async readPosition() {
              return position;
            },

            async execute() {
              if (
                exposeStake
              ) {
                position +=
                  amounts
                    .parseUnits(
                      input.amountText,
                      STRK.decimals,
                    );
              }

              return {
                hash:
                  `0x${(
                    tx++
                  ).toString(16)}`,

                status:
                  "confirmed",
              };
            },
          };
        },

        async prepareShieldStake() {
          return {
            label:
              "Shield Stake",

            async execute() {
              shieldCalls++;

              return {
                hash:
                  `0x${(
                    tx++
                  ).toString(16)}`,

                status:
                  "confirmed",
              };
            },
          };
        },

        async executeUnshieldAsset(
          assetId,
          amountText,
        ) {
          assert.equal(
            assetId,
            STRK.id,
          );

          publicBalance +=
            amounts
              .parseUnits(
                amountText,
                STRK.decimals,
              );

          return {
            hash:
              `0x${(
                tx++
              ).toString(16)}`,

            status:
              "confirmed",
          };
        },

        async readPublicStakePosition(
          input,
        ) {
          assert.equal(
            input.assetId,
            STRK.id,
          );


          return position;
        },


        async readPublicBalance(
          input,
        ) {
          assert.equal(
            input.assetId,
            STRK.id,
          );

          return publicBalance;
        },

        async waitForTransaction() {
          // Confirmed test receipt.
        },
      });


  return {
    runtime,
    STRK,
    ten,
    getPosition:
      () => position,
    getShieldCalls:
      () => shieldCalls,
  };
}


test(
  "Normal Staking stays submitted until the public position increase is verified",
  async () => {
    const {
      runtime,
    } =
      createRuntime();

    const plan =
      planner
        .buildStarknetAgentPlan({
          goal:
            "Stake 10 STRK.",

          chainId:
            MAINNET,

          mode:
            "normal",
        });


    let session =
      executor
        .createAgentExecutionSession(
          plan,
          "stake-normal",
        );


    session =
      (
        await executor
          .executeAgentStage(
            plan,
            session,
            "stake-1",
            context(
              session.runId,
            ),
            runtime.registry,
          )
      ).session;


    assert.equal(
      machine
        .getAgentRuntimeStage(
          session.run,
          "stake-1",
        )
        .status,
      "submitted",
    );


    session =
      await runtime
        .confirmSubmittedStage(
          plan,
          session,
          "stake-1",
          context(
            session.runId,
          ),
        );


    assert.equal(
      session.run.status,
      "completed",
    );
  },
);


test(
  "Shield Staking remains one private-receipt Stake stage",
  async () => {
    const {
      runtime,
      getShieldCalls,
    } =
      createRuntime();


    const plan =
      planner
        .buildStarknetAgentPlan({
          goal:
            "Stake 10 STRK.",

          chainId:
            MAINNET,

          mode:
            "shield",
        });


    assert.equal(
      plan.stages.length,
      1,
    );

    assert.equal(
      plan.stages[0]
        .action,
      "stake",
    );

    assert.equal(
      plan.stages[0]
        .privacyAfter,
      "private",
    );


    let session =
      executor
        .createAgentExecutionSession(
          plan,
          "stake-shield",
        );


    session =
      (
        await executor
          .executeAgentStage(
            plan,
            session,
            "stake-1",
            context(
              session.runId,
            ),
            runtime.registry,
          )
      ).session;


    assert.equal(
      getShieldCalls(),
      1,
    );


    session =
      await runtime
        .confirmSubmittedStage(
          plan,
          session,
          "stake-1",
          context(
            session.runId,
          ),
        );


    assert.equal(
      session.run.status,
      "completed",
    );
  },
);


test(
  "Unshield Staking withdraws private STRK before public Stake unlocks",
  async () => {
    const {
      runtime,
    } =
      createRuntime();


    const plan =
      planner
        .buildStarknetAgentPlan({
          goal:
            "Stake 10 STRK.",

          chainId:
            MAINNET,

          mode:
            "unshield",
        });


    assert.deepEqual(
      plan.stages.map(
        (stage) =>
          stage.action,
      ),
      [
        "unshield",
        "stake",
      ],
    );


    let session =
      executor
        .createAgentExecutionSession(
          plan,
          "stake-unshield",
        );


    session =
      (
        await executor
          .executeAgentStage(
            plan,
            session,
            "unshield-1",
            context(
              session.runId,
            ),
            runtime.registry,
          )
      ).session;


    assert.equal(
      machine
        .getAgentRuntimeStage(
          session.run,
          "stake-2",
        )
        .status,
      "locked",
    );


    session =
      await runtime
        .confirmSubmittedStage(
          plan,
          session,
          "unshield-1",
          context(
            session.runId,
          ),
        );


    assert.equal(
      session
        .outputs[
          "unshield-1"
        ]
        .assetSymbol,
      "STRK",
    );


    assert.equal(
      machine
        .getAgentRuntimeStage(
          session.run,
          "stake-2",
        )
        .status,
      "review",
    );


    session =
      (
        await executor
          .executeAgentStage(
            plan,
            session,
            "stake-2",
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
          "stake-2",
          context(
            session.runId,
          ),
        );


    assert.equal(
      session.run.status,
      "completed",
    );
  },
);


test(
  "public Stake confirmation fails closed while position increase is not visible",
  async () => {
    const {
      runtime,
    } =
      createRuntime({
        exposeStake:
          false,
      });


    const plan =
      planner
        .buildStarknetAgentPlan({
          goal:
            "Stake 10 STRK.",

          chainId:
            MAINNET,

          mode:
            "normal",
        });


    let session =
      executor
        .createAgentExecutionSession(
          plan,
          "stake-rpc-lag",
        );


    session =
      (
        await executor
          .executeAgentStage(
            plan,
            session,
            "stake-1",
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
            "stake-1",
            context(
              session.runId,
            ),
          ),
      /not visible/i,
    );


    assert.equal(
      machine
        .getAgentRuntimeStage(
          session.run,
          "stake-1",
        )
        .status,
      "submitted",
    );
  },
);


test(
  "public Stake restores signed position baseline after reload",
  async () => {
    const runId =
      "stake-recovered";

    const stageId =
      "stake-1";


    const recovery = {
      async seal() {
        return null;
      },


      async bind() {},


      async load() {
        return {
          version:
            1,

          kind:
            "staking",

          runId,

          stageId,

          executionKey:
            `${runId}:${stageId}`,

          chainId:
            MAINNET,

          account:
            "0x123",

          data: {
            action:
              "stake",

            kind:
              "public-stake",

            assetId:
              strk().id,

            amountUnits:
              (
                10n *
                10n ** 18n
              ).toString(),

            /*
             * createRuntime() current position = 25 STRK.
             * Baseline 15 + exact 10 increase must verify.
             */
            positionBefore:
              (
                15n *
                10n ** 18n
              ).toString(),
          },

          issuedAt:
            Date.now() -
            1000,

          expiresAt:
            Date.now() +
            60_000,

          transactionId:
            "0xabc",
        };
      },
    };


    const {
      runtime,
    } =
      createRuntime({
        recovery,
      });


    const plan =
      planner
        .buildStarknetAgentPlan({
          goal:
            "Stake 10 STRK.",

          chainId:
            MAINNET,

          mode:
            "normal",
        });


    let session =
      executor
        .restoreSubmittedAgentExecutionSession(
          plan,
          runId,
          stageId,
          {
            kind:
              "transaction",

            id:
              "0xabc",
          },
        );


    session =
      await runtime
        .confirmSubmittedStage(
          plan,
          session,
          stageId,
          context(
            runId,
          ),
        );


    assert.equal(
      session.run.status,
      "completed",
    );
  },
);


test(
  "Unshield Staking restores signed public balance baseline after reload",
  async () => {
    const STRK =
      strk();


    const runId =
      "stake-unshield-recovered";

    const stageId =
      "unshield-1";

    const amountUnits =
      10n *
      10n ** 18n;


    const recovery = {
      async seal() {
        return null;
      },


      async bind() {},


      async load() {
        return {
          version:
            1,

          kind:
            "staking",

          runId,

          stageId,

          executionKey:
            `${runId}:${stageId}`,

          chainId:
            MAINNET,

          account:
            "0x123",

          data: {
            action:
              "unshield",

            assetId:
              STRK.id,

            assetSymbol:
              STRK.symbol,

            decimals:
              STRK.decimals
                .toString(),

            /*
             * createRuntime() current public balance = 100 STRK.
             */
            publicBefore:
              (
                90n *
                10n ** 18n
              ).toString(),

            amountUnits:
              amountUnits
                .toString(),
          },

          issuedAt:
            Date.now() -
            1000,

          expiresAt:
            Date.now() +
            60_000,

          transactionId:
            "0xdef",
        };
      },
    };


    const {
      runtime,
    } =
      createRuntime({
        recovery,
      });


    const plan =
      planner
        .buildStarknetAgentPlan({
          goal:
            "Stake 10 STRK.",

          chainId:
            MAINNET,

          mode:
            "unshield",
        });


    let session =
      executor
        .restoreSubmittedAgentExecutionSession(
          plan,
          runId,
          stageId,
          {
            kind:
              "transaction",

            id:
              "0xdef",
          },
        );


    session =
      await runtime
        .confirmSubmittedStage(
          plan,
          session,
          stageId,
          context(
            runId,
          ),
        );


    assert.equal(
      machine
        .getAgentRuntimeStage(
          session.run,
          "unshield-1",
        ).status,
      "confirmed",
    );


    assert.equal(
      machine
        .getAgentRuntimeStage(
          session.run,
          "stake-2",
        ).status,
      "review",
    );


    assert.equal(
      session.outputs[
        "unshield-1"
      ].amountText,
      "10",
    );
  },
);
