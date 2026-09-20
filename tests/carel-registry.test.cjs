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


const carel =
  require(
    "../lib/carel/adapters.ts",
  );

const coreRegistry =
  require(
    "../lib/carel/core/adapters.ts",
  );

const routes =
  require(
    "../lib/carel/core/routes.ts",
  );

const avnuSwap =
  require(
    "../lib/carel/ecosystems/starknet/protocols/avnu/adapter.ts",
  );

const avnuStake =
  require(
    "../lib/carel/ecosystems/starknet/protocols/avnu/staking-adapter.ts",
  );

const endur =
  require(
    "../lib/carel/ecosystems/starknet/protocols/endur/adapter.ts",
  );

const vesu =
  require(
    "../lib/carel/ecosystems/starknet/protocols/vesu/adapter.ts",
  );

const garden =
  require(
    "../lib/carel/protocols/garden/adapter.ts",
  );

const assets =
  require(
    "../lib/carel/ecosystems/starknet/assets.ts",
  );

const chains =
  require(
    "../lib/carel/ecosystems/starknet/chains.ts",
  );

const bitcoin =
  require(
    "../lib/carel/ecosystems/bitcoin/assets.ts",
  );

const gardenAssets =
  require(
    "../lib/carel/protocols/garden/assets.ts",
  );


const noop = async () => ({
  status:
    "submitted",
});

const dependencies = {
  starknet: {
    avnuSwap:
      noop,

    avnuStake:
      noop,

    endurShieldStake:
      noop,

    vesuBorrow:
      noop,
  },

  gardenBridge:
    noop,
};

const mainnetContext = {
  chainId:
    chains
      .STARKNET_MAINNET
      .chainId,

  account:
    "0x123",
};

const sepoliaContext = {
  chainId:
    chains
      .STARKNET_SEPOLIA
      .chainId,

  account:
    "0x123",
};


test(
  "global CAREL registry only exposes adapters with attached runtime dependencies",
  () => {
    assert.equal(
      carel
        .createCarelExecutionRegistry({})
        .size,
      0,
    );

    const partial =
      carel
        .createCarelExecutionRegistry({
          starknet: {
            vesuBorrow:
              noop,
          },
        });

    assert.deepEqual(
      [
        ...partial.keys(),
      ],
      [
        vesu
          .VESU_BORROW_ADAPTER_ID,
      ],
    );
  },
);


test(
  "global CAREL registry combines Starknet and cross-chain adapters",
  () => {
    const registry =
      carel
        .createCarelExecutionRegistry(
          dependencies,
        );

    assert.deepEqual(
      [
        ...registry.keys(),
      ],
      [
        avnuSwap
          .AVNU_SWAP_ADAPTER_ID,

        avnuStake
          .AVNU_STAKING_ADAPTER_ID,

        endur
          .ENDUR_SHIELD_STAKING_ADAPTER_ID,

        vesu
          .VESU_BORROW_ADAPTER_ID,

        garden
          .GARDEN_BRIDGE_ADAPTER_ID,
      ],
    );
  },
);


test(
  "global registry exposes Garden to both Bitcoin and Starknet capability discovery",
  () => {
    const registry =
      carel
        .createCarelExecutionRegistry(
          dependencies,
        );

    const bitcoinAdapters =
      coreRegistry
        .listExecutionAdapters(
          registry,
          {
            ecosystem:
              "bitcoin",
          },
        )
        .map(
          adapter =>
            adapter.id,
        );

    assert.deepEqual(
      bitcoinAdapters,
      [
        garden
          .GARDEN_BRIDGE_ADAPTER_ID,
      ],
    );

    const starknetAdapters =
      coreRegistry
        .listExecutionAdapters(
          registry,
          {
            ecosystem:
              "starknet",
          },
        )
        .map(
          adapter =>
            adapter.id,
        );

    assert.equal(
      starknetAdapters.includes(
        garden
          .GARDEN_BRIDGE_ADAPTER_ID,
      ),
      true,
    );

    assert.equal(
      starknetAdapters.length,
      5,
    );
  },
);


test(
  "generic routing selects providers from the global CAREL registry",
  () => {
    const registry =
      carel
        .createCarelExecutionRegistry(
          dependencies,
        );

    const adapters = [
      ...registry.values(),
    ];

    const swap =
      routes
        .selectExecutionAdapter(
          {
            action:
              "swap",

            fromAssetId:
              assets
                .STARKNET_MAINNET_STRK
                .id,

            toAssetId:
              assets
                .STARKNET_MAINNET_USDC
                .id,

            amount:
              1n,

            privacy:
              "public",
          },
          mainnetContext,
          adapters,
          "starknet",
        );

    assert.equal(
      swap?.id,
      avnuSwap
        .AVNU_SWAP_ADAPTER_ID,
    );


    const publicStake =
      routes
        .selectExecutionAdapter(
          {
            action:
              "stake",

            assetId:
              assets
                .STARKNET_MAINNET_STRK
                .id,

            amount:
              10n,

            privacy:
              "public",
          },
          mainnetContext,
          adapters,
          "starknet",
        );

    assert.equal(
      publicStake?.id,
      avnuStake
        .AVNU_STAKING_ADAPTER_ID,
    );


    const shieldStake =
      routes
        .selectExecutionAdapter(
          {
            action:
              "stake",

            assetId:
              assets
                .STARKNET_MAINNET_STRK
                .id,

            targetAssetId:
              assets
                .STARKNET_MAINNET_XSTRK
                .id,

            amount:
              10n,

            privacy:
              "private",
          },
          mainnetContext,
          adapters,
          "starknet",
        );

    assert.equal(
      shieldStake?.id,
      endur
        .ENDUR_SHIELD_STAKING_ADAPTER_ID,
    );


    const borrow =
      routes
        .selectExecutionAdapter(
          {
            action:
              "borrow",

            collateralAssetId:
              assets
                .STARKNET_MAINNET_STRK
                .id,

            borrowAssetId:
              assets
                .STARKNET_MAINNET_USDC
                .id,

            collateralAmount:
              1000n,

            borrowAmount:
              10n,

            privacy:
              "public",
          },
          mainnetContext,
          adapters,
          "starknet",
        );

    assert.equal(
      borrow?.id,
      vesu
        .VESU_BORROW_ADAPTER_ID,
    );


    const bridge =
      routes
        .selectExecutionAdapter(
          {
            action:
              "bridge",

            fromAssetId:
              bitcoin
                .BITCOIN_TESTNET4_BTC
                .id,

            toAssetId:
              gardenAssets
                .GARDEN_STARKNET_SEPOLIA_WBTC
                .id,

            amount:
              50_000n,

            privacy:
              "public",
          },
          sepoliaContext,
          adapters,
        );

    assert.equal(
      bridge?.id,
      garden
        .GARDEN_BRIDGE_ADAPTER_ID,
    );
  },
);
