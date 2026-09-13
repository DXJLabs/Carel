"use client";

import { useMemo, useState } from "react";
import {
  Activity,
  ArrowRight,
  Bell,
  Bot,
  Check,
  ChevronDown,
  CircleDollarSign,
  Command,
  EyeOff,
  Gauge,
  Home,
  KeyRound,
  LayoutDashboard,
  LockKeyhole,
  Menu,
  MessageSquareText,
  MoreHorizontal,
  Orbit,
  PanelLeftClose,
  Play,
  RefreshCw,
  Route,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Target,
  TrendingUp,
  WalletCards,
  X,
  Zap,
} from "lucide-react";
import {
  activityFeed,
  buildPlan,
  money,
  type PrivacyMode,
  type RiskLevel,
} from "@/lib/carel";

const goals = [
  "Earn sustainable yield on my USDC",
  "Keep my capital productive but liquid",
  "Reduce risk without exiting DeFi",
  "Rebalance only when the improvement is meaningful",
];

export function CarelApp() {
  const [mobileMenu, setMobileMenu] = useState(false);
  const [goal, setGoal] = useState(goals[0]);
  const [capital, setCapital] = useState(5000);
  const [risk, setRisk] = useState<RiskLevel>("medium");
  const [privacy, setPrivacy] = useState<PrivacyMode>("prefer-private");
  const [liquidPercent, setLiquidPercent] = useState(20);
  const [maxProtocolPercent, setMaxProtocolPercent] = useState(30);
  const [approvalThreshold, setApprovalThreshold] = useState(500);
  const [runState, setRunState] = useState<"ready" | "planning" | "review" | "active">("ready");
  const [selectedRoute, setSelectedRoute] = useState(0);
  const [showRules, setShowRules] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const plan = useMemo(
    () => buildPlan({ capital, goal, risk, privacy, liquidPercent, maxProtocolPercent, approvalThreshold }),
    [capital, goal, risk, privacy, liquidPercent, maxProtocolPercent, approvalThreshold],
  );

  const planStrategy = () => {
    setRunState("planning");
    setNotice(null);
    window.setTimeout(() => setRunState("review"), 700);
  };

  const approve = () => {
    setRunState("active");
    setNotice("Strategy activated in simulation mode. No funds moved.");
  };

  const reset = () => {
    setRunState("ready");
    setNotice(null);
  };

  return (
    <div className="app-shell">
      <div className="app-grid" aria-hidden="true" />

      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="logo-mark"><Orbit size={21} /></div>
          <div><strong>CAREL</strong><span>Agentic Private DeFi</span></div>
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
          <span>Managed capital</span>
          <strong>{money(capital)}</strong>
          <div className="capital-mini-row"><i /> Starknet Testnet</div>
        </div>

        <button className="side-settings" type="button"><Settings2 size={16} /> Settings</button>
      </aside>

      <div className="workspace">
        <header className="app-topbar">
          <div className="mobile-brand">
            <div className="logo-mark"><Orbit size={19} /></div>
            <strong>CAREL</strong>
          </div>
          <div className="top-status">
            <span className="status-dot" />
            <span>Agent online</span>
            <span className="divider" />
            <span>Starknet Testnet</span>
          </div>
          <div className="top-actions">
            <button className="icon-btn" type="button" aria-label="Notifications"><Bell size={17} /></button>
            <button className="wallet-pill" type="button"><span className="wallet-dot" />0x7A3…91D<ChevronDown size={14} /></button>
            <button className="mobile-menu-btn" type="button" onClick={() => setMobileMenu((value) => !value)} aria-label="Open menu">
              {mobileMenu ? <X size={19} /> : <Menu size={19} />}
            </button>
          </div>
        </header>

        {mobileMenu && (
          <div className="mobile-menu-panel">
            <button><Home size={17} /> Overview</button>
            <button><Bot size={17} /> Agent</button>
            <button><Route size={17} /> Strategies</button>
            <button><EyeOff size={17} /> Privacy</button>
          </div>
        )}

        <main className="workspace-inner">
          <section className="command-row">
            <div className="command-intro">
              <div className="eyebrow"><Sparkles size={14} /> CAREL WORKSPACE</div>
              <h1>What should your capital do next?</h1>
              <p>Set the outcome. CAREL handles routing, risk checks, privacy decisions, and execution planning inside your rules.</p>
            </div>
            <button className="ghost-action" type="button" onClick={reset}><RefreshCw size={15} /> Reset run</button>
          </section>

          <section className="composer-card">
            <div className="composer-main">
              <div className="composer-icon"><Command size={18} /></div>
              <textarea
                value={goal}
                onChange={(event) => setGoal(event.target.value)}
                aria-label="Goal for CAREL"
                placeholder="Describe what you want CAREL to achieve…"
              />
            </div>
            <div className="composer-bottom">
              <div className="quick-prompts">
                {goals.slice(1).map((item) => (
                  <button key={item} type="button" onClick={() => setGoal(item)}>{item}</button>
                ))}
              </div>
              <button className="run-button" type="button" disabled={runState === "planning"} onClick={planStrategy}>
                {runState === "planning" ? <RefreshCw className="spin" size={17} /> : <Play size={17} fill="currentColor" />}
                {runState === "planning" ? "Planning…" : "Build strategy"}
              </button>
            </div>
          </section>

          <section className="metric-grid">
            <MetricCard label="Portfolio" value={money(capital)} meta="USDC available" icon={<WalletCards size={17} />} />
            <MetricCard label="Projected net APY" value={`${plan.weightedApy.toFixed(1)}%`} meta="Simulated · before execution" icon={<TrendingUp size={17} />} accent />
            <MetricCard label="Private allocation" value={money(plan.privateCapital)} meta={privacy === "public-ok" ? "Privacy disabled" : "STRK20 where supported"} icon={<LockKeyhole size={17} />} privateCard />
            <MetricCard label="Liquid reserve" value={`${liquidPercent}%`} meta={`${money(plan.liquidReserve)} stays available`} icon={<CircleDollarSign size={17} />} />
          </section>

          <section className="work-grid">
            <div className="left-stack">
              <article className="panel strategy-panel">
                <div className="panel-head">
                  <div>
                    <span className="panel-kicker">AGENT PLAN</span>
                    <h2>{runState === "ready" ? "Ready for a mandate" : plan.headline}</h2>
                  </div>
                  <StateBadge state={runState} />
                </div>

                {runState === "ready" ? (
                  <div className="empty-plan">
                    <div className="empty-orb"><Bot size={27} /></div>
                    <strong>CAREL has not planned anything yet.</strong>
                    <p>Use the command box above. Your funds stay untouched until you review and approve a strategy.</p>
                  </div>
                ) : (
                  <>
                    <div className="plan-summary-row">
                      <span><small>Deploy</small><strong>{money(plan.productiveCapital)}</strong></span>
                      <span><small>Keep liquid</small><strong>{money(plan.liquidReserve)}</strong></span>
                      <span><small>Routes</small><strong>{plan.routes.length}</strong></span>
                      <span><small>Approval</small><strong>&gt; {money(approvalThreshold)}</strong></span>
                    </div>

                    <div className="route-list">
                      {plan.routes.map((route, index) => (
                        <button
                          key={`${route.protocol}-${route.action}`}
                          type="button"
                          className={`route-card ${selectedRoute === index ? "selected" : ""}`}
                          onClick={() => setSelectedRoute(index)}
                        >
                          <div className="route-index">0{index + 1}</div>
                          <div className="route-main">
                            <div className="route-title"><strong>{route.protocol}</strong><span>{route.action}</span></div>
                            <p>{route.note}</p>
                          </div>
                          <div className="route-metrics">
                            <span><small>Allocation</small>{money(route.allocation)}</span>
                            <span><small>APY</small>{route.apy.toFixed(1)}%</span>
                            <span><small>Risk</small>{route.risk}</span>
                          </div>
                          <div className={`privacy-chip ${route.privacy === "Private" ? "is-private" : ""}`}>
                            {route.privacy === "Private" ? <EyeOff size={13} /> : <Route size={13} />}{route.privacy}
                          </div>
                        </button>
                      ))}
                    </div>

                    <div className="execution-preview">
                      <div className="execution-head"><span>Execution preview</span><small>Simulation</small></div>
                      <div className="exec-flow">
                        <ExecNode title="Wallet" subtitle="Public balance" />
                        <ExecArrow />
                        <ExecNode title={privacy === "public-ok" ? "Direct route" : "Shield if needed"} subtitle={privacy === "public-ok" ? "Public" : "STRK20"} privateNode={privacy !== "public-ok"} />
                        <ExecArrow />
                        <ExecNode title={plan.routes[selectedRoute]?.protocol ?? "Protocol"} subtitle={plan.routes[selectedRoute]?.action ?? "Strategy"} />
                        <ExecArrow />
                        <ExecNode title="Monitor" subtitle="Policy checks" activeNode />
                      </div>
                    </div>

                    <div className="approval-row">
                      <div><ShieldCheck size={18} /><span><strong>Nothing moves automatically.</strong><small>Review the route and approve execution.</small></span></div>
                      {runState !== "active" ? (
                        <button className="approve-button" type="button" onClick={approve}><Check size={16} /> Approve simulation</button>
                      ) : (
                        <span className="active-pill"><Zap size={14} /> Strategy active</span>
                      )}
                    </div>
                  </>
                )}
              </article>

              <article className="panel agent-run-panel">
                <div className="panel-head compact-head">
                  <div><span className="panel-kicker">AGENT RUN</span><h2>What CAREL is doing</h2></div>
                  <button className="icon-btn soft" type="button"><MoreHorizontal size={18} /></button>
                </div>
                <div className="run-timeline">
                  <RunStep icon={<Target size={16} />} title="Understand mandate" copy="Read goal, capital, risk ceiling, privacy preference, and approval threshold." done={runState !== "ready"} />
                  <RunStep icon={<Gauge size={16} />} title="Score routes" copy="Compare simulated yield, liquidity, concentration, and risk." done={runState === "review" || runState === "active"} />
                  <RunStep icon={<EyeOff size={16} />} title="Choose privacy path" copy="Use private execution only when the route benefits from it." done={runState === "review" || runState === "active"} />
                  <RunStep icon={<ShieldCheck size={16} />} title="Policy gate" copy={`Anything above ${money(approvalThreshold)} returns to you for approval.`} done={runState === "active"} current={runState === "review"} />
                  <RunStep icon={<Activity size={16} />} title="Monitor" copy="Watch for yield drift, liquidity changes, or rule violations." done={runState === "active"} current={runState === "active"} />
                </div>
              </article>
            </div>

            <div className="right-stack">
              <article className="panel guardrail-panel">
                <div className="panel-head compact-head">
                  <div><span className="panel-kicker">MANDATE</span><h2>Your guardrails</h2></div>
                  <button className="icon-btn soft" type="button" onClick={() => setShowRules((value) => !value)}><SlidersHorizontal size={17} /></button>
                </div>

                <div className="capital-edit-row">
                  <label htmlFor="capital">Capital</label>
                  <div><span>$</span><input id="capital" inputMode="decimal" value={capital} onChange={(event) => setCapital(Math.max(0, Number(event.target.value.replace(/[^0-9.]/g, "")) || 0))} /><b>USDC</b></div>
                </div>

                <RuleSegment label="Risk ceiling" options={["low", "medium", "high"]} value={risk} onChange={(value) => setRisk(value as RiskLevel)} />
                <RuleSegment label="Privacy" options={["prefer-private", "balanced", "public-ok"]} value={privacy} onChange={(value) => setPrivacy(value as PrivacyMode)} display={{ "prefer-private": "Private first", balanced: "Balanced", "public-ok": "Public OK" }} />

                <RangeRule label="Keep liquid" value={liquidPercent} suffix="%" min={10} max={50} onChange={setLiquidPercent} />
                <RangeRule label="Max / protocol" value={maxProtocolPercent} suffix="%" min={15} max={50} onChange={setMaxProtocolPercent} />

                {showRules && (
                  <div className="advanced-rules">
                    <label>Ask approval above</label>
                    <div className="threshold-input"><span>$</span><input inputMode="decimal" value={approvalThreshold} onChange={(event) => setApprovalThreshold(Math.max(0, Number(event.target.value.replace(/[^0-9.]/g, "")) || 0))} /></div>
                    <div className="rule-note"><KeyRound size={14} /> Session permissions will be added only after the testnet execution model is connected.</div>
                  </div>
                )}
              </article>

              <article className="panel privacy-panel">
                <div className="panel-head compact-head">
                  <div><span className="panel-kicker">PRIVACY</span><h2>What stays private?</h2></div>
                  <span className="strk20-chip">STRK20</span>
                </div>
                <div className="privacy-balance">
                  <span><small>Public route</small><strong>{money(plan.publicCapital)}</strong></span>
                  <span className="private-balance"><small>Private route</small><strong>{money(plan.privateCapital)}</strong></span>
                </div>
                <div className="privacy-list">
                  <PrivacyRow label="Shield transaction" state="Public" />
                  <PrivacyRow label="Private balance" state="Protected" privateState />
                  <PrivacyRow label="Supported private DeFi" state="Protected" privateState />
                  <PrivacyRow label="Unshield destination + amount" state="Public" />
                </div>
                <p className="privacy-footnote">CAREL does not label the whole workflow “private”. It shows the boundary at each step.</p>
              </article>

              <article className="panel activity-panel">
                <div className="panel-head compact-head">
                  <div><span className="panel-kicker">LIVE ACTIVITY</span><h2>Monitoring</h2></div>
                  <span className="live-tag"><i /> LIVE</span>
                </div>
                <div className="activity-feed">
                  {activityFeed.map((item) => (
                    <div className="activity-item" key={`${item.time}-${item.title}`}>
                      <span className={`feed-dot ${item.tone}`} />
                      <div><strong>{item.title}</strong><p>{item.copy}</p></div>
                      <time>{item.time}</time>
                    </div>
                  ))}
                </div>
              </article>
            </div>
          </section>

          {notice && <div className="toast"><Check size={16} /><span>{notice}</span><button onClick={() => setNotice(null)} aria-label="Close"><X size={14} /></button></div>}
        </main>
      </div>

      <nav className="mobile-bottom-nav" aria-label="Mobile navigation">
        <button className="active"><Home size={18} /><span>Home</span></button>
        <button><Bot size={18} /><span>Agent</span></button>
        <button className="mobile-command"><Sparkles size={20} /></button>
        <button><EyeOff size={18} /><span>Privacy</span></button>
        <button><Activity size={18} /><span>Activity</span></button>
      </nav>
    </div>
  );
}

function SideItem({ icon, label, badge, active = false }: { icon: React.ReactNode; label: string; badge?: string; active?: boolean }) {
  return <button className={`side-item ${active ? "active" : ""}`} type="button">{icon}<span>{label}</span>{badge && <small>{badge}</small>}</button>;
}

function MetricCard({ label, value, meta, icon, accent = false, privateCard = false }: { label: string; value: string; meta: string; icon: React.ReactNode; accent?: boolean; privateCard?: boolean }) {
  return (
    <article className={`metric-card ${accent ? "accent" : ""} ${privateCard ? "private-card" : ""}`}>
      <div className="metric-top"><span>{label}</span><i>{icon}</i></div>
      <strong>{value}</strong>
      <p>{meta}</p>
    </article>
  );
}

function StateBadge({ state }: { state: "ready" | "planning" | "review" | "active" }) {
  const labels = { ready: "IDLE", planning: "PLANNING", review: "REVIEW", active: "ACTIVE" };
  return <span className={`state-badge ${state}`}><i />{labels[state]}</span>;
}

function ExecNode({ title, subtitle, privateNode = false, activeNode = false }: { title: string; subtitle: string; privateNode?: boolean; activeNode?: boolean }) {
  return <div className={`exec-node ${privateNode ? "private" : ""} ${activeNode ? "active" : ""}`}><span>{title}</span><small>{subtitle}</small></div>;
}

function ExecArrow() { return <ArrowRight className="exec-arrow" size={16} />; }

function RunStep({ icon, title, copy, done = false, current = false }: { icon: React.ReactNode; title: string; copy: string; done?: boolean; current?: boolean }) {
  return (
    <div className={`run-step ${done ? "done" : ""} ${current ? "current" : ""}`}>
      <div className="run-icon">{done ? <Check size={15} /> : icon}</div>
      <div><strong>{title}</strong><p>{copy}</p></div>
    </div>
  );
}

function RuleSegment({ label, options, value, onChange, display = {} }: { label: string; options: string[]; value: string; onChange: (value: string) => void; display?: Record<string, string> }) {
  return (
    <div className="rule-segment">
      <label>{label}</label>
      <div>{options.map((option) => <button key={option} type="button" className={value === option ? "active" : ""} onClick={() => onChange(option)}>{display[option] ?? option[0].toUpperCase() + option.slice(1)}</button>)}</div>
    </div>
  );
}

function RangeRule({ label, value, suffix, min, max, onChange }: { label: string; value: number; suffix: string; min: number; max: number; onChange: (value: number) => void }) {
  return (
    <div className="range-rule-app">
      <div><label>{label}</label><strong>{value}{suffix}</strong></div>
      <input type="range" min={min} max={max} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </div>
  );
}

function PrivacyRow({ label, state, privateState = false }: { label: string; state: string; privateState?: boolean }) {
  return <div className="privacy-row"><span>{label}</span><strong className={privateState ? "private-state" : "public-state"}>{privateState ? <EyeOff size={12} /> : <Route size={12} />}{state}</strong></div>;
}
