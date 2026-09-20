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


const agent =
  require(
    "../lib/agent/execution.ts",
  );

const router =
  require(
    "../lib/agent/router.ts",
  );

const carel =
  require(
    "../lib/carel/adapters.ts",
  );

const assets =
  require(
    "../lib/carel/ecosystems/starknet/assets.ts",
  );

const chains =
  require(
    "../lib/carel/ecosystems/starknet/chains.ts",
  );

const gardenAssets =
  require(
    "../lib/carel/protocols/garden/assets.ts",
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


const noop = async () => ({
  status:
    "submitted",
});

const registry =
  carel
    .createCarelExecutionRegistry({
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
    });


test(
  "Agent router parses Swap and Staking without selecting providers",
  () => {
    const swap =
      router
        .routeAgentGoal(
          "Swap 1.5 STRK for USDC.",
        );

    assert.deepEqual(
      swap.swapRequest,
      {
        amountText:
          "1.5",

        fromSymbol:
          "STRK",

        toSymbol:
          "USDC",
      },
    );

    const stake =
      router
        .routeAgentGoal(
          "Stake 2 STRK.",
        );

    assert.deepEqual(
      stake.stakeRequest,
      {
        amountText:
          "2",

        assetSymbol:
          "STRK",
      },
    );

    assert.equal(
      "provider" in swap,
      false,
    );

    assert.equal(
      "provider" in stake,
      false,
    );
  },
);


test(
  "Agent compiles a public Swap into exact registered assets and base units",
  () => {
    const result =
      agent
        .compileAgentExecutionIntent({
          goal:
            "Swap 1.5 STRK for USDC.",

          chainId:
            chains
              .STARKNET_MAINNET
              .chainId,

          mode:
            "normal",
        });

    assert.equal(
      result.status,
      "ready",
    );

    assert.deepEqual(
      result.intent,
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
          1_500_000_000_000_000_000n,

        privacy:
          "public",
      },
    );
  },
);


test(
  "Agent compiles public and Shield Staking into distinct generic intents",
  () => {
    const publicStake =
      agent
        .compileAgentExecutionIntent({
          goal:
            "Stake 2 STRK.",

          chainId:
            chains
              .STARKNET_MAINNET
              .chainId,

          mode:
            "normal",
        });

    const shieldStake =
      agent
        .compileAgentExecutionIntent({
          goal:
            "Stake 2 STRK.",

          chainId:
            chains
              .STARKNET_MAINNET
              .chainId,

          mode:
            "shield",
        });

    assert.equal(
      publicStake
        .intent
        ?.action,
      "stake",
    );

    assert.equal(
      publicStake
        .intent
        ?.privacy,
      "public",
    );

    assert.equal(
      shieldStake
        .intent
        ?.action,
      "stake",
    );

    assert.equal(
      shieldStake
        .intent
        ?.targetAssetId,
      assets
        .STARKNET_MAINNET_XSTRK
        .id,
    );

    assert.equal(
      shieldStake
        .intent
        ?.privacy,
      "private",
    );
  },
);


test(
  "Borrow compilation preserves token decimals before provider selection",
  () => {
    const result =
      agent
        .compileAgentExecutionIntent({
          goal:
            "Borrow 10.5 USDC against 1000 STRK.",

          chainId:
            chains
              .STARKNET_MAINNET
              .chainId,

          mode:
            "normal",
        });

    assert.equal(
      result.status,
      "ready",
    );

    assert.equal(
      result.intent
        ?.action,
      "borrow",
    );

    assert.equal(
      result.intent
        ?.borrowAmount,
      10_500_000n,
    );

    assert.equal(
      result.intent
        ?.collateralAmount,
      1_000_000_000_000_000_000_000n,
    );
  },
);


test(
  "BTC to Starknet bridge never guesses the destination token",
  () => {
    const result =
      agent
        .compileAgentExecutionIntent({
          goal:
            "Bridge 0.0005 BTC to Starknet Sepolia.",

          chainId:
            chains
              .STARKNET_SEPOLIA
              .chainId,

          mode:
            "normal",
        });

    assert.equal(
      result.status,
      "needs-input",
    );

    assert.match(
      result.message,
      /destination asset/i,
    );
  },
);


test(
  "selected bridge asset compiles to satoshis and global registry chooses Garden",
  () => {
    const result =
      agent
        .resolveAgentExecution({
          goal:
            "Bridge 0.0005 BTC to Starknet Sepolia.",

          chainId:
            chains
              .STARKNET_SEPOLIA
              .chainId,

          account:
            "0x123",

          mode:
            "normal",

          bridgeTargetAssetId:
            gardenAssets
              .GARDEN_STARKNET_SEPOLIA_WBTC
              .id,

          registry,
        });

    assert.equal(
      result.status,
      "ready",
    );

    assert.equal(
      result.intent
        ?.action,
      "bridge",
    );

    assert.equal(
      result.intent
        ?.amount,
      50_000n,
    );

    assert.equal(
      result.adapterId,
      garden
        .GARDEN_BRIDGE_ADAPTER_ID,
    );
  },
);


test(
  "global runtime selects adapters from intent semantics instead of Agent provider names",
  () => {
    const swap =
      agent
        .resolveAgentExecution({
          goal:
            "Swap 1 STRK for USDC.",

          chainId:
            chains
              .STARKNET_MAINNET
              .chainId,

          account:
            "0x123",

          mode:
            "normal",

          registry,
        });

    assert.equal(
      swap.adapterId,
      avnuSwap
        .AVNU_SWAP_ADAPTER_ID,
    );


    const stake =
      agent
        .resolveAgentExecution({
          goal:
            "Stake 1 STRK.",

          chainId:
            chains
              .STARKNET_MAINNET
              .chainId,

          account:
            "0x123",

          mode:
            "normal",

          registry,
        });

    assert.equal(
      stake.adapterId,
      avnuStake
        .AVNU_STAKING_ADAPTER_ID,
    );


    const shieldStake =
      agent
        .resolveAgentExecution({
          goal:
            "Stake 1 STRK.",

          chainId:
            chains
              .STARKNET_MAINNET
              .chainId,

          account:
            "0x123",

          mode:
            "shield",

          registry,
        });

    assert.equal(
      shieldStake.adapterId,
      endur
        .ENDUR_SHIELD_STAKING_ADAPTER_ID,
    );


    const borrow =
      agent
        .resolveAgentExecution({
          goal:
            "Borrow 10 USDC against 1000 STRK.",

          chainId:
            chains
              .STARKNET_MAINNET
              .chainId,

          account:
            "0x123",

          mode:
            "normal",

          registry,
        });

    assert.equal(
      borrow.adapterId,
      vesu
        .VESU_BORROW_ADAPTER_ID,
    );
  },
);
