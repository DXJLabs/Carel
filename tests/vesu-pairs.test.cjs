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

const pairs =
  require(
    "../lib/carel/ecosystems/starknet/protocols/vesu/pairs.ts",
  );

const assets =
  require(
    "../lib/carel/ecosystems/starknet/assets.ts",
  );

const adapter =
  require(
    "../lib/carel/ecosystems/starknet/protocols/vesu/adapter.ts",
  );

const chains =
  require(
    "../lib/carel/ecosystems/starknet/chains.ts",
  );


test(
  "Vesu debt candidate registry includes multiple Mainnet assets",
  () => {
    assert.deepEqual(
      pairs
        .VESU_BORROW_DEBT_ASSETS
        .map(
          (asset) =>
            asset.symbol,
        ),
      [
        "USDC",
        "ETH",
        "USDT",
        "WBTC",
        "strkBTC",
      ],
    );
  },
);


test(
  "Vesu pair boundary keeps collateral on STRK",
  () => {
    assert.ok(
      pairs.getVesuBorrowPair(
        assets
          .STARKNET_MAINNET_STRK
          .id,
        assets
          .STARKNET_MAINNET_WBTC
          .id,
      ),
    );

    assert.equal(
      pairs.getVesuBorrowPair(
        assets
          .STARKNET_MAINNET_WBTC
          .id,
        assets
          .STARKNET_MAINNET_USDC
          .id,
      ),
      null,
    );
  },
);


test(
  "Vesu capability accepts a registered non-USDC debt candidate",
  () => {
    assert.equal(
      adapter
        .supportsVesuBorrowIntent(
          {
            action:
              "borrow",

            collateralAssetId:
              assets
                .STARKNET_MAINNET_STRK
                .id,

            borrowAssetId:
              assets
                .STARKNET_MAINNET_WBTC
                .id,

            collateralAmount:
              5n *
              10n ** 18n,

            borrowAmount:
              1n,

            privacy:
              "public",
          },
          {
            chainId:
              chains
                .STARKNET_MAINNET
                .chainId,

            account:
              "0x123",
          },
        ),
      true,
    );
  },
);
