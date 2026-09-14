"use client";

import { useMemo, useState } from "react";
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  Clock3,
  Eye,
  EyeOff,
  ExternalLink,
  Lock,
  RefreshCw,
  Shield,
  Sparkles,
  Unlock,
  WalletCards,
  Zap,
} from "lucide-react";
import { constants } from "starknet";

import {
  useCarelTestnet,
  WalletStatusButton,
} from "@/components/testnet/Strk20Testnet";
import {
  buildLivePlan,
  type LiveGoal,
} from "@/lib/agent/livePlanner";
import { formatUnits18 } from "@/lib/strk20/units";
import { SEPOLIA_EXPLORER_TX } from "@/lib/strk20/config";

const ZERO = 0n;

function fmt(value: bigint | null) {
  return value === null ? "—" : `${formatUnits18(value)} STRK`;
}

function shortAddress(address: string) {
  return address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "Disconnected";
}

function inferGoal(text: string): { goal: LiveGoal; target: string } | null {
  const normalized = text.trim().toLowerCase();
  const amount = normalized.match(/(\d+(?:\.\d+)?)/)?.[1];

  if (!amount) return null;

  if (
    normalized.includes("public") ||
    normalized.includes("unshield") ||
    normalized.includes("terbuka")
  ) {
    return { goal: "target-public", target: amount };
  }

  if (
    normalized.includes("private") ||
    normalized.includes("shield") ||
    normalized.includes("privat") ||
    normalized.includes("privacy")
  ) {
    return { goal: "target-private", target: amount };
  }

  return null;
}

export function CarelApp() {
  const wallet = useCarelTestnet();

  const [goalText, setGoalText] = useState(
    "Jaga minimal 1 STRK tetap private",
  );
  const [goal, setGoal] = useState<LiveGoal>("target-private");
  const [target, setTarget] = useState("1");
  const [planned, setPlanned] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [inputError, setInputError] = useState<string | null>(null);

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

  const buildPlan = () => {
    const parsed = inferGoal(goalText);

    if (!parsed) {
      setInputError(
        'Planner live saat ini memahami target STRK private/public. Contoh: "Jaga minimal 10 STRK private".',
      );
      setPlanned(false);
      return;
    }

    setGoal(parsed.goal);
    setTarget(parsed.target);
    setInputError(null);
    setPlanned(true);
  };

  const executePlan = async () => {
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

  const privateBalance = wallet.privateRevealed
    ? wallet.privateStrk ?? ZERO
    : null;

  const knownTotal =
    privateBalance !== null && wallet.publicStrk !== null
      ? privateBalance + wallet.publicStrk
      : null;

  const maturityRemaining =
    wallet.maturityTarget && wallet.currentBlock
      ? Math.max(0, wallet.maturityTarget - wallet.currentBlock)
      : null;

  return (
    <div className="rf-app">
      <header className="rf-header">
        <div className="rf-header-inner">
          <div className="rf-brand">
            <div className="rf-logo">
              <Shield size={20} />
              <i />
            </div>

            <div>
              <div className="rf-brand-name">
                CAREL
                <span>STRK20</span>
              </div>
              <p>Private DeFi Agent</p>
            </div>
          </div>

          <div className="rf-header-live">
            <span className="rf-live-dot" />
            <b>Starknet Sepolia</b>
            <em>•</em>
            <span>{wallet.strk20Capable ? "STRK20 Ready" : "Wallet API pending"}</span>
          </div>

          <WalletStatusButton />
        </div>
      </header>

      <main className="rf-main">
        <section className="rf-context-ribbon">
          <div className="rf-context-left">
            <div className="rf-context-icon">
              <Sparkles size={17} />
            </div>
            <div>
              <div className="rf-context-title">
                <strong>CAREL Agent</strong>
                <span className={wallet.connected ? "on" : ""}>
                  {wallet.connected ? "Active" : "Offline"}
                </span>
              </div>
              <p>Goal-driven private execution on Starknet</p>
            </div>
          </div>

          <div className="rf-context-metrics">
            <div>
              <span>Wallet</span>
              <strong>{shortAddress(wallet.address)}</strong>
            </div>
            <div className="private">
              <span>Privacy</span>
              <strong>{wallet.strk20Capable ? "STRK20" : "Unavailable"}</strong>
            </div>
            <div className="safe">
              <span>Execution</span>
              <strong>Approval Required</strong>
            </div>
          </div>
        </section>

        <div className="rf-dashboard">
          <div className="rf-left-column">
            <section className="rf-card rf-goal-card">
              <div className="rf-card-title">
                <div className="rf-title-icon goal">
                  <Sparkles size={17} />
                </div>
                <div>
                  <h2>Tentukan Tujuan Finansial</h2>
                  <p>
                    CAREL membaca state wallet, menghitung aksi minimum, lalu
                    meminta approval sebelum dana bergerak.
                  </p>
                </div>
              </div>

              <div className="rf-presets">
                <button
                  type="button"
                  onClick={() => {
                    setGoalText("Jaga minimal 10 STRK tetap private");
                    setPlanned(false);
                  }}
                >
                  <span>🛡️</span>
                  <b>Private target</b>
                  <small>STRK20</small>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setGoalText("Sediakan minimal 5 STRK public");
                    setPlanned(false);
                  }}
                >
                  <span>💧</span>
                  <b>Public liquidity</b>
                  <small>READY</small>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setGoalText("Jaga minimal 25 STRK tetap private");
                    setPlanned(false);
                  }}
                >
                  <span>🔒</span>
                  <b>Privacy reserve</b>
                  <small>RULE</small>
                </button>

                <button type="button" disabled>
                  <span>📈</span>
                  <b>Earn yield</b>
                  <small>ADAPTER</small>
                </button>
              </div>

              <div className="rf-goal-input">
                <textarea
                  rows={3}
                  value={goalText}
                  onChange={(event) => {
                    setGoalText(event.target.value);
                    setPlanned(false);
                    setInputError(null);
                  }}
                  placeholder="Contoh: Jaga minimal 10 STRK tetap private..."
                />

                <div className="rf-input-footer">
                  <div className="rf-input-meta">
                    <span>
                      <Shield size={14} />
                      STRK20 Shield
                    </span>
                    <i>•</i>
                    <span>
                      <Zap size={14} />
                      Ready approval
                    </span>
                  </div>

                  <button type="button" onClick={buildPlan}>
                    <span>Susun Rencana</span>
                    <ArrowRight size={15} />
                  </button>
                </div>
              </div>

              {inputError && <div className="rf-error">{inputError}</div>}
            </section>

            <section className="rf-card rf-plan-card">
              <div className="rf-plan-top">
                <div>
                  <div className="rf-badges">
                    <span className="ok">
                      <CheckCircle2 size={13} />
                      User-controlled
                    </span>
                    <span className="privacy">
                      <Lock size={13} />
                      {goal === "target-private" ? "Private target" : "Public target"}
                    </span>
                  </div>

                  <h2>
                    {planned ? plan.title : "Rencana Eksekusi"}
                  </h2>
                </div>

                <div className="rf-plan-metrics">
                  <div>
                    <span>Target</span>
                    <strong>{planned ? `${formatUnits18(plan.target)} STRK` : "—"}</strong>
                  </div>
                  <div>
                    <span>Delta</span>
                    <strong>{planned ? `${formatUnits18(plan.delta)} STRK` : "—"}</strong>
                  </div>
                  <div>
                    <span>Status</span>
                    <strong>
                      {!planned
                        ? "Waiting"
                        : plan.status === "satisfied"
                          ? "No action"
                          : plan.status === "ready"
                            ? "Ready"
                            : plan.status === "needs-private-state"
                              ? "Reveal"
                              : "Blocked"}
                    </strong>
                  </div>
                </div>
              </div>

              {!planned ? (
                <div className="rf-plan-empty">
                  <Sparkles size={24} />
                  <strong>Belum ada rencana aktif</strong>
                  <p>
                    Tulis tujuan di Goal Engine. CAREL akan menyusun aksi
                    berdasarkan state wallet yang nyata.
                  </p>
                </div>
              ) : (
                <>
                  <div className="rf-plan-reason">
                    <span className={`rf-plan-state ${plan.status}`} />
                    <div>
                      <strong>{plan.title}</strong>
                      <p>{plan.reason}</p>
                    </div>
                  </div>

                  <div className="rf-route">
                    <div>
                      <span>01</span>
                      <div>
                        <strong>Read wallet state</strong>
                        <p>Public STRK + user-approved private balance</p>
                      </div>
                    </div>
                    <ArrowRight size={14} />
                    <div>
                      <span>02</span>
                      <div>
                        <strong>
                          {plan.action === "shield"
                            ? "Shield minimum delta"
                            : plan.action === "unshield"
                              ? "Unshield minimum delta"
                              : "No value movement"}
                        </strong>
                        <p>CAREL follows the computed delta only</p>
                      </div>
                    </div>
                    <ArrowRight size={14} />
                    <div>
                      <span>03</span>
                      <div>
                        <strong>Monitor result</strong>
                        <p>Transaction and maturity remain visible</p>
                      </div>
                    </div>
                  </div>

                  <div className="rf-plan-actions">
                    {plan.status === "needs-private-state" && (
                      <button
                        type="button"
                        className="secondary"
                        disabled={wallet.busy}
                        onClick={() => void wallet.revealPrivateBalance()}
                      >
                        <EyeOff size={15} />
                        Reveal private balance
                      </button>
                    )}

                    {plan.status === "ready" && (
                      <button
                        type="button"
                        className="primary"
                        disabled={wallet.busy || executing}
                        onClick={() => void executePlan()}
                      >
                        {executing || wallet.busy ? (
                          <RefreshCw size={15} className="rf-spin" />
                        ) : (
                          <Shield size={15} />
                        )}
                        {executing || wallet.busy
                          ? "Waiting for Ready..."
                          : "Approve & Execute"}
                      </button>
                    )}

                    {plan.status === "satisfied" && (
                      <span className="rf-no-action">
                        <CheckCircle2 size={15} />
                        Target satisfied — no transaction
                      </span>
                    )}
                  </div>
                </>
              )}
            </section>
          </div>

          <aside className="rf-right-column">
            <section className="rf-card rf-portfolio-card">
              <div className="rf-side-heading">
                <div>
                  <span>PORTFOLIO</span>
                  <h3>Wallet & STRK20</h3>
                </div>

                <button
                  type="button"
                  disabled={!wallet.connected || wallet.busy}
                  onClick={() => {
                    void wallet.refreshPublicBalance();
                    if (wallet.privateRevealed) {
                      void wallet.revealPrivateBalance();
                    }
                  }}
                >
                  <RefreshCw size={14} />
                </button>
              </div>

              <div className="rf-total-panel">
                <div>
                  <span>KNOWN STRK</span>
                  <strong>{knownTotal === null ? "—" : fmt(knownTotal)}</strong>
                </div>
                <span className="rf-live-chip">LIVE WALLET</span>
              </div>

              <div className="rf-balance-cards">
                <div>
                  <div className="rf-balance-label">
                    <Unlock size={14} />
                    Public L2
                  </div>
                  <strong>{fmt(wallet.publicStrk)}</strong>
                  <button
                    type="button"
                    disabled={!wallet.connected || wallet.busy}
                    onClick={() => void wallet.refreshPublicBalance()}
                  >
                    {wallet.publicStrk === null ? "Load balance" : "Refresh"}
                  </button>
                </div>

                <div className="private">
                  <div className="rf-balance-label">
                    <Lock size={14} />
                    STRK20 Private
                  </div>
                  <strong>
                    {wallet.privateRevealed
                      ? fmt(wallet.privateStrk ?? ZERO)
                      : "Hidden"}
                  </strong>
                  <button
                    type="button"
                    disabled={!wallet.connected || wallet.busy || !isSepolia}
                    onClick={() => void wallet.revealPrivateBalance()}
                  >
                    {wallet.privateRevealed ? "Refresh" : "Reveal"}
                  </button>
                </div>
              </div>

              <div className="rf-token-row">
                <div className="rf-token-icon">S</div>
                <div>
                  <strong>STRK</strong>
                  <span>Starknet token</span>
                </div>
                <div className="rf-token-balances">
                  <span>
                    <small>PUBLIC</small>
                    <b>{fmt(wallet.publicStrk)}</b>
                  </span>
                  <span>
                    <small>STRK20</small>
                    <b>
                      {wallet.privateRevealed
                        ? fmt(wallet.privateStrk ?? ZERO)
                        : "Hidden"}
                    </b>
                  </span>
                </div>
              </div>
            </section>

            <section className="rf-card rf-sentinel-card">
              <div className="rf-side-heading">
                <div>
                  <span>MONITOR</span>
                  <h3>Execution state</h3>
                </div>
                <Activity size={17} />
              </div>

              <div className="rf-monitor-list">
                <div>
                  <span>Wallet</span>
                  <strong>{wallet.connected ? "Connected" : "Disconnected"}</strong>
                </div>
                <div>
                  <span>Network</span>
                  <strong>{isSepolia ? "Sepolia" : "Wrong network"}</strong>
                </div>
                <div>
                  <span>STRK20 API</span>
                  <strong>{wallet.strk20Capable ? "Supported" : "Unavailable"}</strong>
                </div>
                <div>
                  <span>Private state</span>
                  <strong>{wallet.privateRevealed ? "Revealed" : "Hidden"}</strong>
                </div>
              </div>

              {maturityRemaining !== null && (
                <div className="rf-maturity">
                  <Clock3 size={14} />
                  <div>
                    <span>Note maturity</span>
                    <strong>
                      {maturityRemaining === 0
                        ? "Mature"
                        : `${maturityRemaining} blocks remaining`}
                    </strong>
                  </div>
                </div>
              )}
            </section>

            <section className="rf-card rf-activity-card">
              <div className="rf-side-heading">
                <div>
                  <span>AUDIT TRAIL</span>
                  <h3>Latest activity</h3>
                </div>
                <Clock3 size={17} />
              </div>

              {wallet.tx.kind === "idle" ? (
                <div className="rf-activity-empty">
                  No CAREL transaction in this session.
                </div>
              ) : (
                <a
                  className="rf-tx-row"
                  href={`${SEPOLIA_EXPLORER_TX}${wallet.tx.hash}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <span className="rf-tx-dot" />
                  <div>
                    <strong>{wallet.tx.label}</strong>
                    <span>{wallet.tx.kind}</span>
                  </div>
                  <ExternalLink size={14} />
                </a>
              )}

              {wallet.error && <div className="rf-error side">{wallet.error}</div>}
            </section>
          </aside>
        </div>
      </main>
    </div>
  );
}
