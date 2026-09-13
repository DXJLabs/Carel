"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  constants,
  num,
  walletV6,
  WalletAccountV6,
} from "starknet";
import type { WALLET_API } from "@starknet-io/types-js";
import {
  createStore,
  type Store,
} from "@starknet-io/get-starknet-discovery";
import {
  StandardConnect,
  type WalletWithStarknetFeatures,
} from "@starknet-io/get-starknet-wallet-standard/features";
import type {
  WalletWithStarknetFeatures as WalletWithStarknetFeaturesV6,
} from "@starknet-io/get-starknet-wallet-standard-v6/features";
import {
  Check,
  ChevronDown,
  EyeOff,
  LockKeyhole,
  RefreshCw,
  Shield,
  Unlock,
  WalletCards,
} from "lucide-react";
import {
  SEPOLIA_EXPLORER_TX,
  SEPOLIA_RPC,
  STRK_TOKEN,
  sepoliaProvider,
} from "@/lib/strk20/config";
import {
  formatUnits18,
  parseUnits18,
  sameFelt,
} from "@/lib/strk20/units";

type TxState =
  | { kind: "idle" }
  | { kind: "pending"; label: string; hash: string }
  | { kind: "confirmed"; label: string; hash: string }
  | { kind: "submitted"; label: string; hash: string };

type CarelTestnetContextValue = {
  wallets: WalletWithStarknetFeatures[];
  address: string;
  chainId: string;
  connected: boolean;
  connecting: boolean;
  strk20Capable: boolean;
  specs: string[];
  publicStrk: bigint | null;
  privateStrk: bigint | null;
  privateRevealed: boolean;
  busy: boolean;
  error: string | null;
  tx: TxState;
  maturityTarget: number | null;
  currentBlock: number | null;
  connect: (walletName?: string) => Promise<void>;
  disconnect: () => void;
  refreshPublicBalance: () => Promise<void>;
  revealPrivateBalance: () => Promise<void>;
  shield: (amount: string) => Promise<void>;
  unshield: (amount: string) => Promise<void>;
};

const CarelTestnetContext = createContext<CarelTestnetContextValue | null>(null);

// Keep one discovery store alive for the page lifetime.
// Android extension hosts such as Mises can inject Ready after React mounts.
const walletStore: Store = createStore({ eip1193Adapters: [] });

function refreshInjectedWallets() {
  if (typeof window === "undefined") return;

  walletStore._refreshInjectedWallets();
}

function getDiscoveredWallets(): WalletWithStarknetFeatures[] {
  return walletStore
    .getWallets()
    .filter((wallet) => {
      const id = normalizeWalletName(wallet.name);

      return !id.includes("metamask") && !id.includes("braavos");
    })
    .slice();
}

function normalizeWalletName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function supportsStrk20(specs: string[]) {
  return specs.some((value) => {
    const match = value.match(/(\d+)\.(\d+)(?:\.(\d+))?/);
    if (!match) return false;

    const major = Number(match[1]);
    const minor = Number(match[2]);

    return major > 0 || minor >= 10;
  });
}

function shortAddress(address: string) {
  if (!address) return "";
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

async function readPublicStrk(address: string): Promise<bigint> {
  const result = await sepoliaProvider.callContract({
    contractAddress: STRK_TOKEN,
    entrypoint: "balance_of",
    calldata: [address],
  });

  const low = BigInt(result[0] ?? "0");
  const high = BigInt(result[1] ?? "0");

  return low + (high << 128n);
}

function readPrivateStrkFromResponse(raw: unknown): bigint {
  const payload =
    raw && typeof raw === "object" && "value" in raw
      ? (raw as { value: unknown }).value
      : raw;

  if (!Array.isArray(payload)) return 0n;

  for (const entry of payload) {
    if (!entry || typeof entry !== "object") continue;

    const row = entry as Record<string, unknown>;
    const token = row.token ?? row.token_address ?? row[0];
    const amount = row.amount ?? row.balance ?? row[1];

    if (sameFelt(token, STRK_TOKEN)) {
      try {
        return BigInt(String(amount ?? "0"));
      } catch {
        return 0n;
      }
    }
  }

  return 0n;
}

async function waitForSubmittedTransaction(hash: string) {
  const confirmation = sepoliaProvider.waitForTransaction(hash, {
    retries: 120,
    retryInterval: 3000,
  });

  const timeout = new Promise<never>((_, reject) => {
    window.setTimeout(
      () => reject(new Error("Confirmation is taking longer than expected.")),
      120_000,
    );
  });

  await Promise.race([confirmation, timeout]);
}

export function CarelTestnetProvider({ children }: { children: ReactNode }) {
  const [wallets, setWallets] = useState<WalletWithStarknetFeatures[]>([]);
  const [walletAccount, setWalletAccount] = useState<WalletAccountV6 | null>(null);
  const [address, setAddress] = useState("");
  const [chainId, setChainId] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [specs, setSpecs] = useState<string[]>([]);
  const [publicStrk, setPublicStrk] = useState<bigint | null>(null);
  const [privateStrk, setPrivateStrk] = useState<bigint | null>(null);
  const [privateRevealed, setPrivateRevealed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tx, setTx] = useState<TxState>({ kind: "idle" });
  const [maturityTarget, setMaturityTarget] = useState<number | null>(null);
  const [currentBlock, setCurrentBlock] = useState<number | null>(null);

  const connected = Boolean(address && walletAccount);
  const strk20Capable = supportsStrk20(specs);

  useEffect(() => {
    const syncWallets = () => {
      refreshInjectedWallets();
      setWallets(getDiscoveredWallets());
    };

    syncWallets();

    const unsubscribe = walletStore.subscribe(() => {
      setWallets(getDiscoveredWallets());
    });

    // Ready can appear after React has mounted in Android/Mises.
    const timers = [150, 400, 900, 1800, 3500, 6000].map((ms) =>
      window.setTimeout(syncWallets, ms),
    );

    const polling = window.setInterval(syncWallets, 1500);
    const stopPolling = window.setTimeout(
      () => window.clearInterval(polling),
      30000,
    );

    const onFocus = () => syncWallets();
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        syncWallets();
      }
    };

    window.addEventListener("focus", onFocus);
    window.addEventListener("pageshow", onFocus);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      unsubscribe();
      timers.forEach((timer) => window.clearTimeout(timer));
      window.clearInterval(polling);
      window.clearTimeout(stopPolling);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("pageshow", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  useEffect(() => {
    if (!maturityTarget) return;

    let cancelled = false;

    const poll = async () => {
      try {
        const block = Number(await sepoliaProvider.getBlockNumber());
        if (!cancelled) setCurrentBlock(block);
      } catch {
        // The tracker is supplementary; transaction state remains visible.
      }
    };

    void poll();
    const interval = window.setInterval(() => void poll(), 6000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [maturityTarget]);

  const refreshPublicBalance = async () => {
    if (!address) return;

    try {
      setPublicStrk(await readPublicStrk(address));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not read public STRK balance.");
    }
  };

  const connect = async (walletName?: string) => {
    setConnecting(true);
    setError(null);

    try {
      // Force a fresh Android/Mises injection scan before giving up.
      refreshInjectedWallets();

      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, 200);
      });

      let discovered = getDiscoveredWallets();

      if (!discovered.length) {
        refreshInjectedWallets();

        await new Promise<void>((resolve) => {
          window.setTimeout(resolve, 500);
        });

        discovered = getDiscoveredWallets();
      }

      setWallets(discovered);

      if (!discovered.length) {
        throw new Error(
          "Ready was not detected. Unlock Ready, return to CAREL, then tap Connect again.",
        );
      }

      const requested = walletName
        ? discovered.find(
            (wallet) =>
              normalizeWalletName(wallet.name) ===
              normalizeWalletName(walletName),
          )
        : undefined;

      const ready =
        discovered.find((wallet) =>
          normalizeWalletName(wallet.name).includes("ready"),
        ) ?? discovered[0];

      const selected = requested ?? ready;

      // Connect through Wallet Standard first.
      // This is the same connection boundary used by the working VINSS flow.
      const connection =
        await selected.features[StandardConnect].connect({
          silent: false,
        });

      if (!connection.accounts.length) {
        throw new Error("Wallet connected without returning an account.");
      }

      // starknet.js 10.4 carries the Wallet Standard v6 package under
      // an alias. Same runtime wallet, different TypeScript identity.
      const selectedV6 =
        selected as unknown as WalletWithStarknetFeaturesV6;

      const account = await WalletAccountV6.connect(
        { nodeUrl: SEPOLIA_RPC },
        selectedV6,
      );

      const nextAddress = account.address;

      const nextChainId = String(
        await walletV6.requestChainId(selectedV6),
      );

      // Capability check only: does not request private balances.
      const supported =
        await walletV6.supportedWalletApi(selectedV6);

      const nextSpecs = Array.isArray(supported)
        ? supported.map((value) => String(value))
        : [];

      setWalletAccount(account);
      setAddress(nextAddress);
      setChainId(nextChainId);
      setSpecs(nextSpecs);
      setPrivateStrk(null);
      setPrivateRevealed(false);
      setTx({ kind: "idle" });

      try {
        setPublicStrk(await readPublicStrk(nextAddress));
      } catch {
        setPublicStrk(null);
      }
    } catch (cause) {
      console.error("[CAREL] wallet connect failed", cause);

      setError(
        cause instanceof Error
          ? cause.message
          : "Wallet connection failed.",
      );
    } finally {
      setConnecting(false);
    }
  };

  const disconnect = () => {
    setWalletAccount(null);
    setAddress("");
    setChainId("");
    setSpecs([]);
    setPublicStrk(null);
    setPrivateStrk(null);
    setPrivateRevealed(false);
    setTx({ kind: "idle" });
    setMaturityTarget(null);
    setCurrentBlock(null);
    setError(null);
  };

  const assertPrivateReady = () => {
    if (!walletAccount || !address) {
      throw new Error("Connect a wallet first.");
    }

    if (chainId !== constants.StarknetChainId.SN_SEPOLIA) {
      throw new Error("Switch the connected wallet to Starknet Sepolia first.");
    }

    if (!strk20Capable) {
      throw new Error("This wallet does not report STRK20 Wallet API support (>= 0.10).");
    }

    return walletAccount;
  };

  const revealPrivateBalance = async () => {
    setBusy(true);
    setError(null);

    try {
      const account = assertPrivateReady();
      const result = await account.strk20Balances([STRK_TOKEN]);
      setPrivateStrk(readPrivateStrkFromResponse(result));
      setPrivateRevealed(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not read private balance.");
    } finally {
      setBusy(false);
    }
  };

  const submit = async (
    label: string,
    actions: WALLET_API.STRK20_ACTION[],
    trackMaturity: boolean,
  ) => {
    const account = assertPrivateReady();
    const response = await account.strk20InvokeTransaction(actions);
    const hash = response.transaction_hash;

    setTx({ kind: "pending", label, hash });

    try {
      await waitForSubmittedTransaction(hash);
      setTx({ kind: "confirmed", label, hash });

      if (trackMaturity) {
        const block = Number(await sepoliaProvider.getBlockNumber());
        setCurrentBlock(block);
        setMaturityTarget(block + 10);
      }
    } catch {
      setTx({ kind: "submitted", label, hash });
    }

    await refreshPublicBalance();
  };

  const shield = async (amount: string) => {
    setBusy(true);
    setError(null);

    try {
      const units = parseUnits18(amount);
      if (units <= 0n) throw new Error("Shield amount must be greater than zero.");

      await submit(
        `Shield ${amount} STRK`,
        [
          {
            type: "deposit",
            token: STRK_TOKEN,
            amount: num.toHex(units),
          },
        ],
        true,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Shield failed.");
    } finally {
      setBusy(false);
    }
  };

  const unshield = async (amount: string) => {
    setBusy(true);
    setError(null);

    try {
      const units = parseUnits18(amount);
      if (units <= 0n) throw new Error("Unshield amount must be greater than zero.");

      await submit(
        `Unshield ${amount} STRK`,
        [
          {
            type: "withdraw",
            token: STRK_TOKEN,
            amount: num.toHex(units),
            recipient: address,
          },
        ],
        false,
      );

      if (privateRevealed) {
        try {
          const account = assertPrivateReady();
          const result = await account.strk20Balances([STRK_TOKEN]);
          setPrivateStrk(readPrivateStrkFromResponse(result));
        } catch {
          // Keep the previous disclosed balance if refresh is rejected/unavailable.
        }
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unshield failed.");
    } finally {
      setBusy(false);
    }
  };

  const value = useMemo<CarelTestnetContextValue>(
    () => ({
      wallets,
      address,
      chainId,
      connected,
      connecting,
      strk20Capable,
      specs,
      publicStrk,
      privateStrk,
      privateRevealed,
      busy,
      error,
      tx,
      maturityTarget,
      currentBlock,
      connect,
      disconnect,
      refreshPublicBalance,
      revealPrivateBalance,
      shield,
      unshield,
    }),
    [
      wallets,
      address,
      chainId,
      connected,
      connecting,
      strk20Capable,
      specs,
      publicStrk,
      privateStrk,
      privateRevealed,
      busy,
      error,
      tx,
      maturityTarget,
      currentBlock,
    ],
  );

  return (
    <CarelTestnetContext.Provider value={value}>
      {children}
    </CarelTestnetContext.Provider>
  );
}

function useCarelTestnet() {
  const context = useContext(CarelTestnetContext);

  if (!context) {
    throw new Error("useCarelTestnet must be used inside CarelTestnetProvider.");
  }

  return context;
}

export function WalletStatusButton() {
  const {
    address,
    connected,
    connecting,
    chainId,
    strk20Capable,
    connect,
    disconnect,
  } = useCarelTestnet();

  if (!connected) {
    return (
      <button
        className="wallet-pill carel-wallet-button"
        type="button"
        disabled={connecting}
        onClick={() => void connect()}
      >
        <span className="wallet-dot" />
        {connecting ? "Connecting…" : "Connect Ready"}
      </button>
    );
  }

  const isSepolia = chainId === constants.StarknetChainId.SN_SEPOLIA;

  return (
    <button
      className="wallet-pill carel-wallet-button"
      type="button"
      onClick={disconnect}
      title="Disconnect CAREL session"
    >
      <span className={`wallet-dot ${isSepolia && strk20Capable ? "live" : "warn"}`} />
      {shortAddress(address)}
      <small>{isSepolia ? (strk20Capable ? "STRK20" : "NO PRIVACY") : "SWITCH SEPOLIA"}</small>
      <ChevronDown size={13} />
    </button>
  );
}

export function Strk20TestnetPanel() {
  const {
    wallets,
    address,
    chainId,
    connected,
    connecting,
    strk20Capable,
    specs,
    publicStrk,
    privateStrk,
    privateRevealed,
    busy,
    error,
    tx,
    maturityTarget,
    currentBlock,
    connect,
    refreshPublicBalance,
    revealPrivateBalance,
    shield,
    unshield,
  } = useCarelTestnet();

  const [amount, setAmount] = useState("1");
  const isSepolia = chainId === constants.StarknetChainId.SN_SEPOLIA;
  const remaining =
    maturityTarget && currentBlock !== null
      ? Math.max(0, maturityTarget - currentBlock)
      : null;

  return (
    <article className="panel strk20-live-panel">
      <div className="panel-head compact-head">
        <div>
          <span className="panel-kicker">TESTNET EXECUTION</span>
          <h2>STRK20 privacy rail</h2>
        </div>
        <span className={`testnet-live-chip ${connected && isSepolia && strk20Capable ? "ready" : ""}`}>
          <i />
          {connected && isSepolia && strk20Capable ? "READY" : "SEPOLIA"}
        </span>
      </div>

      {!connected ? (
        <div className="testnet-connect-state">
          <div className="testnet-icon">
            <WalletCards size={21} />
          </div>
          <strong>Connect a privacy-enabled Starknet wallet.</strong>
          <p>
            CAREL checks Wallet API support without reading private balances.
            Private balance access is requested separately.
          </p>

          <div className="detected-wallets">
            {wallets.length ? (
              wallets.map((wallet) => (
                <button
                  key={wallet.name}
                  type="button"
                  disabled={connecting}
                  onClick={() => void connect(wallet.name)}
                >
                  {wallet.name}
                </button>
              ))
            ) : (
              <span>No compatible injected Starknet wallet detected yet.</span>
            )}
          </div>
        </div>
      ) : (
        <>
          <div className="testnet-status-grid">
            <div>
              <small>Network</small>
              <strong className={isSepolia ? "ok" : "warn"}>
                {isSepolia ? "Starknet Sepolia" : "Wrong network"}
              </strong>
            </div>
            <div>
              <small>STRK20 Wallet API</small>
              <strong className={strk20Capable ? "ok" : "warn"}>
                {strk20Capable ? "Supported" : "Unavailable"}
              </strong>
            </div>
          </div>

          {!isSepolia && (
            <div className="testnet-warning">
              Switch Ready/Xverse to <strong>Starknet Sepolia</strong>. CAREL will
              not submit STRK20 actions on another network.
            </div>
          )}

          {isSepolia && !strk20Capable && (
            <div className="testnet-warning">
              Wallet API specs: {specs.length ? specs.join(", ") : "none reported"}.
              CAREL requires STRK20 Wallet API ≥ 0.10.
            </div>
          )}

          <div className="testnet-balances">
            <div>
              <span>Public STRK</span>
              <strong>{publicStrk === null ? "—" : formatUnits18(publicStrk)}</strong>
              <button type="button" disabled={busy} onClick={() => void refreshPublicBalance()}>
                <RefreshCw size={13} /> Refresh
              </button>
            </div>

            <div className="private">
              <span>Private STRK</span>
              <strong>
                {privateRevealed
                  ? privateStrk === null
                    ? "0"
                    : formatUnits18(privateStrk)
                  : "Hidden"}
              </strong>
              <button
                type="button"
                disabled={busy || !isSepolia || !strk20Capable}
                onClick={() => void revealPrivateBalance()}
              >
                <EyeOff size={13} />
                {privateRevealed ? "Refresh private" : "Reveal private"}
              </button>
            </div>
          </div>

          <p className="balance-consent-copy">
            Private balance is never used as a capability probe. CAREL asks only
            when you explicitly reveal it.
          </p>

          <div className="testnet-amount">
            <label htmlFor="strk20-amount">Amount</label>
            <div>
              <input
                id="strk20-amount"
                inputMode="decimal"
                value={amount}
                onChange={(event) =>
                  setAmount(event.target.value.replace(/[^0-9.]/g, ""))
                }
              />
              <strong>STRK</strong>
            </div>
          </div>

          <div className="testnet-actions">
            <button
              type="button"
              disabled={busy || !isSepolia || !strk20Capable}
              onClick={() => void shield(amount)}
            >
              <Shield size={15} />
              Shield
            </button>
            <button
              type="button"
              disabled={busy || !isSepolia || !strk20Capable}
              onClick={() => void unshield(amount)}
            >
              <Unlock size={15} />
              Unshield
            </button>
          </div>

          <div className="privacy-truth-list">
            <span><i className="public" /> Shield amount + deposit are public.</span>
            <span><i className="private" /> Mature private notes are protected.</span>
            <span><i className="public" /> Unshield amount + destination are public.</span>
          </div>

          <div className="testnet-note">
            <LockKeyhole size={15} />
            <span>
              Shield can require <strong>two wallet confirmations</strong>:
              ERC-20 approval, then privacy-pool deposit. Fresh notes mature in
              roughly <strong>10 blocks</strong>.
            </span>
          </div>

          {remaining !== null && (
            <div className={`maturity-tracker ${remaining === 0 ? "done" : ""}`}>
              {remaining === 0 ? <Check size={15} /> : <RefreshCw className="spin" size={15} />}
              <span>
                {remaining === 0
                  ? "New private note should now be mature."
                  : `Waiting for note maturity · ~${remaining} blocks remaining`}
              </span>
            </div>
          )}

          {tx.kind !== "idle" && (
            <div className={`testnet-tx ${tx.kind}`}>
              <div>
                <small>{tx.kind === "pending" ? "SUBMITTED" : tx.kind.toUpperCase()}</small>
                <strong>{tx.label}</strong>
              </div>
              <a href={`${SEPOLIA_EXPLORER_TX}${tx.hash}`} target="_blank" rel="noreferrer">
                View tx ↗
              </a>
            </div>
          )}

          {error && <div className="testnet-error">{error}</div>}

          <div className="testnet-address">
            <span>{shortAddress(address)}</span>
            <small>Connected session · secrets stay inside the wallet</small>
          </div>
        </>
      )}
    </article>
  );
}
