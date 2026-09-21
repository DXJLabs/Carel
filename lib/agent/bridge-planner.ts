import type {
  AgentExecutionMode,
} from "@/lib/agent/execution";

import {
  pendingAgentFeeQuote,
} from "@/lib/agent/fees";

import type {
  AgentPlan,
} from "@/lib/agent/plan";


export type BridgeAgentPlanInput =
  Readonly<{
    goal: string;

    /**
     * Chain of the wallet currently controlling/reviewing the execution.
     *
     * It can be the source OR destination chain for cross-chain routes.
     */
    connectedChainId:
      string;

    sourceChainId:
      string;

    destinationChainId:
      string;

    sourceAssetSymbol:
      string;

    destinationAssetSymbol:
      string;

    amountText:
      string;

    mode:
      AgentExecutionMode;
  }>;


function positiveAmountText(
  value: string,
): boolean {
  const normalized =
    value.trim();

  if (
    !/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(
      normalized,
    )
  ) {
    return false;
  }

  return /[1-9]/.test(
    normalized,
  );
}


/**
 * Provider-neutral cross-chain Bridge planner.
 *
 * It deliberately knows nothing about Garden, HTLCs, Bitcoin addresses,
 * quotes, deposit addresses, wallet calldata, or provider order ids.
 */
export function buildBridgeAgentPlan(
  input:
    BridgeAgentPlanInput,
): AgentPlan {
  const sourceSymbol =
    input.sourceAssetSymbol
      .trim();

  const destinationSymbol =
    input.destinationAssetSymbol
      .trim();

  if (
    input.mode !==
      "normal"
  ) {
    return {
      status:
        "needs-input",

      objective: {
        goal:
          input.goal,

        tool:
          "Bridge",

        mode:
          input.mode,

        chainId:
          input.connectedChainId,
      },

      stages: [],

      agentFee:
        pendingAgentFeeQuote(),

      message:
        "Cross-chain Bridge currently uses the public route. Privacy can be composed separately after the destination output is confirmed.",
    };
  }

  if (
    !input.connectedChainId
      .trim() ||
    !input.sourceChainId
      .trim() ||
    !input.destinationChainId
      .trim()
  ) {
    return {
      status:
        "blocked",

      objective: {
        goal:
          input.goal,

        tool:
          "Bridge",

        mode:
          input.mode,

        chainId:
          input.connectedChainId,
      },

      stages: [],

      agentFee:
        pendingAgentFeeQuote(),

      message:
        "Bridge requires explicit source, destination, and connected chains.",
    };
  }

  if (
    input.sourceChainId ===
      input.destinationChainId
  ) {
    return {
      status:
        "blocked",

      objective: {
        goal:
          input.goal,

        tool:
          "Bridge",

        mode:
          input.mode,

        chainId:
          input.connectedChainId,
      },

      stages: [],

      agentFee:
        pendingAgentFeeQuote(),

      message:
        "Bridge source and destination chains must be different.",
    };
  }

  if (
    input.connectedChainId !==
      input.sourceChainId &&
    input.connectedChainId !==
      input.destinationChainId
  ) {
    return {
      status:
        "blocked",

      objective: {
        goal:
          input.goal,

        tool:
          "Bridge",

        mode:
          input.mode,

        chainId:
          input.connectedChainId,
      },

      stages: [],

      agentFee:
        pendingAgentFeeQuote(),

      message:
        "The connected wallet is not attached to either side of this Bridge route.",
    };
  }

  if (
    !sourceSymbol ||
    !destinationSymbol ||
    !positiveAmountText(
      input.amountText,
    )
  ) {
    return {
      status:
        "needs-input",

      objective: {
        goal:
          input.goal,

        tool:
          "Bridge",

        mode:
          input.mode,

        chainId:
          input.connectedChainId,
      },

      stages: [],

      agentFee:
        pendingAgentFeeQuote(),

      message:
        "Bridge requires explicit assets and a positive amount.",
    };
  }

  return {
    status:
      "ready",

    objective: {
      goal:
        input.goal,

      tool:
        "Bridge",

      mode:
        "normal",

      chainId:
        input.connectedChainId,
    },

    stages: [
      {
        id:
          "bridge-1",

        action:
          "bridge",

        sourceChainId:
          input.sourceChainId,

        destinationChainId:
          input.destinationChainId,

        inputAssetSymbol:
          sourceSymbol,

        outputAssetSymbol:
          destinationSymbol,

        amount: {
          kind:
            "exact",

          amountText:
            input.amountText,
        },

        privacyBefore:
          "public",

        privacyAfter:
          "public",

        dependsOn: [],

        status:
          "planned",

        note:
          "The provider order remains submitted until destination delivery is verified.",
      },
    ],

    agentFee:
      pendingAgentFeeQuote(),
  };
}
