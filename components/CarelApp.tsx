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
    const parsed = parseGoal(source);

    if (!parsed) {
      setGoalError(
        "Live testnet execution currently supports STRK privacy targets. CAREL can still stage other DeFi goals as plans without pretending they are live.",
      );
      setPlanned(false);
      return;
    }

    setGoalError(null);
    setPlanGoal(parsed.goal);
    setPlanTarget(parsed.target);
    setPlanned(true);
  };

  const openAgent = (prompt: string, autoPlan = false) => {
    setGoalText(prompt);
    setGoalError(null);
    setTab("agent");

    if (autoPlan) {
      const parsed = parseGoal(prompt);
      if (parsed) {
        setPlanGoal(parsed.goal);
        setPlanTarget(parsed.target);
        setPlanned(true);
        return;
      }
    }

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
            <h2>Most useful actions</h2>
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
            <strong>Tools</strong>
            <small>Swap, earn, bridge & more</small>
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
      <section className={styles.pageTitle}>
        <span className={styles.eyebrow}>
          <Bot size={13} />
          CAREL AGENT
        </span>
        <h1>Tell CAREL the outcome.</h1>
        <p>
          Goal → plan → privacy/risk check → approval → execution. The user stays
          in control at every irreversible step.
        </p>
      </section>

      <section className={styles.commandCard}>
        <div className={styles.commandGlow} />

        <textarea
          value={goalText}
          onChange={(event) => {
            setGoalText(event.target.value);
            setPlanned(false);
            setGoalError(null);
          }}
          placeholder="e.g. Keep at least 5 STRK private"
          aria-label="Goal for CAREL"
        />

        <div className={styles.promptChips}>
          <button type="button" onClick={() => setGoalText("Keep at least 10 STRK private")}>
            10 STRK private
          </button>
          <button type="button" onClick={() => setGoalText("Keep at least 5 STRK public")}>
            5 STRK public
          </button>
          <button type="button" onClick={() => setGoalText("Find a low-risk yield strategy for 10 STRK")}>
            Low-risk yield
          </button>
        </div>

        <button
          type="button"
          className={styles.primaryButton}
          onClick={() => buildPlan()}
        >
          <Sparkles size={16} />
          Build controlled plan
        </button>
      </section>

      {goalError && <div className={styles.errorCard}>{goalError}</div>}

      <section className={`${styles.planCard} ${planned ? styles.planLive : ""}`}>
        <div className={styles.sectionHead}>
          <div>
            <small>AGENT PLAN</small>
            <h2>{planned ? plan.title : "Waiting for a goal"}</h2>
          </div>
          <span className={styles.planStatus}>
            <i />
            {!planned ? "IDLE" : plan.status.toUpperCase()}
          </span>
        </div>

        {!planned ? (
          <div className={styles.planEmpty}>
            <div className={styles.miniCore}>
              <Orbit size={20} />
            </div>
            <p>
              Your route, privacy boundary and approval step will appear here.
            </p>
          </div>
        ) : (
          <>
            <div className={styles.flowRail}>
              <div><span>01</span><strong>Observe</strong><small>Wallet state</small></div>
              <i />
              <div><span>02</span><strong>Plan</strong><small>Minimum route</small></div>
              <i />
              <div><span>03</span><strong>Approve</strong><small>User control</small></div>
            </div>

            <div className={styles.planReason}>
              <ShieldCheck size={17} />
              <p>{plan.reason}</p>
            </div>

            {plan.status === "needs-private-state" && (
              <button
                type="button"
                className={styles.secondaryButton}
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
                className={styles.primaryButton}
                disabled={wallet.busy || executing}
                onClick={() => void executePlan()}
              >
                {executing || wallet.busy ? (
                  <RefreshCw size={15} className={styles.spin} />
                ) : (
                  <Zap size={15} />
                )}
                {executing || wallet.busy
                  ? "Waiting for Ready…"
                  : "Approve & execute"}
              </button>
            )}

            {plan.status === "satisfied" && (
              <div className={styles.successNote}>
                <Check size={15} />
                Target already satisfied. No funds move.
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
        <div className={styles.sectionHead}><div><small>CAPITAL BREAKDOWN</small><h2>Public vs private</h2></div><CircleDollarSign size={18}/></div>
        {privateShare !== null && publicShare !== null ? <>
          <div className={styles.pfAllocation}><span className={styles.pfPrivate} style={{width:`${privateShare}%`}}/><span className={styles.pfPublic} style={{width:`${publicShare}%`}}/></div>
          <div className={styles.pfLegend}><div><span><i className={styles.pfPrivateDot}/>Private</span><strong>{privateAmount?.toFixed(4)} STRK</strong><small>{privateShare.toFixed(1)}%</small></div><div><span><i className={styles.pfPublicDot}/>Public</span><strong>{publicAmount?.toFixed(4)} STRK</strong><small>{publicShare.toFixed(1)}%</small></div></div>
        </> : <div className={styles.pfLocked}><EyeOff size={18}/><div><strong>Private allocation is hidden</strong><p>CAREL will not infer your private balance. Reveal it explicitly to calculate allocation.</p></div></div>}
      </section>

      <section className={styles.pfCard}>
        <div className={styles.sectionHead}><div><small>POSITIONS</small><h2>Current capital</h2></div><Layers3 size={18}/></div>
        <div className={styles.pfPositions}>
          <article><span className={styles.pfPosIcon}><EyeOff size={17}/></span><div><strong>STRK Private</strong><small>STRK20 private balance</small></div><div className={styles.pfPosValue}><strong>{wallet.privateRevealed ? fmt(wallet.privateStrk ?? ZERO) : "Hidden"}</strong><small>PRIVATE</small></div></article>
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
      <section className={styles.pageTitle}>
        <span className={styles.eyebrow}>
          <Menu size={13} />
          TOOLS & CONTROL
        </span>
        <h1>Everything else lives here.</h1>
        <p>
          DeFi tools support the agent. They are not the product identity.
        </p>
      </section>

      <section className={styles.toolGrid}>
        <button type="button" onClick={() => openAgent("Plan the best route to swap 10 STRK with controlled risk")}>
          <span><ArrowLeftRight size={18} /></span>
          <div><strong>Swap</strong><small>Route, fees and price impact</small></div>
          <ChevronRight size={15} />
        </button>

        <button type="button" onClick={() => openAgent("Plan a Starknet bridge route for 10 STRK")}>
          <span><Network size={18} /></span>
          <div><strong>Bridge</strong><small>Route, cost and destination</small></div>
          <ChevronRight size={15} />
        </button>

        <button type="button" onClick={() => openAgent("Find a low-risk yield strategy for 10 STRK")}>
          <span><TrendingUp size={18} /></span>
          <div><strong>Earn</strong><small>Yield, lockup and protocol risk</small></div>
          <ChevronRight size={15} />
        </button>

        <button type="button" onClick={() => openAgent("Plan a conservative borrow strategy with safe health factor")}>
          <span><Landmark size={18} /></span>
          <div><strong>Borrow</strong><small>Collateral and health factor</small></div>
          <ChevronRight size={15} />
        </button>

        <button
          type="button"
          className={quickAction === "shield" ? styles.toolActive : ""}
          onClick={() => setQuickAction(quickAction === "shield" ? null : "shield")}
        >
          <span><ArrowDownToLine size={18} /></span>
          <div><strong>Shield</strong><small>Public STRK → private notes</small></div>
          <em>LIVE</em>
        </button>

        <button
          type="button"
          className={quickAction === "withdraw" ? styles.toolActive : ""}
          onClick={() => setQuickAction(quickAction === "withdraw" ? null : "withdraw")}
        >
          <span><ArrowUpFromLine size={18} /></span>
          <div><strong>Withdraw</strong><small>Private notes → public wallet</small></div>
          <em>LIVE</em>
        </button>

        <button type="button" onClick={() => setTab("portfolio")}>
          <span><EyeOff size={18} /></span>
          <div><strong>Privacy</strong><small>Reveal and inspect private state</small></div>
          <ChevronRight size={15} />
        </button>

        <button type="button" onClick={() => setTab("portfolio")}>
          <span><Settings size={18} /></span>
          <div><strong>Wallet & network</strong><small>Connection and network state</small></div>
          <ChevronRight size={15} />
        </button>
      </section>

      {quickAction && (
        <section className={styles.executionSheet}>
          <div className={styles.sectionHead}>
            <div>
              <small>LIVE TESTNET ACTION</small>
              <h2>{quickAction === "shield" ? "Shield STRK" : "Withdraw STRK"}</h2>
            </div>
            <ShieldCheck size={18} />
          </div>

          <div className={styles.amountField}>
            <input
              value={quickAmount}
              inputMode="decimal"
              onChange={(event) =>
                setQuickAmount(event.target.value.replace(/[^0-9.]/g, ""))
              }
              aria-label={`${quickAction} amount`}
            />
            <b>STRK</b>
          </div>

          <button
            type="button"
            className={styles.primaryButton}
            disabled={wallet.busy || executing}
            onClick={() => void executeQuickAction()}
          >
            {executing || wallet.busy ? (
              <RefreshCw size={15} className={styles.spin} />
            ) : quickAction === "shield" ? (
              <ArrowDownToLine size={15} />
            ) : (
              <ArrowUpFromLine size={15} />
            )}
            {executing || wallet.busy
              ? "Waiting for wallet…"
              : `Approve ${quickAction === "shield" ? "shield" : "withdraw"}`}
          </button>
        </section>
      )}

      <section className={styles.statusCard}>
        <div>
          <span><WalletCards size={15} /> Wallet</span>
          <strong>{wallet.connected ? "Connected" : "Disconnected"}</strong>
        </div>
        <div>
          <span><Network size={15} /> Network</span>
          <strong>{isSepolia ? "Sepolia" : "Not ready"}</strong>
        </div>
        <div>
          <span><ShieldCheck size={15} /> STRK20</span>
          <strong>{wallet.strk20Capable ? "Supported" : "Unavailable"}</strong>
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
