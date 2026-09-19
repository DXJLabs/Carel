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
import type {
  Quote,
} from "@/lib/carel/ecosystems/starknet/protocols/endur/staking";

import {
  getEndurUnshieldQuote,
  loadEndurShieldConfig,
  loadStakingPool,
  loadStakingPosition,
  type StakingPool,
  type StakingPosition,
} from "@/lib/carel/ecosystems/starknet/protocols/endur/staking";
import {
  useCarelTestnet,
} from "@/components/testnet/Strk20Testnet";
import {
  ENDUR_AVNU_FEE_RECIPIENT,
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

function shortAddress(address: string) {
  return `${address.slice(0, 8)}…${address.slice(-6)}`;
}

function formatApr(value: number) {
  if (!Number.isFinite(value) || value < 0) {
    return "—";
  }

  return `${value.toFixed(2)}%`;
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
  const [
    unshieldQuoteLoading,
    setUnshieldQuoteLoading,
  ] = useState(false);
  const [
    unshieldQuote,
    setUnshieldQuote,
  ] = useState<Quote | null>(null);
  const [
    unshieldStage,
    setUnshieldStage,
  ] = useState<{
    privateBuyBefore: bigint;
    minExpected: bigint;
    maturityTarget: number;
    sellAmount: string;
  } | null>(null);
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

  /**
   * Loads the server-verified Endur privacy configuration through
   * the staking adapter instead of parsing protocol data in the UI.
   */
  async function refreshShieldConfig() {
    if (
      !network ||
      network.id !== "mainnet" ||
      !network.assets.xstrk
    ) {
      setShieldFee(null);
      return;
    }

    setShieldLoading(true);
    setError("");

    try {
      const config =
        await loadEndurShieldConfig({
          inputAsset:
            network.assets.strk,
          outputAsset:
            network.assets.xstrk,
          expectedAnonymizer:
            ENDUR_DEPOSIT_ANONYMIZER,
        });

      setShieldFee(
        config.feeAmount,
      );
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

  /**
   * Refreshes the public staking pool and connected account position
   * using registered CAREL assets.
   */
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
      const nextPool =
        await loadStakingPool(
          network.avnuBaseUrl,
          network.assets.strk,
        );

      setPool(
        nextPool,
      );

      if (!wallet.address) {
        setPosition(null);
        return;
      }

      try {
        const nextPosition =
          await loadStakingPosition(
            network.avnuBaseUrl,
            nextPool,
            wallet.address,
            network.assets.strk,
          );

        setPosition(
          nextPosition,
        );
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

  useEffect(() => {
    setUnshieldQuote(null);
    setUnshieldStage(null);
    setSuccess("");
    setError("");
  }, [
    mode,
    wallet.address,
    wallet.chainId,
  ]);

  /**
   * Requests the reviewed xSTRK → STRK route through the Endur adapter.
   */
  async function loadUnshieldQuote() {
    if (
      unshieldQuoteLoading ||
      executing
    ) {
      return;
    }

    setUnshieldQuoteLoading(true);
    setUnshieldQuote(null);
    setError("");
    setSuccess("");

    try {
      if (
        !wallet.connected ||
        !wallet.address ||
        !network ||
        network.id !== "mainnet" ||
        !network.assets.xstrk
      ) {
        throw new Error(
          "Connect Ready on Starknet Mainnet first.",
        );
      }

      if (
        !wallet.strk20Capable ||
        !network.privacyEnabled
      ) {
        throw new Error(
          "Ready STRK20 privacy support is required for Unshield Staking.",
        );
      }

      const sellAmount =
        parseUnits18(
          amount,
        );

      const quote =
        await getEndurUnshieldQuote({
          baseUrl:
            network.avnuBaseUrl,
          chainId:
            network.chainId,
          owner:
            wallet.address,
          fromAsset:
            network.assets.xstrk,
          toAsset:
            network.assets.strk,
          sellAmount,
          feeRecipient:
            ENDUR_AVNU_FEE_RECIPIENT,
        });

      setUnshieldQuote(
        quote,
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not load the xSTRK → STRK route.",
      );
    } finally {
      setUnshieldQuoteLoading(
        false,
      );
    }
  }

  async function executeUnshieldStart() {
    if (
      !unshieldQuote ||
      executing ||
      wallet.busy
    ) {
      return;
    }

    setExecuting(true);
    setError("");
    setSuccess("");

    try {
      const minExpected =
        unshieldQuote.buyAmount -
        (
          unshieldQuote.buyAmount *
          50n
        ) /
          10_000n;

      const stage =
        await wallet
          .executeUnshieldSwapStart(
            unshieldQuote,
            ENDUR_XSTRK_TOKEN,
            STRK_TOKEN,
            `Unshield Staking · private ${amount} xSTRK → private STRK`,
          );

      setUnshieldStage({
        privateBuyBefore:
          stage.privateBuyBefore,
        minExpected,
        maturityTarget:
          stage.maturityTarget,
        sellAmount:
          amount,
      });

      setUnshieldQuote(null);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Private xSTRK swap failed.",
      );
    } finally {
      setExecuting(false);
    }
  }

  async function completeUnshieldStaking() {
    if (
      !unshieldStage ||
      executing ||
      wallet.busy
    ) {
      return;
    }

    setExecuting(true);
    setError("");
    setSuccess("");

    try {
      const result =
        await wallet
          .completeUnshieldSwap(
            STRK_TOKEN,
            unshieldStage
              .privateBuyBefore,
            unshieldStage
              .minExpected,
            unshieldStage
              .maturityTarget,
            `Unshield Staking ${unshieldStage.sellAmount} xSTRK → public STRK`,
          );

      setSuccess(
        `Unshield complete: ${formatUnits18(
          result.amount,
          6,
        )} STRK moved to your public wallet.`,
      );

      setUnshieldStage(null);
      setUnshieldQuote(null);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not complete Unshield Staking.",
      );
    } finally {
      setExecuting(false);
    }
  }

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

    let stakeAmount: bigint;

    try {
      stakeAmount =
        parseUnits18(amount);

      if (stakeAmount <= 0n) {
        throw new Error(
          "Stake amount must be greater than zero.",
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

    const totalRequired =
      stakeAmount + shieldFee;

    setExecuting(true);

    try {
      const hash =
        await wallet
          .executeShieldStaking(
            formatUnits18(
              totalRequired,
              18,
            ),
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

        {shieldFee !== null && (() => {
          try {
            const stake =
              parseUnits18(amount || "0");

            const total =
              stake + shieldFee;

            return (
              <>
                <div className={styles.rule}>
                  <span>Amount staked</span>
                  <strong>
                    {formatUnits18(
                      stake,
                      6,
                    )} STRK
                  </strong>
                </div>

                <div className={styles.rule}>
                  <span>Total required</span>
                  <strong>
                    {formatUnits18(
                      total,
                      6,
                    )} STRK
                  </strong>
                </div>
              </>
            );
          } catch {
            return null;
          }
        })()}

        <p className={styles.privacyNote}>
          CAREL adds the current privacy fee
          on top of the amount you choose to stake,
          then privately funds Endur and receives
          xSTRK as a private STRK20 note.
        </p>

        <label
          className={styles.fieldLabel}
          htmlFor="carel-shield-stake-amount"
        >
          STRK amount to stake
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
    if (
      wallet.connected &&
      network?.id !== "mainnet"
    ) {
      return (
        <section className={styles.panel}>
          <h3>Unshield Staking</h3>

          <p className={styles.notice}>
            Unshield Staking is currently enabled
            on Starknet Mainnet. Switch Ready to
            Mainnet to continue.
          </p>
        </section>
      );
    }

    if (unshieldStage) {
      const matured =
        wallet.currentBlock !== null &&
        wallet.currentBlock >=
          unshieldStage.maturityTarget;

      return (
        <section className={styles.panel}>
          <h3>Unshield Staking</h3>

          <div className={styles.route}>
            <span>Private xSTRK</span>
            <ArrowRight size={16}/>
            <span>Public STRK</span>
          </div>

          <div className={styles.rule}>
            <span>Step</span>
            <strong>2 of 2</strong>
          </div>

          <div className={styles.rule}>
            <span>Private swap</span>
            <strong>Confirmed</strong>
          </div>

          <div className={styles.rule}>
            <span>STRK maturity block</span>
            <strong>
              {unshieldStage
                .maturityTarget
                .toLocaleString()}
            </strong>
          </div>

          <div className={styles.rule}>
            <span>Current block</span>
            <strong>
              {wallet.currentBlock
                ?.toLocaleString() ??
                "Checking…"}
            </strong>
          </div>

          <p className={styles.helper}>
            AVNU converted the private xSTRK into
            private STRK. The new STRK20 note must
            mature before CAREL can withdraw the
            reviewed amount to your public wallet.
          </p>

          <button
            type="button"
            className={styles.primary}
            disabled={
              !matured ||
              executing ||
              wallet.busy
            }
            onClick={() =>
              void completeUnshieldStaking()
            }
          >
            {executing
              ? <LoaderCircle size={16}/>
              : <ArrowRight size={16}/>}
            {executing
              ? "Waiting for Ready…"
              : matured
                ? "Complete Unshield"
                : "Waiting for maturity"}
          </button>

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

    return (
      <section className={styles.panel}>
        <h3>Unshield Staking</h3>

        <div className={styles.route}>
          <span>Private xSTRK</span>
          <ArrowRight size={16}/>
          <span>Public STRK</span>
        </div>

        <p className={styles.helper}>
          Endur xSTRK · AVNU private routing ·
          STRK20 · wallet approval required
        </p>

        <div className={styles.rule}>
          <span>Sell token</span>
          <strong>Private xSTRK</strong>
        </div>

        <div className={styles.rule}>
          <span>Receive token</span>
          <strong>Public STRK</strong>
        </div>

        <label
          className={styles.fieldLabel}
          htmlFor="carel-unshield-stake-amount"
        >
          Private xSTRK to unstake
        </label>

        <input
          id="carel-unshield-stake-amount"
          className={styles.amountInput}
          inputMode="decimal"
          value={amount}
          disabled={
            unshieldQuoteLoading ||
            executing
          }
          onChange={(event) => {
            setAmount(
              event.target.value.replace(
                /[^0-9.]/g,
                "",
              ),
            );
            setUnshieldQuote(null);
            setSuccess("");
            setError("");
          }}
        />

        {!unshieldQuote ? (
          <button
            type="button"
            className={styles.primary}
            disabled={
              !wallet.connected ||
              !wallet.strk20Capable ||
              unshieldQuoteLoading ||
              executing ||
              wallet.busy
            }
            onClick={() =>
              void loadUnshieldQuote()
            }
          >
            {unshieldQuoteLoading
              ? <LoaderCircle size={16}/>
              : <ArrowRight size={16}/>}
            {unshieldQuoteLoading
              ? "Getting AVNU route…"
              : "Get Unshield route"}
          </button>
        ) : (
          <>
            <div className={styles.rule}>
              <span>You send</span>
              <strong>
                {formatUnits18(
                  unshieldQuote.sellAmount,
                  6,
                )} xSTRK
              </strong>
            </div>

            <div className={styles.rule}>
              <span>Estimated STRK</span>
              <strong>
                {formatUnits18(
                  unshieldQuote.buyAmount,
                  6,
                )} STRK
              </strong>
            </div>

            <div className={styles.rule}>
              <span>Price impact</span>
              <strong>
                {Number.isFinite(
                  unshieldQuote.priceImpact,
                )
                  ? `${(
                      unshieldQuote
                        .priceImpact / 100
                    ).toFixed(4)}%`
                  : "—"}
              </strong>
            </div>

            <p className={styles.privacyNote}>
              Step 1 keeps the STRK output private.
              After the new note matures, Step 2
              withdraws only the reviewed minimum
              amount to your public wallet.
            </p>

            <button
              type="button"
              className={styles.primary}
              disabled={
                executing ||
                wallet.busy
              }
              onClick={() =>
                void executeUnshieldStart()
              }
            >
              {executing
                ? <LoaderCircle size={16}/>
                : <ArrowRight size={16}/>}
              {executing
                ? "Waiting for Ready…"
                : "Review Unshield Staking"}
            </button>
          </>
        )}

        <button
          type="button"
          className={styles.textButton}
          onClick={onPublicMode}
        >
          Use Normal mode
        </button>

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
