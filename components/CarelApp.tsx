"use client";

import { useMemo, useState } from "react";
import {
  Activity,
  Bot,
  Check,
  ChevronRight,
  EyeOff,
  Home,
  LayoutDashboard,
  LockKeyhole,
  Orbit,
  RefreshCw,
  Route,
  ShieldCheck,
  Sparkles,
  Target,
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

const ZERO = BigInt(0);

function fmt(value: bigint | null) {
  return value === null ? "—" : `${formatUnits18(value)} STRK`;
}

function actionLabel(action: string) {
  if (action === "shield") return "Shield";
  if (action === "unshield") return "Unshield";
  if (action === "reveal-private") return "Reveal private";
  return "None";
}

export function CarelApp() {
  const wallet = useCarelTestnet();
  const [goal, setGoal] = useState<LiveGoal>("target-private");
  const [target, setTarget] = useState("1");
  const [planned, setPlanned] = useState(false);
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

  const knownCapital =
    wallet.publicStrk !== null && wallet.privateRevealed
      ? wallet.publicStrk + (wallet.privateStrk ?? ZERO)
      : null;

  const remainingBlocks =
    wallet.maturityTarget && wallet.currentBlock !== null
      ? Math.max(0, wallet.maturityTarget - wallet.currentBlock)
      : null;

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
    <div className="app-shell">
      <div className="app-grid" aria-hidden="true" />

      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="logo-mark"><Orbit size={21} /></div>
          <div>
            <strong>CAREL</strong>
            <span>Agentic Private DeFi</span>
          </div>
        </div>

        <nav className="side-nav" aria-label="Main navigation">
          <SideItem icon={<LayoutDashboard size={17} />} label="Overview" active />
          <SideItem icon={<Bot size={17} />} label="Agent" badge="LIVE" />
          <SideItem icon={<Route size={17} />} label="Strategies" />
          <SideItem icon={<EyeOff size={17} />} label="Privacy" />
          <SideItem icon={<Activity size={17} />} label="Activity" />
        </nav>

        <div className="sidebar-spacer" />

        <div className="side-capital-card">
          <span>Known capital</span>
          <strong>
            {knownCapital === null ? "—" : `${formatUnits18(knownCapital)} STRK`}
          </strong>
          <div className="capital-mini-row">
            <i />
            {isSepolia ? "Starknet Sepolia" : "Connect Sepolia"}
          </div>
        </div>
      </aside>

      <div className="workspace">
        <header className="app-topbar">
          <div className="mobile-brand">
            <div className="logo-mark"><Orbit size={19} /></div>
            <strong>CAREL</strong>
          </div>

          <div className="top-status">
            <span className="status-dot" />
            <span>{wallet.connected ? "Wallet connected" : "Waiting for wallet"}</span>
            <span className="divider" />
            <span>{isSepolia ? "Starknet Sepolia" : "Testnet"}</span>
          </div>

          <div className="top-actions">
            <WalletStatusButton />
          </div>
        </header>

        <main className="workspace-inner">
          <section className="command-row real-command-row">
            <div className="command-intro">
              <div className="eyebrow">
                <Sparkles size={14} />
                LIVE AGENT WORKSPACE
              </div>
              <h1>Tell CAREL the state you want maintained.</h1>
              <p>
                CAREL reads the connected wallet, calculates only the required
                delta, asks for approval, executes through Ready, then monitors
                the result.
              </p>
            </div>
          </section>

          <section className="metric-grid real-metric-grid">
            <MetricCard
              label="Public STRK"
              value={fmt(wallet.publicStrk)}
              meta={wallet.connected ? "Read from Starknet Sepolia" : "Connect wallet"}
              icon={<WalletCards size={17} />}
            />

            <MetricCard
              label="Private STRK"
              value={
                wallet.privateRevealed
                  ? fmt(wallet.privateStrk ?? ZERO)
                  : "Hidden"
              }
              meta={
                wallet.privateRevealed
                  ? "Wallet-mediated STRK20 balance"
                  : "Explicit permission required"
              }
              icon={<EyeOff size={17} />}
              privateCard
            />

            <MetricCard
              label="Known capital"
              value={
                knownCapital === null
                  ? "—"
                  : `${formatUnits18(knownCapital)} STRK`
              }
              meta="Public + disclosed private"
              icon={<LockKeyhole size={17} />}
            />

            <MetricCard
              label="Agent state"
              value={
                !wallet.connected
                  ? "Offline"
                  : planned
                    ? plan.status === "ready"
                      ? "Review"
                      : plan.status === "satisfied"
                        ? "No action"
                        : "Blocked"
                    : "Ready"
              }
              meta="Human approval required"
              icon={<Bot size={17} />}
              accent
            />
          </section>

          <section className="work-grid">
            <div className="left-stack">
              <article className="panel strategy-panel real-mandate-panel">
                <div className="panel-head">
                  <div>
                    <span className="panel-kicker">MANDATE</span>
                    <h2>Target state</h2>
                  </div>
                  <Target size={18} />
                </div>

                <div className="real-goal-grid">
                  <button
                    type="button"
                    className={goal === "target-private" ? "active" : ""}
                    onClick={() => {
                      setGoal("target-private");
                      setPlanned(false);
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
                      setPlanned(false);
                    }}
                  >
                    <WalletCards size={15} />
                    Keep public
                  </button>

                  <label className="real-target-field">
                    <span>Target balance</span>
                    <input
                      inputMode="decimal"
                      value={target}
                      onChange={(event) => {
                        setTarget(event.target.value.replace(/[^0-9.]/g, ""));
                        setPlanned(false);
                      }}
                    />
                    <b>STRK</b>
                  </label>

                  <button
                    type="button"
                    className="run-button real-build-button"
                    onClick={() => setPlanned(true)}
                  >
                    <Sparkles size={15} />
                    Build live plan
                  </button>
                </div>
              </article>

              <article className="panel strategy-panel">
                <div className="panel-head">
                  <div>
                    <span className="panel-kicker">AGENT PLAN</span>
                    <h2>{planned ? plan.title : "Ready for a mandate"}</h2>
                  </div>
                  <LiveStateBadge planned={planned} status={plan.status} />
                </div>

                {!planned ? (
                  <div className="empty-plan real-empty-plan">
                    <div className="empty-orb"><Bot size={27} /></div>
                    <strong>No transaction proposed.</strong>
                    <p>
                      Set a target above. CAREL will use live wallet state and
                      move only the minimum delta required.
                    </p>
                  </div>
                ) : (
                  <>
                    <p className="real-plan-reason">{plan.reason}</p>

                    <div className="plan-summary-row">
                      <span>
                        <small>Target</small>
                        <strong>{formatUnits18(plan.target)} STRK</strong>
                      </span>
                      <span>
                        <small>Required delta</small>
                        <strong>{formatUnits18(plan.delta)} STRK</strong>
                      </span>
                      <span>
                        <small>Action</small>
                        <strong>{actionLabel(plan.action)}</strong>
                      </span>
                      <span>
                        <small>Approval</small>
                        <strong>{plan.action === "none" ? "Not needed" : "Required"}</strong>
                      </span>
                    </div>

                    <div className="execution-preview">
                      <div className="execution-head">
                        <span>Live execution route</span>
                        <small>Sepolia</small>
                      </div>

                      <div className="exec-flow">
                        <ExecNode
                          title={plan.action === "unshield" ? "Private STRK" : "Public STRK"}
                          subtitle="Current state"
                        />
                        <ExecArrow />
                        <ExecNode
                          title={
                            plan.action === "shield"
                              ? "STRK20 Shield"
                              : plan.action === "unshield"
                                ? "STRK20 Unshield"
                                : "Policy check"
                          }
                          subtitle={
                            plan.action === "none"
                              ? "No value movement"
                              : "Wallet API"
                          }
                          privateNode={plan.action === "shield"}
                        />
                        <ExecArrow />
                        <ExecNode
                          title={goal === "target-private" ? "Private target" : "Public target"}
                          subtitle={`${formatUnits18(plan.target)} STRK`}
                          activeNode
                        />
                        <ExecArrow />
                        <ExecNode title="Monitor" subtitle="Post-execution state" />
                      </div>
                    </div>

                    <div className="approval-row">
                      <div>
                        <ShieldCheck size={18} />
                        <span>
                          <strong>Policy gate</strong>
                          <small>Ready must approve every value-moving action.</small>
                        </span>
                      </div>

                      {plan.status === "needs-private-state" && (
                        <button
                          className="approve-button"
                          type="button"
                          disabled={wallet.busy}
                          onClick={() => void wallet.revealPrivateBalance()}
                        >
                          <EyeOff size={15} />
                          Reveal private
                        </button>
                      )}

                      {plan.status === "ready" && (
                        <button
                          className="approve-button"
                          type="button"
                          disabled={wallet.busy || executing}
                          onClick={() => void execute()}
                        >
                          <Zap size={15} />
                          {executing || wallet.busy
                            ? "Waiting for Ready…"
                            : `Approve ${actionLabel(plan.action)}`}
                        </button>
                      )}

                      {plan.status === "satisfied" && (
                        <span className="active-pill">
                          <Check size={14} />
                          No action required
                        </span>
                      )}
                    </div>
                  </>
                )}
              </article>

              <article className="panel agent-run-panel">
                <div className="panel-head compact-head">
                  <div>
                    <span className="panel-kicker">AGENT LOOP</span>
                    <h2>Decision trace</h2>
                  </div>
                  <Bot size={17} />
                </div>

                <div className="run-timeline">
                  <RunStep
                    icon={<WalletCards size={16} />}
                    title="Read wallet state"
                    copy="Read public STRK from Sepolia and private STRK only with explicit wallet permission."
                    done={wallet.connected}
                  />
                  <RunStep
                    icon={<EyeOff size={16} />}
                    title="Check privacy state"
                    copy="Private balance remains hidden until the user explicitly reveals it."
                    done={wallet.privateRevealed}
                  />
                  <RunStep
                    icon={<Target size={16} />}
                    title="Calculate minimum delta"
                    copy="Compare current state with the target and avoid unnecessary movement."
                    done={planned}
                  />
                  <RunStep
                    icon={<ShieldCheck size={16} />}
                    title="Approval and execution"
                    copy="If movement is required, Ready signs the STRK20 action."
                    done={wallet.tx.kind !== "idle"}
                    current={planned && plan.status === "ready"}
                  />
                </div>
              </article>
            </div>

            <div className="right-stack">
              <article className="panel guardrail-panel">
                <div className="panel-head compact-head">
                  <div>
                    <span className="panel-kicker">EXECUTION STATE</span>
                    <h2>Wallet readiness</h2>
                  </div>
                  <Activity size={17} />
                </div>

                <StatusRow
                  label="Wallet"
                  value={wallet.connected ? "Connected" : "Disconnected"}
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

                <div className="real-refresh-row">
                  <button
                    type="button"
                    disabled={!wallet.connected || wallet.busy}
                    onClick={() => void wallet.refreshPublicBalance()}
                  >
                    <RefreshCw size={13} />
                    Refresh public
                  </button>

                  <button
                    type="button"
                    disabled={!wallet.connected || !isSepolia || wallet.busy}
                    onClick={() => void wallet.revealPrivateBalance()}
                  >
                    <EyeOff size={13} />
                    {wallet.privateRevealed ? "Refresh private" : "Reveal private"}
                  </button>
                </div>

                {wallet.error && (
                  <div className="testnet-error">{wallet.error}</div>
                )}
              </article>

              <article className="panel activity-panel">
                <div className="panel-head compact-head">
                  <div>
                    <span className="panel-kicker">MONITOR</span>
                    <h2>Latest execution</h2>
                  </div>
                  <Zap size={17} />
                </div>

                {wallet.tx.kind === "idle" ? (
                  <p className="real-muted">
                    No STRK20 transaction submitted in this session.
                  </p>
                ) : (
                  <div className="testnet-tx">
                    <div>
                      <small>{wallet.tx.kind.toUpperCase()}</small>
                      <strong>{wallet.tx.label}</strong>
                    </div>
                    <a
                      href={`${SEPOLIA_EXPLORER_TX}${wallet.tx.hash}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      View tx ↗
                    </a>
                  </div>
                )}

                {remainingBlocks !== null && (
                  <div
                    className={`maturity-tracker ${
                      remainingBlocks === 0 ? "done" : ""
                    }`}
                  >
                    {remainingBlocks === 0 ? (
                      <Check size={15} />
                    ) : (
                      <RefreshCw className="spin" size={15} />
                    )}
                    <span>
                      {remainingBlocks === 0
                        ? "Private note should now be mature."
                        : `~${remainingBlocks} blocks until note maturity`}
                    </span>
                  </div>
                )}
              </article>

              <article className="panel privacy-panel">
                <div className="panel-head compact-head">
                  <div>
                    <span className="panel-kicker">PRIVACY BOUNDARY</span>
                    <h2>What CAREL exposes</h2>
                  </div>
                  <span className="strk20-chip">STRK20</span>
                </div>

                <div className="privacy-list">
                  <PrivacyRow label="Shield deposit" state="Public" />
                  <PrivacyRow label="Private note balance" state="Protected" privateState />
                  <PrivacyRow label="Private state read" state="User-approved" privateState />
                  <PrivacyRow label="Unshield amount + destination" state="Public" />
                </div>

                <p className="privacy-footnote">
                  CAREL does not claim the entire flow is private. It shows the
                  privacy boundary at each step.
                </p>
              </article>
            </div>
          </section>
        </main>

        <nav className="mobile-bottom-nav" aria-label="Mobile navigation">
          <button className="active"><Home size={17} /><span>Home</span></button>
          <button><Bot size={17} /><span>Agent</span></button>
          <button className="mobile-command"><Sparkles size={18} /><span>Plan</span></button>
          <button><EyeOff size={17} /><span>Privacy</span></button>
          <button><Activity size={17} /><span>Activity</span></button>
        </nav>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  meta,
  icon,
  accent = false,
  privateCard = false,
}: {
  label: string;
  value: string;
  meta: string;
  icon: React.ReactNode;
  accent?: boolean;
  privateCard?: boolean;
}) {
  return (
    <article
      className={`metric-card ${accent ? "accent" : ""} ${
        privateCard ? "private-card" : ""
      }`}
    >
      <div className="metric-top">
        <span>{label}</span>
        <i>{icon}</i>
      </div>
      <strong>{value}</strong>
      <p>{meta}</p>
    </article>
  );
}

function SideItem({
  icon,
  label,
  active = false,
  badge,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  badge?: string;
}) {
  return (
    <button className={`side-item ${active ? "active" : ""}`} type="button">
      {icon}
      <span>{label}</span>
      {badge ? <small>{badge}</small> : null}
    </button>
  );
}

function LiveStateBadge({
  planned,
  status,
}: {
  planned: boolean;
  status: string;
}) {
  const label = !planned
    ? "READY"
    : status === "ready"
      ? "REVIEW"
      : status === "satisfied"
        ? "NO ACTION"
        : status === "needs-private-state"
          ? "NEEDS ACCESS"
          : "BLOCKED";

  const className =
    status === "ready"
      ? "review"
      : status === "satisfied"
        ? "active"
        : "";

  return (
    <span className={`state-badge ${className}`}>
      <i />
      {label}
    </span>
  );
}

function ExecNode({
  title,
  subtitle,
  privateNode = false,
  activeNode = false,
}: {
  title: string;
  subtitle: string;
  privateNode?: boolean;
  activeNode?: boolean;
}) {
  return (
    <div
      className={`exec-node ${privateNode ? "private" : ""} ${
        activeNode ? "active" : ""
      }`}
    >
      <span>{title}</span>
      <small>{subtitle}</small>
    </div>
  );
}

function ExecArrow() {
  return <ChevronRight className="exec-arrow" size={14} />;
}

function RunStep({
  icon,
  title,
  copy,
  done = false,
  current = false,
}: {
  icon: React.ReactNode;
  title: string;
  copy: string;
  done?: boolean;
  current?: boolean;
}) {
  return (
    <div
      className={`run-step ${done ? "done" : ""} ${
        current ? "current" : ""
      }`}
    >
      <div className="run-icon">{done ? <Check size={14} /> : icon}</div>
      <div>
        <strong>{title}</strong>
        <p>{copy}</p>
      </div>
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
    <div className="real-status-row">
      <span>{label}</span>
      <strong className={ok ? "ok" : ""}>
        <i />
        {value}
      </strong>
    </div>
  );
}

function PrivacyRow({
  label,
  state,
  privateState = false,
}: {
  label: string;
  state: string;
  privateState?: boolean;
}) {
  return (
    <div className="privacy-row">
      <span>{label}</span>
      <strong className={privateState ? "private-state" : "public-state"}>
        {state}
      </strong>
    </div>
  );
}
