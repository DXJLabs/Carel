import type {
  AgentExecutionMode,
} from "@/lib/agent/execution";

import type {
  AgentTool,
} from "@/lib/agent/router";


export type AgentPlanStatus =
  | "ready"
  | "needs-input"
  | "blocked";


export type AgentPrivacyState =
  | "public"
  | "private";


export type AgentStageAction =
  | "swap"
  | "bridge"
  | "stake"
  | "lend"
  | "borrow"
  | "shield"
  | "unshield";


export type AgentStageAmount =
  | Readonly<{
      kind: "exact";
      amountText: string;
    }>
  | Readonly<{
      kind: "stage-output";
      stageId: string;
    }>;


export type AgentPlanStage =
  Readonly<{
    id: string;

    action:
      AgentStageAction;

    sourceChainId: string;

    destinationChainId?:
      string;

    inputAssetSymbol?:
      string;

    outputAssetSymbol?:
      string;

    amount?:
      AgentStageAmount;

    collateral?:
      Readonly<{
        amountText: string;
        symbol: string;
      }>;

    privacyBefore:
      AgentPrivacyState;

    privacyAfter:
      AgentPrivacyState;

    dependsOn:
      readonly string[];

    status:
      "planned";

    note?: string;
  }>;


/**
 * CAREL revenue belongs to the complete Agent plan rather than silently
 * charging every stage.
 *
 * The actual fee amount/recipient is intentionally not decided here.
 * A trusted preparation layer will quote it before execution.
 */
export type AgentFeeQuote =
  Readonly<{
    status:
      "pending-policy";

    scope:
      "plan";

    chargeModel:
      "once-per-plan";

    reason:
      "agent-execution";
  }>;


export type AgentPlan =
  Readonly<{
    status:
      AgentPlanStatus;

    objective:
      Readonly<{
        goal: string;
        tool: AgentTool;
        mode:
          AgentExecutionMode;
        chainId: string;
      }>;

    stages:
      readonly AgentPlanStage[];

    agentFee:
      AgentFeeQuote;

    message?: string;
  }>;
