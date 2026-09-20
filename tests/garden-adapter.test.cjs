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


const coreAssets =
  require(
    "../lib/carel/core/assets.ts",
  );

const bitcoin =
  require(
    "../lib/carel/ecosystems/bitcoin/assets.ts",
  );

const chains =
  require(
    "../lib/carel/ecosystems/starknet/chains.ts",
  );

const gardenAssets =
  require(
    "../lib/carel/protocols/garden/assets.ts",
  );

const garden =
  require(
    "../lib/carel/protocols/garden/adapter.ts",
  );

const registry =
  require(
    "../lib/carel/core/adapters.ts",
  );

const routes =
  require(
    "../lib/carel/core/routes.ts",
  );


const context = {
  chainId:
    chains
      .STARKNET_SEPOLIA
      .chainId,

  account:
    "0x123",
};

const incoming = {
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
};

const outgoing = {
  action:
    "bridge",

  fromAssetId:
    gardenAssets
      .GARDEN_STARKNET_SEPOLIA_STRKBTC
      .id,

  toAssetId:
    bitcoin
      .BITCOIN_TESTNET4_BTC
      .id,

  amount:
    50_000n,

  privacy:
    "public",
};


test(
  "provider assets remain logical until Garden resolves its live catalogue",
  () => {
    const asset =
      gardenAssets
        .GARDEN_STARKNET_SEPOLIA_WBTC;

    assert.equal(
      coreAssets
        .assetAddress(
          asset,
        ),
      null,
    );

    assert.equal(
      coreAssets
        .providerAssetId(
          asset,
          "garden",
        ),
      "starknet_sepolia:wbtc",
    );

    assert.equal(
      coreAssets
        .providerAssetId(
          asset,
          "other",
        ),
      null,
    );
  },
);


test(
  "Garden supports Bitcoin Testnet4 to Starknet Sepolia bridge assets",
  () => {
    assert.equal(
      garden
        .supportsGardenBridgeIntent(
          incoming,
          context,
        ),
      true,
    );

    assert.deepEqual(
      garden
        .resolveGardenBridgeRoute(
          incoming,
        ),
      {
        direction:
          "to-starknet",

        sourceAssetId:
          "bitcoin_testnet:btc",

        destinationAssetId:
          "starknet_sepolia:wbtc",
      },
    );
  },
);


test(
  "Garden supports Starknet Sepolia Bitcoin tokens back to Bitcoin Testnet4",
  () => {
    assert.equal(
      garden
        .supportsGardenBridgeIntent(
          outgoing,
          context,
        ),
      true,
    );

    assert.deepEqual(
      garden
        .resolveGardenBridgeRoute(
          outgoing,
        ),
      {
        direction:
          "to-bitcoin",

        sourceAssetId:
          "starknet_sepolia:strkbtc",

        destinationAssetId:
          "bitcoin_testnet:btc",
      },
    );
  },
);


test(
  "Garden rejects private, zero, wrong-wallet-network and unsupported pairs",
  () => {
    assert.equal(
      garden
        .supportsGardenBridgeIntent(
          {
            ...incoming,

            privacy:
              "private",
          },
          context,
        ),
      false,
    );

    assert.equal(
      garden
        .supportsGardenBridgeIntent(
          {
            ...incoming,

            amount:
              0n,
          },
          context,
        ),
      false,
    );

    assert.equal(
      garden
        .supportsGardenBridgeIntent(
          incoming,
          {
            ...context,

            chainId:
              chains
                .STARKNET_MAINNET
                .chainId,
          },
        ),
      false,
    );

    assert.equal(
      garden
        .supportsGardenBridgeIntent(
          {
            ...incoming,

            toAssetId:
              incoming
                .fromAssetId,
          },
          context,
        ),
      false,
    );
  },
);


test(
  "Garden registers as both Bitcoin and Starknet execution capability",
  () => {
    const adapter =
      garden
        .createGardenBridgeExecutionAdapter(
          async () => ({
            status:
              "pending",
          }),
        );

    const registered =
      registry
        .createExecutionAdapterRegistry([
          adapter,
        ]);

    assert.deepEqual(
      adapter.ecosystems,
      [
        "bitcoin",
        "starknet",
      ],
    );

    assert.equal(
      routes
        .selectExecutionAdapter(
          incoming,
          context,
          [
            ...registered.values(),
          ],
          "bitcoin",
        )?.id,
      garden
        .GARDEN_BRIDGE_ADAPTER_ID,
    );

    assert.equal(
      routes
        .selectExecutionAdapter(
          incoming,
          context,
          [
            ...registered.values(),
          ],
          "starknet",
        )?.id,
      garden
        .GARDEN_BRIDGE_ADAPTER_ID,
    );
  },
);


test(
  "Garden adapter delegates the reviewed route and normalizes its receipt",
  async () => {
    let observedRoute =
      null;

    const adapter =
      garden
        .createGardenBridgeExecutionAdapter(
          async (
            intent,
            nextContext,
            route,
          ) => {
            assert.equal(
              intent,
              incoming,
            );

            assert.equal(
              nextContext,
              context,
            );

            observedRoute =
              route;

            return {
              transactionId:
                "garden-order-id",

              status:
                "pending",
            };
          },
        );

    const receipt =
      await adapter.execute(
        incoming,
        context,
      );

    assert.deepEqual(
      observedRoute,
      {
        direction:
          "to-starknet",

        sourceAssetId:
          "bitcoin_testnet:btc",

        destinationAssetId:
          "starknet_sepolia:wbtc",
      },
    );

    assert.deepEqual(
      receipt,
      {
        adapterId:
          garden
            .GARDEN_BRIDGE_ADAPTER_ID,

        provider:
          "Garden",

        transactionId:
          "garden-order-id",

        status:
          "pending",
      },
    );
  },
);
