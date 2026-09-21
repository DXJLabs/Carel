"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type {
  Quote,
} from "@avnu/avnu-sdk";

import {
  useCarelTestnet,
} from "@/components/testnet/Strk20Testnet";

import {
  getCarelNetwork,
} from "@/lib/carel/networks";

import {
  parseUnits,
} from "@/lib/carel/core/amounts";

import {
  parseSwapGoal,
} from "@/lib/agent/swap";

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
  buildStarknetAgentPlan,
} from "@/lib/agent/starknet-planner";

import {
  createAgentExecutionSession,
  executeAgentStage,
  restoreSubmittedAgentExecutionSession,
  type AgentExecutionSession,
} from "@/lib/agent/executor";

import type {
  StarknetSwapRuntime,
} from "@/lib/agent/starknet-swap-runtime";

import {
  getAvnuSwapQuote,
  type AvnuSwapMode,
} from "@/lib/carel/ecosystems/starknet/protocols/avnu/swap";

import {
  createAvnuSwapRuntime,
} from "./runtime";


export function useSwapController({
  mode,
  goal,
}: Readonly<{
  mode:
    AvnuSwapMode;

  goal:
    string;
}>) {
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

  const swapAssets =
    useMemo(
      () =>
        network
          ? [
              network.assets.strk,
              network.assets.usdc,
            ]
          : [],
      [network],
    );

  const [
    sellSymbol,
    setSellSymbol,
  ] = useState("STRK");

  const [
    buySymbol,
    setBuySymbol,
  ] = useState("USDC");

  const [
    amount,
    setAmount,
  ] = useState("1");

  const [
    quote,
    setQuote,
  ] = useState<Quote | null>(
    null,
  );

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

  const [
    error,
    setError,
  ] = useState("");

  const [
    success,
    setSuccess,
  ] = useState("");

  const planRef =
    useRef<AgentPlan | null>(
      null,
    );

  const runtimeRef =
    useRef<
      StarknetSwapRuntime | null
    >(null);

  const accountRef =
    useRef("");

  const [
    swapAgentSession,
    setSwapAgentSession,
  ] = useState<
    AgentExecutionSession | null
  >(null);


  const sellAsset =
    swapAssets.find(
      (asset) =>
        asset.symbol ===
        sellSymbol,
    ) ??
    swapAssets[0] ??
    null;

  const buyAsset =
    swapAssets.find(
      (asset) =>
        asset.symbol ===
        buySymbol,
    ) ??
    swapAssets.find(
      (asset) =>
        asset.id !==
        sellAsset?.id,
    ) ??
    null;

  const ready =
    wallet.connected &&
    network !== null &&
    sellAsset !== null &&
    buyAsset !== null &&
    sellAsset.id !==
      buyAsset.id;

  const flowLocked =
    swapAgentSession !==
      null &&
    swapAgentSession
      .run.status !==
      "completed";

  const submittedStage =
    swapAgentSession
      ?.run.stages.find(
        (stage) =>
          stage.status ===
            "submitted",
      ) ??
    null;

  const reviewStage =
    swapAgentSession
      ?.run.stages.find(
        (stage) =>
          stage.status ===
            "review",
      ) ??
    null;

  const verifiedSwapOutput =
    swapAgentSession
      ?.outputs["swap-2"] ??
    swapAgentSession
      ?.outputs["swap-1"] ??
    null;


  function stageAction(
    stageId: string,
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


  const busy =
    loading ||
    executing ||
    confirming ||
    wallet.busy;


  function clearAgentFlow() {
    planRef.current =
      null;

    runtimeRef.current =
      null;

    accountRef.current =
      "";

    setSwapAgentSession(
      null,
    );
  }


  function resetQuote() {
    if (flowLocked) {
      return;
    }

    setQuote(null);
    setError("");
    setSuccess("");
  }


  function resetFlow() {
    if (
      wallet.address
    ) {
      clearActiveAgentRecoveryPointer({
        kind:
          "swap",

        account:
          wallet.address,
      });
    }

    clearAgentFlow();
    setQuote(null);
    setError("");
    setSuccess("");
  }


  function selectSellAsset(
    symbol: string,
  ) {
    if (flowLocked) {
      return;
    }

    setSellSymbol(
      symbol,
    );

    if (
      symbol === buySymbol
    ) {
      const alternate =
        swapAssets.find(
          (asset) =>
            asset.symbol !==
            symbol,
        );

      if (alternate) {
        setBuySymbol(
          alternate.symbol,
        );
      }
    }

    setQuote(null);
    setError("");
    setSuccess("");
  }


  function selectBuyAsset(
    symbol: string,
  ) {
    if (flowLocked) {
      return;
    }

    setBuySymbol(
      symbol,
    );

    if (
      symbol === sellSymbol
    ) {
      const alternate =
        swapAssets.find(
          (asset) =>
            asset.symbol !==
            symbol,
        );

      if (alternate) {
        setSellSymbol(
          alternate.symbol,
        );
      }
    }

    setQuote(null);
    setError("");
    setSuccess("");
  }


  function changeAmount(
    value: string,
  ) {
    if (flowLocked) {
      return;
    }

    setAmount(
      value,
    );

    setQuote(null);
    setError("");
    setSuccess("");
  }


  useEffect(() => {
    if (
      !network ||
      flowLocked
    ) {
      return;
    }

    try {
      const parsed =
        parseSwapGoal(
          goal,
        );

      const from =
        swapAssets.find(
          (asset) =>
            asset.symbol ===
            parsed.fromSymbol,
        );

      const to =
        swapAssets.find(
          (asset) =>
            asset.symbol ===
            parsed.toSymbol,
        );

      if (
        !from ||
        !to ||
        from.id === to.id
      ) {
        return;
      }

      setAmount(
        parsed.amountText,
      );

      setSellSymbol(
        from.symbol,
      );

      setBuySymbol(
        to.symbol,
      );

      setQuote(null);
      setError("");
      setSuccess("");
    } catch {
      // Manual Swap fields remain usable for incomplete goals.
    }
  }, [
    goal,
    network?.id,
    flowLocked,
  ]);


  useEffect(() => {
    planRef.current =
      null;

    runtimeRef.current =
      null;

    accountRef.current =
      "";

    setSwapAgentSession(
      null,
    );

    setQuote(null);
    setError("");
    setSuccess("");
  }, [
    mode,
    wallet.address,
    wallet.chainId,
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
          "swap",

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
            "swap" ||
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


        const runtime =
          createAvnuSwapRuntime({
            wallet,
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
            parseSwapGoal(
              pointer.goal,
            );

          setAmount(
            parsed.amountText,
          );

          setSellSymbol(
            parsed.fromSymbol,
          );

          setBuySymbol(
            parsed.toSymbol,
          );
        } catch {
          // The exact signed plan remains authoritative.
        }


        setQuote(
          null,
        );

        setSwapAgentSession(
          session,
        );

        setError(
          "",
        );

        setSuccess(
          "Recovered the submitted Swap Agent transaction. Confirm it to continue.",
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
            : "Could not recover the submitted Swap Agent transaction.",
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


  async function loadQuote() {
    if (
      loading ||
      executing ||
      confirming ||
      flowLocked
    ) {
      return;
    }

    setLoading(true);
    setError("");
    setSuccess("");
    setQuote(null);

    try {
      if (
        !ready ||
        !network ||
        !wallet.address ||
        !sellAsset ||
        !buyAsset
      ) {
        throw new Error(
          "Connect Ready on Starknet Sepolia or Mainnet first.",
        );
      }

      if (
        mode !== "normal" &&
        (
          !wallet.strk20Capable ||
          !network.privacyEnabled
        )
      ) {
        throw new Error(
          "STRK20 privacy is not available for this wallet or network.",
        );
      }

      const sellAmount =
        parseUnits(
          amount,
          sellAsset.decimals,
        );

      if (
        sellAmount <= 0n
      ) {
        throw new Error(
          "Swap amount must be greater than zero.",
        );
      }

      /*
       * Preview quote only.
       *
       * The Agent runtime requests another fresh AVNU quote immediately
       * before the actual public Swap stage is signed.
       */
      const next =
        await getAvnuSwapQuote({
          network,
          fromAsset:
            sellAsset,
          toAsset:
            buyAsset,
          sellAmount,
          takerAddress:
            wallet.address,
          privateRoute:
            false,
        });

      setQuote(
        next,
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not load the AVNU quote.",
      );
    } finally {
      setLoading(false);
    }
  }


  function rememberSwapRecovery(
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
          "swap",

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
        "swap",

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


  function context(
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


  async function executeStage(
    plan:
      AgentPlan,

    session:
      AgentExecutionSession,

    runtime:
      StarknetSwapRuntime,

    stageId:
      string,
  ) {
    return executeAgentStage(
      plan,
      session,
      stageId,
      context(
        session,
      ),
      runtime.registry,
    );
  }


  async function startFlow() {
    if (
      !quote ||
      busy ||
      flowLocked ||
      !network ||
      !wallet.address ||
      !sellAsset ||
      !buyAsset
    ) {
      return;
    }

    setExecuting(true);
    setError("");
    setSuccess("");

    try {
      if (
        mode !== "normal" &&
        (
          !wallet.strk20Capable ||
          !network.privacyEnabled
        )
      ) {
        throw new Error(
          "STRK20 privacy is unavailable for this Swap flow.",
        );
      }

      const plan =
        buildStarknetAgentPlan({
          goal:
            `Swap ${amount} ${sellAsset.symbol} for ${buyAsset.symbol}.`,

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
          "CAREL could not build the Swap Agent plan.",
        );
      }

      const feeGate =
        await feeGateRef.current
          .prepare(
            plan,
            {
              prefix:
                "swap",

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

      const runtime =
        createAvnuSwapRuntime({
          wallet,
        });

      planRef.current =
        plan;

      runtimeRef.current =
        runtime;

      accountRef.current =
        wallet.address;

      setSwapAgentSession(
        session,
      );

      const first =
        session.run.stages.find(
          (stage) =>
            stage.status ===
              "review",
        );

      if (!first) {
        throw new Error(
          "Swap Agent plan has no executable stage.",
        );
      }

      const result =
        await executeStage(
          plan,
          session,
          runtime,
          first.stageId,
        );


      feeGateRef.current
        .markProtocolStarted(
          session.runId,
        );


      setSwapAgentSession(
        result.session,
      );


      rememberSwapRecovery(
        plan,
        result.session,
        first.stageId,
      );


      setSuccess(
        stageAction(
          first.stageId,
        ) ===
          "unshield"
          ? "Unshield submitted. Confirm the public input before AVNU Swap."
          : "AVNU Swap submitted through Agent Core. Confirm the transaction and verified output.",
      );
    } catch (cause) {
      clearAgentFlow();

      setError(
        cause instanceof Error
          ? cause.message
          : "Swap Agent execution failed.",
      );
    } finally {
      setExecuting(false);
    }
  }


  async function executeNextStage() {
    if (
      busy ||
      !swapAgentSession ||
      !reviewStage
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
        wallet.address ||
      plan.objective
        .chainId !==
        wallet.chainId
    ) {
      setError(
        "Wallet account or network changed. Restart Swap.",
      );

      return;
    }

    setExecuting(true);
    setError("");
    setSuccess("");

    try {
      const result =
        await executeStage(
          plan,
          swapAgentSession,
          runtime,
          reviewStage.stageId,
        );

      setSwapAgentSession(
        result.session,
      );


      rememberSwapRecovery(
        plan,
        result.session,
        reviewStage.stageId,
      );


      if (
        result.session
          .run.status ===
          "completed"
      ) {
        setSuccess(
          "Swap Agent plan completed.",
        );
      } else {
        setSuccess(
          stageAction(
            reviewStage.stageId,
          ) ===
            "shield"
            ? "Shield submitted. Confirm it to complete the Agent plan."
            : "Fresh AVNU Swap submitted. Confirm its actual output.",
        );
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not execute the next Swap Agent stage.",
      );
    } finally {
      setExecuting(false);
    }
  }


  async function confirmSubmitted() {
    if (
      busy ||
      !swapAgentSession ||
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
        wallet.address ||
      plan.objective
        .chainId !==
        wallet.chainId
    ) {
      setError(
        "Wallet account or network changed. Restart Swap.",
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
            swapAgentSession,
            submittedStage
              .stageId,
            context(
              swapAgentSession,
            ),
          );

      setSwapAgentSession(
        next,
      );

      try {
        await wallet
          .refreshAssetBalances();
      } catch {
        // Runtime already verified required public outputs directly.
      }

      const nextReview =
        next.run.stages.find(
          (stage) =>
            stage.status ===
              "review",
        );

      if (
        next.run.status ===
          "completed"
      ) {
        clearActiveAgentRecoveryPointer({
          kind:
            "swap",

          account:
            wallet.address,
        });


        const output =
          next.outputs[
            submittedStage
              .stageId
          ];

        setSuccess(
          output
            ? `Swap completed: ${output.amountText} ${output.assetSymbol} verified.`
            : "Swap Agent plan completed.",
        );

        return;
      }

      if (
        nextReview &&
        stageAction(
          nextReview.stageId,
        ) ===
          "shield"
      ) {
        const output =
          next.outputs[
            submittedStage
              .stageId
          ];

        setSuccess(
          output
            ? `${output.amountText} ${output.assetSymbol} verified publicly. Shield is unlocked.`
            : "Swap confirmed. Shield is unlocked.",
        );

        return;
      }

      if (
        nextReview &&
        stageAction(
          nextReview.stageId,
        ) ===
          "swap"
      ) {
        setSuccess(
          "Unshield confirmed and public input verified. CAREL will request a fresh AVNU quote for the Swap stage.",
        );

        return;
      }

      setSuccess(
        "Agent stage confirmed.",
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The submitted Agent stage is not confirmed and verified yet.",
      );
    } finally {
      setConfirming(false);
    }
  }


  return {
    wallet,
    network,
    swapAssets,

    sellSymbol,
    buySymbol,
    amount,
    quote,

    sellAsset,
    buyAsset,

    ready,
    busy,
    loading,
    executing,
    confirming,
    flowLocked,

    error,
    success,

    swapAgentSession,
    submittedStage,
    reviewStage,
    verifiedSwapOutput,
    stageAction,

    selectSellAsset,
    selectBuyAsset,
    changeAmount,

    loadQuote,
    startFlow,
    executeNextStage,
    confirmSubmitted,
    resetQuote,
    resetFlow,
  } as const;
}


export type SwapController =
  ReturnType<
    typeof useSwapController
  >;
