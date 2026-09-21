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


const {
  createAgentFeeStore,
} =
  require(
    "../lib/agent/server-fee-store.ts",
  );


function memoryBackend() {
  const values =
    new Map();


  return {
    async set(
      key,
      value,
      options,
    ) {
      if (
        options.nx &&
        values.has(
          key,
        )
      ) {
        return null;
      }


      values.set(
        key,
        JSON.parse(
          JSON.stringify(
            value,
          ),
        ),
      );


      return "OK";
    },


    async get(
      key,
    ) {
      const value =
        values.get(
          key,
        );


      return value ===
        undefined
        ? null
        : JSON.parse(
            JSON.stringify(
              value,
            ),
          );
    },
  };
}


function quote(
  overrides =
    {},
) {
  return {
    quoteId:
      "a".repeat(
        64,
      ),

    runId:
      "run-1",

    idempotencyKey:
      "run-1:agent-fee",

    planDigest:
      "1".repeat(
        64,
      ),

    payer:
      "0x456",

    issuedAt:
      Date.now(),

    chainId:
      "SN_MAIN",

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


function settlement(
  transactionHash =
    "0xabc",
) {
  return {
    receipt: {
      version:
        1,

      runId:
        "run-1",

      idempotencyKey:
        "run-1:agent-fee",

      planDigest:
        "1".repeat(
          64,
        ),

      quoteId:
        "a".repeat(
          64,
        ),

      payer:
        "0x456",

      chainId:
        "SN_MAIN",

      transactionHash,

      settledAt:
        1_900_000,
    },

    signature:
      "b".repeat(
        64,
      ),
  };
}


test(
  "durable Agent fee binding is idempotent for the exact run",
  async () => {
    const store =
      createAgentFeeStore(
        memoryBackend(),
        {
          ttlSeconds:
            3600,
        },
      );


    const first =
      await store
        .bindRun(
          quote(),
        );


    const second =
      await store
        .bindRun(
          quote(),
        );


    assert.equal(
      first.runId,
      second.runId,
    );


    assert.equal(
      first.planDigest,
      second.planDigest,
    );
  },
);


test(
  "durable Agent fee run rejects another plan for the same runId",
  async () => {
    const store =
      createAgentFeeStore(
        memoryBackend(),
        {
          ttlSeconds:
            3600,
        },
      );


    await store
      .bindRun(
        quote(),
      );


    await assert.rejects(
      () =>
        store
          .bindRun(
            quote({
              planDigest:
                "2".repeat(
                  64,
                ),
            }),
          ),
      /already bound/i,
    );
  },
);


test(
  "first verified Agent fee transaction becomes canonical",
  async () => {
    const store =
      createAgentFeeStore(
        memoryBackend(),
        {
          ttlSeconds:
            3600,
        },
      );


    await store
      .bindRun(
        quote(),
      );


    const first =
      await store
        .persistSettlement(
          settlement(
            "0xabc",
          ),
        );


    const retry =
      await store
        .persistSettlement(
          settlement(
            "0xabc",
          ),
        );


    assert.equal(
      first.transactionHash,
      "0xabc",
    );


    assert.equal(
      retry.transactionHash,
      "0xabc",
    );


    await assert.rejects(
      () =>
        store
          .persistSettlement(
            settlement(
              "0xdef",
            ),
          ),
      /another transaction/i,
    );
  },
);


test(
  "durable settlement can restore the exact execution without browser state",
  async () => {
    const store =
      createAgentFeeStore(
        memoryBackend(),
        {
          ttlSeconds:
            3600,
        },
      );


    await store
      .bindRun(
        quote(),
      );


    await store
      .persistSettlement(
        settlement(),
      );


    const restored =
      await store
        .loadSettlement({
          runId:
            "run-1",

          planDigest:
            "1".repeat(
              64,
            ),

          chainId:
            "SN_MAIN",

          payer:
            "0x456",
        });


    assert.equal(
      restored
        .transactionHash,
      "0xabc",
    );


    await assert.rejects(
      () =>
        store
          .loadSettlement({
            runId:
              "run-1",

            planDigest:
              "2".repeat(
                64,
              ),

            chainId:
              "SN_MAIN",

            payer:
              "0x456",
          }),
      /another execution/i,
    );
  },
);
