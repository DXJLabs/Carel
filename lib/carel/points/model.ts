export type PointAction =
  | "shield"
  | "unshield"
  | "swap"
  | "bridge"
  | "stake"
  | "borrow"
  | "repay"
  | "collateral";

export type PointExecution =
  Readonly<{
    hash: string;
    label: string;
    status:
      | "pending"
      | "submitted"
      | "confirmed";
    ts: number;
  }>;

export const POINT_LEVEL_SIZE =
  500;

export const POINT_RULES =
  [
    {
      action: "shield",
      label: "Shield",
      detail: "Public → private",
      points: 100,
    },
    {
      action: "unshield",
      label: "Unshield",
      detail: "Private → public",
      points: 80,
    },
    {
      action: "bridge",
      label: "Bridge",
      detail: "Cross-chain execution",
      points: 75,
    },
    {
      action: "stake",
      label: "Staking",
      detail: "Stake / earn execution",
      points: 60,
    },
    {
      action: "borrow",
      label: "Borrow",
      detail: "Borrow execution",
      points: 60,
    },
    {
      action: "swap",
      label: "Swap",
      detail: "Swap execution",
      points: 40,
    },
    {
      action: "repay",
      label: "Repay / Close",
      detail: "Debt management",
      points: 30,
    },
    {
      action: "collateral",
      label: "Collateral",
      detail: "Collateral management",
      points: 25,
    },
  ] as const;

export type PointHistoryItem =
  Readonly<{
    hash: string;
    label: string;
    action: PointAction;
    points: number;
    ts: number;
  }>;

export type PointsSummary =
  Readonly<{
    total: number;
    last7Days: number;
    level: number;
    levelProgress: number;
    levelProgressPercent: number;
    history:
      readonly PointHistoryItem[];
  }>;

const RULE_BY_ACTION =
  new Map<
    PointAction,
    (typeof POINT_RULES)[number]
  >(
    POINT_RULES.map(
      (rule) => [
        rule.action,
        rule,
      ],
    ),
  );

/**
 * Maps CAREL transaction labels to one reward category.
 *
 * Privacy transitions are checked before generic actions so a Shield Swap
 * remains one reward event instead of accidentally earning multiple rewards.
 */
export function pointActionFromLabel(
  label: string,
): PointAction | null {
  const value =
    label
      .trim()
      .toLowerCase();

  if (
    value.includes(
      "unshield",
    )
  ) {
    return "unshield";
  }

  if (
    value.includes(
      "shield",
    )
  ) {
    return "shield";
  }

  if (
    value.includes(
      "bridge",
    )
  ) {
    return "bridge";
  }

  if (
    value.includes(
      "swap",
    )
  ) {
    return "swap";
  }

  if (
    value.includes(
      "stake",
    ) ||
    value.includes(
      "staking",
    )
  ) {
    return "stake";
  }

  if (
    value.includes(
      "repay",
    ) ||
    value.includes(
      "close position",
    ) ||
    value.includes(
      "close vesu",
    )
  ) {
    return "repay";
  }

  if (
    value.includes(
      "collateral",
    )
  ) {
    return "collateral";
  }

  if (
    value.includes(
      "borrow",
    )
  ) {
    return "borrow";
  }

  return null;
}

export function pointsForAction(
  action: PointAction,
): number {
  return (
    RULE_BY_ACTION
      .get(
        action,
      )
      ?.points ??
    0
  );
}

/**
 * Builds wallet-local Points from confirmed execution history.
 *
 * Transaction hashes are deduplicated and unknown transaction labels fail
 * closed, preventing unrelated wallet activity from generating CAREL Points.
 */
export function buildPointsSummary(
  executions:
    readonly PointExecution[],
  now:
    number = Date.now(),
): PointsSummary {
  const seen =
    new Set<string>();

  const history:
    PointHistoryItem[] = [];

  for (
    const execution of executions
  ) {
    if (
      execution.status !==
      "confirmed"
    ) {
      continue;
    }

    const hash =
      execution.hash
        .trim()
        .toLowerCase();

    if (
      !hash ||
      seen.has(
        hash,
      )
    ) {
      continue;
    }

    const action =
      pointActionFromLabel(
        execution.label,
      );

    if (!action) {
      continue;
    }

    seen.add(
      hash,
    );

    history.push({
      hash,
      label:
        execution.label,
      action,
      points:
        pointsForAction(
          action,
        ),
      ts:
        execution.ts,
    });
  }

  history.sort(
    (left, right) =>
      right.ts -
      left.ts,
  );

  const total =
    history.reduce(
      (sum, item) =>
        sum +
        item.points,
      0,
    );

  const sevenDaysAgo =
    now -
    7 *
      24 *
      60 *
      60 *
      1000;

  const last7Days =
    history.reduce(
      (sum, item) =>
        item.ts >=
        sevenDaysAgo
          ? sum +
            item.points
          : sum,
      0,
    );

  const level =
    Math.floor(
      total /
        POINT_LEVEL_SIZE,
    ) +
    1;

  const levelProgress =
    total %
    POINT_LEVEL_SIZE;

  const levelProgressPercent =
    (
      levelProgress /
      POINT_LEVEL_SIZE
    ) *
    100;

  return {
    total,
    last7Days,
    level,
    levelProgress,
    levelProgressPercent,
    history,
  };
}
