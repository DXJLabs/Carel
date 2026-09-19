import {
  parseBridgeGoal,
  type ParsedBridgeRequest,
} from "@/lib/agent/bridge";

import {
  parseBorrowGoal,
  type ParsedBorrowRequest,
} from "@/lib/agent/borrow";

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

    borrowRequest?:
      ParsedBorrowRequest;

    message?: string;
  }>;

/**
 * Understands the requested CAREL action without selecting a provider.
 *
 * Protocol/provider selection belongs to the execution/adapters layer so
 * future ecosystems can satisfy the same Agent intent.
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
    return {
      tool:
        "Swap",

      status:
        "ready",
    };
  }

  if (
    /\b(earn|earning|stake|staking|yield|lend|lending)\b/i.test(
      text,
    )
  ) {
    return {
      tool:
        "Staking",

      status:
        "ready",
    };
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
