import {
  createHmac,
  timingSafeEqual,
} from "node:crypto";

import {
  normalizeStarknetAddress,
} from "@/lib/carel/ecosystems/starknet/addresses";

import type {
  AgentRecoveryBoundPayload,
  AgentRecoveryData,
  AgentRecoveryDraftPayload,
  AgentRecoveryKind,
  SignedAgentRecoveryCapsule,
  SignedAgentRecoveryDraft,
} from "@/lib/agent/recovery-types";


const DEFAULT_TTL_MS =
  24 * 60 * 60 * 1000;

const MAX_TTL_MS =
  7 * 24 * 60 * 60 * 1000;


const RECOVERY_KINDS =
  new Set<
    AgentRecoveryKind
  >([
    "swap",
    "borrow",
    "lend",
    "staking",
  ]);


function secret():
  string {
  const value =
    process.env
      .CAREL_AGENT_RECOVERY_SIGNING_SECRET
      ?.trim();


  if (
    !value ||
    value.length < 32
  ) {
    throw new Error(
      "CAREL Agent recovery signing secret is not configured.",
    );
  }


  return value;
}


export function agentRecoveryPolicyConfigured():
  boolean {
  const value =
    process.env
      .CAREL_AGENT_RECOVERY_SIGNING_SECRET
      ?.trim();


  return Boolean(
    value &&
    value.length >= 32
  );
}


function nonEmpty(
  value:
    unknown,

  label:
    string,

  maxLength:
    number,
): string {
  if (
    typeof value !==
      "string"
  ) {
    throw new Error(
      `Invalid Agent recovery ${label}.`,
    );
  }


  const normalized =
    value.trim();


  if (
    !normalized ||
    normalized.length >
      maxLength
  ) {
    throw new Error(
      `Invalid Agent recovery ${label}.`,
    );
  }


  return normalized;
}


function runId(
  value:
    unknown,
): string {
  const normalized =
    nonEmpty(
      value,
      "run id",
      128,
    );


  if (
    !/^[a-z0-9:_-]+$/i.test(
      normalized,
    )
  ) {
    throw new Error(
      "Invalid Agent recovery run id.",
    );
  }


  return normalized;
}


function stageId(
  value:
    unknown,
): string {
  const normalized =
    nonEmpty(
      value,
      "stage id",
      128,
    );


  if (
    !/^[a-z0-9:_-]+$/i.test(
      normalized,
    )
  ) {
    throw new Error(
      "Invalid Agent recovery stage id.",
    );
  }


  return normalized;
}


function transactionId(
  value:
    unknown,
): string {
  const normalized =
    nonEmpty(
      value,
      "transaction id",
      80,
    );


  if (
    !/^0x[0-9a-f]{1,64}$/i.test(
      normalized,
    )
  ) {
    throw new Error(
      "Invalid Agent recovery transaction id.",
    );
  }


  return normalized
    .toLowerCase();
}


function normalizeData(
  value:
    unknown,
): AgentRecoveryData {
  if (
    !value ||
    typeof value !==
      "object" ||
    Array.isArray(
      value,
    )
  ) {
    throw new Error(
      "Invalid Agent recovery data.",
    );
  }


  const entries =
    Object.entries(
      value as Record<
        string,
        unknown
      >,
    );


  if (
    entries.length >
      32
  ) {
    throw new Error(
      "Agent recovery data contains too many fields.",
    );
  }


  const result:
    Record<
      string,
      string
    > = {};


  for (
    const [
      rawKey,
      rawValue,
    ]
    of entries
  ) {
    if (
      !/^[a-zA-Z0-9_.:-]{1,64}$/.test(
        rawKey,
      ) ||
      rawKey ===
        "__proto__" ||
      rawKey ===
        "constructor" ||
      rawKey ===
        "prototype"
    ) {
      throw new Error(
        "Agent recovery data contains an invalid key.",
      );
    }


    if (
      typeof rawValue !==
        "string" ||
      rawValue.length >
        512
    ) {
      throw new Error(
        `Agent recovery data field ${rawKey} is invalid.`,
      );
    }


    result[
      rawKey
    ] =
      rawValue;
  }


  return Object.fromEntries(
    Object.entries(
      result,
    ).sort(
      (
        [left],
        [right],
      ) =>
        left.localeCompare(
          right,
        ),
    ),
  );
}


function normalizeKind(
  value:
    unknown,
): AgentRecoveryKind {
  if (
    typeof value !==
      "string" ||
    !RECOVERY_KINDS.has(
      value as
        AgentRecoveryKind,
    )
  ) {
    throw new Error(
      "Invalid Agent recovery kind.",
    );
  }


  return value as
    AgentRecoveryKind;
}


function normalizeDraftPayload(
  input:
    Readonly<{
      kind:
        unknown;

      runId:
        unknown;

      stageId:
        unknown;

      executionKey:
        unknown;

      chainId:
        unknown;

      account:
        unknown;

      data:
        unknown;

      issuedAt:
        unknown;

      expiresAt:
        unknown;
    }>,
): AgentRecoveryDraftPayload {
  const issuedAt =
    Number(
      input.issuedAt,
    );

  const expiresAt =
    Number(
      input.expiresAt,
    );


  if (
    !Number.isFinite(
      issuedAt,
    ) ||
    !Number.isFinite(
      expiresAt,
    ) ||
    expiresAt <=
      issuedAt ||
    expiresAt -
      issuedAt >
      MAX_TTL_MS
  ) {
    throw new Error(
      "Invalid Agent recovery lifetime.",
    );
  }


  return {
    version:
      1,

    kind:
      normalizeKind(
        input.kind,
      ),

    runId:
      runId(
        input.runId,
      ),

    stageId:
      stageId(
        input.stageId,
      ),

    executionKey:
      nonEmpty(
        input.executionKey,
        "execution key",
        260,
      ),

    chainId:
      nonEmpty(
        input.chainId,
        "chain id",
        256,
      ),

    account:
      normalizeStarknetAddress(
        nonEmpty(
          input.account,
          "account",
          80,
        ),
      ),

    data:
      normalizeData(
        input.data,
      ),

    issuedAt,
    expiresAt,
  };
}


function canonicalDraft(
  payload:
    AgentRecoveryDraftPayload,
): string {
  return JSON.stringify([
    payload.version,
    payload.kind,
    payload.runId,
    payload.stageId,
    payload.executionKey,
    payload.chainId,
    payload.account,
    Object.entries(
      payload.data,
    ),
    payload.issuedAt,
    payload.expiresAt,
  ]);
}


function canonicalBound(
  payload:
    AgentRecoveryBoundPayload,
): string {
  return JSON.stringify([
    canonicalDraft(
      payload,
    ),
    payload.transactionId,
  ]);
}


function sign(
  domain:
    string,

  message:
    string,
): string {
  return createHmac(
    "sha256",
    secret(),
  )
    .update(
      `${domain}:${message}`,
    )
    .digest(
      "hex",
    );
}


function signatureEqual(
  actual:
    unknown,

  expected:
    string,
): boolean {
  if (
    typeof actual !==
      "string" ||
    !/^[0-9a-f]{64}$/i.test(
      actual,
    )
  ) {
    return false;
  }


  return timingSafeEqual(
    Buffer.from(
      actual,
      "hex",
    ),

    Buffer.from(
      expected,
      "hex",
    ),
  );
}


function assertAlive(
  payload:
    AgentRecoveryDraftPayload,

  now:
    number,
) {
  if (
    payload.issuedAt >
      now ||
    payload.expiresAt <=
      now
  ) {
    throw new Error(
      "Agent recovery capsule has expired.",
    );
  }
}


export function sealAgentRecoveryDraft({
  kind,
  runId:
    requestedRunId,
  stageId:
    requestedStageId,
  executionKey,
  chainId,
  account,
  data,
  now =
    Date.now(),
  ttlMs =
    DEFAULT_TTL_MS,
}: Readonly<{
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

  data:
    AgentRecoveryData;

  now?:
    number;

  ttlMs?:
    number;
}>): SignedAgentRecoveryDraft {
  if (
    !Number.isInteger(
      ttlMs,
    ) ||
    ttlMs <= 0 ||
    ttlMs >
      MAX_TTL_MS
  ) {
    throw new Error(
      "Invalid Agent recovery TTL.",
    );
  }


  const payload =
    normalizeDraftPayload({
      kind,

      runId:
        requestedRunId,

      stageId:
        requestedStageId,

      executionKey,

      chainId,

      account,

      data,

      issuedAt:
        now,

      expiresAt:
        now +
        ttlMs,
    });


  return {
    payload,

    signature:
      sign(
        "agent-recovery-draft-v1",
        canonicalDraft(
          payload,
        ),
      ),
  };
}


export function verifyAgentRecoveryDraft(
  signed:
    SignedAgentRecoveryDraft,

  now =
    Date.now(),
): AgentRecoveryDraftPayload {
  if (
    !signed ||
    typeof signed !==
      "object"
  ) {
    throw new Error(
      "Invalid Agent recovery draft.",
    );
  }


  const payload =
    normalizeDraftPayload(
      signed.payload,
    );


  const expected =
    sign(
      "agent-recovery-draft-v1",
      canonicalDraft(
        payload,
      ),
    );


  if (
    !signatureEqual(
      signed.signature,
      expected,
    )
  ) {
    throw new Error(
      "Agent recovery draft signature is invalid.",
    );
  }


  assertAlive(
    payload,
    now,
  );


  return payload;
}


export function bindAgentRecoveryTransaction({
  draft,
  transactionId:
    requestedTransactionId,
  now =
    Date.now(),
}: Readonly<{
  draft:
    SignedAgentRecoveryDraft;

  transactionId:
    string;

  now?:
    number;
}>): SignedAgentRecoveryCapsule {
  const payload =
    verifyAgentRecoveryDraft(
      draft,
      now,
    );


  const bound:
    AgentRecoveryBoundPayload = {
    ...payload,

    transactionId:
      transactionId(
        requestedTransactionId,
      ),
  };


  return {
    payload:
      bound,

    signature:
      sign(
        "agent-recovery-bound-v1",
        canonicalBound(
          bound,
        ),
      ),
  };
}


export function verifyAgentRecoveryCapsule(
  signed:
    SignedAgentRecoveryCapsule,

  now =
    Date.now(),
): AgentRecoveryBoundPayload {
  if (
    !signed ||
    typeof signed !==
      "object"
  ) {
    throw new Error(
      "Invalid Agent recovery capsule.",
    );
  }


  const draft =
    normalizeDraftPayload(
      signed.payload,
    );


  const payload:
    AgentRecoveryBoundPayload = {
    ...draft,

    transactionId:
      transactionId(
        signed.payload
          .transactionId,
      ),
  };


  const expected =
    sign(
      "agent-recovery-bound-v1",
      canonicalBound(
        payload,
      ),
    );


  if (
    !signatureEqual(
      signed.signature,
      expected,
    )
  ) {
    throw new Error(
      "Agent recovery capsule signature is invalid.",
    );
  }


  assertAlive(
    payload,
    now,
  );


  return payload;
}
