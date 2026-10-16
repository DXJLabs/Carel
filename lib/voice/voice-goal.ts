/** Small, explicit speech-to-intent adapter. It never approves an action. */
const SWAP_RULES: Readonly<Record<string, Readonly<{ action: RegExp; destination: RegExp }>>> = {
  "ms-MY": { action: /^(?:tolong\s+)?(?:tukar|tukarkan)\b/i, destination: /\b(?:ke|kepada)\s+(USDC|USDT|ETH|BTC|STRK)\b/gi },
  "es-ES": { action: /^(?:por favor\s+)?(?:cambia|cambiar|intercambia|intercambiar)\b/i, destination: /\b(?:por|a)\s+(USDC|USDT|ETH|BTC|STRK)\b/gi },
  "fr-FR": { action: /^(?:[ée]changer|[ée]change|convertir)\b/i, destination: /\b(?:contre|en)\s+(USDC|USDT|ETH|BTC|STRK)\b/gi },
  "de-DE": { action: /^(?:tausche|tauschen|wechseln|wechsle)\b/i, destination: /\b(?:gegen|in)\s+(USDC|USDT|ETH|BTC|STRK)\b/gi },
  "pt-BR": { action: /^(?:trocar|troque|converta|converter)\b/i, destination: /\b(?:por|para)\s+(USDC|USDT|ETH|BTC|STRK)\b/gi },
  "it-IT": { action: /^(?:scambia|scambiare|converti|convertire)\b/i, destination: /\b(?:con|in|per)\s+(USDC|USDT|ETH|BTC|STRK)\b/gi },
  "nl-NL": { action: /^(?:wissel|wisselen|ruil|ruilen)\b/i, destination: /\b(?:voor|naar)\s+(USDC|USDT|ETH|BTC|STRK)\b/gi },
  "vi-VN": { action: /^(?:[đĐ]ổi|chuyển)(?=\s)/i, destination: /\b(?:sang|thành)\s+(USDC|USDT|ETH|BTC|STRK)\b/gi },
};

/** Limited, deterministic speech normalization. Not a general translation engine. */
export function normalizeVoiceGoal(transcript: string, language: string): string {
  let goal = transcript.trim().replace(/\s+/g, " ");
  if (!goal) return goal;

  if (language === "id-ID") {
    goal = goal.replace(/^(?:tolong\s+)?(?:tukar|tukarkan)\b/i, "Swap");
    goal = goal.replace(/^(?:tolong\s+)?(?:pinjam)\b/i, "Borrow");
    goal = goal.replace(/^(?:tolong\s+)?(?:jembatani)\b/i, "Bridge");
    goal = goal.replace(/^(?:tolong\s+)?(?:pertaruhkan|stakingkan)\b/i, "Stake");
    goal = goal.replace(/^(?:tolong\s+)?(?:pinjamkan)\b/i, "Lend");
    goal = goal.replace(/\b(?:ke|menjadi)\s+(USDC|USDT|ETH|BTC|STRK)\b/gi, "for $1");
    goal = goal.replace(/\b(?:dan\s+)?(?:simpan|buat|jadikan)\s+hasil(?:nya)?\s+(?:tetap\s+)?(?:privat|pribadi|rahasia)\b/i, "and keep it private");
    return goal;
  }

  const rule = SWAP_RULES[language];
  if (rule && rule.action.test(goal)) {
    goal = goal.replace(rule.action, "Swap");
    goal = goal.replace(rule.destination, "for $1");
  }
  // Unknown phrases and dictation-only locales remain unchanged. They are
  // never sent directly to a wallet by this adapter.
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
