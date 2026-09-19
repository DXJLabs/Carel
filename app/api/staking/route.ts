import { NextRequest, NextResponse } from "next/server";
import {
  BASE_URL,
  stakeToCalls,
} from "@avnu/avnu-sdk";
import { constants } from "starknet";
import { STRK_TOKEN } from "@/lib/carel/networks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FELT_LIMIT =
  (1n << 251n) +
  17n * (1n << 192n) +
  1n;

const headers = {
  "Cache-Control": "no-store, private",
  "X-Content-Type-Options": "nosniff",
};

class StakingError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
  ) {
    super(message);
  }
}

function reply(
  data: unknown,
  status = 200,
) {
  return NextResponse.json(
    data,
    { status, headers },
  );
}

function failure(error: unknown) {
  return reply(
    {
      error:
        error instanceof StakingError
          ? error.message
          : "The staking request could not be completed.",
    },
    error instanceof StakingError
      ? error.status
      : 502,
  );
}

function canonicalFelt(
  value: unknown,
  label: string,
) {
  if (
    typeof value !== "string" ||
    !/^(?:0x[0-9a-f]+|[0-9]+)$/i.test(value)
  ) {
    throw new StakingError(
      `Invalid ${label}.`,
    );
  }

  const n = BigInt(value);

  if (
    n <= 0n ||
    n >= FELT_LIMIT
  ) {
    throw new StakingError(
      `Invalid ${label}.`,
    );
  }

  return `0x${n.toString(16)}`;
}

function sameFelt(
  a: unknown,
  b: unknown,
) {
  try {
    return (
      BigInt(String(a)) ===
      BigInt(String(b))
    );
  } catch {
    return false;
  }
}

function assertSameOrigin(
  request: NextRequest,
) {
  let expectedOrigin =
    request.nextUrl.origin;

  try {
    const host =
      request.headers.get("host");

    if (host) {
      expectedOrigin =
        new URL(
          `${request.nextUrl.protocol}//${host}`,
        ).origin;
    }
  } catch {
    throw new StakingError(
      "Invalid CAREL request origin.",
      403,
    );
  }

  if (
    request.headers.get("origin") !==
    expectedOrigin
  ) {
    throw new StakingError(
      "Staking requests must originate from CAREL.",
      403,
    );
  }
}

async function getOfficialStrkPool() {
  const response = await fetch(
    `${BASE_URL}/staking/v3`,
    {
      headers: {
        Accept: "application/json",
      },
      cache: "no-store",
    },
  );

  if (!response.ok) {
    throw new StakingError(
      "AVNU staking is temporarily unavailable.",
      502,
    );
  }

  const raw: unknown =
    await response.json();

  if (
    !raw ||
    typeof raw !== "object"
  ) {
    throw new StakingError(
      "AVNU returned invalid staking data.",
      502,
    );
  }

  const pools =
    (raw as {
      delegationPools?: unknown;
    }).delegationPools;

  if (!Array.isArray(pools)) {
    throw new StakingError(
      "AVNU returned no staking pools.",
      502,
    );
  }

  for (const item of pools) {
    if (
      !item ||
      typeof item !== "object"
    ) {
      continue;
    }

    const row =
      item as Record<string, unknown>;

    if (
      !sameFelt(
        row.tokenAddress,
        STRK_TOKEN,
      )
    ) {
      continue;
    }

    return {
      poolAddress:
        canonicalFelt(
          row.poolAddress,
          "AVNU staking pool",
        ),
      tokenAddress:
        canonicalFelt(
          row.tokenAddress,
          "AVNU staking token",
        ),
    };
  }

  throw new StakingError(
    "AVNU returned no STRK staking pool.",
    503,
  );
}

const buckets =
  new Map<
    string,
    {
      count: number;
      reset: number;
    }
  >();

function rateLimit(
  request: NextRequest,
) {
  const now = Date.now();

  for (
    const [key, bucket]
    of buckets
  ) {
    if (bucket.reset <= now) {
      buckets.delete(key);
    }
  }

  const ip =
    request.headers
      .get("x-forwarded-for")
      ?.split(",")[0]
      ?.trim() ||
    request.headers
      .get("x-real-ip")
      ?.trim() ||
    "unknown";

  const bucket =
    buckets.get(ip) ?? {
      count: 0,
      reset: now + 60_000,
    };

  if (
    bucket.count >= 30 ||
    (
      !buckets.has(ip) &&
      buckets.size >= 10_000
    )
  ) {
    throw new StakingError(
      "Please wait before trying again.",
      429,
    );
  }

  bucket.count += 1;
  buckets.set(ip, bucket);
}

export async function POST(
  request: NextRequest,
) {
  try {
    rateLimit(request);
    assertSameOrigin(request);

    if (
      !request.headers
        .get("content-type")
        ?.startsWith(
          "application/json",
        )
    ) {
      throw new StakingError(
        "Use a JSON staking request.",
        415,
      );
    }

    if (
      Number(
        request.headers.get(
          "content-length",
        ) || 0,
      ) > 2048
    ) {
      throw new StakingError(
        "Request is too large.",
        413,
      );
    }

    const raw =
      await request.text();

    if (raw.length > 2048) {
      throw new StakingError(
        "Request is too large.",
        413,
      );
    }

    let body: Record<
      string,
      unknown
    >;

    try {
      const parsed =
        JSON.parse(raw);

      if (
        !parsed ||
        typeof parsed !== "object" ||
        Array.isArray(parsed)
      ) {
        throw new Error();
      }

      body = parsed;
    } catch {
      throw new StakingError(
        "Invalid staking request.",
      );
    }

    const owner =
      canonicalFelt(
        body.owner,
        "staking account",
      );

    const requestedPool =
      canonicalFelt(
        body.poolAddress,
        "staking pool",
      );

    if (
      typeof body.amount !== "string" ||
      !/^[1-9][0-9]*$/.test(
        body.amount,
      )
    ) {
      throw new StakingError(
        "Invalid staking amount.",
      );
    }

    const amount =
      BigInt(body.amount);

    if (
      amount <= 0n ||
      amount >= (1n << 128n)
    ) {
      throw new StakingError(
        "Staking amount is outside the supported range.",
      );
    }

    const official =
      await getOfficialStrkPool();

    if (
      !sameFelt(
        requestedPool,
        official.poolAddress,
      )
    ) {
      throw new StakingError(
        "The staking pool is no longer the official AVNU STRK pool.",
        409,
      );
    }

    const built =
      await stakeToCalls(
        {
          poolAddress:
            official.poolAddress,
          userAddress: owner,
          amount,
        },
        {
          baseUrl: BASE_URL,
        },
      );

    if (
      built.chainId !==
      constants.StarknetChainId.SN_MAIN
    ) {
      throw new StakingError(
        "AVNU returned staking calls for the wrong network.",
        502,
      );
    }

    if (
      !Array.isArray(built.calls) ||
      !built.calls.length
    ) {
      throw new StakingError(
        "AVNU returned an empty staking transaction.",
        502,
      );
    }

    return reply({
      chainId: built.chainId,
      poolAddress:
        official.poolAddress,
      tokenAddress:
        official.tokenAddress,
      calls: built.calls,
    });
  } catch (error) {
    return failure(error);
  }
}
