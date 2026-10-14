"use client";

import { useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, Bot, ChevronDown, ChevronRight, EyeOff, Network, Shield, ShieldCheck, Sparkles } from "lucide-react";
import { formatPortfolioAmount, portfolioHoldingDetail, type PortfolioHolding, type PortfolioPosition } from "@/lib/carel/portfolio/model";
import type { ChainRef } from "@/lib/carel/core/chains";
import styles from "./PortfolioViews.module.css";

export type PortfolioNetworkFocus = "starknet" | "evm" | "bitcoin" | "solana";
export const PORTFOLIO_NETWORKS: readonly { id: PortfolioNetworkFocus; label: string; support: string }[] = [
  { id: "starknet", label: "Starknet", support: "Starknet wallet only" },
  { id: "evm", label: "Ethereum", support: "Not connected" },
  { id: "bitcoin", label: "Bitcoin", support: "Testnet4 registry only" },
  { id: "solana", label: "Solana", support: "Not connected" },
];

const LOCAL_ICONS: Readonly<Record<string, string>> = {
  STRK: "strk", USDC: "usdc", ETH: "eth", USDT: "usdt",
  WBTC: "wbtc", BTC: "btc", XSTRK: "xstrk", STRKBTC: "strkbtc",
};

function TokenIcon({ symbol }: { symbol: string }) {
  const [failed, setFailed] = useState(false);
  const key = symbol.toUpperCase();
  const token = LOCAL_ICONS[key];
  return <span className={styles.tokenIcon} role="img" aria-label={symbol + " token"}>
    {token && !failed
      ? <img src={"/token-icons/" + token + ".svg"} alt="" width="37" height="37" loading="lazy" onError={() => setFailed(true)}/>
      : <span className={styles.unverifiedIcon}>{key === "XSTRK" || key === "STRKBTC" ? symbol : symbol.charAt(0)}</span>}

  </span>;
}


export function PortfolioOverview({
  chain, walletLabel, visibleStrk, holdings, positions, hideAmounts, chart,
  privacyShare, privateRevealed, canRevealPrivate, canPrivacyAction, positionsLoading,
  positionsWarning, onRevealPrivate, onShield, onUnshield, onAgent, onNetwork, onAsset,
  onRetryPositions,
}: {
  chain: ChainRef | null;
  walletLabel: string;
  visibleStrk: string;
  holdings: readonly PortfolioHolding[];
  positions: readonly PortfolioPosition[];
  hideAmounts: boolean;
  chart?: ReactNode;
  privacyShare: number | null;
  privateRevealed: boolean;
  canRevealPrivate: boolean;
  canPrivacyAction: boolean;
  positionsLoading: boolean;
  positionsWarning: string | null;
  onRevealPrivate: () => void;
  onShield: () => void;
  onUnshield: () => void;
  onAgent: () => void;
  onNetwork: (network: PortfolioNetworkFocus) => void;
  onAsset: (assetId: string) => void;
  onRetryPositions: () => void;
}) {
  const [showAllAssets, setShowAllAssets] = useState(false);
  const [showNetworks, setShowNetworks] = useState(false);
  const observed = holdings.filter(holding => holding.observedAmount !== null && holding.observedAmount > 0n);
  const others = holdings.filter(holding => holding.observedAmount === null || holding.observedAmount <= 0n);
  const visibleAssets = showAllAssets ? [...observed, ...others] : observed;
  const availableShare = !hideAmounts && privateRevealed && privacyShare !== null && Number.isFinite(privacyShare)
    ? Math.max(0, Math.min(100, privacyShare)) : null;
  const positionSummary = positionsLoading ? "Checking positions" :
    positionsWarning ? "Positions partially unavailable" :
    !privateRevealed ? "Private positions not checked" :
    `${positions.length} detected positions`;

  return <div className={`${styles.page} ${styles.cockpit}`}>
    <div className={styles.hero}>
      <div>
        <h1>Portfolio<span>.</span></h1>
        <p>Private DeFi, in your control.</p>
      </div>
      <button type="button" className={styles.scope} aria-expanded={showNetworks}
        aria-controls="carel-network-options" onClick={() => setShowNetworks(open => !open)}>
        All networks <ChevronDown size={15}/>
      </button>
    </div>

    {showNetworks && <section className={styles.networkMenu} id="carel-network-options" aria-label="Networks">
      <h2>Networks</h2>
      <div className={styles.networks}>
        {PORTFOLIO_NETWORKS.map(network =>
          <button type="button" key={network.id}
            className={network.id === "starknet" && chain ? styles.live : styles.pending}
            onClick={() => { setShowNetworks(false); onNetwork(network.id); }}>
            <strong>{network.label}</strong>
            <small>{network.id === "starknet" && chain ? "Connected" : network.support}</small>
            <ChevronRight size={15}/>
          </button>
        )}
      </div>
      <p className={styles.disclosure}>Other networks are not yet connected to CAREL Portfolio. Bitcoin support currently uses the Testnet4 registry.</p>
    </section>}

    <section className={styles.valueCard} aria-label="Observed wallet balance">
      <div className={styles.portfolioTopLine}>
        <span>{privateRevealed ? "Observed STRK · public + revealed private" : "Observed public STRK"}</span>
        <span className={styles.verifiedNetwork}>STRK</span>
      </div>
      <div className={styles.primaryBalance}>
        <strong>{visibleStrk}</strong><span>STRK</span>
      </div>
      {!privateRevealed && <div className={styles.privateStatus}>
        <span><EyeOff size={15}/> Private balance not revealed — total is unknown</span>
        <button type="button" disabled={!canRevealPrivate} onClick={onRevealPrivate}>
          {canRevealPrivate ? "Reveal" : "Unavailable"} <ArrowRight size={13}/>
        </button>
      </div>}
      {availableShare !== null && <div className={styles.heroPrivacy}>
        <div><span>Privacy allocation</span><strong>{availableShare.toFixed(1)}% private</strong></div>
        <div className={styles.privacyBar} role="img" aria-label={`Private ${availableShare.toFixed(1)}%, public ${(100 - availableShare).toFixed(1)}%`}>
          <span style={{width: `${availableShare}%`}}/>
        </div>
      </div>}
      {hideAmounts && <p className={styles.privacyHidden}>Balances hidden in Settings</p>}
      {chart && <div className={styles.actualHistory}><p>Observed STRK balance history · not USD returns</p>{chart}</div>}
      <div className={styles.heroBottom}>
        <span>USD value unavailable</span>
        <button type="button" onClick={() => onNetwork("starknet")}>Wallet details <ArrowRight size={14}/></button>
      </div>
    </section>

    <div className={styles.quickActions} aria-label="Private DeFi actions">
      <button type="button" onClick={onShield} disabled={!canPrivacyAction}><Shield size={19}/>Shield</button>
      <button type="button" onClick={onUnshield} disabled={!canPrivacyAction}><EyeOff size={19}/>Unshield</button>
      <button type="button" className={styles.agentAction} onClick={onAgent}><Bot size={19}/>Ask CAREL</button>
    </div>

    <section className={styles.section}>
      <div className={styles.sectionTop}>
        <h2>Your assets</h2>
        {others.length > 0 && <button type="button" onClick={() => setShowAllAssets(x => !x)}>
          {showAllAssets ? "Active only" : "Show all assets"} <ArrowRight size={14}/>
        </button>}
      </div>
      <div className={styles.rows}>
        {visibleAssets.length ? visibleAssets.map(holding =>
          <button type="button" className={styles.assetRow} key={holding.asset.id} onClick={() => onAsset(holding.asset.id)}>
            <TokenIcon symbol={holding.asset.symbol}/>
            <span className={styles.rowCopy}>
              <strong>{holding.asset.symbol}</strong>
              <small>{holding.asset.symbol.toUpperCase() === "XSTRK" ? "Endur · liquid staking receipt" : holding.asset.name}</small>
            </span>
            <span className={styles.rowAmount}>
              <strong>{formatPortfolioAmount(holding.observedAmount, holding.asset, hideAmounts)}</strong>
              <small>{holding.asset.symbol}</small>
            </span>
            <ChevronRight size={15} className={styles.chevron}/>
          </button>
        ) : <p className={styles.empty}>No positive balances observed yet. Unrevealed private assets are not treated as zero.</p>}
      </div>
      {!privateRevealed && !hideAmounts && <p className={styles.inlineHint}>Private assets may appear after you explicitly reveal their balances.</p>}
    </section>

    <section className={styles.section}>
      <div className={styles.sectionTop}><h2>DeFi positions</h2><span className={styles.privacyScope}>{hideAmounts ? "Hidden" : positionSummary}</span></div>
      {positionsLoading && <p className={styles.inlineHint} role="status">Checking supported DeFi positions…</p>}
      {positions.length > 0 ? positions.map(position =>
        <div className={styles.positionCard} key={position.id}>
          <div className={styles.positionCardHead}>
            <TokenIcon symbol={position.asset.symbol}/>
            <div><strong>{position.label}</strong><small>{position.protocol} · {position.kind.replaceAll("-", " ")}</small></div>
            {!hideAmounts && <span className={styles.positionStatus}>{position.visibility}</span>}
          </div>
          <div className={styles.positionCardBottom}>
            <span>{formatPortfolioAmount(position.amount, position.asset, hideAmounts)} {position.asset.symbol}</span>
            <button type="button" onClick={() => onAsset(position.asset.id)}>Manage details <ChevronRight size={15}/></button>
          </div>
        </div>
      ) : !positionsLoading && <div className={styles.positionEmpty}>
        <span>{positionsWarning ? "Some positions could not be loaded." :
          !privateRevealed ? "Private positions are not yet visible." : "No supported positions detected."}</span>
        {positionsWarning && <button type="button" onClick={onRetryPositions}>Retry <ArrowRight size={14}/></button>}
        {!positionsWarning && !privateRevealed && <button type="button" onClick={() => onNetwork("starknet")}>Privacy details <ArrowRight size={14}/></button>}
      </div>}
      {positionsWarning && <p className={styles.inlineHint} role="status">Position data incomplete. Retry or review network details.</p>}
      {positions.length > 0 && <p className={styles.inlineHint}>Receipt tokens in Assets can represent these same positions; they are not additional holdings.</p>}
    </section>

    {positions.length > 0 && !hideAmounts && <section className={styles.insightStrip}>
      <Sparkles size={16}/>
      <div><strong>CAREL Insights</strong><span>{positions.length} supported ${positions.length === 1 ? "position" : "positions"} ready for a goal-based review.</span></div>
      <button type="button" onClick={onAgent} aria-label="Review positions with CAREL"><ArrowRight size={17}/></button>
    </section>}
    <p className={styles.footerScope}>{walletLabel} · Starknet wallet only · Other networks not connected · No automatic wallet approvals</p>
  </div>;
}

export function PortfolioUnavailableNetwork({ focus, onBack }: {
  focus: PortfolioNetworkFocus;
  onBack: () => void;
}) {
  const network = PORTFOLIO_NETWORKS.find(item => item.id === focus);
  return <div className={styles.page}>
    <button type="button" className={styles.back} onClick={onBack}><ArrowLeft size={17}/> All networks</button>
    <section className={styles.missing}>
      <Network size={30}/>
      <h1>{network?.label ?? "Network"}</h1>
      <p>Not connected to CAREL Portfolio.</p>
      <p>This ecosystem is registered, but no wallet balances or protocol positions are available in the current Portfolio view.</p>
      <button className={styles.smallButton} type="button" onClick={onBack}>Back to overview <ArrowRight size={15}/></button>
    </section>
  </div>;
}

export function PortfolioAssetDetail({
  holding, positions, hideAmounts, privateRevealed, onBack, onAgent,
}: {
  holding: PortfolioHolding | null;
  positions: readonly PortfolioPosition[];
  hideAmounts: boolean;
  privateRevealed: boolean;
  onBack: () => void;
  onAgent: () => void;
}) {
  if (!holding) return <div className={styles.page}>
    <button type="button" className={styles.back} onClick={onBack}><ArrowLeft size={17}/> Starknet assets</button>
    <div className={styles.missing}><h2>Asset unavailable</h2><p>Select a registered asset from the connected network.</p></div>
  </div>;
  // Position receipt balances (xSTRK, for example) are not separate net worth.
  const related = positions.filter(position => position.asset.id === holding.asset.id);
  return <div className={styles.page}>
    <button type="button" className={styles.back} onClick={onBack}><ArrowLeft size={17}/> Starknet assets</button>
    <div className={styles.assetHero}>
      <TokenIcon symbol={holding.asset.symbol}/>
      <div><p className={styles.eyebrow}>ASSET OVERVIEW</p><h1>{holding.asset.symbol}</h1><span>{holding.asset.name}</span></div>
    </div>
    <section className={styles.valueCard}>
      <p>Observed balance</p>
      <div className={styles.assetAmount}><strong>{formatPortfolioAmount(holding.observedAmount, holding.asset, hideAmounts)}</strong><span>{holding.asset.symbol}</span></div>
      <p className={styles.description}>{portfolioHoldingDetail(holding, privateRevealed)}</p>
      <div className={styles.assetLayers}>
        <div><span>Public</span><strong>{formatPortfolioAmount(holding.publicAmount, holding.asset, hideAmounts)} {holding.asset.symbol}</strong></div>
        <div><span>Private</span><strong>{formatPortfolioAmount(holding.privateAmount, holding.asset, hideAmounts || !privateRevealed)} {holding.asset.symbol}</strong></div>
      </div>
      <p className={styles.disclosure}>Market value and APY unavailable without verified sources.</p>
    </section>
    <section className={styles.section}>
      <h2>Positions</h2>
      {related.length ? related.map(position =>
        <div className={styles.position} key={position.id}>
          <div className={styles.positionHeading}><TokenIcon symbol={position.asset.symbol}/><div><strong>{position.label}</strong><small>{position.protocol} · {position.kind.replaceAll("-", " ")}</small></div></div>
          <div className={styles.dataRow}><span>Amount</span><strong>{formatPortfolioAmount(position.amount, position.asset, hideAmounts)} {position.asset.symbol}</strong></div>
          <div className={styles.dataRow}><span>Visibility</span><strong>{position.visibility}</strong></div>
          {position.borrow && <div className={styles.dataRow}><span>Collateral</span><strong>{formatPortfolioAmount(position.borrow.collateralAmount, position.borrow.collateralAsset, hideAmounts)} {position.borrow.collateralAsset.symbol}</strong></div>}
          <p>{position.detail}</p>
        </div>) : <p className={styles.empty}>No detected protocol position for this asset.</p>}
      <p className={styles.disclosure}>Positions also describe receipt tokens; they are not additional holdings.</p>
    </section>
    <div className={styles.actions}>
      <button type="button" className={styles.smallButton} onClick={onBack}>Network details <ChevronRight size={16}/></button>
      <button type="button" className={styles.smallButton} onClick={onAgent}>Open Agent <Bot size={16}/></button>
    </div>
    <p className={styles.safety}><ShieldCheck size={15}/> Viewing assets does not approve transactions. Wallet review is always required.</p>
  </div>;
}
