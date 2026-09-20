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


const providerHelpers =
  require(
    "../lib/carel/ecosystems/evm/provider.ts",
  );

const wallet =
  require(
    "../lib/carel/ecosystems/evm/wallet.ts",
  );

const balances =
  require(
    "../lib/carel/ecosystems/evm/balances.ts",
  );

const chains =
  require(
    "../lib/carel/ecosystems/evm/chains.ts",
  );


const ACCOUNT =
  "0x1234567890abcdef1234567890abcdef12345678";


test(
  "EVM address normalization validates exact 20-byte accounts",
  () => {
    assert.equal(
      providerHelpers
        .normalizeEvmAddress(
          ACCOUNT.toUpperCase()
            .replace(
              "0X",
              "0x",
            ),
        ),
      ACCOUNT,
    );

    assert.throws(
      () =>
        providerHelpers
          .normalizeEvmAddress(
            "0x1234",
          ),
      /invalid evm account/i,
    );
  },
);


test(
  "EVM wallet connection resolves account and CAREL chain",
  async () => {
    const methods = [];

    const provider = {
      async request(
        request,
      ) {
        methods.push(
          request.method,
        );

        if (
          request.method ===
          "eth_requestAccounts"
        ) {
          return [
            ACCOUNT,
          ];
        }

        if (
          request.method ===
          "eth_chainId"
        ) {
          return "0x1";
        }

        throw new Error(
          "Unexpected request.",
        );
      },
    };

    const session =
      await wallet
        .connectEvmWallet(
          provider,
        );

    assert.equal(
      session.account,
      ACCOUNT,
    );

    assert.equal(
      session.chain.id,
      chains
        .ETHEREUM_MAINNET
        .id,
    );

    assert.deepEqual(
      methods,
      [
        "eth_requestAccounts",
        "eth_chainId",
      ],
    );
  },
);


test(
  "unsupported EVM wallet chain fails closed",
  async () => {
    const provider = {
      async request(
        request,
      ) {
        if (
          request.method ===
          "eth_requestAccounts"
        ) {
          return [
            ACCOUNT,
          ];
        }

        return "0x2105";
      },
    };

    await assert.rejects(
      wallet
        .connectEvmWallet(
          provider,
        ),
      /unsupported carel evm chain/i,
    );
  },
);


test(
  "native ETH balance preserves uint256 precision",
  async () => {
    const expected =
      (1n << 200n) +
      12345n;

    const provider = {
      async request(
        request,
      ) {
        assert.equal(
          request.method,
          "eth_getBalance",
        );

        assert.deepEqual(
          request.params,
          [
            ACCOUNT,
            "latest",
          ],
        );

        return `0x${expected.toString(
          16,
        )}`;
      },
    };

    assert.equal(
      await balances
        .readEvmNativeBalance(
          provider,
          ACCOUNT,
        ),
      expected,
    );
  },
);


test(
  "network switch uses EIP-1193 hexadecimal chain id",
  async () => {
    let captured = null;

    const provider = {
      async request(
        request,
      ) {
        captured =
          request;

        return null;
      },
    };

    await wallet
      .switchEvmWalletChain(
        provider,
        chains
          .ETHEREUM_SEPOLIA,
      );

    assert.deepEqual(
      captured,
      {
        method:
          "wallet_switchEthereumChain",

        params: [
          {
            chainId:
              "0xaa36a7",
          },
        ],
      },
    );
  },
);
