import { parseBridgeGoal } from "@/lib/garden/protocol";
import type { BridgeIntent } from "@/lib/garden/types";

export type AgentTool = "Bridge" | "Swap" | "Earn" | "Borrow" | "Balance";
export type AgentRouteStatus = "ready" | "unsupported" | "invalid";

export type AgentRoute = {
  tool: AgentTool;
  status: AgentRouteStatus;
  provider: string | null;
  bridgeIntent?: BridgeIntent;
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
      status: "unsupported",
      provider: "AVNU",
      message: "Swap routing is recognized, but AVNU execution is not connected yet.",
    };
  }

  if (/\b(earn|stake|yield|lend)\b/i.test(text)) {
    return {
      tool: "Earn",
      status: "unsupported",
      provider: null,
      message: "Earn routing is recognized, but an earning protocol is not connected yet.",
    };
  }

  if (/\b(borrow|loan)\b/i.test(text)) {
    return {
      tool: "Borrow",
      status: "unsupported",
      provider: null,
      message: "Borrow routing is recognized, but a lending protocol is not connected yet.",
    };
  }

  return {
    tool: "Balance",
    status: "ready",
    provider: "STRK20",
  };
}
