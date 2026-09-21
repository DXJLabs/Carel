"use client";

import {
  useCallback,
  useMemo,
  useState,
} from "react";

import {
  getCarelNetwork,
} from "@/lib/carel/networks";

import {
  parseUnits,
} from "@/lib/carel/core/amounts";

import {
  responseObject,
  type BorrowMarket,
  type MarketsResponse,
} from "./model";


type BorrowDebtAsset =
  Readonly<{
    id: string;
    symbol: string;
    decimals: number;
  }>;


export function useVesuBorrowMarkets({
  chainId,
  debtAsset,
  collateralAmount,
  borrowAmount,
}: Readonly<{
  chainId: string;

  debtAsset:
    BorrowDebtAsset;

  collateralAmount:
    string;

  borrowAmount:
    string;
}>) {
  const [
    markets,
    setMarkets,
  ] = useState<
    readonly BorrowMarket[]
  >([]);

  const [
    selectedPoolId,
    setSelectedPoolId,
  ] = useState("");

  const [
    reviewed,
    setReviewed,
  ] = useState(false);

  const [
    loading,
    setLoading,
  ] = useState(false);


  const selectedMarket =
    useMemo(
      () =>
        markets.find(
          (market) =>
            market.pool.id ===
            selectedPoolId,
        ) ??
        markets[0] ??
        null,
      [
        markets,
        selectedPoolId,
      ],
    );


  const invalidateReview =
    useCallback(
      () => {
        setReviewed(false);
      },
      [],
    );


  const resetMarkets =
    useCallback(
      () => {
        setMarkets([]);
        setSelectedPoolId("");
        setReviewed(false);
      },
      [],
    );


  const selectPool =
    useCallback(
      (
        poolId: string,
      ) => {
        setSelectedPoolId(
          poolId,
        );

        setReviewed(false);
      },
      [],
    );


  const requestMarkets =
    useCallback(
      async (
        withEvaluation:
          boolean,
      ) => {
        const network =
          getCarelNetwork(
            chainId,
          );

        if (
          !network ||
          network.id !==
            "mainnet"
        ) {
          resetMarkets();

          throw new Error(
            "CAREL Borrow is currently enabled on Starknet Mainnet only.",
          );
        }

        if (
          withEvaluation
        ) {
          const collateral =
            parseUnits(
              collateralAmount,
              network.assets.strk
                .decimals,
            );

          const debt =
            parseUnits(
              borrowAmount,
              debtAsset.decimals,
            );

          if (
            collateral <= 0n ||
            debt <= 0n
          ) {
            throw new Error(
              "Borrow and collateral amounts must be greater than zero.",
            );
          }
        }

        setLoading(true);

        try {
          const query =
            new URLSearchParams();

          query.set(
            "debtAssetId",
            debtAsset.id,
          );

          if (
            withEvaluation
          ) {
            query.set(
              "collateralAmount",
              collateralAmount,
            );

            query.set(
              "borrowAmount",
              borrowAmount,
            );
          }

          const response =
            await fetch(
              `/api/vesu/borrow/markets${
                query.size
                  ? `?${query.toString()}`
                  : ""
              }`,
              {
                cache:
                  "no-store",
              },
            );

          const raw: unknown =
            await response.json();

          const payload =
            responseObject(
              raw,
            );

          if (!response.ok) {
            throw new Error(
              typeof payload.error ===
                "string"
                ? payload.error
                : "Could not load Vesu markets.",
            );
          }

          if (
            !Array.isArray(
              payload.markets,
            )
          ) {
            throw new Error(
              "CAREL received malformed Vesu market data.",
            );
          }

          const result =
            payload as unknown as
              MarketsResponse;

          const nextMarkets =
            result.markets;

          if (
            !nextMarkets.length
          ) {
            throw new Error(
              `No verified STRK → ${debtAsset.symbol} Vesu market is available right now.`,
            );
          }

          setMarkets(
            nextMarkets,
          );

          setSelectedPoolId(
            (current) =>
              nextMarkets.some(
                (market) =>
                  market.pool.id ===
                  current,
              )
                ? current
                : nextMarkets[0]
                    .pool.id,
          );

          setReviewed(
            withEvaluation,
          );

          return nextMarkets;
        } finally {
          setLoading(false);
        }
      },
      [
        chainId,
        debtAsset.id,
        debtAsset.symbol,
        debtAsset.decimals,
        collateralAmount,
        borrowAmount,
        resetMarkets,
      ],
    );


  const discoverMarkets =
    useCallback(
      () =>
        requestMarkets(
          false,
        ),
      [
        requestMarkets,
      ],
    );


  const reviewMarkets =
    useCallback(
      () =>
        requestMarkets(
          true,
        ),
      [
        requestMarkets,
      ],
    );


  return {
    markets,
    selectedMarket,
    reviewed,
    loading,

    discoverMarkets,
    reviewMarkets,
    resetMarkets,
    invalidateReview,
    selectPool,
  } as const;
}
