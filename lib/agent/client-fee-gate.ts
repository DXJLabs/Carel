import type {
  AgentPlan,
} from "@/lib/agent/plan";

import {
  agentFeePlanDigest,
  agentFeePlanFingerprint,
  createAgentFeeClientSession,
  quoteAgentPlanFee,
  settleAgentPlanFee,
  submitAgentPlanFee,
  type AgentFeeClientSession,
  type AgentFeeHttpClient,
  type AgentFeeWalletExecutor,
  type SignedAgentFeeSettlementReceiptPayload,
} from "@/lib/agent/client-fee";


export type AgentFeeGateStatus =
  | "disabled"
  | "settled";


/**
 * Opaque in-memory execution authorization.
 *
 * Controllers cannot manufacture a valid token by constructing a lookalike
 * object because Agent Core checks object identity against this module's
 * private WeakSet.
 */
export type AgentExecutionFeeAuthorization =
  Readonly<{
    runId:
      string;

    status:
      AgentFeeGateStatus;

    planFingerprint:
      string;
  }>;


const issuedAuthorizations =
  new WeakSet<object>();


export type AgentFeeGateResult =
  Readonly<{
    runId:
      string;

    status:
      AgentFeeGateStatus;

    authorization:
      AgentExecutionFeeAuthorization;
  }>;


type ActiveFeeRun = {
  scopeKey:
    string;

  fingerprint:
    string;

  runId:
    string;

  protocolStarted:
    boolean;

  policyEnabled:
    boolean | null;

  feeSession:
    AgentFeeClientSession | null;
};


function planFingerprint(
  plan:
    AgentPlan,
): string {
  return agentFeePlanFingerprint(
    plan,
  );
}


function issueAuthorization(
  plan:
    AgentPlan,

  runId:
    string,

  status:
    AgentFeeGateStatus,
): AgentExecutionFeeAuthorization {
  const authorization =
    Object.freeze({
      runId,

      status,

      planFingerprint:
        planFingerprint(
          plan,
        ),
    });


  issuedAuthorizations.add(
    authorization,
  );


  return authorization;
}


/**
 * Agent Core calls this before a browser execution session is accepted and
 * again immediately before stage execution.
 */
export function assertAgentExecutionFeeAuthorization(
  authorization:
    AgentExecutionFeeAuthorization | undefined,

  plan:
    AgentPlan,

  runId:
    string,
): void {
  if (
    !authorization ||
    !issuedAuthorizations.has(
      authorization,
    )
  ) {
    throw new Error(
      "Agent execution requires a valid fee-policy authorization.",
    );
  }


  if (
    authorization.runId !==
      runId
  ) {
    throw new Error(
      "Agent fee authorization belongs to another execution run.",
    );
  }


  if (
    authorization.planFingerprint !==
      planFingerprint(
        plan,
      )
  ) {
    throw new Error(
      "Agent fee authorization belongs to another Agent plan.",
    );
  }


  if (
    authorization.status !==
      "disabled" &&
    authorization.status !==
      "settled"
  ) {
    throw new Error(
      "Agent fee authorization is not executable.",
    );
  }
}


type PersistedAgentFeeSettlement =
  Readonly<{
    version:
      1;

    runId:
      string;

    chainId:
      string;

    payer:
      string;

    settlementReceipt:
      SignedAgentFeeSettlementReceiptPayload;
  }>;


function feeStorageKey(
  payer:
    string,

  runId:
    string,
): string {
  return [
    "carel.agent.fee.v1",
    payer
      .trim()
      .toLowerCase(),
    runId,
  ].join(
    ":",
  );
}


function saveSettlementEvidence(
  evidence:
    PersistedAgentFeeSettlement,
) {
  if (
    typeof window ===
      "undefined"
  ) {
    return;
  }


  try {
    window.localStorage
      .setItem(
        feeStorageKey(
          evidence.payer,
          evidence.runId,
        ),

        JSON.stringify(
          evidence,
        ),
      );
  } catch {
    /*
     * A storage failure happens after fee settlement.
     * Never turn it into a transaction failure or invite another charge.
     */
  }
}


function loadSettlementEvidence(
  payer:
    string,

  runId:
    string,
): PersistedAgentFeeSettlement | null {
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
          feeStorageKey(
            payer,
            runId,
          ),
        );


    if (!raw) {
      return null;
    }


    const parsed:
      unknown =
      JSON.parse(
        raw,
      );


    if (
      !parsed ||
      typeof parsed !==
        "object" ||
      Array.isArray(
        parsed,
      )
    ) {
      return null;
    }


    const value =
      parsed as
        Record<
          string,
          unknown
        >;


    if (
      value.version !==
        1 ||
      value.runId !==
        runId ||
      typeof value.chainId !==
        "string" ||
      typeof value.payer !==
        "string" ||
      !value.settlementReceipt ||
      typeof value.settlementReceipt !==
        "object"
    ) {
      return null;
    }


    return value as
      unknown as
        PersistedAgentFeeSettlement;
  } catch {
    return null;
  }
}


function randomPart():
  string {
  try {
    return crypto
      .getRandomValues(
        new Uint32Array(
          1,
        ),
      )[0]
      .toString(36);
  } catch {
    return Math.random()
      .toString(36)
      .slice(2);
  }
}


function newRunId(
  prefix:
    string,
): string {
  const clean =
    prefix
      .trim()
      .toLowerCase()
      .replace(
        /[^a-z0-9-]/g,
        "",
      ) ||
    "agent";


  return (
    `${clean}-` +
    `${Date.now().toString(36)}-` +
    randomPart()
  );
}


async function defaultHttp(
  url:
    string,

  init:
    RequestInit,
) {
  return fetch(
    url,
    init,
  );
}


async function readPolicy(
  httpClient:
    AgentFeeHttpClient,
): Promise<boolean> {
  const response =
    await httpClient(
      "/api/agent/fee/policy",
      {
        method:
          "GET",

        headers: {
          Accept:
            "application/json",
        },

        cache:
          "no-store",
      },
    );


  const raw:
    unknown =
    await response.json();


  if (
    !response.ok ||
    !raw ||
    typeof raw !==
      "object" ||
    Array.isArray(
      raw,
    ) ||
    typeof (
      raw as Record<
        string,
        unknown
      >
    ).enabled !==
      "boolean"
  ) {
    throw new Error(
      "CAREL could not read the Agent fee policy.",
    );
  }


  return (
    raw as {
      enabled:
        boolean;
    }
  ).enabled;
}


export function createAgentFeeGateCoordinator({
  httpClient =
    defaultHttp,
}: Readonly<{
  httpClient?:
    AgentFeeHttpClient;
}> = {}) {
  let active:
    ActiveFeeRun | null =
    null;


  function ensureActive(
    plan:
      AgentPlan,

    {
      prefix,
      chainId,
      payer,
    }:
      Readonly<{
        prefix:
          string;

        chainId:
          string;

        payer:
          string;
      }>,
  ):
    ActiveFeeRun {
    const fingerprint =
      planFingerprint(
        plan,
      );


    const scopeKey =
      `${chainId}:${payer.toLowerCase()}:${fingerprint}`;


    /*
     * Once the protocol actually started, another press represents another
     * Agent run and must never reuse the previous run's fee.
     *
     * Before protocol submission succeeds, retrying reuses this run. This is
     * what prevents a settlement/API retry from charging the wallet twice.
     */
    if (
      !active ||
      active.scopeKey !==
        scopeKey ||
      active.protocolStarted
    ) {
      active = {
        scopeKey,
        fingerprint,

        runId:
          newRunId(
            prefix,
          ),

        protocolStarted:
          false,

        policyEnabled:
          null,

        feeSession:
          null,
      };
    }


    return active;
  }


  async function prepare(
    plan:
      AgentPlan,

    {
      prefix,
      chainId,
      payer,
      executeAgentFee,
    }:
      Readonly<{
        prefix:
          string;

        chainId:
          string;

        payer:
          string;

        executeAgentFee:
          AgentFeeWalletExecutor;
      }>,
  ): Promise<
    AgentFeeGateResult
  > {
    const current =
      ensureActive(
        plan,
        {
          prefix,
          chainId,
          payer,
        },
      );


    if (
      current.policyEnabled ===
        null
    ) {
      current.policyEnabled =
        await readPolicy(
          httpClient,
        );
    }


    if (
      !current.policyEnabled
    ) {
      return {
        runId:
          current.runId,

        status:
          "disabled",

        authorization:
          issueAuthorization(
            plan,
            current.runId,
            "disabled",
          ),
      };
    }


    if (
      !current.feeSession
    ) {
      current.feeSession =
        createAgentFeeClientSession(
          plan,
          current.runId,
        );
    }


    /*
     * A quote can expire before the user signs it. No payment happened yet,
     * so safely rebuild the fee session for the same Agent run.
     */
    if (
      current.feeSession
        .state.status ===
        "quoted" &&
      current.feeSession
        .state.quote
        .expiresAt <=
        Date.now()
    ) {
      current.feeSession =
        createAgentFeeClientSession(
          plan,
          current.runId,
        );
    }


    if (
      current.feeSession
        .state.status ===
        "pending-policy"
    ) {
      current.feeSession =
        await quoteAgentPlanFee(
          current.feeSession,
          {
            planDigest:
              await agentFeePlanDigest(
                plan,
              ),

            chainId,
            payer,
            httpClient,
          },
        );
    }


    if (
      current.feeSession
        .state.status ===
        "quoted"
    ) {
      current.feeSession =
        await submitAgentPlanFee(
          current.feeSession,
          executeAgentFee,
        );
    }


    if (
      current.feeSession
        .state.status ===
        "submitted"
    ) {
      /*
       * Important: assignment happens only after successful verification.
       *
       * If settlement fails, current.feeSession remains submitted with the
       * original tx hash. The next retry starts here and does not call the
       * wallet again.
       */
      current.feeSession =
        await settleAgentPlanFee(
          current.feeSession,
          httpClient,
        );
    }


    if (
      current.feeSession
        .state.status !==
        "settled"
    ) {
      throw new Error(
        "CAREL Agent fee is not settled.",
      );
    }


    if (
      current.feeSession
        .settlementReceipt
    ) {
      saveSettlementEvidence({
        version:
          1,

        runId:
          current.runId,

        chainId,

        payer,

        settlementReceipt:
          current.feeSession
            .settlementReceipt,
      });
    }


    return {
      runId:
        current.runId,

      status:
        "settled",

      authorization:
        issueAuthorization(
          plan,
          current.runId,
          "settled",
        ),
    };
  }


  async function resume(
    plan:
      AgentPlan,

    {
      runId,
      chainId,
      payer,
    }:
      Readonly<{
        runId:
          string;

        chainId:
          string;

        payer:
          string;
      }>,
  ): Promise<
    AgentFeeGateResult
  > {
    const normalizedRunId =
      runId.trim();


    if (
      !normalizedRunId ||
      normalizedRunId.length >
        128
    ) {
      throw new Error(
        "Cannot resume an invalid Agent execution run.",
      );
    }


    const policyEnabled =
      await readPolicy(
        httpClient,
      );


    const fingerprint =
      planFingerprint(
        plan,
      );


    const scopeKey =
      `${chainId}:${payer.toLowerCase()}:${fingerprint}`;


    if (
      !policyEnabled
    ) {
      active = {
        scopeKey,
        fingerprint,

        runId:
          normalizedRunId,

        protocolStarted:
          false,

        policyEnabled:
          false,

        feeSession:
          null,
      };


      return {
        runId:
          normalizedRunId,

        status:
          "disabled",

        authorization:
          issueAuthorization(
            plan,
            normalizedRunId,
            "disabled",
          ),
      };
    }


    const expectedPlanDigest =
      await agentFeePlanDigest(
        plan,
      );


    const evidence =
      loadSettlementEvidence(
        payer,
        normalizedRunId,
      );


    if (
      !evidence ||
      evidence.runId !==
        normalizedRunId ||
      evidence.chainId !==
        chainId ||
      evidence.payer
        .toLowerCase() !==
        payer.toLowerCase() ||
      evidence
        .settlementReceipt
        .receipt
        .planDigest
        .toLowerCase() !==
        expectedPlanDigest
    ) {
      throw new Error(
        "CAREL cannot restore the settled Agent fee for this run.",
      );
    }


    const response =
      await httpClient(
        "/api/agent/fee/resume",
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
            JSON.stringify({
              runId:
                normalizedRunId,

              planDigest:
                expectedPlanDigest,

              chainId,

              payer,

              settlementReceipt:
                evidence
                  .settlementReceipt,
            }),
        },
      );


    const raw:
      unknown =
      await response.json();


    if (
      !response.ok ||
      !raw ||
      typeof raw !==
        "object" ||
      Array.isArray(
        raw,
      ) ||
      (
        raw as
          Record<
            string,
            unknown
          >
      ).settled !==
        true ||
      (
        raw as
          Record<
            string,
            unknown
          >
      ).runId !==
        normalizedRunId
    ) {
      const message =
        raw &&
        typeof raw ===
          "object" &&
        !Array.isArray(
          raw,
        ) &&
        typeof (
          raw as
            Record<
              string,
              unknown
            >
        ).error ===
          "string"
          ? (
              raw as {
                error:
                  string;
              }
            ).error
          : "CAREL could not restore Agent fee authorization.";


      throw new Error(
        message,
      );
    }


    active = {
      scopeKey,
      fingerprint,

      runId:
        normalizedRunId,

      protocolStarted:
        false,

      policyEnabled:
        true,

      feeSession:
        null,
    };


    return {
      runId:
        normalizedRunId,

      status:
        "settled",

      authorization:
        issueAuthorization(
          plan,
          normalizedRunId,
          "settled",
        ),
    };
  }


  function markProtocolStarted(
    runId:
      string,
  ) {
    if (
      !active ||
      active.runId !==
        runId
    ) {
      throw new Error(
        "Cannot mark another Agent run as started.",
      );
    }


    active.protocolStarted =
      true;
  }


  function reset() {
    active =
      null;
  }


  function snapshot() {
    if (!active) {
      return null;
    }


    return {
      runId:
        active.runId,

      protocolStarted:
        active
          .protocolStarted,

      policyEnabled:
        active
          .policyEnabled,

      feeStatus:
        active
          .feeSession
          ?.state.status ??
        null,
    } as const;
  }


  return {
    prepare,
    resume,
    markProtocolStarted,
    reset,
    snapshot,
  };
}


export type AgentFeeGateCoordinator =
  ReturnType<
    typeof createAgentFeeGateCoordinator
  >;
