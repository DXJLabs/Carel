import { parseBridgeGoal } from "@/lib/garden/protocol";
import type { BridgeIntent } from "@/lib/garden/types";
import {
  parseBorrowGoal,
  type ParsedBorrowRequest,
} from "@/lib/agent/borrow";

export type AgentTool = "Bridge" | "Swap" | "Staking" | "Borrow" | "Balance";
export type AgentRouteStatus = "ready" | "unsupported" | "invalid";

export type AgentRoute = {
  tool: AgentTool;
  status: AgentRouteStatus;
  provider: string | null;
  bridgeIntent?: BridgeIntent;
  borrowRequest?: ParsedBorrowRequest;
  message?: string;
};

export function routeAgentGoal(goal: string): AgentRoute {
  const text = goal.trim();

  if (!text) {
    return {
      tool: "Balance",
      status: "invalid",
      provider: null,
      message: "Describe what you want CAREL to do.",
    };
  }

  if (/\bbridge\b/i.test(text)) {
    try {
      return {
        tool: "Bridge",
        status: "ready",
        provider: "Garden",
        bridgeIntent: parseBridgeGoal(text),
      };
    } catch (error) {
      return {
        tool: "Bridge",
        status: "invalid",
        provider: "Garden",
        message:
          error instanceof Error
            ? error.message
            : "Choose a supported Bitcoin bridge route.",
      };
    }
  }

  if (/\b(swap|exchange)\b/i.test(text)) {
    return {
      tool: "Swap",
      status: "ready",
      provider: "AVNU",
    };
  }

  if (/\b(earn|earning|stake|staking|yield|lend|lending)\b/i.test(text)) {
    return {
      tool: "Staking",
      status: "ready",
      provider: "AVNU",
    };
  }

  if (/\b(borrow|borrowing|loan)\b/i.test(text)) {
    try {
      return {
        tool: "Borrow",
        status: "unsupported",
        provider: null,
        borrowRequest:
          parseBorrowGoal(text),
        message:
          "Borrow intent is valid. CAREL still needs a verified lending market before execution.",
      };
    } catch (error) {
      return {
        tool: "Borrow",
        status: "invalid",
        provider: null,
        message:
          error instanceof Error
            ? error.message
            : "Enter an explicit Borrow goal.",
      };
    }
  }

  return {
    tool: "Balance",
    status: "ready",
    provider: "STRK20",
  };
}
