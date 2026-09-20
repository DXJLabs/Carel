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

const agent =
  require(
    "../lib/agent/execution.ts",
  );

const assets =
  require(
    "../lib/carel/ecosystems/starknet/assets.ts",
  );

const chains =
  require(
    "../lib/carel/ecosystems/starknet/chains.ts",
  );

const avnu =
  require(
    "../lib/carel/ecosystems/starknet/protocols/avnu/adapter.ts",
  );

const endur =
  require(
    "../lib/carel/ecosystems/starknet/protocols/endur/adapter.ts",
  );


test(
  "planning capability registry exposes current CAREL providers without executors",
  () => {
    const registry =
      carel
        .CAREL_EXECUTION_CAPABILITY_REGISTRY;

    assert.equal(
      registry.size,
      5,
    );

    for (
      const capability
      of registry.values()
    ) {
      assert.equal(
        "execute" in capability,
        false,
      );
    }
  },
);


test(
  "Agent preview selects AVNU from capabilities without an execution dependency",
  () => {
    const result =
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

          registry:
            carel
              .CAREL_EXECUTION_CAPABILITY_REGISTRY,
        });

    assert.equal(
      result.status,
      "ready",
    );

    assert.equal(
      result.adapterId,
      avnu
        .AVNU_SWAP_ADAPTER_ID,
    );
  },
);


test(
  "planning capabilities distinguish public staking from Shield Staking",
  () => {
    const publicStake =
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

          registry:
            carel
              .CAREL_EXECUTION_CAPABILITY_REGISTRY,
        });

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

          registry:
            carel
              .CAREL_EXECUTION_CAPABILITY_REGISTRY,
        });

    assert.equal(
      publicStake.adapterId,
      require(
        "../lib/carel/ecosystems/starknet/protocols/avnu/staking-adapter.ts",
      ).AVNU_STAKING_ADAPTER_ID,
    );

    assert.equal(
      shieldStake.adapterId,
      endur
        .ENDUR_SHIELD_STAKING_ADAPTER_ID,
    );
  },
);


test(
  "executable adapters reuse their planning capability metadata",
  () => {
    const adapter =
      avnu
        .createAvnuSwapExecutionAdapter(
          async () => ({
            status:
              "submitted",
          }),
        );

    assert.equal(
      adapter.id,
      avnu
        .AVNU_SWAP_CAPABILITY
        .id,
    );

    assert.deepEqual(
      adapter.actions,
      avnu
        .AVNU_SWAP_CAPABILITY
        .actions,
    );

    assert.deepEqual(
      adapter.ecosystems,
      avnu
        .AVNU_SWAP_CAPABILITY
        .ecosystems,
    );

    assert.equal(
      adapter.supports(
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
