import {
  parseUnits,
} from "@/lib/carel/core/amounts";

import {
  findAssetBalance,
} from "@/lib/carel/core/balances";

import {
  readStarknetPublicBalances,
} from "@/lib/carel/ecosystems/starknet/balances";

import {
  createStarknetLendRuntime,
  type StarknetLendRuntime,
} from "@/lib/agent/starknet-lend-runtime";

import {
  getCarelNetwork,
} from "@/lib/carel/networks";

import {
  getVesuLendAsset,
  type VesuLendExecutionPayload,
} from "@/lib/carel/ecosystems/starknet/protocols/vesu/lending";

import type {
  VesuShieldLendExecutionPayload,
} from "@/lib/carel/ecosystems/starknet/protocols/vesu/private-lending";

import {
  getVesuPool,
} from "@/lib/carel/ecosystems/starknet/protocols/vesu/pools";

import {
  readVesuLendingPosition,
} from "@/lib/carel/ecosystems/starknet/protocols/vesu/lending-positions";


export type VesuLendMarketRef =
  Readonly<{
    pool:
      Readonly<{
        id:
          string;

        name:
          string;

        address:
          string;
      }>;

    asset:
      Readonly<{
        id:
          string;

        symbol:
          string;

        decimals:
          number;
      }>;

    counterpart:
      Readonly<{
        id:
          string;

        symbol:
          string;

        decimals:
          number;
      }>;
  }>;


type PrivateTransferResult =
  Readonly<{
    hash:
      string;

    status:
      | "submitted"
      | "confirmed";
  }>;


type LendRuntimeWallet =
  Readonly<{
    address:
      string;

    executeLend(
      payload:
        VesuLendExecutionPayload,

      label:
        string,
    ):
      Promise<string>;

    executeShieldLend(
      payload:
        VesuShieldLendExecutionPayload,

      label:
        string,
    ):
      Promise<
        PrivateTransferResult
      >;

    executeUnshieldAsset(
      assetId:
        string,

      amount:
        string,

      label:
        string,
    ):
      Promise<
        PrivateTransferResult
      >;
  }>;


function responseObject(
  value:
    unknown,
): Record<
  string,
  unknown
> {
  if (
    !value ||
    typeof value !==
      "object" ||
    Array.isArray(
      value,
    )
  ) {
    throw new Error(
      "CAREL Lend API returned an invalid response.",
    );
  }

  return value as Record<
    string,
    unknown
  >;
}


function assertMarket(
  input:
    Readonly<{
      assetId:
        string;

      assetSymbol:
        string;
    }>,

  market:
    VesuLendMarketRef,
) {
  if (
    market.asset.id !==
      input.assetId ||
    market.asset.symbol
      .toLowerCase() !==
      input.assetSymbol
        .toLowerCase()
  ) {
    throw new Error(
      "Selected Vesu market no longer matches the Agent Lend stage.",
    );
  }
}


export function createLiveVesuLendRuntime({
  wallet,
  market,
}: Readonly<{
  wallet:
    LendRuntimeWallet;

  market:
    VesuLendMarketRef;
}>): StarknetLendRuntime {
  return createStarknetLendRuntime({
    async preparePublicLend(
      input,
    ) {
      const network =
        getCarelNetwork(
          input.chainId,
        );


      if (
        !network ||
        network.id !==
          "mainnet" ||
        wallet.address !==
          input.owner
      ) {
        throw new Error(
          "Wallet account or Starknet network changed before Vesu Lend.",
        );
      }


      assertMarket(
        input,
        market,
      );


      const asset =
        getVesuLendAsset(
          input.assetId,
        );


      const pool =
        getVesuPool(
          market.pool.id,
        );


      if (
        !asset ||
        !pool
      ) {
        throw new Error(
          "The selected Vesu Lend market is no longer registered in CAREL.",
        );
      }


      const amountUnits =
        parseUnits(
          input.amountText,
          asset.decimals,
        );


      const response =
        await fetch(
          "/api/vesu/lend/prepare",
          {
            method:
              "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify({
                poolId:
                  market.pool.id,

                owner:
                  input.owner,

                assetId:
                  asset.id,

                counterpartAssetId:
                  market
                    .counterpart.id,

                amount:
                  input.amountText,
              }),

            ...(input.signal
              ? {
                  signal:
                    input.signal,
                }
              : {}),
          },
        );


      const raw:
        unknown =
        await response.json();


      const prepared =
        responseObject(
          raw,
        );


      if (
        !response.ok
      ) {
        throw new Error(
          typeof prepared.error ===
            "string"
            ? prepared.error
            : "Vesu Lend preparation failed.",
        );
      }


      const execution =
        prepared.execution as
          VesuLendExecutionPayload;


      if (
        !execution ||
        execution.chainId !==
          input.chainId ||
        execution.owner !==
          input.owner ||
        execution.assetId !==
          asset.id ||
        execution
          .counterpartAssetId !==
          market.counterpart.id ||
        BigInt(
          execution.amount,
        ) !==
          amountUnits
      ) {
        throw new Error(
          "Fresh Vesu Lend preparation does not match the Agent stage.",
        );
      }


      const readPositionShares =
        async () => {
          const current =
            await readVesuLendingPosition({
              provider:
                network.provider,

              pool,

              owner:
                input.owner,

              asset,
            });


          return (
            current?.shares ??
            0n
          );
        };


      return {
        label:
          `Lend ${input.amountText} ${asset.symbol} · Vesu ${market.pool.name}`,

        assetId:
          asset.id,

        assetSymbol:
          asset.symbol,

        decimals:
          asset.decimals,

        amountUnits,

        readPositionShares,

        async execute() {
          const hash =
            await wallet
              .executeLend(
                execution,

                `Lend ${input.amountText} ${asset.symbol} · Vesu ${market.pool.name}`,
              );


          return {
            hash,

            status:
              "submitted",
          };
        },
      };
    },


    async prepareShieldLend(
      input,
    ) {
      const network =
        getCarelNetwork(
          input.chainId,
        );


      if (
        !network ||
        network.id !==
          "mainnet" ||
        wallet.address !==
          input.owner
      ) {
        throw new Error(
          "Wallet account or Starknet network changed before Shield Lend.",
        );
      }


      assertMarket(
        input,
        market,
      );


      const asset =
        getVesuLendAsset(
          input.assetId,
        );


      if (!asset) {
        throw new Error(
          "The selected Shield Lend asset is no longer registered in CAREL.",
        );
      }


      const amountUnits =
        parseUnits(
          input.amountText,
          asset.decimals,
        );


      const response =
        await fetch(
          "/api/vesu/lend/private/prepare",
          {
            method:
              "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify({
                poolId:
                  market.pool.id,

                owner:
                  input.owner,

                assetId:
                  asset.id,

                counterpartAssetId:
                  market
                    .counterpart.id,

                amount:
                  input.amountText,
              }),

            ...(input.signal
              ? {
                  signal:
                    input.signal,
                }
              : {}),
          },
        );


      const raw:
        unknown =
        await response.json();


      const prepared =
        responseObject(
          raw,
        );


      if (
        !response.ok
      ) {
        throw new Error(
          typeof prepared.error ===
            "string"
            ? prepared.error
            : "Shield Lend preparation failed.",
        );
      }


      const execution =
        prepared.execution as
          VesuShieldLendExecutionPayload;


      if (
        !execution ||
        execution.chainId !==
          input.chainId ||
        execution.owner !==
          input.owner ||
        execution.assetId !==
          asset.id ||
        BigInt(
          execution.amount,
        ) !==
          amountUnits
      ) {
        throw new Error(
          "Fresh Shield Lend preparation does not match the Agent stage.",
        );
      }


      return {
        label:
          `Shield Lend ${input.amountText} ${asset.symbol} · Vesu ${market.pool.name}`,

        assetId:
          asset.id,

        assetSymbol:
          asset.symbol,

        decimals:
          asset.decimals,

        amountUnits,

        async execute() {
          return wallet
            .executeShieldLend(
              execution,

              `Shield Lend ${input.amountText} ${asset.symbol} · Vesu ${market.pool.name}`,
            );
        },
      };
    },


    async executeUnshieldAsset(
      assetId,
      amountText,
      label,
    ) {
      return wallet
        .executeUnshieldAsset(
          assetId,
          amountText,
          label,
        );
    },


    async readPublicBalance(
      input,
    ) {
      const network =
        getCarelNetwork(
          input.chainId,
        );


      if (!network) {
        throw new Error(
          "Vesu Lend verification received an unsupported Starknet network.",
        );
      }


      const asset =
        getVesuLendAsset(
          input.assetId,
        );


      if (!asset) {
        throw new Error(
          "Vesu Lend verification received an unknown asset.",
        );
      }


      const balances =
        await readStarknetPublicBalances(
          input.account,
          network.provider,
          [
            asset,
          ],
        );


      return (
        findAssetBalance(
          balances,
          asset.id,
          "public",
        )?.amount ??
        0n
      );
    },


    async waitForTransaction(
      input,
    ) {
      const network =
        getCarelNetwork(
          input.chainId,
        );


      if (!network) {
        throw new Error(
          "Vesu Lend confirmation received an unsupported Starknet network.",
        );
      }


      const receipt:
        unknown =
        await network.provider
          .waitForTransaction(
            input.transactionId,
            {
              retries:
                2,

              retryInterval:
                1500,
            },
          );


      if (
        receipt &&
        typeof receipt ===
          "object" &&
        (
          receipt as
            Record<
              string,
              unknown
            >
        ).execution_status ===
          "REVERTED"
      ) {
        throw new Error(
          "The Vesu Lend transaction reverted.",
        );
      }
    },
  });
}
