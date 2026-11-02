"use client";

// Dictation through the browser's Web Speech API (Chrome). In Chrome the audio is
// transcribed by Google's speech service; this app only ever handles fictional data.

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

interface RecognitionResult {
  isFinal: boolean;
  0: { transcript: string };
}
interface RecognitionEvent {
  resultIndex: number;
  results: ArrayLike<RecognitionResult>;
}
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: RecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
}
type RecognitionCtor = new () => Recognition;

function getCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const noSubscribe = () => () => {};

export function useSpeech(onFinal: (text: string) => void) {
  const supported = useSyncExternalStore(noSubscribe, () => getCtor() !== null, () => false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<Recognition | null>(null);
  const finalCb = useRef(onFinal);
  useEffect(() => {
    finalCb.current = onFinal;
  }, [onFinal]);

  const stop = useCallback(() => {
    rec.current?.stop();
  }, []);

  const start = useCallback(() => {
    const Ctor = getCtor();
    if (!Ctor) return;
    const r = new Ctor();
    r.lang = "ja-JP";
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (e) => {
      let live = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) finalCb.current(res[0].transcript);
        else live += res[0].transcript;
      }
      setInterim(live);
    };
    r.onerror = (e) => setError(e.error === "not-allowed" ? "マイクの使用が許可されていません" : `音声認識のエラー（${e.error}）`);
    r.onend = () => {
      setListening(false);
      setInterim("");
      rec.current = null;
    };
    rec.current = r;
    setError(null);
    setListening(true);
    r.start();
  }, []);

  useEffect(() => () => rec.current?.stop(), []);

  return { supported, listening, interim, error, start, stop };
}
