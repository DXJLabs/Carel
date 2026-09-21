import {
  createHash,
} from "node:crypto";

import {
  Redis,
} from "@upstash/redis";

import {
  normalizeStarknetAddress,
} from "@/lib/carel/ecosystems/starknet/addresses";

import type {
  AgentFeeExecutionQuote,
} from "@/lib/agent/fee-runtime";

import type {
  SignedAgentFeeSettlementReceipt,
} from "@/lib/agent/server-fee";


const DEFAULT_RETENTION_SECONDS =
  30 * 24 * 60 * 60;


export type AgentFeeStoreBackend =
  Readonly<{
    set(
      key:
        string,

      value:
        unknown,

      options:
        Readonly<{
          nx:
            true;

          ex:
            number;
        }>,
    ):
      Promise<
        "OK" | null
      >;

    get<T>(
      key:
        string,
    ):
      Promise<
        T | null
      >;
  }>;


export type AgentFeeRunBinding =
  Readonly<{
    version:
      1;

    runId:
      string;

    idempotencyKey:
      string;

    planDigest:
      string;

    payer:
      string;

    chainId:
      string;

    createdAt:
      number;
  }>;


export type DurableAgentFeeSettlement =
  Readonly<{
    version:
      1;

    runId:
      string;

    idempotencyKey:
      string;

    planDigest:
      string;

    payer:
      string;

    chainId:
      string;

    transactionHash:
      string;

    settledAt:
      number;

    settlementReceipt:
      SignedAgentFeeSettlementReceipt;
  }>;


export type AgentFeeTransactionClaim =
  Readonly<{
    version:
      1;

    transactionHash:
      string;

    runId:
      string;

    idempotencyKey:
      string;

    planDigest:
      string;

    payer:
      string;

    chainId:
      string;

    claimedAt:
      number;
  }>;


export type AgentFeeStore =
  Readonly<{
    bindRun(
      quote:
        AgentFeeExecutionQuote,
    ):
      Promise<
        AgentFeeRunBinding
      >;

    persistSettlement(
      settlementReceipt:
        SignedAgentFeeSettlementReceipt,
    ):
      Promise<
        DurableAgentFeeSettlement
      >;

    loadSettlement(
      input:
        Readonly<{
          runId:
            string;

          planDigest:
            string;

          chainId:
            string;

          payer:
            string;
        }>,
    ):
      Promise<
        DurableAgentFeeSettlement | null
      >;
  }>;


function retentionSeconds():
  number {
  const raw =
    process.env
      .CAREL_AGENT_FEE_STORE_TTL_SECONDS
      ?.trim();


  if (!raw) {
    return DEFAULT_RETENTION_SECONDS;
  }


  const seconds =
    Number(
      raw,
    );


  if (
    !Number.isInteger(
      seconds,
    ) ||
    seconds < 3600 ||
    seconds >
      90 * 24 * 60 * 60
  ) {
    throw new Error(
      "CAREL Agent fee store TTL must be between one hour and 90 days.",
    );
  }


  return seconds;
}


function digest(
  value:
    string,
): string {
  return createHash(
    "sha256",
  )
    .update(
      value,
    )
    .digest(
      "hex",
    );
}


function bindingKey(
  runId:
    string,
): string {
  return (
    "carel:agent-fee:v1:" +
    digest(
      runId,
    ) +
    ":binding"
  );
}


function settlementKey(
  runId:
    string,
): string {
  return (
    "carel:agent-fee:v1:" +
    digest(
      runId,
    ) +
    ":settlement"
  );
}


function transactionClaimKey(
  transactionHash:
    string,
): string {
  return (
    "carel:agent-fee:v1:tx:" +
    digest(
      normalizeTransaction(
        transactionHash,
      ),
    ) +
    ":claim"
  );
}


function normalizeRunId(
  runId:
    string,
): string {
  const value =
    runId.trim();


  if (
    !value ||
    value.length > 128
  ) {
    throw new Error(
      "Invalid durable Agent fee run id.",
    );
  }


  return value;
}


function normalizePlanDigest(
  value:
    string,
): string {
  const normalized =
    value
      .trim()
      .toLowerCase();


  if (
    !/^[0-9a-f]{64}$/.test(
      normalized,
    )
  ) {
    throw new Error(
      "Invalid durable Agent fee plan digest.",
    );
  }


  return normalized;
}


function normalizeTransaction(
  value:
    string,
): string {
  const transaction =
    value
      .trim()
      .toLowerCase();


  if (
    !/^0x[0-9a-f]{1,64}$/.test(
      transaction,
    )
  ) {
    throw new Error(
      "Invalid durable Agent fee transaction hash.",
    );
  }


  return transaction;
}


function bindingFromQuote(
  quote:
    AgentFeeExecutionQuote,
): AgentFeeRunBinding {
  return {
    version:
      1,

    runId:
      normalizeRunId(
        quote.runId,
      ),

    idempotencyKey:
      quote.idempotencyKey,

    planDigest:
      normalizePlanDigest(
        quote.planDigest,
      ),

    payer:
      normalizeStarknetAddress(
        quote.payer,
      ),

    chainId:
      quote.chainId.trim(),

    createdAt:
      Date.now(),
  };
}


function bindingFromSettlement(
  signed:
    SignedAgentFeeSettlementReceipt,
): AgentFeeRunBinding {
  const receipt =
    signed.receipt;


  return {
    version:
      1,

    runId:
      normalizeRunId(
        receipt.runId,
      ),

    idempotencyKey:
      receipt.idempotencyKey,

    planDigest:
      normalizePlanDigest(
        receipt.planDigest,
      ),

    payer:
      normalizeStarknetAddress(
        receipt.payer,
      ),

    chainId:
      receipt.chainId.trim(),

    createdAt:
      receipt.settledAt,
  };
}


function sameBinding(
  left:
    AgentFeeRunBinding,

  right:
    AgentFeeRunBinding,
): boolean {
  return (
    left.version ===
      1 &&
    right.version ===
      1 &&
    left.runId ===
      right.runId &&
    left.idempotencyKey ===
      right.idempotencyKey &&
    left.planDigest ===
      right.planDigest &&
    left.payer ===
      right.payer &&
    left.chainId ===
      right.chainId
  );
}


function requireStoredBinding(
  value:
    AgentFeeRunBinding | null,
): AgentFeeRunBinding {
  if (
    !value ||
    value.version !==
      1 ||
    !value.runId ||
    !value.idempotencyKey ||
    !value.chainId
  ) {
    throw new Error(
      "CAREL Agent fee durable binding is missing or corrupted.",
    );
  }


  return {
    ...value,

    runId:
      normalizeRunId(
        value.runId,
      ),

    planDigest:
      normalizePlanDigest(
        value.planDigest,
      ),

    payer:
      normalizeStarknetAddress(
        value.payer,
      ),

    chainId:
      value.chainId.trim(),
  };
}


function requireStoredTransactionClaim(
  value:
    AgentFeeTransactionClaim | null,
): AgentFeeTransactionClaim {
  if (
    !value ||
    value.version !==
      1 ||
    !value.runId ||
    !value.idempotencyKey ||
    !value.chainId
  ) {
    throw new Error(
      "CAREL Agent fee transaction claim is missing or corrupted.",
    );
  }


  return {
    ...value,

    transactionHash:
      normalizeTransaction(
        value.transactionHash,
      ),

    runId:
      normalizeRunId(
        value.runId,
      ),

    planDigest:
      normalizePlanDigest(
        value.planDigest,
      ),

    payer:
      normalizeStarknetAddress(
        value.payer,
      ),

    chainId:
      value.chainId.trim(),
  };
}


function requireStoredSettlement(
  value:
    DurableAgentFeeSettlement | null,
): DurableAgentFeeSettlement {
  if (
    !value ||
    value.version !==
      1 ||
    !value.settlementReceipt ||
    typeof value.settlementReceipt !==
      "object"
  ) {
    throw new Error(
      "CAREL Agent fee durable settlement is corrupted.",
    );
  }


  return {
    ...value,

    runId:
      normalizeRunId(
        value.runId,
      ),

    planDigest:
      normalizePlanDigest(
        value.planDigest,
      ),

    payer:
      normalizeStarknetAddress(
        value.payer,
      ),

    chainId:
      value.chainId.trim(),

    transactionHash:
      normalizeTransaction(
        value.transactionHash,
      ),
  };
}


export function createAgentFeeStore(
  backend:
    AgentFeeStoreBackend,

  {
    ttlSeconds =
      retentionSeconds(),
  }:
    Readonly<{
      ttlSeconds?:
        number;
    }> = {},
): AgentFeeStore {
  if (
    !Number.isInteger(
      ttlSeconds,
    ) ||
    ttlSeconds <= 0
  ) {
    throw new Error(
      "Invalid Agent fee store TTL.",
    );
  }


  async function bind(
    candidate:
      AgentFeeRunBinding,
  ):
    Promise<
      AgentFeeRunBinding
    > {
    const key =
      bindingKey(
        candidate.runId,
      );


    const created =
      await backend.set(
        key,
        candidate,
        {
          nx:
            true,

          ex:
            ttlSeconds,
        },
      );


    if (
      created ===
        "OK"
    ) {
      return candidate;
    }


    const existing =
      requireStoredBinding(
        await backend.get<
          AgentFeeRunBinding
        >(
          key,
        ),
      );


    if (
      !sameBinding(
        existing,
        candidate,
      )
    ) {
      throw new Error(
        "CAREL Agent fee run is already bound to another plan, payer or network.",
      );
    }


    return existing;
  }


  return {
    async bindRun(
      quote,
    ) {
      return bind(
        bindingFromQuote(
          quote,
        ),
      );
    },


    async persistSettlement(
      signed,
    ) {
      const receipt =
        signed.receipt;


      const binding =
        await bind(
          bindingFromSettlement(
            signed,
          ),
        );


      const candidate:
        DurableAgentFeeSettlement = {
        version:
          1,

        runId:
          binding.runId,

        idempotencyKey:
          binding
            .idempotencyKey,

        planDigest:
          binding.planDigest,

        payer:
          binding.payer,

        chainId:
          binding.chainId,

        transactionHash:
          normalizeTransaction(
            receipt
              .transactionHash,
          ),

        settledAt:
          receipt.settledAt,

        settlementReceipt:
          signed,
      };


      /*
       * A fee transaction may authorize exactly one Agent execution.
       *
       * This closes cross-run replay of the same STRK Transfer transaction.
       */
      const transactionClaim:
        AgentFeeTransactionClaim = {
        version:
          1,

        transactionHash:
          candidate
            .transactionHash,

        runId:
          candidate.runId,

        idempotencyKey:
          candidate
            .idempotencyKey,

        planDigest:
          candidate.planDigest,

        payer:
          candidate.payer,

        chainId:
          candidate.chainId,

        claimedAt:
          candidate.settledAt,
      };


      const claimKey =
        transactionClaimKey(
          candidate
            .transactionHash,
        );


      const claimed =
        await backend.set(
          claimKey,
          transactionClaim,
          {
            nx:
              true,

            ex:
              ttlSeconds,
          },
        );


      if (
        claimed !==
          "OK"
      ) {
        const existingClaim =
          requireStoredTransactionClaim(
            await backend.get<
              AgentFeeTransactionClaim
            >(
              claimKey,
            ),
          );


        if (
          existingClaim
            .transactionHash !==
              transactionClaim
                .transactionHash ||
          existingClaim.runId !==
            transactionClaim.runId ||
          existingClaim
            .idempotencyKey !==
              transactionClaim
                .idempotencyKey ||
          existingClaim
            .planDigest !==
              transactionClaim
                .planDigest ||
          existingClaim.payer !==
            transactionClaim.payer ||
          existingClaim.chainId !==
            transactionClaim.chainId
        ) {
          throw new Error(
            "CAREL Agent fee transaction is already claimed by another execution.",
          );
        }
      }


      const key =
        settlementKey(
          binding.runId,
        );


      const created =
        await backend.set(
          key,
          candidate,
          {
            nx:
              true,

            ex:
              ttlSeconds,
          },
        );


      if (
        created ===
          "OK"
      ) {
        return candidate;
      }


      const existing =
        requireStoredSettlement(
          await backend.get<
            DurableAgentFeeSettlement
          >(
            key,
          ),
        );


      if (
        existing.runId !==
          candidate.runId ||
        existing.idempotencyKey !==
          candidate.idempotencyKey ||
        existing.planDigest !==
          candidate.planDigest ||
        existing.payer !==
          candidate.payer ||
        existing.chainId !==
          candidate.chainId
      ) {
        throw new Error(
          "CAREL Agent fee settlement conflicts with the durable run binding.",
        );
      }


      if (
        existing.transactionHash !==
          candidate.transactionHash
      ) {
        throw new Error(
          "CAREL Agent fee run is already settled by another transaction.",
        );
      }


      return existing;
    },


    async loadSettlement(
      input,
    ) {
      const runId =
        normalizeRunId(
          input.runId,
        );


      const raw =
        await backend.get<
          DurableAgentFeeSettlement
        >(
          settlementKey(
            runId,
          ),
        );


      if (!raw) {
        return null;
      }


      const stored =
        requireStoredSettlement(
          raw,
        );


      const expected:
        AgentFeeRunBinding = {
        version:
          1,

        runId,

        idempotencyKey:
          stored
            .idempotencyKey,

        planDigest:
          normalizePlanDigest(
            input.planDigest,
          ),

        payer:
          normalizeStarknetAddress(
            input.payer,
          ),

        chainId:
          input.chainId.trim(),

        createdAt:
          stored.settledAt,
      };


      const actual:
        AgentFeeRunBinding = {
        version:
          1,

        runId:
          stored.runId,

        idempotencyKey:
          stored
            .idempotencyKey,

        planDigest:
          stored.planDigest,

        payer:
          stored.payer,

        chainId:
          stored.chainId,

        createdAt:
          stored.settledAt,
      };


      if (
        !sameBinding(
          actual,
          expected,
        )
      ) {
        throw new Error(
          "CAREL Agent fee durable settlement belongs to another execution.",
        );
      }


      return stored;
    },
  };
}


let productionStore:
  AgentFeeStore | null =
  null;


function productionBackend():
  AgentFeeStoreBackend {
  const url =
    process.env
      .KV_REST_API_URL
      ?.trim();

  const token =
    process.env
      .KV_REST_API_TOKEN
      ?.trim();


  if (
    !url ||
    !token
  ) {
    throw new Error(
      "CAREL Agent fee Redis store is not configured.",
    );
  }


  const redis =
    new Redis({
      url,
      token,
    });


  return {
    async set(
      key,
      value,
      options,
    ) {
      return await redis.set(
        key,
        value,
        options,
      ) as
        "OK" | null;
    },


    async get<T>(
      key:
        string,
    ) {
      return await redis.get<T>(
        key,
      );
    },
  };
}


export function getAgentFeeStore():
  AgentFeeStore {
  if (!productionStore) {
    productionStore =
      createAgentFeeStore(
        productionBackend(),
      );
  }


  return productionStore;
}
