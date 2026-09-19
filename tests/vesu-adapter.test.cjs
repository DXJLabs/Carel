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


const intent = {
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
};

const context = {
  chainId:
    chains
      .STARKNET_MAINNET
      .chainId,

  account:
    "0x123",
};


test(
  "Vesu adapter supports the existing Mainnet STRK to USDC public Borrow",
  () => {
    assert.equal(
      vesu
        .supportsVesuBorrowIntent(
          intent,
          context,
        ),
      true,
    );
  },
);


test(
  "Vesu adapter rejects incompatible network, privacy, assets and amounts",
  () => {
    assert.equal(
      vesu
        .supportsVesuBorrowIntent(
          intent,
          {
            ...context,

            chainId:
              chains
                .STARKNET_SEPOLIA
                .chainId,
          },
        ),
      false,
    );

    assert.equal(
      vesu
        .supportsVesuBorrowIntent(
          {
            ...intent,

            privacy:
              "private",
          },
          context,
        ),
      false,
    );

    assert.equal(
      vesu
        .supportsVesuBorrowIntent(
          {
            ...intent,

            borrowAssetId:
              assets
                .STARKNET_MAINNET_STRK
                .id,
          },
          context,
        ),
      false,
    );

    assert.equal(
      vesu
        .supportsVesuBorrowIntent(
          {
            ...intent,

            borrowAmount:
              0n,
          },
          context,
        ),
      false,
    );

    assert.equal(
      vesu
        .supportsVesuBorrowIntent(
          intent,
          {
            chainId:
              context.chainId,
          },
        ),
      false,
    );
  },
);


test(
  "Starknet adapter collection registers Vesu through the generic registry",
  () => {
    const adapters =
      starknetAdapters
        .createStarknetExecutionAdapters({
          vesuBorrow:
            async () => ({
              transactionId:
                "0xabc",

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
        vesu
          .VESU_BORROW_ADAPTER_ID,
      ],
    );

    const selected =
      routes
        .selectExecutionAdapter(
          intent,
          context,
          [
            ...registered.values(),
          ],
          "starknet",
        );

    assert.equal(
      selected?.id,
      vesu
        .VESU_BORROW_ADAPTER_ID,
    );
  },
);


test(
  "Vesu adapter delegates execution and normalizes the generic receipt",
  async () => {
    let observedIntent =
      null;

    let observedContext =
      null;

    const adapter =
      vesu
        .createVesuBorrowExecutionAdapter(
          async (
            nextIntent,
            nextContext,
          ) => {
            observedIntent =
              nextIntent;

            observedContext =
              nextContext;

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
        intent,
        context,
      );

    assert.equal(
      observedIntent,
      intent,
    );

    assert.equal(
      observedContext,
      context,
    );

    assert.deepEqual(
      receipt,
      {
        adapterId:
          vesu
            .VESU_BORROW_ADAPTER_ID,

        provider:
          "Vesu",

        transactionId:
          "0xabc",

        status:
          "confirmed",
      },
    );
  },
);


test(
  "Vesu adapter refuses unsupported execution before calling the executor",
  async () => {
    let calls =
      0;

    const adapter =
      vesu
        .createVesuBorrowExecutionAdapter(
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
          ...intent,

          privacy:
            "private",
        },
        context,
      ),
      /does not support/i,
    );

    assert.equal(
      calls,
      0,
    );
  },
);
