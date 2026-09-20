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


const workspace =
  require(
    "../lib/agent/workspace.ts",
  );

const carel =
  require(
    "../lib/carel/adapters.ts",
  );

const chains =
  require(
    "../lib/carel/ecosystems/starknet/chains.ts",
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

const registry =
  carel
    .CAREL_EXECUTION_CAPABILITY_REGISTRY;


test(
  "connected Workspace preview selects AVNU Swap through capability registry",
  () => {
    const result =
      workspace
        .resolveWorkspaceAgentGoal({
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
      result.kind,
      "execution",
    );

    assert.equal(
      result.tool,
      "Swap",
    );

    assert.equal(
      result.adapterId,
      avnuSwap
        .AVNU_SWAP_ADAPTER_ID,
    );
  },
);


test(
  "Workspace preview distinguishes public and Shield Staking providers",
  () => {
    const publicStake =
      workspace
        .resolveWorkspaceAgentGoal({
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

    const shieldStake =
      workspace
        .resolveWorkspaceAgentGoal({
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
      publicStake.adapterId,
      avnuStake
        .AVNU_STAKING_ADAPTER_ID,
    );

    assert.equal(
      shieldStake.adapterId,
      endur
        .ENDUR_SHIELD_STAKING_ADAPTER_ID,
    );
  },
);


test(
  "disconnected Workspace still compiles a valid execution goal",
  () => {
    const result =
      workspace
        .resolveWorkspaceAgentGoal({
          goal:
            "Swap 1 STRK for USDC.",

          chainId:
            chains
              .STARKNET_MAINNET
              .chainId,

          mode:
            "normal",

          registry,
        });

    assert.equal(
      result.kind,
      "execution",
    );

    assert.equal(
      result.status,
      "ready",
    );

    assert.equal(
      result.adapterId,
      undefined,
    );
  },
);


test(
  "BTC to Starknet preview opens Bridge input without guessing an adapter",
  () => {
    const result =
      workspace
        .resolveWorkspaceAgentGoal({
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

          registry,
        });

    assert.equal(
      result.kind,
      "execution",
    );

    assert.equal(
      result.tool,
      "Bridge",
    );

    assert.equal(
      result.status,
      "needs-input",
    );

    assert.equal(
      result.adapterId,
      undefined,
    );
  },
);


test(
  "existing Shield Swap and Unshield Staking remain explicit reviewed flows",
  () => {
    const shieldSwap =
      workspace
        .resolveWorkspaceAgentGoal({
          goal:
            "Swap 1 STRK for USDC.",

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

    const unshieldStake =
      workspace
        .resolveWorkspaceAgentGoal({
          goal:
            "Stake 1 STRK.",

          chainId:
            chains
              .STARKNET_MAINNET
              .chainId,

          account:
            "0x123",

          mode:
            "unshield",

          registry,
        });

    assert.equal(
      shieldSwap.kind,
      "explicit",
    );

    assert.equal(
      unshieldStake.kind,
      "explicit",
    );
  },
);


test(
  "unsupported Bridge destinations do not fall through to Garden UI",
  () => {
    const result =
      workspace
        .resolveWorkspaceAgentGoal({
          goal:
            "Bridge 1 ETH to Base.",

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
      result.kind,
      "error",
    );

    assert.equal(
      result.tool,
      "Bridge",
    );
  },
);



test(
  "Unshield Borrow remains an explicit reviewed multi-stage flow",
  () => {
    const result =
      workspace
        .resolveWorkspaceAgentGoal({
          goal:
            "Borrow 10 USDC against 1000 STRK.",

          chainId:
            chains
              .STARKNET_MAINNET
              .chainId,

          account:
            "0x123",

          mode:
            "unshield",

          registry,
        });

    assert.equal(
      result.kind,
      "explicit",
    );

    assert.equal(
      result.tool,
      "Borrow",
    );

    assert.equal(
      result.adapterId,
      undefined,
    );
  },
);



test(
  "Vesu Lend remains an explicit reviewed execution flow",
  () => {
    const result =
      workspace
        .resolveWorkspaceAgentGoal({
          goal:
            "Lend 10 STRK.",

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
      result.kind,
      "explicit",
    );

    assert.equal(
      result.tool,
      "Lend",
    );
  },
);



test(
  "Shield Borrow keeps public Borrow and private Shield as separate stages",
  () => {
    const source =
      fs.readFileSync(
        path.join(
          ROOT,
          "components/borrow/VesuBorrow.tsx",
        ),
        "utf8",
      );

    assert.match(
      source,
      /await wallet\.executeBorrow\(/,
    );

    assert.match(
      source,
      /await wallet[\s\S]*\.executeShieldAsset\(/,
    );

    assert.match(
      source,
      /Vesu collateral and debt[\s\S]*remain public/,
    );

    const decision =
      workspace
        .resolveWorkspaceAgentGoal({
          goal:
            "Borrow 10 USDC against 1000 STRK.",

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
      decision.kind,
      "explicit",
    );

    assert.equal(
      decision.tool,
      "Borrow",
    );
  },
);
