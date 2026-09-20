import type {
  AgentFeeQuote,
} from "@/lib/agent/plan";


/**
 * Agent planning always exposes the CAREL fee boundary.
 *
 * No amount is invented client-side. The execution preparation layer will
 * later turn this into an exact, reviewed quote.
 */
export function pendingAgentFeeQuote():
  AgentFeeQuote {
  return {
    status:
      "pending-policy",

    scope:
      "plan",

    chargeModel:
      "once-per-plan",

    reason:
      "agent-execution",
  };
}
