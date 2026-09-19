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


const avnu =
  require(
    "../lib/carel/ecosystems/starknet/protocols/avnu/adapter.ts",
  );

const vesu =
  require(
    "../lib/carel/ecosystems/starknet/protocols/vesu/adapter.ts",
  );

const starknetAdapters =
  require(
    "../lib/carel/ecosystems/starknet/adapters.ts",
  );

const assets =
  require(
    "../lib/carel/ecosystems/starknet/assets.ts",
  );

const chains =
  require(
    "../lib/carel/ecosystems/starknet/chains.ts",
  );

const registry =
  require(
    "../lib/carel/core/adapters.ts",
  );

const routes =
  require(
    "../lib/carel/core/routes.ts",
  );


const mainnetSwap = {
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
};

const mainnetContext = {
  chainId:
    chains
      .STARKNET_MAINNET
      .chainId,

  account:
    "0x123",
};


test(
  "AVNU adapter supports registered public swaps on Starknet Mainnet and Sepolia",
  () => {
    assert.equal(
      avnu
        .supportsAvnuSwapIntent(
          mainnetSwap,
          mainnetContext,
        ),
      true,
    );

    assert.equal(
      avnu
        .supportsAvnuSwapIntent(
          {
            action:
              "swap",

            fromAssetId:
              assets
                .STARKNET_SEPOLIA_USDC
                .id,

            toAssetId:
              assets
                .STARKNET_SEPOLIA_STRK
                .id,

            amount:
              5n,

            privacy:
              "public",
          },
          {
            chainId:
              chains
                .STARKNET_SEPOLIA
                .chainId,

            account:
              "0x456",
          },
        ),
      true,
    );
  },
);


test(
  "AVNU public adapter rejects privacy routes, invalid amounts and wrong chains",
  () => {
    for (
      const invalid of [
        {
          ...mainnetSwap,

          privacy:
            "private",
        },

        {
          ...mainnetSwap,

          privacy:
            "auto",
        },

        {
          ...mainnetSwap,

          amount:
            0n,
        },

        {
          ...mainnetSwap,

          toAssetId:
            mainnetSwap
              .fromAssetId,
        },
      ]
    ) {
      assert.equal(
        avnu
          .supportsAvnuSwapIntent(
            invalid,
            mainnetContext,
          ),
        false,
      );
    }

    assert.equal(
      avnu
        .supportsAvnuSwapIntent(
          mainnetSwap,
          {
            ...mainnetContext,

            chainId:
              chains
                .STARKNET_SEPOLIA
                .chainId,
          },
        ),
      false,
    );

    assert.equal(
      avnu
        .supportsAvnuSwapIntent(
          mainnetSwap,
          {
            chainId:
              mainnetContext
                .chainId,
          },
        ),
      false,
    );
  },
);


test(
  "AVNU adapter delegates execution and normalizes its generic receipt",
  async () => {
    let observedIntent =
      null;

    let observedContext =
      null;

    const adapter =
      avnu
        .createAvnuSwapExecutionAdapter(
          async (
            intent,
            context,
          ) => {
            observedIntent =
              intent;

            observedContext =
              context;

            return {
              transactionId:
                "0xabc",

              status:
                "confirmed",
            };
          },
        );

    const receipt =
      await adapter.execute(
        mainnetSwap,
        mainnetContext,
      );

    assert.equal(
      observedIntent,
      mainnetSwap,
    );

    assert.equal(
      observedContext,
      mainnetContext,
    );

    assert.deepEqual(
      receipt,
      {
        adapterId:
          avnu
            .AVNU_SWAP_ADAPTER_ID,

        provider:
          "AVNU",

        transactionId:
          "0xabc",

        status:
          "confirmed",
      },
    );
  },
);


test(
  "AVNU adapter rejects unsupported execution before invoking its executor",
  async () => {
    let calls =
      0;

    const adapter =
      avnu
        .createAvnuSwapExecutionAdapter(
          async () => {
            calls +=
              1;

            return {
              status:
                "submitted",
            };
          },
        );

    await assert.rejects(
      adapter.execute(
        {
          ...mainnetSwap,

          privacy:
            "private",
        },
        mainnetContext,
      ),
      /does not support/i,
    );

    assert.equal(
      calls,
      0,
    );
  },
);


test(
  "generic Starknet registry selects AVNU for Swap and Vesu for Borrow",
  () => {
    const adapters =
      starknetAdapters
        .createStarknetExecutionAdapters({
          avnuSwap:
            async () => ({
              transactionId:
                "0xswap",

              status:
                "submitted",
            }),

          vesuBorrow:
            async () => ({
              transactionId:
                "0xborrow",

              status:
                "submitted",
            }),
        });

    const registered =
      registry
        .createExecutionAdapterRegistry(
          adapters,
        );

    assert.deepEqual(
      [
        ...registered.keys(),
      ],
      [
        avnu
          .AVNU_SWAP_ADAPTER_ID,

        vesu
          .VESU_BORROW_ADAPTER_ID,
      ],
    );

    const swap =
      routes
        .selectExecutionAdapter(
          mainnetSwap,
          mainnetContext,
          [
            ...registered.values(),
          ],
          "starknet",
        );

    assert.equal(
      swap?.id,
      avnu
        .AVNU_SWAP_ADAPTER_ID,
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
          [
            ...registered.values(),
          ],
          "starknet",
        );

    assert.equal(
      borrow?.id,
      vesu
        .VESU_BORROW_ADAPTER_ID,
    );
  },
);
