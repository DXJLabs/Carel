import { formatUnits18, parseUnits18 } from "@/lib/strk20/units";

export type LiveGoal = "target-private" | "target-public";
export type LiveAction = "shield" | "unshield" | "none" | "reveal-private";

export type LivePlanStatus =
  | "blocked"
  | "needs-private-state"
  | "satisfied"
  | "ready";

export type LivePlan = {
  status: LivePlanStatus;
  action: LiveAction;
  title: string;
  reason: string;
  target: bigint;
  delta: bigint;
  sourceBalance: bigint | null;
  destinationBalance: bigint | null;
};

type BuildLivePlanInput = {
  goal: LiveGoal;
  targetText: string;
  connected: boolean;
  networkReady: boolean;
  strk20Capable: boolean;
  publicStrk: bigint | null;
  privateStrk: bigint | null;
  privateRevealed: boolean;
};

const ZERO = BigInt(0);

function invalidPlan(reason: string): LivePlan {
  return {
    status: "blocked",
    action: "none",
    title: "Plan unavailable",
    reason,
    target: ZERO,
    delta: ZERO,
    sourceBalance: null,
    destinationBalance: null,
  };
}

export function buildLivePlan(input: BuildLivePlanInput): LivePlan {
  let target: bigint;

  try {
    target = parseUnits18(input.targetText);
  } catch {
    return invalidPlan("Enter a valid STRK target amount.");
  }

  if (target <= ZERO) {
    return invalidPlan("Target must be greater than zero.");
  }

  if (!input.connected) {
    return invalidPlan("Connect Ready before CAREL can read wallet state.");
  }

  if (!input.networkReady) {
    return invalidPlan("Switch the connected wallet to Starknet Sepolia.");
  }

  if (!input.strk20Capable) {
    return invalidPlan("The connected wallet does not expose STRK20 Wallet API support.");
  }

  if (input.goal === "target-private") {
    if (!input.privateRevealed) {
      return {
        status: "needs-private-state",
        action: "reveal-private",
        title: "Private state required",
        reason:
          "CAREL will not guess your private balance. Reveal it once so the planner can calculate only the required delta.",
        target,
        delta: ZERO,
        sourceBalance: input.publicStrk,
        destinationBalance: null,
      };
    }

    const currentPrivate = input.privateStrk ?? ZERO;

    if (currentPrivate >= target) {
      return {
        status: "satisfied",
        action: "none",
        title: "Target already satisfied",
        reason: `Private balance is already ${formatUnits18(currentPrivate)} STRK. No transaction is necessary.`,
        target,
        delta: ZERO,
        sourceBalance: input.publicStrk,
        destinationBalance: currentPrivate,
      };
    }

    if (input.publicStrk === null) {
      return invalidPlan("Public STRK balance is not available yet.");
    }

    const delta = target - currentPrivate;

    if (input.publicStrk < delta) {
      return {
        status: "blocked",
        action: "none",
        title: "Insufficient public STRK",
        reason: `CAREL needs ${formatUnits18(delta)} STRK to reach the private target, but the public wallet has ${formatUnits18(input.publicStrk)} STRK.`,
        target,
        delta,
        sourceBalance: input.publicStrk,
        destinationBalance: currentPrivate,
      };
    }

    return {
      status: "ready",
      action: "shield",
      title: `Shield ${formatUnits18(delta)} STRK`,
      reason:
        "CAREL calculated the smallest public → private move required to reach your target. Nothing beyond this delta will be moved.",
      target,
      delta,
      sourceBalance: input.publicStrk,
      destinationBalance: currentPrivate,
    };
  }

  if (input.publicStrk !== null && input.publicStrk >= target) {
    return {
      status: "satisfied",
      action: "none",
      title: "Target already satisfied",
      reason: `Public balance is already ${formatUnits18(input.publicStrk)} STRK. No transaction is necessary.`,
      target,
      delta: ZERO,
      sourceBalance: input.privateStrk,
      destinationBalance: input.publicStrk,
    };
  }

  if (!input.privateRevealed) {
    return {
      status: "needs-private-state",
      action: "reveal-private",
      title: "Private state required",
      reason:
        "The public balance is below target. CAREL needs permission to read the private STRK balance before deciding whether an Unshield is possible.",
      target,
      delta: ZERO,
      sourceBalance: null,
      destinationBalance: input.publicStrk,
    };
  }

  if (input.publicStrk === null) {
    return invalidPlan("Public STRK balance is not available yet.");
  }

  const currentPrivate = input.privateStrk ?? ZERO;
  const delta = target - input.publicStrk;

  if (currentPrivate < delta) {
    return {
      status: "blocked",
      action: "none",
      title: "Insufficient private STRK",
      reason: `CAREL needs ${formatUnits18(delta)} STRK to reach the public target, but only ${formatUnits18(currentPrivate)} STRK is available privately.`,
      target,
      delta,
      sourceBalance: currentPrivate,
      destinationBalance: input.publicStrk,
    };
  }

  return {
    status: "ready",
    action: "unshield",
    title: `Unshield ${formatUnits18(delta)} STRK`,
    reason:
      "CAREL calculated the smallest private → public move required to reach your target. The withdrawal amount and destination will be public.",
    target,
    delta,
    sourceBalance: currentPrivate,
    destinationBalance: input.publicStrk,
  };
}
