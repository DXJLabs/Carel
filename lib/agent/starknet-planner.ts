import type {
  AgentExecutionMode,
} from "@/lib/agent/execution";

import {
  pendingAgentFeeQuote,
} from "@/lib/agent/fees";

import type {
  AgentPlan,
  AgentPlanStage,
} from "@/lib/agent/plan";

import {
  routeAgentGoal,
} from "@/lib/agent/router";

import {
  STARKNET_MAINNET,
  STARKNET_SEPOLIA,
} from "@/lib/carel/ecosystems/starknet/chains";


export type StarknetAgentPlanInput =
  Readonly<{
    goal: string;

    chainId: string;

    /**
     * UI-selected mode remains the fallback.
     * Explicit privacy language in the goal may override it.
     */
    mode:
      AgentExecutionMode;
  }>;


function isStarknetChain(
  chainId: string,
): boolean {
  return (
    chainId ===
      STARKNET_MAINNET.chainId ||
    chainId ===
      STARKNET_SEPOLIA.chainId
  );
}


export function inferAgentPrivacyMode(
  goal: string,
  fallback:
    AgentExecutionMode,
): AgentExecutionMode {
  const text =
    goal
      .trim()
      .toLowerCase();

  if (
    /\bunshield\b/.test(
      text,
    ) ||
    /\bfrom\s+(?:my\s+)?private\b/.test(
      text,
    ) ||
    /\bmake\b.+\bpublic\b/.test(
      text,
    ) ||
    /\bto\s+public\b/.test(
      text,
    )
  ) {
    return "unshield";
  }

  if (
    /\bshield\b/.test(
      text,
    ) ||
    /\bprivate\b/.test(
      text,
    ) ||
    /\bprivately\b/.test(
      text,
    ) ||
    /\bhide\b.+\b(?:proceeds|result|balance|position)\b/.test(
      text,
    ) ||
    /\b(?:do\s+not|don't)\s+expose\b/.test(
      text,
    )
  ) {
    return "shield";
  }

  return fallback;
}


function planned(
  stage:
    Omit<
      AgentPlanStage,
      "status"
    >,
): AgentPlanStage {
  return {
    ...stage,

    status:
      "planned",
  };
}


function basePlan({
  goal,
  tool,
  mode,
  chainId,
  status,
  stages,
  message,
}: {
  goal: string;
  tool:
    AgentPlan["objective"]["tool"];
  mode:
    AgentExecutionMode;
  chainId: string;
  status:
    AgentPlan["status"];
  stages:
    readonly AgentPlanStage[];
  message?: string;
}): AgentPlan {
  return {
    status,

    objective: {
      goal,
      tool,
      mode,
      chainId,
    },

    stages,

    agentFee:
      pendingAgentFeeQuote(),

    ...(message
      ? {
          message,
        }
      : {}),
  };
}


/**
 * Starknet Agent Core v1.
 *
 * This planner understands lifecycle semantics. It does not choose AVNU,
 * Vesu, Endur, STRK20, or another provider. Provider selection remains
 * downstream in CAREL's capability/execution layer.
 */
export function buildStarknetAgentPlan(
  input:
    StarknetAgentPlanInput,
): AgentPlan {
  const mode =
    inferAgentPrivacyMode(
      input.goal,
      input.mode,
    );

  const route =
    routeAgentGoal(
      input.goal,
    );

  if (
    !isStarknetChain(
      input.chainId,
    )
  ) {
    return basePlan({
      goal:
        input.goal,

      tool:
        route.tool,

      mode,

      chainId:
        input.chainId,

      status:
        "blocked",

      stages: [],

      message:
        "Starknet Agent Core currently plans Starknet Mainnet and Starknet Sepolia only.",
    });
  }

  if (
    route.status !==
      "ready"
  ) {
    return basePlan({
      goal:
        input.goal,

      tool:
        route.tool,

      mode,

      chainId:
        input.chainId,

      status:
        "blocked",

      stages: [],

      message:
        route.message ??
        "CAREL could not understand this goal.",
    });
  }

  /*
   * The legacy router currently uses Balance as its fallback.
   * The new planner must not interpret unknown free-form text as an
   * executable balance action.
   */
  if (
    route.tool ===
      "Balance"
  ) {
    return basePlan({
      goal:
        input.goal,

      tool:
        route.tool,

      mode,

      chainId:
        input.chainId,

      status:
        "needs-input",

      stages: [],

      message:
        "Describe a supported action such as Swap, Stake, Lend, Borrow, or Bridge.",
    });
  }


  if (
    route.tool ===
      "Swap" &&
    route.swapRequest
  ) {
    const request =
      route.swapRequest;

    const swap =
      planned({
        id:
          "swap-1",

        action:
          "swap",

        sourceChainId:
          input.chainId,

        inputAssetSymbol:
          request.fromSymbol,

        outputAssetSymbol:
          request.toSymbol,

        amount: {
          kind:
            "exact",

          amountText:
            request.amountText,
        },

        privacyBefore:
          "public",

        privacyAfter:
          "public",

        dependsOn: [],
      });

    if (
      mode ===
        "normal"
    ) {
      return basePlan({
        goal:
          input.goal,

        tool:
          route.tool,

        mode,

        chainId:
          input.chainId,

        status:
          "ready",

        stages: [
          swap,
        ],
      });
    }

    if (
      mode ===
        "shield"
    ) {
      const shield =
        planned({
          id:
            "shield-2",

          action:
            "shield",

          sourceChainId:
            input.chainId,

          inputAssetSymbol:
            request.toSymbol,

          outputAssetSymbol:
            request.toSymbol,

          amount: {
            kind:
              "stage-output",

            stageId:
              swap.id,
          },

          privacyBefore:
            "public",

          privacyAfter:
            "private",

          dependsOn: [
            swap.id,
          ],

          note:
            "Shield the confirmed Swap output, not the pre-trade estimate.",
        });

      return basePlan({
        goal:
          input.goal,

        tool:
          route.tool,

        mode,

        chainId:
          input.chainId,

        status:
          "ready",

        stages: [
          swap,
          shield,
        ],
      });
    }

    const unshield =
      planned({
        id:
          "unshield-1",

        action:
          "unshield",

        sourceChainId:
          input.chainId,

        inputAssetSymbol:
          request.fromSymbol,

        outputAssetSymbol:
          request.fromSymbol,

        amount: {
          kind:
            "exact",

          amountText:
            request.amountText,
        },

        privacyBefore:
          "private",

        privacyAfter:
          "public",

        dependsOn: [],
      });

    return basePlan({
      goal:
        input.goal,

      tool:
        route.tool,

      mode,

      chainId:
        input.chainId,

      status:
        "ready",

      stages: [
        unshield,

        planned({
          ...swap,

          id:
            "swap-2",

          dependsOn: [
            unshield.id,
          ],

          note:
            "Swap only after the public Unshield balance is confirmed.",
        }),
      ],
    });
  }


  if (
    route.tool ===
      "Staking" &&
    route.stakeRequest
  ) {
    const request =
      route.stakeRequest;

    if (
      mode ===
        "unshield"
    ) {
      const unshield =
        planned({
          id:
            "unshield-1",

          action:
            "unshield",

          sourceChainId:
            input.chainId,

          inputAssetSymbol:
            request.assetSymbol,

          outputAssetSymbol:
            request.assetSymbol,

          amount: {
            kind:
              "exact",

          amountText:
              request.amountText,
          },

          privacyBefore:
            "private",

          privacyAfter:
            "public",

          dependsOn: [],
        });

      return basePlan({
        goal:
          input.goal,

        tool:
          route.tool,

        mode,

        chainId:
          input.chainId,

        status:
          "ready",

        stages: [
          unshield,

          planned({
            id:
              "stake-2",

            action:
              "stake",

            sourceChainId:
              input.chainId,

            inputAssetSymbol:
              request.assetSymbol,

            outputAssetSymbol:
              request.targetSymbol,

            amount: {
              kind:
                "exact",

              amountText:
                request.amountText,
            },

            privacyBefore:
              "public",

            privacyAfter:
              "public",

            dependsOn: [
              unshield.id,
            ],
          }),
        ],
      });
    }

    return basePlan({
      goal:
        input.goal,

      tool:
        route.tool,

      mode,

      chainId:
        input.chainId,

      status:
        "ready",

      stages: [
        planned({
          id:
            "stake-1",

          action:
            "stake",

          sourceChainId:
            input.chainId,

          inputAssetSymbol:
            request.assetSymbol,

          outputAssetSymbol:
            request.targetSymbol,

          amount: {
            kind:
              "exact",

            amountText:
              request.amountText,
          },

          privacyBefore:
            "public",

          privacyAfter:
            mode ===
              "shield"
              ? "private"
              : "public",

          dependsOn: [],

          ...(mode ===
            "shield"
            ? {
                note:
                  "Shield Staking is a privacy-aware staking composition; the receipt ends private.",
              }
            : {}),
        }),
      ],
    });
  }


  if (
    route.tool ===
      "Lend" &&
    route.lendRequest
  ) {
    const request =
      route.lendRequest;

    if (
      mode ===
        "unshield"
    ) {
      const unshield =
        planned({
          id:
            "unshield-1",

          action:
            "unshield",

          sourceChainId:
            input.chainId,

          inputAssetSymbol:
            request.symbol,

          outputAssetSymbol:
            request.symbol,

          amount: {
            kind:
              "exact",

            amountText:
              request.amountText,
          },

          privacyBefore:
            "private",

          privacyAfter:
            "public",

          dependsOn: [],
        });

      return basePlan({
        goal:
          input.goal,

        tool:
          route.tool,

        mode,

        chainId:
          input.chainId,

        status:
          "ready",

        stages: [
          unshield,

          planned({
            id:
              "lend-2",

            action:
              "lend",

            sourceChainId:
              input.chainId,

            inputAssetSymbol:
              request.symbol,

            amount: {
              kind:
                "exact",

              amountText:
                request.amountText,
            },

            privacyBefore:
              "public",

            privacyAfter:
              "public",

            dependsOn: [
              unshield.id,
            ],

            note:
              "Prepare a fresh lending review after Unshield confirmation.",
          }),
        ],
      });
    }

    return basePlan({
      goal:
        input.goal,

      tool:
        route.tool,

      mode,

      chainId:
        input.chainId,

      status:
        "ready",

      stages: [
        planned({
          id:
            "lend-1",

          action:
            "lend",

          sourceChainId:
            input.chainId,

          inputAssetSymbol:
            request.symbol,

          amount: {
            kind:
              "exact",

            amountText:
              request.amountText,
          },

          privacyBefore:
            "public",

          privacyAfter:
            mode ===
              "shield"
              ? "private"
              : "public",

          dependsOn: [],

          ...(mode ===
            "shield"
            ? {
                note:
                  "Shield Lend ends with a private Vesu vToken receipt through the lending anonymizer.",
              }
            : {}),
        }),
      ],
    });
  }


  if (
    route.tool ===
      "Borrow" &&
    route.borrowRequest
  ) {
    const request =
      route.borrowRequest;

    const borrowStage = (
      id: string,
      dependsOn:
        readonly string[],
    ) =>
      planned({
        id,

        action:
          "borrow",

        sourceChainId:
          input.chainId,

        inputAssetSymbol:
          request.collateralSymbol,

        outputAssetSymbol:
          request.borrowSymbol,

        amount: {
          kind:
            "exact",

          amountText:
            request.borrowAmountText,
        },

        collateral: {
          amountText:
            request.collateralAmountText,

          symbol:
            request.collateralSymbol,
        },

        privacyBefore:
          "public",

        privacyAfter:
          "public",

        dependsOn,
      });

    if (
      mode ===
        "normal"
    ) {
      return basePlan({
        goal:
          input.goal,

        tool:
          route.tool,

        mode,

        chainId:
          input.chainId,

        status:
          "ready",

        stages: [
          borrowStage(
            "borrow-1",
            [],
          ),
        ],
      });
    }

    if (
      mode ===
        "shield"
    ) {
      const borrow =
        borrowStage(
          "borrow-1",
          [],
        );

      return basePlan({
        goal:
          input.goal,

        tool:
          route.tool,

        mode,

        chainId:
          input.chainId,

        status:
          "ready",

        stages: [
          borrow,

          planned({
            id:
              "shield-2",

            action:
              "shield",

            sourceChainId:
              input.chainId,

            inputAssetSymbol:
              request.borrowSymbol,

            outputAssetSymbol:
              request.borrowSymbol,

            amount: {
              kind:
                "stage-output",

              stageId:
                borrow.id,
            },

            privacyBefore:
              "public",

            privacyAfter:
              "private",

            dependsOn: [
              borrow.id,
            ],

            note:
              "The Vesu debt position remains public; only confirmed borrowed proceeds are Shielded.",
          }),
        ],
      });
    }

    const unshield =
      planned({
        id:
          "unshield-1",

        action:
          "unshield",

        sourceChainId:
          input.chainId,

        inputAssetSymbol:
          request.collateralSymbol,

        outputAssetSymbol:
          request.collateralSymbol,

        amount: {
          kind:
            "exact",

          amountText:
            request.collateralAmountText,
        },

        privacyBefore:
          "private",

        privacyAfter:
          "public",

        dependsOn: [],

        note:
          "Only the required collateral amount is Unshielded.",
      });

    return basePlan({
      goal:
        input.goal,

      tool:
        route.tool,

      mode,

      chainId:
        input.chainId,

      status:
        "ready",

      stages: [
        unshield,

        borrowStage(
          "borrow-2",
          [
            unshield.id,
          ],
        ),
      ],

      message:
        "Borrow must receive a fresh risk review after the collateral Unshield is confirmed.",
    });
  }


  /*
   * Cross-chain Bridge planning will become its own planner. We keep the
   * existing Bridge runtime untouched while Starknet Agent Core is stabilized.
   */
  return basePlan({
    goal:
      input.goal,

    tool:
      route.tool,

    mode,

    chainId:
      input.chainId,

    status:
      "needs-input",

    stages: [],

    message:
      "Bridge remains on CAREL's existing cross-chain execution flow while Starknet Agent Core is being introduced.",
  });
}
