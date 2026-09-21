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


const gate =
  require(
    "../lib/agent/client-fee-gate.ts",
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
  runId,
) {
  return {
    quote: {
      quoteId:
        "a".repeat(
          64,
        ),

      runId,

      idempotencyKey:
        `${runId}:agent-fee`,

      payer:
        "0x456",

      issuedAt:
        Date.now() -
        1000,

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
) {
  return {
    ok,

    status:
      ok
        ? 200
        : 400,

    async json() {
      return value;
    },
  };
}


test(
  "disabled fee policy never calls the wallet",
  async () => {
    let walletCalls =
      0;


    const coordinator =
      gate
        .createAgentFeeGateCoordinator({
          async httpClient(
            url,
          ) {
            assert.match(
              url,
              /policy$/,
            );

            return response({
              enabled:
                false,
            });
          },
        });


    const result =
      await coordinator
        .prepare(
          plan(),
          {
            prefix:
              "swap",

            chainId:
              MAINNET,

            payer:
              "0x456",

            async executeAgentFee() {
              walletCalls++;

              return "0xabc";
            },
          },
        );


    assert.equal(
      result.status,
      "disabled",
    );

    assert.equal(
      walletCalls,
      0,
    );
  },
);


test(
  "enabled fee policy settles exactly one fee before protocol execution",
  async () => {
    let walletCalls =
      0;

    let policyCalls =
      0;


    const coordinator =
      gate
        .createAgentFeeGateCoordinator({
          async httpClient(
            url,
            init,
          ) {
            if (
              url.endsWith(
                "/policy",
              )
            ) {
              policyCalls++;

              return response({
                enabled:
                  true,
              });
            }


            if (
              url.endsWith(
                "/quote",
              )
            ) {
              const body =
                JSON.parse(
                  init.body,
                );

              return response(
                quote(
                  body.runId,
                ),
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
          },
        });


    const result =
      await coordinator
        .prepare(
          plan(),
          {
            prefix:
              "swap",

            chainId:
              MAINNET,

            payer:
              "0x456",

            async executeAgentFee() {
              walletCalls++;

              return "0xabc";
            },
          },
        );


    assert.equal(
      result.status,
      "settled",
    );

    assert.equal(
      walletCalls,
      1,
    );

    assert.equal(
      policyCalls,
      1,
    );
  },
);


test(
  "settlement retry reuses submitted fee transaction without a second wallet call",
  async () => {
    let walletCalls =
      0;

    let settlementCalls =
      0;


    const coordinator =
      gate
        .createAgentFeeGateCoordinator({
          async httpClient(
            url,
            init,
          ) {
            if (
              url.endsWith(
                "/policy",
              )
            ) {
              return response({
                enabled:
                  true,
              });
            }


            if (
              url.endsWith(
                "/quote",
              )
            ) {
              const body =
                JSON.parse(
                  init.body,
                );

              return response(
                quote(
                  body.runId,
                ),
              );
            }


            settlementCalls++;

            if (
              settlementCalls ===
                1
            ) {
              return response(
                {
                  settled:
                    false,

                  error:
                    "temporary RPC error",
                },
                false,
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
          },
        });


    const input = {
      prefix:
        "swap",

      chainId:
        MAINNET,

      payer:
        "0x456",

      async executeAgentFee() {
        walletCalls++;

        return "0xabc";
      },
    };


    await assert.rejects(
      () =>
        coordinator
          .prepare(
            plan(),
            input,
          ),
      /temporary RPC/i,
    );


    const retried =
      await coordinator
        .prepare(
          plan(),
          input,
        );


    assert.equal(
      retried.status,
      "settled",
    );

    assert.equal(
      walletCalls,
      1,
    );

    assert.equal(
      settlementCalls,
      2,
    );
  },
);


test(
  "protocol start consumes the fee run so another identical action gets a new run",
  async () => {
    const coordinator =
      gate
        .createAgentFeeGateCoordinator({
          async httpClient() {
            return response({
              enabled:
                false,
            });
          },
        });


    const input = {
      prefix:
        "swap",

      chainId:
        MAINNET,

      payer:
        "0x456",

      async executeAgentFee() {
        throw new Error(
          "wallet must not be called",
        );
      },
    };


    const first =
      await coordinator
        .prepare(
          plan(),
          input,
        );


    coordinator
      .markProtocolStarted(
        first.runId,
      );


    const second =
      await coordinator
        .prepare(
          plan(),
          input,
        );


    assert.notEqual(
      first.runId,
      second.runId,
    );
  },
);


test(
  "changing payer cannot reuse another wallet's fee run",
  async () => {
    const coordinator =
      gate
        .createAgentFeeGateCoordinator({
          async httpClient() {
            return response({
              enabled:
                false,
            });
          },
        });


    const first =
      await coordinator
        .prepare(
          plan(),
          {
            prefix:
              "swap",

            chainId:
              MAINNET,

            payer:
              "0x456",

            async executeAgentFee() {
              return "0xabc";
            },
          },
        );


    const second =
      await coordinator
        .prepare(
          plan(),
          {
            prefix:
              "swap",

            chainId:
              MAINNET,

            payer:
              "0x789",

            async executeAgentFee() {
              return "0xabc";
            },
          },
        );


    assert.notEqual(
      first.runId,
      second.runId,
    );
  },
);
