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


const surfaces =
  require(
    "../lib/carel/runtime/surfaces.ts",
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


test(
  "AVNU Swap adapter selects Swap runtime surface",
  () => {
    assert.equal(
      surfaces
        .runtimeSurfaceForAdapter(
          avnuSwap
            .AVNU_SWAP_ADAPTER_ID,
        ),
      "swap",
    );
  },
);


test(
  "public AVNU and private Endur staking share reviewed Staking surface",
  () => {
    assert.equal(
      surfaces
        .runtimeSurfaceForAdapter(
          avnuStake
            .AVNU_STAKING_ADAPTER_ID,
        ),
      "staking",
    );

    assert.equal(
      surfaces
        .runtimeSurfaceForAdapter(
          endur
            .ENDUR_SHIELD_STAKING_ADAPTER_ID,
        ),
      "staking",
    );
  },
);


test(
  "Vesu Borrow adapter selects Borrow runtime surface",
  () => {
    assert.equal(
      surfaces
        .runtimeSurfaceForAdapter(
          vesu
            .VESU_BORROW_ADAPTER_ID,
        ),
      "borrow",
    );
  },
);


test(
  "Garden adapter selects Bridge runtime surface",
  () => {
    assert.equal(
      surfaces
        .runtimeSurfaceForAdapter(
          garden
            .GARDEN_BRIDGE_ADAPTER_ID,
        ),
      "bridge",
    );
  },
);


test(
  "unknown adapters fail closed while manual tool navigation still has fallback",
  () => {
    assert.equal(
      surfaces
        .runtimeSurfaceForAdapter(
          "evm:future:swap",
        ),
      null,
    );

    assert.equal(
      surfaces
        .fallbackRuntimeSurface(
          "Swap",
        ),
      "swap",
    );

    assert.equal(
      surfaces
        .fallbackRuntimeSurface(
          null,
        ),
      null,
    );
  },
);
