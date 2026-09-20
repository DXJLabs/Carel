import {
  parseBridgeGoal,
  type ParsedBridgeRequest,
} from "@/lib/agent/bridge";

import {
  parseBorrowGoal,
  type ParsedBorrowRequest,
} from "@/lib/agent/borrow";

import {
  parseStakeGoal,
  type ParsedStakeRequest,
} from "@/lib/agent/staking";

import {
  parseSwapGoal,
  type ParsedSwapRequest,
} from "@/lib/agent/swap";

export type AgentTool =
  | "Bridge"
  | "Swap"
  | "Staking"
  | "Borrow"
  | "Balance";

export type AgentRouteStatus =
  | "ready"
  | "unsupported"
  | "invalid";

export type AgentRoute =
  Readonly<{
    tool: AgentTool;
    status: AgentRouteStatus;

    bridgeRequest?:
      ParsedBridgeRequest;

    swapRequest?:
      ParsedSwapRequest;

    stakeRequest?:
      ParsedStakeRequest;

    borrowRequest?:
      ParsedBorrowRequest;

    message?: string;
  }>;

/**
 * Understands a CAREL goal without selecting an execution provider.
 */
export function routeAgentGoal(
  goal: string,
): AgentRoute {
  const text =
    goal.trim();

  if (!text) {
    return {
      tool:
        "Balance",

      status:
        "invalid",

      message:
        "Describe what you want CAREL to do.",
    };
  }

  if (
    /\bbridge\b/i.test(
      text,
    )
  ) {
    try {
      return {
        tool:
          "Bridge",

        status:
          "ready",

        bridgeRequest:
          parseBridgeGoal(
            text,
          ),
      };
    } catch (error) {
      return {
        tool:
          "Bridge",

        status:
          "invalid",

        message:
          error instanceof Error
            ? error.message
            : "Enter an explicit Bridge goal.",
      };
    }
  }

  if (
    /\b(swap|exchange)\b/i.test(
      text,
    )
  ) {
    try {
      return {
        tool:
          "Swap",

        status:
          "ready",

        swapRequest:
          parseSwapGoal(
            text,
          ),
      };
    } catch (error) {
      return {
        tool:
          "Swap",

        status:
          "invalid",

        message:
          error instanceof Error
            ? error.message
            : "Enter an explicit Swap goal.",
      };
    }
  }

  if (
    /\b(earn|earning|stake|staking|yield|lend|lending)\b/i.test(
      text,
    )
  ) {
    try {
      return {
        tool:
          "Staking",

        status:
          "ready",

        stakeRequest:
          parseStakeGoal(
            text,
          ),
      };
    } catch (error) {
      return {
        tool:
          "Staking",

        status:
          "invalid",

        message:
          error instanceof Error
            ? error.message
            : "Enter an explicit Staking goal.",
      };
    }
  }

  if (
    /\b(borrow|borrowing|loan)\b/i.test(
      text,
    )
  ) {
    try {
      return {
        tool:
          "Borrow",

        status:
          "ready",

        borrowRequest:
          parseBorrowGoal(
            text,
          ),
      };
    } catch (error) {
      return {
        tool:
          "Borrow",

        status:
          "invalid",

        message:
          error instanceof Error
            ? error.message
            : "Enter an explicit Borrow goal.",
      };
    }
  }

  return {
    tool:
      "Balance",

    status:
      "ready",
  };
}
