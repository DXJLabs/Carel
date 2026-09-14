"use client";

import { useMemo, useState } from "react";
import {
  Activity,
  Bot,
  Check,
  ChevronDown,
  EyeOff,
  Home,
  LockKeyhole,
  Orbit,
  RefreshCw,
  Route,
  ShieldCheck,
  Sparkles,
  WalletCards,
  Zap,
} from "lucide-react";
import { constants } from "starknet";

import {
  useCarelTestnet,
  WalletStatusButton,
} from "@/components/testnet/Strk20Testnet";
import {
  buildLivePlan,
  type LiveGoal,
} from "@/lib/agent/livePlanner";
import { formatUnits18 } from "@/lib/strk20/units";
import { SEPOLIA_EXPLORER_TX } from "@/lib/strk20/config";

const ZERO = BigInt(0);

function fmt(value: bigint | null) {
  return value === null ? "Not loaded" : `${formatUnits18(value)} STRK`;
}

function actionLabel(action: string) {
  if (action === "shield") return "Shield";
  if (action === "unshield") return "Unshield";
  return "None";
}

export function CarelApp() {
  const wallet = useCarelTestnet();

  const [goal, setGoal] = useState<LiveGoal>("target-private");
  const [target, setTarget] = useState("1");
  const [planned, setPlanned] = useState(false);
  const [executing, setExecuting] = useState(false);

  const isSepolia =
    wallet.chainId === constants.StarknetChainId.SN_SEPOLIA;

  const plan = useMemo(
    () =>
      buildLivePlan({
        goal,
        targetText: target,
        connected: wallet.connected,
        networkReady: isSepolia,
        strk20Capable: wallet.strk20Capable,
        publicStrk: wallet.publicStrk,
        privateStrk: wallet.privateStrk,
        privateRevealed: wallet.privateRevealed,
      }),
    [
      goal,
      target,
      wallet.connected,
      wallet.strk20Capable,
      wallet.publicStrk,
      wallet.privateStrk,
      wallet.privateRevealed,
      isSepolia,
    ],
  );

  const execute = async () => {
    if (plan.status !== "ready") return;

    setExecuting(true);

    try {
      const amount = formatUnits18(plan.delta, 18);

      if (plan.action === "shield") {
        await wallet.shield(amount);
      } else if (plan.action === "unshield") {
        await wallet.unshield(amount);
      }
    } finally {
      setExecuting(false);
    }
  };

  return (
    <div className="cs-app">
      <header className="cs-header">
        <div className="cs-brand">
          <span><Orbit size={18} /></span>
          <strong>CAREL</strong>
        </div>
        <WalletStatusButton />
      </header>

      <main className="cs-main">
        <section className="cs-intro">
          <div className="cs-kicker">
            <Sparkles size={13} />
            AGENTIC PRIVATE DEFI
          </div>
          <h1>What should your capital do?</h1>
          <p>
            Set the outcome. CAREL checks your wallet, plans the minimum action,
            and asks before moving funds.
          </p>
        </section>

        <section className="cs-balances">
          <div className="cs-balance-card private">
            <div className="cs-balance-title">
              <span>Private balance</span>
              <EyeOff size={16} />
            </div>
            <strong>
              {wallet.privateRevealed
                ? fmt(wallet.privateStrk ?? ZERO)
                : "Hidden"}
            </strong>
            <button
              type="button"
              disabled={!wallet.connected || !isSepolia || wallet.busy}
              onClick={() => void wallet.revealPrivateBalance()}
            >
              {wallet.privateRevealed ? "Refresh" : "Reveal"}
            </button>
          </div>

          <div className="cs-balance-card">
            <div className="cs-balance-title">
              <span>Public balance</span>
              <WalletCards size={16} />
            </div>
            <strong>{fmt(wallet.publicStrk)}</strong>
            <button
              type="button"
              disabled={!wallet.connected || wallet.busy}
              onClick={() => void wallet.refreshPublicBalance()}
            >
              Refresh
            </button>
          </div>
        </section>

        <section className="cs-command">
          <div className="cs-command-head">
            <Bot size={17} />
            <span>Tell CAREL the target</span>
          </div>

          <div className="cs-mode">
            <button
              type="button"
              className={goal === "target-private" ? "active" : ""}
              onClick={() => {
                setGoal("target-private");
                setPlanned(false);
              }}
            >
              <EyeOff size={14} />
              Keep private
            </button>

            <button
              type="button"
              className={goal === "target-public" ? "active" : ""}
              onClick={() => {
                setGoal("target-public");
                setPlanned(false);
              }}
            >
              <WalletCards size={14} />
              Keep public
            </button>
          </div>

          <div className="cs-target">
            <span>Keep at least</span>
            <input
              inputMode="decimal"
              value={target}
              onChange={(event) => {
                setTarget(event.target.value.replace(/[^0-9.]/g, ""));
                setPlanned(false);
              }}
            />
            <b>STRK</b>
          </div>

          <button
            type="button"
            className="cs-build"
            onClick={() => setPlanned(true)}
          >
            <Sparkles size={16} />
            Build plan
          </button>
        </section>

        {planned && (
          <section className={`cs-result ${plan.status}`}>
            {plan.status === "satisfied" && (
              <>
                <div className="cs-result-icon good"><Check size={20} /></div>
                <div className="cs-result-copy">
                  <small>CAREL DECISION</small>
                  <h2>Nothing to do</h2>
                  <p>{plan.reason}</p>
                  <div className="cs-result-note">
                    CAREL will not move any funds.
                  </div>
                </div>
              </>
            )}

            {plan.status === "needs-private-state" && (
              <>
                <div className="cs-result-icon"><EyeOff size={20} /></div>
                <div className="cs-result-copy">
                  <small>CAREL NEEDS ACCESS</small>
                  <h2>Reveal private balance</h2>
                  <p>{plan.reason}</p>
                  <button
                    type="button"
                    className="cs-primary"
                    disabled={wallet.busy}
                    onClick={() => void wallet.revealPrivateBalance()}
                  >
                    <EyeOff size={15} />
                    Reveal private
                  </button>
                </div>
              </>
            )}

            {plan.status === "ready" && (
              <>
                <div className="cs-result-icon action"><Zap size={20} /></div>
                <div className="cs-result-copy">
                  <small>CAREL RECOMMENDS</small>
                  <h2>
                    {actionLabel(plan.action)} {formatUnits18(plan.delta)} STRK
                  </h2>
                  <p>{plan.reason}</p>

                  <div className="cs-mini-route">
                    <span>{plan.action === "shield" ? "Public" : "Private"}</span>
                    <b>→</b>
                    <span>{actionLabel(plan.action)}</span>
                    <b>→</b>
                    <span>{goal === "target-private" ? "Private" : "Public"}</span>
                  </div>

                  <button
                    type="button"
                    className="cs-primary"
                    disabled={wallet.busy || executing}
                    onClick={() => void execute()}
                  >
                    <ShieldCheck size={15} />
                    {executing || wallet.busy
                      ? "Waiting for Ready…"
                      : `Approve in Ready`}
                  </button>
                </div>
              </>
            )}

            {plan.status === "blocked" && (
              <>
                <div className="cs-result-icon"><LockKeyhole size={20} /></div>
                <div className="cs-result-copy">
                  <small>CAREL BLOCKED</small>
                  <h2>Cannot execute this target</h2>
                  <p>{plan.reason}</p>
                </div>
              </>
            )}
          </section>
        )}

        {wallet.tx.kind !== "idle" && (
          <section className="cs-tx">
            <div>
              <small>{wallet.tx.kind.toUpperCase()}</small>
              <strong>{wallet.tx.label}</strong>
            </div>
            <a
              href={`${SEPOLIA_EXPLORER_TX}${wallet.tx.hash}`}
              target="_blank"
              rel="noreferrer"
            >
              View tx ↗
            </a>
          </section>
        )}

        {wallet.error && (
          <div className="cs-error">{wallet.error}</div>
        )}

        <details className="cs-details">
          <summary>
            <span>
              <Activity size={15} />
              Technical details
            </span>
            <ChevronDown size={15} />
          </summary>

          <div className="cs-details-body">
            <DetailRow
              label="Wallet"
              value={wallet.connected ? "Connected" : "Disconnected"}
            />
            <DetailRow
              label="Network"
              value={isSepolia ? "Starknet Sepolia" : "Not ready"}
            />
            <DetailRow
              label="STRK20"
              value={wallet.strk20Capable ? "Supported" : "Unavailable"}
            />
            <DetailRow
              label="Private state"
              value={wallet.privateRevealed ? "User-approved" : "Hidden"}
            />

            <div className="cs-privacy-note">
              Shield deposit is public. Mature notes are private. Unshield amount
              and destination are public.
            </div>
          </div>
        </details>
      </main>

      <nav className="cs-nav">
        <button className="active"><Home size={18} /><span>Home</span></button>
        <button><Route size={18} /><span>Strategies</span></button>
        <button><Activity size={18} /><span>Activity</span></button>
      </nav>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="cs-detail-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
