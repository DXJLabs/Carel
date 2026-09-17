"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDownUp, ArrowUpRight, Check, Copy, RefreshCw } from "lucide-react";
import { constants } from "starknet";
import { useCarelTestnet } from "@/components/testnet/Strk20Testnet";
import { sepoliaProvider } from "@/lib/strk20/config";
import { bitcoinAddress, felt, formatBitcoinAmount, parseBitcoinAmount, validateFundingCalls } from "@/lib/garden/protocol";
import type { BridgeCall, BridgeDirection, BridgeIntent, BridgeOrder, BridgeQuote, GardenCatalog, SavedBridge } from "@/lib/garden/types";
import styles from "./GardenBridge.module.css";

const STATUS = { "awaiting-deposit": "Awaiting deposit", confirming: "Confirming deposit", exchanging: "Bridge in progress", settling: "Delivering funds", completed: "Received", expired: "Expired", refunding: "Refund submitted", refunded: "Refunded" } as const;
const EVENT = "carel-garden-orders";
const keyFor = (owner: string) => `carel.garden.testnet.orders:${owner}`;
const brief = (value: string) => `${value.slice(0, 8)}…${value.slice(-6)}`;
const message = (error: unknown) => error instanceof Error ? error.message : "The bridge request could not be completed.";

class RequestError extends Error { constructor(message: string, public code: string) { super(message); } }
async function api<T>(query: Record<string, string>, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api/garden?${new URLSearchParams(query)}`, { cache: "no-store", signal });
  return readResponse<T>(response);
}
async function post<T>(body: Record<string, unknown>): Promise<T> {
  const response = await fetch("/api/garden", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(65_000) });
  return readResponse<T>(response);
}
async function readResponse<T>(response: Response): Promise<T> {
  let data;
  try { data = await response.json(); } catch { throw new Error("CAREL could not reach the bridge service. Retry shortly."); }
  if (!response.ok) throw new RequestError(typeof data.error === "string" ? data.error : "Garden request failed.", data.code || "BRIDGE_ERROR");
  return data as T;
}
function savedOrders(owner: string): SavedBridge[] {
  if (!owner) return [];
  try {
    const value: unknown = JSON.parse(localStorage.getItem(keyFor(owner)) || "[]");
    return Array.isArray(value) ? value.filter((item): item is SavedBridge => Boolean(item && typeof item.id === "string" && /^[0-9a-f]{64}$/i.test(item.id) && item.owner === owner && Number.isFinite(item.createdAt))).slice(0, 30) : [];
  } catch { return []; }
}
function remember(owner: string, item: SavedBridge) {
  try { localStorage.setItem(keyFor(owner), JSON.stringify([item, ...savedOrders(owner).filter(row => row.id !== item.id)].slice(0, 30))); } catch { /* Orders can still be recovered from Garden history. */ }
  window.dispatchEvent(new Event(EVENT));
}
function explorer(hash: string | null, bitcoin: boolean) {
  if (!hash) return null;
  const clean = hash.split(":")[0];
  if (!/^(?:0x)?[0-9a-f]{1,64}$/i.test(clean)) return null;
  return bitcoin ? `https://mempool.space/testnet4/tx/${clean}` : `https://sepolia.voyager.online/tx/${clean}`;
}

export function GardenBridge({ mode, onPublicMode, historyOnly = false, intent, activityFilter = "all" }: { mode: "shield" | "unshield"; onPublicMode: () => void; historyOnly?: boolean; intent?: BridgeIntent | null; activityFilter?: "all" | "pending" | "confirmed" }) {
  const wallet = useCarelTestnet();
  const ready = wallet.connected && wallet.chainId === constants.StarknetChainId.SN_SEPOLIA;
  const owner = ready ? felt(wallet.address) : "";
  const ownerRef = useRef(owner); ownerRef.current = owner;
  const modeRef = useRef(mode); modeRef.current = mode;
  const mounted = useRef(true), locked = useRef(false), inputVersion = useRef(0);
  const [catalog, setCatalog] = useState<GardenCatalog | null>(null);
  const [catalogError, setCatalogError] = useState("");
  const [catalogVersion, setCatalogVersion] = useState(0);
  const [direction, setDirection] = useState<BridgeDirection>("to-starknet");
  const [assetId, setAssetId] = useState("");
  const [amount, setAmount] = useState("0.0005");
  const [btcAddress, setBtcAddress] = useState("");
  const [quote, setQuote] = useState<BridgeQuote | null>(null);
  const [now, setNow] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [records, setRecords] = useState<SavedBridge[]>([]);
  const [history, setHistory] = useState<BridgeOrder[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [order, setOrder] = useState<BridgeOrder | null>(null);
  const [orderError, setOrderError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [retryChecked, setRetryChecked] = useState(false);
  const [copied, setCopied] = useState(false);
  const ownedRecords = records.filter(row => row.owner === owner);
  const visibleRecords = ownedRecords.filter(row => {
    if (activityFilter === "all") return true;
    const state = history.find(item => item.id === row.id)?.state;
    return activityFilter === "confirmed" ? state === "completed" || state === "refunded" : state !== "completed" && state !== "refunded" && state !== "expired";
  });
  const activeRecord = ownedRecords.find(row => row.id === activeId);
  const working = busy || wallet.busy || wallet.connecting;
  const current = (capturedOwner: string) => mounted.current && capturedOwner === ownerRef.current;
  const invalidate = () => { inputVersion.current++; setQuote(null); setError(""); setNotice(""); };

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { inputVersion.current++; setQuote(null); }, [mode]);
  useEffect(() => {
    if (!intent || !catalog) return;
    inputVersion.current++; setQuote(null); setDirection(intent.direction); setAmount(intent.amount);
    const asset = intent.symbol === "BTC" ? catalog.starknet[0] : catalog.starknet.find(item => item.symbol === intent.symbol);
    setAssetId(asset?.id || "");
    if (!asset) setError(`${intent.symbol} is not listed by Garden on Starknet Sepolia. Choose an available asset to change this route.`);
  }, [intent, catalog]);
  useEffect(() => {
    const controller = new AbortController();
    setCatalog(null); setCatalogError("");
    void api<GardenCatalog>({ action: "catalog" }, controller.signal).then(value => {
      setCatalog(value); setAssetId(previous => value.starknet.some(item => item.id === previous) ? previous : value.starknet[0].id);
    }).catch(cause => { if (!controller.signal.aborted) setCatalogError(message(cause)); });
    return () => controller.abort();
  }, [catalogVersion]);
  useEffect(() => {
    inputVersion.current++; setQuote(null); setActiveId(null); setOrder(null); setHistory([]); setError(""); setNotice(""); setOrderError("");
    const sync = () => setRecords(savedOrders(owner));
    sync(); window.addEventListener(EVENT, sync); window.addEventListener("storage", sync);
    return () => { window.removeEventListener(EVENT, sync); window.removeEventListener("storage", sync); };
  }, [owner]);
  useEffect(() => {
    if (!quote) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [quote]);
  useEffect(() => {
    if (!owner || !historyOnly) return;
    const controller = new AbortController();
    void api<BridgeOrder[]>({ action: "history", owner }, controller.signal).then(items => {
      if (controller.signal.aborted) return;
      setHistory(items);
      for (const item of items) remember(owner, { ...savedOrders(owner).find(row => row.id === item.id), id: item.id, owner, createdAt: Date.parse(item.createdAt) });
    }).catch(cause => { if (!controller.signal.aborted) setError(message(cause)); });
    return () => controller.abort();
  }, [owner, historyOnly, refresh]);
  useEffect(() => {
    if (!activeId || !owner) return;
    const controller = new AbortController();
    let polling = false, terminal = false;
    setOrder(null); setOrderError(""); setRetryChecked(false);
    const poll = async () => {
      if (polling || terminal || document.hidden || controller.signal.aborted) return;
      polling = true;
      try {
        const value = await api<BridgeOrder>({ action: "order", id: activeId, owner }, controller.signal);
        if (controller.signal.aborted) return;
        setOrder(value); setOrderError("");
        terminal = ["completed", "refunded"].includes(value.state);
        const saved = savedOrders(owner).find(row => row.id === activeId);
        if (value.direction === "to-bitcoin" && value.state === "awaiting-deposit" && saved?.fundingTx) {
          try {
            const status = await sepoliaProvider.getTransactionStatus(saved.fundingTx);
            if (!controller.signal.aborted && (status.execution_status === "REVERTED" || String(status.finality_status) === "REJECTED")) {
              remember(owner, { ...saved, fundingTx: undefined, fundingAttempted: false });
              setNotice("The funding transaction failed on-chain. Review your balance and retry in the wallet.");
            }
          } catch { /* An unavailable receipt is not evidence of failure. */ }
        }
      } catch (cause) { if (!controller.signal.aborted) setOrderError(message(cause)); }
      finally { polling = false; }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 7000);
    const visible = () => { if (!document.hidden) void poll(); };
    document.addEventListener("visibilitychange", visible);
    return () => { controller.abort(); window.clearInterval(timer); document.removeEventListener("visibilitychange", visible); };
  }, [activeId, owner, refresh]);

  async function loadQuote() {
    if (locked.current) return;
    locked.current = true; setBusy(true); setError(""); setNotice("");
    const version = inputVersion.current, capturedOwner = owner;
    try {
      if (!ready || mode !== "unshield") throw new Error("Use a connected Sepolia wallet and the public bridge route.");
      parseBitcoinAmount(amount); bitcoinAddress(btcAddress);
      const result = await post<BridgeQuote>({ action: "quote", direction, assetId, amount });
      if (current(capturedOwner) && version === inputVersion.current) { setQuote(result); setNow(Date.now()); }
    } catch (cause) { if (current(capturedOwner)) setError(message(cause)); }
    finally { locked.current = false; if (mounted.current) setBusy(false); }
  }
  async function create() {
    if (locked.current || !quote) return;
    locked.current = true; setBusy(true); setError(""); setNotice("");
    const capturedOwner = owner;
    try {
      if (!capturedOwner || mode !== "unshield" || Date.now() >= quote.expiresAt) throw new Error("Get a fresh quote before creating the bridge.");
      const request = { direction, assetId, amount, bitcoinAddress: bitcoinAddress(btcAddress), starknetAddress: capturedOwner, expectedReceive: quote.destinationAmount };
      const fingerprint = JSON.stringify(request), draftKey = `carel.garden.draft:${capturedOwner}`;
      const bytes = crypto.getRandomValues(new Uint32Array(2));
      let nonce = (((BigInt(bytes[0]) << 32n) | BigInt(bytes[1])) || 1n).toString();
      try {
        const draft = JSON.parse(localStorage.getItem(draftKey) || "null");
        if (draft?.fingerprint === fingerprint && /^[1-9]\d{0,19}$/.test(draft.nonce)) nonce = draft.nonce;
        localStorage.setItem(draftKey, JSON.stringify({ fingerprint, nonce }));
      } catch { /* Garden history remains the recovery source. */ }
      const result = await post<{ id: string }>({ action: "create", ...request, nonce });
      remember(capturedOwner, { id: result.id, owner: capturedOwner, createdAt: Date.now() });
      try { localStorage.removeItem(draftKey); } catch { /* Optional persistence. */ }
      if (current(capturedOwner)) { setRecords(savedOrders(capturedOwner)); setActiveId(result.id); setQuote(null); }
    } catch (cause) {
      if (current(capturedOwner)) { setError(message(cause)); if (cause instanceof RequestError && cause.code === "QUOTE_CHANGED") setQuote(null); }
    } finally { locked.current = false; if (mounted.current) setBusy(false); }
  }
  async function fund() {
    if (locked.current || !activeId || !owner || !order) return;
    locked.current = true; setBusy(true); setError(""); setNotice("");
    const capturedOwner = owner, id = activeId;
    try {
      if (mode !== "unshield") throw new Error("Switch to the public route before approving a Garden bridge.");
      const previous = savedOrders(capturedOwner).find(row => row.id === id);
      if (previous?.fundingTx || (previous?.fundingAttempted && !retryChecked)) throw new Error("Check the previous wallet request before retrying.");
      const prepared = await post<{ calls: BridgeCall[]; order: BridgeOrder }>({ action: "fund", id, owner: capturedOwner });
      if (!current(capturedOwner)) return;
      if (modeRef.current !== "unshield") throw new Error("The privacy mode changed. Review the public bridge route again.");
      if (prepared.order.id !== id || prepared.order.direction !== order.direction || prepared.order.recipientAddress !== order.recipientAddress || prepared.order.sourceAmount !== order.sourceAmount || prepared.order.destinationAmount !== order.destinationAmount || prepared.order.asset.id !== order.asset.id || prepared.order.asset.tokenAddress !== order.asset.tokenAddress || prepared.order.asset.htlcAddress !== order.asset.htlcAddress) throw new Error("The bridge details changed. Refresh and review the order.");
      const calls = validateFundingCalls(prepared.calls);
      if (calls[0].contractAddress !== prepared.order.asset.tokenAddress || calls[1].contractAddress !== prepared.order.asset.htlcAddress || BigInt(calls[0].calldata[1]).toString() !== prepared.order.sourceAmount) throw new Error("Funding calls do not match the reviewed bridge.");
      const record = { id, owner: capturedOwner, createdAt: previous?.createdAt || Date.now(), fundingAttempted: true };
      remember(capturedOwner, record);
      const hash = await wallet.executeBridge(calls, capturedOwner);
      remember(capturedOwner, { ...record, fundingTx: hash });
      if (current(capturedOwner)) { setNotice("Funding submitted. Garden is tracking the deposit and destination delivery."); setRefresh(value => value + 1); }
    } catch (cause) { if (current(capturedOwner)) { setError(message(cause)); setRetryChecked(false); } }
    finally { locked.current = false; if (mounted.current) setBusy(false); }
  }
  async function refund() {
    if (locked.current || !activeId || !owner) return;
    locked.current = true; setBusy(true); setError("");
    const capturedOwner = owner;
    try {
      await post({ action: "refund", id: activeId, owner });
      if (current(capturedOwner)) { setNotice("Refund request submitted. The status updates after Garden detects the refund transaction."); setRefresh(value => value + 1); }
    } catch (cause) { if (current(capturedOwner)) setError(message(cause)); }
    finally { locked.current = false; if (mounted.current) setBusy(false); }
  }
  function openOrder(id: string) { setError(""); setNotice(""); setActiveId(id); setOrder(null); }
  async function copyDeposit() {
    try {
      if (!order?.depositAddress || !navigator.clipboard) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(order.depositAddress);
      setCopied(true);
    } catch { setError("Copy unavailable. Select the address above to copy it."); }
  }

  const needsPublicMode = mode === "shield" && !historyOnly;
  const selectedAsset = catalog?.starknet.find(asset => asset.id === assetId);
  const sourceSymbol = direction === "to-starknet" ? "BTC" : selectedAsset?.symbol || "BTC";
  const destinationSymbol = direction === "to-starknet" ? selectedAsset?.symbol || "BTC" : "BTC";
  const quoteExpired = quote !== null && now >= quote.expiresAt;
  const sourceLink = order ? explorer(order.sourceTx || activeRecord?.fundingTx || null, order.direction === "to-starknet") : null;
  const destinationLink = order ? explorer(order.destinationTx, order.direction === "to-bitcoin") : null;
  const refundLink = order ? explorer(order.refundTx, order.direction === "to-starknet") : null;

  return <section className={styles.bridge} aria-label="Garden Bitcoin bridge">
    <div className={styles.heading}><div><p className={styles.eyebrow}>POWERED BY GARDEN · TESTNET</p><h2>{historyOnly ? "Bridge activity" : "Bitcoin bridge"}</h2></div><span className={styles.tag}>Public route</span></div>
    <p className={styles.helper}>Bitcoin Testnet4 ↔ Starknet Sepolia. Bridge deposits and receipts are public.</p>
    {!ready && <div className={styles.notice}>{wallet.connected ? "Switch your wallet to Starknet Sepolia, then reconnect." : "Connect your Starknet wallet to begin."}{!wallet.connected && <button className={styles.secondary} disabled={wallet.connecting} onClick={() => void wallet.connect()}>{wallet.connecting ? "Connecting…" : "Connect wallet"}</button>}</div>}
    {needsPublicMode && <div className={styles.notice}>Garden does not fund this bridge from your privacy pool.<button className={styles.secondary} onClick={onPublicMode} disabled={working}>Use public route</button></div>}
    {catalogError && <div className={styles.notice} role="alert"><p>{catalogError}</p><button className={styles.secondary} onClick={() => setCatalogVersion(value => value + 1)}>Retry connection</button></div>}
    {!catalog && !catalogError && <p className={styles.helper} role="status">Checking Garden testnet assets…</p>}
    {catalog && !historyOnly && !activeId && <>
      {!catalog.starknet.some(asset => asset.symbol === "strkBTC") && <p className={styles.assetNote}>Garden currently lists WBTC for Sepolia. strkBTC is not listed on this testnet route.</p>}
      <div className={styles.route}><span>{direction === "to-starknet" ? "Bitcoin Testnet4" : "Starknet Sepolia"}<strong>{sourceSymbol}</strong></span><button className={styles.iconButton} aria-label="Reverse bridge direction" disabled={working} onClick={() => { invalidate(); setDirection(value => value === "to-starknet" ? "to-bitcoin" : "to-starknet"); }}><ArrowDownUp size={19}/></button><span>{direction === "to-starknet" ? "Starknet Sepolia" : "Bitcoin Testnet4"}<strong>{destinationSymbol}</strong></span></div>
      <label className={styles.field}>Asset on Starknet Sepolia<select value={assetId} disabled={working} onChange={event => { invalidate(); setAssetId(event.target.value); }}>{!assetId && <option value="" disabled>Select an available asset</option>}{catalog.starknet.map(asset => <option key={asset.id} value={asset.id}>{asset.symbol}</option>)}</select></label>
      <label className={styles.field}>Amount to send ({sourceSymbol})<input inputMode="decimal" autoComplete="off" value={amount} disabled={working} onChange={event => { invalidate(); setAmount(event.target.value); }}/></label>
      <label className={styles.field}>{direction === "to-starknet" ? "Your Bitcoin Testnet4 refund address" : "Receive BTC at your Bitcoin Testnet4 address"}<input value={btcAddress} disabled={working} placeholder="tb1…" autoComplete="off" autoCapitalize="none" spellCheck={false} onChange={event => { invalidate(); setBtcAddress(event.target.value.trim()); }}/></label>
      <div className={styles.detail}><span>{direction === "to-starknet" ? "Receive on Starknet" : "Send from Starknet"}</span><span className={styles.address}>{owner || "Connect wallet"}</span></div>
      <p className={styles.helper}>Use Testnet4 BTC. Signet, Testnet3, and real BTC cannot fund this route. <a href="https://testnetbtc.com/" target="_blank" rel="noreferrer">Get test BTC <ArrowUpRight size={12}/></a></p>
      {!quote && <button className={styles.primary} disabled={working || !ready || needsPublicMode || !assetId} onClick={() => void loadQuote()}>{busy ? "Getting quote…" : "Get live quote"}</button>}
      {quote && <div className={styles.review} aria-live="polite"><h3>Review bridge</h3><div className={styles.detail}><span>You send</span><strong>{formatBitcoinAmount(quote.sourceAmount)} {quote.source.symbol}</strong></div><div className={styles.detail}><span>You receive</span><strong>{formatBitcoinAmount(quote.destinationAmount)} {quote.destination.symbol}</strong></div>{quote.estimatedSeconds !== null && <div className={styles.detail}><span>Garden estimate</span><strong>~{Math.max(1, Math.ceil(quote.estimatedSeconds / 60))} min</strong></div>}<p className={styles.helper}>Garden fees are reflected in the receive amount. Your source network transaction fee is additional.</p><p className={styles.helper}>{quoteExpired ? "Quote expired. Refresh before continuing." : `Quote refresh required in ${Math.max(0, Math.ceil((quote.expiresAt - now) / 1000))}s.`}</p><button className={styles.primary} disabled={working || needsPublicMode || !ready} onClick={() => void (quoteExpired ? loadQuote() : create())}>{busy ? "Contacting Garden…" : quoteExpired ? "Refresh quote" : "Create bridge order"}</button></div>}
    </>}
    {activeId && <div className={styles.review}>
      <div className={styles.heading}><h3>{order ? STATUS[order.state] : "Loading bridge…"}</h3><button className={styles.iconButton} disabled={working} aria-label="Refresh bridge status" onClick={() => setRefresh(value => value + 1)}><RefreshCw size={16}/></button></div>
      <p className={styles.helper}>Order <span className={styles.address}>{activeId}</span></p>
      {orderError && <p className={styles.notice} role="alert">{orderError} Status is not confirmed.</p>}
      {order && <><div className={styles.detail}><span>Send</span><strong>{formatBitcoinAmount(order.sourceAmount)} {order.direction === "to-starknet" ? "BTC" : order.asset.symbol}</strong></div><div className={styles.detail}><span>Receive</span><strong>{formatBitcoinAmount(order.destinationAmount)} {order.direction === "to-starknet" ? order.asset.symbol : "BTC"}</strong></div>
        <div className={styles.detail}><span>Recipient</span><span className={styles.address}>{order.recipientAddress}</span></div>
        {order.state === "awaiting-deposit" && order.direction === "to-starknet" && order.depositAddress && !orderError && <div className={styles.deposit}><p>Send exactly <strong>{formatBitcoinAmount(order.sourceAmount)} BTC</strong> on Bitcoin Testnet4 to:</p><code>{order.depositAddress}</code><button className={styles.secondary} onClick={() => void copyDeposit()}>{copied ? <Check size={15}/> : <Copy size={15}/>} {copied ? "Copied" : "Copy deposit address"}</button><p className={styles.helper}>Fund this order within one hour of creation. Do not send again after your deposit appears.</p></div>}
        {order.state === "awaiting-deposit" && order.direction === "to-bitcoin" && <><p className={styles.helper}>Approve the exact token amount and deposit it into Garden in one wallet request. Refund timelock: {order.refundAfterBlocks.toLocaleString()} Starknet blocks.</p>{activeRecord?.fundingTx ? <p className={styles.notice}>Funding submitted. Waiting for Garden to detect it.</p> : <>{activeRecord?.fundingAttempted && <label className={styles.check}><input type="checkbox" checked={retryChecked} onChange={event => setRetryChecked(event.target.checked)}/>I checked my wallet: this order has not been funded.</label>}{mode === "shield" ? <button className={styles.secondary} onClick={onPublicMode}>Use public route</button> : <button className={styles.primary} disabled={working || !ready || Boolean(orderError) || Boolean(activeRecord?.fundingAttempted && !retryChecked)} onClick={() => void fund()}>{busy ? "Check your wallet…" : "Approve & fund bridge"}</button>}</>}</>}
        {order.state === "confirming" && <p className={styles.helper}>{order.confirmations} / {order.requiredConfirmations} source confirmations</p>}
        {["exchanging", "settling"].includes(order.state) && <p className={styles.helper}>Garden is settling the bridge. No second deposit is needed.</p>}
        {order.state === "completed" && <p className={styles.success}><Check size={17}/>Delivery is recorded on the destination chain.</p>}
        {order.state === "expired" && <p className={styles.notice}>This order has expired. Do not fund it. A funded order may become refundable after its timelock.</p>}
        <div className={styles.links}>{sourceLink && <a href={sourceLink} target="_blank" rel="noreferrer">Source transaction <ArrowUpRight size={13}/></a>}{destinationLink && <a href={destinationLink} target="_blank" rel="noreferrer">Destination transaction <ArrowUpRight size={13}/></a>}{refundLink && <a href={refundLink} target="_blank" rel="noreferrer">Refund transaction <ArrowUpRight size={13}/></a>}</div>
        {order.sourceTx && !order.destinationTx && !order.refundTx && <div className={styles.refund}><p className={styles.helper}>If settlement fails, a refund returns funds to the original source wallet after the HTLC timelock. Garden checks eligibility.</p><button className={styles.secondary} disabled={working || Boolean(orderError)} onClick={() => void refund()}>Request refund</button></div>}
      </>}
      <button className={styles.secondary} disabled={working} onClick={() => { setActiveId(null); setOrder(null); setError(""); setNotice(""); }}>{historyOnly ? "Back to bridge history" : "New bridge"}</button>
    </div>}
    {error && <p className={styles.notice} role="alert">{error}</p>}
    {notice && <p className={styles.notice} role="status">{notice}</p>}
    {ready && !activeId && visibleRecords.length > 0 && <div className={styles.history}><h3>{historyOnly ? "Your Garden orders" : "Resume a bridge"}</h3>{visibleRecords.map(record => { const detail = history.find(item => item.id === record.id); return <button key={record.id} disabled={working} onClick={() => openOrder(record.id)}><span>{detail ? `${detail.direction === "to-starknet" ? "BTC" : detail.asset.symbol} → ${detail.direction === "to-starknet" ? detail.asset.symbol : "BTC"}` : "Garden bridge"}<small>{brief(record.id)} · {new Date(record.createdAt).toLocaleDateString()}</small></span><span>{detail ? STATUS[detail.state] : "Check status"}<ArrowUpRight size={14}/></span></button>; })}</div>}
    {historyOnly && ready && !activeId && !visibleRecords.length && !error && <p className={styles.helper}>{activityFilter === "all" ? "Garden orders linked to this wallet will appear here." : "No Garden orders match this filter."}</p>}
    {historyOnly && ready && !activeId && <button className={styles.secondary} onClick={() => { setError(""); setRefresh(value => value + 1); }}>Refresh bridge history</button>}
  </section>;
}

export function GardenBalances({ hidden = false }: { hidden?: boolean }) {
  const wallet = useCarelTestnet();
  const [balances, setBalances] = useState<{ owner: string; rows: { id: string; symbol: string; amount: string }[] }>({ owner: "", rows: [] });
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    if (!wallet.connected || wallet.chainId !== constants.StarknetChainId.SN_SEPOLIA) return;
    const controller = new AbortController();
    setError(""); setBalances({ owner: wallet.address, rows: [] });
    void api<GardenCatalog>({ action: "catalog" }, controller.signal).then(async catalog => {
      const rows = await Promise.all(catalog.starknet.map(async asset => {
        const result = await sepoliaProvider.callContract({ contractAddress: asset.tokenAddress!, entrypoint: "balance_of", calldata: [wallet.address] });
        if (result.length < 2) throw new Error("Could not read the bridge token balance.");
        return { id: asset.id, symbol: asset.symbol, amount: formatBitcoinAmount((BigInt(result[0]) + (BigInt(result[1]) << 128n)).toString()) };
      }));
      if (!controller.signal.aborted) setBalances({ owner: wallet.address, rows });
    }).catch(cause => { if (!controller.signal.aborted) setError(message(cause)); });
    return () => controller.abort();
  }, [wallet.address, wallet.chainId, wallet.connected, refresh]);
  if (!wallet.connected || wallet.chainId !== constants.StarknetChainId.SN_SEPOLIA) return null;
  return <section className={styles.balances}><div className={styles.heading}><h3>Bitcoin assets</h3><button className={styles.iconButton} onClick={() => setRefresh(value => value + 1)} aria-label="Refresh Bitcoin token balances"><RefreshCw size={16}/></button></div><p className={styles.helper}>Public balances on Starknet Sepolia</p>{balances.owner === wallet.address && balances.rows.map(row => <div key={row.id} className={styles.detail}><span>{row.symbol}</span><strong>{hidden ? "••••••" : row.amount}</strong></div>)}{error && <p className={styles.helper}>{error}</p>}</section>;
}
