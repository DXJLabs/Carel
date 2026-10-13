/**
 * Speech recognition locale catalogue. This is a UI choice, not a guarantee
 * that a particular browser provides recognition or TTS voices for the locale.
 *
 * Agent intent parsing is narrower than speech transcription. Keep them
 * separate so unsupported languages never appear transaction-ready.
 */
export type VoiceLanguage = Readonly<{
  code: string;
  label: string;
  nativeName: string;
  commandSupport: "agent" | "swap" | "dictation";
}>;

export const VOICE_LANGUAGES: readonly VoiceLanguage[] = [
  { code: "en-US", label: "English", nativeName: "English (US)", commandSupport: "agent" },
  { code: "id-ID", label: "Indonesia", nativeName: "Bahasa Indonesia", commandSupport: "agent" },
  { code: "ms-MY", label: "Malay", nativeName: "Bahasa Melayu", commandSupport: "swap" },
  { code: "es-ES", label: "Spanish", nativeName: "Español", commandSupport: "swap" },
  { code: "fr-FR", label: "French", nativeName: "Français", commandSupport: "swap" },
  { code: "de-DE", label: "German", nativeName: "Deutsch", commandSupport: "swap" },
  { code: "pt-BR", label: "Portuguese", nativeName: "Português (Brasil)", commandSupport: "swap" },
  { code: "it-IT", label: "Italian", nativeName: "Italiano", commandSupport: "swap" },
  { code: "nl-NL", label: "Dutch", nativeName: "Nederlands", commandSupport: "swap" },
  { code: "vi-VN", label: "Vietnamese", nativeName: "Tiếng Việt", commandSupport: "swap" },
  { code: "tr-TR", label: "Turkish", nativeName: "Türkçe", commandSupport: "dictation" },
  { code: "ja-JP", label: "Japanese", nativeName: "日本語", commandSupport: "dictation" },
  { code: "ko-KR", label: "Korean", nativeName: "한국어", commandSupport: "dictation" },
  { code: "zh-CN", label: "Mandarin", nativeName: "中文（普通话）", commandSupport: "dictation" },
  { code: "hi-IN", label: "Hindi", nativeName: "हिन्दी", commandSupport: "dictation" },
  { code: "ar-SA", label: "Arabic", nativeName: "العربية", commandSupport: "dictation" },
  { code: "th-TH", label: "Thai", nativeName: "ไทย", commandSupport: "dictation" },
] as const;

export function getVoiceLanguage(code: string): VoiceLanguage {
  return VOICE_LANGUAGES.find((entry) => entry.code === code) ?? VOICE_LANGUAGES[0];
}

export function voiceLanguageHint(code: string): string {
  switch (getVoiceLanguage(code).commandSupport) {
    case "agent": return "Supported CAREL goals can be previewed. Wallet approval remains required.";
    case "swap": return "Basic Swap phrases are supported. For other goals, use an English command.";
    default: return "Dictation only. Edit the transcript into English to get a valid CAREL plan.";
  }
}
