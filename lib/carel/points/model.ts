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

export type PointSeasonStatus =
  | "upcoming"
  | "active"
  | "ended";

export type PointSeason =
  Readonly<{
    id: string;
    name: string;
    status: PointSeasonStatus;
    startsAt: number;
    endsAt?: number;
  }>;

export const POINT_LEVEL_SIZE =
  500;

/**
 * Season 1 intentionally includes existing CAREL activity.
 *
 * Future seasons can use real startsAt / endsAt timestamps while Lifetime
 * Points remain untouched.
 */
export const ACTIVE_POINT_SEASON:
  PointSeason = {
    id: "season-1",
    name: "Season 1",
    status: "active",
    startsAt: 0,
  };

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
    season: PointSeason;

    /**
     * Compatibility alias for the active season total.
     */
    total: number;

    seasonTotal: number;
    lifetimeTotal: number;
    last7Days: number;
    level: number;
    levelProgress: number;
    levelProgressPercent: number;

    /**
     * History for the selected season.
     */
    history:
      readonly PointHistoryItem[];

    /**
     * Confirmed CAREL Points across all seasons.
     */
    lifetimeHistory:
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

export function isInPointSeason(
  ts: number,
  season: PointSeason,
): boolean {
  if (
    ts <
    season.startsAt
  ) {
    return false;
  }

  if (
    season.endsAt !==
      undefined &&
    ts >
      season.endsAt
  ) {
    return false;
  }

  return true;
}

/**
 * Builds wallet-local season and lifetime Points from confirmed CAREL
 * execution history.
 *
 * A transaction hash can earn only once. Unknown labels fail closed.
 */
export function buildPointsSummary(
  executions:
    readonly PointExecution[],
  now:
    number = Date.now(),
  season:
    PointSeason =
      ACTIVE_POINT_SEASON,
): PointsSummary {
  const seen =
    new Set<string>();

  const lifetimeHistory:
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

    lifetimeHistory.push({
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

  lifetimeHistory.sort(
    (left, right) =>
      right.ts -
      left.ts,
  );

  const history =
    lifetimeHistory.filter(
      (item) =>
        isInPointSeason(
          item.ts,
          season,
        ),
    );

  const lifetimeTotal =
    lifetimeHistory.reduce(
      (sum, item) =>
        sum +
        item.points,
      0,
    );

  const seasonTotal =
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
          sevenDaysAgo &&
        item.ts <=
          now
          ? sum +
            item.points
          : sum,
      0,
    );

  const level =
    Math.floor(
      seasonTotal /
        POINT_LEVEL_SIZE,
    ) +
    1;

  const levelProgress =
    seasonTotal %
    POINT_LEVEL_SIZE;

  const levelProgressPercent =
    (
      levelProgress /
      POINT_LEVEL_SIZE
    ) *
    100;

  return {
    season,

    total:
      seasonTotal,

    seasonTotal,
    lifetimeTotal,
    last7Days,
    level,
    levelProgress,
    levelProgressPercent,
    history,
    lifetimeHistory,
  };
}
