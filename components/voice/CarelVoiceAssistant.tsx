"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Globe2, Info, Mic, MicOff, Search, Volume2, VolumeX } from "lucide-react";
import { getVoiceLanguage, VOICE_LANGUAGES, voiceLanguageHint } from "@/lib/voice/voice-languages";
import { normalizeVoiceGoal } from "@/lib/voice/voice-goal";
import styles from "./CarelVoiceAssistant.module.css";

type RecognitionResult = { isFinal: boolean; [index: number]: { transcript: string } };
type RecognitionEvent = { resultIndex: number; results: { length: number; [index: number]: RecognitionResult } };
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};
type SpeechWindow = Window & {
  SpeechRecognition?: new () => Recognition;
  webkitSpeechRecognition?: new () => Recognition;
};

type Props = {
  disabled?: boolean;
  onCommand: (goal: string, language: string) => string;
};

export function CarelVoiceAssistant({ disabled = false, onCommand }: Props) {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [language, setLanguage] = useState("en-US");
  const [languageOpen, setLanguageOpen] = useState(false);
  const [languageSearch, setLanguageSearch] = useState("");
  const [listening, setListening] = useState(false);
  const [talkBack, setTalkBack] = useState(true);
  const [message, setMessage] = useState("Tap the microphone to dictate a goal.");
  const [reply, setReply] = useState("");
  const recognition = useRef<Recognition | null>(null);
  const onCommandRef = useRef(onCommand);
  const languageRef = useRef(language);
  const talkBackRef = useRef(talkBack);

  useEffect(() => { onCommandRef.current = onCommand; }, [onCommand]);
  useEffect(() => { languageRef.current = language; }, [language]);
  useEffect(() => { talkBackRef.current = talkBack; }, [talkBack]);
  useEffect(() => {
    const speechWindow = window as SpeechWindow;
    setSupported(Boolean(speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition));
    return () => {
      recognition.current?.abort();
      recognition.current = null;
      window.speechSynthesis?.cancel();
    };
  }, []);

  function readAloud(text: string, locale = language) {
    if (!text || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    // Spoken summaries are currently localized only to English and Indonesian.
    utterance.lang = locale === "id-ID" ? "id-ID" : "en-US";
    utterance.rate = 0.98;
    window.speechSynthesis.speak(utterance);
  }

  function toggleListening() {
    if (listening) {
      recognition.current?.stop();
      setListening(false);
      setMessage("Microphone stopped.");
      return;
    }
    if (disabled) return;
    const speechWindow = window as SpeechWindow;
    const Constructor = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
    if (!Constructor) {
      setSupported(false);
      setMessage("Speech input isn't available in this browser. Use the text box instead.");
      return;
    }
    window.speechSynthesis?.cancel();
    const session = new Constructor();
    recognition.current = session;
    session.lang = language;
    session.continuous = false;
    session.interimResults = false;
    session.onresult = (event) => {
      let transcript = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        if (event.results[index].isFinal) transcript += " " + (event.results[index][0]?.transcript ?? "");
      }
      if (!transcript.trim()) return;
      const command = normalizeVoiceGoal(transcript, languageRef.current);
      session.stop();
      setListening(false);
      setMessage("Heard: " + transcript.trim());
      try {
        const response = onCommandRef.current(command, languageRef.current);
        setReply(response);
        if (talkBackRef.current) readAloud(response, languageRef.current);
      } catch {
        const response = languageRef.current === "id-ID"
          ? "Rencana tidak dapat diproses. Silakan periksa teks di layar."
          : "I couldn't process that goal. Please check the text on screen.";
        setReply(response);
        if (talkBackRef.current) readAloud(response, languageRef.current);
      }
    };
    session.onerror = (event) => {
      setListening(false);
      if (event.error === "aborted") return;
      const friendly = event.error === "not-allowed" || event.error === "service-not-allowed"
        ? "Microphone blocked. In Chrome, open site settings next to the address bar, allow Microphone, then try again."
        : event.error === "no-speech"
          ? "No speech detected. Try again."
          : "Speech input failed (" + event.error + "). You can type your goal instead.";
      setMessage(friendly);
    };
    session.onend = () => {
      if (recognition.current === session) recognition.current = null;
      setListening(false);
    };
    try {
      session.start();
      setListening(true);
      setReply("");
      setMessage(language === "id-ID" ? "Mendengarkan..." : "Listening...");
    } catch {
      recognition.current = null;
      setListening(false);
      setMessage("Could not start the microphone. Use the text box instead.");
    }
  }

  return (
    <section className={styles.panel} aria-label="CAREL voice assistant">
      <div className={styles.head}>
        <div className={styles.identity}>
          <span className={styles.symbol} aria-hidden="true"><Mic size={22}/></span>
          <div className={styles.headingCopy}>
            <div className={styles.headingRow}>
              <strong>Voice assistant</strong>
              <span className={styles.marker}>BETA</span>
            </div>
            <p>Speak a goal. CAREL previews it, never signs.</p>
          </div>
        </div>
        <div className={styles.wave + (listening ? " " + styles.waveActive : "")} aria-hidden="true">
          <span/><span/><span/><span/><span/>
        </div>
      </div>
      <div className={styles.controls}>
        <button
          type="button"
          className={styles.mic + (listening ? " " + styles.active : "")}
          aria-label={listening ? "Stop listening" : "Start voice input"}
          aria-pressed={listening}
          disabled={supported !== true || (disabled && !listening)}
          onClick={toggleListening}
        >
          {listening ? <MicOff size={19} /> : <Mic size={19} />}
          {listening ? "Stop" : "Speak"}
        </button>
        <button
          type="button"
          className={styles.secondary}
          aria-label={talkBack ? "Turn off spoken replies" : "Turn on spoken replies"}
          aria-pressed={talkBack}
          onClick={() => { setTalkBack(current => !current); window.speechSynthesis?.cancel(); }}
        >
          {talkBack ? <Volume2 size={18} /> : <VolumeX size={18} />}
          <span>Reply</span>
        </button>
        <div className={styles.languageLabel}>
          <div className={styles.languageTitle}>
            <Globe2 size={15} aria-hidden="true"/>
            <span>Speech language</span>
            <span className={styles.languageCount}>{VOICE_LANGUAGES.length}</span>
          </div>
          <button
            type="button"
            className={styles.languageTrigger}
            aria-label="Choose speech language"
            aria-expanded={languageOpen}
            aria-controls="carel-voice-languages"
            disabled={listening}
            onClick={() => { setLanguageOpen(current => !current); setLanguageSearch(""); }}
          >
            <Globe2 size={16} aria-hidden="true"/>
            <span className={styles.selectedLanguage}>{getVoiceLanguage(language).label}</span>
            <ChevronDown size={17} className={languageOpen ? styles.chevronUp : undefined} aria-hidden="true"/>
          </button>
          {languageOpen && (
            <div className={styles.languageMenu} id="carel-voice-languages">
              <div className={styles.languageSearch}>
                <Search size={16} aria-hidden="true"/>
                <input
                  type="search"
                  value={languageSearch}
                  onChange={event => setLanguageSearch(event.target.value)}
                  placeholder="Find a language..."
                  aria-label="Search speech languages"
                  autoComplete="off"
                />
              </div>
              <div className={styles.languageList} role="group" aria-label="Available speech languages">
                {VOICE_LANGUAGES
                  .filter(item => `${item.label} ${item.nativeName} ${item.code}`
                    .toLocaleLowerCase().includes(languageSearch.trim().toLocaleLowerCase()))
                  .map(item => (
                    <button
                      key={item.code}
                      type="button"
                      className={styles.languageOption}
                      aria-pressed={language === item.code}
                      disabled={listening}
                      onClick={() => {
                        setLanguage(item.code);
                        setLanguageOpen(false);
                        setLanguageSearch("");
                        setReply("");
                        setMessage("Language selected. Tap Speak to dictate a goal.");
                        window.speechSynthesis?.cancel();
                      }}
                    >
                      <span className={styles.languageNames}>
                        <span>{item.label}</span>
                        <small>{item.nativeName}</small>
                      </span>
                      {language === item.code && <Check size={17} aria-hidden="true"/>}
                    </button>
                  ))}
                {!VOICE_LANGUAGES.some(item =>
                  `${item.label} ${item.nativeName} ${item.code}`
                    .toLocaleLowerCase().includes(languageSearch.trim().toLocaleLowerCase())
                ) && <p className={styles.noLanguage}>No matching language.</p>}
              </div>
            </div>
          )}
          <p className={styles.languageHint}>{voiceLanguageHint(language)}</p>
        </div>
      </div>
      <p className={styles.status} role="status" aria-live="polite">
        <Info size={15} aria-hidden="true"/>
        <span>{supported === false ? "Voice recognition unsupported here. Type your goal instead." : message}</span>
      </p>
      {reply && <div className={styles.response}>
        <p>{reply}</p>
        <button type="button" onClick={() => readAloud(reply)} disabled={typeof window !== "undefined" && !window.speechSynthesis}>Read aloud</button>
      </div>}
      <p className={styles.hint}>Push to talk · No always-on listening</p>
    </section>
  );
}
