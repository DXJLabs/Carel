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


const recovery =
  require(
    "../lib/agent/server-recovery.ts",
  );


const ORIGINAL_SECRET =
  process.env
    .CAREL_AGENT_RECOVERY_SIGNING_SECRET;


function configure() {
  process.env
    .CAREL_AGENT_RECOVERY_SIGNING_SECRET =
      "test-agent-recovery-secret-that-is-long-enough";
}


test.afterEach(
  () => {
    if (
      ORIGINAL_SECRET ===
        undefined
    ) {
      delete process.env
        .CAREL_AGENT_RECOVERY_SIGNING_SECRET;
    } else {
      process.env
        .CAREL_AGENT_RECOVERY_SIGNING_SECRET =
          ORIGINAL_SECRET;
    }
  },
);


function seal() {
  configure();


  return recovery
    .sealAgentRecoveryDraft({
      kind:
        "swap",

      runId:
        "swap-run-1",

      stageId:
        "swap-1",

      executionKey:
        "swap-run-1:swap-1",

      chainId:
        "SN_MAIN",

      account:
        "0x456",

      data: {
        assetId:
          "starknet:mainnet:USDC",

        publicBefore:
          "1000000",

        minimumIncreaseUnits:
          "900000",
      },

      now:
        1_000,

      ttlMs:
        60_000,
    });
}


test(
  "Agent recovery fails closed without its server signing secret",
  () => {
    delete process.env
      .CAREL_AGENT_RECOVERY_SIGNING_SECRET;


    assert.throws(
      () =>
        recovery
          .sealAgentRecoveryDraft({
            kind:
              "swap",

            runId:
              "run-1",

            stageId:
              "swap-1",

            executionKey:
              "run-1:swap-1",

            chainId:
              "SN_MAIN",

            account:
              "0x456",

            data: {},

            now:
              1_000,
          }),
      /not configured/i,
    );
  },
);


test(
  "server seals a public Agent verification baseline before wallet execution",
  () => {
    const draft =
      seal();


    const payload =
      recovery
        .verifyAgentRecoveryDraft(
          draft,
          2_000,
        );


    assert.equal(
      payload.runId,
      "swap-run-1",
    );


    assert.equal(
      payload.data
        .publicBefore,
      "1000000",
    );
  },
);


test(
  "tampering with a recovery baseline invalidates its signature",
  () => {
    const draft =
      seal();


    const tampered = {
      ...draft,

      payload: {
        ...draft.payload,

        data: {
          ...draft.payload
            .data,

          publicBefore:
            "0",
        },
      },
    };


    assert.throws(
      () =>
        recovery
          .verifyAgentRecoveryDraft(
            tampered,
            2_000,
          ),
      /signature/i,
    );
  },
);


test(
  "transaction binding produces a signed recovery capsule",
  () => {
    const draft =
      seal();


    const capsule =
      recovery
        .bindAgentRecoveryTransaction({
          draft,

          transactionId:
            "0xabc",

          now:
            2_000,
        });


    const payload =
      recovery
        .verifyAgentRecoveryCapsule(
          capsule,
          3_000,
        );


    assert.equal(
      payload.transactionId,
      "0xabc",
    );


    assert.equal(
      payload.executionKey,
      "swap-run-1:swap-1",
    );
  },
);


test(
  "bound transaction hash cannot be changed after sealing",
  () => {
    const draft =
      seal();


    const capsule =
      recovery
        .bindAgentRecoveryTransaction({
          draft,

          transactionId:
            "0xabc",

          now:
            2_000,
        });


    const tampered = {
      ...capsule,

      payload: {
        ...capsule.payload,

        transactionId:
          "0xdef",
      },
    };


    assert.throws(
      () =>
        recovery
          .verifyAgentRecoveryCapsule(
            tampered,
            3_000,
          ),
      /signature/i,
    );
  },
);
