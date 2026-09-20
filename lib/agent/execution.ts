import {
  parseUnits,
} from "@/lib/carel/core/amounts";

import type {
  ExecutionAdapterRegistry,
} from "@/lib/carel/core/adapters";

import type {
  ExecutionContext,
  ExecutionIntent,
} from "@/lib/carel/core/execution";

import {
  selectExecutionAdapter,
} from "@/lib/carel/core/routes";

import {
  findCarelAssetBySymbol,
  getCarelAsset,
} from "@/lib/carel/assets";

import {
  BITCOIN_TESTNET4,
} from "@/lib/carel/ecosystems/bitcoin/chains";

import {
  STARKNET_SEPOLIA,
} from "@/lib/carel/ecosystems/starknet/chains";

import {
  routeAgentGoal,
  type AgentRoute,
  type AgentTool,
} from "@/lib/agent/router";

export type AgentExecutionMode =
  | "normal"
  | "shield"
  | "unshield";

export type AgentExecutionStatus =
  | "ready"
  | "needs-input"
  | "unsupported"
  | "invalid";

export type CompiledAgentExecution =
  Readonly<{
    status: AgentExecutionStatus;
    tool: AgentTool;
    route: AgentRoute;
    intent?: ExecutionIntent;
    adapterId?: string;
    message?: string;
  }>;

type CompileInput =
  Readonly<{
    goal: string;
    chainId: string;
    mode: AgentExecutionMode;

    /**
     * Required when a bridge goal names a destination chain but not the
     * concrete destination asset, e.g. BTC -> Starknet Sepolia.
     */
    bridgeTargetAssetId?: string;
  }>;

type ResolveInput =
  CompileInput &
  Readonly<{
    account: string;
    registry: ExecutionAdapterRegistry;
    signal?: AbortSignal;
  }>;

function result(
  route: AgentRoute,
  status: AgentExecutionStatus,
  message?: string,
): CompiledAgentExecution {
  return {
    status,
    tool:
      route.tool,
    route,
    ...(message
      ? {
          message,
        }
      : {}),
  };
}

function ready(
  route: AgentRoute,
  intent: ExecutionIntent,
): CompiledAgentExecution {
  return {
    status:
      "ready",

    tool:
      route.tool,

    route,
    intent,
  };
}

/**
 * Compiles provider-neutral Agent parsing into CAREL's generic execution
 * intent. It resolves registered assets and exact base-unit amounts but does
 * not choose AVNU, Vesu, Garden, Endur, or any other provider.
 */
export function compileAgentExecutionIntent(
  input: CompileInput,
): CompiledAgentExecution {
  const route =
    routeAgentGoal(
      input.goal,
    );

  if (
    route.status ===
    "invalid"
  ) {
    return result(
      route,
      "invalid",
      route.message ??
        "The CAREL goal is invalid.",
    );
  }

  try {
    if (
      route.tool ===
      "Swap"
    ) {
      if (
        !route.swapRequest
      ) {
        return result(
          route,
          "invalid",
          "Enter an explicit Swap goal.",
        );
      }

      // The current generic SwapIntent cannot yet distinguish Shield Swap
      // from Unshield Swap. Keep those established multi-stage flows explicit.
      if (
        input.mode !==
        "normal"
      ) {
        return result(
          route,
          "unsupported",
          "Shield and Unshield Swap still use CAREL's explicit privacy execution flow.",
        );
      }

      const fromAsset =
        findCarelAssetBySymbol(
          input.chainId,
          route.swapRequest
            .fromSymbol,
        );

      const toAsset =
        findCarelAssetBySymbol(
          input.chainId,
          route.swapRequest
            .toSymbol,
        );

      if (
        !fromAsset ||
        !toAsset
      ) {
        return result(
          route,
          "unsupported",
          "CAREL has no registered asset pair for this Swap on the connected chain.",
        );
      }

      return ready(
        route,
        {
          action:
            "swap",

          fromAssetId:
            fromAsset.id,

          toAssetId:
            toAsset.id,

          amount:
            parseUnits(
              route.swapRequest
                .amountText,
              fromAsset.decimals,
            ),

          privacy:
            "public",
        },
      );
    }

    if (
      route.tool ===
      "Staking"
    ) {
      if (
        !route.stakeRequest
      ) {
        return result(
          route,
          "invalid",
          "Enter an explicit Staking goal.",
        );
      }

      if (
        input.mode ===
        "unshield"
      ) {
        return result(
          route,
          "unsupported",
          "Unshield Staking remains a reviewed multi-stage CAREL flow.",
        );
      }

      const asset =
        findCarelAssetBySymbol(
          input.chainId,
          route.stakeRequest
            .assetSymbol,
        );

      if (!asset) {
        return result(
          route,
          "unsupported",
          "CAREL has no registered staking asset for this chain.",
        );
      }

      let targetAssetId:
        string | undefined;

      if (
        route.stakeRequest
          .targetSymbol
      ) {
        const target =
          findCarelAssetBySymbol(
            input.chainId,
            route.stakeRequest
              .targetSymbol,
          );

        if (!target) {
          return result(
            route,
            "unsupported",
            "CAREL has no registered target staking asset for this chain.",
          );
        }

        targetAssetId =
          target.id;
      } else if (
        input.mode ===
        "shield"
      ) {
        const privateReceipt =
          findCarelAssetBySymbol(
            input.chainId,
            "xSTRK",
          );

        if (!privateReceipt) {
          return result(
            route,
            "unsupported",
            "Shield Staking has no registered private receipt asset on this chain.",
          );
        }

        targetAssetId =
          privateReceipt.id;
      }

      return ready(
        route,
        {
          action:
            "stake",

          assetId:
            asset.id,

          amount:
            parseUnits(
              route.stakeRequest
                .amountText,
              asset.decimals,
            ),

          ...(targetAssetId
            ? {
                targetAssetId,
              }
            : {}),

          privacy:
            input.mode ===
              "shield"
              ? "private"
              : "public",
        },
      );
    }

    if (
      route.tool ===
      "Borrow"
    ) {
      if (
        !route.borrowRequest
      ) {
        return result(
          route,
          "invalid",
          "Enter an explicit Borrow goal.",
        );
      }

      if (
        input.mode !==
        "normal"
      ) {
        return result(
          route,
          "unsupported",
          "Direct private Borrow is not currently represented by a CAREL execution adapter.",
        );
      }

      const collateral =
        findCarelAssetBySymbol(
          input.chainId,
          route.borrowRequest
            .collateralSymbol,
        );

      const debt =
        findCarelAssetBySymbol(
          input.chainId,
          route.borrowRequest
            .borrowSymbol,
        );

      if (
        !collateral ||
        !debt
      ) {
        return result(
          route,
          "unsupported",
          "CAREL has no registered Borrow asset pair for the connected chain.",
        );
      }

      return ready(
        route,
        {
          action:
            "borrow",

          collateralAssetId:
            collateral.id,

          borrowAssetId:
            debt.id,

          collateralAmount:
            parseUnits(
              route.borrowRequest
                .collateralAmountText,
              collateral.decimals,
            ),

          borrowAmount:
            parseUnits(
              route.borrowRequest
                .borrowAmountText,
              debt.decimals,
            ),

          privacy:
            "public",
        },
      );
    }

    if (
      route.tool ===
      "Bridge"
    ) {
      if (
        !route.bridgeRequest
      ) {
        return result(
          route,
          "invalid",
          "Enter an explicit Bridge goal.",
        );
      }

      if (
        input.mode !==
        "normal"
      ) {
        return result(
          route,
          "unsupported",
          "The current Bridge execution registry supports public routes only.",
        );
      }

      const destination =
        route.bridgeRequest
          .destination
          .trim()
          .replace(/\.$/, "")
          .toLowerCase();

      if (
        destination ===
        "starknet sepolia"
      ) {
        const source =
          findCarelAssetBySymbol(
            BITCOIN_TESTNET4.id,
            route.bridgeRequest
              .symbol,
          );

        if (
          !source ||
          source.symbol !==
            "BTC"
        ) {
          return result(
            route,
            "unsupported",
            "CAREL has no registered Bitcoin source asset for this Bridge route.",
          );
        }

        if (
          !input
            .bridgeTargetAssetId
        ) {
          return result(
            route,
            "needs-input",
            "Choose the Starknet destination asset before CAREL selects a bridge adapter.",
          );
        }

        const target =
          getCarelAsset(
            input
              .bridgeTargetAssetId,
          );

        if (
          !target ||
          target.chain.id !==
            STARKNET_SEPOLIA.id
        ) {
          return result(
            route,
            "unsupported",
            "The selected Bridge destination asset is not registered on Starknet Sepolia.",
          );
        }

        return ready(
          route,
          {
            action:
              "bridge",

            fromAssetId:
              source.id,

            toAssetId:
              target.id,

            amount:
              parseUnits(
                route.bridgeRequest
                  .amountText,
                source.decimals,
              ),

            privacy:
              "public",
          },
        );
      }

      if (
        destination ===
        "bitcoin testnet4"
      ) {
        const source =
          findCarelAssetBySymbol(
            STARKNET_SEPOLIA.id,
            route.bridgeRequest
              .symbol,
          );

        const target =
          findCarelAssetBySymbol(
            BITCOIN_TESTNET4.id,
            "BTC",
          );

        if (
          !source ||
          !target
        ) {
          return result(
            route,
            "unsupported",
            "CAREL has no registered asset pair for this Bitcoin Testnet4 route.",
          );
        }

        return ready(
          route,
          {
            action:
              "bridge",

            fromAssetId:
              source.id,

            toAssetId:
              target.id,

            amount:
              parseUnits(
                route.bridgeRequest
                  .amountText,
                source.decimals,
              ),

            privacy:
              "public",
          },
        );
      }

      return result(
        route,
        "unsupported",
        "No registered CAREL bridge route matches that destination yet.",
      );
    }

    return result(
      route,
      "unsupported",
      "This goal uses CAREL's balance planner rather than the execution adapter registry.",
    );
  } catch (error) {
    return result(
      route,
      "invalid",
      error instanceof Error
        ? error.message
        : "CAREL could not compile this execution intent.",
    );
  }
}

/**
 * Compiles a goal and asks the global registry to choose a compatible adapter.
 *
 * The Agent never names a provider. It receives only the stable adapter id
 * selected from currently attached runtime capabilities.
 */
export function resolveAgentExecution(
  input: ResolveInput,
): CompiledAgentExecution {
  const compiled =
    compileAgentExecutionIntent(
      input,
    );

  if (
    compiled.status !==
      "ready" ||
    !compiled.intent
  ) {
    return compiled;
  }

  const context:
    ExecutionContext = {
      chainId:
        input.chainId,

      account:
        input.account,

      ...(input.signal
        ? {
            signal:
              input.signal,
          }
        : {}),
    };

  const adapter =
    selectExecutionAdapter(
      compiled.intent,
      context,
      [
        ...input
          .registry
          .values(),
      ],
    );

  if (!adapter) {
    return {
      ...compiled,

      status:
        "unsupported",

      message:
        "No connected CAREL execution adapter supports this intent on the current network.",
    };
  }

  return {
    ...compiled,

    adapterId:
      adapter.id,
  };
}
