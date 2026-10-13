/** Small, explicit speech-to-intent adapter. It never approves an action. */
export function normalizeVoiceGoal(transcript: string, language: string): string {
  let goal = transcript.trim().replace(/\s+/g, " ");
  if (language !== "id-ID" || !goal) return goal;

  goal = goal.replace(/^(?:tolong\s+)?(?:tukar|tukarkan)\b/i, "Swap");
  goal = goal.replace(/^(?:tolong\s+)?(?:pinjam)\b/i, "Borrow");
  goal = goal.replace(/^(?:tolong\s+)?(?:jembatani)\b/i, "Bridge");
  goal = goal.replace(/^(?:tolong\s+)?(?:pertaruhkan|stakingkan)\b/i, "Stake");
  goal = goal.replace(/^(?:tolong\s+)?(?:pinjamkan)\b/i, "Lend");
  goal = goal.replace(/\b(?:ke|menjadi)\s+(USDC|USDT|ETH|BTC|STRK)\b/gi, "for $1");
  goal = goal.replace(/\b(?:dan\s+)?(?:simpan|buat|jadikan)\s+hasil(?:nya)?\s+(?:tetap\s+)?(?:privat|pribadi|rahasia)\b/i, "and keep it private");
  return goal;
}

type SpokenPlan = Readonly<{
  status: string;
  stages: readonly Readonly<{ action: string }>[];
}>;

export function describeVoicePlan(plan: SpokenPlan, language: string): string {
  const indonesian = language === "id-ID";
  if (plan.status !== "ready" || plan.stages.length === 0) {
    return indonesian
      ? "Permintaan didengar, tetapi rencananya belum siap. Lihat petunjuk di layar. Tidak ada transaksi yang dijalankan."
      : "I heard you, but the plan is not ready. Check the screen for details. No transaction was executed.";
  }
  const steps = plan.stages.map(stage => stage.action).join(", ");
  return indonesian
    ? `Saya menyusun pratinjau ${plan.stages.length} tahap: ${steps}. Periksa detail di layar. Tidak ada transaksi yang dijalankan, dan wallet tetap memerlukan persetujuan Anda.`
    : `I prepared a ${plan.stages.length} step preview: ${steps}. Review the details on screen. No transaction was executed, and wallet approval is still required.`;
}
