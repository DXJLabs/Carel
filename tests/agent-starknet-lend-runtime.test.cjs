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

const lend =
  require(
    "../lib/agent/starknet-lend-runtime.ts",
  );

const vesu =
  require(
    "../lib/carel/ecosystems/starknet/protocols/vesu/lending.ts",
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


function asset(
  symbol =
    "USDC",
) {
  const value =
    vesu
      .getVesuLendAssetBySymbol(
        symbol,
      );

  assert.ok(
    value,
  );

  return value;
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
  exposeShares =
    true,
} = {}) {
  const USDC =
    asset(
      "USDC",
    );


  let publicBalance =
    1000n *
    10n **
      BigInt(
        USDC.decimals,
      );


  let shares =
    500n *
    10n **
      BigInt(
        USDC.decimals,
      );


  let tx =
    1;


  let shieldCalls =
    0;


  const runtime =
    lend
      .createStarknetLendRuntime({
        async preparePublicLend(
          input,
        ) {
          assert.equal(
            input.assetId,
            USDC.id,
          );


          const amountUnits =
            amounts.parseUnits(
              input.amountText,
              USDC.decimals,
            );


          return {
            label:
              "Vesu USDC Lend",

            assetId:
              USDC.id,

            assetSymbol:
              USDC.symbol,

            decimals:
              USDC.decimals,

            amountUnits,

            async readPositionShares() {
              return shares;
            },

            async execute() {
              if (
                exposeShares
              ) {
                shares +=
                  amountUnits;
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


        async prepareShieldLend(
          input,
        ) {
          const amountUnits =
            amounts.parseUnits(
              input.amountText,
              USDC.decimals,
            );


          return {
            label:
              "Shield Vesu USDC Lend",

            assetId:
              USDC.id,

            assetSymbol:
              USDC.symbol,

            decimals:
              USDC.decimals,

            amountUnits,

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
            USDC.id,
          );


          publicBalance +=
            amounts.parseUnits(
              amountText,
              USDC.decimals,
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


        async readPublicBalance(
          input,
        ) {
          assert.equal(
            input.assetId,
            USDC.id,
          );


          return publicBalance;
        },


        async waitForTransaction() {
          // Test transaction is confirmed.
        },
      });


  return {
    runtime,

    getShares:
      () => shares,

    getShieldCalls:
      () => shieldCalls,
  };
}


test(
  "Normal multi-asset Vesu Lend verifies public vToken position before completing",
  async () => {
    const {
      runtime,
    } =
      createRuntime();


    const plan =
      planner
        .buildStarknetAgentPlan({
          goal:
            "Lend 10 USDC.",

          chainId:
            MAINNET,

          mode:
            "normal",
        });


    let session =
      executor
        .createAgentExecutionSession(
          plan,
          "lend-normal",
        );


    session =
      (
        await executor
          .executeAgentStage(
            plan,
            session,
            "lend-1",
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
          "lend-1",
        )
        .status,
      "submitted",
    );


    session =
      await runtime
        .confirmSubmittedStage(
          plan,
          session,
          "lend-1",
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
  "Shield Lend stays one private-receipt Vesu stage",
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
            "Lend 10 USDC.",

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
      "lend",
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
          "lend-shield",
        );


    session =
      (
        await executor
          .executeAgentStage(
            plan,
            session,
            "lend-1",
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
          "lend-1",
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
  "Unshield Lend verifies public underlying before unlocking fresh Vesu Lend",
  async () => {
    const {
      runtime,
    } =
      createRuntime();


    const plan =
      planner
        .buildStarknetAgentPlan({
          goal:
            "Lend 10 USDC.",

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
        "lend",
      ],
    );


    let session =
      executor
        .createAgentExecutionSession(
          plan,
          "lend-unshield",
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
          "lend-2",
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
      "USDC",
    );


    assert.equal(
      machine
        .getAgentRuntimeStage(
          session.run,
          "lend-2",
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
            "lend-2",
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
          "lend-2",
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
  "Vesu Lend remains submitted when public vToken position is not observable",
  async () => {
    const {
      runtime,
    } =
      createRuntime({
        exposeShares:
          false,
      });


    const plan =
      planner
        .buildStarknetAgentPlan({
          goal:
            "Lend 10 USDC.",

          chainId:
            MAINNET,

          mode:
            "normal",
        });


    let session =
      executor
        .createAgentExecutionSession(
          plan,
          "lend-rpc-lag",
        );


    session =
      (
        await executor
          .executeAgentStage(
            plan,
            session,
            "lend-1",
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
            "lend-1",
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
          "lend-1",
        )
        .status,
      "submitted",
    );
  },
);
