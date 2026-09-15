"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowUpFromLine,
  Bot,
  Check,
  ChevronRight,
  CircleDollarSign,
  EyeOff,
  Home,
  Landmark,
  Layers3,
  Menu,
  Network,
  Orbit,
  RefreshCw,
  Route,
  Settings,
  ShieldCheck,
  Sparkles,
  TrendingUp,
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

import styles from "./CarelApp.module.css";

const ZERO = BigInt(0);

type Tab = "home" | "agent" | "portfolio" | "activity" | "more";
type QuickAction = "shield" | "withdraw" | null;
type ExecutionMode = "shield" | "unshield";
type PortfolioRange = "1D" | "7D" | "30D" | "90D" | "1Y";
type PortfolioPoint = { ts: number; total: number };

function portfolioRangeMs(range: PortfolioRange) {
  if (range === "1D") return 86400000;
  if (range === "7D") return 7 * 86400000;
  if (range === "30D") return 30 * 86400000;
  if (range === "90D") return 90 * 86400000;
  return 365 * 86400000;
}

function PortfolioChart({ points }: { points: PortfolioPoint[] }) {
  if (points.length < 2) {
    return (
      <div className={styles.pfChartEmpty}>
        <Activity size={21} />
        <strong>Performance history is building</strong>
        <p>CAREL only plots balances actually observed in this browser session. No synthetic portfolio data is shown.</p>
      </div>
    );
  }

  const W = 720;
  const H = 220;
  const values = points.map((point) => point.total);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = Math.max(max - min, Math.max(max * 0.015, 0.000001));
  const low = min - spread * 0.3;
  const high = max + spread * 0.3;
  const firstTs = points[0].ts;
  const lastTs = points[points.length - 1].ts;
  const timeRange = Math.max(lastTs - firstTs, 1);

  const coords = points.map((point) => ({
    x: 8 + ((point.ts - firstTs) / timeRange) * (W - 16),
    y: H - 18 - ((point.total - low) / Math.max(high - low, 0.000001)) * (H - 36),
  }));

  const line = coords.map((point, index) => `${index ? "L" : "M"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(" ");
  const area = `${line} L ${coords[coords.length - 1].x.toFixed(2)} ${H} L ${coords[0].x.toFixed(2)} ${H} Z`;
  const delta = points[points.length - 1].total - points[0].total;
  const pct = points[0].total > 0 ? (delta / points[0].total) * 100 : 0;

  return (
    <div className={styles.pfChartWrap}>
      <div className={styles.pfChartStats}>
        <div><small>OBSERVED CHANGE</small><strong className={delta >= 0 ? styles.pfPositive : styles.pfNegative}>{delta >= 0 ? "+" : ""}{delta.toFixed(4)} STRK</strong></div>
        <span className={delta >= 0 ? styles.pfPositive : styles.pfNegative}>{delta >= 0 ? "+" : ""}{pct.toFixed(2)}%</span>
      </div>
      <svg className={styles.pfChart} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Observed portfolio performance">
        <defs><linearGradient id="carelPfArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="currentColor" stopOpacity="0.24"/><stop offset="100%" stopColor="currentColor" stopOpacity="0"/></linearGradient></defs>
        <line x1="0" y1="55" x2={W} y2="55" className={styles.pfGrid}/><line x1="0" y1="110" x2={W} y2="110" className={styles.pfGrid}/><line x1="0" y1="165" x2={W} y2="165" className={styles.pfGrid}/>
        <path d={area} fill="url(#carelPfArea)"/><path d={line} className={styles.pfLine}/>
        {coords.map((point, index) => <circle key={`${points[index].ts}-${index}`} cx={point.x} cy={point.y} r={index === coords.length - 1 ? 4 : 2} className={index === coords.length - 1 ? styles.pfDotActive : styles.pfDot}/>) }
      </svg>
      <div className={styles.pfAxis}><span>{new Date(points[0].ts).toLocaleDateString(undefined,{month:"short",day:"numeric"})}</span><span>Observed locally</span><span>{new Date(points[points.length-1].ts).toLocaleDateString(undefined,{month:"short",day:"numeric"})}</span></div>
    </div>
  );
}


function fmt(value: bigint | null) {
  return value === null ? "—" : `${formatUnits18(value)} STRK`;
}

function parseGoal(text: string): { goal: LiveGoal; target: string } | null {
  const normalized = text.trim().toLowerCase();
  const amount = normalized.match(/(\d+(?:\.\d+)?)/)?.[1];

  if (!amount) return null;

  if (
    normalized.includes("public") ||
    normalized.includes("withdraw") ||
    normalized.includes("unshield") ||
    normalized.includes("available")
  ) {
    return { goal: "target-public", target: amount };
  }

  if (
    normalized.includes("private") ||
    normalized.includes("shield") ||
    normalized.includes("privacy") ||
    normalized.includes("privasi")
  ) {
    return { goal: "target-private", target: amount };
  }

  return null;
}

export function CarelApp() {
  const wallet = useCarelTestnet();

  const [tab, setTab] = useState<Tab>("home");
  const [goalText, setGoalText] = useState("Keep at least 1 STRK private");
  const [planGoal, setPlanGoal] = useState<LiveGoal>("target-private");
  const [planTarget, setPlanTarget] = useState("1");
  const [planned, setPlanned] = useState(false);
  const [goalError, setGoalError] = useState<string | null>(null);
  const [executing, setExecuting] = useState(false);
  const [quickAction, setQuickAction] = useState<QuickAction>(null);
  const [quickAmount, setQuickAmount] = useState("1");
  const [executionMode, setExecutionMode] = useState<ExecutionMode>("shield");
  const [portfolioRange, setPortfolioRange] = useState<PortfolioRange>("30D");
  const [portfolioHistory, setPortfolioHistory] = useState<PortfolioPoint[]>([]);

  const isSepolia =
    wallet.chainId === constants.StarknetChainId.SN_SEPOLIA;

  useEffect(() => {
    if (
      wallet.connected &&
      isSepolia &&
      wallet.publicStrk === null &&
      !wallet.busy
    ) {
      void wallet.refreshPublicBalance();
    }
  }, [wallet.connected, wallet.publicStrk, wallet.busy, isSepolia]);

  const plan = useMemo(
    () =>
      buildLivePlan({
        goal: planGoal,
        targetText: planTarget,
        connected: wallet.connected,
        networkReady: isSepolia,
        strk20Capable: wallet.strk20Capable,
        publicStrk: wallet.publicStrk,
        privateStrk: wallet.privateStrk,
        privateRevealed: wallet.privateRevealed,
      }),
    [
      planGoal,
      planTarget,
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

  useEffect(() => {
    if (knownCapital === null) return;
    const total = Number(formatUnits18(knownCapital, 6));
    if (!Number.isFinite(total)) return;

    setPortfolioHistory((previous) => {
      let base = previous;
      if (base.length === 0) {
        try {
          const raw = sessionStorage.getItem("carel.portfolio.session.v1");
          const parsed = raw ? JSON.parse(raw) : [];
          if (Array.isArray(parsed)) {
            base = parsed.filter((item): item is PortfolioPoint => item && typeof item.ts === "number" && typeof item.total === "number");
          }
        } catch { base = []; }
      }

      const now = Date.now();
      const last = base[base.length - 1];
      if (last && Math.abs(last.total - total) <= 0.000001 && now - last.ts < 300000) return base;
      const next = [...base, { ts: now, total }].slice(-160);
      try { sessionStorage.setItem("carel.portfolio.session.v1", JSON.stringify(next)); } catch {}
      return next;
    });
  }, [knownCapital]);

  const visiblePortfolioHistory = useMemo(() => {
    const cutoff = Date.now() - portfolioRangeMs(portfolioRange);
    return portfolioHistory.filter((point) => point.ts >= cutoff);
  }, [portfolioHistory, portfolioRange]);

  const privateAmount = wallet.privateRevealed && wallet.privateStrk !== null ? Number(formatUnits18(wallet.privateStrk ?? ZERO, 6)) : null;
  const publicAmount = wallet.publicStrk !== null ? Number(formatUnits18(wallet.publicStrk, 6)) : null;
  const knownAmount = privateAmount !== null && publicAmount !== null ? privateAmount + publicAmount : null;
  const privateShare = knownAmount && knownAmount > 0 && privateAmount !== null ? (privateAmount / knownAmount) * 100 : null;
  const publicShare = privateShare !== null ? Math.max(0, 100 - privateShare) : null;

  const buildPlan = (source = goalText) => {
    const normalized = source.trim().toLowerCase();
    const amount = normalized.match(/(\d+(?:\.\d+)?)/)?.[1];
    const asksForProtocolCapability =
      /\b(swap|bridge|earn|borrow|stake|yield|lend)\b/.test(normalized);

    if (asksForProtocolCapability) {
      setGoalError(
        "Swap, Bridge, Earn and Borrow are CAREL route capabilities. Their live protocol adapters are not enabled in this testnet build yet, so CAREL will not pretend to execute them.",
      );
      setPlanned(false);
      return;
    }

    if (!amount) {
      setGoalError(
        executionMode === "shield"
          ? "Add a STRK amount for the Shield target. Example: Keep at least 1 STRK private."
          : "Add a STRK amount for the Unshield target. Example: Keep at least 1 STRK public.",
      );
      setPlanned(false);
      return;
    }

    setGoalError(null);
    setPlanGoal(executionMode === "shield" ? "target-private" : "target-public");
    setPlanTarget(amount);
    setPlanned(true);
  };

  const toggleExecutionMode = () => {
    const next: ExecutionMode =
      executionMode === "shield" ? "unshield" : "shield";

    setExecutionMode(next);
    setPlanGoal(next === "shield" ? "target-private" : "target-public");
    setGoalText(
      next === "shield"
        ? "Keep at least 1 STRK private"
        : "Keep at least 1 STRK public",
    );
    setGoalError(null);
    setPlanned(false);
  };

  const openAgent = (prompt: string, autoPlan = false) => {
    const parsed = parseGoal(prompt);
    const nextMode: ExecutionMode =
      parsed?.goal === "target-public" ? "unshield" : "shield";

    setExecutionMode(nextMode);
    setGoalText(prompt);
    setGoalError(null);
    setTab("agent");

    if (autoPlan && parsed) {
      setPlanGoal(parsed.goal);
      setPlanTarget(parsed.target);
      setPlanned(true);
      return;
    }

    setPlanGoal(nextMode === "shield" ? "target-private" : "target-public");
    setPlanned(false);
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

  const executeQuickAction = async () => {
    if (!quickAction || !quickAmount) return;

    setExecuting(true);
    try {
      if (quickAction === "shield") {
        await wallet.shield(quickAmount);
      } else {
        await wallet.unshield(quickAmount);
      }
    } finally {
      setExecuting(false);
    }
  };

  const renderHome = () => (
    <div className={styles.page} key="home">
      <section className={styles.homeHero}>
        <div className={styles.heroCopy}>
          <span className={styles.eyebrow}>
            <Sparkles size={13} />
            AGENTIC PRIVATE DEFI
          </span>
          <h1>
            Set the goal.
            <span>Keep control.</span>
          </h1>
          <p>
            CAREL plans the route, checks privacy and risk, then waits for your
            approval before execution.
          </p>

          <button
            type="button"
            className={styles.heroCta}
            onClick={() => setTab("agent")}
          >
            Ask CAREL
            <ChevronRight size={16} />
          </button>
        </div>

        <div className={styles.agentCore} aria-hidden="true">
          <div className={styles.coreRingA} />
          <div className={styles.coreRingB} />
          <div className={styles.coreRingC} />
          <div className={styles.coreGlow} />
          <div className={styles.coreBadge}>
            <Orbit size={26} />
            <strong>CAREL</strong>
            <small>PRIVATE AGENT</small>
          </div>
        </div>
      </section>

      <section className={styles.portfolioCard}>
        <div className={styles.cardTop}>
          <div>
            <small>KNOWN PORTFOLIO</small>
            <strong>
              {knownCapital === null ? "Private by default" : fmt(knownCapital)}
            </strong>
          </div>

          <button
            type="button"
            className={styles.textButton}
            onClick={() => setTab("portfolio")}
          >
            View portfolio
            <ChevronRight size={14} />
          </button>
        </div>

        <div className={styles.balanceGrid}>
          <div>
            <span><EyeOff size={14} /> Private</span>
            <strong>
              {wallet.privateRevealed
                ? fmt(wallet.privateStrk ?? ZERO)
                : "••••••"}
            </strong>
            <button
              type="button"
              disabled={!wallet.connected || !isSepolia || wallet.busy}
              onClick={() => void wallet.revealPrivateBalance()}
            >
              {wallet.privateRevealed ? "Refresh" : "Reveal"}
            </button>
          </div>

          <div>
            <span><WalletCards size={14} /> Public</span>
            <strong>{fmt(wallet.publicStrk)}</strong>
            <button
              type="button"
              disabled={!wallet.connected || wallet.busy}
              onClick={() => void wallet.refreshPublicBalance()}
            >
              {wallet.publicStrk === null ? "Load" : "Refresh"}
            </button>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <div>
            <small>QUICK ACCESS</small>
            <h2>Start with CAREL</h2>
          </div>
          <Route size={18} />
        </div>

        <div className={styles.quickGrid}>
          <button type="button" onClick={() => openAgent("Keep at least 10 STRK private", true)}>
            <span><ShieldCheck size={17} /></span>
            <strong>Private goal</strong>
            <small>Agent plans the minimum move</small>
          </button>

          <button type="button" onClick={() => setTab("portfolio")}>
            <span><Layers3 size={17} /></span>
            <strong>Portfolio</strong>
            <small>Public + private capital</small>
          </button>

          <button type="button" onClick={() => setTab("more")}>
            <span><CircleDollarSign size={17} /></span>
            <strong>Agent modes</strong>
            <small>Shield / Unshield + route capabilities</small>
          </button>

          <button type="button" onClick={() => setTab("activity")}>
            <span><Activity size={17} /></span>
            <strong>Activity</strong>
            <small>Inspect executions</small>
          </button>
        </div>
      </section>

      <section className={styles.activePlanCard}>
        <div>
          <small>ACTIVE MANDATE</small>
          <h2>{planned ? plan.title : "No active plan yet"}</h2>
          <p>
            {planned
              ? plan.reason
              : "Create a goal and CAREL will turn it into an inspectable route."}
          </p>
        </div>

        <button type="button" onClick={() => setTab("agent")}>
          {planned ? "Review plan" : "Create goal"}
          <ChevronRight size={15} />
        </button>
      </section>

      <section className={styles.recentCard}>
        <div className={styles.sectionHead}>
          <div>
            <small>RECENT</small>
            <h2>Activity</h2>
          </div>
          <button type="button" onClick={() => setTab("activity")}>
            View all
          </button>
        </div>

        {wallet.tx.kind === "idle" ? (
          <div className={styles.emptyState}>
            <Activity size={18} />
            <span>No execution in this session.</span>
          </div>
        ) : (
          <a
            className={styles.txRow}
            href={`${SEPOLIA_EXPLORER_TX}${wallet.tx.hash}`}
            target="_blank"
            rel="noreferrer"
          >
            <span className={styles.txPulse} />
            <div>
              <strong>{wallet.tx.label}</strong>
              <small>{wallet.tx.kind}</small>
            </div>
            <ChevronRight size={15} />
          </a>
        )}
      </section>
    </div>
  );

  const renderAgent = () => (
    <div className={styles.page} key="agent">
      <section className={styles.agentHeroV6}>
        <span className={styles.eyebrow}>
          <Bot size={13} />
          CAREL AGENT
        </span>

        <h1>
          Choose the boundary.
          <span>CAREL builds the route.</span>
        </h1>

        <p>
          Shield and Unshield are one execution mode switch. Swap, Bridge,
          Earn and Borrow remain available to the agent in either mode.
        </p>
      </section>

      <section className={styles.modeCardV6}>
        <div className={styles.modeCardHeadV6}>
          <div>
            <small>EXECUTION MODE</small>
            <strong>Tap to switch the privacy boundary</strong>
          </div>
          <span className={styles.modeLiveV6}>
            <i />
            TESTNET
          </span>
        </div>

        <button
          type="button"
          className={`${styles.modeSwitchV6} ${
            executionMode === "unshield" ? styles.modeSwitchUnshieldV6 : ""
          }`}
          onClick={toggleExecutionMode}
          aria-label={`Switch from ${executionMode} mode`}
        >
          <span className={styles.modeSwitchIconV6}>
            {executionMode === "shield" ? (
              <ArrowDownToLine size={25} />
            ) : (
              <ArrowUpFromLine size={25} />
            )}
          </span>

          <span className={styles.modeSwitchCopyV6}>
            <small>
              {executionMode === "shield" ? "PRIVATE ENTRY" : "PUBLIC EXIT"}
            </small>
            <strong>
              {executionMode === "shield" ? "SHIELD" : "UNSHIELD"}
            </strong>
            <em>
              {executionMode === "shield"
                ? "Public STRK → STRK20 Privacy Pool"
                : "STRK20 Privacy Pool → Public Starknet"}
            </em>
          </span>

          <span className={styles.modeFlipV6}>
            <ArrowLeftRight size={17} />
            TAP
          </span>
        </button>

        <div className={styles.boundaryTrackV6}>
          <span className={executionMode === "shield" ? styles.boundaryActiveV6 : ""}>
            PUBLIC WALLET
          </span>
          <div>
            <i />
            <ShieldCheck size={15} />
            <i />
          </div>
          <span className={executionMode === "unshield" ? styles.boundaryActiveV6 : ""}>
            PRIVACY POOL
          </span>
        </div>

        <div className={styles.capabilityHeadV6}>
          <div>
            <small>AGENT CAPABILITIES</small>
            <strong>Same tools. Different boundary.</strong>
          </div>
          <Route size={17} />
        </div>

        <div className={styles.capabilityGridV6}>
          <article>
            <span><ArrowLeftRight size={18} /></span>
            <div><strong>Swap</strong><small>Route & price execution</small></div>
          </article>

          <article>
            <span><Network size={18} /></span>
            <div><strong>Bridge</strong><small>Cross-network routing</small></div>
          </article>

          <article>
            <span><TrendingUp size={18} /></span>
            <div><strong>Earn</strong><small>Yield & stake routes</small></div>
          </article>

          <article>
            <span><Landmark size={18} /></span>
            <div><strong>Borrow</strong><small>Collateral & debt routes</small></div>
          </article>
        </div>

        <div className={styles.adapterNoticeV6}>
          <Zap size={14} />
          <span>
            Live now: STRK20 Shield / Unshield boundary. Protocol capability
            adapters connect to this same agent route when enabled.
          </span>
        </div>
      </section>

      <section className={styles.goalComposerV6}>
        <div className={styles.goalComposerHeadV6}>
          <div>
            <small>OUTCOME</small>
            <h2>What should CAREL achieve?</h2>
          </div>
          <span>
            {executionMode === "shield" ? "SHIELD MODE" : "UNSHIELD MODE"}
          </span>
        </div>

        <textarea
          value={goalText}
          onChange={(event) => {
            setGoalText(event.target.value);
            setPlanned(false);
            setGoalError(null);
          }}
          placeholder={
            executionMode === "shield"
              ? "Example: Keep at least 1 STRK private"
              : "Example: Keep at least 1 STRK public"
          }
        />

        <div className={styles.goalChipsV6}>
          {executionMode === "shield" ? (
            <>
              <button
                type="button"
                onClick={() => {
                  setGoalText("Keep at least 1 STRK private");
                  setPlanned(false);
                }}
              >
                1 STRK private
              </button>
              <button
                type="button"
                onClick={() => {
                  setGoalText("Keep at least 10 STRK private");
                  setPlanned(false);
                }}
              >
                10 STRK private
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => {
                  setGoalText("Keep at least 1 STRK public");
                  setPlanned(false);
                }}
              >
                1 STRK public
              </button>
              <button
                type="button"
                onClick={() => {
                  setGoalText("Keep at least 5 STRK public");
                  setPlanned(false);
                }}
              >
                5 STRK public
              </button>
            </>
          )}
        </div>

        <button
          type="button"
          className={styles.primaryButton}
          onClick={() => buildPlan()}
        >
          <Sparkles size={17} />
          Build controlled plan
        </button>
      </section>

      {goalError && (
        <div className={styles.agentNoticeV6}>
          <Route size={16} />
          <span>{goalError}</span>
        </div>
      )}

      <section className={styles.agentPlanV6}>
        <div className={styles.agentPlanHeadV6}>
          <div>
            <small>AGENT PLAN</small>
            <h2>{planned ? plan.title : "Waiting for a goal"}</h2>
          </div>

          <span
            className={`${styles.planStateV6} ${
              planned && plan.status === "ready" ? styles.planStateReadyV6 : ""
            }`}
          >
            <i />
            {planned ? plan.status.replaceAll("-", " ") : "idle"}
          </span>
        </div>

        {!planned ? (
          <div className={styles.agentPlanEmptyV6}>
            <div><Orbit size={25} /></div>
            <strong>
              {executionMode === "shield"
                ? "Shield route is ready to plan"
                : "Unshield route is ready to plan"}
            </strong>
            <p>
              CAREL will show the boundary, minimum delta and approval step
              before any live transaction.
            </p>
          </div>
        ) : (
          <>
            <div className={styles.routePreviewV6}>
              <span>
                {executionMode === "shield" ? "PUBLIC STRK" : "STRK20 PRIVATE"}
              </span>
              <div>
                <i />
                <ChevronRight size={15} />
                <i />
              </div>
              <strong>
                {executionMode === "shield" ? "PRIVACY POOL" : "PUBLIC STARKNET"}
              </strong>
            </div>

            <div className={styles.planStepsV6}>
              <article>
                <span>01</span>
                <div><strong>Observe</strong><small>Read allowed wallet state</small></div>
                <Check size={15} />
              </article>

              <article>
                <span>02</span>
                <div><strong>Plan</strong><small>Calculate the minimum required delta</small></div>
                <Check size={15} />
              </article>

              <article>
                <span>03</span>
                <div><strong>Approve</strong><small>User confirms before execution</small></div>
                <ShieldCheck size={15} />
              </article>
            </div>

            <div className={styles.planReasonV6}>
              <small>WHY THIS ROUTE</small>
              <p>{plan.reason}</p>
            </div>

            {plan.status === "needs-private-state" && (
              <button
                type="button"
                className={styles.secondaryButton}
                disabled={!wallet.connected || !isSepolia || wallet.busy}
                onClick={() => void wallet.revealPrivateBalance()}
              >
                <EyeOff size={16} />
                Reveal private balance
              </button>
            )}

            {plan.status === "ready" && (
              <button
                type="button"
                className={styles.primaryButton}
                disabled={executing || wallet.busy}
                onClick={() => void executePlan()}
              >
                <Zap size={17} />
                {executing
                  ? "Executing…"
                  : executionMode === "shield"
                    ? "Approve & Shield"
                    : "Approve & Unshield"}
              </button>
            )}

            {plan.status === "satisfied" && (
              <div className={styles.planSatisfiedV6}>
                <Check size={16} />
                Target already satisfied. No transaction required.
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );

  const renderPortfolio = () => (
    <div className={styles.page} key="portfolio">
      <section className={styles.pfHeader}>
        <div>
          <span className={styles.eyebrow}><Layers3 size={13}/> PORTFOLIO</span>
          <h1>Your capital, clearly.</h1>
          <p>Real wallet state, explicit privacy boundaries, and observed performance without fabricated market data.</p>
        </div>
        <span className={styles.pfLive}><i/>{wallet.connected ? "LIVE WALLET" : "OFFLINE"}</span>
      </section>

      <section className={styles.pfOverview}>
        <div><small>KNOWN CAPITAL</small><strong>{knownCapital === null ? "Private by default" : fmt(knownCapital)}</strong><span>{wallet.privateRevealed ? "Public + user-revealed private STRK" : "Reveal private state to calculate total capital"}</span></div>
        <div className={styles.pfActions}>
          <button type="button" disabled={!wallet.connected || wallet.busy} onClick={() => void wallet.refreshPublicBalance()}><RefreshCw size={14}/>Refresh</button>
          <button type="button" disabled={!wallet.connected || !isSepolia || wallet.busy} onClick={() => void wallet.revealPrivateBalance()}><EyeOff size={14}/>{wallet.privateRevealed ? "Refresh private" : "Reveal private"}</button>
        </div>
      </section>

      <section className={styles.pfPerformance}>
        <div className={styles.pfSectionHead}><div><small>PERFORMANCE</small><h2>Observed portfolio history</h2></div><span>SESSION LOCAL</span></div>
        <div className={styles.pfRanges}>{(["1D","7D","30D","90D","1Y"] as PortfolioRange[]).map((range) => <button type="button" key={range} className={portfolioRange === range ? styles.pfRangeActive : ""} onClick={() => setPortfolioRange(range)}>{range}</button>)}</div>
        <PortfolioChart points={visiblePortfolioHistory}/>
      </section>

      <section className={styles.pfCard}>
        <div className={styles.sectionHead}><div><small>CAPITAL BREAKDOWN</small><h2>Public wallet vs Privacy Pool</h2></div><CircleDollarSign size={18}/></div>
        {privateShare !== null && publicShare !== null ? <>
          <div className={styles.pfAllocation}><span className={styles.pfPrivate} style={{width:`${privateShare}%`}}/><span className={styles.pfPublic} style={{width:`${publicShare}%`}}/></div>
          <div className={styles.pfLegend}><div><span><i className={styles.pfPrivateDot}/>Private</span><strong>{privateAmount?.toFixed(4)} STRK</strong><small>{privateShare.toFixed(1)}%</small></div><div><span><i className={styles.pfPublicDot}/>Public</span><strong>{publicAmount?.toFixed(4)} STRK</strong><small>{publicShare.toFixed(1)}%</small></div></div>
        </> : <div className={styles.pfLocked}><EyeOff size={18}/><div><strong>Private allocation is hidden</strong><p>CAREL will not infer your private balance. Reveal it explicitly to calculate allocation.</p></div></div>}
      </section>

      <section className={styles.pfCard}>
        <div className={styles.sectionHead}><div><small>POSITIONS</small><h2>Current capital</h2></div><Layers3 size={18}/></div>
        <div className={styles.pfPositions}>
          <article><span className={styles.pfPosIcon}><EyeOff size={17}/></span><div><strong>STRK Privacy Pool</strong><small>Shielded STRK20 balance</small></div><div className={styles.pfPosValue}><strong>{wallet.privateRevealed ? fmt(wallet.privateStrk ?? ZERO) : "Hidden"}</strong><small>PRIVATE</small></div></article>
          <article><span className={styles.pfPosIcon}><WalletCards size={17}/></span><div><strong>STRK Public</strong><small>Connected Starknet wallet</small></div><div className={styles.pfPosValue}><strong>{fmt(wallet.publicStrk)}</strong><small>PUBLIC</small></div></article>
        </div>
        <div className={styles.pfProtocolEmpty}><Route size={16}/><div><strong>No live protocol positions yet</strong><p>Nostra, Vesu, staking or LP positions appear only after a real adapter reports them.</p></div></div>
      </section>

      <section className={styles.pfInsight}>
        <span className={styles.pfInsightIcon}><Orbit size={19}/></span>
        <div><small>CAREL INSIGHT</small><strong>{!wallet.connected ? "Connect your wallet to start portfolio analysis." : !wallet.privateRevealed ? "Your private state is hidden — CAREL will not guess it." : knownAmount === 0 ? "No known capital is available to analyze yet." : "Your wallet state is ready for a controlled strategy review."}</strong><p>Recommendations should come from real protocol data, risk rules and wallet state — never decorative APY numbers.</p></div>
        <button type="button" onClick={() => setTab("agent")}>Ask CAREL<ChevronRight size={14}/></button>
      </section>

      <section className={styles.pfCard}>
        <div className={styles.sectionHead}><div><small>RECENT ACTIVITY</small><h2>Latest execution</h2></div><button type="button" onClick={() => setTab("activity")}>View all</button></div>
        {wallet.tx.kind === "idle" ? <div className={styles.pfActivityEmpty}><Activity size={17}/><span>No CAREL execution in this session.</span></div> : <a className={styles.pfTx} href={`${SEPOLIA_EXPLORER_TX}${wallet.tx.hash}`} target="_blank" rel="noreferrer"><span className={styles.txPulse}/><div><strong>{wallet.tx.label}</strong><small>{wallet.tx.kind}</small></div><ChevronRight size={15}/></a>}
      </section>
    </div>
  );
  const renderActivity = () => (
    <div className={styles.page} key="activity">
      <section className={styles.pageTitle}>
        <span className={styles.eyebrow}>
          <Activity size={13} />
          EXECUTION LOG
        </span>
        <h1>Everything inspectable.</h1>
        <p>
          Approved actions and transaction state stay visible instead of
          disappearing behind automation.
        </p>
      </section>

      <section className={styles.timelineCard}>
        {wallet.tx.kind === "idle" ? (
          <div className={styles.activityEmpty}>
            <span className={styles.timelinePulse} />
            <strong>No CAREL execution yet</strong>
            <p>Approved actions in this session will appear here.</p>
          </div>
        ) : (
          <a
            className={styles.activityItem}
            href={`${SEPOLIA_EXPLORER_TX}${wallet.tx.hash}`}
            target="_blank"
            rel="noreferrer"
          >
            <span className={styles.timelinePulse} />
            <div>
              <small>LATEST EXECUTION</small>
              <strong>{wallet.tx.label}</strong>
              <p>{wallet.tx.kind}</p>
            </div>
            <ChevronRight size={16} />
          </a>
        )}
      </section>

      <section className={styles.auditGrid}>
        <div><small>01 / AUTHORITY</small><strong>Approval before execution</strong></div>
        <div><small>02 / PRIVACY</small><strong>Boundary shown before action</strong></div>
        <div><small>03 / CONTROL</small><strong>No unrestricted automation</strong></div>
      </section>
    </div>
  );

  const renderMore = () => (
    <div className={styles.page} key="more">
      <section className={styles.moreHeroV6}>
        <span className={styles.eyebrow}>
          <Menu size={13} />
          CONTROL CENTER
        </span>
        <h1>
          Configure CAREL.
          <span>Do not duplicate the Agent.</span>
        </h1>
        <p>
          Swap, Bridge, Earn and Borrow live inside the Agent route.
          More is reserved for privacy, permissions, risk and wallet state.
        </p>
      </section>

      <section className={styles.moreModeCardV6}>
        <div>
          <small>CURRENT AGENT MODE</small>
          <strong>{executionMode === "shield" ? "Shield" : "Unshield"}</strong>
          <span>
            {executionMode === "shield"
              ? "Public STRK → STRK20 Privacy Pool"
              : "STRK20 Privacy Pool → Public Starknet"}
          </span>
        </div>

        <button type="button" onClick={() => setTab("agent")}>
          Open Agent
          <ChevronRight size={15} />
        </button>
      </section>

      <section className={styles.moreControlGridV6}>
        <button type="button" onClick={() => setTab("portfolio")}>
          <span><EyeOff size={19} /></span>
          <div>
            <strong>Privacy & balances</strong>
            <small>Reveal policy and STRK20 private state</small>
          </div>
          <ChevronRight size={16} />
        </button>

        <button type="button" onClick={() => setTab("agent")}>
          <span><Bot size={19} /></span>
          <div>
            <strong>Agent execution</strong>
            <small>Shield / Unshield mode and approval flow</small>
          </div>
          <ChevronRight size={16} />
        </button>

        <article>
          <span><ShieldCheck size={19} /></span>
          <div>
            <strong>Risk controls</strong>
            <small>Approval remains required before irreversible execution</small>
          </div>
          <em>ENFORCED</em>
        </article>

        <article>
          <span><Settings size={19} /></span>
          <div>
            <strong>Transaction policy</strong>
            <small>No unrestricted automation in this testnet build</small>
          </div>
          <em>CONTROLLED</em>
        </article>
      </section>

      <section className={styles.statusPanelV6}>
        <div className={styles.statusPanelHeadV6}>
          <div>
            <small>TESTNET STATUS</small>
            <h2>Execution boundary</h2>
          </div>
          <Network size={18} />
        </div>

        <div className={styles.statusRowsV6}>
          <div>
            <span>Wallet</span>
            <strong>{wallet.connected ? "Connected" : "Disconnected"}</strong>
          </div>
          <div>
            <span>Network</span>
            <strong>{isSepolia ? "Starknet Sepolia" : "Not ready"}</strong>
          </div>
          <div>
            <span>STRK20</span>
            <strong>{wallet.strk20Capable ? "Available" : "Unavailable"}</strong>
          </div>
          <div>
            <span>Live boundary</span>
            <strong>Shield ↔ Unshield</strong>
          </div>
        </div>
      </section>
    </div>
  );

  return (
    <div className={styles.app}>
      <div className={styles.auroraA} />
      <div className={styles.auroraB} />
      <div className={styles.gridNoise} />

      <header className={styles.header}>
        <button
          type="button"
          className={styles.brand}
          onClick={() => setTab("home")}
          aria-label="Go to CAREL home"
        >
          <span><Orbit size={18} /></span>
          <div>
            <strong>CAREL</strong>
            <small>BY DXJ LABS</small>
          </div>
        </button>

        <WalletStatusButton />
      </header>

      <main className={styles.main}>
        {tab === "home" && renderHome()}
        {tab === "agent" && renderAgent()}
        {tab === "portfolio" && renderPortfolio()}
        {tab === "activity" && renderActivity()}
        {tab === "more" && renderMore()}

        {wallet.error && (
          <div className={styles.pfError}>
            <div><small>WALLET DATA</small><strong>Unable to load wallet data</strong><p>CAREL could not reach the wallet or RPC. No transaction was sent.</p></div>
            <button type="button" disabled={!wallet.connected || wallet.busy} onClick={() => void wallet.refreshPublicBalance()}><RefreshCw size={14}/>Retry</button>
          </div>
        )}
      </main>

      <nav className={styles.nav} aria-label="Primary navigation">
        <button
          type="button"
          className={tab === "home" ? styles.navActive : ""}
          onClick={() => setTab("home")}
        >
          <Home size={18} />
          <span>Home</span>
        </button>

        <button
          type="button"
          className={tab === "agent" ? styles.navActive : ""}
          onClick={() => setTab("agent")}
        >
          <Bot size={18} />
          <span>Agent</span>
        </button>

        <button
          type="button"
          className={tab === "portfolio" ? styles.navActive : ""}
          onClick={() => setTab("portfolio")}
        >
          <Layers3 size={18} />
          <span>Portfolio</span>
        </button>

        <button
          type="button"
          className={tab === "activity" ? styles.navActive : ""}
          onClick={() => setTab("activity")}
        >
          <Activity size={18} />
          <span>Activity</span>
        </button>

        <button
          type="button"
          className={tab === "more" ? styles.navActive : ""}
          onClick={() => setTab("more")}
        >
          <Menu size={18} />
          <span>More</span>
        </button>
      </nav>
    </div>
  );
}
