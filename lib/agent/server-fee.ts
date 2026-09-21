import {
  createHmac,
  timingSafeEqual,
} from "node:crypto";

import {
  hash,
  num,
} from "starknet";

import {
  parseUnits,
} from "@/lib/carel/core/amounts";

import {
  normalizeStarknetAddress,
} from "@/lib/carel/ecosystems/starknet/addresses";

import {
  getCarelNetwork,
} from "@/lib/carel/networks";

import {
  agentFeeIdempotencyKey,
  type AgentFeeExecutionQuote,
} from "@/lib/agent/fee-runtime";


const DEFAULT_QUOTE_TTL_MS =
  5 * 60_000;

const MAX_SETTLEMENT_GRACE_MS =
  15 * 60_000;


export type SignedAgentFeeQuote =
  Readonly<{
    quote:
      AgentFeeExecutionQuote;

    signature:
      string;
  }>;


export type AgentFeeEvent =
  Readonly<{
    from_address:
      string;

    keys:
      readonly string[];

    data:
      readonly string[];
  }>;


function feeSecret():
  string {
  const secret =
    process.env
      .CAREL_AGENT_FEE_SIGNING_SECRET
      ?.trim();


  if (
    !secret ||
    secret.length < 32
  ) {
    throw new Error(
      "CAREL Agent fee signing secret is not configured.",
    );
  }


  return secret;
}


function feeAmountText():
  string {
  const value =
    process.env
      .CAREL_AGENT_FEE_AMOUNT_STRK
      ?.trim();


  if (!value) {
    throw new Error(
      "CAREL Agent fee amount is not configured.",
    );
  }


  return value;
}


function feeRecipient():
  string {
  const value =
    process.env
      .CAREL_AGENT_FEE_RECIPIENT
      ?.trim();


  if (!value) {
    throw new Error(
      "CAREL Agent fee recipient is not configured.",
    );
  }


  const recipient =
    normalizeStarknetAddress(
      value,
    );


  if (
    BigInt(
      recipient,
    ) === 0n
  ) {
    throw new Error(
      "CAREL Agent fee recipient cannot be zero.",
    );
  }


  return recipient;
}


function quoteTtlMs():
  number {
  const raw =
    process.env
      .CAREL_AGENT_FEE_QUOTE_TTL_SECONDS
      ?.trim();


  if (!raw) {
    return DEFAULT_QUOTE_TTL_MS;
  }


  const seconds =
    Number(
      raw,
    );


  if (
    !Number.isInteger(
      seconds,
    ) ||
    seconds < 60 ||
    seconds > 900
  ) {
    throw new Error(
      "CAREL Agent fee quote TTL must be between 60 and 900 seconds.",
    );
  }


  return seconds *
    1000;
}


function canonicalQuote(
  quote:
    AgentFeeExecutionQuote,
): string {
  /*
   * Explicit tuple avoids object-key ordering ambiguity.
   */
  return JSON.stringify([
    quote.quoteId,
    quote.runId,
    quote.idempotencyKey,
    quote.payer,
    quote.issuedAt,
    quote.chainId,
    quote.assetId,
    quote.assetSymbol,
    quote.assetDecimals,
    quote.amountText,
    quote.amountUnits,
    quote.recipient,
    quote.expiresAt,
    quote.scope,
    quote.chargeModel,
    quote.reason,
  ]);
}


function sign(
  message:
    string,
): string {
  return createHmac(
    "sha256",
    feeSecret(),
  )
    .update(
      message,
    )
    .digest(
      "hex",
    );
}


function safeSignatureEqual(
  actual:
    string,

  expected:
    string,
): boolean {
  if (
    !/^[0-9a-f]{64}$/i.test(
      actual,
    ) ||
    !/^[0-9a-f]{64}$/i.test(
      expected,
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


function sameFelt(
  left:
    string,

  right:
    string,
): boolean {
  try {
    return (
      BigInt(
        left,
      ) ===
      BigInt(
        right,
      )
    );
  } catch {
    return false;
  }
}


function readU256(
  low:
    string,

  high:
    string,
): bigint {
  return (
    BigInt(
      low,
    ) +
    (
      BigInt(
        high,
      ) << 128n
    )
  );
}


export function createSignedAgentFeeQuote({
  runId,
  chainId,
  payer,
  now =
    Date.now(),
}: Readonly<{
  runId:
    string;

  chainId:
    string;

  payer:
    string;

  now?:
    number;
}>): SignedAgentFeeQuote {
  const normalizedRunId =
    runId.trim();


  if (
    !normalizedRunId ||
    normalizedRunId.length >
      128
  ) {
    throw new Error(
      "Invalid Agent fee run id.",
    );
  }


  const network =
    getCarelNetwork(
      chainId,
    );


  if (!network) {
    throw new Error(
      "Agent fee is not configured for this network.",
    );
  }


  const normalizedPayer =
    normalizeStarknetAddress(
      payer,
    );


  if (
    BigInt(
      normalizedPayer,
    ) === 0n
  ) {
    throw new Error(
      "Agent fee payer cannot be zero.",
    );
  }


  const recipient =
    feeRecipient();


  if (
    sameFelt(
      recipient,
      normalizedPayer,
    )
  ) {
    throw new Error(
      "Agent fee payer and recipient must be different.",
    );
  }


  const asset =
    network.assets.strk;


  const amountText =
    feeAmountText();


  const amountUnits =
    parseUnits(
      amountText,
      asset.decimals,
    );


  if (
    amountUnits <= 0n
  ) {
    throw new Error(
      "CAREL Agent fee amount must be greater than zero.",
    );
  }


  /*
   * Minute-bucketed issue time:
   * repeated quote requests within the same minute produce the same signed
   * quote for this run/account while still leaving almost the full TTL.
   */
  const issuedAt =
    Math.floor(
      now / 60_000,
    ) *
    60_000;


  const expiresAt =
    issuedAt +
    quoteTtlMs();


  if (
    now >=
      expiresAt
  ) {
    throw new Error(
      "CAREL Agent fee policy produced an expired quote.",
    );
  }


  const idempotencyKey =
    agentFeeIdempotencyKey(
      normalizedRunId,
    );


  const quoteSeed =
    JSON.stringify([
      normalizedRunId,
      idempotencyKey,
      normalizedPayer,
      issuedAt,
      network.chainId,
      asset.id,
      amountUnits.toString(),
      recipient,
      expiresAt,
    ]);


  const quoteId =
    sign(
      `quote:${quoteSeed}`,
    );


  const quote:
    AgentFeeExecutionQuote = {
    quoteId,

    runId:
      normalizedRunId,

    idempotencyKey,

    payer:
      normalizedPayer,

    issuedAt,

    chainId:
      network.chainId,

    assetId:
      asset.id,

    assetSymbol:
      asset.symbol,

    assetDecimals:
      asset.decimals,

    amountText,

    amountUnits:
      amountUnits.toString(),

    recipient,

    expiresAt,

    scope:
      "plan",

    chargeModel:
      "once-per-plan",

    reason:
      "agent-execution",
  };


  return {
    quote,

    signature:
      sign(
        `signed:${canonicalQuote(
          quote,
        )}`,
      ),
  };
}


export function verifySignedAgentFeeQuote(
  signed:
    SignedAgentFeeQuote,

  {
    now =
      Date.now(),

    settlement =
      false,
  }:
    Readonly<{
      now?:
        number;

      settlement?:
        boolean;
    }> = {},
): AgentFeeExecutionQuote {
  const {
    quote,
    signature,
  } =
    signed;


  const expected =
    sign(
      `signed:${canonicalQuote(
        quote,
      )}`,
    );


  if (
    !safeSignatureEqual(
      signature,
      expected,
    )
  ) {
    throw new Error(
      "Agent fee quote signature is invalid.",
    );
  }


  if (
    quote.idempotencyKey !==
      agentFeeIdempotencyKey(
        quote.runId,
      )
  ) {
    throw new Error(
      "Agent fee quote contains an invalid idempotency key.",
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


  const latestAllowed =
    settlement
      ? quote.expiresAt +
        MAX_SETTLEMENT_GRACE_MS
      : quote.expiresAt;


  if (
    !Number.isFinite(
      quote.expiresAt,
    ) ||
    now >
      latestAllowed
  ) {
    throw new Error(
      "Agent fee quote has expired.",
    );
  }


  const network =
    getCarelNetwork(
      quote.chainId,
    );


  if (!network) {
    throw new Error(
      "Agent fee quote references an unsupported network.",
    );
  }


  if (
    quote.assetId !==
      network.assets.strk.id ||
    quote.assetSymbol !==
      network.assets.strk.symbol ||
    quote.assetDecimals !==
      network.assets.strk.decimals
  ) {
    throw new Error(
      "Agent fee quote references an unexpected fee asset.",
    );
  }


  if (
    parseUnits(
      quote.amountText,
      quote.assetDecimals,
    ).toString() !==
      quote.amountUnits
  ) {
    throw new Error(
      "Agent fee quote amount is inconsistent.",
    );
  }


  const expectedRecipient =
    feeRecipient();


  if (
    !sameFelt(
      expectedRecipient,
      quote.recipient,
    )
  ) {
    throw new Error(
      "Agent fee recipient does not match current CAREL policy.",
    );
  }


  return quote;
}


export function verifyAgentFeeTransferEvents({
  quote,
  tokenAddress,
  events,
}: Readonly<{
  quote:
    AgentFeeExecutionQuote;

  tokenAddress:
    string;

  events:
    readonly AgentFeeEvent[];
}>): void {
  const transferSelector =
    num.toHex(
      hash.starknetKeccak(
        "Transfer",
      ),
    );


  const expectedAmount =
    BigInt(
      quote.amountUnits,
    );


  const matched =
    events.some(
      (event) => {
        if (
          !sameFelt(
            event.from_address,
            tokenAddress,
          ) ||
          event.keys.length <
            3 ||
          event.data.length <
            2
        ) {
          return false;
        }


        if (
          !sameFelt(
            event.keys[0],
            transferSelector,
          ) ||
          !sameFelt(
            event.keys[1],
            quote.payer,
          ) ||
          !sameFelt(
            event.keys[2],
            quote.recipient,
          )
        ) {
          return false;
        }


        try {
          return (
            readU256(
              event.data[0],
              event.data[1],
            ) ===
            expectedAmount
          );
        } catch {
          return false;
        }
      },
    );


  if (!matched) {
    throw new Error(
      "Agent fee transaction does not contain the exact reviewed STRK transfer.",
    );
  }
}


export async function verifyAgentFeeSettlement({
  signedQuote,
  transactionHash,
}: Readonly<{
  signedQuote:
    SignedAgentFeeQuote;

  transactionHash:
    string;
}>): Promise<void> {
  if (
    !/^0x[0-9a-f]{1,64}$/i.test(
      transactionHash,
    )
  ) {
    throw new Error(
      "Agent fee settlement received an invalid transaction hash.",
    );
  }


  const quote =
    verifySignedAgentFeeQuote(
      signedQuote,
      {
        settlement:
          true,
      },
    );


  const network =
    getCarelNetwork(
      quote.chainId,
    );


  if (!network) {
    throw new Error(
      "Agent fee settlement references an unsupported network.",
    );
  }


  const receipt:
    unknown =
    await network.provider
      .waitForTransaction(
        transactionHash,
        {
          retries:
            3,

          retryInterval:
            1500,
        },
      );


  const raw =
    receipt as
      Record<
        string,
        unknown
      >;


  if (
    typeof (
      raw as {
        isSuccess?:
          () => boolean;
      }
    ).isSuccess ===
      "function" &&
    !(
      raw as {
        isSuccess:
          () => boolean;
      }
    ).isSuccess()
  ) {
    throw new Error(
      "Agent fee transaction did not succeed.",
    );
  }


  const value =
    raw.value &&
    typeof raw.value ===
      "object"
      ? raw.value as
          Record<
            string,
            unknown
          >
      : raw;


  if (
    value.execution_status ===
      "REVERTED"
  ) {
    throw new Error(
      "Agent fee transaction reverted.",
    );
  }


  const events =
    Array.isArray(
      value.events,
    )
      ? value.events
          .filter(
            (
              event,
            ):
              event is
                AgentFeeEvent =>
              Boolean(
                event &&
                typeof event ===
                  "object" &&
                typeof (
                  event as
                    Record<
                      string,
                      unknown
                    >
                ).from_address ===
                  "string" &&
                Array.isArray(
                  (
                    event as
                      Record<
                        string,
                        unknown
                      >
                  ).keys,
                ) &&
                Array.isArray(
                  (
                    event as
                      Record<
                        string,
                        unknown
                      >
                  ).data,
                ),
              ),
          )
      : [];


  verifyAgentFeeTransferEvents({
    quote,

    tokenAddress:
      network.assets.strk
        .identifier.kind ===
        "contract"
        ? network.assets.strk
            .identifier.address
        : "",

    events,
  });
}


/**
 * Deployment-safe activation probe.
 *
 * CAREL only enables fee enforcement when every required server-side policy
 * value exists. No client-side default amount or recipient is ever invented.
 */
export function agentFeePolicyConfigured():
  boolean {
  const secret =
    process.env
      .CAREL_AGENT_FEE_SIGNING_SECRET
      ?.trim();

  const amount =
    process.env
      .CAREL_AGENT_FEE_AMOUNT_STRK
      ?.trim();

  const recipient =
    process.env
      .CAREL_AGENT_FEE_RECIPIENT
      ?.trim();


  return Boolean(
    secret &&
    secret.length >= 32 &&
    amount &&
    recipient,
  );
}
