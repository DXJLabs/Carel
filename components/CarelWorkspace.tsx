"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Activity, ArrowDownToLine, ArrowLeft, ArrowLeftRight, ArrowRight,
  ArrowUpFromLine, ArrowUpRight, Bot, Check, ChevronDown, ChevronRight,
  Eye, EyeOff, Home, Landmark, Layers3, LoaderCircle, LogOut, Moon,
  Network, Orbit, RefreshCw, Settings, ShieldCheck, ShieldOff,
  SlidersHorizontal, Sparkles, TrendingUp, WalletCards, X,
} from "lucide-react";
import { constants } from "starknet";
import { useCarelTestnet } from "@/components/testnet/Strk20Testnet";
import { buildLivePlan } from "@/lib/agent/livePlanner";
import { formatUnits18, parseUnits18 } from "@/lib/strk20/units";
import { SEPOLIA_EXPLORER_TX } from "@/lib/strk20/config";
import { CarelOrbit } from "./CarelOrbit";
import styles from "./CarelWorkspace.module.css";

type Tab = "home" | "agent" | "portfolio" | "activity" | "settings";
type Mode = "shield" | "unshield";
type Tool = "Swap" | "Bridge" | "Earn" | "Borrow";
type Period = "1D" | "7D" | "30D";
type Execution = { hash: string; label: string; status: "pending" | "submitted" | "confirmed"; ts: number };
type Observation = { ts: number; total: number };
const ZERO = BigInt(0);
const TABS = [
  { id: "home", label: "Home", Icon: Home },
  { id: "agent", label: "Agent", Icon: Bot },
  { id: "portfolio", label: "Portfolio", Icon: Layers3 },
  { id: "activity", label: "Activity", Icon: Activity },
  { id: "settings", label: "Settings", Icon: Settings },
] as const;
const TOOLS = [
  { name: "Swap", Icon: ArrowLeftRight, prompt: "Swap 1 STRK for USDC." },
  { name: "Bridge", Icon: Network, prompt: "Bridge 1 STRK to another network." },
  { name: "Earn", Icon: TrendingUp, prompt: "Find an earning route for 1 STRK." },
  { name: "Borrow", Icon: Landmark, prompt: "Explore borrowing against my STRK." },
] as const;

function shortAddress(address: string) { return `${address.slice(0, 6)}…${address.slice(-4)}`; }
function amount(value: bigint | null, hidden = false) { return hidden ? "••••••" : value === null ? "—" : formatUnits18(value, 4); }
function txName(label: string) {
  const value = label.toLowerCase();
  return value.includes("unshield") ? "Unshield" : value.includes("shield") ? "Shield" : "Agent execution";
}
function txDate(ts: number) { return new Date(ts).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }); }
function SectionHeading({ title, children }: { title: string; children?: ReactNode }) {
  return <div className={styles.sectionHeading}><h2>{title}</h2>{children}</div>;
}
function EmptyState({ children, title }: { children: ReactNode; title: string }) {
  return <div className={styles.emptyState}><strong>{title}</strong><p>{children}</p></div>;
}
function PerformanceChart({ points, hidden }: { points: Observation[]; hidden: boolean }) {
  if (hidden) return <EmptyState title="Balances hidden">Turn off “Hide portfolio amounts” in Settings to see performance.</EmptyState>;
  if (points.length < 2) return <EmptyState title="Your history starts here">Refresh your balances over time to see changes in your observed STRK balance.</EmptyState>;
  const values = points.map(point => point.total);
  const min = Math.min(...values), max = Math.max(...values);
  const spread = Math.max(max - min, Math.abs(max) * 0.015, 0.000001);
  const low = min - spread * 0.25, high = max + spread * 0.25;
  const timeRange = Math.max(1, points[points.length - 1].ts - points[0].ts);
  const coords = points.map(point => ({ x: 8 + (point.ts - points[0].ts) / timeRange * 584, y: 160 - (point.total - low) / (high - low) * 144 }));
  const path = coords.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(" ");
  const delta = values[values.length - 1] - values[0];
  const pct = values[0] > 0 ? delta / values[0] * 100 : null;
  return <div className={styles.chartWrap}>
    <p className={styles.change}>{delta >= 0 ? "+" : ""}{delta.toFixed(4)} STRK {pct !== null && `(${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%)`}<span>Balance change · not investment return</span></p>
    <svg className={styles.chart} viewBox="0 0 600 180" preserveAspectRatio="none" role="img" aria-label="Observed STRK balance changes during this visit">
      <defs><linearGradient id="carel-orbit-chart-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="currentColor" stopOpacity=".18"/><stop offset="100%" stopColor="currentColor" stopOpacity="0"/></linearGradient></defs>
      <path d={`${path} L${coords[coords.length - 1].x} 180 L${coords[0].x} 180 Z`} fill="url(#carel-orbit-chart-fill)"/>
      <path d={path} fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke"/>
    </svg>
    <div className={styles.chartAxis}><span>{txDate(points[0].ts)}</span><span>{txDate(points[points.length - 1].ts)}</span></div>
  </div>;
}

export function CarelApp() {
  const wallet = useCarelTestnet();
  const [tab, setTab] = useState<Tab>("home");
  const [pointsOpen, setPointsOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("shield");
  const [selectedTool, setSelectedTool] = useState<Tool | null>(null);
  const [goalText, setGoalText] = useState("Keep at least 1 STRK private.");
  const [planTarget, setPlanTarget] = useState("1");
  const [planned, setPlanned] = useState(false);
  const [goalError, setGoalError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [executing, setExecuting] = useState(false);
  const [hideAmounts, setHideAmounts] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [period, setPeriod] = useState<Period>("7D");
  const [sample, setSample] = useState(0);
  const [observations, setObservations] = useState<{ owner: string; points: Observation[] }>({ owner: "", points: [] });
  const [executions, setExecutions] = useState<{ owner: string; records: Execution[] }>({ owner: "", records: [] });
  const [activityFilter, setActivityFilter] = useState<"all" | "pending" | "confirmed">("all");
  const [selectedHash, setSelectedHash] = useState<string | null>(null);
  const [quickAction, setQuickAction] = useState<Mode | null>(null);
  const [quickAmount, setQuickAmount] = useState("1");
  const walletDetails = useRef<HTMLDetailsElement>(null);
  const sessionKey = `${wallet.chainId}:${wallet.address.toLowerCase()}`;
  const isSepolia = wallet.chainId === constants.StarknetChainId.SN_SEPOLIA;
  const privateBalance = wallet.privateRevealed ? wallet.privateStrk : null;
  const total = wallet.publicStrk !== null && privateBalance !== null ? wallet.publicStrk + privateBalance : null;
  const visibleBalance = total ?? wallet.publicStrk;
  const busy = wallet.busy || executing || wallet.connecting;
  const ready = wallet.connected && isSepolia;
  const records = executions.owner === sessionKey && wallet.connected ? executions.records : [];
  const visibleRecords = records.filter(record => activityFilter === "all" || (activityFilter === "pending" ? record.status !== "confirmed" : record.status === "confirmed"));
  const selectedExecution = records.find(record => record.hash === selectedHash);

  const plan = useMemo(() => buildLivePlan({
    goal: mode === "shield" ? "target-private" : "target-public", targetText: planTarget,
    connected: wallet.connected, networkReady: isSepolia, strk20Capable: wallet.strk20Capable,
    publicStrk: wallet.publicStrk, privateStrk: wallet.privateStrk, privateRevealed: wallet.privateRevealed,
  }), [mode, planTarget, wallet.connected, isSepolia, wallet.strk20Capable, wallet.publicStrk, wallet.privateStrk, wallet.privateRevealed]);

  useEffect(() => {
    setPlanned(false); setActionError(null); setSelectedHash(null); setQuickAction(null);
    // Private balance observations are held in memory, scoped to this wallet.
    setObservations({ owner: sessionKey, points: [] });
    let restored: Execution[] = [];
    if (wallet.connected) {
      try {
        const parsed: unknown = JSON.parse(sessionStorage.getItem(`carel.activity.v2:${sessionKey}`) || "[]");
        if (Array.isArray(parsed)) restored = parsed.filter((record): record is Execution => Boolean(record && typeof record.hash === "string" && /^0x[0-9a-f]+$/i.test(record.hash) && typeof record.label === "string" && ["pending", "submitted", "confirmed"].includes(record.status) && Number.isFinite(record.ts))).slice(0, 50);
      } catch { /* Optional session storage. */ }
    }
    setExecutions({ owner: sessionKey, records: restored });
  }, [sessionKey, wallet.connected]);

  useEffect(() => {
    if (!wallet.connected || !isSepolia || total === null) return;
    const value = Number(formatUnits18(total, 8));
    if (!Number.isFinite(value)) return;
    setObservations(previous => {
      const base = previous.owner === sessionKey ? previous.points : [];
      const now = Date.now(), last = base[base.length - 1];
      if (last && last.total === value && now - last.ts < 1000) return previous;
      return { owner: sessionKey, points: [...base, { ts: now, total: value }].slice(-180) };
    });
  }, [total, sample, sessionKey, wallet.connected, isSepolia]);

  useEffect(() => {
    if (!wallet.connected || wallet.tx.kind === "idle") return;
    const tx = wallet.tx;
    setExecutions(previous => {
      const base = previous.owner === sessionKey ? previous.records : [];
      const next: Execution[] = [{ hash: tx.hash, label: tx.label, status: tx.kind, ts: base.find(record => record.hash === tx.hash)?.ts ?? Date.now() }, ...base.filter(record => record.hash !== tx.hash)].slice(0, 50);
      try { sessionStorage.setItem(`carel.activity.v2:${sessionKey}`, JSON.stringify(next)); } catch { /* Optional persistence. */ }
      return { owner: sessionKey, records: next };
    });
  }, [wallet.tx, sessionKey, wallet.connected]);

  const chartPoints = useMemo(() => {
    if (observations.owner !== sessionKey || !wallet.connected) return [];
    const days = period === "1D" ? 1 : period === "7D" ? 7 : 30;
    return observations.points.filter(point => point.ts >= Date.now() - days * 86400000);
  }, [observations, sessionKey, period, wallet.connected]);

  function navigate(next: Tab) { setTab(next); setPointsOpen(false); window.scrollTo({ top: 0, behavior: "instant" }); }
  function openPoints() { setPointsOpen(true); window.scrollTo({ top: 0, behavior: "instant" }); }
  function openWallet() {
    navigate("settings");
    window.requestAnimationFrame(() => { if (walletDetails.current) walletDetails.current.open = true; });
  }
  async function run(action: () => Promise<void>) {
    setActionError(null);
    try { await action(); } catch (error) { setActionError(error instanceof Error ? error.message : "The wallet request could not be completed."); }
  }
  async function refreshBalances() {
    await run(async () => { await wallet.refreshPublicBalance(); setSample(value => value + 1); });
  }
  function chooseTool(tool: typeof TOOLS[number]) { setSelectedTool(tool.name); setGoalText(tool.prompt); setPlanned(false); setGoalError(null); }
  function chooseBalanceGoal(nextMode = mode) {
    setSelectedTool(null); setGoalText(`Keep at least 1 STRK ${nextMode === "shield" ? "private" : "public"}.`); setPlanned(false); setGoalError(null);
  }
  function toggleMode() {
    const next = mode === "shield" ? "unshield" : "shield";
    setMode(next); setPlanned(false); setGoalError(null);
    if (!selectedTool) chooseBalanceGoal(next);
  }
  function previewPlan() {
    setPlanned(false); setGoalError(null);
    if (/\b(swap|bridge|earn|borrow|stake|yield|lend)\b/i.test(goalText)) {
      setGoalError("This route is not available on CAREL testnet yet. You can still plan a STRK balance target below."); return;
    }
    if (!/\bSTRK\b/i.test(goalText) || /\b(USDC|USDT|ETH|BTC)\b/i.test(goalText)) {
      setGoalError("Use a STRK balance target, for example: Keep at least 1 STRK private."); return;
    }
    const quantities = Array.from(goalText.matchAll(/(?:^|\s)(\S+)\s+STRK\b/gi));
    const value = quantities[0]?.[1];
    if (quantities.length !== 1 || !value) { setGoalError("Include one STRK target, for example: Keep at least 1 STRK private."); return; }
    try { if (parseUnits18(value) <= ZERO) throw new Error(); }
    catch { setGoalError("Use a positive STRK amount with up to 18 decimal places."); return; }
    const asksPublic = /\b(public|withdraw|unshield)\b/i.test(goalText);
    const asksPrivate = /\b(private|shield|privacy)\b/i.test(goalText);
    if ((mode === "shield" && asksPublic) || (mode === "unshield" && asksPrivate)) {
      setGoalError(`Your goal does not match ${mode === "shield" ? "Shield" : "Unshield"} mode. Switch the mode or edit the goal.`); return;
    }
    setPlanTarget(value); setPlanned(true);
  }
  async function executePlan() {
    if (busy || !planned || plan.status !== "ready" || !ready) return;
    setExecuting(true);
    await run(async () => {
      const value = formatUnits18(plan.delta, 18);
      if (plan.action === "shield") await wallet.shield(value);
      if (plan.action === "unshield") await wallet.unshield(value);
    });
    setExecuting(false);
  }
  async function executeQuick() {
    if (!quickAction || busy || !ready || !wallet.strk20Capable) return;
    try { if (parseUnits18(quickAmount) <= ZERO) throw new Error(); }
    catch { setActionError("Enter an amount greater than zero."); return; }
    setExecuting(true);
    await run(() => quickAction === "shield" ? wallet.shield(quickAmount) : wallet.unshield(quickAmount));
    setExecuting(false);
  }
  function renderExecution(record: Execution) {
    return <button type="button" className={styles.executionRow} key={record.hash} onClick={() => { navigate("activity"); setSelectedHash(record.hash); }}>
      <span className={styles.rowIcon}>{record.status === "confirmed" ? <ShieldCheck size={18}/> : <LoaderCircle size={18}/>}</span>
      <span className={styles.rowCopy}><strong>{txName(record.label)}</strong><small>{txDate(record.ts)}</small></span>
      <span className={styles.rowEnd}>{record.status === "confirmed" ? "Confirmed" : record.status === "submitted" ? "Submitted" : "Pending"}<ChevronRight size={14}/></span>
    </button>;
  }
  const connectButton = <button type="button" className={styles.secondary} disabled={wallet.connecting} onClick={() => void run(() => wallet.connect())}><WalletCards size={16}/>{wallet.connecting ? "Connecting…" : "Connect wallet"}</button>;
  const balanceHelp = !wallet.connected ? "Connect your wallet to see your capital." : total !== null ? "Public + revealed private STRK" : "Private balance excluded until you reveal it.";

  function renderHome() {
    return <div className={styles.homeGrid}>
      <section className={styles.homeHero}>
        <p className={styles.eyebrow}><span className={styles.dot}/>Your private DeFi agent</p>
        <div className={styles.heroArt}><CarelOrbit className={styles.orbit} paused={reduceMotion}/></div>
        <div className={styles.heroCopy}><h1>Your goals.<br/>Your control.</h1><p>One place to plan your next move.</p></div>
        <button type="button" className={styles.primary} onClick={() => navigate("agent")}>Start with a goal<ArrowUpRight size={18}/></button>
      </section>
      <section className={styles.homePortfolio}>
        <SectionHeading title="Portfolio"><button className={styles.textButton} onClick={() => navigate("portfolio")}>View portfolio<ArrowRight size={14}/></button></SectionHeading>
        <div className={styles.panel}><p className={styles.label}>Net portfolio</p><p className={styles.money}>{amount(visibleBalance, hideAmounts)}<span>STRK</span></p><p className={styles.helper}>{balanceHelp}</p>
          {wallet.connected && wallet.publicStrk === null && <button className={styles.textButton} disabled={!ready || busy} onClick={() => void refreshBalances()}><RefreshCw size={14}/>Load balance</button>}
        </div>
        <button type="button" className={styles.pointsCard} onClick={openPoints}><span className={styles.pointsIcon}><Sparkles size={19}/></span><span><strong>— PTS</strong><small>Points · waiting for sync</small></span><ChevronRight size={17}/></button>
      </section>
      <section className={styles.homeActivity}><SectionHeading title="Latest activity"><button className={styles.textButton} onClick={() => navigate("activity")}>View all<ArrowRight size={14}/></button></SectionHeading>{records.length ? records.slice(0, 2).map(renderExecution) : <EmptyState title="Your next move starts here">Completed and pending executions appear here.</EmptyState>}</section>
    </div>;
  }
  function renderPoints() {
    return <div className={styles.narrowPage}>
      <section className={styles.pointsTotal}><CarelOrbit className={styles.pointsOrbit} centered paused={reduceMotion}/><span className={styles.medal}><Sparkles size={27}/></span><p className={styles.label}>Total Points</p><p className={styles.pointsNumber}>— <span>PTS</span></p><p className={styles.helper}>Points are not synced yet.</p></section>
      <SectionHeading title="How you earned"/><p className={styles.helper}>Earning rules will appear here when the Points program is connected.</p>
      <SectionHeading title="Points history"/><EmptyState title="No points history yet">Your earned points and their source will appear here after sync.</EmptyState>
    </div>;
  }
  function renderAgent() {
    return <div className={styles.narrowPage}>
      <div className={styles.intro}><p className={styles.eyebrow}>CAREL AGENT</p><h1>What’s your<br/>next move?</h1><p>Set a goal. Review every step.</p></div>
      <div className={styles.composer}><label htmlFor="carel-goal">Your goal</label><textarea id="carel-goal" value={goalText} onChange={event => { setGoalText(event.target.value); setPlanned(false); setGoalError(null); setSelectedTool(null); }} spellCheck={false}/>
        <div className={styles.modeRow}><button type="button" className={styles.modeButton} aria-pressed={mode === "shield"} aria-label={`Mode: ${mode}. Switch to ${mode === "shield" ? "Unshield" : "Shield"}`} onClick={toggleMode}>{mode === "shield" ? <ShieldCheck size={16}/> : <ShieldOff size={16}/>}<span>{mode === "shield" ? "Shield" : "Unshield"}</span><ArrowLeftRight size={14}/></button><span className={styles.helper}>{mode === "shield" ? "Private routes" : "Public routes"}</span></div>
      </div>
      <div className={styles.tools} aria-label="Agent tools">{TOOLS.map(tool => <button type="button" key={tool.name} aria-pressed={selectedTool === tool.name} onClick={() => chooseTool(tool)}><tool.Icon size={19}/><span>{tool.name}</span></button>)}</div>
      <div className={styles.rule}><span>Approval</span><strong>Always ask me</strong></div><div className={styles.rule}><span>Network</span><strong>Starknet Sepolia</strong></div>
      <button type="button" className={styles.primary} onClick={previewPlan}>Preview plan<ArrowRight size={17}/></button>
      {goalError && <div className={styles.notice} role="alert"><p>{goalError}</p><button type="button" className={styles.textButton} onClick={() => chooseBalanceGoal()}>Use a STRK balance target<ArrowRight size={14}/></button></div>}
      {planned && <section className={styles.plan} aria-live="polite"><SectionHeading title="Your plan"><span className={styles.status}>{plan.status.replaceAll("-", " ")}</span></SectionHeading><div className={styles.panel}><h3>{plan.title}</h3><p className={styles.helper}>{plan.reason}</p>
        {plan.status === "ready" && <><div className={styles.route}><span>{plan.action === "shield" ? "Public wallet" : "Privacy pool"}</span><ArrowRight size={16}/><span>{plan.action === "shield" ? "Privacy pool" : "Public wallet"}</span></div><div className={styles.rule}><span>Amount to move</span><strong>{formatUnits18(plan.delta)} STRK</strong></div><p className={styles.privacyNote}>{plan.action === "shield" ? "The deposit is public. Funds become private after the pool’s maturity period." : "This withdrawal makes the amount and destination public."}</p><button type="button" className={styles.primary} disabled={busy} onClick={() => void executePlan()}>{busy ? <LoaderCircle size={16}/> : <ShieldCheck size={16}/>} {busy ? "Waiting for wallet…" : `Review & ${plan.action === "shield" ? "Shield" : "Unshield"}`}</button></>}
        {plan.status === "needs-private-state" && <button className={styles.secondary} disabled={!ready || busy || !wallet.strk20Capable} onClick={() => void run(() => wallet.revealPrivateBalance())}><Eye size={16}/>Reveal private balance</button>}
        {plan.status === "blocked" && !wallet.connected && connectButton}
        {plan.status === "blocked" && ready && wallet.publicStrk === null && <button className={styles.secondary} disabled={busy} onClick={() => void refreshBalances()}><RefreshCw size={16}/>Load public balance</button>}
        {plan.status === "satisfied" && <p className={styles.inlineStatus}><Check size={16}/>No transaction needed.</p>}
      </div></section>}
    </div>;
  }
  function renderPortfolio() {
    const privateShare = total !== null && total > ZERO && privateBalance !== null ? Number(privateBalance * BigInt(10000) / total) / 100 : null;
    return <div className={styles.portfolioPage}>
      <div className={styles.intro}><h1>Portfolio</h1><p>Your capital, at a glance.</p></div>
      <section className={styles.portfolioOverview}><div className={styles.overviewTop}><div><p className={styles.label}>Net portfolio</p><p className={styles.money}>{amount(visibleBalance, hideAmounts)}<span>STRK</span></p></div><button type="button" className={styles.iconButton} disabled={!ready || busy} aria-label="Refresh public balance" onClick={() => void refreshBalances()}><RefreshCw size={18}/></button></div><p className={styles.helper}>{balanceHelp}</p>
        {!wallet.connected && connectButton}<SectionHeading title="Performance"/><PerformanceChart points={chartPoints} hidden={hideAmounts}/>
        <div className={styles.segment} aria-label="Performance period">{(["1D", "7D", "30D"] as const).map(value => <button key={value} aria-pressed={period === value} onClick={() => setPeriod(value)}>{value}</button>)}</div>
      </section>
      <section><SectionHeading title="Allocation"/><div className={styles.balanceCards}>
        <div className={styles.balanceCard}><span><WalletCards size={15}/>Public</span><strong>{amount(wallet.publicStrk, hideAmounts)} <small>STRK</small></strong><button disabled={!ready || busy} onClick={() => void refreshBalances()}>{wallet.publicStrk === null ? "Load" : "Refresh"}<RefreshCw size={13}/></button></div>
        <div className={styles.balanceCard}><span><EyeOff size={15}/>Private</span><strong>{amount(privateBalance, hideAmounts || !wallet.privateRevealed)} <small>STRK</small></strong><button disabled={!ready || !wallet.strk20Capable || busy} onClick={() => void run(() => wallet.revealPrivateBalance())}>{wallet.privateRevealed ? "Refresh" : "Reveal"}<Eye size={13}/></button></div>
      </div>
      {privateShare !== null && !hideAmounts && <><div className={styles.allocation} role="img" aria-label={`Private ${privateShare}%, public ${(100 - privateShare).toFixed(2)}%`}><span style={{ width: `${privateShare}%` }}/><span style={{ width: `${100 - privateShare}%` }}/></div><div className={styles.allocationLegend}><span>Private {privateShare.toFixed(1)}%</span><span>Public {(100 - privateShare).toFixed(1)}%</span></div></>}
      <div className={styles.actionPair}><button className={styles.secondary} disabled={!ready || !wallet.strk20Capable || busy} onClick={() => { setQuickAction("shield"); setActionError(null); }}><ArrowDownToLine size={16}/>Shield</button><button className={styles.secondary} disabled={!ready || !wallet.strk20Capable || busy} onClick={() => { setQuickAction("unshield"); setActionError(null); }}><ArrowUpFromLine size={16}/>Unshield</button></div>
      {quickAction && <div className={styles.quickPanel}><SectionHeading title={quickAction === "shield" ? "Shield STRK" : "Unshield STRK"}><button className={styles.iconButton} onClick={() => setQuickAction(null)} aria-label="Close transfer form"><X size={17}/></button></SectionHeading><label className={styles.fieldLabel} htmlFor="carel-amount">Amount in STRK</label><input id="carel-amount" className={styles.amountInput} inputMode="decimal" value={quickAmount} onChange={event => setQuickAmount(event.target.value)}/><p className={styles.privacyNote}>{quickAction === "shield" ? "Public wallet → Privacy pool. The deposit remains public; privacy starts after maturity." : "Privacy pool → Public wallet. The withdrawal amount and destination become public."}</p><button className={styles.primary} disabled={busy || !ready} onClick={() => void executeQuick()}>{busy ? "Waiting for wallet…" : `Review & ${quickAction === "shield" ? "Shield" : "Unshield"}`}</button></div>}
      {wallet.maturityTarget !== null && <p className={styles.notice}>Pool maturity: block {wallet.maturityTarget.toLocaleString()}{wallet.currentBlock !== null && ` · Current block ${wallet.currentBlock.toLocaleString()}`}</p>}
      </section>
      <section><SectionHeading title="Holdings"/><div className={styles.holdingRow}><span className={styles.coin}>S</span><div className={styles.rowCopy}><strong>STRK</strong><small>{total === null ? "Visible public balance" : "Public + private balance"}</small></div><strong className={styles.holdingAmount}>{amount(visibleBalance, hideAmounts)}<small>STRK</small></strong></div></section>
      <section><SectionHeading title="Positions"/><EmptyState title="No connected positions">Supported lending, earning, and borrowing positions will appear here when available.</EmptyState></section>
    </div>;
  }
  function renderActivity() {
    return <div className={styles.narrowPage}><div className={styles.intro}><h1>Activity</h1><p>Your executions, from start to finish.</p></div><div className={styles.segment} aria-label="Execution filter">{(["all", "pending", "confirmed"] as const).map(value => <button key={value} aria-pressed={activityFilter === value} onClick={() => setActivityFilter(value)}>{value === "all" ? "All" : value === "pending" ? "Pending" : "Completed"}</button>)}</div>
      <div className={styles.activityList}>{visibleRecords.length ? visibleRecords.map(renderExecution) : <EmptyState title={activityFilter === "all" ? "No executions yet" : "No matching executions"}>Executions from this wallet session appear here.</EmptyState>}</div>
      {selectedExecution && <section className={styles.panel}><SectionHeading title={txName(selectedExecution.label)}><button className={styles.iconButton} onClick={() => setSelectedHash(null)} aria-label="Close execution detail"><X size={16}/></button></SectionHeading><p className={styles.helper}>{selectedExecution.label}</p><div className={styles.rule}><span>Status</span><strong>{selectedExecution.status}</strong></div><div className={styles.rule}><span>Network</span><strong>Starknet Sepolia</strong></div><p className={styles.hash}>{selectedExecution.hash}</p><a className={styles.secondary} href={`${SEPOLIA_EXPLORER_TX}${selectedExecution.hash}`} target="_blank" rel="noreferrer">View on explorer<ArrowUpRight size={16}/></a></section>}
    </div>;
  }
  function renderSettings() {
    return <div className={styles.narrowPage}><div className={styles.intro}><h1>Settings</h1><p>Your wallet. Your rules.</p></div>
      <details className={styles.settingsGroup} ref={walletDetails}><summary><span><WalletCards size={18}/>Wallet & network</span><ChevronDown size={16}/></summary><div className={styles.settingsBody}><div className={styles.rule}><span>Account</span><strong>{wallet.address ? shortAddress(wallet.address) : "Not connected"}</strong></div><div className={styles.rule}><span>Network</span><strong>{isSepolia ? "Starknet Sepolia" : wallet.connected ? "Switch to Sepolia" : "Not connected"}</strong></div><div className={styles.rule}><span>STRK20</span><strong>{wallet.strk20Capable ? "Available" : "Unavailable"}</strong></div>{wallet.connected ? <button className={styles.secondary} disabled={busy} onClick={() => wallet.disconnect()}><LogOut size={15}/>Disconnect wallet</button> : connectButton}</div></details>
      <details className={styles.settingsGroup}><summary><span><EyeOff size={18}/>Privacy</span><ChevronDown size={16}/></summary><div className={styles.settingsBody}><label className={styles.switchRow}>Hide portfolio amounts<input type="checkbox" checked={hideAmounts} onChange={event => setHideAmounts(event.target.checked)}/></label><p className={styles.helper}>Private balances are read only when you choose Reveal. Hiding amounts changes their display.</p><p className={styles.helper}>Shield deposits are public. Unshield makes the amount and destination public again.</p></div></details>
      <details className={styles.settingsGroup}><summary><span><Bot size={18}/>Agent permissions</span><ChevronDown size={16}/></summary><div className={styles.settingsBody}><div className={styles.rule}><span>Execution approval</span><strong>Always required</strong></div><div className={styles.rule}><span>Background execution</span><strong>Off</strong></div><p className={styles.helper}>Review the plan, then approve the transaction in your wallet.</p></div></details>
      <details className={styles.settingsGroup}><summary><span><SlidersHorizontal size={18}/>Risk & transactions</span><ChevronDown size={16}/></summary><div className={styles.settingsBody}><div className={styles.rule}><span>Fees</span><strong>Review in wallet</strong></div><div className={styles.rule}><span>Live routes</span><strong>Shield / Unshield</strong></div><p className={styles.helper}>Swap, Bridge, Earn, and Borrow are not live in this testnet build.</p><button className={styles.textButton} onClick={() => navigate("agent")}>Open Agent<ArrowRight size={15}/></button></div></details>
      <details className={styles.settingsGroup}><summary><span><Moon size={18}/>Appearance</span><ChevronDown size={16}/></summary><div className={styles.settingsBody}><label className={styles.switchRow}>Reduce animation<input type="checkbox" checked={reduceMotion} onChange={event => setReduceMotion(event.target.checked)}/></label><p className={styles.helper}>Your device’s reduced motion preference is always respected.</p></div></details>
    </div>;
  }

  return <div className={styles.app}>
    <header className={styles.header}><div className={styles.headerInner}>
      {pointsOpen ? <button type="button" className={styles.backButton} onClick={() => setPointsOpen(false)}><ArrowLeft size={19}/><span>Points</span></button> : <button type="button" className={styles.brand} onClick={() => navigate("home")} aria-label="CAREL Home"><Orbit size={24}/><span>CAREL</span></button>}
      <div className={styles.headerActions}>{!pointsOpen && <button type="button" className={styles.pointsBadge} onClick={openPoints} aria-label="Open Points detail"><Sparkles size={14}/><span>—</span><small>PTS</small></button>}
      <button type="button" className={styles.walletButton} disabled={wallet.connecting} onClick={wallet.connected ? openWallet : () => void run(() => wallet.connect())} aria-label={wallet.connected ? "Open wallet settings" : "Connect wallet"}>{wallet.connecting ? <LoaderCircle size={18}/> : <WalletCards size={18}/>}<span>{wallet.connected ? shortAddress(wallet.address) : wallet.connecting ? "Connecting…" : "Connect"}</span></button></div>
    </div></header>
    <main className={styles.main}>
      <div className={styles.networkLine}><span className={styles.dot}/>Starknet Sepolia<span>Testnet</span></div>
      {wallet.connected && !isSepolia && <div className={styles.notice} role="status">Switch your wallet to Starknet Sepolia to use CAREL.</div>}
      {pointsOpen ? renderPoints() : tab === "home" ? renderHome() : tab === "agent" ? renderAgent() : tab === "portfolio" ? renderPortfolio() : tab === "activity" ? renderActivity() : renderSettings()}
      {(wallet.error || actionError) && <div className={styles.error} role="alert"><strong>Wallet request needs attention</strong><p>{actionError || wallet.error}</p></div>}
      {wallet.tx.kind !== "idle" && !pointsOpen && tab !== "activity" && <button className={styles.txStatus} onClick={() => { navigate("activity"); if (wallet.tx.kind !== "idle") setSelectedHash(wallet.tx.hash); }}><Activity size={16}/><span>{wallet.tx.kind === "confirmed" ? "Transaction confirmed" : "Transaction submitted"}</span><ArrowRight size={15}/></button>}
    </main>
    <nav className={styles.nav} aria-label="Main navigation">{TABS.map(item => <button type="button" key={item.id} aria-current={tab === item.id ? "page" : undefined} onClick={() => navigate(item.id)}><item.Icon size={20}/><span>{item.label}</span></button>)}</nav>
    <span className={styles.srOnly} role="status" aria-live="polite">{pointsOpen ? "Points detail" : TABS.find(item => item.id === tab)?.label}</span>
  </div>;
}
