import type {
  AgentRecoveryBoundPayload,
  AgentRecoveryData,
  SignedAgentRecoveryDraft,
} from "@/lib/agent/recovery-types";


export type SealAgentRuntimeRecoveryInput =
  Readonly<{
    runId:
      string;

    stageId:
      string;

    executionKey:
      string;

    chainId:
      string;

    account:
      string;

    data:
      AgentRecoveryData;
  }>;


export type LoadAgentRuntimeRecoveryInput =
  Readonly<{
    runId:
      string;

    stageId:
      string;

    executionKey:
      string;

    chainId:
      string;

    account:
      string;

    transactionId:
      string;
  }>;


export type AgentRuntimeRecovery =
  Readonly<{
    seal(
      input:
        SealAgentRuntimeRecoveryInput,
    ):
      Promise<
        SignedAgentRecoveryDraft | null
      >;

    bind(
      draft:
        SignedAgentRecoveryDraft,

      transactionId:
        string,
    ):
      Promise<void>;

    load(
      input:
        LoadAgentRuntimeRecoveryInput,
    ):
      Promise<
        AgentRecoveryBoundPayload | null
      >;
  }>;
