import type {
  Ecosystem,
} from "./chains";

export type CarelAction =
  | "swap"
  | "bridge"
  | "stake"
  | "unstake"
  | "borrow"
  | "repay"
  | "add-collateral"
  | "withdraw-collateral"
  | "shield"
  | "unshield";

export type ExecutionPrivacy =
  | "public"
  | "private"
  | "auto";

export type SwapIntent =
  Readonly<{
    action: "swap";
    fromAssetId: string;
    toAssetId: string;
    amount: bigint;
    privacy?: ExecutionPrivacy;
  }>;

export type BridgeIntent =
  Readonly<{
    action: "bridge";
    fromAssetId: string;
    toAssetId: string;
    amount: bigint;
    privacy?: ExecutionPrivacy;
  }>;

export type StakeIntent =
  Readonly<{
    action: "stake";
    assetId: string;
    amount: bigint;
    targetAssetId?: string;
    privacy?: ExecutionPrivacy;
  }>;

export type UnstakeIntent =
  Readonly<{
    action: "unstake";
    assetId: string;
    amount: bigint;
    targetAssetId?: string;
    privacy?: ExecutionPrivacy;
  }>;

export type BorrowIntent =
  Readonly<{
    action: "borrow";
    collateralAssetId: string;
    borrowAssetId: string;
    collateralAmount: bigint;
    borrowAmount: bigint;
    privacy?: ExecutionPrivacy;
  }>;

export type RepayIntent =
  Readonly<{
    action: "repay";
    assetId: string;
    amount: bigint;
    positionId?: string;
    privacy?: ExecutionPrivacy;
  }>;

export type CollateralIntent =
  Readonly<{
    action:
      | "add-collateral"
      | "withdraw-collateral";
    collateralAssetId: string;
    amount: bigint;
    positionId?: string;
    privacy?: ExecutionPrivacy;
  }>;

export type PrivacyIntent =
  Readonly<{
    action:
      | "shield"
      | "unshield";
    assetId: string;
    amount: bigint;
  }>;

export type ExecutionIntent =
  | SwapIntent
  | BridgeIntent
  | StakeIntent
  | UnstakeIntent
  | BorrowIntent
  | RepayIntent
  | CollateralIntent
  | PrivacyIntent;

export type ExecutionContext =
  Readonly<{
    chainId?: string;
    account?: string;
    signal?: AbortSignal;
  }>;

export type ExecutionReceipt =
  Readonly<{
    adapterId: string;
    provider: string;
    transactionId?: string;
    status:
      | "submitted"
      | "confirmed"
      | "pending";
  }>;

export interface ExecutionAdapter {
  readonly id: string;
  readonly ecosystems:
    readonly Ecosystem[];
  readonly actions:
    readonly CarelAction[];

  /**
   * Determines whether this adapter can execute an intent in the current
   * chain/account context. Protocol names stay outside the agent intent.
   */
  supports(
    intent: ExecutionIntent,
    context: ExecutionContext,
  ): boolean;

  /**
   * Executes a previously validated CAREL intent.
   * Adapter implementations own provider-specific transaction details.
   */
  execute(
    intent: ExecutionIntent,
    context: ExecutionContext,
  ): Promise<ExecutionReceipt>;
}
