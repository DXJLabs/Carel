"use client";

import {
  ArrowRight, ArrowUpRight, CheckCircle2, Clock3, Coins, EyeOff,
  Layers3, LoaderCircle, RefreshCw, ShieldCheck, Sparkles,
} from "lucide-react";
import { formatUnits } from "@/lib/carel/core/amounts";
import type { StakingController, StakingMode } from "./useStakingController";
import ui from "./StakingView.module.css";

function providerLabel(id: string) {
  if (id.includes("endur")) return "Endur";
  if (id.includes("avnu")) return "AVNU";
  return id;
}

function formatApr(value: number) {
  return Number.isFinite(value) && value >= 0 ? `${value.toFixed(2)}%` : "—";
}

function shortAddress(value: string) {
  return value.length > 16 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value;
}

function AssetIcon({ symbol }: { symbol: string }) {
  const icons: Record<string, string> = {
    STRK: "strk", USDC: "usdc", ETH: "eth", USDT: "usdt",
    WBTC: "wbtc", STRKBTC: "strkbtc", XSTRK: "xstrk",
  };
  const icon = icons[symbol.toUpperCase()];
  return icon
    ? <img className={ui.assetIcon} src={`/token-icons/${icon}.svg`} alt="" width={34} height={34}/>
    : <span className={ui.fallbackIcon} aria-hidden="true">{symbol.slice(0, 1)}</span>;
}

export function StakingView({
  mode, onPublicMode, controller,
}: Readonly<{
  mode: StakingMode;
  onPublicMode: () => void;
  controller: StakingController;
}>) {
  const {
    wallet, network, options, selectedOption, selectedAsset,
    amount, unstakeAmount, pool, position, shieldFee,
    loading, executing, confirming, positionExecuting, busy, flowLocked,
    error, success, stakingAgentSession, submittedStage, reviewStage,
    stageAction, selectAsset, changeAmount, setUnstakeAmount,
    startFlow, executeNextStage, confirmSubmitted, runPositionAction,
    refreshPosition, resetFlow,
  } = controller;

  if (!wallet.connected) return <section className={ui.shell}>
    <div className={ui.heading}>
      <span className={ui.agentIcon}><Sparkles size={18}/></span>
      <div><h3>CAREL Staking</h3><p>Agent-guided staking, with your wallet in control</p></div>
    </div>
    <p className={ui.empty}>Connect Ready to discover staking assets supported by the current Starknet network.</p>
    <button type="button" className={ui.primary} disabled={wallet.connecting}
      onClick={() => void wallet.connect()}>
      {wallet.connecting ? "Connecting…" : "Connect Ready"} <ArrowRight size={18}/>
    </button>
  </section>;

  if (!network) return <section className={ui.shell}>
    <h3>Staking unavailable</h3>
    <p className={ui.notice} role="alert">This network is not registered in the CAREL Starknet runtime.</p>
  </section>;

  if (!selectedOption || !selectedAsset || options.length === 0) {
    return <section className={ui.shell}>
      <div className={ui.heading}>
        <span className={ui.agentIcon}><Layers3 size={18}/></span>
        <div><h3>CAREL Staking</h3><p>{network.label}</p></div>
      </div>
      <p className={ui.empty}>No attached staking provider currently declares an executable asset for this network and privacy mode.</p>
      {mode !== "normal" && <button type="button" className={ui.secondary} onClick={onPublicMode}>Explore public staking <ArrowRight size={16}/></button>}
    </section>;
  }

  const output = selectedOption.outputAsset;
  const title = mode === "normal" ? "CAREL Staking" : mode === "shield" ? "Shield Staking" : "Unshield Staking";
  const inputVisibility = mode === "unshield" ? "Private" : "Public";
  const outputVisibility = mode === "shield" ? "Private" : "Public";
  const outputSymbol = output?.symbol ?? selectedAsset.symbol;
  const stageLabel = (action: string | null) =>
    action === "stake" ? "Stake" : action === "shield" ? "Shield" : action === "unshield" ? "Unshield" : action ?? "Stage";

  return <section className={ui.shell} aria-label="CAREL Agent Staking workflow">
    <div className={ui.heading}>
      <div className={ui.headingTitle}>
        <span className={ui.agentIcon}><Sparkles size={18} aria-hidden="true"/></span>
        <div><h3>{title}</h3><p>CAREL prepares the route. Your wallet approves.</p></div>
      </div>
      <span className={ui.providerPill}>{providerLabel(selectedOption.providerId)}</span>
    </div>

    <div className={ui.stakeCard}>
      <div className={ui.fieldCaption}>
        <label htmlFor="carel-staking-amount">{inputVisibility} stake amount</label>
        <span>{network.label}</span>
      </div>
      <div className={ui.amountRow}>
        <input id="carel-staking-amount" className={ui.amountInput}
          inputMode="decimal" aria-label="Amount to stake" value={amount}
          disabled={busy || flowLocked} onChange={event => changeAmount(event.target.value)}/>
        <div className={ui.assetPill}>
          <AssetIcon symbol={selectedAsset.symbol}/><strong>{selectedAsset.symbol}</strong>
        </div>
      </div>
      <div className={ui.routeLine}>
        <span>{inputVisibility} {selectedAsset.symbol}</span>
        <ArrowRight size={15} aria-hidden="true"/>
        <span>{outputVisibility} {outputSymbol}{mode === "normal" ? " stake" : " receipt"}</span>
      </div>
    </div>

    {options.length > 1 && <div className={ui.assetSection}>
      <span className={ui.smallLabel}>Available staking routes</span>
      <div className={ui.assetOptions} role="group" aria-label="Select staking asset and provider">
        {options.map(option => <button type="button"
          key={`${option.asset.id}:${option.providerId}:${option.outputAsset?.id ?? "public"}`}
          className={ui.assetOption} aria-pressed={option.asset.id === selectedAsset.id}
          disabled={busy || flowLocked} onClick={() => selectAsset(option.asset.id)}>
          <AssetIcon symbol={option.asset.symbol}/>
          <span><strong>{option.asset.symbol}</strong><small>{providerLabel(option.providerId)}{option.outputAsset ? ` → ${option.outputAsset.symbol}` : ""}</small></span>
        </button>)}
      </div>
    </div>}

    <div className={ui.routeInfo}>
      <div><span>Provider</span><strong>{providerLabel(selectedOption.providerId)}</strong></div>
      <div><span>Network</span><strong>{network.label}</strong></div>
      <div><span>Observed pool APR</span><strong>{pool ? formatApr(pool.apr) : "Unavailable"}</strong></div>
    </div>
    {pool && <p className={ui.rateNote}>Provider-reported APR is variable, not guaranteed. Pool {shortAddress(pool.poolAddress)}.</p>}
    {!pool && <p className={ui.rateNote}>Only capability-supported assets are shown. APR is not assumed when live pool data is unavailable.</p>}

    {mode === "shield" && output && <div className={ui.privacyCard}>
      <ShieldCheck size={17} aria-hidden="true"/>
      <div><strong>Private {output.symbol} receipt</strong>
        <span>Privacy fee: {shieldFee !== null
          ? `${formatUnits(shieldFee, selectedAsset.decimals, 6)} ${selectedAsset.symbol}`
          : "Checking…"}. Private receipts are not treated as public balances.</span></div>
    </div>}
    {mode === "unshield" && <div className={ui.privacyCard}>
      <EyeOff size={17} aria-hidden="true"/>
      <div><strong>Unshield before staking</strong>
        <span>Public staking can proceed only after CAREL verifies the confirmed Unshield output.</span></div>
    </div>}

    {stakingAgentSession && <section className={ui.execution} aria-label="Agent staking execution progress">
      <div className={ui.subHeading}><strong>Agent execution</strong><span>{stakingAgentSession.run.status.replaceAll("-", " ")}</span></div>
      {stakingAgentSession.run.stages.map((stage, i) =>
        <div className={ui.stage} key={stage.stageId}>
          <span className={ui.stageIndex}>{i + 1}</span>
          <span>{stageLabel(stageAction(stage.stageId))}</span>
          <strong>{stage.status}{stage.txHash ? ` · ${shortAddress(stage.txHash)}` : ""}</strong>
        </div>)}
    </section>}

    <div className={ui.actions}>
      {!flowLocked && stakingAgentSession?.run.status !== "completed" && <button
        type="button" className={ui.primary}
        disabled={busy || (mode !== "normal" && !wallet.strk20Capable) ||
          (mode === "shield" && shieldFee === null)}
        onClick={() => void startFlow()}>
        {executing ? <LoaderCircle size={18}/> : <Sparkles size={18}/>}
        <span>{executing ? "Waiting for Ready…" : mode === "normal"
          ? "Review & Stake" : mode === "shield" ? "Review & Shield Stake" : "Start Unshield Stake"}</span>
        <ArrowRight size={18}/>
      </button>}
      {flowLocked && submittedStage && <button type="button" className={ui.primary}
        disabled={busy} onClick={() => void confirmSubmitted()}>
        {confirming ? <LoaderCircle size={18}/> : <RefreshCw size={18}/>}
        <span>{confirming ? "Checking…" : "Check confirmation"}</span><ArrowRight size={18}/>
      </button>}
      {flowLocked && !submittedStage && reviewStage && <button type="button" className={ui.primary}
        disabled={busy} onClick={() => void executeNextStage()}>
        {executing ? <LoaderCircle size={18}/> : <ArrowRight size={18}/>}
        <span>{executing ? "Waiting for Ready…" : "Execute Staking"}</span><ArrowRight size={18}/>
      </button>}
      {stakingAgentSession && (stakingAgentSession.run.status === "completed" ||
        stakingAgentSession.run.status === "failed") &&
        <button type="button" className={ui.secondary} disabled={busy} onClick={resetFlow}>
          <RefreshCw size={16}/> New Stake
        </button>}
    </div>
    <p className={ui.approval}><ShieldCheck size={15} aria-hidden="true"/>
      CAREL tracks each stage; your wallet signs every transaction.</p>

    <section className={ui.positionPanel} aria-label="Staking position">
      <div className={ui.positionHead}>
        <div><h4>Public staking position</h4><p>Observed provider data · not a private balance</p></div>
        <button type="button" className={ui.refresh} aria-label="Refresh staking position"
          disabled={busy} onClick={() => void refreshPosition()}><RefreshCw size={16}/></button>
      </div>
      {loading && <p className={ui.loading} role="status"><Clock3 size={14}/> Refreshing staking position…</p>}
      {position ? <>
        <div className={ui.positionStats}>
          <div><span>Staked</span><strong>{formatUnits(position.amount, selectedAsset.decimals, 6)} {selectedAsset.symbol}</strong></div>
          <div><span>Unclaimed rewards</span><strong>{formatUnits(position.unclaimedRewards, selectedAsset.decimals, 6)} {selectedAsset.symbol}</strong></div>
        </div>
        {position.amount > 0n && <div className={ui.unstakeRow}>
          <label htmlFor="carel-unstake-amount">Unstake amount</label>
          <div><input id="carel-unstake-amount" className={ui.unstakeInput}
            inputMode="decimal" value={unstakeAmount} disabled={positionExecuting}
            onChange={event => setUnstakeAmount(event.target.value)}/>
            <button type="button" className={ui.secondary} disabled={positionExecuting}
              onClick={() => void runPositionAction("initiateUnstake")}>Initiate unstake <ArrowUpRight size={15}/></button>
          </div>
        </div>}
        {position.unpoolAmount > 0n && position.unpoolTime !== null &&
          Date.now() >= position.unpoolTime && <button type="button" className={ui.secondary}
            disabled={positionExecuting} onClick={() => void runPositionAction("completeUnstake")}>
            <CheckCircle2 size={16}/> Complete unstake
          </button>}
        {position.unclaimedRewards > 0n && <button type="button" className={ui.secondary}
          disabled={positionExecuting} onClick={() => void runPositionAction("claimRewards")}>
          <Coins size={16}/> Claim rewards
        </button>}
        {position.unpoolAmount > 0n && (position.unpoolTime === null ||
          Date.now() < position.unpoolTime) && <p className={ui.loading}><Clock3 size={14}/>
            Unstake is pending. Complete it only when the provider unlocks withdrawal.</p>}
      </> : !loading && <p className={ui.emptySmall}>No public staking position is currently displayed. Refresh to check provider data.</p>}
    </section>

    {error && <p className={ui.notice} role="alert">{error}</p>}
    {success && <p className={ui.success} role="status">{success}</p>}
  </section>;
}
