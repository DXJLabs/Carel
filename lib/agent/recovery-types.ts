export type AgentRecoveryKind =
  | "swap"
  | "borrow"
  | "lend"
  | "staking";


export type AgentRecoveryData =
  Readonly<
    Record<
      string,
      string
    >
  >;


export type AgentRecoveryDraftPayload =
  Readonly<{
    version:
      1;

    kind:
      AgentRecoveryKind;

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

    /**
     * Runtime-specific PUBLIC verification metadata.
     *
     * Never put wallet secrets, STRK20 notes, signatures or private balances
     * here.
     */
    data:
      AgentRecoveryData;

    issuedAt:
      number;

    expiresAt:
      number;
  }>;


export type SignedAgentRecoveryDraft =
  Readonly<{
    payload:
      AgentRecoveryDraftPayload;

    signature:
      string;
  }>;


export type AgentRecoveryBoundPayload =
  AgentRecoveryDraftPayload &
  Readonly<{
    transactionId:
      string;
  }>;


export type SignedAgentRecoveryCapsule =
  Readonly<{
    payload:
      AgentRecoveryBoundPayload;

    signature:
      string;
  }>;
