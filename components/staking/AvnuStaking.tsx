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
  unpoolAmount: bigint;
  unpoolTime: number | null;
};
import {
  useCarelTestnet,
} from "@/components/testnet/Strk20Testnet";
import {
  ENDUR_DEPOSIT_ANONYMIZER,
  ENDUR_XSTRK_TOKEN,
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

function timestampValue(
  value: unknown,
): number | null {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  try {
    const seconds =
      bigintValue(
        value,
        "unstake time",
      );

    return Number(seconds) * 1000;
  } catch {
    return null;
  }
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
    unpoolAmount: bigintValue(
      row.unpoolAmount ?? "0",
      "pending unstake amount",
    ),
    unpoolTime: timestampValue(
      row.unpoolTime,
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
  const [
    unstakeAmount,
    setUnstakeAmount,
  ] = useState("1");
  const [
    shieldFee,
    setShieldFee,
  ] = useState<bigint | null>(null);
  const [
    shieldLoading,
    setShieldLoading,
  ] = useState(false);
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

  async function refreshShieldConfig() {
    if (
      !network ||
      network.id !== "mainnet"
    ) {
      setShieldFee(null);
      return;
    }

    setShieldLoading(true);
    setError("");

    try {
      const response =
        await fetch(
          "/api/staking",
          {
            cache: "no-store",
          },
        );

      const raw: unknown =
        await response.json();

      const payload =
        object(
          raw,
          "Shield Staking config",
        );

      if (!response.ok) {
        throw new Error(
          typeof payload.error ===
            "string"
            ? payload.error
            : "Could not load Shield Staking configuration.",
        );
      }

      const shield =
        object(
          payload.shield,
          "Shield Staking",
        );

      const inputToken =
        text(
          shield.inputToken,
          "Shield input token",
        );

      const outputToken =
        text(
          shield.outputToken,
          "Shield output token",
        );

      const anonymizer =
        text(
          shield.anonymizer,
          "Endur anonymizer",
        );

      if (
        !sameAddress(
          inputToken,
          STRK_TOKEN,
        ) ||
        !sameAddress(
          outputToken,
          ENDUR_XSTRK_TOKEN,
        ) ||
        !sameAddress(
          anonymizer,
          ENDUR_DEPOSIT_ANONYMIZER,
        )
      ) {
        throw new Error(
          "CAREL rejected mismatched Endur Shield Staking configuration.",
        );
      }

      const fee =
        bigintValue(
          shield.feeAmount,
          "Shield Staking fee",
        );

      if (fee <= 0n) {
        throw new Error(
          "Endur returned an invalid Shield Staking fee.",
        );
      }

      setShieldFee(fee);
    } catch (cause) {
      setShieldFee(null);

      setError(
        cause instanceof Error
          ? cause.message
          : "Could not load Shield Staking.",
      );
    } finally {
      setShieldLoading(false);
    }
  }

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

  useEffect(() => {
    if (mode === "shield") {
      void refreshShieldConfig();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    mode,
    wallet.chainId,
  ]);

  async function executeShield() {
    if (
      shieldFee === null ||
      executing ||
      wallet.busy
    ) {
      return;
    }

    setError("");
    setSuccess("");

    try {
      const parsed =
        parseUnits18(amount);

      if (
        parsed <=
        shieldFee
      ) {
        throw new Error(
          `Amount must be greater than the current privacy fee (${formatUnits18(
            shieldFee,
            4,
          )} STRK).`,
        );
      }
    } catch (cause) {
      setError(
        cause instanceof Error &&
          cause.message
          ? cause.message
          : "Enter a valid STRK amount.",
      );
      return;
    }

    setExecuting(true);

    try {
      const hash =
        await wallet
          .executeShieldStaking(
            amount,
            shieldFee.toString(),
            `Shield Stake ${amount} STRK`,
          );

      setSuccess(
        `Shield Staking submitted: ${hash.slice(0, 10)}…${hash.slice(-6)}`,
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Shield Staking failed.",
      );
    } finally {
      setExecuting(false);
    }
  }

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

  async function runPositionAction(
    action:
      | "initiateUnstake"
      | "completeUnstake"
      | "claimRewards",
  ) {
    if (
      !pool ||
      executing ||
      wallet.busy
    ) {
      return;
    }

    setError("");
    setSuccess("");

    let actionAmount:
      string | null = null;

    if (
      action ===
      "initiateUnstake"
    ) {
      try {
        const parsed =
          parseUnits18(
            unstakeAmount,
          );

        if (
          parsed <= 0n ||
          !position ||
          parsed >
            position.amount
        ) {
          throw new Error();
        }
      } catch {
        setError(
          "Enter an unstake amount greater than zero and not above your current stake.",
        );
        return;
      }

      actionAmount =
        unstakeAmount;
    }

    setExecuting(true);

    try {
      const label =
        action ===
          "initiateUnstake"
          ? `Unstake ${unstakeAmount} STRK`
          : action ===
              "completeUnstake"
            ? "Complete STRK unstake"
            : "Claim staking rewards";

      const hash =
        await wallet
          .executeStakingAction(
            action,
            actionAmount,
            pool.poolAddress,
            pool.tokenAddress,
            label,
          );

      setSuccess(
        `${
          action ===
          "initiateUnstake"
            ? "Unstake initiated"
            : action ===
                "completeUnstake"
              ? "Withdrawal submitted"
              : "Rewards claim submitted"
        }: ${hash.slice(0, 10)}…${hash.slice(-6)}`,
      );

      await refresh();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Staking action failed.",
      );
    } finally {
      setExecuting(false);
    }
  }


  if (mode === "shield") {
    if (
      wallet.connected &&
      network?.id !== "mainnet"
    ) {
      return (
        <section className={styles.panel}>
          <h3>Shield Staking</h3>

          <p className={styles.notice}>
            Shield Staking is currently enabled on
            Starknet Mainnet. Switch Ready to
            Mainnet to continue.
          </p>
        </section>
      );
    }

    return (
      <section className={styles.panel}>
        <h3>Shield Staking</h3>

        <div className={styles.route}>
          <span>Public STRK</span>
          <ArrowRight size={16}/>
          <span>Private xSTRK</span>
        </div>

        <p className={styles.helper}>
          Endur liquid staking · STRK20 privacy ·
          wallet approval required
        </p>

        <div className={styles.rule}>
          <span>Provider</span>
          <strong>Endur</strong>
        </div>

        <div className={styles.rule}>
          <span>Output</span>
          <strong>Shielded xSTRK</strong>
        </div>

        <div className={styles.rule}>
          <span>Privacy fee</span>
          <strong>
            {shieldLoading
              ? "Loading…"
              : shieldFee !== null
                ? `${formatUnits18(
                    shieldFee,
                    4,
                  )} STRK`
                : "Unavailable"}
          </strong>
        </div>

        <p className={styles.privacyNote}>
          CAREL shields the public STRK first,
          privately funds Endur&apos;s deposit
          anonymizer, then receives xSTRK as a
          private STRK20 note.
        </p>

        <label
          className={styles.fieldLabel}
          htmlFor="carel-shield-stake-amount"
        >
          Public STRK to Shield &amp; Stake
        </label>

        <input
          id="carel-shield-stake-amount"
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
            !wallet.strk20Capable ||
            shieldFee === null ||
            shieldLoading ||
            executing ||
            wallet.busy
          }
          onClick={() =>
            void executeShield()
          }
        >
          {executing
            ? <LoaderCircle size={16}/>
            : <ArrowRight size={16}/>}
          {executing
            ? "Waiting for Ready…"
            : "Review & Shield Stake"}
        </button>

        {!wallet.strk20Capable &&
          wallet.connected && (
          <p className={styles.notice}>
            Ready must expose STRK20 Wallet API
            support for Shield Staking.
          </p>
        )}

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

  if (mode === "unshield") {
    return (
      <section className={styles.panel}>
        <h3>Unshield Staking</h3>

        <div className={styles.route}>
          <span>Private xSTRK</span>
          <ArrowRight size={16}/>
          <span>Public STRK</span>
        </div>

        <p className={styles.helper}>
          Unshield Staking is the next route.
          Shield Staking is now handled separately
          through Endur.
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

          {position &&
            position.amount > 0n && (
            <>
              <div className={styles.rule}>
                <span>
                  Unstake
                </span>
                <strong>
                  Exit request required
                </strong>
              </div>

              <label
                className={
                  styles.fieldLabel
                }
                htmlFor={
                  "carel-unstake-amount"
                }
              >
                Amount to unstake
              </label>

              <input
                id={
                  "carel-unstake-amount"
                }
                className={
                  styles.amountInput
                }
                inputMode="decimal"
                value={
                  unstakeAmount
                }
                onChange={(event) => {
                  setUnstakeAmount(
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
                className={
                  styles.secondary
                }
                disabled={
                  executing ||
                  wallet.busy
                }
                onClick={() =>
                  void runPositionAction(
                    "initiateUnstake",
                  )
                }
              >
                Review & Unstake
              </button>
            </>
          )}

          {position &&
            position.unpoolAmount >
              0n && (
            <>
              <div
                className={
                  styles.rule
                }
              >
                <span>
                  Pending withdrawal
                </span>
                <strong>
                  {formatUnits18(
                    position.unpoolAmount,
                    4,
                  )} STRK
                </strong>
              </div>

              {position.unpoolTime !==
                null && (
                <p
                  className={
                    styles.helper
                  }
                >
                  Available after{" "}
                  {new Date(
                    position.unpoolTime,
                  ).toLocaleString()}
                </p>
              )}

              <button
                type="button"
                className={
                  styles.secondary
                }
                disabled={
                  executing ||
                  wallet.busy ||
                  (
                    position.unpoolTime !==
                      null &&
                    Date.now() <
                      position.unpoolTime
                  )
                }
                onClick={() =>
                  void runPositionAction(
                    "completeUnstake",
                  )
                }
              >
                Complete withdrawal
              </button>
            </>
          )}

          <button
            type="button"
            className={
              styles.secondary
            }
            disabled={
              executing ||
              wallet.busy ||
              !position ||
              position.unclaimedRewards <=
                0n
            }
            onClick={() =>
              void runPositionAction(
                "claimRewards",
              )
            }
          >
            Claim rewards
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
