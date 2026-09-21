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
  ENDUR_DEPOSIT_ANONYMIZER,
} from "@/lib/carel/networks";

import {
  parseStakeGoal,
} from "@/lib/agent/staking";

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
  StarknetStakingRuntime,
} from "@/lib/agent/starknet-staking-runtime";

import {
  ENDUR_SHIELD_STAKING_ADAPTER_ID,
} from "@/lib/carel/ecosystems/starknet/protocols/endur/adapter";

import {
  AVNU_STAKING_ADAPTER_ID,
} from "@/lib/carel/ecosystems/starknet/protocols/avnu/staking-adapter";

import {
  executeStakingPositionRoute,
  loadEndurShieldConfig,
  loadStakingPool,
  loadStakingPosition,
  type StakingPool,
  type StakingPosition,
} from "@/lib/carel/ecosystems/starknet/protocols/endur/staking";

import {
  getStarknetStakingAssetOptions,
  type StarknetStakingAssetOption,
} from "@/lib/carel/ecosystems/starknet/staking-assets";

import {
  createLiveStakingRuntime,
} from "./runtime";


export type StakingMode =
  | "normal"
  | "shield"
  | "unshield";


export function useStakingController({
  mode,
  goal,
}: Readonly<{
  mode:
    StakingMode;

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


  const options =
    useMemo(
      () =>
        getStarknetStakingAssetOptions(
          wallet.chainId,
          wallet.address,
          mode,
        ),
      [
        wallet.chainId,
        wallet.address,
        mode,
      ],
    );


  const [
    selectedAssetId,
    setSelectedAssetId,
  ] =
    useState("");


  const [
    amount,
    setAmount,
  ] =
    useState("1");


  const [
    unstakeAmount,
    setUnstakeAmount,
  ] =
    useState("1");


  const [
    pool,
    setPool,
  ] =
    useState<
      StakingPool | null
    >(null);


  const [
    position,
    setPosition,
  ] =
    useState<
      StakingPosition | null
    >(null);


  const [
    shieldFee,
    setShieldFee,
  ] =
    useState<
      bigint | null
    >(null);


  const [
    loading,
    setLoading,
  ] =
    useState(false);


  const [
    executing,
    setExecuting,
  ] =
    useState(false);


  const [
    confirming,
    setConfirming,
  ] =
    useState(false);


  const [
    positionExecuting,
    setPositionExecuting,
  ] =
    useState(false);


  const [
    error,
    setError,
  ] =
    useState("");


  const [
    success,
    setSuccess,
  ] =
    useState("");


  const planRef =
    useRef<
      AgentPlan | null
    >(null);


  const runtimeRef =
    useRef<
      StarknetStakingRuntime | null
    >(null);


  const accountRef =
    useRef("");


  const [
    stakingAgentSession,
    setStakingAgentSession,
  ] =
    useState<
      AgentExecutionSession | null
    >(null);


  const selectedOption =
    options.find(
      (option) =>
        option.asset.id ===
        selectedAssetId,
    ) ??
    options[0] ??
    null;


  const selectedAsset =
    selectedOption
      ?.asset ??
    null;


  const publicOption:
    StarknetStakingAssetOption | null =
    useMemo(() => {
      if (
        !selectedAsset
      ) {
        return null;
      }

      return (
        getStarknetStakingAssetOptions(
          wallet.chainId,
          wallet.address,
          "normal",
        ).find(
          (option) =>
            option.asset.id ===
              selectedAsset.id,
        ) ??
        null
      );
    }, [
      wallet.chainId,
      wallet.address,
      selectedAsset?.id,
    ]);


  const flowLocked =
    stakingAgentSession !==
      null &&
    stakingAgentSession
      .run.status !==
      "completed" &&
    stakingAgentSession
      .run.status !==
      "failed";


  const submittedStage =
    stakingAgentSession
      ?.run.stages.find(
        (stage) =>
          stage.status ===
            "submitted",
      ) ??
    null;


  const reviewStage =
    stakingAgentSession
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
    positionExecuting ||
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


  function rememberStakingRecovery(
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
          "staking",

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
        "staking",

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

    setStakingAgentSession(
      null,
    );
  }


  useEffect(() => {
    if (
      options.length === 0
    ) {
      setSelectedAssetId(
        "",
      );

      return;
    }


    if (
      !options.some(
        (option) =>
          option.asset.id ===
          selectedAssetId,
      )
    ) {
      setSelectedAssetId(
        options[0].asset.id,
      );
    }
  }, [
    options,
    selectedAssetId,
  ]);


  useEffect(() => {
    if (
      flowLocked
    ) {
      return;
    }

    try {
      const parsed =
        parseStakeGoal(
          goal,
        );

      const option =
        options.find(
          (candidate) =>
            candidate.asset.symbol
              .toLowerCase() ===
            parsed.assetSymbol
              .toLowerCase(),
        );


      if (!option) {
        return;
      }


      setSelectedAssetId(
        option.asset.id,
      );

      setAmount(
        parsed.amountText,
      );
    } catch {
      // Manual Staking input remains available.
    }
  }, [
    goal,
    options,
    flowLocked,
  ]);


  async function refreshPosition() {
    if (
      !network ||
      !selectedAsset ||
      !publicOption ||
      publicOption.providerId !==
        AVNU_STAKING_ADAPTER_ID
    ) {
      setPool(
        null,
      );

      setPosition(
        null,
      );

      return;
    }


    setLoading(
      true,
    );

    setError(
      "",
    );


    try {
      const nextPool =
        await loadStakingPool(
          network.avnuBaseUrl,
          selectedAsset,
        );


      setPool(
        nextPool,
      );


      if (
        !wallet.address
      ) {
        setPosition(
          null,
        );

        return;
      }


      try {
        const nextPosition =
          await loadStakingPosition(
            network.avnuBaseUrl,
            nextPool,
            wallet.address,
            selectedAsset,
          );


        setPosition(
          nextPosition,
        );
      } catch {
        setPosition(
          null,
        );
      }
    } catch (cause) {
      setPool(
        null,
      );

      setPosition(
        null,
      );

      setError(
        cause instanceof Error
          ? cause.message
          : "Could not load the staking market.",
      );
    } finally {
      setLoading(
        false,
      );
    }
  }


  async function refreshShieldFee() {
    if (
      mode !==
        "shield" ||
      !selectedOption ||
      !selectedOption
        .outputAsset ||
      selectedOption
        .providerId !==
        ENDUR_SHIELD_STAKING_ADAPTER_ID
    ) {
      setShieldFee(
        null,
      );

      return;
    }


    try {
      const config =
        await loadEndurShieldConfig({
          inputAsset:
            selectedOption
              .asset,

          outputAsset:
            selectedOption
              .outputAsset,

          expectedAnonymizer:
            ENDUR_DEPOSIT_ANONYMIZER,
        });


      setShieldFee(
        config.feeAmount,
      );
    } catch (cause) {
      setShieldFee(
        null,
      );

      setError(
        cause instanceof Error
          ? cause.message
          : "Could not load Shield Staking.",
      );
    }
  }


  useEffect(() => {
    void refreshPosition();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    wallet.address,
    wallet.chainId,
    selectedAsset?.id,
  ]);


  useEffect(() => {
    void refreshShieldFee();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    mode,
    wallet.address,
    wallet.chainId,
    selectedOption?.asset.id,
    selectedOption
      ?.outputAsset?.id,
  ]);


  useEffect(() => {
    clearAgentFlow();

    setError(
      "",
    );

    setSuccess(
      "",
    );
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
          "staking",

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
            "staking" ||
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
          createLiveStakingRuntime({
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
            parseStakeGoal(
              pointer.goal,
            );


          const option =
            getStarknetStakingAssetOptions(
              wallet.chainId,
              wallet.address,
              pointer.mode,
            ).find(
              (candidate) =>
                candidate.asset.symbol
                  .toLowerCase() ===
                parsed.assetSymbol
                  .toLowerCase(),
            );


          if (option) {
            setSelectedAssetId(
              option.asset.id,
            );
          }


          setAmount(
            parsed.amountText,
          );
        } catch {
          // Signed Agent plan remains authoritative.
        }


        setStakingAgentSession(
          session,
        );

        setError(
          "",
        );

        setSuccess(
          "Recovered the submitted Staking Agent transaction. Confirm it to continue.",
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
            : "Could not recover the submitted Staking Agent transaction.",
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


  function selectAsset(
    assetId:
      string,
  ) {
    if (
      flowLocked
    ) {
      return;
    }

    setSelectedAssetId(
      assetId,
    );

    setError(
      "",
    );

    setSuccess(
      "",
    );
  }


  function changeAmount(
    value:
      string,
  ) {
    if (
      flowLocked
    ) {
      return;
    }


    setAmount(
      value.replace(
        /[^0-9.]/g,
        "",
      ),
    );

    setError(
      "",
    );

    setSuccess(
      "",
    );
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


  async function startFlow() {
    if (
      busy ||
      flowLocked ||
      !network ||
      !selectedOption ||
      !wallet.address
    ) {
      return;
    }


    setExecuting(
      true,
    );

    setError(
      "",
    );

    setSuccess(
      "",
    );


    try {
      if (
        mode !==
          "normal" &&
        (
          !wallet.strk20Capable ||
          !network.privacyEnabled
        )
      ) {
        throw new Error(
          "Ready STRK20 privacy support is required for this Staking mode.",
        );
      }


      const planGoal =
        mode ===
          "shield" &&
        selectedOption
          .outputAsset
          ? `Stake ${amount} ${selectedOption.asset.symbol} to ${selectedOption.outputAsset.symbol}.`
          : `Stake ${amount} ${selectedOption.asset.symbol}.`;


      const plan =
        buildStarknetAgentPlan({
          goal:
            planGoal,

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
          "CAREL could not build the Staking Agent plan.",
        );
      }


      const runtime =
        createLiveStakingRuntime({
          wallet,
        });


      const feeGate =
        await feeGateRef.current
          .prepare(
            plan,
            {
              prefix:
                "stake",

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

      setStakingAgentSession(
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
          "Staking Agent plan has no executable stage.",
        );
      }


      const result =
        await executeAgentStage(
          plan,
          session,
          first.stageId,
          context(
            session,
          ),
          runtime.registry,
        );


      feeGateRef.current
        .markProtocolStarted(
          session.runId,
        );


      setStakingAgentSession(
        result.session,
      );


      rememberStakingRecovery(
        plan,
        result.session,
        first.stageId,
      );


      setSuccess(
        stageAction(
          first.stageId,
        ) ===
          "unshield"
          ? "Unshield submitted. Public balance must be verified before Staking unlocks."
          : "Staking submitted through Agent Core. Verify confirmation to complete the plan.",
      );
    } catch (cause) {
      clearAgentFlow();

      setError(
        cause instanceof Error
          ? cause.message
          : "Staking Agent execution failed.",
      );
    } finally {
      setExecuting(
        false,
      );
    }
  }


  async function executeNextStage() {
    if (
      busy ||
      !stakingAgentSession ||
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
        wallet.address
    ) {
      setError(
        "Wallet account changed. Restart Staking.",
      );

      return;
    }


    setExecuting(
      true,
    );

    setError(
      "",
    );


    try {
      const result =
        await executeAgentStage(
          plan,
          stakingAgentSession,
          reviewStage.stageId,
          context(
            stakingAgentSession,
          ),
          runtime.registry,
        );


      setStakingAgentSession(
        result.session,
      );


      rememberStakingRecovery(
        plan,
        result.session,
        reviewStage.stageId,
      );


      setSuccess(
        "Public Staking submitted. Verify the staking position before completing the Agent plan.",
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not execute the next Staking stage.",
      );
    } finally {
      setExecuting(
        false,
      );
    }
  }


  async function confirmSubmitted() {
    if (
      busy ||
      !stakingAgentSession ||
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
        "Wallet account changed. Restart Staking.",
      );

      return;
    }


    setConfirming(
      true,
    );

    setError(
      "",
    );

    setSuccess(
      "",
    );


    try {
      const next =
        await runtime
          .confirmSubmittedStage(
            plan,
            stakingAgentSession,
            submittedStage
              .stageId,
            context(
              stakingAgentSession,
            ),
          );


      setStakingAgentSession(
        next,
      );


      try {
        await wallet
          .refreshAssetBalances();
      } catch {
        // Runtime already performed the required verification.
      }


      if (
        next.run.status ===
          "completed"
      ) {
        clearActiveAgentRecoveryPointer({
          kind:
            "staking",

          account:
            wallet.address,
        });


        setSuccess(
          "Staking Agent plan completed and verified.",
        );

        await refreshPosition();

        return;
      }


      const nextReview =
        next.run.stages.find(
          (stage) =>
            stage.status ===
              "review",
        );


      if (
        nextReview &&
        stageAction(
          nextReview.stageId,
        ) ===
          "stake"
      ) {
        setSuccess(
          "Private asset was Unshielded and verified publicly. Public Staking is now unlocked.",
        );
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The submitted Staking stage is not verified yet.",
      );
    } finally {
      setConfirming(
        false,
      );
    }
  }


  async function runPositionAction(
    action:
      | "initiateUnstake"
      | "completeUnstake"
      | "claimRewards",
  ) {
    if (
      !pool ||
      !selectedAsset ||
      !publicOption ||
      publicOption
        .providerId !==
        AVNU_STAKING_ADAPTER_ID ||
      positionExecuting
    ) {
      return;
    }


    setPositionExecuting(
      true,
    );

    setError(
      "",
    );

    setSuccess(
      "",
    );


    try {
      const result =
        await executeStakingPositionRoute({
          action,

          amount:
            action ===
              "initiateUnstake"
              ? unstakeAmount
              : null,

          pool,

          position,

          stakeAsset:
            selectedAsset,

          executor:
            wallet,
        });


      setSuccess(
        `${action === "initiateUnstake"
          ? "Unstake initiated"
          : action === "completeUnstake"
            ? "Withdrawal submitted"
            : "Rewards claim submitted"}: ${result.hash.slice(0, 10)}…${result.hash.slice(-6)}`,
      );


      await refreshPosition();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Staking position action failed.",
      );
    } finally {
      setPositionExecuting(
        false,
      );
    }
  }


  function resetFlow() {
    if (
      wallet.address
    ) {
      clearActiveAgentRecoveryPointer({
        kind:
          "staking",

        account:
          wallet.address,
      });
    }


    clearAgentFlow();

    setError(
      "",
    );

    setSuccess(
      "",
    );
  }


  return {
    wallet,
    network,

    options,
    selectedOption,
    selectedAsset,

    amount,
    unstakeAmount,

    pool,
    position,
    shieldFee,

    loading,
    executing,
    confirming,
    positionExecuting,
    busy,
    flowLocked,

    error,
    success,

    stakingAgentSession,
    submittedStage,
    reviewStage,

    stageAction,

    selectAsset,
    changeAmount,
    setUnstakeAmount,

    startFlow,
    executeNextStage,
    confirmSubmitted,
    runPositionAction,
    refreshPosition,
    resetFlow,
  } as const;
}


export type StakingController =
  ReturnType<
    typeof useStakingController
  >;
