import {
  getCarelNetwork,
} from "@/lib/carel/networks";

import {
  findAssetBalance,
} from "@/lib/carel/core/balances";

import {
  readStarknetPublicBalances,
} from "@/lib/carel/ecosystems/starknet/balances";

import {
  createStarknetBorrowRuntime,
  type StarknetBorrowRuntime,
} from "@/lib/agent/starknet-borrow-runtime";

import {
  createAgentRuntimeRecovery,
} from "@/lib/agent/client-recovery";

import type {
  VesuBorrowExecutionPayload,
} from "@/lib/carel/ecosystems/starknet/protocols/vesu/borrow";

import {
  responseObject,
  type BorrowMarket,
  type PrepareResponse,
} from "./model";

type PrivacyTransferResult =
  Readonly<{
    hash: string;
    status: "confirmed" | "submitted";
  }>;

type BorrowRuntimeWallet =
  Readonly<{
    address: string;

    executeBorrow: (
      execution: VesuBorrowExecutionPayload,
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

export function createVesuBorrowRuntime({
  market,
  debtSymbol,
  wallet,
}: Readonly<{
  market: BorrowMarket | null;
  debtSymbol: string;
  wallet: BorrowRuntimeWallet;
}>): StarknetBorrowRuntime {
  if (!wallet.address) {
    throw new Error(
      "Connect Ready before Borrow execution or recovery.",
    );
  }

  /*
   * Confirmation/recovery of an already-submitted transaction does not need
   * a fresh Vesu market object. prepareBorrow() still fails closed below when
   * a new Borrow stage is actually executed.
   */
  const reviewedMarket =
    market;

  return createStarknetBorrowRuntime({
    recovery:
      createAgentRuntimeRecovery(
        "borrow",
      ),

    async prepareBorrow(input) {
      if (!reviewedMarket) {
        throw new Error(
          "Review a verified Vesu market before executing a new Borrow stage.",
        );
      }


      const response =
        await fetch(
          "/api/vesu/borrow/prepare",
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            signal: input.signal,

            body: JSON.stringify({
              poolId:
                reviewedMarket.pool.id,

              owner:
                input.owner,

              collateralAmount:
                input.collateralAmountText,

              borrowAmount:
                input.borrowAmountText,

              collateralAssetId:
                input.collateralAssetId,

              debtAssetId:
                input.debtAssetId,
            }),
          },
        );

      const raw: unknown =
        await response.json();

      const payload =
        responseObject(raw);

      if (!response.ok) {
        const blockers =
          Array.isArray(payload.blockers)
            ? payload.blockers.filter(
                (value): value is string =>
                  typeof value === "string",
              )
            : [];

        throw new Error(
          blockers.length
            ? blockers.join(" ")
            : typeof payload.error === "string"
              ? payload.error
              : "Vesu Borrow preparation failed.",
        );
      }

      const prepared =
        payload as unknown as PrepareResponse;

      if (
        !prepared.execution ||
        prepared.provider !== "Vesu" ||
        prepared.pool.id !==
          reviewedMarket.pool.id
      ) {
        throw new Error(
          "CAREL received a mismatched Borrow preparation.",
        );
      }

      return {
        execution:
          prepared.execution,

        label:
          "Borrow " +
          input.borrowAmountText +
          " " +
          debtSymbol +
          " against " +
          input.collateralAmountText +
          " STRK · Vesu " +
          prepared.pool.name,
      };
    },

    async executeBorrow(
      execution,
      label,
    ) {
      const hash =
        await wallet.executeBorrow(
          execution,
          label,
        );

      return {
        hash,
        status: "submitted",
      };
    },

    async executeShieldAsset(
      assetId,
      amountText,
      label,
    ) {
      return wallet.executeShieldAsset(
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
      return wallet.executeUnshieldAsset(
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
          "Agent output verification received an unsupported Starknet network.",
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
          "Agent output verification received an unknown CAREL asset.",
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
          "Agent confirmation received an unsupported Starknet network.",
        );
      }

      const receipt: unknown =
        await network.provider.waitForTransaction(
          input.transactionId,
          {
            retries: 2,
            retryInterval: 1500,
          },
        );

      if (
        receipt &&
        typeof receipt === "object" &&
        (
          receipt as Record<string, unknown>
        ).execution_status === "REVERTED"
      ) {
        throw new Error(
          "The Starknet transaction reverted.",
        );
      }
    },
  });
}
