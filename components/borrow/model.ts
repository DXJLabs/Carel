import type {
  VesuBorrowExecutionPayload,
} from "@/lib/carel/ecosystems/starknet/protocols/vesu/borrow";

export type BorrowMode =
  | "normal"
  | "shield"
  | "unshield";

export type BorrowEvaluation =
  Readonly<{
    eligible: boolean;
    requestedLtvBps: number;
    ltvHeadroomBps: number;
    projectedUtilizationBps: number;
    blockers: readonly string[];
  }>;

export type BorrowMarket =
  Readonly<{
    id: string;
    provider: string;

    pool: Readonly<{
      id: string;
      name: string;
      address: string;
    }>;

    collateral: Readonly<{
      id: string;
      symbol: string;
      decimals: number;
    }>;

    debt: Readonly<{
      id: string;
      symbol: string;
      decimals: number;
    }>;

    risk: Readonly<{
      maxLtvBps: number;
      liquidationFactorBps: number;
      utilizationBps: number;
      maxUtilizationBps: number;
      availableLiquidity: string;
      pairDebt: string;
      debtCap: string;
      observedAt: number;
    }>;

    evaluation: BorrowEvaluation | null;
  }>;

export type MarketsResponse =
  Readonly<{
    network: string;
    pair: string;
    markets: readonly BorrowMarket[];
  }>;

export type PrepareResponse =
  Readonly<{
    provider: string;

    pool: Readonly<{
      id: string;
      name: string;
      address: string;
    }>;

    evaluation: Readonly<{
      requestedLtvBps: number;
      maxLtvBps: number;
      projectedUtilizationBps: number;
      maxUtilizationBps: number;
    }>;

    execution: VesuBorrowExecutionPayload;
  }>;

export function formatBps(
  value: number,
): string {
  if (!Number.isFinite(value)) {
    return "—";
  }

  return `${(value / 100).toFixed(2)}%`;
}

export function responseObject(
  value: unknown,
): Record<string, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    throw new Error(
      "CAREL Borrow API returned an invalid response.",
    );
  }

  return value as Record<string, unknown>;
}

export function shortAddress(
  address: string,
): string {
  if (address.length <= 16) {
    return address;
  }

  return `${address.slice(0, 8)}…${address.slice(-6)}`;
}
