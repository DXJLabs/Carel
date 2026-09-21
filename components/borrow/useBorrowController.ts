"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

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
  parseBorrowGoal,
} from "@/lib/agent/borrow";

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
  StarknetBorrowRuntime,
} from "@/lib/agent/starknet-borrow-runtime";

import {
  getVesuBorrowDebtAssetBySymbol,
  VESU_BORROW_DEBT_ASSETS,
} from "@/lib/carel/ecosystems/starknet/protocols/vesu/pairs";

import type {
  BorrowMode,
} from "./model";

import {
  useVesuBorrowMarkets,
} from "./useVesuBorrowMarkets";

import {
  createVesuBorrowRuntime,
} from "./runtime";


export function useBorrowController({
  mode,
  goal,
}: Readonly<{
  mode: BorrowMode;
  goal: string;
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

  const [
    collateralAmount,
    setCollateralAmount,
  ] = useState("1000");

  const [
    borrowAmount,
    setBorrowAmount,
  ] = useState("10");

  const [
    debtAssetId,
    setDebtAssetId,
  ] = useState(
    VESU_BORROW_DEBT_ASSETS[0].id,
  );

  const selectedDebtAsset =
    useMemo(
      () =>
        VESU_BORROW_DEBT_ASSETS.find(
          (asset) =>
            asset.id ===
            debtAssetId,
        ) ??
        VESU_BORROW_DEBT_ASSETS[0],
      [debtAssetId],
    );

  const {
    markets,
    selectedMarket,
    reviewed,
    loading,
    discoverMarkets,
    reviewMarkets,
    resetMarkets,
    invalidateReview,
    selectPool,
  } = useVesuBorrowMarkets({
    chainId:
      wallet.chainId,

    debtAsset:
      selectedDebtAsset,

    collateralAmount,
    borrowAmount,
  });

  const [
    executing,
    setExecuting,
  ] = useState(false);

  const [
    unshielding,
    setUnshielding,
  ] = useState(false);

  const [
    checkingUnshield,
    setCheckingUnshield,
  ] = useState(false);

  const [
    shieldingBorrow,
    setShieldingBorrow,
  ] = useState(false);

  const [
    checkingBorrowAgent,
    setCheckingBorrowAgent,
  ] = useState(false);

  /*
   * Agent plan/runtime stay in refs; AgentExecutionSession is React state
   * and the single reactive source of truth for Borrow stage progress.
   */
  const borrowAgentPlanRef =
    useRef<AgentPlan | null>(
      null,
    );

  const [
    borrowAgentSession,
    setBorrowAgentSession,
  ] = useState<AgentExecutionSession | null>(
    null,
  );

  const borrowAgentRuntimeRef =
    useRef<StarknetBorrowRuntime | null>(
      null,
    );

  const borrowAgentAccountRef =
    useRef("");

  const [
    error,
    setError,
  ] = useState("");

  const [
    success,
    setSuccess,
  ] = useState("");

  function createBorrowRuntime():
    StarknetBorrowRuntime {
    return createVesuBorrowRuntime({
      market:
        selectedMarket,

      debtSymbol:
        selectedDebtAsset.symbol,

      wallet,
    });
  }

  function rememberBorrowRecovery(
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
          "borrow",

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
        "borrow",

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


  function clearBorrowAgentRefs() {
    borrowAgentPlanRef.current =
      null;

    setBorrowAgentSession(null);

    borrowAgentRuntimeRef.current =
      null;

    borrowAgentAccountRef.current =
      "";
  }

  const normalAgentSession =
    mode === "normal"
      ? borrowAgentSession
      : null;

  const normalAgentBorrowStage =
    normalAgentSession
      ?.run.stages.find(
        (stage) =>
          stage.stageId ===
            "borrow-1",
      ) ??
    null;

  const normalAgentBorrowOutput =
    normalAgentSession
      ?.outputs[
        "borrow-1"
      ] ??
    null;

  const shieldAgentSession =
    mode === "shield"
      ? borrowAgentSession
      : null;

  const shieldBorrowStage =
    shieldAgentSession
      ?.run.stages.find(
        (stage) =>
          stage.stageId ===
            "borrow-1",
      ) ??
    null;

  const shieldStage =
    shieldAgentSession
      ?.run.stages.find(
        (stage) =>
          stage.stageId ===
            "shield-2",
      ) ??
    null;

  const shieldBorrowOutput =
    shieldAgentSession
      ?.outputs["borrow-1"] ??
    null;

  const shieldView =
    !shieldAgentSession
      ? ({
          kind: "idle",
        } as const)
      : shieldStage?.status ===
          "submitted" ||
        shieldStage?.status ===
          "confirmed"
        ? ({
            kind: "shielded",
            borrowHash:
              shieldBorrowStage?.txHash ??
              "",
            shieldHash:
              shieldStage.txHash ??
              "",
            amount:
              shieldBorrowOutput
                ?.amountText ??
              borrowAmount,
            debtSymbol:
              shieldBorrowOutput
                ?.assetSymbol ??
              selectedDebtAsset.symbol,
            status:
              shieldStage.status,
          } as const)
        : shieldBorrowStage?.status ===
            "submitted"
          ? ({
              kind: "waiting",
              borrowHash:
                shieldBorrowStage.txHash ??
                "",
              amount:
                borrowAmount,
              debtSymbol:
                selectedDebtAsset.symbol,
            } as const)
          : shieldBorrowStage?.status ===
                "confirmed" &&
              shieldStage?.status ===
                "review" &&
              shieldBorrowOutput
            ? ({
                kind: "ready",
                borrowHash:
                  shieldBorrowStage.txHash ??
                  "",
                amount:
                  shieldBorrowOutput.amountText,
                debtSymbol:
                  shieldBorrowOutput.assetSymbol,
              } as const)
            : ({
                kind: "idle",
              } as const);

  const shieldAgentFlowLocked =
    shieldAgentSession !==
      null &&
    shieldAgentSession
      .run.status !==
      "completed";

  const unshieldAgentSession =
    mode === "unshield"
      ? borrowAgentSession
      : null;

  const unshieldAgentStage =
    unshieldAgentSession
      ?.run.stages.find(
        (stage) =>
          stage.stageId ===
            "unshield-1",
      ) ??
    null;

  const unshieldAgentOutput =
    unshieldAgentSession
      ?.outputs["unshield-1"] ??
    null;

  const unshieldBorrowStage =
    unshieldAgentSession
      ?.run.stages.find(
        (stage) =>
          stage.stageId ===
            "borrow-2",
      ) ??
    null;

  const unshieldBorrowOutput =
    unshieldAgentSession
      ?.outputs["borrow-2"] ??
    null;

  const unshieldProgress =
    !unshieldAgentSession
      ? ({
          kind: "idle",
        } as const)
      : unshieldAgentStage?.status ===
          "submitted"
        ? ({
            kind: "waiting",
            hash:
              unshieldAgentStage.txHash ??
              "",
            amount:
              collateralAmount,
          } as const)
        : unshieldAgentStage?.status ===
              "confirmed" &&
            unshieldAgentOutput
          ? ({
              kind: "ready",
              hash:
                unshieldAgentStage.txHash ??
                "",
              amount:
                unshieldAgentOutput.amountText,
            } as const)
          : ({
              kind: "idle",
            } as const);

  const normalAgentFlowLocked =
    normalAgentSession !==
      null &&
    normalAgentSession
      .run.status !==
      "completed";

  const busy =
    loading ||
    executing ||
    unshielding ||
    checkingUnshield ||
    shieldingBorrow ||
    checkingBorrowAgent ||
    wallet.busy;

  /**
   * Invalidates an old review whenever the user changes an amount.
   */
  function changeCollateral(
    value: string,
  ) {
    setCollateralAmount(
      value,
    );
    invalidateReview();
    setSuccess("");
    setError("");

    if (
      mode === "unshield"
    ) {
    }

    if (
      mode === "shield"
    ) {
    }
  }

  /**
   * Invalidates an old review whenever the requested debt changes.
   */
  function changeBorrow(
    value: string,
  ) {
    setBorrowAmount(
      value,
    );
    invalidateReview();
    setSuccess("");
    setError("");

    if (
      mode === "shield"
    ) {
    }
  }

  useEffect(() => {
    try {
      const parsed =
        parseBorrowGoal(
          goal,
        );

      if (
        parsed.collateralSymbol ===
          "STRK"
      ) {
        const debtAsset =
          getVesuBorrowDebtAssetBySymbol(
            parsed.borrowSymbol,
          );

        if (!debtAsset) {
          return;
        }

        setCollateralAmount(
          parsed.collateralAmountText,
        );

        setBorrowAmount(
          parsed.borrowAmountText,
        );

        setDebtAssetId(
          debtAsset.id,
        );

        invalidateReview();
      }
    } catch {
      // Manual Borrow fields remain usable when the goal is incomplete.
    }
  }, [goal]);

  useEffect(() => {

    borrowAgentPlanRef.current =
      null;

    setBorrowAgentSession(null);

    borrowAgentRuntimeRef.current =
      null;

    borrowAgentAccountRef.current =
      "";
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
          "borrow",

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
            "borrow" ||
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
         * selectedMarket may still be loading after a hard reload.
         * Recovery confirmation itself does not require prepareBorrow().
         */
        const runtime =
          createBorrowRuntime();


        borrowAgentPlanRef.current =
          plan;

        borrowAgentRuntimeRef.current =
          runtime;

        borrowAgentAccountRef.current =
          wallet.address;


        feeGateRef.current
          .markProtocolStarted(
            pointer.runId,
          );


        try {
          const parsed =
            parseBorrowGoal(
              pointer.goal,
            );


          setCollateralAmount(
            parsed
              .collateralAmountText,
          );

          setBorrowAmount(
            parsed
              .borrowAmountText,
          );


          const debtAsset =
            getVesuBorrowDebtAssetBySymbol(
              parsed.borrowSymbol,
            );


          if (debtAsset) {
            setDebtAssetId(
              debtAsset.id,
            );
          }
        } catch {
          // The signed plan remains authoritative.
        }


        setBorrowAgentSession(
          session,
        );

        setError(
          "",
        );

        setSuccess(
          "Recovered the submitted Borrow Agent transaction. Confirm it to continue.",
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
            : "Could not recover the submitted Borrow Agent transaction.",
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


  useEffect(() => {
    resetMarkets();
    setError("");
    setSuccess("");

    if (
      wallet.connected &&
      network?.id ===
        "mainnet"
    ) {
      void discoverMarkets().catch(
        (cause) => {
          setError(
            cause instanceof Error
              ? cause.message
              : "Could not load Vesu markets.",
          );
        },
      );
    }

    // Network/account change intentionally resets the review.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    wallet.address,
    wallet.chainId,
    debtAssetId,
  ]);

  /**
   * Stage 1 of Unshield Borrow through Agent Core.
   *
   * private STRK -> confirmed + verified public STRK.
   */
  async function startUnshieldBorrow() {
    if (
      mode !== "unshield" ||
      !network ||
      network.id !== "mainnet" ||
      unshielding ||
      checkingUnshield
    ) {
      return;
    }

    if (
      borrowAgentSession
    ) {
      setError(
        "Finish the current Unshield Borrow flow first.",
      );
      return;
    }

    if (
      !selectedMarket ||
      !wallet.address
    ) {
      setError(
        "Connect Ready and load a verified Vesu market first.",
      );
      return;
    }

    let collateral: bigint;

    try {
      collateral =
        parseUnits(
          collateralAmount,
          network.assets.strk.decimals,
        );
    } catch {
      setError(
        "Enter a valid STRK collateral amount.",
      );
      return;
    }

    if (collateral <= 0n) {
      setError(
        "Collateral amount must be greater than zero.",
      );
      return;
    }

    if (
      !wallet.privateRevealed ||
      wallet.privateStrk === null ||
      wallet.privateStrk < collateral
    ) {
      setError(
        "Reveal enough private STRK before starting Unshield Borrow.",
      );
      return;
    }

    setUnshielding(true);
    setError("");
    setSuccess("");

    try {
      const plan =
        buildStarknetAgentPlan({
          goal:
            "Borrow " +
            borrowAmount +
            " " +
            selectedDebtAsset.symbol +
            " against " +
            collateralAmount +
            " STRK",

          chainId:
            wallet.chainId,

          mode:
            "unshield",
        });

      if (plan.status !== "ready") {
        throw new Error(
          plan.message ??
          "CAREL could not build the Unshield Borrow Agent plan.",
        );
      }

      const feeGate =
        await feeGateRef.current
          .prepare(
            plan,
            {
              prefix:
                "borrow",

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
        createBorrowRuntime();

      borrowAgentPlanRef.current =
        plan;

      setBorrowAgentSession(session);

      borrowAgentRuntimeRef.current =
        runtime;

      borrowAgentAccountRef.current =
        wallet.address;

      const result =
        await executeAgentStage(
          plan,
          session,
          "unshield-1",
          {
            runId:
              session.runId,
            chainId:
              wallet.chainId,
            account:
              wallet.address,
          },
          runtime.registry,
        );

      feeGateRef.current
        .markProtocolStarted(
          session.runId,
        );

      setBorrowAgentSession(result.session);


      rememberBorrowRecovery(
        plan,
        result.session,
        "unshield-1",
      );


      setSuccess(
        "Unshield submitted through Agent Core. Confirm it before Vesu Borrow.",
      );
    } catch (cause) {
      clearBorrowAgentRefs();

      setError(
        cause instanceof Error
          ? cause.message
          : "Unshield Borrow collateral failed.",
      );
    } finally {
      setUnshielding(false);
    }
  }

  /**
   * Confirms unshield-1 and verifies that the exact collateral appeared
   * publicly before Agent Core unlocks borrow-2.
   */
  async function refreshUnshieldConfirmation() {
    if (
      mode !== "unshield" ||
      unshieldProgress.kind !== "waiting"
    ) {
      return;
    }

    const plan =
      borrowAgentPlanRef.current;

    const session =
      borrowAgentSession;

    const runtime =
      borrowAgentRuntimeRef.current;

    if (
      !plan ||
      !session ||
      !runtime
    ) {
      setError(
        "The Unshield Borrow Agent session is unavailable.",
      );
      return;
    }

    if (
      borrowAgentAccountRef.current !==
        wallet.address ||
      plan.objective.chainId !==
        wallet.chainId
    ) {
      setError(
        "Wallet account or network changed. Restart Unshield Borrow.",
      );
      return;
    }

    setCheckingUnshield(true);
    setError("");

    try {
      const next =
        await runtime.confirmSubmittedStage(
          plan,
          session,
          "unshield-1",
          {
            runId:
              session.runId,
            chainId:
              wallet.chainId,
            account:
              wallet.address,
          },
        );

      const output =
        next.outputs["unshield-1"];

      if (
        !output ||
        output.assetSymbol !== "STRK"
      ) {
        throw new Error(
          "Unshield confirmed without verified public STRK collateral.",
        );
      }

      setBorrowAgentSession(next);

      try {
        await wallet.refreshPublicBalance();
      } catch {
        // Runtime already verified the public output directly.
      }

      invalidateReview();

      setSuccess(
        "Unshield confirmed and " +
        output.amountText +
        " STRK verified. Run a fresh Vesu risk review.",
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unshield is not confirmed and verified yet.",
      );
    } finally {
      setCheckingUnshield(false);
    }
  }


  /**
   * Confirms and verifies a Normal Borrow submitted through Agent Core.
   */
  async function refreshNormalBorrowConfirmation() {
    if (
      mode !== "normal" ||
      normalAgentBorrowStage
        ?.status !==
        "submitted"
    ) {
      return;
    }

    const plan =
      borrowAgentPlanRef.current;

    const session =
      borrowAgentSession;

    const runtime =
      borrowAgentRuntimeRef.current;

    if (
      !plan ||
      !session ||
      !runtime
    ) {
      setError(
        "The Normal Borrow Agent session is unavailable.",
      );

      return;
    }

    if (
      borrowAgentAccountRef
        .current !==
        wallet.address ||
      plan.objective
        .chainId !==
        wallet.chainId
    ) {
      setError(
        "Wallet account or network changed. Restart Borrow.",
      );

      return;
    }

    setCheckingBorrowAgent(
      true,
    );

    setError("");

    try {
      const next =
        await runtime
          .confirmSubmittedStage(
            plan,
            session,
            "borrow-1",
            {
              runId:
                session.runId,

              chainId:
                wallet.chainId,

              account:
                wallet.address,
            },
          );

      setBorrowAgentSession(next);


      if (
        next.run.status ===
          "completed"
      ) {
        clearActiveAgentRecoveryPointer({
          kind:
            "borrow",

          account:
            wallet.address,
        });
      }


      const output =
        next.outputs[
          "borrow-1"
        ];

      if (!output) {
        throw new Error(
          "Borrow confirmed without a verified Agent output.",
        );
      }

      try {
        await wallet
          .refreshAssetBalances();
      } catch {
        // Agent verification already observed the output directly.
      }

      setSuccess(
        "Borrow confirmed and " +
        output.amountText +
        " " +
        output.assetSymbol +
        " verified.",
      );

      try {
        await discoverMarkets();
      } catch {
        // Confirmed execution remains visible even if market refresh fails.
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Borrow is not confirmed and verified yet.",
      );
    } finally {
      setCheckingBorrowAgent(
        false,
      );
    }
  }


  /**
   * Confirms and verifies borrow-2 after a verified Unshield.
   */
  async function refreshUnshieldBorrowConfirmation() {
    if (
      mode !== "unshield"
    ) {
      return;
    }

    const plan =
      borrowAgentPlanRef.current;

    const session =
      borrowAgentSession;

    const runtime =
      borrowAgentRuntimeRef.current;

    const stage =
      session
        ?.run.stages.find(
          (candidate) =>
            candidate.stageId ===
              "borrow-2",
        );

    if (
      !plan ||
      !session ||
      !runtime ||
      stage?.status !==
        "submitted"
    ) {
      return;
    }

    if (
      borrowAgentAccountRef.current !==
        wallet.address ||
      plan.objective.chainId !==
        wallet.chainId
    ) {
      setError(
        "Wallet account or network changed. Restart Unshield Borrow.",
      );
      return;
    }

    setCheckingBorrowAgent(true);
    setError("");

    try {
      const next =
        await runtime.confirmSubmittedStage(
          plan,
          session,
          "borrow-2",
          {
            runId:
              session.runId,
            chainId:
              wallet.chainId,
            account:
              wallet.address,
          },
        );

      const output =
        next.outputs["borrow-2"];

      if (!output) {
        throw new Error(
          "Borrow confirmed without a verified Agent output.",
        );
      }

      setBorrowAgentSession(next);


      if (
        next.run.status ===
          "completed"
      ) {
        clearActiveAgentRecoveryPointer({
          kind:
            "borrow",

          account:
            wallet.address,
        });
      }


      try {
        await wallet.refreshAssetBalances();
      } catch {
        // Agent verification already observed the output.
      }

      setSuccess(
        "Borrow confirmed and " +
        output.amountText +
        " " +
        output.assetSymbol +
        " verified. Unshield Borrow plan completed.",
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Borrow is not confirmed and verified yet.",
      );
    } finally {
      setCheckingBorrowAgent(false);
    }
  }


  /**
   * Confirms Borrow through the generic Agent runtime.
   *
   * Shield remains locked until the runtime:
   * 1. observes Starknet confirmation,
   * 2. verifies the actual public Borrow output,
   * 3. records that output in AgentExecutionSession.
   */
  async function refreshShieldBorrowConfirmation() {
    if (
      mode !== "shield" ||
      shieldBorrowStage
        ?.status !==
        "submitted" ||
      !network ||
      network.id !==
        "mainnet"
    ) {
      return;
    }

    const plan =
      borrowAgentPlanRef.current;

    const session =
      borrowAgentSession;

    const runtime =
      borrowAgentRuntimeRef.current;

    if (
      !plan ||
      !session ||
      !runtime
    ) {
      setError(
        "The Shield Borrow Agent session is unavailable. Review the Borrow again.",
      );

      return;
    }

    if (
      borrowAgentAccountRef.current !==
        wallet.address ||
      plan.objective.chainId !==
        wallet.chainId
    ) {
      setError(
        "Wallet account or network changed. Restart Shield Borrow.",
      );

      return;
    }

    setCheckingBorrowAgent(
      true,
    );

    setError("");

    try {
      const next =
        await runtime
          .confirmSubmittedStage(
            plan,
            session,
            "borrow-1",
            {
              runId:
                session.runId,

              chainId:
                wallet.chainId,

              account:
                wallet.address,
            },
          );

      setBorrowAgentSession(next);

      const output =
        next.outputs[
          "borrow-1"
        ];

      if (!output) {
        throw new Error(
          "Borrow confirmed without a verified Agent output.",
        );
      }

      try {
        await wallet
          .refreshAssetBalances();
      } catch {
        // Agent verification already read the balance directly on-chain.
      }

      setSuccess(
        "Borrow confirmed and " +
        output.amountText +
        " " +
        output.assetSymbol +
        " verified. Shield is unlocked.",
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Borrow is not confirmed and verified yet. Shield remains locked.",
      );
    } finally {
      setCheckingBorrowAgent(
        false,
      );
    }
  }


  /**
   * Executes Shield only from the verified Agent Borrow output.
   *
   * The exact Shield amount is resolved by executeAgentStage from
   * session.outputs["borrow-1"].
   */
  async function shieldBorrowProceeds() {
    if (
      mode !== "shield" ||
      shieldBorrowStage
        ?.status !==
        "confirmed" ||
      shieldStage
        ?.status !==
        "review" ||
      !shieldBorrowOutput ||
      shieldingBorrow
    ) {
      return;
    }

    if (
      !wallet.strk20Capable
    ) {
      setError(
        "Ready does not report the STRK20 Wallet API required for Shield Borrow.",
      );

      return;
    }

    const plan =
      borrowAgentPlanRef.current;

    const session =
      borrowAgentSession;

    const runtime =
      borrowAgentRuntimeRef.current;

    if (
      !plan ||
      !session ||
      !runtime
    ) {
      setError(
        "The Shield Borrow Agent session is unavailable.",
      );

      return;
    }

    if (
      borrowAgentAccountRef.current !==
        wallet.address ||
      plan.objective.chainId !==
        wallet.chainId
    ) {
      setError(
        "Wallet account or network changed. Restart Shield Borrow.",
      );

      return;
    }

    setShieldingBorrow(
      true,
    );

    setError("");
    setSuccess("");

    try {
      const result =
        await executeAgentStage(
          plan,
          session,
          "shield-2",
          {
            runId:
              session.runId,

            chainId:
              wallet.chainId,

            account:
              wallet.address,
          },
          runtime.registry,
        );

      setBorrowAgentSession(
        result.session,
      );


      rememberBorrowRecovery(
        plan,
        result.session,
        "shield-2",
      );


      const status =
        result.receipt.status ===
          "confirmed"
          ? "confirmed"
          : "submitted";

      setSuccess(
        "Borrowed " +
        shieldBorrowOutput
          .amountText +
        " " +
        shieldBorrowOutput
          .assetSymbol +
        "; Shield " +
        status +
        ".",
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not execute the Agent Shield stage.",
      );
    } finally {
      setShieldingBorrow(
        false,
      );
    }
  }


  /**
   * Completes a Shield stage that was submitted but did not finish within
   * the wallet-side confirmation window.
   */
  async function refreshShieldStageConfirmation() {
    if (
      mode !== "shield" ||
      shieldStage
        ?.status !==
        "submitted"
    ) {
      return;
    }

    const plan =
      borrowAgentPlanRef.current;

    const session =
      borrowAgentSession;

    const runtime =
      borrowAgentRuntimeRef.current;

    if (
      !plan ||
      !session ||
      !runtime
    ) {
      setError(
        "The Shield Agent session is unavailable.",
      );

      return;
    }

    if (
      borrowAgentAccountRef.current !==
        wallet.address ||
      plan.objective.chainId !==
        wallet.chainId
    ) {
      setError(
        "Wallet account or network changed. Restart Shield Borrow.",
      );

      return;
    }

    setCheckingBorrowAgent(
      true,
    );

    setError("");

    try {
      const next =
        await runtime
          .confirmSubmittedStage(
            plan,
            session,
            "shield-2",
            {
              runId:
                session.runId,

              chainId:
                wallet.chainId,

              account:
                wallet.address,
            },
          );

      setBorrowAgentSession(next);


      if (
        next.run.status ===
          "completed"
      ) {
        clearActiveAgentRecoveryPointer({
          kind:
            "borrow",

          account:
            wallet.address,
        });
      }


      setSuccess(
        "Borrow and Shield Agent plan completed.",
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Shield is not confirmed yet.",
      );
    } finally {
      setCheckingBorrowAgent(
        false,
      );
    }
  }


  /**
   * Requests a fresh risk evaluation for the exact user-entered amounts.
   */
  async function reviewBorrow() {
    if (
      mode === "normal" &&
      normalAgentFlowLocked
    ) {
      invalidateReview();

      setError(
        "Confirm the current Agent Borrow before reviewing another position.",
      );

      return;
    }

    if (
      mode === "shield" &&
      shieldAgentFlowLocked
    ) {
      invalidateReview();

      setError(
        "Finish the current Shield Borrow flow before reviewing another Borrow.",
      );

      return;
    }

    if (
      mode === "unshield" &&
      unshieldProgress.kind !==
        "ready"
    ) {
      invalidateReview();

      setError(
        "Complete and confirm the Unshield collateral step first.",
      );

      return;
    }

    try {
      await reviewMarkets();
    } catch (cause) {
      invalidateReview();

      setError(
        cause instanceof Error
          ? cause.message
          : "Could not review this Borrow.",
      );
    }
  }

  /**
   * Re-prepares the reviewed market, lets the server refresh all risk
   * checks, and finally sends only the strict execution payload to Ready.
   */
  async function executeBorrow() {
    if (
      mode === "shield" &&
      shieldAgentFlowLocked
    ) {
      setError(
        "Finish the current Shield Borrow flow first.",
      );

      return;
    }

    if (
      mode === "unshield" &&
      unshieldProgress.kind !==
        "ready"
    ) {
      setError(
        "Unshield collateral must be confirmed before Vesu Borrow.",
      );

      return;
    }

    if (
      executing ||
      wallet.busy ||
      !wallet.address ||
      !selectedMarket ||
      !selectedMarket
        .evaluation
        ?.eligible
    ) {
      return;
    }

    setExecuting(true);
    setError("");
    setSuccess("");

    try {
      if (
        mode === "shield"
      ) {
        if (
          !network ||
          network.id !==
            "mainnet"
        ) {
          throw new Error(
            "Shield Borrow requires Starknet Mainnet.",
          );
        }

        const agentGoal =
          "Borrow " +
          borrowAmount +
          " " +
          selectedDebtAsset.symbol +
          " against " +
          collateralAmount +
          " STRK but keep the result private.";

        const plan =
          buildStarknetAgentPlan({
            goal:
              agentGoal,

            chainId:
              wallet.chainId,

            mode:
              "shield",
          });

        if (
          plan.status !==
            "ready"
        ) {
          throw new Error(
            plan.message ??
            "CAREL could not build the Shield Borrow Agent plan.",
          );
        }

        const feeGate =
          await feeGateRef.current
            .prepare(
              plan,
              {
                prefix:
                  "borrow",

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
          createBorrowRuntime();

        borrowAgentPlanRef.current =
          plan;

        setBorrowAgentSession(session);

        borrowAgentRuntimeRef.current =
          runtime;

        borrowAgentAccountRef.current =
          wallet.address;

        const result =
          await executeAgentStage(
            plan,
            session,
            "borrow-1",
            {
              runId:
                session.runId,

              chainId:
                wallet.chainId,

              account:
                wallet.address,
            },
            runtime.registry,
          );

        feeGateRef.current
          .markProtocolStarted(
            session.runId,
          );

        setBorrowAgentSession(result.session);


        rememberBorrowRecovery(
          plan,
          result.session,
          "borrow-1",
        );


        const verified =
          result.session
            .outputs[
              "borrow-1"
            ];

        setSuccess(
          verified
            ? "Borrow confirmed and verified. Shield is unlocked."
            : "Borrow submitted through Agent Core. Confirm it before Shield.",
        );

        invalidateReview();

        return;
      }

      if (
        mode === "normal"
      ) {
        if (
          borrowAgentSession
            ?.run.status ===
            "completed"
        ) {
          clearBorrowAgentRefs();
        }

        const plan =
          buildStarknetAgentPlan({
            goal:
              "Borrow " +
              borrowAmount +
              " " +
              selectedDebtAsset
                .symbol +
              " against " +
              collateralAmount +
              " STRK",

            chainId:
              wallet.chainId,

            mode:
              "normal",
          });

        if (
          plan.status !==
            "ready"
        ) {
          throw new Error(
            plan.message ??
            "CAREL could not build the Normal Borrow Agent plan.",
          );
        }

        const feeGate =
          await feeGateRef.current
            .prepare(
              plan,
              {
                prefix:
                  "borrow",

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
          createBorrowRuntime();

        borrowAgentPlanRef.current =
          plan;

        setBorrowAgentSession(session);

        borrowAgentRuntimeRef.current =
          runtime;

        borrowAgentAccountRef.current =
          wallet.address;

        const result =
          await executeAgentStage(
            plan,
            session,
            "borrow-1",
            {
              runId:
                session.runId,

              chainId:
                wallet.chainId,

              account:
                wallet.address,
            },
            runtime.registry,
          );

        feeGateRef.current
          .markProtocolStarted(
            session.runId,
          );

        setBorrowAgentSession(result.session);


        rememberBorrowRecovery(
          plan,
          result.session,
          "borrow-1",
        );


        setSuccess(
          "Borrow submitted through Agent Core. Confirm it to verify the borrowed output.",
        );

        invalidateReview();

        return;
      }

      if (
        mode !== "unshield"
      ) {
        throw new Error(
          "Unexpected Borrow execution mode.",
        );
      }

      const plan =
        borrowAgentPlanRef.current;

      const session =
        borrowAgentSession;

      if (
        !plan ||
        !session
      ) {
        throw new Error(
          "The Unshield Borrow Agent session is unavailable.",
        );
      }

      const borrowStage =
        session.run.stages.find(
          (stage) =>
            stage.stageId ===
              "borrow-2",
        );

      if (
        borrowStage?.status !==
          "review"
      ) {
        throw new Error(
          "Borrow-2 is not unlocked. Confirm and verify Unshield first.",
        );
      }

      /*
       * Fresh runtime after the mandatory post-Unshield Vesu risk review.
       */
      const runtime =
        createBorrowRuntime();

      borrowAgentRuntimeRef.current =
        runtime;

      const result =
        await executeAgentStage(
          plan,
          session,
          "borrow-2",
          {
            runId:
              session.runId,
            chainId:
              wallet.chainId,
            account:
              wallet.address,
          },
          runtime.registry,
        );

      setBorrowAgentSession(result.session);


      rememberBorrowRecovery(
        plan,
        result.session,
        "borrow-2",
      );


      setSuccess(
        "Borrow submitted through Agent Core. Confirm it to verify the borrowed output.",
      );

      invalidateReview();

      return;
    } catch (cause) {
      if (
        mode === "normal"
      ) {
        const current =
          borrowAgentSession;

        const stage =
          current
            ?.run.stages.find(
              (candidate) =>
                candidate.stageId ===
                  "borrow-1",
            );

        if (
          !stage ||
          stage.status ===
            "review"
        ) {
          clearBorrowAgentRefs();
        }
      }

      if (
        mode === "shield"
      ) {
        borrowAgentPlanRef.current =
          null;

        setBorrowAgentSession(null);

        borrowAgentRuntimeRef.current =
          null;

        borrowAgentAccountRef.current =
          "";
      }

      setError(
        cause instanceof Error
          ? cause.message
          : "Vesu Borrow failed.",
      );
    } finally {
      setExecuting(false);
    }
  }



  return {
    wallet,
    network,
    collateralAmount,
    setCollateralAmount,
    borrowAmount,
    setBorrowAmount,
    debtAssetId,
    setDebtAssetId,
    selectedDebtAsset,
    markets,
    selectedMarket,
    reviewed,
    loading,
    discoverMarkets,
    reviewMarkets,
    resetMarkets,
    invalidateReview,
    selectPool,
    executing,
    setExecuting,
    unshielding,
    setUnshielding,
    checkingUnshield,
    setCheckingUnshield,
    shieldingBorrow,
    setShieldingBorrow,
    checkingBorrowAgent,
    setCheckingBorrowAgent,
    borrowAgentPlanRef,
    borrowAgentSession,
    setBorrowAgentSession,
    borrowAgentRuntimeRef,
    borrowAgentAccountRef,
    error,
    setError,
    success,
    setSuccess,
    createBorrowRuntime,
    clearBorrowAgentRefs,
    normalAgentSession,
    normalAgentBorrowStage,
    normalAgentBorrowOutput,
    shieldAgentSession,
    shieldBorrowStage,
    shieldStage,
    shieldBorrowOutput,
    shieldView,
    shieldAgentFlowLocked,
    unshieldAgentSession,
    unshieldAgentStage,
    unshieldAgentOutput,
    unshieldBorrowStage,
    unshieldBorrowOutput,
    unshieldProgress,
    normalAgentFlowLocked,
    busy,
    changeCollateral,
    changeBorrow,
    startUnshieldBorrow,
    refreshUnshieldConfirmation,
    refreshNormalBorrowConfirmation,
    refreshUnshieldBorrowConfirmation,
    refreshShieldBorrowConfirmation,
    shieldBorrowProceeds,
    refreshShieldStageConfirmation,
    reviewBorrow,
    executeBorrow,
  } as const;
}


export type BorrowController =
  ReturnType<
    typeof useBorrowController
  >;
