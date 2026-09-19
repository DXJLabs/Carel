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
    "../lib/carel/ecosystems/starknet/protocols/avnu/staking-adapter.ts",
  );

const endur =
  require(
    "../lib/carel/ecosystems/starknet/protocols/endur/adapter.ts",
  );

const assets =
  require(
    "../lib/carel/ecosystems/starknet/assets.ts",
  );

const chains =
  require(
    "../lib/carel/ecosystems/starknet/chains.ts",
  );

const starknet =
  require(
    "../lib/carel/ecosystems/starknet/adapters.ts",
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
      .STARKNET_MAINNET
      .chainId,

  account:
    "0x123",
};

const publicStake = {
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
};

const shieldStake = {
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
};


test(
  "AVNU staking adapter supports public Mainnet STRK staking",
  () => {
    assert.equal(
      avnu
        .supportsAvnuStakeIntent(
          publicStake,
          context,
        ),
      true,
    );
  },
);


test(
  "AVNU public staking rejects private, receipt-token and invalid routes",
  () => {
    assert.equal(
      avnu
        .supportsAvnuStakeIntent(
          {
            ...publicStake,
            privacy:
              "private",
          },
          context,
        ),
      false,
    );

    assert.equal(
      avnu
        .supportsAvnuStakeIntent(
          {
            ...publicStake,
            targetAssetId:
              assets
                .STARKNET_MAINNET_XSTRK
                .id,
          },
          context,
        ),
      false,
    );

    assert.equal(
      avnu
        .supportsAvnuStakeIntent(
          {
            ...publicStake,
            amount:
              0n,
          },
          context,
        ),
      false,
    );

    assert.equal(
      avnu
        .supportsAvnuStakeIntent(
          publicStake,
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
  },
);


test(
  "Endur adapter supports explicit STRK to private xSTRK Shield Staking",
  () => {
    assert.equal(
      endur
        .supportsEndurShieldStakeIntent(
          shieldStake,
          context,
        ),
      true,
    );
  },
);


test(
  "Endur Shield Staking rejects public and mismatched routes",
  () => {
    assert.equal(
      endur
        .supportsEndurShieldStakeIntent(
          {
            ...shieldStake,
            privacy:
              "public",
          },
          context,
        ),
      false,
    );

    assert.equal(
      endur
        .supportsEndurShieldStakeIntent(
          {
            ...shieldStake,
            targetAssetId:
              assets
                .STARKNET_MAINNET_USDC
                .id,
          },
          context,
        ),
      false,
    );

    assert.equal(
      endur
        .supportsEndurShieldStakeIntent(
          shieldStake,
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
  "staking adapters delegate execution and normalize receipts",
  async () => {
    const publicAdapter =
      avnu
        .createAvnuStakingExecutionAdapter(
          async () => ({
            transactionId:
              "0xpublic",
            status:
              "submitted",
          }),
        );

    const shieldAdapter =
      endur
        .createEndurShieldStakingExecutionAdapter(
          async () => ({
            transactionId:
              "0xshield",
            status:
              "confirmed",
          }),
        );

    assert.deepEqual(
      await publicAdapter.execute(
        publicStake,
        context,
      ),
      {
        adapterId:
          avnu
            .AVNU_STAKING_ADAPTER_ID,
        provider:
          "AVNU",
        transactionId:
          "0xpublic",
        status:
          "submitted",
      },
    );

    assert.deepEqual(
      await shieldAdapter.execute(
        shieldStake,
        context,
      ),
      {
        adapterId:
          endur
            .ENDUR_SHIELD_STAKING_ADAPTER_ID,
        provider:
          "Endur",
        transactionId:
          "0xshield",
        status:
          "confirmed",
      },
    );
  },
);


test(
  "generic registry selects different staking providers from intent semantics",
  () => {
    const adapters =
      starknet
        .createStarknetExecutionAdapters({
          avnuStake:
            async () => ({
              status:
                "submitted",
            }),

          endurShieldStake:
            async () => ({
              status:
                "submitted",
            }),
        });

    const registered =
      registry
        .createExecutionAdapterRegistry(
          adapters,
        );

    const publicSelected =
      routes
        .selectExecutionAdapter(
          publicStake,
          context,
          [
            ...registered.values(),
          ],
          "starknet",
        );

    const shieldSelected =
      routes
        .selectExecutionAdapter(
          shieldStake,
          context,
          [
            ...registered.values(),
          ],
          "starknet",
        );

    assert.equal(
      publicSelected?.id,
      avnu
        .AVNU_STAKING_ADAPTER_ID,
    );

    assert.equal(
      shieldSelected?.id,
      endur
        .ENDUR_SHIELD_STAKING_ADAPTER_ID,
    );
  },
);
