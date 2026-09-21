import {
  getCarelNetwork,
} from "@/lib/carel/networks";

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
  createStarknetSwapRuntime,
  type StarknetSwapRuntime,
} from "@/lib/agent/starknet-swap-runtime";

import {
  getAvnuSwapQuote,
  requireAvnuTokenAddress,
} from "@/lib/carel/ecosystems/starknet/protocols/avnu/swap";

type PrivacyTransferResult =
  Readonly<{
    hash: string;
    status:
      | "confirmed"
      | "submitted";
  }>;

type SwapRuntimeWallet =
  Readonly<{
    address: string;

    executeSwap: (
      quote: Awaited<
        ReturnType<
          typeof getAvnuSwapQuote
        >
      >,
      expectedSellToken: string,
      expectedBuyToken: string,
      label: string,
    ) => Promise<string>;

    executeShieldAsset: (
      assetId: string,
      amountText: string,
      label: string,
    ) => Promise<PrivacyTransferResult>;

    executeUnshieldAsset: (
      assetId: string,
      amountText: string,
      label: string,
    ) => Promise<PrivacyTransferResult>;
  }>;

const SLIPPAGE_BPS =
  50n;

export function createAvnuSwapRuntime({
  wallet,
}: Readonly<{
  wallet:
    SwapRuntimeWallet;
}>): StarknetSwapRuntime {
  return createStarknetSwapRuntime({
    async prepareSwap(input) {
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
          "Wallet account or Starknet network changed before Swap execution.",
        );
      }

      const fromAsset =
        network.assetList.find(
          (asset) =>
            asset.id ===
            input.fromAssetId,
        );

      const toAsset =
        network.assetList.find(
          (asset) =>
            asset.id ===
            input.toAssetId,
        );

      if (
        !fromAsset ||
        !toAsset
      ) {
        throw new Error(
          "Agent Swap references an unavailable CAREL asset.",
        );
      }

      const sellAmount =
        parseUnits(
          input.amountText,
          fromAsset.decimals,
        );

      if (
        sellAmount <= 0n
      ) {
        throw new Error(
          "Swap amount must be greater than zero.",
        );
      }

      /*
       * Always obtain a fresh PUBLIC AVNU quote immediately before signing.
       *
       * Shield/Unshield are separate Agent privacy stages. AVNU therefore
       * stays a DeFi provider instead of owning CAREL privacy semantics.
       */
      const quote =
        await getAvnuSwapQuote({
          network,
          fromAsset,
          toAsset,
          sellAmount,
          takerAddress:
            input.owner,
          privateRoute:
            false,
        });

      const sellToken =
        requireAvnuTokenAddress(
          fromAsset,
        );

      const buyToken =
        requireAvnuTokenAddress(
          toAsset,
        );

      const minimumOutputUnits =
        quote.buyAmount -
        (
          quote.buyAmount *
          SLIPPAGE_BPS
        ) /
          10_000n;

      return {
        label:
          `Swap ${input.amountText} ${fromAsset.symbol} → ${toAsset.symbol} · AVNU`,

        outputAssetId:
          toAsset.id,

        outputAssetSymbol:
          toAsset.symbol,

        outputDecimals:
          toAsset.decimals,

        minimumOutputUnits,

        async execute() {
          const hash =
            await wallet.executeSwap(
              quote,
              sellToken,
              buyToken,
              `Swap ${input.amountText} ${fromAsset.symbol} → ${toAsset.symbol} · AVNU`,
            );

          return {
            hash,
            status:
              "submitted",
          };
        },
      };
    },

    async executeShieldAsset(
      assetId,
      amountText,
      label,
    ) {
      return wallet
        .executeShieldAsset(
          assetId,
          amountText,
          label,
        );
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

    async readPublicBalance(input) {
      const network =
        getCarelNetwork(
          input.chainId,
        );

      if (!network) {
        throw new Error(
          "Swap verification received an unsupported Starknet network.",
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
          "Swap verification received an unknown CAREL asset.",
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

    async waitForTransaction(input) {
      const network =
        getCarelNetwork(
          input.chainId,
        );

      if (!network) {
        throw new Error(
          "Swap confirmation received an unsupported Starknet network.",
        );
      }

      const receipt: unknown =
        await network.provider
          .waitForTransaction(
            input.transactionId,
            {
              retries: 2,
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
          "The Starknet transaction reverted.",
        );
      }
    },
  });
}
