import {
  NextResponse,
} from "next/server";

import {
  CAREL_NETWORKS,
} from "@/lib/carel/networks";

import {
  normalizeStarknetAddress,
} from "@/lib/carel/ecosystems/starknet/addresses";

import {
  buildVesuClosePositionCalls,
} from "@/lib/carel/ecosystems/starknet/protocols/vesu/borrow";

import {
  readVesuBorrowRisk,
} from "@/lib/carel/ecosystems/starknet/protocols/vesu/markets";

import {
  readVesuBorrowPosition,
} from "@/lib/carel/ecosystems/starknet/protocols/vesu/positions";

import {
  getVesuPool,
} from "@/lib/carel/ecosystems/starknet/protocols/vesu/pools";

export const runtime =
  "nodejs";

export const dynamic =
  "force-dynamic";

const PREPARED_WINDOW_MS =
  45_000;

const APPROVAL_BUFFER_BPS =
  10n;

const BPS =
  10_000n;

/**
 * Adds a small bounded allowance margin for interest accruing between
 * position review and transaction inclusion.
 *
 * The allowance is reset to zero in the same atomic multicall.
 */
function closeApprovalCap(
  debtSnapshot: bigint,
): bigint {
  if (debtSnapshot <= 0n) {
    throw new Error(
      "Cannot close a position with zero debt.",
    );
  }

  const buffer =
    (
      debtSnapshot *
      APPROVAL_BUFFER_BPS +
      BPS -
      1n
    ) /
      BPS;

  return (
    debtSnapshot +
    buffer +
    1n
  );
}

/**
 * Prepares a full Vesu position close from fresh on-chain native units.
 */
export async function POST(
  request: Request,
) {
  let body:
    Record<string, unknown>;

  try {
    const raw: unknown =
      await request.json();

    if (
      !raw ||
      typeof raw !== "object" ||
      Array.isArray(raw)
    ) {
      throw new Error();
    }

    body =
      raw as Record<
        string,
        unknown
      >;
  } catch {
    return NextResponse.json(
      {
        error:
          "Invalid Close Position request.",
      },
      {
        status: 400,
      },
    );
  }

  try {
    if (
      typeof body.poolId !==
      "string"
    ) {
      throw new Error(
        "Choose an existing Vesu position.",
      );
    }

    const pool =
      getVesuPool(
        body.poolId,
      );

    if (!pool) {
      throw new Error(
        "That Vesu pool is not enabled in CAREL.",
      );
    }

    if (
      typeof body.owner !==
      "string"
    ) {
      throw new Error(
        "Connect a Starknet account first.",
      );
    }

    const owner =
      normalizeStarknetAddress(
        body.owner,
      );

    const network =
      CAREL_NETWORKS.mainnet;

    const [
      position,
      risk,
    ] =
      await Promise.all([
        readVesuBorrowPosition({
          provider:
            network.provider,

          pool,

          owner,

          collateralAsset:
            network.assets.strk,

          debtAsset:
            network.assets.usdc,
        }),

        readVesuBorrowRisk({
          provider:
            network.provider,

          pool,

          chainId:
            network.chainId,

          collateralAsset:
            network.assets.strk,

          debtAsset:
            network.assets.usdc,
        }),
      ]);

    if (
      !position ||
      position.debtAmount <= 0n ||
      position.nominalDebt <= 0n
    ) {
      throw new Error(
        "No active Vesu debt was found in this pool.",
      );
    }

    if (
      position.collateralShares <=
      0n
    ) {
      throw new Error(
        "The Vesu position does not expose withdrawable collateral shares.",
      );
    }

    const approvalCap =
      closeApprovalCap(
        position.debtAmount,
      );

    const calls =
      buildVesuClosePositionCalls({
        market:
          risk.market,

        owner,

        collateralShares:
          position.collateralShares,

        nominalDebt:
          position.nominalDebt,

        approvalCap,
      });

    const preparedAt =
      Date.now();

    return NextResponse.json(
      {
        provider:
          "Vesu",

        pool: {
          id:
            pool.id,

          name:
            pool.name,

          address:
            pool.address,
        },

        position: {
          debtSnapshot:
            position.debtAmount
              .toString(),

          collateralSnapshot:
            position.collateralAmount
              .toString(),

          collateralShares:
            position.collateralShares
              .toString(),

          nominalDebt:
            position.nominalDebt
              .toString(),

          approvalCap:
            approvalCap
              .toString(),
        },

        execution: {
          chainId:
            network.chainId,

          poolId:
            pool.id,

          poolAddress:
            pool.address,

          owner,

          collateralAssetId:
            network.assets.strk.id,

          debtAssetId:
            network.assets.usdc.id,

          collateralShares:
            position.collateralShares
              .toString(),

          nominalDebt:
            position.nominalDebt
              .toString(),

          debtSnapshot:
            position.debtAmount
              .toString(),

          approvalCap:
            approvalCap
              .toString(),

          preparedAt,

          expiresAt:
            preparedAt +
            PREPARED_WINDOW_MS,

          calls,
        },
      },
      {
        headers: {
          "Cache-Control":
            "no-store",

          "X-Content-Type-Options":
            "nosniff",
        },
      },
    );
  } catch (cause) {
    return NextResponse.json(
      {
        error:
          cause instanceof Error
            ? cause.message
            : "Could not prepare Vesu Close Position.",
      },
      {
        status: 400,
        headers: {
          "Cache-Control":
            "no-store",
        },
      },
    );
  }
}
