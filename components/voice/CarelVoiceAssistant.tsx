"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Globe2, Info, Mic, Pencil, Search, Square, Volume2, VolumeX, X } from "lucide-react";
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
  const [open, setOpen] = useState(false);
  const [lastHeard, setLastHeard] = useState("");
  const launchButton = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
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
      setLastHeard(transcript.trim());
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

  function closeAssistant() {
    recognition.current?.abort();
    recognition.current = null;
    window.speechSynthesis?.cancel();
    setListening(false);
    setOpen(false);
    setLanguageOpen(false);
    launchButton.current?.focus();
  }

  function openAssistant() {
    if (disabled) return;
    setOpen(true);
    setLastHeard("");
    setReply("");
    setLanguageOpen(false);
    setMessage("Tap the microphone to dictate a goal.");
    // This is a direct user interaction, so browser permission may be requested.
    toggleListening();
  }

  useEffect(() => {
    if (!open) return;
    dialogRef.current?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        recognition.current?.abort();
        recognition.current = null;
        window.speechSynthesis?.cancel();
        setListening(false);
        setLanguageOpen(false);
        setOpen(false);
        launchButton.current?.focus();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <>
      <button
        ref={launchButton}
        type="button"
        className={styles.trigger}
        aria-label="Open voice assistant"
        aria-haspopup="dialog"
        disabled={disabled}
        onClick={openAssistant}
      >
        <Mic size={20} aria-hidden="true"/>
      </button>
      {open && (
        <div className={styles.overlay}>
          <button
            type="button"
            className={styles.backdrop}
            aria-label="Close voice assistant"
            onClick={closeAssistant}
          />
          <div
            ref={dialogRef}
            className={styles.sheet}
            role="dialog"
            aria-modal="true"
            aria-label="Voice assistant"
            tabIndex={-1}
          >
            <div className={styles.grabber} aria-hidden="true"/>
            <div className={styles.sheetTop}>
              <span>CAREL Voice</span>
              <span className={styles.marker}>BETA</span>
              <button type="button" className={styles.close} onClick={closeAssistant} aria-label="Close voice assistant">
                <X size={19}/>
              </button>
            </div>
            <div className={styles.voiceHero}>
              <div className={styles.orb + (listening ? " " + styles.orbActive : "")}>
                <div className={styles.wave} aria-hidden="true">
                  <span/><span/><span/><span/><span/>
                </div>
              </div>
              <h2>{listening ? "Listening..." : lastHeard ? "Goal captured" : "Speak your goal"}</h2>
              <p>{listening ? "Speak naturally. CAREL will turn your words into a plan." : "CAREL prepares a preview. Your wallet never signs by voice."}</p>
            </div>
            <div className={styles.transcript} aria-live="polite">
              <span>Detected text</span>
              <p>{lastHeard || "Your spoken goal will appear here."}</p>
              {lastHeard && <button type="button" className={styles.edit} onClick={() => {
                closeAssistant();
                document.getElementById("carel-goal")?.focus();
              }}>Edit in goal field <Pencil size={14}/></button>}
            </div>
            <div className={styles.sheetControls}>
              <button
                type="button"
                className={styles.mic + (listening ? " " + styles.active : "")}
                aria-label={listening ? "Stop listening" : "Start voice input"}
                aria-pressed={listening}
                disabled={supported !== true || (disabled && !listening)}
                onClick={toggleListening}
              >
                {listening ? <Square size={17} fill="currentColor"/> : <Mic size={18}/>}
                <span>{listening ? "Stop" : "Speak again"}</span>
              </button>
              <button
                type="button"
                className={styles.secondary}
                aria-label={talkBack ? "Turn off spoken replies" : "Turn on spoken replies"}
                aria-pressed={talkBack}
                onClick={() => { setTalkBack(current => !current); window.speechSynthesis?.cancel(); }}
              >
                {talkBack ? <Volume2 size={19}/> : <VolumeX size={19}/>}
                <span>Reply</span>
              </button>
            </div>
            <div className={styles.languageLabel}>
              <button
                type="button"
                className={styles.languageTrigger}
                aria-label="Choose speech language"
                aria-expanded={languageOpen}
                aria-controls="carel-voice-languages"
                disabled={listening}
                onClick={() => { setLanguageOpen(current => !current); setLanguageSearch(""); }}
              >
                <Globe2 size={16}/>
                <span className={styles.selectedLanguage}>{getVoiceLanguage(language).label}</span>
                <ChevronDown size={16} className={languageOpen ? styles.chevronUp : undefined}/>
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
                          type="button"
                          key={item.code}
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
            <p className={styles.status} role="status" aria-live="polite">
              <Info size={15} aria-hidden="true"/>
              <span>{supported === false ? "Voice recognition unavailable here. Type your goal instead." : message}</span>
            </p>
            {reply && <div className={styles.response}>
              <p>{reply}</p>
              <button type="button" onClick={() => readAloud(reply)}>Read aloud</button>
            </div>}
            <p className={styles.hint}>Push to talk · No always-on listening · No automatic wallet approvals</p>
          </div>
        </div>
      )}
    </>
  );
}
