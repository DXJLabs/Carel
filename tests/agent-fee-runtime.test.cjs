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


const fees =
  require(
    "../lib/agent/fee-runtime.ts",
  );

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


function plan() {
  return planner
    .buildStarknetAgentPlan({
      goal:
        "Swap 1 STRK for USDC.",

      chainId:
        MAINNET,

      mode:
        "normal",
    });
}


function quote(
  overrides =
    {},
) {
  return {
    quoteId:
      "fee-quote-1",

    runId:
      "run-1",

    chainId:
      MAINNET,

    assetId:
      "starknet:mainnet:STRK",

    assetSymbol:
      "STRK",

    assetDecimals:
      18,

    amountText:
      "0.01",

    amountUnits:
      "10000000000000000",

    recipient:
      "0x123",

    expiresAt:
      Date.now() +
      60_000,

    scope:
      "plan",

    chargeModel:
      "once-per-plan",

    reason:
      "agent-execution",

    ...overrides,
  };
}


test(
  "Agent fee uses one stable idempotency key for the complete run",
  () => {
    const state =
      fees
        .createAgentFeeRuntime(
          plan(),
          "run-1",
        );


    assert.equal(
      state.status,
      "pending-policy",
    );


    assert.equal(
      state.idempotencyKey,
      "run-1:agent-fee",
    );


    assert.equal(
      fees
        .agentFeeIdempotencyKey(
          "run-1",
        ),
      state.idempotencyKey,
    );
  },
);


test(
  "trusted Agent fee quote is bound to one concrete run",
  () => {
    const state =
      fees
        .createAgentFeeRuntime(
          plan(),
          "run-1",
        );


    assert.throws(
      () =>
        fees
          .attachAgentFeeQuote(
            state,
            quote({
              runId:
                "run-2",
            }),
          ),
      /another execution run/i,
    );


    const attached =
      fees
        .attachAgentFeeQuote(
          state,
          quote(),
        );


    assert.equal(
      attached.status,
      "quoted",
    );


    assert.equal(
      attached.quote
        .amountUnits,
      "10000000000000000",
    );
  },
);


test(
  "Agent fee rejects mismatched display amount and base units",
  () => {
    const state =
      fees
        .createAgentFeeRuntime(
          plan(),
          "run-1",
        );


    assert.throws(
      () =>
        fees
          .attachAgentFeeQuote(
            state,
            quote({
              amountUnits:
                "999",
            }),
          ),
      /does not match/i,
    );
  },
);


test(
  "expired Agent fee quote fails closed",
  () => {
    const state =
      fees
        .createAgentFeeRuntime(
          plan(),
          "run-1",
        );


    assert.throws(
      () =>
        fees
          .attachAgentFeeQuote(
            state,
            quote({
              expiresAt:
                100,
            }),
            101,
          ),
      /expired/i,
    );
  },
);


test(
  "Agent fee can only be submitted once per run",
  () => {
    let state =
      fees
        .createAgentFeeRuntime(
          plan(),
          "run-1",
        );


    state =
      fees
        .attachAgentFeeQuote(
          state,
          quote(),
        );


    state =
      fees
        .submitAgentFee(
          state,
          {
            kind:
              "transaction",

            id:
              "0xabc",
          },
        );


    assert.equal(
      state.status,
      "submitted",
    );


    assert.throws(
      () =>
        fees
          .submitAgentFee(
            state,
            {
              kind:
                "transaction",

              id:
                "0xdef",
            },
          ),
      /already been submitted/i,
    );
  },
);


test(
  "Agent fee settles only after submission and stays idempotently settled",
  () => {
    const pending =
      fees
        .createAgentFeeRuntime(
          plan(),
          "run-1",
        );


    assert.throws(
      () =>
        fees
          .settleAgentFee(
            pending,
          ),
      /submitted before/i,
    );


    const quoted =
      fees
        .attachAgentFeeQuote(
          pending,
          quote(),
        );


    const submitted =
      fees
        .submitAgentFee(
          quoted,
          {
            kind:
              "transaction",

            id:
              "0xabc",
          },
        );


    const settled =
      fees
        .settleAgentFee(
          submitted,
        );


    assert.equal(
      settled.status,
      "settled",
    );


    assert.equal(
      fees
        .agentFeeIsSettled(
          settled,
        ),
      true,
    );


    assert.strictEqual(
      fees
        .settleAgentFee(
          settled,
        ),
      settled,
    );
  },
);
