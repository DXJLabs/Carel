"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  ArrowRight, CheckCircle2, EyeOff, Layers3, LoaderCircle,
  RefreshCw, ShieldCheck, Sparkles, WalletCards,
} from "lucide-react";

import {
  useCarelTestnet,
} from "@/components/testnet/Strk20Testnet";

import {
  getCarelNetwork,
} from "@/lib/carel/networks";

import {
  formatUnits,
  parseUnits,
} from "@/lib/carel/core/amounts";

import {
  findAssetBalance,
} from "@/lib/carel/core/balances";

import {
  parseLendGoal,
} from "@/lib/agent/lending";

import {
  buildStarknetAgentPlan,
} from "@/lib/agent/starknet-planner";

import {
  createAgentFeeGateCoordinator,
} from "@/lib/agent/client-fee-gate";

import {
  clearActiveAgentRecoveryPointer,
  loadActiveAgentRecoveryPointer,
  loadAgentRecoveryCapsule,
  saveActiveAgentRecoveryPointer,
} from "@/lib/agent/client-recovery";

import type {
  AgentPlan,
} from "@/lib/agent/plan";

import {
  createAgentExecutionSession,
  executeAgentStage,
  restoreSubmittedAgentExecutionSession,
  type AgentExecutionSession,
} from "@/lib/agent/executor";

import type {
  StarknetLendRuntime,
} from "@/lib/agent/starknet-lend-runtime";

import {
  createLiveVesuLendRuntime,
} from "./runtime";

import {
  VESU_LEND_ASSETS,
  getVesuLendAssetBySymbol,
} from "@/lib/carel/ecosystems/starknet/protocols/vesu/lending";

import styles from "../CarelWorkspace.module.css";
import ui from "./VesuLend.module.css";


type LendMode =
  | "normal"
  | "shield"
  | "unshield";


type LendMarket =
  Readonly<{
    id: string;

    provider: string;

    pool:
      Readonly<{
        id: string;
        name: string;
        address: string;
      }>;

    asset:
      Readonly<{
        id: string;
        symbol: string;
        decimals: number;
      }>;

    counterpart:
      Readonly<{
        id: string;
        symbol: string;
        decimals: number;
      }>;

    market:
      Readonly<{
        utilizationBps: number;
        maxUtilizationBps: number;
        observedAt: number;
      }>;
  }>;


function responseObject(
  value: unknown,
): Record<string, unknown> {
  if (
    !value ||
    typeof value !==
      "object" ||
    Array.isArray(value)
  ) {
    throw new Error(
      "CAREL Lend API returned an invalid response.",
    );
  }

  return value as Record<
    string,
    unknown
  >;
}


function shortAddress(
  address: string,
): string {
  if (
    address.length <= 16
  ) {
    return address;
  }

  return `${address.slice(
    0,
    8,
  )}…${address.slice(-6)}`;
}


function percentFromBps(
  value: number,
): string {
  return `${(
    value / 100
  ).toFixed(2)}%`;
}


function LendAssetIcon({ symbol }: { symbol: string }) {
  const icons: Record<string, string> = {
    STRK: "strk", USDC: "usdc", ETH: "eth", USDT: "usdt",
    WBTC: "wbtc", STRKBTC: "strkbtc",
  };
  const name = icons[symbol.toUpperCase()];
  return name
    ? <img className={ui.tokenIcon} src={`/token-icons/${name}.svg`} width={32} height={32} alt=""/>
    : <span className={ui.fallbackIcon} aria-hidden="true">{symbol.slice(0, 1)}</span>;
}

export function VesuLend({
  mode,
  goal,
  onPublicMode,
}: {
  mode: LendMode;
  goal: string;
  onPublicMode: () => void;
}) {
  const wallet =
    useCarelTestnet();

  const feeGateRef =
    useRef(
      createAgentFeeGateCoordinator(),
    );

  const network =
    getCarelNetwork(
      wallet.chainId,
    );

  const [
    amount,
    setAmount,
  ] = useState("1");

  const [
    selectedAssetId,
    setSelectedAssetId,
  ] = useState(
    VESU_LEND_ASSETS[0].id,
  );

  const [
    markets,
    setMarkets,
  ] = useState<
    readonly LendMarket[]
  >([]);

  const [
    selectedPoolId,
    setSelectedPoolId,
  ] = useState("");

  const [
    loading,
    setLoading,
  ] = useState(false);

  const [
    executing,
    setExecuting,
  ] = useState(false);

  const [
    confirming,
    setConfirming,
  ] = useState(false);

  const planRef =
    useRef<
      AgentPlan | null
    >(null);

  const runtimeRef =
    useRef<
      StarknetLendRuntime | null
    >(null);

  const accountRef =
    useRef("");

  const [
    lendAgentSession,
    setLendAgentSession,
  ] =
    useState<
      AgentExecutionSession | null
    >(null);

  const [
    error,
    setError,
  ] = useState("");

  const [
    success,
    setSuccess,
  ] = useState("");


  const selectedAsset =
    useMemo(
      () =>
        VESU_LEND_ASSETS.find(
          (asset) =>
            asset.id ===
            selectedAssetId,
        ) ??
        VESU_LEND_ASSETS[0],

      [selectedAssetId],
    );


  const selectedMarket =
    useMemo(
      () =>
        markets.find(
          (market) =>
            market.pool.id ===
            selectedPoolId,
        ) ??
        markets[0] ??
        null,

      [
        markets,
        selectedPoolId,
      ],
    );


  const flowLocked =
    lendAgentSession !==
      null &&
    lendAgentSession
      .run.status !==
      "completed" &&
    lendAgentSession
      .run.status !==
      "failed";


  const submittedStage =
    lendAgentSession
      ?.run.stages.find(
        (stage) =>
          stage.status ===
            "submitted",
      ) ??
    null;


  const reviewStage =
    lendAgentSession
      ?.run.stages.find(
        (stage) =>
          stage.status ===
            "review",
      ) ??
    null;


  const busy =
    loading ||
    executing ||
    confirming ||
    wallet.busy;


  function stageAction(
    stageId:
      string,
  ) {
    return (
      planRef.current
        ?.stages.find(
          (stage) =>
            stage.id ===
              stageId,
        )
        ?.action ??
      null
    );
  }


  function rememberLendRecovery(
    plan:
      AgentPlan,

    session:
      AgentExecutionSession,

    stageId:
      string,
  ) {
    if (
      !wallet.address
    ) {
      return;
    }


    if (
      session.run.status ===
        "completed"
    ) {
      clearActiveAgentRecoveryPointer({
        kind:
          "lend",

        account:
          wallet.address,
      });

      return;
    }


    const stage =
      session.run.stages.find(
        (candidate) =>
          candidate.stageId ===
            stageId,
      );


    if (
      stage?.status !==
        "submitted" ||
      !stage.txHash
    ) {
      return;
    }


    saveActiveAgentRecoveryPointer({
      version:
        1,

      kind:
        "lend",

      account:
        wallet.address,

      chainId:
        wallet.chainId,

      runId:
        session.runId,

      stageId,

      goal:
        plan.objective.goal,

      mode,
    });
  }


  function clearAgentFlow() {
    planRef.current =
      null;

    runtimeRef.current =
      null;

    accountRef.current =
      "";

    setLendAgentSession(
      null,
    );
  }


  useEffect(() => {
    try {
      const parsed =
        parseLendGoal(
          goal,
        );

      const asset =
        getVesuLendAssetBySymbol(
          parsed.symbol,
        );

      if (asset) {
        setSelectedAssetId(
          asset.id,
        );

        setAmount(
          parsed.amountText,
        );

      }
    } catch {
      // Manual form remains available.
    }
  }, [goal]);


  async function loadMarkets(
    assetId:
      string =
      selectedAssetId,
  ) {
    if (
      !network ||
      network.id !==
        "mainnet"
    ) {
      setMarkets([]);

      throw new Error(
        "CAREL Lend is currently enabled on Starknet Mainnet only.",
      );
    }

    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const query =
        new URLSearchParams({
          assetId,
        });

      const response =
        await fetch(
          `/api/vesu/lend/markets?${query.toString()}`,
          {
            cache:
              "no-store",
          },
        );

      const raw:
        unknown =
        await response.json();

      const payload =
        responseObject(
          raw,
        );

      if (
        !response.ok
      ) {
        throw new Error(
          typeof payload.error ===
            "string"
            ? payload.error
            : "Could not load Vesu lending markets.",
        );
      }

      const discovered =
        Array.isArray(
          payload.markets,
        )
          ? payload.markets as LendMarket[]
          : [];

      if (
        !discovered.length
      ) {
        throw new Error(
          `No verified Vesu ${selectedAsset.symbol} lending market is available right now.`,
        );
      }

      setMarkets(
        discovered,
      );

      setSelectedPoolId(
        discovered[0]
          .pool.id,
      );
    } finally {
      setLoading(false);
    }
  }


  useEffect(() => {
    setMarkets([]);
    setSelectedPoolId("");
    setError("");
    setSuccess("");

    if (
      wallet.connected &&
      network?.id ===
        "mainnet"
    ) {
      void loadMarkets(
        selectedAssetId,
      ).catch(
        (cause) => {
          setError(
            cause instanceof Error
              ? cause.message
              : "Could not load Vesu lending markets.",
          );
        },
      );
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    wallet.address,
    wallet.chainId,
    mode,
    selectedAssetId,
  ]);


  useEffect(() => {
    clearAgentFlow();

    setError("");
    setSuccess("");
  }, [
    wallet.address,
    wallet.chainId,
    mode,
  ]);


  useEffect(() => {
    let cancelled =
      false;


    if (
      !wallet.connected ||
      !wallet.address
    ) {
      return;
    }


    const pointer =
      loadActiveAgentRecoveryPointer({
        kind:
          "lend",

        account:
          wallet.address,
      });


    if (
      !pointer ||
      pointer.chainId !==
        wallet.chainId ||
      pointer.mode !==
        mode
    ) {
      return;
    }


    void (
      async () => {
        const capsule =
          await loadAgentRecoveryCapsule({
            account:
              wallet.address,

            runId:
              pointer.runId,

            stageId:
              pointer.stageId,
          });


        if (
          cancelled ||
          !capsule ||
          capsule.kind !==
            "lend" ||
          capsule.chainId !==
            wallet.chainId
        ) {
          return;
        }


        const plan =
          buildStarknetAgentPlan({
            goal:
              pointer.goal,

            chainId:
              wallet.chainId,

            mode:
              pointer.mode,
          });


        if (
          plan.status !==
            "ready"
        ) {
          return;
        }


        const feeGate =
          await feeGateRef.current
            .resume(
              plan,
              {
                runId:
                  pointer.runId,

                chainId:
                  wallet.chainId,

                payer:
                  wallet.address,
              },
            );


        if (cancelled) {
          return;
        }


        const session =
          restoreSubmittedAgentExecutionSession(
            plan,
            pointer.runId,
            pointer.stageId,
            {
              kind:
                "transaction",

              id:
                capsule
                  .transactionId,
            },
            feeGate.authorization,
          );


        /*
         * Confirmation of an existing tx does not require a currently loaded
         * Vesu market. New stages still require one.
         */
        const runtime =
          createLiveVesuLendRuntime({
            wallet,

            market:
              null,
          });


        planRef.current =
          plan;

        runtimeRef.current =
          runtime;

        accountRef.current =
          wallet.address;


        feeGateRef.current
          .markProtocolStarted(
            pointer.runId,
          );


        try {
          const parsed =
            parseLendGoal(
              pointer.goal,
            );


          const asset =
            getVesuLendAssetBySymbol(
              parsed.symbol,
            );


          if (asset) {
            setSelectedAssetId(
              asset.id,
            );
          }


          setAmount(
            parsed.amountText,
          );
        } catch {
          // Signed Agent plan remains authoritative.
        }


        setLendAgentSession(
          session,
        );

        setError(
          "",
        );

        setSuccess(
          "Recovered the submitted Vesu Lend Agent transaction. Confirm it to continue.",
        );
      }
    )().catch(
      (cause) => {
        if (cancelled) {
          return;
        }


        setError(
          cause instanceof Error
            ? cause.message
            : "Could not recover the submitted Vesu Lend Agent transaction.",
        );
      },
    );


    return () => {
      cancelled =
        true;
    };
  }, [
    wallet.connected,
    wallet.address,
    wallet.chainId,
    mode,
  ]);


  function executionContext(
    session:
      AgentExecutionSession,
  ) {
    return {
      runId:
        session.runId,

      chainId:
        wallet.chainId,

      account:
        wallet.address,
    };
  }


  async function startAgentLend() {
    if (
      busy ||
      flowLocked ||
      !selectedMarket ||
      !wallet.address ||
      !network ||
      network.id !==
        "mainnet"
    ) {
      return;
    }


    setExecuting(true);
    setError("");
    setSuccess("");


    try {
      const units =
        parseUnits(
          amount,
          selectedAsset.decimals,
        );


      if (
        units <= 0n
      ) {
        throw new Error(
          "Lend amount must be greater than zero.",
        );
      }


      if (
        mode !==
          "normal" &&
        (
          !wallet.strk20Capable ||
          !network.privacyEnabled
        )
      ) {
        throw new Error(
          "Ready STRK20 privacy support is required for this Lend mode.",
        );
      }


      if (
        mode ===
          "unshield"
      ) {
        if (
          !wallet.privateRevealed
        ) {
          throw new Error(
            `Reveal private ${selectedAsset.symbol} before Unshield Lend.`,
          );
        }


        const privateBalance =
          findAssetBalance(
            wallet.balances,
            selectedAsset.id,
            "private",
          )?.amount ??
          0n;


        if (
          privateBalance <
            units
        ) {
          throw new Error(
            `Private ${selectedAsset.symbol} balance is below this Lend amount.`,
          );
        }
      }


      const plan =
        buildStarknetAgentPlan({
          goal:
            `Lend ${amount} ${selectedAsset.symbol}.`,

          chainId:
            wallet.chainId,

          mode,
        });


      if (
        plan.status !==
          "ready"
      ) {
        throw new Error(
          plan.message ??
          "CAREL could not build the Vesu Lend Agent plan.",
        );
      }


      const runtime =
        createLiveVesuLendRuntime({
          wallet,

          market:
            selectedMarket,
        });


      const feeGate =
        await feeGateRef.current
          .prepare(
            plan,
            {
              prefix:
                "lend",

              chainId:
                wallet.chainId,

              payer:
                wallet.address,

              executeAgentFee:
                wallet.executeAgentFee,
            },
          );


      const session =
        createAgentExecutionSession(
          plan,
          feeGate.runId,
          feeGate.authorization,
        );


      planRef.current =
        plan;

      runtimeRef.current =
        runtime;

      accountRef.current =
        wallet.address;

      setLendAgentSession(
        session,
      );


      const first =
        session
          .run.stages.find(
            (stage) =>
              stage.status ===
                "review",
          );


      if (!first) {
        throw new Error(
          "Vesu Lend Agent plan has no executable stage.",
        );
      }


      const result =
        await executeAgentStage(
          plan,
          session,
          first.stageId,
          executionContext(
            session,
          ),
          runtime.registry,
        );


      feeGateRef.current
        .markProtocolStarted(
          session.runId,
        );


      setLendAgentSession(
        result.session,
      );


      rememberLendRecovery(
        plan,
        result.session,
        first.stageId,
      );


      setSuccess(
        stageAction(
          first.stageId,
        ) ===
          "unshield"
          ? "Unshield submitted through Agent Core. Vesu Lend stays locked until the exact public output is verified."
          : mode ===
              "shield"
            ? "Shield Lend submitted through Agent Core. Verify confirmation to complete the private-receipt stage."
            : "Vesu Lend submitted through Agent Core. Verify the public vToken position to complete the plan.",
      );
    } catch (cause) {
      clearAgentFlow();

      setError(
        cause instanceof Error
          ? cause.message
          : "Vesu Lend Agent execution failed.",
      );
    } finally {
      setExecuting(false);
    }
  }


  async function executeNextStage() {
    if (
      busy ||
      !lendAgentSession ||
      !reviewStage
    ) {
      return;
    }


    const plan =
      planRef.current;

    let runtime =
      runtimeRef.current;


    if (
      !plan ||
      !runtime ||
      accountRef.current !==
        wallet.address
    ) {
      setError(
        "Wallet account changed. Restart Vesu Lend.",
      );

      return;
    }


    setExecuting(true);
    setError("");
    setSuccess("");


    try {
      if (
        stageAction(
          reviewStage.stageId,
        ) ===
          "lend"
      ) {
        if (!selectedMarket) {
          throw new Error(
            "Refresh and select a verified Vesu market before continuing Lend.",
          );
        }


        runtime =
          createLiveVesuLendRuntime({
            wallet,

            market:
              selectedMarket,
          });


        runtimeRef.current =
          runtime;
      }


      const result =
        await executeAgentStage(
          plan,
          lendAgentSession,
          reviewStage.stageId,
          executionContext(
            lendAgentSession,
          ),
          runtime.registry,
        );


      setLendAgentSession(
        result.session,
      );


      rememberLendRecovery(
        plan,
        result.session,
        reviewStage.stageId,
      );


      setSuccess(
        "Fresh Vesu Lend preparation was executed. Verify the public vToken position to finish.",
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not execute the next Vesu Lend stage.",
      );
    } finally {
      setExecuting(false);
    }
  }


  async function confirmSubmitted() {
    if (
      busy ||
      !lendAgentSession ||
      !submittedStage
    ) {
      return;
    }


    const plan =
      planRef.current;

    const runtime =
      runtimeRef.current;


    if (
      !plan ||
      !runtime ||
      accountRef.current !==
        wallet.address
    ) {
      setError(
        "Wallet account changed. Restart Vesu Lend.",
      );

      return;
    }


    setConfirming(true);
    setError("");
    setSuccess("");


    try {
      const next =
        await runtime
          .confirmSubmittedStage(
            plan,
            lendAgentSession,
            submittedStage.stageId,
            executionContext(
              lendAgentSession,
            ),
          );


      setLendAgentSession(
        next,
      );


      try {
        await wallet
          .refreshAssetBalances();
      } catch {
        // Agent runtime already performed required execution verification.
      }


      if (
        next.run.status ===
          "completed"
      ) {
        clearActiveAgentRecoveryPointer({
          kind:
            "lend",

          account:
            wallet.address,
        });


        setSuccess(
          mode ===
            "shield"
            ? "Shield Lend Agent plan completed. The Vesu receipt remains private."
            : "Vesu Lend Agent plan completed and the resulting position was verified.",
        );


        try {
          await loadMarkets(
            selectedAsset.id,
          );
        } catch {
          // Keep verified Agent result visible.
        }

        return;
      }


      const nextReview =
        next
          .run.stages.find(
            (stage) =>
              stage.status ===
                "review",
          );


      if (
        nextReview &&
        stageAction(
          nextReview.stageId,
        ) ===
          "lend"
      ) {
        setSuccess(
          `Unshielded ${selectedAsset.symbol} is verified publicly. Fresh Vesu Lend execution is now unlocked.`,
        );
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The submitted Vesu Lend stage is not verified yet.",
      );
    } finally {
      setConfirming(false);
    }
  }


  function resetAgentLend() {
    if (
      wallet.address
    ) {
      clearActiveAgentRecoveryPointer({
        kind:
          "lend",

        account:
          wallet.address,
      });
    }


    clearAgentFlow();

    setError("");
    setSuccess("");
  }


  if (
    !wallet.connected
  ) {
    return (
      <section
        className={
          styles.borrowPanel
        }
      >
        <p
          className={
            styles.helper
          }
        >
          Connect Ready to use
          Vesu Lending.
        </p>

        <button
          type="button"
          className={
            styles.secondary
          }
          disabled={
            wallet.connecting
          }
          onClick={() =>
            void wallet.connect()
          }
        >
          <WalletCards
            size={16}
          />

          {wallet.connecting
            ? "Connecting…"
            : "Connect wallet"}
        </button>
      </section>
    );
  }


  if (
    !network ||
    network.id !==
      "mainnet"
  ) {
    return (
      <section
        className={
          styles.borrowPanel
        }
      >
        <div
          className={
            styles.notice
          }
        >
          <p>
            Vesu Lend is enabled
            on Starknet Mainnet.
          </p>
        </div>
      </section>
    );
  }


  let parsedAmount:
    bigint | null =
      null;

  try {
    const value =
      parseUnits(
        amount,
        selectedAsset.decimals,
      );

    if (value > 0n) {
      parsedAmount =
        value;
    }
  } catch {
    parsedAmount =
      null;
  }

  const privateBalance =
    wallet.privateRevealed
      ? findAssetBalance(
          wallet.balances,
          selectedAsset.id,
          "private",
        )?.amount ?? 0n
      : null;

  const publicBalance =
    findAssetBalance(
      wallet.balances,
      selectedAsset.id,
      "public",
    )?.amount ?? null;

  const privateEnough =
    parsedAmount !== null &&
    privateBalance !== null &&
    privateBalance >=
      parsedAmount;

  const lendingMode = mode === "normal" ? "CAREL Lend" : mode === "shield" ? "Shield Lend" : "Unshield Lend";
  const sourceVisibility = mode === "unshield" ? "Private" : "Public";
  const totalAvailable = mode === "unshield" ? privateBalance : publicBalance;
  const formatBalance = (value: bigint | null) =>
    value === null ? "Not available" : `${formatUnits(value, selectedAsset.decimals, 6)} ${selectedAsset.symbol}`;

  function chooseLendAsset(id: string) {
    if (busy || flowLocked || selectedAssetId === id) return;
    clearAgentFlow();
    setSelectedAssetId(id);
    setMarkets([]);
    setSelectedPoolId("");
    setError("");
    setSuccess("");
  }

  return <section className={ui.shell} aria-label="CAREL Vesu lending workflow">
    <div className={ui.heading}>
      <div className={ui.headingTitle}>
        <span className={ui.agentIcon}><Sparkles size={18} aria-hidden="true"/></span>
        <div><h3>{lendingMode}</h3><p>Agent-prepared deposit · Wallet-approved execution</p></div>
      </div>
      <span className={ui.providerPill}>Vesu</span>
    </div>

    <div className={ui.depositCard}>
      <div className={ui.fieldTop}>
        <label htmlFor="carel-lend-amount">{sourceVisibility} deposit</label>
        <span>Starknet Mainnet</span>
      </div>
      <div className={ui.amountRow}>
        <input id="carel-lend-amount" type="text" inputMode="decimal"
          aria-label={`${selectedAsset.symbol} lend amount`} className={ui.amountInput}
          value={amount} disabled={busy || flowLocked}
          onChange={event => { setAmount(event.target.value); setError(""); setSuccess(""); }}/>
        <span className={ui.activeAsset}><LendAssetIcon symbol={selectedAsset.symbol}/><strong>{selectedAsset.symbol}</strong></span>
      </div>
      <div className={ui.depositFoot}>
        <span>Observed {sourceVisibility.toLowerCase()} balance</span>
        <strong>{sourceVisibility === "Private" && !wallet.privateRevealed ? "Hidden · reveal first" : formatBalance(totalAvailable)}</strong>
      </div>
    </div>

    <div className={ui.assetSection}>
      <div className={ui.subheading}>
        <span>Deposit asset</span>
        <small>Markets verified separately</small>
      </div>
      <div className={ui.assetList} role="group" aria-label="Choose Vesu lending asset">
        {VESU_LEND_ASSETS.map(asset => <button type="button"
          key={asset.id} className={ui.assetChoice} aria-pressed={selectedAssetId === asset.id}
          disabled={busy || flowLocked}
          onClick={() => chooseLendAsset(asset.id)}>
          <LendAssetIcon symbol={asset.symbol}/><span>{asset.symbol}</span>
        </button>)}
      </div>
    </div>

    <section className={ui.marketPanel} aria-label="Vesu lending market">
      <div className={ui.marketHeader}>
        <div><strong>Vesu market</strong><span>{loading ? "Checking verified markets…" :
          selectedMarket ? "Market context verified" : "No verified market available"}</span></div>
        <button type="button" className={ui.refresh} aria-label="Refresh Vesu lending markets"
          disabled={busy || flowLocked}
          onClick={() => void loadMarkets().catch(cause => setError(cause instanceof Error ? cause.message : "Could not refresh Vesu markets."))}>
          {loading ? <LoaderCircle size={17}/> : <RefreshCw size={17}/>}
        </button>
      </div>

      {markets.length > 1 && <div className={ui.poolChoices} role="group" aria-label="Choose Vesu lending pool">
        {markets.map(market => <button type="button" className={ui.poolChoice}
          key={market.pool.id} aria-pressed={selectedMarket?.pool.id === market.pool.id}
          disabled={busy || flowLocked}
          onClick={() => { clearAgentFlow(); setSelectedPoolId(market.pool.id); setError(""); setSuccess(""); }}>
          {market.pool.name}
        </button>)}
      </div>}

      {selectedMarket
        ? <>
            <div className={ui.marketName}>{selectedMarket.pool.name}</div>
            <div className={ui.marketStats}>
              <div><span>Market utilization</span><strong>{percentFromBps(selectedMarket.market.utilizationBps)}</strong></div>
              <div><span>Market pair</span><strong>{selectedMarket.asset.symbol} / {selectedMarket.counterpart.symbol}</strong></div>
              <div><span>Supply APY</span><strong>Not available</strong></div>
            </div>
            <p className={ui.marketHint}>Utilization is not APY. Yield is variable and not verified here. Pool {shortAddress(selectedMarket.pool.address)}.</p>
          </>
        : <p className={ui.empty}>CAREL requires a verified active Vesu market before preparing a deposit. Registered tokens alone do not guarantee an executable pool.</p>}
    </section>

    {mode === "shield" && <section className={ui.privacyPanel}>
      <ShieldCheck size={18} aria-hidden="true"/>
      <div><strong>Shield Lend · private receipt</strong>
        <span>Public {selectedAsset.symbol} → STRK20 anonymizer → Vesu → private vToken. CAREL verifies the pool and vToken before execution.</span>
        <button type="button" onClick={onPublicMode}>Use public lending <ArrowRight size={13}/></button>
      </div>
    </section>}

    {mode === "unshield" && <section className={ui.privacyPanel}>
      <EyeOff size={18} aria-hidden="true"/>
      <div><strong>Unshield first, then Lend</strong>
        <span>Public Vesu deposit remains locked until the exact Unshield output is confirmed and verified.</span>
        {!wallet.strk20Capable
          ? <p role="alert" className={ui.privacyWarning}>Ready does not expose the required STRK20 Wallet API.</p>
          : !wallet.privateRevealed
            ? <button type="button" disabled={busy} onClick={() => void wallet.revealPrivateBalance()}>
                Reveal private balance <ArrowRight size={13}/></button>
            : !privateEnough && parsedAmount !== null
              ? <p role="alert" className={ui.privacyWarning}>Private {selectedAsset.symbol} balance is below this Lend amount.</p>
              : null}
      </div>
    </section>}

    {lendAgentSession && <section className={ui.runPanel} aria-label="Agent lending execution progress">
      <div className={ui.runHead}><strong>Agent execution</strong><span>{lendAgentSession.run.status.replaceAll("-", " ")}</span></div>
      {lendAgentSession.run.stages.map((stage, i) => <div className={ui.runStage} key={stage.stageId}>
        <span className={ui.runIndex}>{i + 1}</span>
        <span>{stageAction(stage.stageId) ?? "stage"}</span>
        <strong>{stage.status}{stage.txHash ? ` · ${shortAddress(stage.txHash)}` : ""}</strong>
      </div>)}
    </section>}

    <div className={ui.actions}>
      {!flowLocked && (!lendAgentSession || (lendAgentSession.run.status !== "completed" && lendAgentSession.run.status !== "failed")) &&
        <button type="button" className={ui.primary}
          disabled={busy || !selectedMarket || (mode === "shield" && !wallet.strk20Capable) ||
            (mode === "unshield" && (!wallet.strk20Capable || !wallet.privateRevealed || !privateEnough))}
          onClick={() => void startAgentLend()}>
          {executing ? <LoaderCircle size={18}/> : <Sparkles size={18}/>}
          <span>{executing ? "Waiting for wallet…" :
            mode === "shield" ? `Review & Shield Lend ${selectedAsset.symbol}` :
            mode === "unshield" ? `Start Unshield Lend ${selectedAsset.symbol}` :
              `Review & Lend ${selectedAsset.symbol}`}</span>
          <ArrowRight size={18}/>
        </button>}
      {flowLocked && submittedStage &&
        <button type="button" className={ui.primary} disabled={busy}
          onClick={() => void confirmSubmitted()}>
          {confirming ? <LoaderCircle size={18}/> : <RefreshCw size={18}/>}
          <span>{confirming ? "Checking confirmation…" : "Check Agent confirmation"}</span><ArrowRight size={18}/>
        </button>}
      {flowLocked && !submittedStage && reviewStage &&
        <button type="button" className={ui.primary} disabled={busy}
          onClick={() => void executeNextStage()}>
          {executing ? <LoaderCircle size={18}/> : <ArrowRight size={18}/>}
          <span>{executing ? "Waiting for wallet…" : `Execute Vesu Lend ${selectedAsset.symbol}`}</span><ArrowRight size={18}/>
        </button>}
      {lendAgentSession && (lendAgentSession.run.status === "completed" || lendAgentSession.run.status === "failed") &&
        <button type="button" className={ui.secondary} disabled={busy} onClick={resetAgentLend}>
          <RefreshCw size={16}/> New Lend
        </button>}
    </div>
    <p className={ui.approval}><CheckCircle2 size={15} aria-hidden="true"/>
      CAREL verifies the Vesu route. Your wallet approves each transaction.</p>

    <div className={ui.positionInfo}>
      <Layers3 size={16} aria-hidden="true"/>
      <span>Your Vesu lending positions and vTokens can be reviewed in Portfolio. This deposit form does not estimate unverified balances, rewards, or APY.</span>
    </div>
    {error && <p className={ui.notice} role="alert">{error}</p>}
    {success && <p className={ui.success} role="status">{success}</p>}
  </section>;
}
