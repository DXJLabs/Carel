import type {
  AgentRuntimeRecovery,
} from "@/lib/agent/runtime-recovery";

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
    /*
     * Verification may fail because the network/RPC is temporarily
     * unavailable. Keep the signed capsule so a later reload can retry it.
     *
     * A tampered capsule remains harmless because the server signature is
     * checked on every load.
     */
    return null;
  }
}



export function createAgentRuntimeRecovery(
  kind:
    AgentRecoveryKind,
): AgentRuntimeRecovery {
  let enabled:
    boolean | null =
    null;


  async function recoveryEnabled():
    Promise<boolean> {
    if (
      enabled !==
        null
    ) {
      return enabled;
    }


    try {
      enabled =
        await agentRecoveryEnabled();
    } catch {
      enabled =
        false;
    }


    return enabled;
  }


  return {
    async seal(
      input,
    ) {
      if (
        !await recoveryEnabled()
      ) {
        return null;
      }


      return sealAgentRecoverySnapshot({
        kind,

        runId:
          input.runId,

        stageId:
          input.stageId,

        executionKey:
          input.executionKey,

        chainId:
          input.chainId,

        account:
          input.account,

        data:
          input.data,
      });
    },


    async bind(
      draft,
      transactionId,
    ) {
      const capsule =
        await bindAgentRecoverySnapshot({
          draft,
          transactionId,
        });


      saveAgentRecoveryCapsule(
        capsule,
      );
    },


    async load(
      input,
    ) {
      const payload =
        await loadAgentRecoveryCapsule({
          account:
            input.account,

          runId:
            input.runId,

          stageId:
            input.stageId,
        });


      if (!payload) {
        return null;
      }


      if (
        payload.kind !==
          kind ||
        payload.executionKey !==
          input.executionKey ||
        payload.chainId !==
          input.chainId ||
        payload.account
          .toLowerCase() !==
          input.account
            .toLowerCase() ||
        payload.transactionId
          .toLowerCase() !==
          input.transactionId
            .toLowerCase()
      ) {
        return null;
      }


      return payload;
    },
  };
}


export type ActiveAgentRecoveryPointer =
  Readonly<{
    version:
      1;

    kind:
      AgentRecoveryKind;

    account:
      string;

    chainId:
      string;

    runId:
      string;

    stageId:
      string;

    goal:
      string;

    mode:
      "normal" |
      "shield" |
      "unshield";
  }>;


function activeRecoveryStorageKey(
  kind:
    AgentRecoveryKind,

  account:
    string,
): string {
  return [
    "carel.agent.active-recovery.v1",
    kind,
    account
      .trim()
      .toLowerCase(),
  ].join(
    ":",
  );
}


export function loadActiveAgentRecoveryPointer({
  kind,
  account,
}: Readonly<{
  kind:
    AgentRecoveryKind;

  account:
    string;
}>):
  ActiveAgentRecoveryPointer | null {
  if (
    typeof window ===
      "undefined"
  ) {
    return null;
  }


  try {
    const raw =
      window.localStorage
        .getItem(
          activeRecoveryStorageKey(
            kind,
            account,
          ),
        );


    if (!raw) {
      return null;
    }


    const value:
      unknown =
      JSON.parse(
        raw,
      );


    if (
      !value ||
      typeof value !==
        "object" ||
      Array.isArray(
        value,
      )
    ) {
      return null;
    }


    const item =
      value as
        Record<
          string,
          unknown
        >;


    if (
      item.version !==
        1 ||
      item.kind !==
        kind ||
      typeof item.account !==
        "string" ||
      item.account
        .toLowerCase() !==
        account
          .toLowerCase() ||
      typeof item.chainId !==
        "string" ||
      typeof item.runId !==
        "string" ||
      typeof item.stageId !==
        "string" ||
      typeof item.goal !==
        "string" ||
      !item.goal.trim() ||
      item.goal.length >
        1024 ||
      (
        item.mode !==
          "normal" &&
        item.mode !==
          "shield" &&
        item.mode !==
          "unshield"
      )
    ) {
      return null;
    }


    return item as
      unknown as
        ActiveAgentRecoveryPointer;
  } catch {
    return null;
  }
}


export function saveActiveAgentRecoveryPointer(
  pointer:
    ActiveAgentRecoveryPointer,
) {
  if (
    typeof window ===
      "undefined"
  ) {
    return;
  }


  try {
    const previous =
      loadActiveAgentRecoveryPointer({
        kind:
          pointer.kind,

        account:
          pointer.account,
      });


    /*
     * The newly submitted stage supersedes the previous stage's recovery
     * capsule. It is now safe to remove that older capsule.
     */
    if (
      previous &&
      (
        previous.runId !==
          pointer.runId ||
        previous.stageId !==
          pointer.stageId
      )
    ) {
      removeAgentRecoveryCapsule({
        account:
          previous.account,

        runId:
          previous.runId,

        stageId:
          previous.stageId,
      });
    }


    window.localStorage
      .setItem(
        activeRecoveryStorageKey(
          pointer.kind,
          pointer.account,
        ),

        JSON.stringify(
          pointer,
        ),
      );
  } catch {
    /*
     * Storage failure happens after the protocol transaction may already
     * exist. Never convert it into an execution failure.
     */
  }
}


export function clearActiveAgentRecoveryPointer({
  kind,
  account,
}: Readonly<{
  kind:
    AgentRecoveryKind;

  account:
    string;
}>) {
  if (
    typeof window ===
      "undefined"
  ) {
    return;
  }


  try {
    const pointer =
      loadActiveAgentRecoveryPointer({
        kind,
        account,
      });


    if (pointer) {
      removeAgentRecoveryCapsule({
        account:
          pointer.account,

        runId:
          pointer.runId,

        stageId:
          pointer.stageId,
      });
    }


    window.localStorage
      .removeItem(
        activeRecoveryStorageKey(
          kind,
          account,
        ),
      );
  } catch {
    // Best-effort local cleanup only.
  }
}
