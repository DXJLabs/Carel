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


const chains =
  require(
    "../lib/carel/chains.ts",
  );

const assets =
  require(
    "../lib/carel/assets.ts",
  );

const evmChains =
  require(
    "../lib/carel/ecosystems/evm/chains.ts",
  );

const evmAssets =
  require(
    "../lib/carel/ecosystems/evm/assets.ts",
  );

const solanaChains =
  require(
    "../lib/carel/ecosystems/solana/chains.ts",
  );

const solanaAssets =
  require(
    "../lib/carel/ecosystems/solana/assets.ts",
  );


test(
  "global CAREL chain registry spans four ecosystems",
  () => {
    assert.deepEqual(
      new Set(
        chains.CAREL_CHAINS.map(
          (chain) =>
            chain.ecosystem,
        ),
      ),
      new Set([
        "starknet",
        "bitcoin",
        "evm",
        "solana",
      ]),
    );

    assert.equal(
      new Set(
        chains.CAREL_CHAINS.map(
          (chain) =>
            chain.id,
        ),
      ).size,
      chains.CAREL_CHAINS.length,
    );
  },
);


test(
  "EVM chain resolution accepts decimal and hexadecimal wallet ids",
  () => {
    assert.equal(
      evmChains
        .getEvmChain("1")
        ?.id,
      evmChains
        .ETHEREUM_MAINNET
        .id,
    );

    assert.equal(
      evmChains
        .getEvmChain("0x1")
        ?.id,
      evmChains
        .ETHEREUM_MAINNET
        .id,
    );

    assert.equal(
      evmChains
        .getEvmChain("0xaa36a7")
        ?.id,
      evmChains
        .ETHEREUM_SEPOLIA
        .id,
    );
  },
);


test(
  "Ethereum native assets use generic CAREL asset semantics",
  () => {
    assert.equal(
      evmAssets
        .ETHEREUM_MAINNET_ETH
        .identifier.kind,
      "native",
    );

    assert.equal(
      evmAssets
        .ETHEREUM_MAINNET_ETH
        .decimals,
      18,
    );
  },
);


test(
  "Solana chain and native SOL use generic CAREL semantics",
  () => {
    assert.equal(
      solanaChains
        .getSolanaChain(
          "mainnet-beta",
        )
        ?.id,
      solanaChains
        .SOLANA_MAINNET
        .id,
    );

    assert.equal(
      solanaAssets
        .SOLANA_MAINNET_SOL
        .identifier.kind,
      "native",
    );

    assert.equal(
      solanaAssets
        .SOLANA_MAINNET_SOL
        .decimals,
      9,
    );
  },
);


test(
  "global asset lookup resolves ETH within its concrete EVM chain",
  () => {
    const eth =
      assets
        .findCarelAssetBySymbol(
          evmChains
            .ETHEREUM_MAINNET
            .chainId,
          "ETH",
        );

    assert.equal(
      eth?.id,
      evmAssets
        .ETHEREUM_MAINNET_ETH
        .id,
    );
  },
);


test(
  "global asset lookup resolves SOL within its concrete Solana chain",
  () => {
    const sol =
      assets
        .findCarelAssetBySymbol(
          solanaChains
            .SOLANA_MAINNET
            .chainId,
          "SOL",
        );

    assert.equal(
      sol?.id,
      solanaAssets
        .SOLANA_MAINNET_SOL
        .id,
    );
  },
);
