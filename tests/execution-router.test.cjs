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

const adapters =
  require(
    "../lib/carel/core/adapters.ts",
  );

const routes =
  require(
    "../lib/carel/core/routes.ts",
  );

function adapter({
  id,
  ecosystems = [
    "starknet",
  ],
  actions = [
    "swap",
  ],
  supports = () =>
    true,
}) {
  return {
    id,
    ecosystems,
    actions,
    supports,

    async execute() {
      return {
        adapterId:
          id,

        provider:
          id,

        status:
          "submitted",
      };
    },
  };
}

const swapIntent = {
  action:
    "swap",

  fromAssetId:
    "starknet:mainnet:STRK",

  toAssetId:
    "starknet:mainnet:USDC",

  amount:
    1n,

  privacy:
    "public",
};

const context = {
  chainId:
    "SN_MAIN",

  account:
    "0x123",
};


test(
  "adapter registry rejects duplicate ids and invalid capabilities",
  () => {
    assert.throws(
      () =>
        adapters
          .createExecutionAdapterRegistry([
            adapter({
              id:
                "same",
            }),

            adapter({
              id:
                "same",
            }),
          ]),
      /duplicate/i,
    );

    assert.throws(
      () =>
        adapters
          .createExecutionAdapterRegistry([
            adapter({
              id:
                "empty-actions",

              actions:
                [],
            }),
          ]),
      /at least one CAREL action/i,
    );

    assert.throws(
      () =>
        adapters
          .createExecutionAdapterRegistry([
            adapter({
              id:
                "empty-ecosystems",

              ecosystems:
                [],
            }),
          ]),
      /at least one ecosystem/i,
    );
  },
);


test(
  "registry filters adapters by action and ecosystem",
  () => {
    const registry =
      adapters
        .createExecutionAdapterRegistry([
          adapter({
            id:
              "starknet-swap",

            ecosystems:
              ["starknet"],

            actions:
              ["swap"],
          }),

          adapter({
            id:
              "cross-chain-bridge",

            ecosystems: [
              "bitcoin",
              "starknet",
            ],

            actions:
              ["bridge"],
          }),

          adapter({
            id:
              "evm-swap",

            ecosystems:
              ["evm"],

            actions:
              ["swap"],
          }),
        ]);

    assert.deepEqual(
      adapters
        .listExecutionAdapters(
          registry,
          {
            action:
              "swap",

            ecosystem:
              "starknet",
          },
        )
        .map(
          item =>
            item.id,
        ),
      [
        "starknet-swap",
      ],
    );

    assert.deepEqual(
      adapters
        .listExecutionAdapters(
          registry,
          {
            ecosystem:
              "bitcoin",
          },
        )
        .map(
          item =>
            item.id,
        ),
      [
        "cross-chain-bridge",
      ],
    );
  },
);


test(
  "bridge adapters may declare multiple ecosystems",
  () => {
    const bridge =
      adapter({
        id:
          "bitcoin-starknet",

        ecosystems: [
          "bitcoin",
          "starknet",
        ],

        actions:
          ["bridge"],
      });

    assert.equal(
      bridge.ecosystems.includes(
        "bitcoin",
      ),
      true,
    );

    assert.equal(
      bridge.ecosystems.includes(
        "starknet",
      ),
      true,
    );
  },
);


test(
  "router skips adapters that do not declare the intent action",
  () => {
    let wrongSupportsCalls =
      0;

    const wrong =
      adapter({
        id:
          "borrow-only",

        actions:
          ["borrow"],

        supports() {
          wrongSupportsCalls +=
            1;

          return true;
        },
      });

    const right =
      adapter({
        id:
          "swap",

        actions:
          ["swap"],
      });

    const selected =
      routes
        .selectExecutionAdapter(
          swapIntent,
          context,
          [
            wrong,
            right,
          ],
          "starknet",
        );

    assert.equal(
      selected?.id,
      "swap",
    );

    assert.equal(
      wrongSupportsCalls,
      0,
    );
  },
);


test(
  "router applies ecosystem filter before dynamic supports",
  () => {
    let evmSupportsCalls =
      0;

    const evm =
      adapter({
        id:
          "evm",

        ecosystems:
          ["evm"],

        supports() {
          evmSupportsCalls +=
            1;

          return true;
        },
      });

    const starknet =
      adapter({
        id:
          "starknet",

        ecosystems:
          ["starknet"],
      });

    const selected =
      routes
        .selectExecutionAdapter(
          swapIntent,
          context,
          [
            evm,
            starknet,
          ],
          "starknet",
        );

    assert.equal(
      selected?.id,
      "starknet",
    );

    assert.equal(
      evmSupportsCalls,
      0,
    );
  },
);


test(
  "router chooses the first dynamically compatible adapter",
  () => {
    const unavailable =
      adapter({
        id:
          "unavailable",

        supports:
          () => false,
      });

    const available =
      adapter({
        id:
          "available",

        supports:
          (
            intent,
            current,
          ) =>
            intent.action ===
              "swap" &&
            current.chainId ===
              "SN_MAIN",
      });

    assert.equal(
      routes
        .selectExecutionAdapter(
          swapIntent,
          context,
          [
            unavailable,
            available,
          ],
          "starknet",
        )?.id,
      "available",
    );

    assert.equal(
      routes
        .selectExecutionAdapter(
          swapIntent,
          {
            chainId:
              "OTHER",
          },
          [
            unavailable,
            available,
          ],
          "starknet",
        ),
      null,
    );
  },
);
