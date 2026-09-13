"use client";

import { useMemo, useState } from "react";
import {
  Activity,
  ArrowDownToLine,
  ArrowUpFromLine,
  Bot,
  Check,
  EyeOff,
  LockKeyhole,
  Orbit,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Target,
  WalletCards,
  Zap,
} from "lucide-react";
import { constants } from "starknet";
import {
  WalletStatusButton,
  useCarelTestnet,
} from "@/components/testnet/Strk20Testnet";
import {
  buildLivePlan,
  type LiveGoal,
} from "@/lib/agent/livePlanner";
import {
  formatUnits18,
} from "@/lib/strk20/units";
import { SEPOLIA_EXPLORER_TX } from "@/lib/strk20/config";

const ZERO = BigInt(0);

function balance(value: bigint | null) {
  return value === null ? "—" : `${formatUnits18(value)} STRK`;
}

export function LiveCarelApp() {
  const wallet = useCarelTestnet();
  const [goal, setGoal] = useState<LiveGoal>("target-private");
  const [target, setTarget] = useState("1");
  const [planVisible, setPlanVisible] = useState(false);
  const [executing, setExecuting] = useState(false);

  const isSepolia =
    wallet.chainId === constants.StarknetChainId.SN_SEPOLIA;

  const plan = useMemo(
    () =>
      buildLivePlan({
        goal,
        targetText: target,
        connected: wallet.connected,
        networkReady: isSepolia,
        strk20Capable: wallet.strk20Capable,
        publicStrk: wallet.publicStrk,
        privateStrk: wallet.privateStrk,
        privateRevealed: wallet.privateRevealed,
      }),
    [
      goal,
      target,
      wallet.connected,
      wallet.strk20Capable,
      wallet.publicStrk,
      wallet.privateStrk,
      wallet.privateRevealed,
      isSepolia,
    ],
  );

  const knownTotal =
    wallet.publicStrk !== null && wallet.privateRevealed
      ? wallet.publicStrk + (wallet.privateStrk ?? ZERO)
      : null;

  const remaining =
    wallet.maturityTarget && wallet.currentBlock !== null
      ? Math.max(0, wallet.maturityTarget - wallet.currentBlock)
      : null;

  const build = () => {
    setPlanVisible(true);
  };

  const execute = async () => {
    if (plan.status !== "ready") return;

    setExecuting(true);

    try {
      const amount = formatUnits18(plan.delta, 18);

      if (plan.action === "shield") {
        await wallet.shield(amount);
      } else if (plan.action === "unshield") {
        await wallet.unshield(amount);
      }
    } finally {
      setExecuting(false);
    }
  };

  return (
    <div className="live-app">
      <header className="live-topbar">
        <div className="live-brand">
          <span className="live-logo"><Orbit size={18} /></span>
          <span>
            <strong>CAREL</strong>
            <small>Agentic Private DeFi</small>
          </span>
        </div>

        <div className="live-network">
          <i className={wallet.connected && isSepolia ? "ok" : ""} />
          <span>{wallet.connected && isSepolia ? "Sepolia live" : "Testnet"}</span>
        </div>

        <WalletStatusButton />
      </header>

      <main className="live-main">
        <section className="live-heading">
          <div className="live-eyebrow">
            <Sparkles size={13} />
            LIVE MANDATE
          </div>
          <h1>Set the target. CAREL moves only what is needed.</h1>
          <p>
            Wallet state, policy decision, approval and STRK20 execution are now
            connected to Starknet Sepolia. No simulated portfolio values are
            used on this screen.
          </p>
        </section>

        <section className="live-balance-grid">
          <BalanceCard
            label="Public STRK"
            value={balance(wallet.publicStrk)}
            meta={wallet.connected ? "Read from Starknet Sepolia" : "Connect wallet"}
            icon={<WalletCards size={17} />}
            action={
              wallet.connected
                ? {
                    text: "Refresh",
                    run: () => void wallet.refreshPublicBalance(),
                  }
                : undefined
            }
          />

          <BalanceCard
            label="Private STRK"
            value={
              wallet.privateRevealed
                ? balance(wallet.privateStrk ?? ZERO)
                : "Hidden"
            }
            meta={
              wallet.privateRevealed
                ? "Wallet-mediated STRK20 balance"
                : "Not read without permission"
            }
            icon={<EyeOff size={17} />}
            privateCard
            action={
              wallet.connected && isSepolia && wallet.strk20Capable
                ? {
                    text: wallet.privateRevealed ? "Refresh" : "Reveal",
                    run: () => void wallet.revealPrivateBalance(),
                  }
                : undefined
            }
          />

          <BalanceCard
            label="Known capital"
            value={knownTotal === null ? "—" : `${formatUnits18(knownTotal)} STRK`}
            meta={
              knownTotal === null
                ? "Reveal private balance for total"
                : "Public + disclosed private STRK"
            }
            icon={<LockKeyhole size={17} />}
          />
        </section>

        <section className="live-work-grid">
          <div className="live-left">
            <article className="live-card live-command-card">
              <div className="live-card-head">
                <div>
                  <span>GOAL</span>
                  <h2>What state should CAREL maintain?</h2>
                </div>
                <Target size={18} />
              </div>

              <div className="live-goal-switch">
                <button
                  type="button"
                  className={goal === "target-private" ? "active" : ""}
                  onClick={() => {
                    setGoal("target-private");
                    setPlanVisible(false);
                  }}
                >
                  <EyeOff size={15} />
                  Keep private
                </button>
                <button
                  type="button"
                  className={goal === "target-public" ? "active" : ""}
                  onClick={() => {
                    setGoal("target-public");
                    setPlanVisible(false);
                  }}
                >
                  <WalletCards size={15} />
                  Keep public
                </button>
              </div>

              <label className="live-target-input">
                <span>
                  {goal === "target-private"
                    ? "Minimum private balance"
                    : "Minimum public balance"}
                </span>
                <div>
                  <input
                    inputMode="decimal"
                    value={target}
                    onChange={(event) => {
                      setTarget(event.target.value.replace(/[^0-9.]/g, ""));
                      setPlanVisible(false);
                    }}
                    aria-label="Target STRK amount"
                  />
                  <b>STRK</b>
                </div>
              </label>

              <div className="live-policy">
                <ShieldCheck size={16} />
                <span>
                  <strong>Approval required</strong>
                  <small>
                    CAREL may calculate the action, but Ready must approve every
                    value-moving transaction.
                  </small>
                </span>
              </div>

              <button
                type="button"
                className="live-build-button"
                onClick={build}
              >
                <Bot size={16} />
                Build live plan
              </button>
            </article>

            <article className="live-card live-plan-card">
              <div className="live-card-head">
                <div>
                  <span>AGENT PLAN</span>
                  <h2>{planVisible ? plan.title : "Waiting for a target"}</h2>
                </div>
                <PlanState
                  visible={planVisible}
                  status={planVisible ? plan.status : "idle"}
                />
              </div>

              {!planVisible ? (
                <div className="live-empty">
                  <span><Bot size={24} /></span>
                  <strong>No transaction has been proposed.</strong>
                  <p>
                    CAREL will use the connected wallet state to calculate the
                    smallest delta required by your target.
                  </p>
                </div>
              ) : (
                <>
                  <p className="live-plan-reason">{plan.reason}</p>

                  <div className="live-plan-numbers">
                    <div>
                      <small>Target</small>
                      <strong>{formatUnits18(plan.target)} STRK</strong>
                    </div>
                    <div>
                      <small>Required delta</small>
                      <strong>{formatUnits18(plan.delta)} STRK</strong>
                    </div>
                    <div>
                      <small>Action</small>
                      <strong>
                        {plan.action === "shield"
                          ? "Shield"
                          : plan.action === "unshield"
                            ? "Unshield"
                            : plan.action === "reveal-private"
                              ? "Read private state"
                              : "None"}
                      </strong>
                    </div>
                  </div>

                  <div className="live-route">
                    <RouteNode
                      title={
                        plan.action === "unshield"
                          ? "Private STRK"
                          : "Public STRK"
                      }
                      meta="Current state"
                    />
                    <span>→</span>
                    <RouteNode
                      title={
                        plan.action === "shield"
                          ? "STRK20 Shield"
                          : plan.action === "unshield"
                            ? "STRK20 Unshield"
                            : "Policy check"
                      }
                      meta={
                        plan.action === "shield"
                          ? "Public deposit"
                          : plan.action === "unshield"
                            ? "Public withdrawal"
                            : "No value movement"
                      }
                      active={plan.status === "ready"}
                    />
                    <span>→</span>
                    <RouteNode
                      title={
                        goal === "target-private"
                          ? "Private target"
                          : "Public target"
                      }
                      meta={`${formatUnits18(plan.target)} STRK`}
                    />
                  </div>

                  {plan.status === "needs-private-state" && (
                    <button
                      className="live-approve-button secondary"
                      type="button"
                      disabled={wallet.busy}
                      onClick={() => void wallet.revealPrivateBalance()}
                    >
                      <EyeOff size={15} />
                      Reveal private balance
                    </button>
                  )}

                  {plan.status === "ready" && (
                    <button
                      className="live-approve-button"
                      type="button"
                      disabled={wallet.busy || executing}
                      onClick={() => void execute()}
                    >
                      {plan.action === "shield"
                        ? <ArrowDownToLine size={16} />
                        : <ArrowUpFromLine size={16} />}
                      {executing || wallet.busy
                        ? "Waiting for Ready…"
                        : `Approve ${plan.title}`}
                    </button>
                  )}

                  {plan.status === "satisfied" && (
                    <div className="live-satisfied">
                      <Check size={15} />
                      CAREL correctly chose not to move funds.
                    </div>
                  )}
                </>
              )}
            </article>
          </div>

          <aside className="live-right">
            <article className="live-card">
              <div className="live-card-head">
                <div>
                  <span>EXECUTION STATE</span>
                  <h2>Starknet / STRK20</h2>
                </div>
                <Activity size={18} />
              </div>

              <StatusRow
                label="Wallet"
                value={wallet.connected ? "Connected" : "Not connected"}
                ok={wallet.connected}
              />
              <StatusRow
                label="Network"
                value={isSepolia ? "Starknet Sepolia" : "Switch to Sepolia"}
                ok={isSepolia}
              />
              <StatusRow
                label="STRK20 API"
                value={wallet.strk20Capable ? "Supported" : "Unavailable"}
                ok={wallet.strk20Capable}
              />
              <StatusRow
                label="Private state"
                value={wallet.privateRevealed ? "Disclosed to CAREL" : "Hidden"}
                ok={wallet.privateRevealed}
              />

              {wallet.error && (
                <div className="live-error">{wallet.error}</div>
              )}
            </article>

            <article className="live-card">
              <div className="live-card-head">
                <div>
                  <span>MONITOR</span>
                  <h2>Latest execution</h2>
                </div>
                <Zap size={18} />
              </div>

              {wallet.tx.kind === "idle" ? (
                <div className="live-monitor-empty">
                  No STRK20 transaction submitted in this session.
                </div>
              ) : (
                <div className="live-tx">
                  <small>{wallet.tx.kind.toUpperCase()}</small>
                  <strong>{wallet.tx.label}</strong>
                  <a
                    href={`${SEPOLIA_EXPLORER_TX}${wallet.tx.hash}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View Sepolia transaction ↗
                  </a>
                </div>
              )}

              {remaining !== null && (
                <div className={`live-maturity ${remaining === 0 ? "done" : ""}`}>
                  {remaining === 0
                    ? <Check size={15} />
                    : <RefreshCw size={15} className="spin" />}
                  <span>
                    {remaining === 0
                      ? "New private note should be mature. Refresh private balance."
                      : `Private note maturity · ~${remaining} blocks remaining`}
                  </span>
                </div>
              )}

              <div className="live-privacy-note">
                Shield deposit amount is public. Mature notes are private.
                Unshield amount and destination are public.
              </div>
            </article>
          </aside>
        </section>
      </main>
    </div>
  );
}

function BalanceCard({
  label,
  value,
  meta,
  icon,
  privateCard = false,
  action,
}: {
  label: string;
  value: string;
  meta: string;
  icon: React.ReactNode;
  privateCard?: boolean;
  action?: { text: string; run: () => void };
}) {
  return (
    <article className={`live-balance-card ${privateCard ? "private" : ""}`}>
      <div className="live-balance-top">
        <span>{label}</span>
        {icon}
      </div>
      <strong>{value}</strong>
      <div className="live-balance-bottom">
        <small>{meta}</small>
        {action && (
          <button type="button" onClick={action.run}>
            {action.text}
          </button>
        )}
      </div>
    </article>
  );
}

function PlanState({
  visible,
  status,
}: {
  visible: boolean;
  status: "idle" | "blocked" | "needs-private-state" | "satisfied" | "ready";
}) {
  const label =
    !visible || status === "idle"
      ? "IDLE"
      : status === "ready"
        ? "REVIEW"
        : status === "satisfied"
          ? "NO ACTION"
          : status === "needs-private-state"
            ? "NEEDS ACCESS"
            : "BLOCKED";

  return <span className={`live-plan-state ${status}`}>{label}</span>;
}

function RouteNode({
  title,
  meta,
  active = false,
}: {
  title: string;
  meta: string;
  active?: boolean;
}) {
  return (
    <div className={`live-route-node ${active ? "active" : ""}`}>
      <strong>{title}</strong>
      <small>{meta}</small>
    </div>
  );
}

function StatusRow({
  label,
  value,
  ok,
}: {
  label: string;
  value: string;
  ok: boolean;
}) {
  return (
    <div className="live-status-row">
      <span>{label}</span>
      <strong className={ok ? "ok" : ""}>
        <i />
        {value}
      </strong>
    </div>
  );
}
