import type {
  AgentPlan,
  AgentPlanStage,
  AgentStageAction,
} from "@/lib/agent/plan";

import {
  confirmAgentStage,
  createAgentRun,
  getAgentRuntimeStage,
  submitAgentStage,
  type AgentExecutionReference,
  type AgentRun,
} from "@/lib/agent/state-machine";


export type AgentVerifiedStageOutput =
  Readonly<{
    assetSymbol: string;

    /**
     * Human-readable exact amount after observing the confirmed result.
     *
     * This must not be populated from a quote or expected output when the
     * downstream stage depends on an actual confirmed protocol result.
     */
    amountText: string;

    /**
     * Optional exact base-unit representation when the executor has it.
     */
    amountUnits?: string;
  }>;


export type AgentExecutionSession =
  Readonly<{
    runId: string;

    run:
      AgentRun;

    outputs:
      Readonly<
        Record<
          string,
          AgentVerifiedStageOutput
        >
      >;
  }>;


export type AgentStageExecutionContext =
  Readonly<{
    runId: string;

    chainId: string;

    account: string;

    signal?:
      AbortSignal;
  }>;


export type AgentStageExecutionInput =
  Readonly<{
    plan:
      AgentPlan;

    stage:
      AgentPlanStage;

    /**
     * Exact amount that the executor must use.
     *
     * For a stage-output reference, this comes from a verified confirmed
     * upstream result rather than the original requested amount.
     */
    resolvedAmountText?:
      string;

    dependencyOutputs:
      Readonly<
        Record<
          string,
          AgentVerifiedStageOutput
        >
      >;

    /**
     * Stable per-run/per-stage key. Provider integrations may use this to
     * guard duplicate preparation/submission.
     */
    executionKey:
      string;

    context:
      AgentStageExecutionContext;
  }>;


export type AgentStageExecutionReceipt =
  Readonly<{
    /**
     * Backward-compatible transaction identifier.
     *
     * On-chain executors may continue returning this field.
     */
    transactionId?: string;

    /**
     * Generic reference for provider-managed/asynchronous execution.
     *
     * Garden, for example, can return its order id without pretending it is
     * a blockchain transaction hash.
     */
    executionReference?:
      AgentExecutionReference;

    status:
      | "pending"
      | "submitted"
      | "confirmed";

    /**
     * Include only when the result has actually been observed/verified.
     */
    output?:
      AgentVerifiedStageOutput;
  }>;


export interface AgentStageExecutor {
  readonly id: string;

  readonly actions:
    readonly AgentStageAction[];

  supports(
    input:
      AgentStageExecutionInput,
  ): boolean;

  /**
   * Optional fresh review immediately before wallet execution.
   *
   * Protocol implementations can use this for fresh quotes, risk checks,
   * balance checks, allowance reconstruction, simulation, etc.
   */
  review?(
    input:
      AgentStageExecutionInput,
  ): Promise<void>;

  execute(
    input:
      AgentStageExecutionInput,
  ): Promise<AgentStageExecutionReceipt>;
}


export type AgentStageExecutorRegistry =
  readonly AgentStageExecutor[];


function positiveAmountText(
  value: string,
): boolean {
  const normalized =
    value.trim();

  if (
    !/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(
      normalized,
    )
  ) {
    return false;
  }

  const digits =
    normalized.replace(
      /[.0]/g,
      "",
    );

  return digits.length > 0;
}


function transactionIdValid(
  value: string,
): boolean {
  return /^0x[0-9a-f]{1,64}$/i.test(
    value,
  );
}


function receiptExecutionReference(
  receipt:
    AgentStageExecutionReceipt,

  executorId:
    string,
): AgentExecutionReference {
  if (
    receipt.transactionId &&
    receipt.executionReference
  ) {
    throw new Error(
      `Agent executor ${executorId} returned multiple execution references.`,
    );
  }

  if (
    receipt.executionReference
  ) {
    return receipt
      .executionReference;
  }

  if (
    receipt.transactionId
  ) {
    if (
      !transactionIdValid(
        receipt.transactionId,
      )
    ) {
      throw new Error(
        `Agent executor ${executorId} returned an invalid transaction id.`,
      );
    }

    return {
      kind:
        "transaction",

      id:
        receipt.transactionId,
    };
  }

  throw new Error(
    `Agent executor ${executorId} returned no execution reference.`,
  );
}


function planStage(
  plan: AgentPlan,
  stageId: string,
): AgentPlanStage {
  const stage =
    plan.stages.find(
      (candidate) =>
        candidate.id ===
          stageId,
    );

  if (!stage) {
    throw new Error(
      `Unknown Agent plan stage: ${stageId}.`,
    );
  }

  return stage;
}


function downstreamNeedsOutput(
  plan: AgentPlan,
  stageId: string,
): boolean {
  return plan.stages.some(
    (candidate) =>
      candidate.amount?.kind ===
        "stage-output" &&
      candidate.amount.stageId ===
        stageId,
  );
}


function validateOutput(
  stage: AgentPlanStage,
  output:
    AgentVerifiedStageOutput,
): AgentVerifiedStageOutput {
  const symbol =
    output.assetSymbol
      .trim()
      .toUpperCase();

  if (!symbol) {
    throw new Error(
      `Agent stage ${stage.id} returned an empty output asset.`,
    );
  }

  if (
    stage.outputAssetSymbol &&
    symbol !==
      stage.outputAssetSymbol
        .trim()
        .toUpperCase()
  ) {
    throw new Error(
      `Agent stage ${stage.id} returned ${symbol}, expected ${stage.outputAssetSymbol}.`,
    );
  }

  if (
    !positiveAmountText(
      output.amountText,
    )
  ) {
    throw new Error(
      `Agent stage ${stage.id} returned an invalid verified output amount.`,
    );
  }

  if (
    output.amountUnits !==
      undefined &&
    !/^[1-9]\d*$/.test(
      output.amountUnits,
    )
  ) {
    throw new Error(
      `Agent stage ${stage.id} returned invalid output base units.`,
    );
  }

  return {
    assetSymbol:
      symbol,

    amountText:
      output.amountText.trim(),

    ...(output.amountUnits !==
      undefined
      ? {
          amountUnits:
            output.amountUnits,
        }
      : {}),
  };
}


export function createAgentExecutionSession(
  plan: AgentPlan,
  runId: string,
): AgentExecutionSession {
  const normalized =
    runId.trim();

  if (!normalized) {
    throw new Error(
      "Agent execution session requires a run id.",
    );
  }

  return {
    runId:
      normalized,

    run:
      createAgentRun(
        plan,
      ),

    outputs: {},
  };
}


export function createAgentStageExecutorRegistry(
  executors:
    readonly AgentStageExecutor[],
): AgentStageExecutorRegistry {
  const ids =
    new Set<string>();

  for (
    const executor of
    executors
  ) {
    if (
      !executor.id.trim()
    ) {
      throw new Error(
        "Agent stage executor requires an id.",
      );
    }

    if (
      ids.has(
        executor.id,
      )
    ) {
      throw new Error(
        `Duplicate Agent stage executor id: ${executor.id}.`,
      );
    }

    if (
      !executor.actions.length
    ) {
      throw new Error(
        `Agent stage executor ${executor.id} must declare at least one action.`,
      );
    }

    ids.add(
      executor.id,
    );
  }

  return [
    ...executors,
  ];
}


export function resolveAgentStageAmount(
  plan: AgentPlan,
  session:
    AgentExecutionSession,
  stageId: string,
): string | undefined {
  const stage =
    planStage(
      plan,
      stageId,
    );

  if (!stage.amount) {
    return undefined;
  }

  if (
    stage.amount.kind ===
      "exact"
  ) {
    return stage.amount.amountText;
  }

  const sourceId =
    stage.amount.stageId;

  const sourceRuntime =
    getAgentRuntimeStage(
      session.run,
      sourceId,
    );

  if (
    sourceRuntime.status !==
      "confirmed"
  ) {
    throw new Error(
      `Agent stage ${stage.id} requires confirmed output from ${sourceId}.`,
    );
  }

  const output =
    session.outputs[
      sourceId
    ];

  if (!output) {
    throw new Error(
      `Agent stage ${stage.id} requires verified output from ${sourceId}.`,
    );
  }

  if (
    stage.inputAssetSymbol &&
    output.assetSymbol !==
      stage.inputAssetSymbol
        .trim()
        .toUpperCase()
  ) {
    throw new Error(
      `Verified output from ${sourceId} does not match ${stage.inputAssetSymbol}.`,
    );
  }

  return output.amountText;
}


function executionInput(
  plan: AgentPlan,
  session:
    AgentExecutionSession,
  stage:
    AgentPlanStage,
  context:
    AgentStageExecutionContext,
): AgentStageExecutionInput {
  if (
    context.runId !==
      session.runId
  ) {
    throw new Error(
      "Agent execution context does not match this run.",
    );
  }

  if (
    context.chainId !==
      stage.sourceChainId
  ) {
    throw new Error(
      `Agent stage ${stage.id} is not for the connected chain.`,
    );
  }

  if (
    !context.account.trim()
  ) {
    throw new Error(
      "Agent execution requires a connected account.",
    );
  }

  const dependencyOutputs:
    Record<
      string,
      AgentVerifiedStageOutput
    > = {};

  for (
    const dependency of
    stage.dependsOn
  ) {
    const output =
      session.outputs[
        dependency
      ];

    if (output) {
      dependencyOutputs[
        dependency
      ] = output;
    }
  }

  return {
    plan,

    stage,

    resolvedAmountText:
      resolveAgentStageAmount(
        plan,
        session,
        stage.id,
      ),

    dependencyOutputs,

    executionKey:
      `${session.runId}:${stage.id}`,

    context,
  };
}


export function selectAgentStageExecutor(
  input:
    AgentStageExecutionInput,
  registry:
    AgentStageExecutorRegistry,
): AgentStageExecutor | null {
  for (
    const executor of
    registry
  ) {
    if (
      !executor.actions.includes(
        input.stage.action,
      )
    ) {
      continue;
    }

    if (
      executor.supports(
        input,
      )
    ) {
      return executor;
    }
  }

  return null;
}


function withOutput(
  session:
    AgentExecutionSession,
  stageId: string,
  output:
    AgentVerifiedStageOutput,
): AgentExecutionSession {
  return {
    ...session,

    outputs: {
      ...session.outputs,

      [stageId]:
        output,
    },
  };
}


export type ExecuteAgentStageResult =
  Readonly<{
    executorId: string;

    receipt:
      AgentStageExecutionReceipt;

    session:
      AgentExecutionSession;

    /**
     * Transaction is confirmed, but CAREL still needs a verified output
     * observation before unlocking a dependent stage.
     */
    needsOutputVerification:
      boolean;
  }>;


export async function executeAgentStage(
  plan: AgentPlan,
  session:
    AgentExecutionSession,
  stageId: string,
  context:
    AgentStageExecutionContext,
  registry:
    AgentStageExecutorRegistry,
): Promise<ExecuteAgentStageResult> {
  const runtime =
    getAgentRuntimeStage(
      session.run,
      stageId,
    );

  if (
    runtime.status !==
      "review"
  ) {
    throw new Error(
      `Agent stage ${stageId} is not ready for execution.`,
    );
  }

  const stage =
    planStage(
      plan,
      stageId,
    );

  const input =
    executionInput(
      plan,
      session,
      stage,
      context,
    );

  const executor =
    selectAgentStageExecutor(
      input,
      registry,
    );

  if (!executor) {
    throw new Error(
      `No Agent executor supports ${stage.action} stage ${stage.id}.`,
    );
  }

  if (
    executor.review
  ) {
    await executor.review(
      input,
    );
  }

  const receipt =
    await executor.execute(
      input,
    );

  const executionReference =
    receiptExecutionReference(
      receipt,
      executor.id,
    );

  let next:
    AgentExecutionSession = {
      ...session,

      run:
        submitAgentStage(
          plan,
          session.run,
          stage.id,
          executionReference,
        ),
    };

  if (
    receipt.status !==
      "confirmed"
  ) {
    return {
      executorId:
        executor.id,

      receipt,

      session:
        next,

      needsOutputVerification:
        false,
    };
  }

  const outputRequired =
    downstreamNeedsOutput(
      plan,
      stage.id,
    );

  if (
    outputRequired &&
    !receipt.output
  ) {
    /*
     * Fail closed.
     *
     * The tx can be confirmed while CAREL still keeps the stage in
     * "submitted" state until its actual output is observed.
     */
    return {
      executorId:
        executor.id,

      receipt,

      session:
        next,

      needsOutputVerification:
        true,
    };
  }

  if (
    receipt.output
  ) {
    next =
      withOutput(
        next,
        stage.id,
        validateOutput(
          stage,
          receipt.output,
        ),
      );
  }

  next = {
    ...next,

    run:
      confirmAgentStage(
        plan,
        next.run,
        stage.id,
      ),
  };

  return {
    executorId:
      executor.id,

    receipt,

    session:
      next,

    needsOutputVerification:
      false,
  };
}


export function confirmAgentStageExecution(
  plan: AgentPlan,
  session:
    AgentExecutionSession,
  stageId: string,
  output?:
    AgentVerifiedStageOutput,
): AgentExecutionSession {
  const stage =
    planStage(
      plan,
      stageId,
    );

  const runtime =
    getAgentRuntimeStage(
      session.run,
      stageId,
    );

  if (
    runtime.status !==
      "submitted"
  ) {
    throw new Error(
      `Agent stage ${stageId} is not waiting for confirmation.`,
    );
  }

  const outputRequired =
    downstreamNeedsOutput(
      plan,
      stage.id,
    );

  if (
    outputRequired &&
    !output
  ) {
    throw new Error(
      `Agent stage ${stage.id} requires verified output before dependent stages can unlock.`,
    );
  }

  let next =
    session;

  if (output) {
    next =
      withOutput(
        next,
        stage.id,
        validateOutput(
          stage,
          output,
        ),
      );
  }

  return {
    ...next,

    run:
      confirmAgentStage(
        plan,
        next.run,
        stage.id,
      ),
  };
}
