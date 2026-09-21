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

            lib: [
              "es2020",
              "dom",
            ],
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


const fee =
  require(
    "../lib/agent/client-fee.ts",
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


function signedQuote() {
  return {
    quote: {
      quoteId:
        "a".repeat(
          64,
        ),

      runId:
        "run-1",

      idempotencyKey:
        "run-1:agent-fee",

      payer:
        "0x456",

      issuedAt:
        Date.now() -
        1_000,

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
    },

    signature:
      "b".repeat(
        64,
      ),
  };
}


function response(
  value,
  ok =
    true,
  status =
    200,
) {
  return {
    ok,
    status,

    async json() {
      return value;
    },
  };
}


test(
  "client fee orchestrator reaches settled state after exact quote payment",
  async () => {
    let walletCalls =
      0;

    let apiCalls =
      0;


    const http =
      async (
        url,
      ) => {
        apiCalls++;


        if (
          url.endsWith(
            "/quote",
          )
        ) {
          return response(
            signedQuote(),
          );
        }


        return response({
          settled:
            true,

          executionReference: {
            kind:
              "transaction",

            id:
              "0xabc",
          },
        });
      };


    const session =
      await fee
        .executeAndSettleAgentPlanFee(
          plan(),
          {
            runId:
              "run-1",

            chainId:
              MAINNET,

            payer:
              "0x456",

            async executeAgentFee() {
              walletCalls++;

              return "0xabc";
            },

            httpClient:
              http,
          },
        );


    assert.equal(
      session.state.status,
      "settled",
    );


    assert.equal(
      walletCalls,
      1,
    );


    assert.equal(
      apiCalls,
      2,
    );
  },
);


test(
  "settlement retry never submits the Agent fee to the wallet twice",
  async () => {
    let walletCalls =
      0;


    const quoteHttp =
      async () =>
        response(
          signedQuote(),
        );


    let session =
      fee
        .createAgentFeeClientSession(
          plan(),
          "run-1",
        );


    session =
      await fee
        .quoteAgentPlanFee(
          session,
          {
            chainId:
              MAINNET,

            payer:
              "0x456",

            httpClient:
              quoteHttp,
          },
        );


    session =
      await fee
        .submitAgentPlanFee(
          session,
          async () => {
            walletCalls++;

            return "0xabc";
          },
        );


    assert.equal(
      session.state.status,
      "submitted",
    );


    await assert.rejects(
      () =>
        fee
          .settleAgentPlanFee(
            session,
            async () =>
              response(
                {
                  settled:
                    false,

                  error:
                    "RPC temporarily unavailable",
                },
                false,
                400,
              ),
          ),
      /temporarily unavailable/i,
    );


    assert.equal(
      session.state.status,
      "submitted",
    );


    const settled =
      await fee
        .settleAgentPlanFee(
          session,
          async () =>
            response({
              settled:
                true,

              executionReference: {
                kind:
                  "transaction",

                id:
                  "0xabc",
              },
            }),
        );


    assert.equal(
      settled.state.status,
      "settled",
    );


    assert.equal(
      walletCalls,
      1,
    );
  },
);


test(
  "settlement fails closed when server returns another transaction reference",
  async () => {
    let session =
      fee
        .createAgentFeeClientSession(
          plan(),
          "run-1",
        );


    session =
      await fee
        .quoteAgentPlanFee(
          session,
          {
            chainId:
              MAINNET,

            payer:
              "0x456",

            httpClient:
              async () =>
                response(
                  signedQuote(),
                ),
          },
        );


    session =
      await fee
        .submitAgentPlanFee(
          session,
          async () =>
            "0xabc",
        );


    await assert.rejects(
      () =>
        fee
          .settleAgentPlanFee(
            session,
            async () =>
              response({
                settled:
                  true,

                executionReference: {
                  kind:
                    "transaction",

                  id:
                    "0xdef",
                },
              }),
          ),
      /does not match/i,
    );


    assert.equal(
      session.state.status,
      "submitted",
    );
  },
);


test(
  "client fee orchestrator refuses a malformed signed quote before wallet execution",
  async () => {
    let walletCalls =
      0;


    await assert.rejects(
      () =>
        fee
          .executeAndSettleAgentPlanFee(
            plan(),
            {
              runId:
                "run-1",

              chainId:
                MAINNET,

              payer:
                "0x456",

              async executeAgentFee() {
                walletCalls++;

                return "0xabc";
              },

              async httpClient() {
                return response({
                  quote:
                    signedQuote()
                      .quote,

                  signature:
                    "not-a-signature",
                });
              },
            },
          ),
      /invalid signed quote/i,
    );


    assert.equal(
      walletCalls,
      0,
    );
  },
);
