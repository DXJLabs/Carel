"use client";

import { useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, Bot, ChevronRight, EyeOff, Layers3, Network, Shield, ShieldCheck, Sparkles, WalletCards } from "lucide-react";
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
  WBTC: "wbtc", BTC: "btc",
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
  privacyShare, canPrivacyAction, onShield, onUnshield, onAgent, onNetwork, onAsset,
}: {
  chain: ChainRef | null;
  walletLabel: string;
  visibleStrk: string;
  holdings: readonly PortfolioHolding[];
  positions: readonly PortfolioPosition[];
  hideAmounts: boolean;
  chart?: ReactNode;
  privacyShare: number | null;
  canPrivacyAction: boolean;
  onShield: () => void;
  onUnshield: () => void;
  onAgent: () => void;
  onNetwork: (network: PortfolioNetworkFocus) => void;
  onAsset: (assetId: string) => void;
}) {
  const [showAllAssets, setShowAllAssets] = useState(false);
  const observed = holdings.filter(holding => holding.observedAmount !== null && holding.observedAmount > 0n);
  const others = holdings.filter(holding => holding.observedAmount === null || holding.observedAmount <= 0n);
  const visibleAssets = showAllAssets ? [...observed, ...others] : observed;
  const privatePositions = positions.filter(position => position.visibility === "private");
  const availableShare = !hideAmounts && privacyShare !== null && Number.isFinite(privacyShare)
    ? Math.max(0, Math.min(100, privacyShare)) : null;

  return <div className={styles.page}>
    <div className={styles.hero}>
      <div><p className={styles.eyebrow}>CAREL · PRIVATE DEFI</p><h1>Portfolio<span>.</span></h1><p>Your assets. Your privacy. Your control.</p></div>
      <button type="button" className={styles.scope} onClick={() => onNetwork("starknet")} aria-label="Open connected network">
        All networks <ChevronRight size={14}/>
      </button>
    </div>

    <section className={styles.valueCard} aria-label="Portfolio summary">
      <div className={styles.portfolioTopLine}>
        <span>Observed STRK balance</span>
        <span className={styles.verifiedNetwork}>Starknet wallet</span>
      </div>
      <div className={styles.primaryBalance}>
        <strong>{visibleStrk}</strong><span>STRK</span>
      </div>
      <div className={styles.valuationNotice}>Valuation unavailable · No verified multi-asset price feed connected</div>
      {chart && <div className={styles.actualHistory}><p>Observed STRK balance history · not USD returns</p>{chart}</div>}
      <div className={styles.heroBottom}>
        <span><Shield size={14}/> Private DeFi overview</span>
        <button type="button" onClick={onAgent}>Ask CAREL <ArrowRight size={15}/></button>
      </div>
    </section>

    <div className={styles.stats}>
      <div><strong>{chain ? 1 : 0}</strong><span>Connected networks</span></div>
      <div><strong>{observed.length}</strong><span>Observed assets</span></div>
      <div><strong>{hideAmounts ? "••" : positions.length}</strong><span>Detected positions</span></div>
    </div>

    <div className={styles.quickActions} aria-label="Private DeFi actions">
      <button type="button" onClick={onShield} disabled={!canPrivacyAction}><Shield size={19}/>Shield</button>
      <button type="button" onClick={onUnshield} disabled={!canPrivacyAction}><EyeOff size={19}/>Unshield</button>
      <button type="button" onClick={onAgent}><Bot size={19}/>Ask CAREL</button>
    </div>

    <section className={styles.privacyCard}>
      <div className={styles.sectionTop}><h2>Privacy allocation</h2><span className={styles.privacyScope}>STRK only</span></div>
      {availableShare === null ? (
        <div className={styles.privacyUnknown}><EyeOff size={19}/><span>Allocation hidden or not revealed. Open Starknet to review privacy settings.</span></div>
      ) : (
        <>
          <div className={styles.privacyValues}>
            <strong>{availableShare.toFixed(1)}% <span>Private</span></strong>
            <span>{(100 - availableShare).toFixed(1)}% Public</span>
          </div>
          <div className={styles.privacyBar} role="img" aria-label={`Private ${availableShare.toFixed(1)}%, public ${(100 - availableShare).toFixed(1)}%`}>
            <span style={{width: `${availableShare}%`}}/>
          </div>
        </>
      )}
      <button type="button" className={styles.privacyLink} onClick={() => onNetwork("starknet")}>View privacy details <ArrowRight size={15}/></button>
    </section>

    <section className={styles.section}>
      <div className={styles.sectionTop}>
        <h2>Your assets</h2>
        {others.length > 0 && <button type="button" onClick={() => setShowAllAssets(x => !x)}>
          {showAllAssets ? "Show active only" : `Show all assets (${holdings.length})`} <ArrowRight size={14}/>
        </button>}
      </div>
      <div className={styles.rows}>
        {visibleAssets.length ? visibleAssets.map(holding =>
          <button type="button" className={styles.assetRow} key={holding.asset.id} onClick={() => onAsset(holding.asset.id)}>
            <TokenIcon symbol={holding.asset.symbol}/>
            <span className={styles.rowCopy}>
              <strong>{holding.asset.symbol}</strong>
              <small>{holding.asset.symbol.toUpperCase() === "XSTRK" ? "Endur · Liquid staking receipt" : holding.asset.name}</small>
            </span>
            <span className={styles.rowAmount}>
              <strong>{formatPortfolioAmount(holding.observedAmount, holding.asset, hideAmounts)}</strong>
              <small>{holding.asset.symbol}</small>
            </span>
            <ChevronRight size={15} className={styles.chevron}/>
          </button>
        ) : <p className={styles.empty}>No positive assets currently observed. Unrevealed private balances are not treated as zero.</p>}
      </div>
      <p className={styles.disclosure}>Only observed assets from the connected Starknet wallet are listed. Other networks are not yet connected.</p>
    </section>

    <section className={styles.section}>
      <div className={styles.sectionTop}><h2>DeFi positions</h2><span className={styles.privacyScope}>{hideAmounts ? "Hidden" : `${positions.length} detected`}</span></div>
      {positions.length ? positions.map(position =>
        <div className={styles.positionCard} key={position.id}>
          <div className={styles.positionCardHead}>
            <TokenIcon symbol={position.asset.symbol}/>
            <div><strong>{position.label}</strong><small>{position.protocol} · {position.kind.replaceAll("-", " ")}</small></div>
            <span className={styles.positionStatus}>{position.visibility === "private" ? "Private" : position.visibility}</span>
          </div>
          <div className={styles.positionCardBottom}>
            <span>{formatPortfolioAmount(position.amount, position.asset, hideAmounts)} {position.asset.symbol}</span>
            <button type="button" onClick={() => onAsset(position.asset.id)}>Details <ChevronRight size={15}/></button>
          </div>
        </div>
      ) : <p className={styles.empty}>No supported DeFi positions detected yet.</p>}
      <p className={styles.disclosure}>Positions can represent receipt tokens already held. They are not additional holdings.</p>
    </section>

    <section className={styles.insightCard}>
      <div className={styles.insightTitle}><Sparkles size={18}/><h2>CAREL Insights</h2></div>
      <p>{hideAmounts
        ? "Portfolio amounts are hidden. Open Agent for a goal-based review."
        : privatePositions.length > 0
          ? `${privatePositions.length} detected private ${privatePositions.length === 1 ? "position" : "positions"} available for review.`
          : positions.length > 0
            ? `${positions.length} DeFi ${positions.length === 1 ? "position" : "positions"} detected. Review details before planning actions.`
            : "Your connected wallet is ready for an Agent plan review."}</p>
      <button type="button" onClick={onAgent}>Review with CAREL <ArrowRight size={16}/></button>
      <small>Read-only insight · No automatic transactions or return predictions</small>
    </section>

    <section className={styles.section}>
      <h2>Networks</h2>
      <div className={styles.networks}>
        {PORTFOLIO_NETWORKS.map(network =>
          <button type="button" className={network.id === "starknet" && chain ? styles.live : styles.pending}
            key={network.id} onClick={() => onNetwork(network.id)}>
            <strong>{network.label}</strong>
            <small>{network.id === "starknet" && chain ? "Connected" : network.support}</small>
            <ChevronRight size={15} aria-hidden="true"/>
          </button>
        )}
      </div>
      <p className={styles.disclosure}>{walletLabel} · Starknet wallet only. Registered ecosystems are not wallet connections. {chain?.network === "testnet" ? "Testnet balances are excluded from production valuation." : ""}</p>
    </section>
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
      <div><p className={styles.eyebrow}>{holding.asset.chain.name}</p><h1>{holding.asset.symbol}</h1><span>{holding.asset.name}</span></div>
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
