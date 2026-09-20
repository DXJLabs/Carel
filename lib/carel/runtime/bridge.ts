import {
  routeAgentGoal,
  type AgentRoute,
} from "@/lib/agent/router";

import {
  gardenBridgeIntentFromRequest,
} from "@/lib/garden/protocol";

import type {
  BridgeIntent,
} from "@/lib/garden/types";

/**
 * Transitional shape consumed by the current GardenBridge UI.
 *
 * Provider-specific bridge state stays behind CAREL's runtime boundary rather
 * than leaking into Agent planning or the Workspace component.
 */
export type BridgeSurfaceIntent =
  BridgeIntent;

/**
 * Converts a provider-neutral Agent route into the current Bridge UI state.
 *
 * A null result means the runtime surface should let the user choose or edit
 * the route instead of guessing unsupported provider details.
 */
export function bridgeSurfaceIntentFromRoute(
  route: AgentRoute,
): BridgeSurfaceIntent | null {
  if (
    route.tool !==
      "Bridge" ||
    route.status !==
      "ready" ||
    !route.bridgeRequest
  ) {
    return null;
  }

  try {
    return gardenBridgeIntentFromRequest(
      route.bridgeRequest,
    );
  } catch {
    return null;
  }
}

/**
 * Convenience boundary for direct Bridge tool navigation.
 */
export function bridgeSurfaceIntentFromGoal(
  goal: string,
): BridgeSurfaceIntent | null {
  return bridgeSurfaceIntentFromRoute(
    routeAgentGoal(
      goal,
    ),
  );
}
