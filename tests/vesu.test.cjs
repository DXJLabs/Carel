const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "..");

/*
 * Load the actual CAREL TypeScript adapters in Node without adding another
 * runtime/test dependency. Also resolves the app's @/ path alias.
 */
require.extensions[".ts"] = (mod, filename) => {
  const source = ts.transpileModule(
    fs.readFileSync(filename, "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
        esModuleInterop: true,
      },
    },
  ).outputText;

  mod._compile(source, filename);
};

const originalResolveFilename = Module._resolveFilename;

Module._resolveFilename = function (
  request,
  parent,
  isMain,
  options,
) {
  const resolved =
    typeof request === "string" &&
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

const borrow = require(
  "../lib/carel/ecosystems/starknet/protocols/vesu/borrow.ts",
);

const collateral = require(
  "../lib/carel/ecosystems/starknet/protocols/vesu/collateral.ts",
);

const lending = require(
  "../lib/carel/ecosystems/starknet/protocols/vesu/lending.ts",
);

const CHAIN = Object.freeze({
  id: "starknet:mainnet",
  ecosystem: "starknet",
  chainId: "SN_MAIN",
  network: "mainnet",
  name: "Starknet Mainnet",
});

const STRK = Object.freeze({
  id: "starknet:mainnet:STRK",
  chain: CHAIN,
  symbol: "STRK",
  name: "Starknet",
  decimals: 18,
  identifier: {
    kind: "contract",
    address: "0x111",
  },
});

const USDC = Object.freeze({
  id: "starknet:mainnet:USDC",
  chain: CHAIN,
  symbol: "USDC",
  name: "USD Coin",
  decimals: 6,
  identifier: {
    kind: "contract",
    address: "0x222",
  },
});

const MARKET = Object.freeze({
  id: "vesu:prime:STRK:USDC",
  chainId: CHAIN.chainId,
  poolAddress: "0x333",
  collateralAsset: STRK,
  debtAsset: USDC,
});

const OWNER = "0x444";

const cloneCalls = calls =>
  structuredClone(calls);

test(
  "Vesu Assets and Native i257 encoding preserves denomination, sign and uint256 limbs",
  () => {
    assert.deepEqual(
      borrow.encodeVesuAssetAmount(
        5n,
      ),
      [
        "1",
        "0x5",
        "0x0",
        "0",
      ],
    );

    assert.deepEqual(
      borrow.encodeVesuAssetAmount(
        -5n,
      ),
      [
        "1",
        "0x5",
        "0x0",
        "1",
      ],
    );

    assert.deepEqual(
      borrow.encodeVesuAssetAmount(
        0n,
      ),
      [
        "1",
        "0x0",
        "0x0",
        "0",
      ],
    );

    assert.deepEqual(
      borrow.encodeVesuNativeAmount(
        -7n,
      ),
      [
        "0",
        "0x7",
        "0x0",
        "1",
      ],
    );

    assert.deepEqual(
      borrow.toUint256Calldata(
        1n << 128n,
      ),
      [
        "0x0",
        "0x1",
      ],
    );
  },
);

test(
  "Borrow uses exact collateral approval and positive Assets deltas",
  () => {
    const intent = {
      action: "borrow",
      collateralAssetId: STRK.id,
      borrowAssetId: USDC.id,
      collateralAmount: 5n,
      borrowAmount: 2n,
      privacy: "public",
    };

    const calls =
      borrow.buildVesuBorrowCalls({
        market: MARKET,
        owner: OWNER,
        intent,
      });

    assert.equal(
      calls.length,
      2,
    );

    assert.equal(
      calls[0].contractAddress,
      STRK.identifier.address,
    );

    assert.equal(
      calls[0].entrypoint,
      "approve",
    );

    assert.deepEqual(
      calls[0].calldata,
      [
        MARKET.poolAddress,
        "0x5",
        "0x0",
      ],
    );

    assert.equal(
      calls[1].entrypoint,
      "modify_position",
    );

    assert.deepEqual(
      calls[1].calldata,
      [
        STRK.identifier.address,
        USDC.identifier.address,
        OWNER,

        // collateral: Assets +5
        "1",
        "0x5",
        "0x0",
        "0",

        // debt: Assets +2
        "1",
        "0x2",
        "0x0",
        "0",
      ],
    );

    assert.deepEqual(
      borrow.validateVesuBorrowCalls({
        calls,
        market: MARKET,
        owner: OWNER,
        intent,
      }),
      calls,
    );
  },
);

test(
  "Borrow validator rejects target, calldata and call-count tampering",
  () => {
    const intent = {
      action: "borrow",
      collateralAssetId: STRK.id,
      borrowAssetId: USDC.id,
      collateralAmount: 5n,
      borrowAmount: 2n,
      privacy: "public",
    };

    const calls =
      borrow.buildVesuBorrowCalls({
        market: MARKET,
        owner: OWNER,
        intent,
      });

    const badTarget =
      cloneCalls(calls);

    badTarget[1].contractAddress =
      "0x999";

    assert.throws(
      () =>
        borrow.validateVesuBorrowCalls({
          calls: badTarget,
          market: MARKET,
          owner: OWNER,
          intent,
        }),
      /blocked/i,
    );

    const badAmount =
      cloneCalls(calls);

    badAmount[0].calldata[1] =
      "0x6";

    assert.throws(
      () =>
        borrow.validateVesuBorrowCalls({
          calls: badAmount,
          market: MARKET,
          owner: OWNER,
          intent,
        }),
      /blocked/i,
    );

    assert.throws(
      () =>
        borrow.validateVesuBorrowCalls({
          calls: [
            ...calls,
            calls[0],
          ],
          market: MARKET,
          owner: OWNER,
          intent,
        }),
      /exactly two/i,
    );
  },
);

test(
  "Borrow rejects private execution and mismatched reviewed assets",
  () => {
    assert.throws(
      () =>
        borrow.buildVesuBorrowCalls({
          market: MARKET,
          owner: OWNER,
          intent: {
            action: "borrow",
            collateralAssetId:
              STRK.id,
            borrowAssetId:
              USDC.id,
            collateralAmount:
              5n,
            borrowAmount:
              2n,
            privacy:
              "private",
          },
        }),
      /private/i,
    );

    assert.throws(
      () =>
        borrow.buildVesuBorrowCalls({
          market: MARKET,
          owner: OWNER,
          intent: {
            action: "borrow",
            collateralAssetId:
              USDC.id,
            borrowAssetId:
              STRK.id,
            collateralAmount:
              5n,
            borrowAmount:
              2n,
            privacy:
              "public",
          },
        }),
      /does not match/i,
    );
  },
);

test(
  "Partial Repay approves exact USDC and encodes negative Assets debt",
  () => {
    const intent = {
      action: "repay",
      assetId: USDC.id,
      amount: 2n,
      positionId: MARKET.id,
      privacy: "public",
    };

    const calls =
      borrow.buildVesuRepayCalls({
        market: MARKET,
        owner: OWNER,
        intent,
      });

    assert.deepEqual(
      calls[0].calldata,
      [
        MARKET.poolAddress,
        "0x2",
        "0x0",
      ],
    );

    assert.deepEqual(
      calls[1].calldata,
      [
        STRK.identifier.address,
        USDC.identifier.address,
        OWNER,

        // collateral unchanged
        "1",
        "0x0",
        "0x0",
        "0",

        // debt: Assets -2
        "1",
        "0x2",
        "0x0",
        "1",
      ],
    );

    assert.deepEqual(
      borrow.validateVesuRepayCalls({
        calls,
        market: MARKET,
        owner: OWNER,
        intent,
      }),
      calls,
    );

    const altered =
      cloneCalls(calls);

    altered[1].calldata[
      altered[1].calldata.length -
        1
    ] = "0";

    assert.throws(
      () =>
        borrow.validateVesuRepayCalls({
          calls: altered,
          market: MARKET,
          owner: OWNER,
          intent,
        }),
      /blocked/i,
    );
  },
);

test(
  "Close Position uses Native collateral shares and nominal debt then resets allowance",
  () => {
    const calls =
      borrow.buildVesuClosePositionCalls({
        market: MARKET,
        owner: OWNER,
        collateralShares: 7n,
        nominalDebt: 3n,
        approvalCap: 5n,
      });

    assert.equal(
      calls.length,
      3,
    );

    assert.deepEqual(
      calls[0].calldata,
      [
        MARKET.poolAddress,
        "0x5",
        "0x0",
      ],
    );

    assert.deepEqual(
      calls[1].calldata,
      [
        STRK.identifier.address,
        USDC.identifier.address,
        OWNER,

        // collateral: Native -7 shares
        "0",
        "0x7",
        "0x0",
        "1",

        // debt: Native -3 nominal debt
        "0",
        "0x3",
        "0x0",
        "1",
      ],
    );

    assert.deepEqual(
      calls[2].calldata,
      [
        MARKET.poolAddress,
        "0x0",
        "0x0",
      ],
    );

    assert.deepEqual(
      borrow.validateVesuClosePositionCalls({
        calls,
        market: MARKET,
        owner: OWNER,
        collateralShares: 7n,
        nominalDebt: 3n,
        approvalCap: 5n,
      }),
      calls,
    );

    const unlimited =
      cloneCalls(calls);

    unlimited[0].calldata[1] =
      "0xffff";

    assert.throws(
      () =>
        borrow.validateVesuClosePositionCalls({
          calls: unlimited,
          market: MARKET,
          owner: OWNER,
          collateralShares: 7n,
          nominalDebt: 3n,
          approvalCap: 5n,
        }),
      /blocked/i,
    );
  },
);

test(
  "Add Collateral uses exact STRK approval and positive collateral delta",
  () => {
    const intent = {
      action: "add-collateral",
      collateralAssetId:
        STRK.id,
      amount: 4n,
      positionId:
        MARKET.id,
      privacy:
        "public",
    };

    const calls =
      collateral.buildVesuAddCollateralCalls({
        market: MARKET,
        owner: OWNER,
        intent,
      });

    assert.equal(
      calls.length,
      2,
    );

    assert.deepEqual(
      calls[0].calldata,
      [
        MARKET.poolAddress,
        "0x4",
        "0x0",
      ],
    );

    assert.deepEqual(
      calls[1].calldata,
      [
        STRK.identifier.address,
        USDC.identifier.address,
        OWNER,

        // collateral: Assets +4
        "1",
        "0x4",
        "0x0",
        "0",

        // debt unchanged
        "1",
        "0x0",
        "0x0",
        "0",
      ],
    );

    assert.deepEqual(
      collateral
        .validateVesuAddCollateralCalls({
          calls,
          market: MARKET,
          owner: OWNER,
          intent,
        }),
      calls,
    );
  },
);

test(
  "Withdraw Collateral has no approval and encodes only negative collateral",
  () => {
    const intent = {
      action:
        "withdraw-collateral",
      collateralAssetId:
        STRK.id,
      amount:
        4n,
      positionId:
        MARKET.id,
      privacy:
        "public",
    };

    const calls =
      collateral
        .buildVesuWithdrawCollateralCalls({
          market: MARKET,
          owner: OWNER,
          intent,
        });

    assert.equal(
      calls.length,
      1,
    );

    assert.equal(
      calls[0].contractAddress,
      MARKET.poolAddress,
    );

    assert.equal(
      calls[0].entrypoint,
      "modify_position",
    );

    assert.deepEqual(
      calls[0].calldata,
      [
        STRK.identifier.address,
        USDC.identifier.address,
        OWNER,

        // collateral: Assets -4
        "1",
        "0x4",
        "0x0",
        "1",

        // debt unchanged
        "1",
        "0x0",
        "0x0",
        "0",
      ],
    );

    assert.deepEqual(
      collateral
        .validateVesuWithdrawCollateralCalls({
          calls,
          market: MARKET,
          owner: OWNER,
          intent,
        }),
      calls,
    );

    const injected =
      cloneCalls(calls);

    injected.push({
      contractAddress:
        STRK.identifier.address,
      entrypoint:
        "transfer",
      calldata: [
        "0x999",
        "0x1",
        "0x0",
      ],
    });

    assert.throws(
      () =>
        collateral
          .validateVesuWithdrawCollateralCalls({
            calls: injected,
            market: MARKET,
            owner: OWNER,
            intent,
          }),
      /exactly one/i,
    );
  },
);

test(
  "Collateral adapters reject wrong action, position and private execution",
  () => {
    assert.throws(
      () =>
        collateral
          .buildVesuAddCollateralCalls({
            market: MARKET,
            owner: OWNER,
            intent: {
              action:
                "withdraw-collateral",
              collateralAssetId:
                STRK.id,
              amount:
                1n,
              positionId:
                MARKET.id,
              privacy:
                "public",
            },
          }),
      /expected an add/i,
    );

    assert.throws(
      () =>
        collateral
          .buildVesuWithdrawCollateralCalls({
            market: MARKET,
            owner: OWNER,
            intent: {
              action:
                "withdraw-collateral",
              collateralAssetId:
                STRK.id,
              amount:
                1n,
              positionId:
                "vesu:wrong",
              privacy:
                "public",
            },
          }),
      /does not match/i,
    );

    assert.throws(
      () =>
        collateral
          .buildVesuWithdrawCollateralCalls({
            market: MARKET,
            owner: OWNER,
            intent: {
              action:
                "withdraw-collateral",
              collateralAssetId:
                STRK.id,
              amount:
                1n,
              positionId:
                MARKET.id,
              privacy:
                "private",
            },
          }),
      /private/i,
    );
  },
);



test(
  "Vesu Lend uses exact approval and zero-debt supply position",
  () => {
    const intent = {
      assetId:
        STRK.id,

      amount:
        5n,

      privacy:
        "public",
    };

    const calls =
      lending
        .buildVesuLendCalls({
          market:
            MARKET,

          owner:
            OWNER,

          intent,
        });

    assert.equal(
      calls.length,
      2,
    );

    assert.deepEqual(
      calls[0].calldata,
      [
        MARKET.poolAddress,
        "0x5",
        "0x0",
      ],
    );

    assert.deepEqual(
      calls[1].calldata,
      [
        STRK.identifier.address,
        USDC.identifier.address,
        OWNER,

        // supplied STRK: Assets +5
        "1",
        "0x5",
        "0x0",
        "0",

        // debt: Native zero
        "0",
        "0x0",
        "0x0",
        "0",
      ],
    );

    assert.deepEqual(
      lending
        .validateVesuLendCalls({
          calls,
          market:
            MARKET,
          owner:
            OWNER,
          intent,
        }),
      calls,
    );
  },
);
