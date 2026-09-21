import type {
  AgentPlan,
} from "@/lib/agent/plan";

import {
  attachAgentFeeQuote,
  createAgentFeeRuntime,
  settleAgentFee,
  submitAgentFee,
  type AgentFeeExecutionQuote,
  type AgentFeeRuntimeState,
} from "@/lib/agent/fee-runtime";


export type SignedAgentFeeQuotePayload =
  Readonly<{
    quote:
      AgentFeeExecutionQuote;

    signature:
      string;
  }>;


export type AgentFeeClientSession =
  Readonly<{
    state:
      AgentFeeRuntimeState;

    signedQuote?:
      SignedAgentFeeQuotePayload;
  }>;


export type AgentFeeHttpResponse =
  Readonly<{
    ok:
      boolean;

    status:
      number;

    json():
      Promise<unknown>;
  }>;


export type AgentFeeHttpClient = (
  url:
    string,

  init:
    RequestInit,
) => Promise<
  AgentFeeHttpResponse
>;


export type AgentFeeWalletExecutor = (
  quote:
    AgentFeeExecutionQuote,

  label:
    string,
) => Promise<string>;


function responseObject(
  value:
    unknown,
): Record<
  string,
  unknown
> {
  if (
    !value ||
    typeof value !==
      "object" ||
    Array.isArray(
      value,
    )
  ) {
    throw new Error(
      "CAREL Agent fee API returned an invalid response.",
    );
  }


  return value as Record<
    string,
    unknown
  >;
}


async function defaultHttpClient(
  url:
    string,

  init:
    RequestInit,
): Promise<
  AgentFeeHttpResponse
> {
  return fetch(
    url,
    init,
  );
}


function apiError(
  payload:
    Record<
      string,
      unknown
    >,

  fallback:
    string,
): Error {
  return new Error(
    typeof payload.error ===
      "string"
      ? payload.error
      : fallback,
  );
}


export function createAgentFeeClientSession(
  plan:
    AgentPlan,

  runId:
    string,
): AgentFeeClientSession {
  return {
    state:
      createAgentFeeRuntime(
        plan,
        runId,
      ),
  };
}


export async function quoteAgentPlanFee(
  session:
    AgentFeeClientSession,

  {
    chainId,
    payer,
    httpClient =
      defaultHttpClient,
  }:
    Readonly<{
      chainId:
        string;

      payer:
        string;

      httpClient?:
        AgentFeeHttpClient;
    }>,
): Promise<
  AgentFeeClientSession
> {
  if (
    session.state.status !==
      "pending-policy"
  ) {
    throw new Error(
      "CAREL Agent fee quote is already attached to this run.",
    );
  }


  const response =
    await httpClient(
      "/api/agent/fee/quote",
      {
        method:
          "POST",

        headers: {
          "Content-Type":
            "application/json",
        },

        body:
          JSON.stringify({
            runId:
              session.state
                .runId,

            chainId,

            payer,
          }),
      },
    );


  const raw =
    responseObject(
      await response.json(),
    );


  if (
    !response.ok
  ) {
    throw apiError(
      raw,
      "Could not prepare the CAREL Agent fee.",
    );
  }


  if (
    !raw.quote ||
    typeof raw.quote !==
      "object" ||
    Array.isArray(
      raw.quote,
    ) ||
    typeof raw.signature !==
      "string" ||
    !/^[0-9a-f]{64}$/i.test(
      raw.signature,
    )
  ) {
    throw new Error(
      "CAREL Agent fee API returned an invalid signed quote.",
    );
  }


  const signedQuote:
    SignedAgentFeeQuotePayload = {
    quote:
      raw.quote as
        AgentFeeExecutionQuote,

    signature:
      raw.signature,
  };


  return {
    state:
      attachAgentFeeQuote(
        session.state,
        signedQuote.quote,
      ),

    signedQuote,
  };
}


export async function submitAgentPlanFee(
  session:
    AgentFeeClientSession,

  executeAgentFee:
    AgentFeeWalletExecutor,
): Promise<
  AgentFeeClientSession
> {
  if (
    session.state.status !==
      "quoted" ||
    !session.signedQuote
  ) {
    throw new Error(
      "CAREL Agent fee must have a reviewed signed quote before wallet execution.",
    );
  }


  if (
    Date.now() >
      session.state
        .quote.expiresAt
  ) {
    throw new Error(
      "CAREL Agent fee quote expired before wallet execution.",
    );
  }


  const hash =
    await executeAgentFee(
      session.state.quote,

      `CAREL Agent fee · ${session.state.quote.amountText} ${session.state.quote.assetSymbol}`,
    );


  if (
    !/^0x[0-9a-f]{1,64}$/i.test(
      hash,
    )
  ) {
    throw new Error(
      "Wallet returned an invalid CAREL Agent fee transaction hash.",
    );
  }


  return {
    state:
      submitAgentFee(
        session.state,
        {
          kind:
            "transaction",

          id:
            hash,
        },
      ),

    signedQuote:
      session.signedQuote,
  };
}


export async function settleAgentPlanFee(
  session:
    AgentFeeClientSession,

  httpClient:
    AgentFeeHttpClient =
      defaultHttpClient,
): Promise<
  AgentFeeClientSession
> {
  if (
    session.state.status ===
      "settled"
  ) {
    return session;
  }


  if (
    session.state.status !==
      "submitted" ||
    !session.signedQuote
  ) {
    throw new Error(
      "CAREL Agent fee must be submitted before settlement verification.",
    );
  }


  const reference =
    session.state
      .executionReference;


  if (
    reference.kind !==
      "transaction"
  ) {
    throw new Error(
      "CAREL Agent fee settlement requires a transaction reference.",
    );
  }


  const response =
    await httpClient(
      "/api/agent/fee/settle",
      {
        method:
          "POST",

        headers: {
          "Content-Type":
            "application/json",
        },

        body:
          JSON.stringify({
            signedQuote:
              session.signedQuote,

            transactionHash:
              reference.id,
          }),
      },
    );


  const raw =
    responseObject(
      await response.json(),
    );


  if (
    !response.ok ||
    raw.settled !==
      true
  ) {
    throw apiError(
      raw,
      "CAREL could not verify the Agent fee settlement.",
    );
  }


  const returnedReference =
    raw.executionReference;


  if (
    !returnedReference ||
    typeof returnedReference !==
      "object" ||
    Array.isArray(
      returnedReference,
    )
  ) {
    throw new Error(
      "CAREL Agent fee settlement returned no execution reference.",
    );
  }


  const returned =
    returnedReference as
      Record<
        string,
        unknown
      >;


  if (
    returned.kind !==
      "transaction" ||
    returned.id !==
      reference.id
  ) {
    throw new Error(
      "CAREL Agent fee settlement reference does not match the submitted transaction.",
    );
  }


  return {
    state:
      settleAgentFee(
        session.state,
      ),

    signedQuote:
      session.signedQuote,
  };
}


export async function prepareAndSubmitAgentPlanFee(
  plan:
    AgentPlan,

  {
    runId,
    chainId,
    payer,
    executeAgentFee,
    httpClient =
      defaultHttpClient,
  }:
    Readonly<{
      runId:
        string;

      chainId:
        string;

      payer:
        string;

      executeAgentFee:
        AgentFeeWalletExecutor;

      httpClient?:
        AgentFeeHttpClient;
    }>,
): Promise<
  AgentFeeClientSession
> {
  let session =
    createAgentFeeClientSession(
      plan,
      runId,
    );


  session =
    await quoteAgentPlanFee(
      session,
      {
        chainId,
        payer,
        httpClient,
      },
    );


  session =
    await submitAgentPlanFee(
      session,
      executeAgentFee,
    );


  return session;
}


export async function executeAndSettleAgentPlanFee(
  plan:
    AgentPlan,

  input:
    Readonly<{
      runId:
        string;

      chainId:
        string;

      payer:
        string;

      executeAgentFee:
        AgentFeeWalletExecutor;

      httpClient?:
        AgentFeeHttpClient;
    }>,
): Promise<
  AgentFeeClientSession
> {
  const submitted =
    await prepareAndSubmitAgentPlanFee(
      plan,
      input,
    );


  return settleAgentPlanFee(
    submitted,
    input.httpClient ??
      defaultHttpClient,
  );
}
