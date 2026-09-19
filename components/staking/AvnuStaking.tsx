"use client";

import {
  useEffect,
  useState,
} from "react";
import {
  ArrowRight,
  LoaderCircle,
  RefreshCw,
} from "lucide-react";
type StakingPool = {
  poolAddress: string;
  tokenAddress: string;
  stakedAmount: bigint;
  apr: number;
};

type StakingPosition = {
  amount: bigint;
  unclaimedRewards: bigint;
};
import {
  useCarelTestnet,
} from "@/components/testnet/Strk20Testnet";
import {
  getCarelNetwork,
  STRK_TOKEN,
} from "@/lib/carel/networks";
import {
  formatUnits18,
  parseUnits18,
} from "@/lib/strk20/units";
import styles from "../CarelWorkspace.module.css";

type StakingMode =
  | "normal"
  | "shield"
  | "unshield";

function sameAddress(
  a: string,
  b: string,
) {
  try {
    return BigInt(a) === BigInt(b);
  } catch {
    return false;
  }
}

function shortAddress(address: string) {
  return `${address.slice(0, 8)}…${address.slice(-6)}`;
}

function formatApr(value: number) {
  if (!Number.isFinite(value) || value < 0) {
    return "—";
  }

  return `${value.toFixed(2)}%`;
}

function object(
  value: unknown,
  label: string,
): Record<string, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    throw new Error(`AVNU returned invalid ${label} data.`);
  }

  return value as Record<string, unknown>;
}

function text(
  value: unknown,
  label: string,
): string {
  if (typeof value !== "string" || !value.length) {
    throw new Error(`AVNU returned an invalid ${label}.`);
  }

  return value;
}

function bigintValue(
  value: unknown,
  label: string,
): bigint {
  if (
    typeof value !== "string" &&
    typeof value !== "number"
  ) {
    throw new Error(`AVNU returned an invalid ${label}.`);
  }

  const raw = String(value);

  if (!/^(?:0x[0-9a-f]+|\d+)$/i.test(raw)) {
    throw new Error(`AVNU returned malformed ${label}.`);
  }

  return BigInt(raw);
}

function numberValue(
  value: unknown,
  label: string,
): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value)
  ) {
    throw new Error(`AVNU returned an invalid ${label}.`);
  }

  return value;
}

async function loadStrkPool(
  baseUrl: string,
): Promise<StakingPool> {
  const response = await fetch(
    `${baseUrl}/staking/v3`,
    {
      headers: { Accept: "application/json" },
      cache: "no-store",
    },
  );

  if (!response.ok) {
    throw new Error(
      `AVNU staking API returned ${response.status}.`,
    );
  }

  const raw = object(
    await response.json(),
    "staking",
  );

  if (!Array.isArray(raw.delegationPools)) {
    throw new Error("AVNU returned no staking pools.");
  }

  for (const candidate of raw.delegationPools) {
    const row = object(candidate, "staking pool");

    const poolAddress = text(
      row.poolAddress,
      "pool address",
    );

    const tokenAddress = text(
      row.tokenAddress,
      "staking token",
    );

    if (!sameAddress(tokenAddress, STRK_TOKEN)) {
      continue;
    }

    return {
      poolAddress,
      tokenAddress,
      stakedAmount: bigintValue(
        row.stakedAmount,
        "pool stake",
      ),
      apr: numberValue(
        row.apr,
        "staking APR",
      ),
    };
  }

  throw new Error(
    "AVNU did not return a STRK staking pool.",
  );
}

async function loadPosition(
  baseUrl: string,
  pool: StakingPool,
  owner: string,
): Promise<StakingPosition | null> {
  const response = await fetch(
    `${baseUrl}/staking/v3/pools/${encodeURIComponent(
      pool.poolAddress,
    )}/members/${encodeURIComponent(owner)}`,
    {
      headers: { Accept: "application/json" },
      cache: "no-store",
    },
  );

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(
      `AVNU staking position returned ${response.status}.`,
    );
  }

  const row = object(
    await response.json(),
    "staking position",
  );

  if (
    !sameAddress(
      text(row.poolAddress, "position pool"),
      pool.poolAddress,
    ) ||
    !sameAddress(
      text(row.userAddress, "position owner"),
      owner,
    ) ||
    !sameAddress(
      text(row.tokenAddress, "position token"),
      STRK_TOKEN,
    )
  ) {
    throw new Error(
      "AVNU returned staking data for a different account, pool, or token.",
    );
  }

  return {
    amount: bigintValue(
      row.amount,
      "staked amount",
    ),
    unclaimedRewards: bigintValue(
      row.unclaimedRewards,
      "staking rewards",
    ),
  };
}

export function AvnuStaking({
  mode,
  goal,
  onPublicMode,
}: {
  mode: StakingMode;
  goal: string;
  onPublicMode: () => void;
}) {
  const wallet = useCarelTestnet();
  const network =
    getCarelNetwork(wallet.chainId);

  const [amount, setAmount] =
    useState("1");
  const [pool, setPool] =
    useState<StakingPool | null>(null);
  const [position, setPosition] =
    useState<StakingPosition | null>(null);
  const [loading, setLoading] =
    useState(false);
  const [executing, setExecuting] =
    useState(false);
  const [error, setError] =
    useState("");
  const [success, setSuccess] =
    useState("");

  useEffect(() => {
    const match =
      goal.match(
        /(\d+(?:\.\d+)?)\s+STRK\b/i,
      );

    if (match?.[1]) {
      setAmount(match[1]);
    }
  }, [goal]);

  async function refresh() {
    if (
      !network ||
      network.id !== "mainnet"
    ) {
      setPool(null);
      setPosition(null);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const strkPool =
        await loadStrkPool(
          network.avnuBaseUrl,
        );

      setPool(strkPool);

      if (!wallet.address) {
        setPosition(null);
        return;
      }

      try {
        const next =
          await loadPosition(
            network.avnuBaseUrl,
            strkPool,
            wallet.address,
          );

        setPosition(next);
      } catch (cause) {
        console.warn(
          "[CAREL] staking position unavailable",
          cause,
        );

        setPosition(null);
      }
    } catch (cause) {
      setPool(null);
      setPosition(null);
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not load AVNU staking.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    // Refresh when wallet/network changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    wallet.address,
    wallet.chainId,
  ]);

  async function execute() {
    if (
      !pool ||
      executing ||
      wallet.busy
    ) {
      return;
    }

    setError("");
    setSuccess("");

    let parsed: bigint;

    try {
      parsed = parseUnits18(amount);

      if (parsed <= 0n) {
        throw new Error();
      }
    } catch {
      setError(
        "Enter a positive STRK amount with up to 18 decimals.",
      );
      return;
    }

    setExecuting(true);

    try {
      const hash =
        await wallet.executeStaking(
          amount,
          pool.poolAddress,
          pool.tokenAddress,
          `Stake ${amount} STRK`,
        );

      setSuccess(
        `Staking transaction submitted: ${hash.slice(0, 10)}…${hash.slice(-6)}`,
      );

      await refresh();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Staking failed.",
      );
    } finally {
      setExecuting(false);
    }
  }

  if (mode !== "normal") {
    return (
      <section className={styles.panel}>
        <h3>Staking</h3>

        <div className={styles.route}>
          <span>Public STRK</span>
          <ArrowRight size={16}/>
          <span>Staking pool</span>
        </div>

        <p className={styles.helper}>
          Private staking is not connected yet.
          CAREL currently stakes public STRK through
          the Mainnet staking route.
        </p>

        <button
          type="button"
          className={styles.secondary}
          onClick={onPublicMode}
        >
          Use Normal mode
        </button>
      </section>
    );
  }

  if (
    wallet.connected &&
    network?.id !== "mainnet"
  ) {
    return (
      <section className={styles.panel}>
        <h3>STRK Staking</h3>

        <p className={styles.notice}>
          Staking is currently enabled on
          Starknet Mainnet. Switch Ready to
          Mainnet to continue.
        </p>
      </section>
    );
  }

  return (
    <section className={styles.panel}>
      <h3>STRK Staking</h3>

      <div className={styles.route}>
        <span>Public STRK</span>
        <ArrowRight size={16}/>
        <span>AVNU staking pool</span>
      </div>

      <p className={styles.helper}>
        Starknet Mainnet · wallet approval required
      </p>

      {loading && !pool ? (
        <p className={styles.helper}>
          Loading staking pool…
        </p>
      ) : pool ? (
        <>
          <div className={styles.rule}>
            <span>Current APR</span>
            <strong>
              {formatApr(pool.apr)}
            </strong>
          </div>

          <div className={styles.rule}>
            <span>Pool</span>
            <strong>
              {shortAddress(
                pool.poolAddress,
              )}
            </strong>
          </div>

          <div className={styles.rule}>
            <span>Total pool stake</span>
            <strong>
              {formatUnits18(
                pool.stakedAmount,
                2,
              )}{" "}
              STRK
            </strong>
          </div>

          <div className={styles.rule}>
            <span>Your stake</span>
            <strong>
              {position
                ? formatUnits18(
                    position.amount,
                    4,
                  )
                : "0"}{" "}
              STRK
            </strong>
          </div>

          <div className={styles.rule}>
            <span>Unclaimed rewards</span>
            <strong>
              {position
                ? formatUnits18(
                    position.unclaimedRewards,
                    6,
                  )
                : "0"}{" "}
              STRK
            </strong>
          </div>

          <label
            className={styles.fieldLabel}
            htmlFor="carel-stake-amount"
          >
            Amount to stake
          </label>

          <input
            id="carel-stake-amount"
            className={styles.amountInput}
            inputMode="decimal"
            value={amount}
            onChange={(event) => {
              setAmount(
                event.target.value.replace(
                  /[^0-9.]/g,
                  "",
                ),
              );
              setSuccess("");
            }}
          />

          <button
            type="button"
            className={styles.primary}
            disabled={
              !wallet.connected ||
              executing ||
              wallet.busy
            }
            onClick={() =>
              void execute()
            }
          >
            {executing
              ? <LoaderCircle size={16}/>
              : <ArrowRight size={16}/>}
            {executing
              ? "Waiting for Ready…"
              : "Review & Stake"}
          </button>

          <button
            type="button"
            className={styles.textButton}
            disabled={loading}
            onClick={() =>
              void refresh()
            }
          >
            <RefreshCw size={14}/>
            Refresh staking position
          </button>
        </>
      ) : null}

      {error && (
        <p
          className={styles.notice}
          role="alert"
        >
          {error}
        </p>
      )}

      {success && (
        <p className={styles.inlineStatus}>
          {success}
        </p>
      )}
    </section>
  );
}
