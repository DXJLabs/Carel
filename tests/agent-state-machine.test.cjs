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


const {
  buildStarknetAgentPlan,
} = require(
  "../lib/agent/starknet-planner.ts",
);

const machine =
  require(
    "../lib/agent/state-machine.ts",
  );

const {
  STARKNET_MAINNET,
} = require(
  "../lib/carel/ecosystems/starknet/chains.ts",
);


const plan =
  buildStarknetAgentPlan({
    goal:
      "Borrow 50 USDC against 500 STRK but keep the result private.",

    chainId:
      STARKNET_MAINNET.chainId,

    mode:
      "normal",
  });


test(
  "Agent run exposes only dependency-free stage for review",
  () => {
    const run =
      machine.createAgentRun(
        plan,
      );

    assert.equal(
      run.status,
      "review",
    );

    assert.equal(
      machine
        .getAgentRuntimeStage(
          run,
          "borrow-1",
        )
        .status,
      "review",
    );

    assert.equal(
      machine
        .getAgentRuntimeStage(
          run,
          "shield-2",
        )
        .status,
      "locked",
    );
  },
);


test(
  "locked Shield cannot submit before Borrow confirmation",
  () => {
    const run =
      machine.createAgentRun(
        plan,
      );

    assert.throws(
      () =>
        machine.submitAgentStage(
          plan,
          run,
          "shield-2",
          "0x222",
        ),
      /not ready/i,
    );
  },
);


test(
  "Borrow submission moves Agent run into executing state",
  () => {
    const initial =
      machine.createAgentRun(
        plan,
      );

    const run =
      machine.submitAgentStage(
        plan,
        initial,
        "borrow-1",
        "0x111",
      );

    assert.equal(
      run.status,
      "executing",
    );

    assert.equal(
      machine
        .getAgentRuntimeStage(
          run,
          "borrow-1",
        )
        .status,
      "submitted",
    );
  },
);


test(
  "a stage cannot become confirmed before submission",
  () => {
    const run =
      machine.createAgentRun(
        plan,
      );

    assert.throws(
      () =>
        machine.confirmAgentStage(
          plan,
          run,
          "borrow-1",
        ),
      /submitted before confirmation/i,
    );
  },
);


test(
  "Borrow confirmation unlocks dependent Shield stage",
  () => {
    let run =
      machine.createAgentRun(
        plan,
      );

    run =
      machine.submitAgentStage(
        plan,
        run,
        "borrow-1",
        "0x111",
      );

    run =
      machine.confirmAgentStage(
        plan,
        run,
        "borrow-1",
      );

    assert.equal(
      run.status,
      "review",
    );

    assert.equal(
      machine
        .getAgentRuntimeStage(
          run,
          "borrow-1",
        )
        .status,
      "confirmed",
    );

    assert.equal(
      machine
        .getAgentRuntimeStage(
          run,
          "shield-2",
        )
        .status,
      "review",
    );
  },
);


test(
  "Agent run completes only after every stage confirms",
  () => {
    let run =
      machine.createAgentRun(
        plan,
      );

    run =
      machine.submitAgentStage(
        plan,
        run,
        "borrow-1",
        "0x111",
      );

    run =
      machine.confirmAgentStage(
        plan,
        run,
        "borrow-1",
      );

    run =
      machine.submitAgentStage(
        plan,
        run,
        "shield-2",
        "0x222",
      );

    run =
      machine.confirmAgentStage(
        plan,
        run,
        "shield-2",
      );

    assert.equal(
      run.status,
      "completed",
    );
  },
);


test(
  "failed Borrow stops the run and keeps Shield locked",
  () => {
    let run =
      machine.createAgentRun(
        plan,
      );

    run =
      machine.submitAgentStage(
        plan,
        run,
        "borrow-1",
        "0x111",
      );

    run =
      machine.failAgentStage(
        plan,
        run,
        "borrow-1",
        "reverted",
      );

    assert.equal(
      run.status,
      "failed",
    );

    assert.equal(
      machine
        .getAgentRuntimeStage(
          run,
          "shield-2",
        )
        .status,
      "locked",
    );
  },
);


test(
  "invalid Agent dependencies fail closed",
  () => {
    const invalid = {
      ...plan,

      stages: [
        {
          ...plan.stages[0],

          dependsOn: [
            "missing-stage",
          ],
        },
      ],
    };

    assert.throws(
      () =>
        machine.createAgentRun(
          invalid,
        ),
      /unknown stage/i,
    );
  },
);



test(
  "Agent runtime stores provider order references without inventing a tx hash",
  () => {
    const initial =
      machine.createAgentRun(
        plan,
      );

    const run =
      machine.submitAgentStage(
        plan,
        initial,
        "borrow-1",
        {
          kind:
            "provider-order",

          id:
            "garden-order-abc123",
        },
      );

    const stage =
      machine
        .getAgentRuntimeStage(
          run,
          "borrow-1",
        );

    assert.deepEqual(
      stage.executionReference,
      {
        kind:
          "provider-order",

        id:
          "garden-order-abc123",
      },
    );

    assert.equal(
      stage.txHash,
      undefined,
    );
  },
);
