export type RiskLevel = "low" | "medium" | "high";
export type PrivacyMode = "prefer-private" | "balanced" | "public-ok";

export type Mandate = {
  capital: number;
  goal: string;
  risk: RiskLevel;
  privacy: PrivacyMode;
  liquidPercent: number;
  maxProtocolPercent: number;
  approvalThreshold: number;
};

export type Route = {
  protocol: string;
  action: string;
  allocation: number;
  apy: number;
  risk: "Low" | "Medium" | "High";
  privacy: "Private" | "Public";
  note: string;
};

export type Plan = {
  headline: string;
  productiveCapital: number;
  liquidReserve: number;
  weightedApy: number;
  privateCapital: number;
  publicCapital: number;
  routes: Route[];
};

export function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

export function buildPlan(mandate: Mandate): Plan {
  const liquidReserve = Math.round(mandate.capital * mandate.liquidPercent / 100);
  const productiveCapital = Math.max(0, mandate.capital - liquidReserve);
  const baseApy = mandate.risk === "low" ? 4.8 : mandate.risk === "medium" ? 6.7 : 9.1;
  const privateShare = mandate.privacy === "prefer-private" ? 0.56 : mandate.privacy === "balanced" ? 0.28 : 0;
  const privateCapital = Math.round(productiveCapital * privateShare);
  const publicCapital = productiveCapital - privateCapital;

  const routeA = Math.min(Math.round(productiveCapital * 0.42), Math.round(mandate.capital * mandate.maxProtocolPercent / 100));
  const routeB = Math.min(Math.round(productiveCapital * 0.33), Math.round(mandate.capital * mandate.maxProtocolPercent / 100));
  const routeC = Math.max(0, productiveCapital - routeA - routeB);

  const preferredPrivacy = mandate.privacy !== "public-ok";

  const routeCandidates: Route[] = [
    {
      protocol: "Vesu",
      action: "Supply USDC",
      allocation: routeA,
      apy: Math.max(3.9, baseApy - 0.7),
      risk: mandate.risk === "high" ? "Medium" : "Low",
      privacy: preferredPrivacy ? "Private" : "Public",
      note: preferredPrivacy ? "Use STRK20 route where supported" : "Direct public execution",
    },
    {
      protocol: "Endur",
      action: "Liquid staking route",
      allocation: routeB,
      apy: baseApy + 0.5,
      risk: mandate.risk === "low" ? "Low" : "Medium",
      privacy: mandate.privacy === "prefer-private" ? "Private" : "Public",
      note: "Keep exposure within concentration limit",
    },
    {
      protocol: "Reserve",
      action: "Liquid buffer",
      allocation: routeC,
      apy: Math.max(2.8, baseApy - 1.6),
      risk: "Low",
      privacy: "Public",
      note: "Fast exit and fee buffer",
    },
  ];

  const routes = routeCandidates.filter((route) => route.allocation > 0);

  const weightedApy = routes.reduce((sum, route) => sum + route.apy * (route.allocation / Math.max(1, productiveCapital)), 0);

  return {
    headline: mandate.risk === "low"
      ? "Defensive yield with liquidity preserved"
      : mandate.risk === "high"
        ? "Growth route inside explicit guardrails"
        : "Balanced yield with selective private execution",
    productiveCapital,
    liquidReserve,
    weightedApy,
    privateCapital,
    publicCapital,
    routes,
  };
}

export const activityFeed = [
  { time: "Now", title: "Mandate healthy", copy: "No rule drift detected. Capital remains inside configured limits.", tone: "good" },
  { time: "18m", title: "Route re-scored", copy: "No alternative route improved net return enough to justify a rebalance.", tone: "neutral" },
  { time: "2h", title: "Privacy check", copy: "Private allocation is still supported by the selected route.", tone: "private" },
  { time: "1d", title: "Approval threshold checked", copy: "No proposed action exceeded your approval threshold.", tone: "neutral" },
] as const;
