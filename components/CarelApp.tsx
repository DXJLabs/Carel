"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
  Activity,
  Bot,
  Check,
  ChevronDown,
  EyeOff,
  Home,
  LockKeyhole,
  Orbit,
  RefreshCw,
  Route,
  ShieldCheck,
  Sparkles,
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
import { SEPOLIA_EXPLORER_TX } from "@/lib/strk20/config";
import { formatUnits18 } from "@/lib/strk20/units";

import styles from "./CarelApp.module.css";

const ZERO = BigInt(0);

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function fmt(value: bigint | null) {
  return value === null ? "Not loaded" : `${formatUnits18(value)} STRK`;
}

function actionLabel(action: string) {
  if (action === "shield") return "Shield";
  if (action === "unshield") return "Unshield";
  return "No action";
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

  const coreState = executing || wallet.busy
    ? "working"
    : planned && plan.status === "ready"
      ? "ready"
      : planned && plan.status === "blocked"
        ? "blocked"
        : "idle";

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

  const buildPlan = () => {
    setPlanned(true);
    window.setTimeout(() => {
      document
        .getElementById("carel-plan")
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 120);
  };

  const privacyCopy =
    plan.status === "ready" && plan.action === "shield"
      ? "The shield deposit is public. The matured balance becomes private."
      : plan.status === "ready" && plan.action === "unshield"
        ? "The amount and destination become public when funds are unshielded."
        : "CAREL does not change the privacy boundary without showing it first.";

  return (
    <div className={styles.app} id="home">
      <div className={styles.scene} aria-hidden="true">
        <div className={styles.sceneGrid} />
        <div className={styles.sceneGlow} />
        <div className={styles.scanlines} />
        <span className={cx(styles.particle, styles.particleOne)} />
        <span className={cx(styles.particle, styles.particleTwo)} />
        <span className={cx(styles.particle, styles.particleThree)} />
        <span className={cx(styles.particle, styles.particleFour)} />
      </div>

      <header className={styles.header}>
        <a className={styles.brand} href="#home" aria-label="CAREL home">
          <span className={styles.brandMark}>
            <Orbit size={18} />
          </span>
          <span className={styles.brandName}>CAREL</span>
          <span className={styles.brandBy}>BY DXJ LABS</span>
        </a>

        <div className={styles.headerActions}>
          <div
            className={cx(
              styles.network,
              isSepolia ? styles.networkReady : styles.networkWaiting,
            )}
          >
            <i />
            <span>{isSepolia ? "STARKNET SEPOLIA" : "NETWORK REQUIRED"}</span>
          </div>
          <div className={styles.walletSlot}>
            <WalletStatusButton />
          </div>
        </div>
      </header>

      <main className={styles.main}>
        <section className={styles.hero}>
          <div className={styles.heroCopy}>
            <div className={styles.eyebrow}>
              <Sparkles size={14} />
              AGENTIC PRIVATE DEFI
            </div>

            <h1>
              <span>Set the goal.</span>
              <em>Keep control.</em>
            </h1>

            <p>
              CAREL turns your capital target into a controlled Starknet plan,
              checks the privacy boundary, and asks before funds move.
            </p>

            <div className={styles.promiseRow}>
              <span><ShieldCheck size={14} /> User-approved</span>
              <span><EyeOff size={14} /> Privacy-aware</span>
              <span><Route size={14} /> Goal-first</span>
            </div>
          </div>

          <CarelCore state={coreState} />

          <div className={styles.commandGrid}>
            <section className={styles.commandCard}>
              <div className={styles.cardTopline}>
                <div>
                  <span className={styles.cardIcon}><Bot size={17} /></span>
                  <span>
                    <small>CAPITAL MANDATE</small>
                    <strong>Tell CAREL where funds should live</strong>
                  </span>
                </div>
                <span className={styles.secureLabel}>
                  <i /> LOCAL INTENT
                </span>
              </div>

              <div className={styles.mandateSentence}>
                <span>Keep at least</span>
                <label>
                  <span className={styles.srOnly}>Target amount in STRK</span>
                  <input
                    inputMode="decimal"
                    value={target}
                    onChange={(event) => {
                      setTarget(event.target.value.replace(/[^0-9.]/g, ""));
                      setPlanned(false);
                    }}
                    aria-label="Target amount in STRK"
                  />
                  <b>STRK</b>
                </label>
                <span>inside my</span>
                <strong>
                  {goal === "target-private" ? "private balance" : "public wallet"}
                </strong>
                <span>.</span>
              </div>

              <div className={styles.modeRow}>
                <button
                  type="button"
                  className={goal === "target-private" ? styles.active : ""}
                  onClick={() => {
                    setGoal("target-private");
                    setPlanned(false);
                  }}
                >
                  <EyeOff size={16} />
                  <span><strong>Keep private</strong><small>Use STRK20 balance</small></span>
                </button>

                <button
                  type="button"
                  className={goal === "target-public" ? styles.active : ""}
                  onClick={() => {
                    setGoal("target-public");
                    setPlanned(false);
                  }}
                >
                  <WalletCards size={16} />
                  <span><strong>Keep public</strong><small>Use connected wallet</small></span>
                </button>
              </div>

              <button
                type="button"
                className={styles.buildButton}
                onClick={buildPlan}
              >
                <span><Sparkles size={17} /> Build controlled plan</span>
                <b>→</b>
              </button>
            </section>

            <aside className={styles.balanceStack} aria-label="Wallet balances">
              <div className={cx(styles.balanceCard, styles.privateCard)}>
                <div className={styles.balanceHead}>
                  <span><EyeOff size={15} /> PRIVATE BALANCE</span>
                  <i className={wallet.privateRevealed ? styles.liveDot : ""} />
                </div>
                <strong>
                  {wallet.privateRevealed
                    ? fmt(wallet.privateStrk ?? ZERO)
                    : "••••••"}
                </strong>
                <div className={styles.balanceFoot}>
                  <span>{wallet.privateRevealed ? "User-approved view" : "Hidden by default"}</span>
                  <button
                    type="button"
                    disabled={!wallet.connected || !isSepolia || wallet.busy}
                    onClick={() => void wallet.revealPrivateBalance()}
                  >
                    {wallet.privateRevealed ? <RefreshCw size={13} /> : <EyeOff size={13} />}
                    {wallet.privateRevealed ? "Refresh" : "Reveal"}
                  </button>
                </div>
              </div>

              <div className={styles.balanceCard}>
                <div className={styles.balanceHead}>
                  <span><WalletCards size={15} /> PUBLIC WALLET</span>
                  <i className={wallet.connected ? styles.liveDot : ""} />
                </div>
                <strong>{fmt(wallet.publicStrk)}</strong>
                <div className={styles.balanceFoot}>
                  <span>{wallet.connected ? "Wallet connected" : "Connect to load"}</span>
                  <button
                    type="button"
                    disabled={!wallet.connected || wallet.busy}
                    onClick={() => void wallet.refreshPublicBalance()}
                  >
                    <RefreshCw size={13} /> Refresh
                  </button>
                </div>
              </div>
            </aside>
          </div>
        </section>

        <section className={styles.controlRail} aria-label="CAREL safeguards">
          <div><small>01 / AUTHORITY</small><strong>Approval before execution</strong></div>
          <div><small>02 / PRIVACY</small><strong>Boundary shown before action</strong></div>
          <div><small>03 / CONTROL</small><strong>No unrestricted automation</strong></div>
        </section>

        {planned && (
          <section
            id="carel-plan"
            className={cx(
              styles.planPanel,
              plan.status === "ready" && styles.planReady,
              plan.status === "satisfied" && styles.planSatisfied,
              plan.status === "blocked" && styles.planBlocked,
            )}
          >
            <div className={styles.planHeading}>
              <div>
                <span className={styles.planNumber}>PLAN / 001</span>
                <h2>CAREL decision</h2>
              </div>
              <PlanStatus status={plan.status} />
            </div>

            {plan.status === "ready" && (
              <div className={styles.planBody}>
                <div className={styles.decisionBlock}>
                  <span className={styles.decisionIcon}><Zap size={22} /></span>
                  <div>
                    <small>RECOMMENDED ACTION</small>
                    <h3>{actionLabel(plan.action)} {formatUnits18(plan.delta)} STRK</h3>
                    <p>{plan.reason}</p>
                  </div>

                  <div className={styles.routeFlow}>
                    <RouteStep
                      index="01"
                      label={plan.action === "shield" ? "Public wallet" : "Private balance"}
                    />
                    <span className={styles.routeArrow}>→</span>
                    <RouteStep index="02" label={actionLabel(plan.action)} active />
                    <span className={styles.routeArrow}>→</span>
                    <RouteStep
                      index="03"
                      label={goal === "target-private" ? "Private target" : "Public target"}
                    />
                  </div>

                  <button
                    type="button"
                    className={styles.approveButton}
                    disabled={wallet.busy || executing}
                    onClick={() => void execute()}
                  >
                    <ShieldCheck size={17} />
                    {executing || wallet.busy
                      ? "Waiting for Ready…"
                      : "Review and approve in Ready"}
                  </button>
                </div>

                <aside className={styles.planFacts}>
                  <PlanFact label="Agent scope" value={`Only ${actionLabel(plan.action).toLowerCase()} ${formatUnits18(plan.delta)} STRK`} />
                  <PlanFact label="Approval" value="Required before execution" />
                  <PlanFact label="Privacy impact" value={privacyCopy} />
                  <PlanFact label="Network" value="Starknet Sepolia" />
                </aside>
              </div>
            )}

            {plan.status === "satisfied" && (
              <div className={styles.simpleDecision}>
                <span className={cx(styles.decisionIcon, styles.goodIcon)}><Check size={22} /></span>
                <div>
                  <small>GOAL ALREADY SATISFIED</small>
                  <h3>Nothing needs to move</h3>
                  <p>{plan.reason}</p>
                  <strong>CAREL will not submit a transaction.</strong>
                </div>
              </div>
            )}

            {plan.status === "needs-private-state" && (
              <div className={styles.simpleDecision}>
                <span className={styles.decisionIcon}><EyeOff size={22} /></span>
                <div>
                  <small>USER ACCESS REQUIRED</small>
                  <h3>Reveal private balance</h3>
                  <p>{plan.reason}</p>
                  <button
                    type="button"
                    className={styles.inlineButton}
                    disabled={wallet.busy}
                    onClick={() => void wallet.revealPrivateBalance()}
                  >
                    <EyeOff size={15} /> Reveal with wallet approval
                  </button>
                </div>
              </div>
            )}

            {plan.status === "blocked" && (
              <div className={styles.simpleDecision}>
                <span className={cx(styles.decisionIcon, styles.blockedIcon)}><LockKeyhole size={22} /></span>
                <div>
                  <small>EXECUTION BLOCKED</small>
                  <h3>CAREL cannot execute this target</h3>
                  <p>{plan.reason}</p>
                  <strong>No funds will move.</strong>
                </div>
              </div>
            )}
          </section>
        )}

        {wallet.error && (
          <div className={styles.errorPanel} role="alert">
            <LockKeyhole size={16} />
            <span>{wallet.error}</span>
          </div>
        )}

        <section className={styles.agentLoop} id="strategies">
          <div className={styles.sectionIntro}>
            <small>THE CONTROLLED AGENT LOOP</small>
            <h2>Automation you can inspect.</h2>
            <p>Every CAREL action has a reason, a boundary, and a final user decision.</p>
          </div>
          <div className={styles.loopGrid}>
            <LoopCard number="01" icon={<Activity size={19} />} title="Observe" text="Read approved wallet state and understand the target." />
            <LoopCard number="02" icon={<Route size={19} />} title="Plan" text="Choose the minimum public or private route required." />
            <LoopCard number="03" icon={<ShieldCheck size={19} />} title="Ask, then execute" text="Show impact clearly and wait for wallet approval." />
          </div>
        </section>

        <section className={styles.activitySection} id="activity">
          <div className={styles.activityHeading}>
            <div>
              <small>LIVE EXECUTION LOG</small>
              <h2>Activity</h2>
            </div>
            <span><i /> THIS SESSION</span>
          </div>

          {wallet.tx.kind !== "idle" ? (
            <div className={styles.txPanel}>
              <div className={styles.txPulse}><Activity size={18} /></div>
              <div>
                <small>{wallet.tx.kind.toUpperCase()}</small>
                <strong>{wallet.tx.label}</strong>
              </div>
              <a
                href={`${SEPOLIA_EXPLORER_TX}${wallet.tx.hash}`}
                target="_blank"
                rel="noreferrer"
              >
                View transaction <span>↗</span>
              </a>
            </div>
          ) : (
            <div className={styles.emptyActivity}>
              <span><Activity size={19} /></span>
              <div>
                <strong>No execution yet</strong>
                <p>Approved CAREL actions will appear here with their transaction link.</p>
              </div>
            </div>
          )}
        </section>

        <details className={styles.detailsPanel}>
          <summary>
            <span><Activity size={16} /> Connection and privacy details</span>
            <ChevronDown size={16} />
          </summary>
          <div className={styles.detailsBody}>
            <DetailRow label="Wallet" value={wallet.connected ? "Connected" : "Disconnected"} />
            <DetailRow label="Network" value={isSepolia ? "Starknet Sepolia" : "Not ready"} />
            <DetailRow label="STRK20" value={wallet.strk20Capable ? "Supported" : "Unavailable"} />
            <DetailRow label="Private state" value={wallet.privateRevealed ? "User-approved" : "Hidden"} />
            <p>
              Shield deposits are public. Mature notes are private. Unshield
              amount and destination are public.
            </p>
          </div>
        </details>
      </main>

      <nav className={styles.bottomNav} aria-label="Primary navigation">
        <a className={styles.navActive} href="#home"><Home size={18} /><span>Home</span></a>
        <a href="#strategies"><Route size={18} /><span>Strategy</span></a>
        <a href="#activity"><Activity size={18} /><span>Activity</span></a>
      </nav>
    </div>
  );
}

function CarelCore({ state }: { state: "idle" | "working" | "ready" | "blocked" }) {
  return (
    <div className={styles.coreStage} data-state={state} aria-hidden="true">
      <div className={styles.coreHalo} />
      <div className={cx(styles.orbitRing, styles.orbitOuter)}><i /><i /></div>
      <div className={cx(styles.orbitRing, styles.orbitMiddle)}><i /><i /></div>
      <div className={cx(styles.orbitRing, styles.orbitInner)}><i /></div>
      <div className={styles.coreSphere}>
        <span className={cx(styles.latitude, styles.latitudeOne)} />
        <span className={cx(styles.latitude, styles.latitudeTwo)} />
        <span className={cx(styles.latitude, styles.latitudeThree)} />
        <span className={cx(styles.meridian, styles.meridianOne)} />
        <span className={cx(styles.meridian, styles.meridianTwo)} />
        <div className={styles.coreCenter}>
          <Orbit size={34} />
          <strong>CAREL</strong>
          <small>PRIVATE AGENT</small>
        </div>
      </div>
      <span className={cx(styles.coreNode, styles.nodeOne)} />
      <span className={cx(styles.coreNode, styles.nodeTwo)} />
      <span className={cx(styles.coreNode, styles.nodeThree)} />
      <span className={cx(styles.coreNode, styles.nodeFour)} />
      <div className={styles.coreStatus}>
        <i />
        {state === "working"
          ? "CALCULATING ROUTE"
          : state === "ready"
            ? "PLAN READY"
            : state === "blocked"
              ? "ACTION BLOCKED"
              : "AGENT ONLINE"}
      </div>
    </div>
  );
}

function PlanStatus({ status }: { status: string }) {
  const label =
    status === "ready"
      ? "SIMULATION READY"
      : status === "satisfied"
        ? "NO ACTION"
        : status === "needs-private-state"
          ? "ACCESS REQUIRED"
          : "BLOCKED";

  return <span className={styles.planStatus}><i /> {label}</span>;
}

function RouteStep({
  index,
  label,
  active = false,
}: {
  index: string;
  label: string;
  active?: boolean;
}) {
  return (
    <div className={cx(styles.routeStep, active && styles.routeStepActive)}>
      <small>{index}</small>
      <strong>{label}</strong>
    </div>
  );
}

function PlanFact({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.planFact}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function LoopCard({
  number,
  icon,
  title,
  text,
}: {
  number: string;
  icon: ReactNode;
  title: string;
  text: string;
}) {
  return (
    <article className={styles.loopCard}>
      <div><span>{icon}</span><small>{number}</small></div>
      <h3>{title}</h3>
      <p>{text}</p>
    </article>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.detailRow}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
