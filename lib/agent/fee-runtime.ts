import {
  parseUnits,
} from "@/lib/carel/core/amounts";

import type {
  AgentPlan,
} from "@/lib/agent/plan";

import type {
  AgentExecutionReference,
} from "@/lib/agent/state-machine";


export type AgentFeeExecutionQuote =
  Readonly<{
    /**
     * Trusted server-generated quote identity.
     */
    quoteId:
      string;

    /**
     * A fee quote is bound to one concrete Agent run.
     *
     * It cannot be replayed on another run.
     */
    runId:
      string;

    /**
     * Stable once-per-plan identity signed by the CAREL server.
     */
    idempotencyKey:
      string;

    /**
     * SHA-256 of the exact reviewed Agent plan representation.
     *
     * This binds fee payment and reload authorization to one concrete plan.
     */
    planDigest:
      string;

    payer:
      string;

    issuedAt:
      number;

    chainId:
      string;

    assetId:
      string;

    assetSymbol:
      string;

    assetDecimals:
      number;

    amountText:
      string;

    amountUnits:
      string;

    recipient:
      string;

    expiresAt:
      number;

    scope:
      "plan";

    chargeModel:
      "once-per-plan";

    reason:
      "agent-execution";
  }>;


type AgentFeeBase =
  Readonly<{
    runId:
      string;

    /**
     * Stable key supplied to the eventual fee settlement endpoint.
     *
     * Retrying a request must reuse this exact key.
     */
    idempotencyKey:
      string;
  }>;


export type AgentFeeRuntimeState =
  | (
      AgentFeeBase &
      Readonly<{
        status:
          "pending-policy";
      }>
    )
  | (
      AgentFeeBase &
      Readonly<{
        status:
          "quoted";

        quote:
          AgentFeeExecutionQuote;
      }>
    )
  | (
      AgentFeeBase &
      Readonly<{
        status:
          "submitted";

        quote:
          AgentFeeExecutionQuote;

        executionReference:
          AgentExecutionReference;
      }>
    )
  | (
      AgentFeeBase &
      Readonly<{
        status:
          "settled";

        quote:
          AgentFeeExecutionQuote;

        executionReference:
          AgentExecutionReference;
      }>
    );


function nonEmpty(
  value:
    string,

  label:
    string,

  maxLength =
    256,
): string {
  const normalized =
    value.trim();

  if (
    !normalized ||
    normalized.length >
      maxLength
  ) {
    throw new Error(
      `Invalid Agent fee ${label}.`,
    );
  }

  return normalized;
}


function positiveAmountText(
  value:
    string,
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

  return normalized
    .replace(
      /[.0]/g,
      "",
    )
    .length > 0;
}


function validateReference(
  reference:
    AgentExecutionReference,
): AgentExecutionReference {
  if (
    reference.kind ===
      "transaction"
  ) {
    if (
      !/^0x[0-9a-f]{1,64}$/i.test(
        reference.id,
      )
    ) {
      throw new Error(
        "Agent fee returned an invalid transaction reference.",
      );
    }

    return {
      kind:
        "transaction",

      id:
        reference.id,
    };
  }


  const id =
    reference.id
      .trim()
      .toLowerCase();


  if (
    !id ||
    id.length > 256 ||
    !/^[a-z0-9:_-]+$/.test(
      id,
    )
  ) {
    throw new Error(
      "Agent fee returned an invalid provider reference.",
    );
  }


  return {
    kind:
      "provider-order",

    id,
  };
}


export function agentFeeIdempotencyKey(
  runId:
    string,
): string {
  const normalized =
    nonEmpty(
      runId,
      "run id",
      128,
    );


  return `${normalized}:agent-fee`;
}


export function createAgentFeeRuntime(
  plan:
    AgentPlan,

  runId:
    string,
): AgentFeeRuntimeState {
  if (
    plan.agentFee.scope !==
      "plan" ||
    plan.agentFee
      .chargeModel !==
      "once-per-plan" ||
    plan.agentFee.reason !==
      "agent-execution"
  ) {
    throw new Error(
      "Agent plan contains an unsupported fee policy.",
    );
  }


  return {
    status:
      "pending-policy",

    runId:
      nonEmpty(
        runId,
        "run id",
        128,
      ),

    idempotencyKey:
      agentFeeIdempotencyKey(
        runId,
      ),
  };
}


function validateQuote(
  state:
    AgentFeeRuntimeState,

  quote:
    AgentFeeExecutionQuote,

  now:
    number,
): AgentFeeExecutionQuote {
  if (
    quote.runId !==
      state.runId
  ) {
    throw new Error(
      "Agent fee quote belongs to another execution run.",
    );
  }


  if (
    quote.idempotencyKey !==
      state.idempotencyKey
  ) {
    throw new Error(
      "Agent fee quote idempotency key does not match this execution run.",
    );
  }


  if (
    !/^[0-9a-f]{64}$/i.test(
      quote.planDigest,
    )
  ) {
    throw new Error(
      "Agent fee quote contains an invalid plan digest.",
    );
  }


  if (
    !quote.payer.trim()
  ) {
    throw new Error(
      "Agent fee quote is missing its payer.",
    );
  }


  if (
    !Number.isFinite(
      quote.issuedAt,
    ) ||
    quote.issuedAt >
      now
  ) {
    throw new Error(
      "Agent fee quote contains an invalid issue time.",
    );
  }


  if (
    quote.scope !==
      "plan" ||
    quote.chargeModel !==
      "once-per-plan" ||
    quote.reason !==
      "agent-execution"
  ) {
    throw new Error(
      "Agent fee quote does not match CAREL's plan-level fee policy.",
    );
  }


  const quoteId =
    nonEmpty(
      quote.quoteId,
      "quote id",
      128,
    );


  const chainId =
    nonEmpty(
      quote.chainId,
      "chain id",
    );


  const assetId =
    nonEmpty(
      quote.assetId,
      "asset id",
    );


  const assetSymbol =
    nonEmpty(
      quote.assetSymbol,
      "asset symbol",
      32,
    );


  const recipient =
    nonEmpty(
      quote.recipient,
      "recipient",
    );


  if (
    !Number.isInteger(
      quote.assetDecimals,
    ) ||
    quote.assetDecimals < 0 ||
    quote.assetDecimals > 255
  ) {
    throw new Error(
      "Agent fee quote contains invalid asset decimals.",
    );
  }


  if (
    !positiveAmountText(
      quote.amountText,
    )
  ) {
    throw new Error(
      "Agent fee quote contains an invalid amount.",
    );
  }


  if (
    !/^[1-9]\d*$/.test(
      quote.amountUnits,
    )
  ) {
    throw new Error(
      "Agent fee quote contains invalid base units.",
    );
  }


  const parsed =
    parseUnits(
      quote.amountText,
      quote.assetDecimals,
    );


  if (
    parsed.toString() !==
      quote.amountUnits
  ) {
    throw new Error(
      "Agent fee human-readable amount does not match its exact base units.",
    );
  }


  if (
    !Number.isFinite(
      quote.expiresAt,
    ) ||
    quote.expiresAt <=
      now
  ) {
    throw new Error(
      "Agent fee quote has expired.",
    );
  }


  return {
    ...quote,

    quoteId,

    planDigest:
      quote.planDigest
        .toLowerCase(),

    chainId,
    assetId,

    assetSymbol:
      assetSymbol
        .toUpperCase(),

    recipient,

    amountText:
      quote.amountText
        .trim(),
  };
}


export function attachAgentFeeQuote(
  state:
    AgentFeeRuntimeState,

  quote:
    AgentFeeExecutionQuote,

  now =
    Date.now(),
): AgentFeeRuntimeState {
  if (
    state.status !==
      "pending-policy"
  ) {
    throw new Error(
      "Agent fee quote is already attached to this run.",
    );
  }


  return {
    status:
      "quoted",

    runId:
      state.runId,

    idempotencyKey:
      state
        .idempotencyKey,

    quote:
      validateQuote(
        state,
        quote,
        now,
      ),
  };
}


export function submitAgentFee(
  state:
    AgentFeeRuntimeState,

  reference:
    AgentExecutionReference,
): AgentFeeRuntimeState {
  if (
    state.status !==
      "quoted"
  ) {
    if (
      state.status ===
        "submitted" ||
      state.status ===
        "settled"
    ) {
      throw new Error(
        "Agent fee has already been submitted for this run.",
      );
    }


    throw new Error(
      "Agent fee cannot be submitted before a trusted quote is attached.",
    );
  }


  return {
    status:
      "submitted",

    runId:
      state.runId,

    idempotencyKey:
      state
        .idempotencyKey,

    quote:
      state.quote,

    executionReference:
      validateReference(
        reference,
      ),
  };
}


export function settleAgentFee(
  state:
    AgentFeeRuntimeState,
): AgentFeeRuntimeState {
  if (
    state.status ===
      "settled"
  ) {
    return state;
  }


  if (
    state.status !==
      "submitted"
  ) {
    throw new Error(
      "Agent fee must be submitted before it can settle.",
    );
  }


  return {
    ...state,

    status:
      "settled",
  };
}


export function agentFeeIsSettled(
  state:
    AgentFeeRuntimeState,
): boolean {
  return state.status ===
    "settled";
}
