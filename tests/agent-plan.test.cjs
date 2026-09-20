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


const planner =
  require(
    "../lib/agent/starknet-planner.ts",
  );

const chains =
  require(
    "../lib/carel/ecosystems/starknet/chains.ts",
  );


const MAINNET =
  chains
    .STARKNET_MAINNET
    .chainId;


test(
  "Starknet Agent builds a single-stage public Borrow plan",
  () => {
    const plan =
      planner
        .buildStarknetAgentPlan({
          goal:
            "Borrow 50 USDC against 500 STRK.",

          chainId:
            MAINNET,

          mode:
            "normal",
        });

    assert.equal(
      plan.status,
      "ready",
    );

    assert.equal(
      plan.stages.length,
      1,
    );

    assert.equal(
      plan.stages[0].action,
      "borrow",
    );

    assert.equal(
      plan.stages[0]
        .privacyAfter,
      "public",
    );

    assert.deepEqual(
      plan.agentFee,
      {
        status:
          "pending-policy",

        scope:
          "plan",

        chargeModel:
          "once-per-plan",

        reason:
          "agent-execution",
      },
    );
  },
);


test(
  "privacy language overrides Normal mode and creates Shield Borrow stages",
  () => {
    const plan =
      planner
        .buildStarknetAgentPlan({
          goal:
            "Borrow 50 USDC against 500 STRK but keep the result private.",

          chainId:
            MAINNET,

          mode:
            "normal",
        });

    assert.equal(
      plan.objective.mode,
      "shield",
    );

    assert.deepEqual(
      plan.stages.map(
        (stage) =>
          stage.action,
      ),
      [
        "borrow",
        "shield",
      ],
    );

    assert.deepEqual(
      plan.stages[1]
        .dependsOn,
      [
        "borrow-1",
      ],
    );

    assert.deepEqual(
      plan.stages[1]
        .amount,
      {
        kind:
          "stage-output",

        stageId:
          "borrow-1",
      },
    );
  },
);


test(
  "Unshield Borrow plans collateral release before fresh Borrow",
  () => {
    const plan =
      planner
        .buildStarknetAgentPlan({
          goal:
            "Borrow 50 USDC against 500 STRK.",

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
        "borrow",
      ],
    );

    assert.deepEqual(
      plan.stages[1]
        .dependsOn,
      [
        "unshield-1",
      ],
    );
  },
);


test(
  "Shield Lend is represented as a private lending result",
  () => {
    const plan =
      planner
        .buildStarknetAgentPlan({
          goal:
            "Lend 100 USDC privately.",

          chainId:
            MAINNET,

          mode:
            "normal",
        });

    assert.equal(
      plan.objective.mode,
      "shield",
    );

    assert.equal(
      plan.stages.length,
      1,
    );

    assert.equal(
      plan.stages[0].action,
      "lend",
    );

    assert.equal(
      plan.stages[0]
        .privacyBefore,
      "public",
    );

    assert.equal(
      plan.stages[0]
        .privacyAfter,
      "private",
    );
  },
);


test(
  "Shield Swap waits for confirmed Swap output before Shield",
  () => {
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

    assert.deepEqual(
      plan.stages.map(
        (stage) =>
          stage.action,
      ),
      [
        "swap",
        "shield",
      ],
    );

    assert.deepEqual(
      plan.stages[1]
        .amount,
      {
        kind:
          "stage-output",

        stageId:
          "swap-1",
      },
    );
  },
);


test(
  "unknown free-form goals do not become executable Balance plans",
  () => {
    const plan =
      planner
        .buildStarknetAgentPlan({
          goal:
            "Make my portfolio better.",

          chainId:
            MAINNET,

          mode:
            "normal",
        });

    assert.equal(
      plan.status,
      "needs-input",
    );

    assert.equal(
      plan.stages.length,
      0,
    );
  },
);


test(
  "Starknet Agent Core fails closed on a non-Starknet chain",
  () => {
    const plan =
      planner
        .buildStarknetAgentPlan({
          goal:
            "Swap 1 ETH for USDC.",

          chainId:
            "eip155:1",

          mode:
            "normal",
        });

    assert.equal(
      plan.status,
      "blocked",
    );

    assert.equal(
      plan.stages.length,
      0,
    );
  },
);
