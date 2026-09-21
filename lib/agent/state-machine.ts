import type {
  AgentPlan,
} from "@/lib/agent/plan";


export type AgentRuntimeStageStatus =
  | "locked"
  | "review"
  | "submitted"
  | "confirmed"
  | "failed";


export type AgentExecutionReference =
  Readonly<{
    kind:
      | "transaction"
      | "provider-order";

    id: string;
  }>;


export type AgentRunStatus =
  | "blocked"
  | "review"
  | "executing"
  | "waiting"
  | "completed"
  | "failed";


export type AgentRuntimeStage =
  Readonly<{
    stageId: string;

    status:
      AgentRuntimeStageStatus;

    /**
     * Generic execution identity.
     *
     * A normal chain transaction uses kind=transaction.
     * Async providers such as Garden may use kind=provider-order.
     */
    executionReference?:
      AgentExecutionReference;

    /**
     * Backward-compatible convenience field for on-chain transaction stages.
     *
     * New cross-chain/provider runtimes must read executionReference instead.
     */
    txHash?: string;

    error?: string;
  }>;


export type AgentRun =
  Readonly<{
    status:
      AgentRunStatus;

    stages:
      readonly AgentRuntimeStage[];
  }>;


function validatePlan(
  plan: AgentPlan,
): void {
  const ids =
    new Set<string>();

  for (
    const stage of
    plan.stages
  ) {
    if (
      ids.has(
        stage.id,
      )
    ) {
      throw new Error(
        `Duplicate Agent stage id: ${stage.id}.`,
      );
    }

    ids.add(
      stage.id,
    );
  }

  for (
    const stage of
    plan.stages
  ) {
    for (
      const dependency of
      stage.dependsOn
    ) {
      if (
        dependency ===
          stage.id
      ) {
        throw new Error(
          `Agent stage ${stage.id} cannot depend on itself.`,
        );
      }

      if (
        !ids.has(
          dependency,
        )
      ) {
        throw new Error(
          `Agent stage ${stage.id} depends on unknown stage ${dependency}.`,
        );
      }
    }
  }

  /*
   * Detect dependency cycles.
   */
  const visiting =
    new Set<string>();

  const visited =
    new Set<string>();

  const byId =
    new Map(
      plan.stages.map(
        (stage) => [
          stage.id,
          stage,
        ],
      ),
    );

  function visit(
    stageId: string,
  ) {
    if (
      visited.has(
        stageId,
      )
    ) {
      return;
    }

    if (
      visiting.has(
        stageId,
      )
    ) {
      throw new Error(
        "Agent plan contains a dependency cycle.",
      );
    }

    visiting.add(
      stageId,
    );

    const stage =
      byId.get(
        stageId,
      );

    if (!stage) {
      return;
    }

    for (
      const dependency of
      stage.dependsOn
    ) {
      visit(
        dependency,
      );
    }

    visiting.delete(
      stageId,
    );

    visited.add(
      stageId,
    );
  }

  for (
    const stage of
    plan.stages
  ) {
    visit(
      stage.id,
    );
  }
}


function deriveRunStatus(
  plan: AgentPlan,
  stages:
    readonly AgentRuntimeStage[],
): AgentRunStatus {
  if (
    plan.status !==
      "ready"
  ) {
    return "blocked";
  }

  if (
    stages.some(
      (stage) =>
        stage.status ===
          "failed",
    )
  ) {
    return "failed";
  }

  if (
    stages.length > 0 &&
    stages.every(
      (stage) =>
        stage.status ===
          "confirmed",
    )
  ) {
    return "completed";
  }

  if (
    stages.some(
      (stage) =>
        stage.status ===
          "submitted",
    )
  ) {
    return "executing";
  }

  if (
    stages.some(
      (stage) =>
        stage.status ===
          "review",
    )
  ) {
    return "review";
  }

  return "waiting";
}


function dependenciesConfirmed(
  plan: AgentPlan,
  runtimeStages:
    readonly AgentRuntimeStage[],
  stageId: string,
): boolean {
  const stage =
    plan.stages.find(
      (candidate) =>
        candidate.id ===
          stageId,
    );

  if (!stage) {
    throw new Error(
      `Unknown Agent stage: ${stageId}.`,
    );
  }

  return stage.dependsOn.every(
    (dependencyId) =>
      runtimeStages.some(
        (runtime) =>
          runtime.stageId ===
            dependencyId &&
          runtime.status ===
            "confirmed",
      ),
  );
}


function unlockStages(
  plan: AgentPlan,
  runtimeStages:
    readonly AgentRuntimeStage[],
): readonly AgentRuntimeStage[] {
  return runtimeStages.map(
    (runtime) => {
      if (
        runtime.status !==
          "locked"
      ) {
        return runtime;
      }

      if (
        !dependenciesConfirmed(
          plan,
          runtimeStages,
          runtime.stageId,
        )
      ) {
        return runtime;
      }

      return {
        ...runtime,

        status:
          "review",
      };
    },
  );
}


function replaceStage(
  run: AgentRun,
  next:
    AgentRuntimeStage,
): readonly AgentRuntimeStage[] {
  return run.stages.map(
    (stage) =>
      stage.stageId ===
        next.stageId
        ? next
        : stage,
  );
}


export function createAgentRun(
  plan: AgentPlan,
): AgentRun {
  validatePlan(
    plan,
  );

  const stages:
    readonly AgentRuntimeStage[] =
    plan.stages.map(
      (stage) => ({
        stageId:
          stage.id,

        status:
          plan.status ===
            "ready" &&
          stage.dependsOn.length ===
            0
            ? "review"
            : "locked",
      }),
    );

  return {
    status:
      deriveRunStatus(
        plan,
        stages,
      ),

    stages,
  };
}


function transitiveStageDependencies(
  plan:
    AgentPlan,

  stageId:
    string,
): Set<string> {
  const byId =
    new Map(
      plan.stages.map(
        (stage) => [
          stage.id,
          stage,
        ],
      ),
    );


  const target =
    byId.get(
      stageId,
    );


  if (!target) {
    throw new Error(
      `Unknown Agent plan stage: ${stageId}.`,
    );
  }


  const result =
    new Set<string>();


  function visit(
    id:
      string,
  ) {
    if (
      result.has(
        id,
      )
    ) {
      return;
    }


    const stage =
      byId.get(
        id,
      );


    if (!stage) {
      throw new Error(
        `Unknown Agent dependency stage: ${id}.`,
      );
    }


    result.add(
      id,
    );


    for (
      const dependency
      of stage.dependsOn
    ) {
      visit(
        dependency,
      );
    }
  }


  for (
    const dependency
    of target.dependsOn
  ) {
    visit(
      dependency,
    );
  }


  return result;
}


/**
 * Reconstruct an Agent run that already submitted one concrete stage before
 * the browser lost its in-memory state.
 *
 * Every transitive dependency of that submitted stage is restored as
 * confirmed. No future stage is fabricated as confirmed.
 */
export function restoreSubmittedAgentRun(
  plan:
    AgentPlan,

  stageId:
    string,

  reference:
    | string
    | AgentExecutionReference,
): AgentRun {
  validatePlan(
    plan,
  );


  const target =
    plan.stages.find(
      (stage) =>
        stage.id ===
          stageId,
    );


  if (!target) {
    throw new Error(
      `Unknown Agent recovery stage: ${stageId}.`,
    );
  }


  const dependencies =
    transitiveStageDependencies(
      plan,
      stageId,
    );


  const executionReference =
    normalizeExecutionReference(
      reference,
    );


  const base =
    createAgentRun(
      plan,
    );


  let stages:
    readonly AgentRuntimeStage[] =
    base.stages.map(
      (runtime) => {
        if (
          dependencies.has(
            runtime.stageId,
          )
        ) {
          return {
            ...runtime,

            status:
              "confirmed",
          };
        }


        if (
          runtime.stageId ===
            stageId
        ) {
          return {
            ...runtime,

            status:
              "submitted",

            executionReference,

            ...(executionReference
              .kind ===
                "transaction"
              ? {
                  txHash:
                    executionReference.id,
                }
              : {}),
          };
        }


        return runtime;
      },
    );


  /*
   * Dependencies restored above may unlock other legitimate review stages.
   * The submitted target itself remains submitted.
   */
  stages =
    unlockStages(
      plan,
      stages,
    );


  return {
    status:
      deriveRunStatus(
        plan,
        stages,
      ),

    stages,
  };
}


export function getAgentRuntimeStage(
  run: AgentRun,
  stageId: string,
): AgentRuntimeStage {
  const stage =
    run.stages.find(
      (candidate) =>
        candidate.stageId ===
          stageId,
    );

  if (!stage) {
    throw new Error(
      `Unknown Agent runtime stage: ${stageId}.`,
    );
  }

  return stage;
}


function normalizeExecutionReference(
  reference:
    | string
    | AgentExecutionReference,
): AgentExecutionReference {
  if (
    typeof reference ===
      "string"
  ) {
    if (
      !/^0x[0-9a-f]+$/i.test(
        reference,
      )
    ) {
      throw new Error(
        "Agent transaction stage requires a valid transaction hash.",
      );
    }

    return {
      kind:
        "transaction",

      id:
        reference,
    };
  }

  const id =
    reference.id.trim();

  if (!id) {
    throw new Error(
      "Agent execution reference cannot be empty.",
    );
  }

  if (
    reference.kind ===
      "transaction"
  ) {
    if (
      !/^0x[0-9a-f]+$/i.test(
        id,
      )
    ) {
      throw new Error(
        "Agent transaction stage requires a valid transaction hash.",
      );
    }
  } else if (
    reference.kind ===
      "provider-order"
  ) {
    if (
      id.length > 256 ||
      !/^[a-z0-9:_-]+$/i.test(
        id,
      )
    ) {
      throw new Error(
        "Agent provider order reference is invalid.",
      );
    }
  } else {
    throw new Error(
      "Agent execution reference kind is unsupported.",
    );
  }

  return {
    kind:
      reference.kind,

    id,
  };
}


export function submitAgentStage(
  plan: AgentPlan,
  run: AgentRun,
  stageId: string,
  reference:
    | string
    | AgentExecutionReference,
): AgentRun {
  const current =
    getAgentRuntimeStage(
      run,
      stageId,
    );

  if (
    current.status !==
      "review"
  ) {
    throw new Error(
      `Agent stage ${stageId} is not ready for submission.`,
    );
  }

  if (
    !dependenciesConfirmed(
      plan,
      run.stages,
      stageId,
    )
  ) {
    throw new Error(
      `Agent stage ${stageId} has unconfirmed dependencies.`,
    );
  }

  const executionReference =
    normalizeExecutionReference(
      reference,
    );

  const stages =
    replaceStage(
      run,
      {
        ...current,

        status:
          "submitted",

        executionReference,

        ...(executionReference
          .kind ===
            "transaction"
          ? {
              txHash:
                executionReference.id,
            }
          : {}),
      },
    );

  return {
    status:
      deriveRunStatus(
        plan,
        stages,
      ),

    stages,
  };
}


export function confirmAgentStage(
  plan: AgentPlan,
  run: AgentRun,
  stageId: string,
): AgentRun {
  const current =
    getAgentRuntimeStage(
      run,
      stageId,
    );

  if (
    current.status !==
      "submitted"
  ) {
    throw new Error(
      `Agent stage ${stageId} must be submitted before confirmation.`,
    );
  }

  const confirmed =
    replaceStage(
      run,
      {
        ...current,

        status:
          "confirmed",
      },
    );

  const stages =
    unlockStages(
      plan,
      confirmed,
    );

  return {
    status:
      deriveRunStatus(
        plan,
        stages,
      ),

    stages,
  };
}


export function failAgentStage(
  plan: AgentPlan,
  run: AgentRun,
  stageId: string,
  error: string,
): AgentRun {
  const current =
    getAgentRuntimeStage(
      run,
      stageId,
    );

  if (
    current.status !==
      "submitted"
  ) {
    throw new Error(
      `Agent stage ${stageId} must be submitted before it can fail.`,
    );
  }

  const stages =
    replaceStage(
      run,
      {
        ...current,

        status:
          "failed",

        error:
          error.trim() ||
          "Agent stage failed.",
      },
    );

  return {
    status:
      deriveRunStatus(
        plan,
        stages,
      ),

    stages,
  };
}
