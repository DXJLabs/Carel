"use client";

import {
  ArrowDown, ArrowRight, ChevronDown, LoaderCircle,
  RefreshCw, ShieldCheck, Sparkles,
} from "lucide-react";

import {
  formatUnits,
} from "@/lib/carel/core/amounts";

import type {
  AvnuSwapMode,
} from "@/lib/carel/ecosystems/starknet/protocols/avnu/swap";

import type {
  SwapController,
} from "./useSwapController";

import ui from "./SwapView.module.css";


function shortHash(
  hash: string,
) {
  return hash.length > 18
    ? `${hash.slice(0, 10)}…${hash.slice(-6)}`
    : hash;
}


function actionLabel(
  action: string,
) {
  switch (action) {
    case "swap":
      return "AVNU Swap";

    case "shield":
      return "Shield";

    case "unshield":
      return "Unshield";

    default:
      return action;
  }
}



function SwapToken({symbol}: {symbol: string}) {
  const asset = symbol.toUpperCase();
  const supported: Record<string, string> = {STRK: "strk", USDC: "usdc"};
  const icon = supported[asset];
  return icon
    ? <img className={ui.tokenIcon} src={"/token-icons/" + icon + ".svg"} alt="" width={30} height={30}/>
    : <span className={ui.fallbackIcon} aria-hidden="true">{asset.slice(0, 1)}</span>;
}

export function SwapView({
  mode,
  controller,
}: Readonly<{
  mode: AvnuSwapMode;
  controller: SwapController;
}>) {
  const {
    wallet, network, swapAssets, sellSymbol, buySymbol, amount, quote,
    sellAsset, buyAsset, ready, busy, loading, executing, confirming,
    flowLocked, error, success, swapAgentSession, submittedStage,
    reviewStage, verifiedSwapOutput, stageAction, selectSellAsset,
    selectBuyAsset, changeAmount, loadQuote, startFlow, executeNextStage,
    confirmSubmitted, resetFlow,
  } = controller;

  if (!wallet.connected) return <section className={ui.shell}>
    <h3>Connect your wallet to review a Swap</h3>
    <p className={ui.note}>CAREL prepares the route; your wallet controls every approval.</p>
    <button className={ui.primary} type="button" disabled={wallet.connecting} onClick={() => void wallet.connect()}>
      {wallet.connecting ? "Connecting…" : "Connect Ready"} <ArrowRight size={17}/>
    </button>
  </section>;

  if (!network) return <section className={ui.shell}>
    <p className={ui.notice} role="alert">CAREL Swap currently supports Starknet Sepolia and Mainnet.</p>
  </section>;

  const paySymbol = sellAsset?.symbol ?? sellSymbol;
  const receiveSymbol = buyAsset?.symbol ?? buySymbol;
  const output = quote && buyAsset
    ? formatUnits(quote.buyAmount, buyAsset.decimals, 6)
    : "—";

  return <section className={ui.shell} aria-label="CAREL Swap workflow">
    <div className={ui.heading}>
      <div className={ui.headingTitle}>
        <span className={ui.agentMarker}><Sparkles size={19} aria-hidden="true"/></span>
        <div>
          <h3>{mode === "normal" ? "CAREL Swap" : mode === "shield" ? "CAREL Shield Swap" : "CAREL Unshield Swap"}</h3>
          <p>{quote ? "Route preview ready for review" : "Your route is ready to quote"}</p>
        </div>
      </div>
      <span className={ui.provider}>AVNU</span>
    </div>

    <div className={ui.exchange}>
      <div className={ui.tokenField}>
        <label htmlFor="carel-swap-amount">You pay</label>
        <div className={ui.tokenFieldBody}>
          <input
            id="carel-swap-amount"
            className={ui.amountInput}
            inputMode="decimal"
            aria-label="Amount of token to swap"
            value={amount}
            disabled={busy || flowLocked}
            onChange={event => changeAmount(event.target.value)}
          />
          <div className={ui.selectWrap}>
            <SwapToken symbol={paySymbol}/>
            <select id="carel-swap-sell" aria-label="Sell token" value={paySymbol}
              disabled={busy || flowLocked} onChange={event => selectSellAsset(event.target.value)}>
              {swapAssets.map(asset => <option key={asset.id} value={asset.symbol}>{asset.symbol}</option>)}
            </select>
            <ChevronDown size={13} aria-hidden="true"/>
          </div>
        </div>
      </div>

      <div className={ui.swapConnector} aria-hidden="true"><ArrowDown size={19}/></div>

      <div className={ui.tokenField}>
        <label htmlFor="carel-swap-buy">Estimated receive</label>
        <div className={ui.tokenFieldBody}>
          <output className={ui.amountOutput} aria-live="polite">{output}</output>
          <div className={ui.selectWrap}>
            <SwapToken symbol={receiveSymbol}/>
            <select id="carel-swap-buy" aria-label="Receive token" value={receiveSymbol}
              disabled={busy || flowLocked} onChange={event => selectBuyAsset(event.target.value)}>
              {swapAssets.map(asset => <option key={asset.id} value={asset.symbol}>{asset.symbol}</option>)}
            </select>
            <ChevronDown size={13} aria-hidden="true"/>
          </div>
        </div>
      </div>
    </div>

    <div className={ui.routeStatus}>
      <span>{mode === "normal" ? "Public → AVNU → Public" :
        mode === "shield" ? "Public Swap → verified output → Shield" :
          "Unshield → verified input → Public Swap"}</span>
      <span>{network.label}</span>
    </div>

    {quote && sellAsset && buyAsset && <section className={ui.quoteDetails} aria-label="Live AVNU quote">
      <div className={ui.quoteRow}>
        <span>Preview pay</span>
        <strong>{formatUnits(quote.sellAmount, sellAsset.decimals, 6)} {sellAsset.symbol}</strong>
      </div>
      <div className={ui.quoteRow}>
        <span>Estimated receive</span>
        <strong>{output} {buyAsset.symbol}</strong>
      </div>
      <div className={ui.quoteRow}>
        <span>Price impact</span>
        <strong>{Number.isFinite(quote.priceImpact) ? (quote.priceImpact / 100).toFixed(4) + "%" : "—"}</strong>
      </div>
      <div className={ui.quoteRow}>
        <span>AVNU fee</span>
        <strong>{Number.isFinite(quote.fee.avnuFeesInUsd) ? "$" + quote.fee.avnuFeesInUsd.toFixed(4) : "—"}</strong>
      </div>
      <div className={ui.quoteRow}>
        <span>Slippage limit</span>
        <strong>0.5%</strong>
      </div>
      <p className={ui.quoteDisclaimer}>Indicative quote only. CAREL requests a fresh AVNU quote before each public Swap stage is signed. Network and Agent fees may also apply.</p>
    </section>}

    {swapAgentSession && <section className={ui.runPanel} aria-label="Swap Agent execution progress">
      <div className={ui.runTitle}><h4>Agent execution</h4><span>{swapAgentSession.run.status.replaceAll("-", " ")}</span></div>
      {swapAgentSession.run.stages.map((stage, i) => <div className={ui.stage} key={stage.stageId}>
        <span className={ui.stageNumber}>{i + 1}</span>
        <span>{actionLabel(stageAction(stage.stageId) ?? "stage")}</span>
        <strong>{stage.status}{stage.txHash ? " · " + shortHash(stage.txHash) : ""}</strong>
      </div>)}
      {verifiedSwapOutput && <div className={ui.quoteRow}>
        <span>Verified output</span>
        <strong>{verifiedSwapOutput.amountText} {verifiedSwapOutput.assetSymbol}</strong>
      </div>}
    </section>}

    <div className={ui.actions}>
      {!flowLocked && !quote && <button type="button" className={ui.primary}
        disabled={!ready || busy} onClick={() => void loadQuote()}>
        {loading ? <LoaderCircle size={18} aria-hidden="true"/> : <Sparkles size={18} aria-hidden="true"/>}
        {loading ? "Getting AVNU quote…" : "Get live quote"}
        <ArrowRight size={17} aria-hidden="true"/>
      </button>}
      {!flowLocked && quote && !swapAgentSession && <button type="button" className={ui.primary}
        disabled={busy} onClick={() => void startFlow()}>
        {executing ? <LoaderCircle size={18} aria-hidden="true"/> : <ShieldCheck size={18} aria-hidden="true"/>}
        {executing ? "Starting Agent…" : mode === "normal" ? "Review & Swap" : mode === "shield" ? "Start Shield Swap" : "Start Unshield Swap"}
        <ArrowRight size={17} aria-hidden="true"/>
      </button>}
      {flowLocked && submittedStage && <button type="button" className={ui.primary}
        disabled={busy} onClick={() => void confirmSubmitted()}>
        {confirming ? <LoaderCircle size={18} aria-hidden="true"/> : <RefreshCw size={18} aria-hidden="true"/>}
        {confirming ? "Checking…" : "Check " + actionLabel(stageAction(submittedStage.stageId) ?? "stage") + " confirmation"}
        <ArrowRight size={17} aria-hidden="true"/>
      </button>}
      {flowLocked && !submittedStage && reviewStage && <button type="button" className={ui.primary}
        disabled={busy} onClick={() => void executeNextStage()}>
        {executing ? <LoaderCircle size={18} aria-hidden="true"/> : <ArrowRight size={18} aria-hidden="true"/>}
        {executing ? "Waiting for Ready…" :
          stageAction(reviewStage.stageId) === "shield" ? "Shield verified output" : "Execute fresh AVNU Swap"}
        <ArrowRight size={17} aria-hidden="true"/>
      </button>}
      {swapAgentSession?.run.status === "completed" && <button type="button" className={ui.secondary}
        disabled={busy} onClick={resetFlow}><RefreshCw size={17}/> New Swap</button>}
    </div>

    <p className={ui.approval}><ShieldCheck size={15} aria-hidden="true"/>
      {swapAgentSession ? "Verify each Agent stage before continuing. Wallet approvals remain required." :
        "Review quoted amounts and applicable fees. Your wallet signs, not CAREL."}
    </p>
    {error && <p className={ui.notice} role="alert">{error}</p>}
    {success && <p className={ui.success} role="status">{success}</p>}
  </section>;
}
