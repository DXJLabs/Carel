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
  "Shield Swap and Unshield Staking resolve to staged Agent plans",
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
      "plan",
    );

    assert.equal(
      unshieldStake.kind,
      "plan",
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
  "Unshield Borrow resolves to a staged Agent plan",
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
      "plan",
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
  "Vesu Lend resolves to its staged Agent plan",
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
      "plan",
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

    const borrowControllerPath =
      path.join(
        ROOT,
        "components/borrow/useBorrowController.ts",
      );

    const controllerSource =
      fs.existsSync(
        borrowControllerPath,
      )
        ? fs.readFileSync(
            borrowControllerPath,
            "utf8",
          )
        : source;

    const borrowViewPath =
      path.join(
        ROOT,
        "components/borrow/BorrowView.tsx",
      );

    const viewSource =
      fs.existsSync(
        borrowViewPath,
      )
        ? fs.readFileSync(
            borrowViewPath,
            "utf8",
          )
        : source;

    const borrowRuntimePath =
      path.join(
        ROOT,
        "components/borrow/runtime.ts",
      );

    const runtimeSource =
      fs.existsSync(
        borrowRuntimePath,
      )
        ? fs.readFileSync(
            borrowRuntimePath,
            "utf8",
          )
        : source;

    if (
      fs.existsSync(
        borrowRuntimePath,
      )
    ) {
      assert.match(
        controllerSource,
        /createVesuBorrowRuntime\(/,
      );
    }

    /*
     * Borrow execution is Agent-native:
     * - borrow-1 is submitted through the generic Agent executor;
     * - the Starknet Borrow runtime delegates the reviewed Vesu payload
     *   to the guarded wallet boundary;
     * - shield-2 remains a separate STRK20 transaction.
     */
    assert.match(
      runtimeSource,
      /createStarknetBorrowRuntime\(/,
    );

    assert.match(
      controllerSource,
      /executeAgentStage\([\s\S]*"borrow-1"/,
    );

    assert.match(
      controllerSource,
      /executeAgentStage\([\s\S]*"shield-2"/,
    );

    assert.match(
      runtimeSource,
      /async executeBorrow[\s\S]*await wallet[\s\S]*\.executeBorrow\(/,
    );

    assert.match(
      runtimeSource,
      /async executeShieldAsset[\s\S]*return wallet[\s\S]*\.executeShieldAsset\(/,
    );

    assert.match(
      viewSource,
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
      "plan",
    );

    assert.equal(
      decision.tool,
      "Borrow",
    );
  },
);



test(
  "Garden Bridge UI creates provider orders through Agent Core",
  () => {
    const source =
      fs.readFileSync(
        path.join(
          ROOT,
          "components/bridge/GardenBridge.tsx",
        ),
        "utf8",
      );

    assert.match(
      source,
      /buildBridgeAgentPlan\(/,
    );

    assert.match(
      source,
      /createGardenBridgeAgentRuntime\(/,
    );

    assert.match(
      source,
      /executeAgentStage\([\s\S]*"bridge-1"/,
    );

    assert.match(
      source,
      /executionReference[\s\S]*provider-order/,
    );

    assert.match(
      source,
      /confirmSubmittedStage\(/,
    );
  },
);


test(
  "Staking UI is Agent-native and discovers assets from provider capabilities",
  () => {
    const wrapper =
      fs.readFileSync(
        path.join(
          ROOT,
          "components/staking/AvnuStaking.tsx",
        ),
        "utf8",
      );

    const controller =
      fs.readFileSync(
        path.join(
          ROOT,
          "components/staking/useStakingController.ts",
        ),
        "utf8",
      );

    const runtime =
      fs.readFileSync(
        path.join(
          ROOT,
          "components/staking/runtime.ts",
        ),
        "utf8",
      );

    const discovery =
      fs.readFileSync(
        path.join(
          ROOT,
          "lib/carel/ecosystems/starknet/staking-assets.ts",
        ),
        "utf8",
      );


    assert.match(
      wrapper,
      /useStakingController\(/,
    );

    assert.match(
      controller,
      /getStarknetStakingAssetOptions\(/,
    );

    assert.match(
      controller,
      /buildStarknetAgentPlan\(/,
    );

    assert.match(
      controller,
      /executeAgentStage\(/,
    );

    assert.match(
      runtime,
      /createStarknetStakingRuntime\(/,
    );

    assert.match(
      runtime,
      /\.executeUnshieldAsset\(/,
    );

    assert.match(
      discovery,
      /CAREL_EXECUTION_CAPABILITY_REGISTRY/,
    );

    assert.doesNotMatch(
      wrapper,
      /network\.assets\.strk/,
    );
  },
);


test(
  "Vesu Lend UI routes multi-asset execution through Agent Core",
  () => {
    const source =
      fs.readFileSync(
        path.join(
          ROOT,
          "components/lending/VesuLend.tsx",
        ),
        "utf8",
      );

    const runtime =
      fs.readFileSync(
        path.join(
          ROOT,
          "components/lending/runtime.ts",
        ),
        "utf8",
      );


    assert.match(
      source,
      /buildStarknetAgentPlan\(/,
    );

    assert.match(
      source,
      /createLiveVesuLendRuntime\(/,
    );

    assert.match(
      source,
      /executeAgentStage\(/,
    );

    assert.match(
      source,
      /confirmSubmittedStage\(/,
    );


    assert.doesNotMatch(
      source,
      /wallet\.executeLend\(/,
    );

    assert.doesNotMatch(
      source,
      /wallet\.executeShieldLend\(/,
    );

    assert.doesNotMatch(
      source,
      /wallet\.executeUnshieldAsset\(/,
    );


    assert.match(
      runtime,
      /createStarknetLendRuntime\(/,
    );

    assert.match(
      runtime,
      /\.executeLend\(/,
    );

    assert.match(
      runtime,
      /\.executeShieldLend\(/,
    );

    assert.match(
      runtime,
      /\.executeUnshieldAsset\(/,
    );

    assert.match(
      runtime,
      /readVesuLendingPosition\(/,
    );
  },
);


test(
  "all primary Agent execution surfaces pass through the shared fee gate",
  () => {
    const surfaces = [
      "components/swap/useSwapController.ts",
      "components/borrow/useBorrowController.ts",
      "components/staking/useStakingController.ts",
      "components/lending/VesuLend.tsx",
      "components/bridge/GardenBridge.tsx",
    ];


    for (
      const relative
      of surfaces
    ) {
      const source =
        fs.readFileSync(
          path.join(
            ROOT,
            relative,
          ),
          "utf8",
        );


      assert.match(
        source,
        /createAgentFeeGateCoordinator\(/,
        relative,
      );


      assert.match(
        source,
        /\.prepare\([\s\S]*executeAgentFee/,
        relative,
      );


      assert.match(
        source,
        /\.markProtocolStarted\(/,
        relative,
      );
    }
  },
);
