import type {
  AgentRecoveryBoundPayload,
  AgentRecoveryData,
  AgentRecoveryKind,
  SignedAgentRecoveryCapsule,
  SignedAgentRecoveryDraft,
} from "@/lib/agent/recovery-types";


type HttpResponse =
  Readonly<{
    ok:
      boolean;

    json():
      Promise<unknown>;
  }>;


export type AgentRecoveryHttpClient = (
  url:
    string,

  init:
    RequestInit,
) => Promise<
  HttpResponse
>;


async function defaultHttp(
  url:
    string,

  init:
    RequestInit,
): Promise<HttpResponse> {
  return fetch(
    url,
    init,
  );
}


function object(
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
      "CAREL Agent recovery API returned invalid data.",
    );
  }


  return value as Record<
    string,
    unknown
  >;
}


async function post(
  body:
    Record<
      string,
      unknown
    >,

  httpClient:
    AgentRecoveryHttpClient,
) {
  const response =
    await httpClient(
      "/api/agent/recovery",
      {
        method:
          "POST",

        headers: {
          "Content-Type":
            "application/json",
        },

        cache:
          "no-store",

        body:
          JSON.stringify(
            body,
          ),
      },
    );


  const payload =
    object(
      await response.json(),
    );


  if (!response.ok) {
    throw new Error(
      typeof payload.error ===
        "string"
        ? payload.error
        : "CAREL Agent recovery request failed.",
    );
  }


  return payload;
}


export async function agentRecoveryEnabled(
  httpClient:
    AgentRecoveryHttpClient =
      defaultHttp,
): Promise<boolean> {
  const response =
    await httpClient(
      "/api/agent/recovery",
      {
        method:
          "GET",

        cache:
          "no-store",
      },
    );


  const payload =
    object(
      await response.json(),
    );


  if (
    !response.ok ||
    typeof payload.enabled !==
      "boolean"
  ) {
    throw new Error(
      "CAREL could not read Agent recovery policy.",
    );
  }


  return payload.enabled;
}


export async function sealAgentRecoverySnapshot({
  kind,
  runId,
  stageId,
  executionKey,
  chainId,
  account,
  data,
  httpClient =
    defaultHttp,
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

  httpClient?:
    AgentRecoveryHttpClient;
}>): Promise<
  SignedAgentRecoveryDraft
> {
  const response =
    await post(
      {
        action:
          "seal",

        snapshot: {
          kind,
          runId,
          stageId,
          executionKey,
          chainId,
          account,
          data,
        },
      },
      httpClient,
    );


  return response.draft as
    SignedAgentRecoveryDraft;
}


export async function bindAgentRecoverySnapshot({
  draft,
  transactionId,
  httpClient =
    defaultHttp,
}: Readonly<{
  draft:
    SignedAgentRecoveryDraft;

  transactionId:
    string;

  httpClient?:
    AgentRecoveryHttpClient;
}>): Promise<
  SignedAgentRecoveryCapsule
> {
  const response =
    await post(
      {
        action:
          "bind",

        draft,

        transactionId,
      },
      httpClient,
    );


  return response.capsule as
    SignedAgentRecoveryCapsule;
}


export async function verifyAgentRecoverySnapshot({
  capsule,
  httpClient =
    defaultHttp,
}: Readonly<{
  capsule:
    SignedAgentRecoveryCapsule;

  httpClient?:
    AgentRecoveryHttpClient;
}>): Promise<
  AgentRecoveryBoundPayload
> {
  const response =
    await post(
      {
        action:
          "verify",

        capsule,
      },
      httpClient,
    );


  return response.payload as
    AgentRecoveryBoundPayload;
}


function storageKey(
  account:
    string,

  runId:
    string,

  stageId:
    string,
): string {
  return [
    "carel.agent.recovery.v1",
    account.toLowerCase(),
    runId,
    stageId,
  ].join(
    ":",
  );
}


export function saveAgentRecoveryCapsule(
  capsule:
    SignedAgentRecoveryCapsule,
) {
  if (
    typeof window ===
      "undefined"
  ) {
    return;
  }


  window.localStorage
    .setItem(
      storageKey(
        capsule.payload
          .account,

        capsule.payload
          .runId,

        capsule.payload
          .stageId,
      ),

      JSON.stringify(
        capsule,
      ),
    );
}


export function removeAgentRecoveryCapsule({
  account,
  runId,
  stageId,
}: Readonly<{
  account:
    string;

  runId:
    string;

  stageId:
    string;
}>) {
  if (
    typeof window ===
      "undefined"
  ) {
    return;
  }


  window.localStorage
    .removeItem(
      storageKey(
        account,
        runId,
        stageId,
      ),
    );
}


export async function loadAgentRecoveryCapsule({
  account,
  runId,
  stageId,
  httpClient =
    defaultHttp,
}: Readonly<{
  account:
    string;

  runId:
    string;

  stageId:
    string;

  httpClient?:
    AgentRecoveryHttpClient;
}>): Promise<
  AgentRecoveryBoundPayload | null
> {
  if (
    typeof window ===
      "undefined"
  ) {
    return null;
  }


  const key =
    storageKey(
      account,
      runId,
      stageId,
    );


  const raw =
    window.localStorage
      .getItem(
        key,
      );


  if (!raw) {
    return null;
  }


  try {
    const capsule =
      JSON.parse(
        raw,
      ) as
        SignedAgentRecoveryCapsule;


    const payload =
      await verifyAgentRecoverySnapshot({
        capsule,
        httpClient,
      });


    if (
      payload.account
        .toLowerCase() !==
        account.toLowerCase() ||
      payload.runId !==
        runId ||
      payload.stageId !==
        stageId
    ) {
      throw new Error(
        "Stored Agent recovery capsule belongs to another execution.",
      );
    }


    return payload;
  } catch {
    window.localStorage
      .removeItem(
        key,
      );

    return null;
  }
}
