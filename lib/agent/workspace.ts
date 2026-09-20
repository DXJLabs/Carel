import type {
  ExecutionCapabilityRegistry,
} from "@/lib/carel/core/adapters";

import type {
  ExecutionIntent,
} from "@/lib/carel/core/execution";

import {
  compileAgentExecutionIntent,
  resolveAgentExecution,
  type AgentExecutionMode,
} from "@/lib/agent/execution";

import {
  routeAgentGoal,
  type AgentRoute,
  type AgentTool,
} from "@/lib/agent/router";

export type WorkspaceExecutionTool =
  Exclude<
    AgentTool,
    "Balance"
  >;

export type WorkspaceAgentDecision =
  | Readonly<{
      kind: "execution";
      tool: WorkspaceExecutionTool;
      status:
        | "ready"
        | "needs-input";
      route: AgentRoute;
      intent?: ExecutionIntent;
      adapterId?: string;
      message?: string;
    }>
  | Readonly<{
      kind: "explicit";
      tool: WorkspaceExecutionTool;
      route: AgentRoute;
    }>
  | Readonly<{
      kind: "balance";
      route: AgentRoute;
    }>
  | Readonly<{
      kind: "error";
      tool?: WorkspaceExecutionTool;
      route: AgentRoute;
      message: string;
    }>;

export type WorkspaceAgentInput =
  Readonly<{
    goal: string;
    chainId: string;
    account?: string;
    mode: AgentExecutionMode;
    bridgeTargetAssetId?: string;
    registry:
      ExecutionCapabilityRegistry;
  }>;

function executionTool(
  tool: AgentTool,
): WorkspaceExecutionTool | null {
  switch (tool) {
    case "Swap":
    case "Bridge":
    case "Staking":
    case "Borrow":
      return tool;

    default:
      return null;
  }
}

/**
 * Keeps already-reviewed multi-stage privacy flows available until CAREL's
 * generic execution intents can describe their complete direction/lifecycle.
 */
function usesExplicitExecutionFlow(
  tool: WorkspaceExecutionTool,
  mode: AgentExecutionMode,
): boolean {
  if (
    tool === "Swap" &&
    mode !== "normal"
  ) {
    return true;
  }

  if (
    tool === "Staking" &&
    mode === "unshield"
  ) {
    return true;
  }

  if (
    tool === "Bridge" &&
    mode !== "normal"
  ) {
    return true;
  }

  if (
    tool === "Borrow" &&
    mode !== "normal"
  ) {
    return true;
  }

  return false;
}

/**
 * Resolves one Workspace preview without embedding provider names in React.
 *
 * Connected wallets use the capability registry to select a compatible
 * adapter. Disconnected wallets can still compile a valid intent so users may
 * inspect the corresponding tool UI before connecting.
 */
export function resolveWorkspaceAgentGoal(
  input: WorkspaceAgentInput,
): WorkspaceAgentDecision {
  const route =
    routeAgentGoal(
      input.goal,
    );

  if (
    route.tool === "Balance"
  ) {
    if (
      route.status ===
      "invalid"
    ) {
      return {
        kind:
          "error",

        route,

        message:
          route.message ??
          "Enter a valid CAREL goal.",
      };
    }

    return {
      kind:
        "balance",

      route,
    };
  }

  const tool =
    executionTool(
      route.tool,
    );

  if (!tool) {
    return {
      kind:
        "error",

      route,

      message:
        route.message ??
        "CAREL does not recognize this execution tool.",
    };
  }

  if (
    route.status !==
    "ready"
  ) {
    return {
      kind:
        "error",

      tool,
      route,

      message:
        route.message ??
        `Enter a valid ${tool} goal.`,
    };
  }

  if (
    usesExplicitExecutionFlow(
      tool,
      input.mode,
    )
  ) {
    return {
      kind:
        "explicit",

      tool,
      route,
    };
  }

  const compiled =
    compileAgentExecutionIntent({
      goal:
        input.goal,

      chainId:
        input.chainId,

      mode:
        input.mode,

      ...(input.bridgeTargetAssetId
        ? {
            bridgeTargetAssetId:
              input.bridgeTargetAssetId,
          }
        : {}),
    });

  if (
    compiled.status ===
    "invalid" ||
    compiled.status ===
    "unsupported"
  ) {
    return {
      kind:
        "error",

      tool,
      route:
        compiled.route,

      message:
        compiled.message ??
        `No CAREL capability supports this ${tool} goal.`,
    };
  }

  if (
    compiled.status ===
    "needs-input"
  ) {
    return {
      kind:
        "execution",

      tool,

      status:
        "needs-input",

      route:
        compiled.route,

      intent:
        compiled.intent,

      message:
        compiled.message,
    };
  }

  if (
    !input.account?.trim()
  ) {
    return {
      kind:
        "execution",

      tool,

      status:
        "ready",

      route:
        compiled.route,

      intent:
        compiled.intent,
    };
  }

  const resolved =
    resolveAgentExecution({
      goal:
        input.goal,

      chainId:
        input.chainId,

      account:
        input.account,

      mode:
        input.mode,

      registry:
        input.registry,

      ...(input.bridgeTargetAssetId
        ? {
            bridgeTargetAssetId:
              input.bridgeTargetAssetId,
          }
        : {}),
    });

  if (
    resolved.status !==
      "ready" ||
    !resolved.adapterId
  ) {
    return {
      kind:
        "error",

      tool,

      route:
        resolved.route,

      message:
        resolved.message ??
        `No connected CAREL capability supports this ${tool} goal.`,
    };
  }

  return {
    kind:
      "execution",

    tool,

    status:
      "ready",

    route:
      resolved.route,

    intent:
      resolved.intent,

    adapterId:
      resolved.adapterId,
  };
}
