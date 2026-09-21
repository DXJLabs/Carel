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


const discovery =
  require(
    "../lib/carel/ecosystems/starknet/staking-assets.ts",
  );

const chains =
  require(
    "../lib/carel/ecosystems/starknet/chains.ts",
  );

const avnu =
  require(
    "../lib/carel/ecosystems/starknet/protocols/avnu/staking-adapter.ts",
  );

const endur =
  require(
    "../lib/carel/ecosystems/starknet/protocols/endur/adapter.ts",
  );


test(
  "Starknet staking asset discovery is capability-driven",
  () => {
    const options =
      discovery
        .getStarknetStakingAssetOptions(
          chains
            .STARKNET_MAINNET
            .chainId,

          "0x123",

          "normal",
        );


    assert.deepEqual(
      options.map(
        (option) => ({
          symbol:
            option.asset
              .symbol,

          provider:
            option.providerId,
        }),
      ),
      [
        {
          symbol:
            "STRK",

          provider:
            avnu
              .AVNU_STAKING_ADAPTER_ID,
        },
      ],
    );
  },
);


test(
  "Shield Staking discovery resolves provider receipt asset",
  () => {
    const options =
      discovery
        .getStarknetStakingAssetOptions(
          chains
            .STARKNET_MAINNET
            .chainId,

          "0x123",

          "shield",
        );


    assert.deepEqual(
      options.map(
        (option) => ({
          input:
            option.asset
              .symbol,

          output:
            option.outputAsset
              ?.symbol,

          provider:
            option.providerId,
        }),
      ),
      [
        {
          input:
            "STRK",

          output:
            "xSTRK",

          provider:
            endur
              .ENDUR_SHIELD_STAKING_ADAPTER_ID,
        },
      ],
    );
  },
);


test(
  "registered Starknet assets are not exposed as stakeable unless a provider declares support",
  () => {
    const options =
      discovery
        .getStarknetStakingAssetOptions(
          chains
            .STARKNET_MAINNET
            .chainId,

          "0x123",

          "normal",
        );


    const symbols =
      options.map(
        (option) =>
          option.asset.symbol,
      );


    for (
      const unsupported
      of [
        "ETH",
        "USDC",
        "USDT",
        "WBTC",
        "strkBTC",
        "xSTRK",
      ]
    ) {
      assert.equal(
        symbols.includes(
          unsupported,
        ),
        false,
      );
    }
  },
);
