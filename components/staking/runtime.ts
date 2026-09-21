import {
  findAssetBalance,
} from "@/lib/carel/core/balances";

import {
  parseUnits,
} from "@/lib/carel/core/amounts";

import {
  readStarknetPublicBalances,
} from "@/lib/carel/ecosystems/starknet/balances";

import {
  createStarknetStakingRuntime,
  type StarknetStakingRuntime,
} from "@/lib/agent/starknet-staking-runtime";

import {
  AVNU_STAKING_ADAPTER_ID,
} from "@/lib/carel/ecosystems/starknet/protocols/avnu/staking-adapter";

import {
  ENDUR_SHIELD_STAKING_ADAPTER_ID,
} from "@/lib/carel/ecosystems/starknet/protocols/endur/adapter";

import {
  executeEndurShieldStake,
  executePublicStakingRoute,
  loadEndurShieldConfig,
  loadStakingPool,
  loadStakingPosition,
} from "@/lib/carel/ecosystems/starknet/protocols/endur/staking";

import {
  getStarknetStakingAssetOptions,
} from "@/lib/carel/ecosystems/starknet/staking-assets";

import {
  ENDUR_DEPOSIT_ANONYMIZER,
  getCarelNetwork,
} from "@/lib/carel/networks";


type PrivateTransferResult =
  Readonly<{
    hash:
      string;

    status:
      | "submitted"
      | "confirmed";
  }>;


type StakingRuntimeWallet =
  Readonly<{
    address:
      string;

    executeStaking(
      amount:
        string,

      poolAddress:
        string,

      tokenAddress:
        string,

      label:
        string,
    ):
      Promise<string>;

    executeShieldStaking(
      amount:
        string,

      feeAmount:
        string,

      label:
        string,
    ):
      Promise<string>;

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


export function createLiveStakingRuntime({
  wallet,
}: Readonly<{
  wallet:
    StakingRuntimeWallet;
}>): StarknetStakingRuntime {
  return createStarknetStakingRuntime({
    async preparePublicStake(
      input,
    ) {
      const network =
        getCarelNetwork(
          input.chainId,
        );

      if (
        !network ||
        wallet.address !==
          input.owner
      ) {
        throw new Error(
          "Wallet account or Starknet network changed before Staking execution.",
        );
      }


      const option =
        getStarknetStakingAssetOptions(
          input.chainId,
          input.owner,
          "normal",
        ).find(
          (candidate) =>
            candidate.asset.id ===
              input.assetId,
        );


      if (
        !option ||
        option.providerId !==
          AVNU_STAKING_ADAPTER_ID
      ) {
        throw new Error(
          "No attached public staking runtime supports this asset.",
        );
      }


      const pool =
        await loadStakingPool(
          network.avnuBaseUrl,
          option.asset,
        );


      const readPosition =
        async () => {
          const position =
            await loadStakingPosition(
              network.avnuBaseUrl,
              pool,
              input.owner,
              option.asset,
            );

          return (
            position?.amount ??
            0n
          );
        };


      return {
        label:
          `Stake ${input.amountText} ${option.asset.symbol} · AVNU`,

        assetId:
          option.asset.id,

        assetSymbol:
          option.asset.symbol,

        decimals:
          option.asset.decimals,

        amountUnits:
          parseUnits(
            input.amountText,
            option.asset.decimals,
          ),

        readPosition,

        async execute() {
          const result =
            await executePublicStakingRoute({
              amount:
                input.amountText,

              pool,

              stakeAsset:
                option.asset,

              executor:
                wallet,
            });


          return {
            hash:
              result.hash,

            status:
              "submitted",
          };
        },
      };
    },


    async prepareShieldStake(
      input,
    ) {
      const network =
        getCarelNetwork(
          input.chainId,
        );


      if (
        !network ||
        wallet.address !==
          input.owner
      ) {
        throw new Error(
          "Wallet account or Starknet network changed before Shield Staking.",
        );
      }


      const option =
        getStarknetStakingAssetOptions(
          input.chainId,
          input.owner,
          "shield",
        ).find(
          (candidate) =>
            candidate.asset.id ===
              input.assetId &&
            (
              !input
                .outputAssetSymbol ||
              candidate
                .outputAsset
                ?.symbol
                .toLowerCase() ===
                input
                  .outputAssetSymbol
                  .toLowerCase()
            ),
        );


      if (
        !option ||
        !option.outputAsset ||
        option.providerId !==
          ENDUR_SHIELD_STAKING_ADAPTER_ID
      ) {
        throw new Error(
          "No attached Shield Staking runtime supports this asset route.",
        );
      }


      const config =
        await loadEndurShieldConfig({
          inputAsset:
            option.asset,

          outputAsset:
            option.outputAsset,

          expectedAnonymizer:
            ENDUR_DEPOSIT_ANONYMIZER,
        });


      return {
        label:
          `Shield Stake ${input.amountText} ${option.asset.symbol} → private ${option.outputAsset.symbol}`,

        async execute() {
          const result =
            await executeEndurShieldStake({
              amount:
                input.amountText,

              feeAmount:
                config.feeAmount,

              stakeAsset:
                option.asset,

              outputAsset:
                option.outputAsset!,

              executor:
                wallet,
            });


          return {
            hash:
              result.hash,

            status:
              "submitted",
          };
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
          "Staking verification received an unsupported Starknet network.",
        );
      }


      const asset =
        network.assetList.find(
          (candidate) =>
            candidate.id ===
              input.assetId,
        );


      if (!asset) {
        throw new Error(
          "Staking verification received an unknown CAREL asset.",
        );
      }


      const balances =
        await readStarknetPublicBalances(
          input.account,
          network.provider,
          [asset],
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
          "Staking confirmation received an unsupported Starknet network.",
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
          "The Starknet staking transaction reverted.",
        );
      }
    },
  });
}
