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

const swapRuntime =
  require(
    "../lib/agent/starknet-swap-runtime.ts",
  );

const assets =
  require(
    "../lib/carel/assets.ts",
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
  symbol,
) {
  const found =
    assets
      .findCarelAssetBySymbol(
        MAINNET,
        symbol,
      );

  assert.ok(
    found,
    `Missing test asset ${symbol}`,
  );

  return found;
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
  swapOutputUnits =
    9_750_000n,

  minimumOutputUnits =
    9_000_000n,

  exposeSwapOutput =
    true,
} = {}) {
  const STRK =
    asset("STRK");

  const USDC =
    asset("USDC");

  const balances =
    new Map([
      [
        STRK.id,
        1_000n *
          10n ** 18n,
      ],
      [
        USDC.id,
        100_000_000n,
      ],
    ]);

  const shielded = [];

  let txCounter =
    1;

  const runtime =
    swapRuntime
      .createStarknetSwapRuntime({
        async prepareSwap(
          input,
        ) {
          assert.equal(
            input.chainId,
            MAINNET,
          );

          assert.ok(
            input.executionKey,
          );

          const toAsset =
            input.toAssetId ===
              USDC.id
              ? USDC
              : STRK;

          return {
            label:
              "AVNU test swap",

            outputAssetId:
              toAsset.id,

            outputAssetSymbol:
              toAsset.symbol,

            outputDecimals:
              toAsset.decimals,

            minimumOutputUnits,

            async execute() {
              const hash =
                `0x${(
                  txCounter++
                ).toString(16)}`;

              if (
                exposeSwapOutput
              ) {
                balances.set(
                  toAsset.id,
                  (
                    balances.get(
                      toAsset.id,
                    ) ??
                    0n
                  ) +
                    swapOutputUnits,
                );
              }

              return {
                hash,
                status:
                  "confirmed",
              };
            },
          };
        },

        async executeShieldAsset(
          assetId,
          amountText,
        ) {
          shielded.push({
            assetId,
            amountText,
          });

          return {
            hash:
              `0x${(
                txCounter++
              ).toString(16)}`,

            status:
              "confirmed",
          };
        },

        async executeUnshieldAsset(
          assetId,
          amountText,
        ) {
          const target =
            [
              STRK,
              USDC,
            ].find(
              (item) =>
                item.id ===
                  assetId,
            );

          assert.ok(
            target,
          );

          const units =
            require(
              "../lib/carel/core/amounts.ts"
            ).parseUnits(
              amountText,
              target.decimals,
            );

          balances.set(
            target.id,
            (
              balances.get(
                target.id,
              ) ??
              0n
            ) +
              units,
          );

          return {
            hash:
              `0x${(
                txCounter++
              ).toString(16)}`,

            status:
              "confirmed",
          };
        },

        async readPublicBalance(
          input,
        ) {
          return (
            balances.get(
              input.assetId,
            ) ??
            0n
          );
        },

        async waitForTransaction() {
          // Confirmed test receipt.
        },
      });

  return {
    runtime,
    balances,
    shielded,
    STRK,
    USDC,
  };
}


test(
  "Normal Swap records submitted before verifying actual public output",
  async () => {
    const {
      runtime,
    } =
      createRuntime();

    const plan =
      planner
        .buildStarknetAgentPlan({
          goal:
            "Swap 10 STRK for USDC.",

          chainId:
            MAINNET,

          mode:
            "normal",
        });

    let session =
      executor
        .createAgentExecutionSession(
          plan,
          "swap-normal",
        );

    const executed =
      await executor
        .executeAgentStage(
          plan,
          session,
          "swap-1",
          context(
            session.runId,
          ),
          runtime.registry,
        );

    session =
      executed.session;

    assert.equal(
      machine
        .getAgentRuntimeStage(
          session.run,
          "swap-1",
        )
        .status,
      "submitted",
    );

    session =
      await runtime
        .confirmSubmittedStage(
          plan,
          session,
          "swap-1",
          context(
            session.runId,
          ),
        );

    assert.equal(
      session.run.status,
      "completed",
    );

    assert.equal(
      session
        .outputs["swap-1"]
        .assetSymbol,
      "USDC",
    );

    assert.equal(
      session
        .outputs["swap-1"]
        .amountText,
      "9.75",
    );
  },
);


test(
  "Shield Swap consumes only verified actual Swap output",
  async () => {
    const {
      runtime,
      shielded,
      USDC,
    } =
      createRuntime({
        swapOutputUnits:
          9_625_000n,
      });

    const plan =
      planner
        .buildStarknetAgentPlan({
          goal:
            "Swap 10 STRK for USDC and keep it private.",

          chainId:
            MAINNET,

          mode:
            "normal",
        });

    let session =
      executor
        .createAgentExecutionSession(
          plan,
          "swap-shield",
        );

    session =
      (
        await executor
          .executeAgentStage(
            plan,
            session,
            "swap-1",
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
          "shield-2",
        )
        .status,
      "locked",
    );

    session =
      await runtime
        .confirmSubmittedStage(
          plan,
          session,
          "swap-1",
          context(
            session.runId,
          ),
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

    assert.equal(
      session
        .outputs["swap-1"]
        .amountText,
      "9.625",
    );

    session =
      (
        await executor
          .executeAgentStage(
            plan,
            session,
            "shield-2",
            context(
              session.runId,
            ),
            runtime.registry,
          )
      ).session;

    assert.deepEqual(
      shielded,
      [
        {
          assetId:
            USDC.id,

          amountText:
            "9.625",
        },
      ],
    );

    assert.equal(
      session.run.status,
      "completed",
    );
  },
);


test(
  "Unshield Swap verifies public input before unlocking AVNU Swap",
  async () => {
    const {
      runtime,
    } =
      createRuntime();

    const plan =
      planner
        .buildStarknetAgentPlan({
          goal:
            "Swap 10 STRK for USDC.",

          chainId:
            MAINNET,

          mode:
            "unshield",
        });

    let session =
      executor
        .createAgentExecutionSession(
          plan,
          "swap-unshield",
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
          "swap-2",
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
          "swap-2",
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
            "swap-2",
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
          "swap-2",
          context(
            session.runId,
          ),
        );

    assert.equal(
      session.run.status,
      "completed",
    );

    assert.equal(
      session
        .outputs["swap-2"]
        .assetSymbol,
      "USDC",
    );
  },
);


test(
  "Swap confirmation fails closed when quoted output is not visible",
  async () => {
    const {
      runtime,
    } =
      createRuntime({
        exposeSwapOutput:
          false,
      });

    const plan =
      planner
        .buildStarknetAgentPlan({
          goal:
            "Swap 10 STRK for USDC.",

          chainId:
            MAINNET,

          mode:
            "normal",
        });

    let session =
      executor
        .createAgentExecutionSession(
          plan,
          "swap-lag",
        );

    session =
      (
        await executor
          .executeAgentStage(
            plan,
            session,
            "swap-1",
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
            "swap-1",
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
          "swap-1",
        )
        .status,
      "submitted",
    );
  },
);
