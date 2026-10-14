"use client";

import { useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, Bot, ChevronRight, Layers3, Network, ShieldCheck, WalletCards } from "lucide-react";
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
  STRK: "strk", XSTRK: "strk", USDC: "usdc", ETH: "eth", USDT: "usdt",
  WBTC: "wbtc", BTC: "btc", STRKBTC: "btc",
};

function TokenIcon({ symbol }: { symbol: string }) {
  const [failed, setFailed] = useState(false);
  const key = symbol.toUpperCase();
  const token = LOCAL_ICONS[key];
  return <span className={styles.tokenIcon} role="img" aria-label={symbol + " token"}>
    {token && !failed
      ? <img src={"/token-icons/" + token + ".svg"} alt="" width="37" height="37" loading="lazy" onError={() => setFailed(true)}/>
      : <span>{symbol.charAt(0)}</span>}
    {(key === "XSTRK" || key === "STRKBTC") && <small>{key === "XSTRK" ? "x" : "s"}</small>}
  </span>;
}

export function PortfolioOverview({
  chain, walletLabel, visibleStrk, holdings, positions, hideAmounts, chart,
  onNetwork, onAsset,
}: {
  chain: ChainRef | null;
  walletLabel: string;
  visibleStrk: string;
  holdings: readonly PortfolioHolding[];
  positions: readonly PortfolioPosition[];
  hideAmounts: boolean;
  chart?: ReactNode;
  onNetwork: (network: PortfolioNetworkFocus) => void;
  onAsset: (assetId: string) => void;
}) {
  const observed = holdings.filter(holding => holding.observedAmount !== null && holding.observedAmount > 0n);
  return <div className={styles.page}>
    <div className={styles.hero}>
      <div><p className={styles.eyebrow}>CAREL · MULTICHAIN</p><h1>Portfolio<span>.</span></h1><p>Your assets, across connected networks.</p></div>
      <span className={styles.scope}>All networks</span>
    </div>
    <section className={styles.valueCard} aria-label="Portfolio valuation">
      <p>Total portfolio value</p>
      <div className={styles.valueLine}>
        <strong>{hideAmounts ? "••••••" : "—"} <small>USD</small></strong>
        <span className={styles.unavailable}>Valuation unavailable</span>
      </div>
      <p className={styles.description}>No verified multi-asset price feed is connected. USD value and investment returns are not calculated.</p>
      <div className={styles.strkOverview}>
        <span>Observed Starknet STRK</span>
        <strong>{visibleStrk} <small>STRK</small></strong>
      </div>
      {chart && <div className={styles.actualHistory}><p>Observed STRK balance history · not USD returns</p>{chart}</div>}
    </section>
    <div className={styles.stats}>
      <div><strong>{chain ? 1 : 0}</strong><span>Connected networks</span></div>
      <div><strong>{observed.length}</strong><span>Observed assets</span></div>
      <div><strong>{positions.length}</strong><span>Detected positions</span></div>
    </div>
    <section className={styles.section}>
      <h2>Networks</h2>
      <div className={styles.networks}>
        {PORTFOLIO_NETWORKS.map(network =>
          <button type="button" className={network.id === "starknet" && chain ? styles.live : styles.pending}
            key={network.id} onClick={() => onNetwork(network.id)}>
            <strong>{network.label}</strong>
            <small>{network.id === "starknet" && chain ? chain.name + " · Connected" : network.support}</small>
            <ChevronRight size={15} aria-hidden="true"/>
          </button>
        )}
      </div>
      <p className={styles.disclosure}>Only observed assets from the connected Starknet wallet are listed. Registered ecosystems are not wallet connections. {chain?.network === "testnet" ? "Testnet balances are excluded from production valuation." : ""}</p>
    </section>
    <section className={styles.section}>
      <div className={styles.sectionTop}><h2>Assets</h2><button type="button" onClick={() => onNetwork("starknet")}>View all <ArrowRight size={15}/></button></div>
      <div className={styles.rows}>
        {observed.length ? observed.map(holding =>
          <button type="button" className={styles.assetRow} key={holding.asset.id} onClick={() => onAsset(holding.asset.id)}>
            <TokenIcon symbol={holding.asset.symbol}/>
            <span className={styles.rowCopy}><strong>{holding.asset.symbol}</strong><small>{holding.asset.chain.name}{holding.asset.symbol.toUpperCase() === "XSTRK" ? " · Liquid staking" : ""}</small></span>
            <span className={styles.rowAmount}><strong>{formatPortfolioAmount(holding.observedAmount, holding.asset, hideAmounts)}</strong><small>{holding.asset.symbol}</small></span>
            <ChevronRight size={15} className={styles.chevron}/>
          </button>
        ) : <p className={styles.empty}>No positive balances observed. Refresh the connected Starknet wallet. Unrevealed private balances are never assumed to be zero.</p>}
      </div>
    </section>
    {positions.length > 0 && <section className={styles.section}>
      <h2>Positions</h2>
      <div className={styles.rows}>{positions.map(position =>
        <button type="button" className={styles.assetRow} key={position.id} onClick={() => onAsset(position.asset.id)}>
          <TokenIcon symbol={position.asset.symbol}/>
          <span className={styles.rowCopy}><strong>{position.label}</strong><small>{position.protocol} · {position.asset.chain.name}</small></span>
          <span className={styles.rowAmount}><strong>{formatPortfolioAmount(position.amount, position.asset, hideAmounts)}</strong><small>{position.asset.symbol}</small></span>
          <ChevronRight size={15} className={styles.chevron}/>
        </button>)}</div>
      <p className={styles.disclosure}>Positions can describe tokens already held above. Position quantities are not added again to asset holdings.</p>
    </section>}
    <p className={styles.disclosure}>{walletLabel} · Starknet wallet only · Other networks are not connected yet.</p>
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
