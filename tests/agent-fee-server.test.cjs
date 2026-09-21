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
    "../lib/agent/server-fee.ts",
  );

const chains =
  require(
    "../lib/carel/ecosystems/starknet/chains.ts",
  );

const assets =
  require(
    "../lib/carel/ecosystems/starknet/assets.ts",
  );

const {
  hash,
  num,
} =
  require(
    "starknet",
  );


const MAINNET =
  chains
    .STARKNET_MAINNET
    .chainId;


const OLD_ENV = {
  secret:
    process.env
      .CAREL_AGENT_FEE_SIGNING_SECRET,

  amount:
    process.env
      .CAREL_AGENT_FEE_AMOUNT_STRK,

  recipient:
    process.env
      .CAREL_AGENT_FEE_RECIPIENT,

  redisUrl:
    process.env
      .KV_REST_API_URL,

  redisToken:
    process.env
      .KV_REST_API_TOKEN,
};


function configure() {
  process.env
    .CAREL_AGENT_FEE_SIGNING_SECRET =
      "test-only-secret-that-is-at-least-thirty-two-characters";

  process.env
    .CAREL_AGENT_FEE_AMOUNT_STRK =
      "0.01";

  process.env
    .CAREL_AGENT_FEE_RECIPIENT =
      "0x123";

  process.env
    .KV_REST_API_URL =
      "https://example.upstash.io";

  process.env
    .KV_REST_API_TOKEN =
      "test-only-upstash-token";
}


function restore() {
  for (
    const [
      key,
      value,
    ]
    of [
      [
        "CAREL_AGENT_FEE_SIGNING_SECRET",
        OLD_ENV.secret,
      ],
      [
        "CAREL_AGENT_FEE_AMOUNT_STRK",
        OLD_ENV.amount,
      ],
      [
        "CAREL_AGENT_FEE_RECIPIENT",
        OLD_ENV.recipient,
      ],
      [
        "KV_REST_API_URL",
        OLD_ENV.redisUrl,
      ],
      [
        "KV_REST_API_TOKEN",
        OLD_ENV.redisToken,
      ],
    ]
  ) {
    if (
      value ===
        undefined
    ) {
      delete process.env[
        key
      ];
    } else {
      process.env[
        key
      ] =
        value;
    }
  }
}


test.afterEach(
  restore,
);


test(
  "Agent fee policy fails closed when server configuration is absent",
  () => {
    delete process.env
      .CAREL_AGENT_FEE_SIGNING_SECRET;

    delete process.env
      .CAREL_AGENT_FEE_AMOUNT_STRK;

    delete process.env
      .CAREL_AGENT_FEE_RECIPIENT;


    assert.throws(
      () =>
        fees
          .createSignedAgentFeeQuote({
            runId:
              "run-1",

          planDigest:
            "1".repeat(
              64,
            ),

            chainId:
              MAINNET,

            payer:
              "0x456",

            now:
              1_800_000,
          }),
      /not configured/i,
    );
  },
);


test(
  "server creates and verifies one signed plan-level Agent fee quote",
  () => {
    configure();


    const signed =
      fees
        .createSignedAgentFeeQuote({
          runId:
            "run-1",

          planDigest:
            "1".repeat(
              64,
            ),

          chainId:
            MAINNET,

          payer:
            "0x456",

          now:
            1_800_000,
        });


    assert.equal(
      signed.quote
        .idempotencyKey,
      "run-1:agent-fee",
    );


    assert.equal(
      signed.quote
        .amountUnits,
      "10000000000000000",
    );


    const verified =
      fees
        .verifySignedAgentFeeQuote(
          signed,
          {
            now:
              1_800_001,
          },
        );


    assert.equal(
      verified.quoteId,
      signed.quote
        .quoteId,
    );
  },
);


test(
  "tampering with a signed Agent fee quote is rejected",
  () => {
    configure();


    const signed =
      fees
        .createSignedAgentFeeQuote({
          runId:
            "run-1",

          planDigest:
            "1".repeat(
              64,
            ),

          chainId:
            MAINNET,

          payer:
            "0x456",

          now:
            1_800_000,
        });


    const tampered = {
      ...signed,

      quote: {
        ...signed.quote,

        amountText:
          "0.02",
      },
    };


    assert.throws(
      () =>
        fees
          .verifySignedAgentFeeQuote(
            tampered,
            {
              now:
                1_800_001,
            },
          ),
      /signature/i,
    );
  },
);


test(
  "repeated quote requests in one time bucket keep the same quote identity",
  () => {
    configure();


    const first =
      fees
        .createSignedAgentFeeQuote({
          runId:
            "run-1",

          planDigest:
            "1".repeat(
              64,
            ),

          chainId:
            MAINNET,

          payer:
            "0x456",

          now:
            1_800_001,
        });


    const second =
      fees
        .createSignedAgentFeeQuote({
          runId:
            "run-1",

          planDigest:
            "1".repeat(
              64,
            ),

          chainId:
            MAINNET,

          payer:
            "0x456",

          now:
            1_800_050,
        });


    assert.equal(
      first.quote
        .quoteId,
      second.quote
        .quoteId,
    );


    assert.equal(
      first.signature,
      second.signature,
    );
  },
);


test(
  "settlement verifier accepts only the exact STRK Transfer event",
  () => {
    configure();


    const signed =
      fees
        .createSignedAgentFeeQuote({
          runId:
            "run-1",

          planDigest:
            "1".repeat(
              64,
            ),

          chainId:
            MAINNET,

          payer:
            "0x456",

          now:
            1_800_000,
        });


    const selector =
      num.toHex(
        hash.starknetKeccak(
          "Transfer",
        ),
      );


    const amount =
      BigInt(
        signed.quote
          .amountUnits,
      );


    const mask =
      (1n << 128n) -
      1n;


    fees
      .verifyAgentFeeTransferEvents({
        quote:
          signed.quote,

        tokenAddress:
          assets
            .STARKNET_MAINNET_STRK
            .identifier.address,

        events: [
          {
            from_address:
              assets
                .STARKNET_MAINNET_STRK
                .identifier.address,

            keys: [
              selector,
              signed.quote
                .payer,
              signed.quote
                .recipient,
            ],

            data: [
              `0x${(
                amount &
                mask
              ).toString(16)}`,

              `0x${(
                amount >>
                128n
              ).toString(16)}`,
            ],
          },
        ],
      });
  },
);


test(
  "settlement verifier rejects transfer from another payer",
  () => {
    configure();


    const signed =
      fees
        .createSignedAgentFeeQuote({
          runId:
            "run-1",

          planDigest:
            "1".repeat(
              64,
            ),

          chainId:
            MAINNET,

          payer:
            "0x456",

          now:
            1_800_000,
        });


    const selector =
      num.toHex(
        hash.starknetKeccak(
          "Transfer",
        ),
      );


    assert.throws(
      () =>
        fees
          .verifyAgentFeeTransferEvents({
            quote:
              signed.quote,

            tokenAddress:
              assets
                .STARKNET_MAINNET_STRK
                .identifier.address,

            events: [
              {
                from_address:
                  assets
                    .STARKNET_MAINNET_STRK
                    .identifier.address,

                keys: [
                  selector,
                  "0x999",
                  signed.quote
                    .recipient,
                ],

                data: [
                  "0x1",
                  "0x0",
                ],
              },
            ],
          }),
      /exact reviewed/i,
    );
  },
);


test(
  "settlement verifier rejects wrong transfer amount",
  () => {
    configure();


    const signed =
      fees
        .createSignedAgentFeeQuote({
          runId:
            "run-1",

          planDigest:
            "1".repeat(
              64,
            ),

          chainId:
            MAINNET,

          payer:
            "0x456",

          now:
            1_800_000,
        });


    const selector =
      num.toHex(
        hash.starknetKeccak(
          "Transfer",
        ),
      );


    assert.throws(
      () =>
        fees
          .verifyAgentFeeTransferEvents({
            quote:
              signed.quote,

            tokenAddress:
              assets
                .STARKNET_MAINNET_STRK
                .identifier.address,

            events: [
              {
                from_address:
                  assets
                    .STARKNET_MAINNET_STRK
                    .identifier.address,

                keys: [
                  selector,
                  signed.quote
                    .payer,
                  signed.quote
                    .recipient,
                ],

                data: [
                  "0x1",
                  "0x0",
                ],
              },
            ],
          }),
      /exact reviewed/i,
    );
  },
);


test(
  "settled Agent fee receipt remains valid after quote execution window",
  () => {
    configure();


    const signed =
      fees
        .createSignedAgentFeeQuote({
          runId:
            "resume-run",

          planDigest:
            "1".repeat(
              64,
            ),

          chainId:
            MAINNET,

          payer:
            "0x456",

          now:
            1_800_000,
        });


    const settled =
      fees
        .createSignedAgentFeeSettlementReceipt({
          quote:
            signed.quote,

          transactionHash:
            "0xabc",

          now:
            1_900_000,
        });


    const receipt =
      fees
        .verifySignedAgentFeeSettlementReceipt(
          settled,
        );


    assert.equal(
      receipt.runId,
      "resume-run",
    );


    assert.equal(
      receipt.transactionHash,
      "0xabc",
    );
  },
);


test(
  "tampering with settled Agent fee receipt invalidates authorization evidence",
  () => {
    configure();


    const signed =
      fees
        .createSignedAgentFeeQuote({
          runId:
            "resume-run",

          planDigest:
            "1".repeat(
              64,
            ),

          chainId:
            MAINNET,

          payer:
            "0x456",

          now:
            1_800_000,
        });


    const settled =
      fees
        .createSignedAgentFeeSettlementReceipt({
          quote:
            signed.quote,

          transactionHash:
            "0xabc",

          now:
            1_900_000,
        });


    assert.throws(
      () =>
        fees
          .verifySignedAgentFeeSettlementReceipt({
            ...settled,

            receipt: {
              ...settled.receipt,

              transactionHash:
                "0xdef",
            },
          }),
      /signature/i,
    );
  },
);


test(
  "Agent fee policy requires durable Redis storage",
  () => {
    configure();


    assert.equal(
      fees
        .agentFeePolicyConfigured(),
      true,
    );


    delete process.env
      .KV_REST_API_TOKEN;


    assert.equal(
      fees
        .agentFeePolicyConfigured(),
      false,
    );
  },
);
