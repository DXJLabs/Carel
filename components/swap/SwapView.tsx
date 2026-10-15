"use client";

import {
  ArrowDown, ArrowRight, Check, ChevronDown, LoaderCircle,
  RefreshCw, Search, ShieldCheck, Sparkles, X,
} from "lucide-react";
import { useState } from "react";

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
  const supported: Record<string, string> = {
    STRK: "strk", USDC: "usdc", ETH: "eth",
    USDT: "usdt", WBTC: "wbtc", STRKBTC: "strkbtc", XSTRK: "xstrk",
  };
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

  const [tokenPicker, setTokenPicker] = useState<"sell" | "buy" | null>(null);
  const [tokenSearch, setTokenSearch] = useState("");
  const availableTokens = swapAssets.filter(asset =>
    (asset.symbol + " " + asset.name).toLowerCase().includes(tokenSearch.trim().toLowerCase()),
  );
  function openTokenPicker(kind: "sell" | "buy") {
    setTokenSearch("");
    setTokenPicker(kind);
  }
  function selectToken(symbol: string) {
    if (tokenPicker === "sell") selectSellAsset(symbol);
    if (tokenPicker === "buy") selectBuyAsset(symbol);
    setTokenPicker(null);
  }

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
          <button type="button" className={ui.selectWrap} aria-label={"Select sell token, currently " + paySymbol}
            disabled={busy || flowLocked} onClick={() => openTokenPicker("sell")}>
            <SwapToken symbol={paySymbol}/>
            <strong>{paySymbol}</strong>
            <ChevronDown size={13} aria-hidden="true"/>
          </button>
        </div>
      </div>

      <div className={ui.swapConnector} aria-hidden="true"><ArrowDown size={19}/></div>

      <div className={ui.tokenField}>
        <label htmlFor="carel-swap-buy">Estimated receive</label>
        <div className={ui.tokenFieldBody}>
          <output className={ui.amountOutput} aria-live="polite">{output}</output>
          <button type="button" className={ui.selectWrap} aria-label={"Select receive token, currently " + receiveSymbol}
            disabled={busy || flowLocked} onClick={() => openTokenPicker("buy")}>
            <SwapToken symbol={receiveSymbol}/>
            <strong>{receiveSymbol}</strong>
            <ChevronDown size={13} aria-hidden="true"/>
          </button>
        </div>
      </div>
    </div>

    <div className={ui.routeStatus}>
      <span>{mode === "normal" ? "Public → AVNU → Public" :
        mode === "shield" ? "Public Swap → verified output → Shield" :
          "Unshield → verified input → Public Swap"}</span>
      <span>{network.label}</span>
    </div>

    {tokenPicker && <div className={ui.pickerOverlay} role="dialog" aria-modal="true"
      aria-label={tokenPicker === "sell" ? "Select token to pay" : "Select token to receive"}
      onKeyDown={event => { if (event.key === "Escape") setTokenPicker(null); }}>
      <button type="button" className={ui.pickerBackdrop} aria-label="Close token picker"
        onClick={() => setTokenPicker(null)}/>
      <div className={ui.pickerSheet}>
        <div className={ui.pickerHead}>
          <div><h4>Select token</h4><p>{network.label} · Registered assets</p></div>
          <button type="button" aria-label="Close token picker" className={ui.pickerClose}
            onClick={() => setTokenPicker(null)}><X size={19}/></button>
        </div>
        <label className={ui.pickerSearch}>
          <Search size={17} aria-hidden="true"/>
          <input aria-label="Search token by name or symbol" autoFocus value={tokenSearch}
            onChange={event => setTokenSearch(event.target.value)} placeholder="Search assets"/>
        </label>
        <div className={ui.pickerList}>
          {availableTokens.map(asset => <button type="button" className={ui.pickerOption}
            key={asset.id} onClick={() => selectToken(asset.symbol)}>
            <SwapToken symbol={asset.symbol}/>
            <span><strong>{asset.symbol}</strong><small>{asset.name}</small></span>
            {asset.symbol === (tokenPicker === "sell" ? paySymbol : receiveSymbol) &&
              <Check size={18} className={ui.pickerSelected} aria-label="Selected"/>}
          </button>)}
          {availableTokens.length === 0 && <p className={ui.pickerEmpty}>No registered asset matches your search.</p>}
        </div>
        <p className={ui.pickerNote}>Token registration does not guarantee an AVNU route. A live quote is required before Swap review.</p>
      </div>
    </div>}

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
