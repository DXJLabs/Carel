"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  ArrowRight,
  LoaderCircle,
  RefreshCw,
  WalletCards,
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

import type {
  AgentPlan,
} from "@/lib/agent/plan";

import {
  createAgentExecutionSession,
  executeAgentStage,
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
    selectedAssetId,
    selectedPoolId,
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


    setExecuting(true);
    setError("");
    setSuccess("");


    try {
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

  return (
    <section
      className={
        styles.borrowPanel
      }
    >
      {mode === "shield" && (
        <div
          className={
            styles.borrowRisk
          }
        >
          <div
            className={
              styles.rule
            }
          >
            <span>
              Route
            </span>

            <strong>
              Public {
                selectedAsset.symbol
              }
              {" → "}
              STRK20
              {" → "}
              Vesu
              {" → "}
              Private vToken
            </strong>
          </div>

          <div
            className={
              styles.rule
            }
          >
            <span>
              Public {
                selectedAsset.symbol
              }
            </span>

            <strong>
              {publicBalance === null
                ? "—"
                : `${formatUnits(
                    publicBalance,
                    selectedAsset.decimals,
                    6,
                  )} ${selectedAsset.symbol}`}
            </strong>
          </div>

          <p
            className={
              styles.privacyNote
            }
          >
            The Vesu lending
            anonymizer supplies the
            underlying asset to the
            Vesu vault and returns
            the minted vToken as a
            private STRK20 note.
          </p>

          <button
            type="button"
            className={
              styles.textButton
            }
            onClick={
              onPublicMode
            }
          >
            Use Normal mode
            <ArrowRight
              size={14}
            />
          </button>
        </div>
      )}

      {mode === "unshield" && (
        <div
          className={
            styles.borrowRisk
          }
        >
          <div
            className={
              styles.rule
            }
          >
            <span>
              Route
            </span>

            <strong>
              Private {
                selectedAsset.symbol
              }
              {" → "}
              Public {
                selectedAsset.symbol
              }
              {" → "}
              Vesu
            </strong>
          </div>

          <div
            className={
              styles.rule
            }
          >
            <span>
              Private {
                selectedAsset.symbol
              }
            </span>

            <strong>
              {!wallet.privateRevealed
                ? "Hidden"
                : privateBalance === null
                  ? "—"
                  : `${formatUnits(
                      privateBalance,
                      selectedAsset.decimals,
                      6,
                    )} ${selectedAsset.symbol}`}
            </strong>
          </div>

          <div
            className={
              styles.rule
            }
          >
            <span>
              Public {
                selectedAsset.symbol
              }
            </span>

            <strong>
              {publicBalance === null
                ? "—"
                : `${formatUnits(
                    publicBalance,
                    selectedAsset.decimals,
                    6,
                  )} ${selectedAsset.symbol}`}
            </strong>
          </div>

          {!wallet.strk20Capable ? (
            <div
              className={
                styles.notice
              }
              role="alert"
            >
              <p>
                Ready does not report
                the STRK20 Wallet API
                required for Unshield
                Lend.
              </p>
            </div>
          ) : !wallet.privateRevealed ? (
            <button
              type="button"
              className={
                styles.secondary
              }
              disabled={busy}
              onClick={() =>
                void wallet
                  .revealPrivateBalance()
              }
            >
              <RefreshCw
                size={16}
              />
              Reveal private balance
            </button>
          ) : (
            !privateEnough &&
            parsedAmount !==
              null && (
              <div
                className={
                  styles.notice
                }
                role="alert"
              >
                <p>
                  Private {
                    selectedAsset.symbol
                  } balance is below
                  this Lend amount.
                </p>
              </div>
            )
          )}

          <p
            className={
              styles.privacyNote
            }
          >
            Agent Core keeps the Vesu
            stage locked until the
            exact Unshield amount is
            confirmed in the public
            balance. Vesu is freshly
            prepared only after that
            verification succeeds.
          </p>
        </div>
      )}

      {lendAgentSession &&
        lendAgentSession
          .run.stages.map(
            (stage) => (
              <div
                key={
                  stage.stageId
                }
                className={
                  styles.rule
                }
              >
                <span>
                  {stageAction(
                    stage.stageId,
                  ) ??
                    "stage"}
                </span>

                <strong>
                  {stage.status}
                  {stage.txHash
                    ? ` · ${shortAddress(
                        stage.txHash,
                      )}`
                    : ""}
                </strong>
              </div>
            ),
          )}

      <div
        className={
          styles.borrowPair
        }
      >
        <label
          className={
            styles.borrowField
          }
        >
          <span>
            Asset
          </span>

          <select
            className={
              styles.borrowSelect
            }
            value={
              selectedAssetId
            }
            disabled={
              busy ||
              flowLocked
            }
            onChange={(
              event,
            ) => {
              clearAgentFlow();

              setSelectedAssetId(
                event.target.value,
              );

              setMarkets([]);
              setSelectedPoolId("");
              setError("");
              setSuccess("");
            }}
          >
            {VESU_LEND_ASSETS.map(
              (asset) => (
                <option
                  key={
                    asset.id
                  }
                  value={
                    asset.id
                  }
                >
                  {
                    asset.symbol
                  }
                </option>
              ),
            )}
          </select>
        </label>

        <label
          className={
            styles.borrowField
          }
        >
          <span>
            Lend
          </span>

          <div
            className={
              styles.borrowInput
            }
          >
            <input
              inputMode="decimal"
              value={amount}
              disabled={
                busy ||
                flowLocked
              }
              onChange={(
                event,
              ) => {
                setAmount(
                  event.target
                    .value,
                );

                setError("");
                setSuccess("");
              }}
              aria-label={`${selectedAsset.symbol} lend amount`}
            />

            <strong>
              {
                selectedAsset
                  .symbol
              }
            </strong>
          </div>
        </label>
      </div>

      <div
        className={
          styles.rule
        }
      >
        <span>
          Provider
        </span>

        <strong>
          Vesu
        </strong>
      </div>

      <div
        className={
          styles.rule
        }
      >
        <span>
          Pool
        </span>

        {markets.length > 1 ? (
          <select
            className={
              styles.borrowSelect
            }
            value={
              selectedMarket
                ?.pool.id ??
              ""
            }
            disabled={
              busy ||
              flowLocked
            }
            onChange={(
              event,
            ) => {
              clearAgentFlow();

              setSelectedPoolId(
                event.target
                  .value,
              );
            }}
          >
            {markets.map(
              (market) => (
                <option
                  key={
                    market.pool.id
                  }
                  value={
                    market.pool.id
                  }
                >
                  {
                    market.pool
                      .name
                  }
                </option>
              ),
            )}
          </select>
        ) : (
          <strong>
            {selectedMarket
              ?.pool.name ??
              (loading
                ? "Checking…"
                : "—")}
          </strong>
        )}
      </div>

      {selectedMarket && (
        <>
          <div
            className={
              styles.rule
            }
          >
            <span>
              Verified context
            </span>

            <strong>
              {
                selectedMarket
                  .asset.symbol
              }{" "}
              /{" "}
              {
                selectedMarket
                  .counterpart
                  .symbol
              }
            </strong>
          </div>

          <div
            className={
              styles.rule
            }
          >
            <span>
              Utilization
            </span>

            <strong>
              {percentFromBps(
                selectedMarket
                  .market
                  .utilizationBps,
              )}
            </strong>
          </div>

          <div
            className={
              styles.rule
            }
          >
            <span>
              Pool contract
            </span>

            <strong
              className={
                styles.borrowAddress
              }
            >
              {shortAddress(
                selectedMarket
                  .pool.address,
              )}
            </strong>
          </div>
        </>
      )}

      <p
        className={
          styles.privacyNote
        }
      >
        {mode === "shield"
          ? "Shield Lend verifies the active Vesu pool and its vToken before the anonymizer transaction is sent to Ready."
          : "The Vesu lending position is public. CAREL verifies an active pool context before execution."}
      </p>

      <button
        type="button"
        className={
          styles.secondary
        }
        disabled={
          busy ||
          flowLocked
        }
        onClick={() =>
          void loadMarkets()
            .catch(
              (cause) =>
                setError(
                  cause instanceof Error
                    ? cause.message
                    : "Could not refresh Vesu markets.",
                ),
            )
        }
      >
        <RefreshCw
          size={16}
        />

        {loading
          ? "Checking markets…"
          : "Refresh markets"}
      </button>

      {!flowLocked &&
        (
          !lendAgentSession ||
          (
            lendAgentSession
              .run.status !==
              "completed" &&
            lendAgentSession
              .run.status !==
              "failed"
          )
        ) && (
        <button
          type="button"
          className={
            styles.primary
          }
          disabled={
            busy ||
            !selectedMarket ||
            (
              mode ===
                "shield" &&
              !wallet.strk20Capable
            ) ||
            (
              mode ===
                "unshield" &&
              (
                !wallet.strk20Capable ||
                !wallet.privateRevealed ||
                !privateEnough
              )
            )
          }
          onClick={() =>
            void startAgentLend()
          }
        >
          {executing ? (
            <LoaderCircle
              size={16}
            />
          ) : (
            <ArrowRight
              size={16}
            />
          )}

          {executing
            ? "Waiting for wallet…"
            : mode === "shield"
              ? `Review & Shield Lend ${selectedAsset.symbol}`
              : mode === "unshield"
                ? `Start Unshield Lend ${selectedAsset.symbol}`
                : `Review & Lend ${selectedAsset.symbol}`}
        </button>
      )}


      {flowLocked &&
        submittedStage && (
        <button
          type="button"
          className={
            styles.primary
          }
          disabled={busy}
          onClick={() =>
            void confirmSubmitted()
          }
        >
          {confirming ? (
            <LoaderCircle
              size={16}
            />
          ) : (
            <RefreshCw
              size={16}
            />
          )}

          {confirming
            ? "Checking confirmation…"
            : "Check Agent confirmation"}
        </button>
      )}


      {flowLocked &&
        !submittedStage &&
        reviewStage && (
        <button
          type="button"
          className={
            styles.primary
          }
          disabled={busy}
          onClick={() =>
            void executeNextStage()
          }
        >
          {executing ? (
            <LoaderCircle
              size={16}
            />
          ) : (
            <ArrowRight
              size={16}
            />
          )}

          {executing
            ? "Waiting for wallet…"
            : `Execute Vesu Lend ${selectedAsset.symbol}`}
        </button>
      )}


      {lendAgentSession &&
        (
          lendAgentSession
            .run.status ===
            "completed" ||
          lendAgentSession
            .run.status ===
            "failed"
        ) && (
        <button
          type="button"
          className={
            styles.secondary
          }
          disabled={busy}
          onClick={
            resetAgentLend
          }
        >
          <RefreshCw
            size={16}
          />

          New Lend
        </button>
      )}


      {error && (
        <div
          className={
            styles.notice
          }
          role="alert"
        >
          <p>
            {error}
          </p>
        </div>
      )}

      {success && (
        <p
          className={
            styles.inlineStatus
          }
        >
          {success}
        </p>
      )}
    </section>
  );
}
