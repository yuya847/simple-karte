"use client";

// IC を声で記録, 声での分離 inside the browser. When the person turns 声でも分ける on, a Web Worker
// (public/diarize/ic-diarize-worker.js) fetches the open-source diarization model (sherpa-onnx, WebAssembly,
// about 58 MB, then in the browser's cache). While recording, MediaRecorder records the microphone next to
// the browser's speech recognition; every PIECE_MS and when recording stops, the piece is decoded to 16 kHz
// in this tab and handed to the worker, and what comes back is stretches of time with speaker numbers.
// The voice is only in this tab's memory until its piece is done; nothing is sent or stored.
//
// With `local` (the hospital's own speech-recognition server, lib/ic/local-asr.ts) there is no model here: each
// piece (every minute) goes as 16 kHz WAV from the browser to that server, and its stretches with words come back
// through `onLocal` as lines. The voice then stays in the hospital's network.

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { fromSherpa, PIECE_MS, SAMPLE_RATE, type VoicePiece } from "./diarize";
import { LOCAL_PIECE_MS, readLocalAsr, wavBytes, type LocalSegment } from "./local-asr";

const WORKER_URL = "/diarize/ic-diarize-worker.js";
const TYPES = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/webm"];
const pickType = () => (typeof MediaRecorder === "undefined" ? null : (TYPES.find((t) => MediaRecorder.isTypeSupported(t)) ?? null));
const canRecord = () => typeof OfflineAudioContext !== "undefined" && !!pickType() && !!navigator.mediaDevices?.getUserMedia;
const canRun = () => typeof Worker !== "undefined" && typeof WebAssembly !== "undefined" && canRecord();
const noSubscribe = () => () => {};

/** off → (turned on) loading → ready; error when the model could not be loaded. */
export type ModelState = "off" | "loading" | "ready" | "error";

/**
 * `onDone(pieces)` is called when recording has stopped and every piece recorded so far has been diarized
 * (with all the pieces of this window). With `local`, `onLocal` gets each piece's stretches as they come.
 */
export function useVoiceDiarizer(onDone: (pieces: VoicePiece[]) => void, opts: { local?: string | null; onLocal?: (piece: { take: number; startedAt: number }, segments: LocalSegment[]) => void } = {}) {
  const local = opts.local ?? null;
  const supported = useSyncExternalStore(noSubscribe, local ? canRecord : canRun, () => false);
  const [on, setOn] = useState(!!local);
  const [model, setModel] = useState<ModelState>(local ? "ready" : "off");
  const [progress, setProgress] = useState(0);
  const [pending, setPending] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const worker = useRef<Worker | null>(null);
  const ready = useRef(false);
  const queue = useRef<{ id: number; samples: Float32Array }[]>([]);
  const jobs = useRef(new Map<number, { take: number; startedAt: number }>());
  const pieces = useRef<VoicePiece[]>([]);
  const open = useRef(0);
  const take = useRef(0);
  const rec = useRef<{ stream: MediaStream; mr: MediaRecorder | null; timer: ReturnType<typeof setInterval> | null } | null>(null);
  const wanted = useRef(false);
  const closed = useRef(false);
  const done = useRef(onDone);
  const onLocal = useRef(opts.onLocal);
  useEffect(() => {
    done.current = onDone;
    onLocal.current = opts.onLocal;
  });

  const settle = useCallback(() => {
    open.current = Math.max(0, open.current - 1);
    setPending(open.current);
    if (!open.current && !rec.current && !closed.current) done.current([...pieces.current]);
  }, []);

  const send = useCallback((job: { id: number; samples: Float32Array }) => {
    if (ready.current && worker.current) worker.current.postMessage(job, [job.samples.buffer]);
    else queue.current.push(job);
  }, []);

  const load = useCallback(() => {
    if (worker.current) return;
    setModel("loading");
    setError(null);
    const w = new Worker(WORKER_URL);
    w.onmessage = (e: MessageEvent) => {
      const m = e.data as { type: string; id?: number; loaded?: number; total?: number; segments?: unknown; message?: string };
      if (m.type === "progress") setProgress(m.total ? (m.loaded ?? 0) / m.total : 0);
      else if (m.type === "ready") {
        ready.current = true;
        setModel("ready");
        const waiting = queue.current;
        queue.current = [];
        waiting.forEach(send);
      } else if (m.type === "result" || m.type === "error") {
        const job = m.id === undefined ? undefined : jobs.current.get(m.id);
        if (m.type === "error" && !job) {
          setModel("error");
          setError("声のモデルを読み込めませんでした");
          return;
        }
        if (!job || m.id === undefined) return;
        jobs.current.delete(m.id);
        if (m.type === "result") pieces.current = [...pieces.current, { ...job, segments: fromSherpa(m.segments) }];
        else setError("声で分けられない部分がありました");
        settle();
      }
    };
    w.onerror = () => {
      setModel("error");
      setError("声のモデルを読み込めませんでした");
    };
    worker.current = w;
  }, [send, settle]);

  /** Turn 声でも分ける on or off (on fetches the model the first time). */
  const toggle = useCallback(() => {
    if (!supported || local) return;
    if (!on) load();
    setOn(!on);
  }, [supported, local, on, load]);

  // The hospital's server: the piece as WAV, straight from this browser; the answer's stretches become lines.
  const toLocal = useCallback(
    async (url: string, samples: Float32Array, t: number, startedAt: number) => {
      try {
        const res = await fetch(url, { method: "POST", headers: { "content-type": "audio/wav", "x-ic-piece": String(t) }, body: wavBytes(samples, SAMPLE_RATE), signal: AbortSignal.timeout(120_000) });
        if (!res.ok) throw new Error(String(res.status));
        const segments = readLocalAsr(await res.json());
        if (closed.current) return;
        pieces.current = [...pieces.current, { take: t, startedAt, segments: [] }];
        onLocal.current?.({ take: t, startedAt }, segments);
      } catch {
        setError("院内のサーバーで文字にできませんでした");
      } finally {
        settle();
      }
    },
    [settle],
  );

  const diarize = useCallback(
    async (blob: Blob, t: number, startedAt: number) => {
      try {
        const audio = await new OfflineAudioContext(1, 1, SAMPLE_RATE).decodeAudioData(await blob.arrayBuffer());
        if (closed.current) return;
        if (local) return void toLocal(local, audio.getChannelData(0), t, startedAt);
        jobs.current.set(t, { take: t, startedAt });
        send({ id: t, samples: audio.getChannelData(0).slice() });
      } catch {
        setError("録音を読めませんでした");
        settle();
      }
    },
    [local, send, settle, toLocal],
  );

  const finishPiece = useCallback(() => {
    const r = rec.current;
    if (!r?.mr) return;
    open.current += 1;
    setPending(open.current);
    r.mr.stop();
    r.mr = null;
  }, []);

  // One piece: its own MediaRecorder, so each piece is a whole file the browser can decode.
  const startPiece = useCallback(
    (stream: MediaStream) => {
      const r = rec.current;
      const type = pickType();
      if (!r || !type) return;
      const mr = new MediaRecorder(stream, { mimeType: type, audioBitsPerSecond: 32_000 });
      const t = ++take.current;
      const startedAt = Date.now();
      const chunks: Blob[] = [];
      mr.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      mr.onstop = () => {
        const blob = new Blob(chunks, { type });
        if (closed.current || !blob.size) settle();
        else void diarize(blob, t, startedAt);
      };
      mr.start();
      r.mr = mr;
    },
    [diarize, settle],
  );

  /** Start recording the voice (only when 声でも分ける is on). */
  const start = useCallback(async () => {
    if (!on || rec.current || wanted.current) return;
    wanted.current = true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
      if (!wanted.current || closed.current) {
        stream.getTracks().forEach((x) => x.stop());
        return;
      }
      rec.current = { stream, mr: null, timer: null };
      startPiece(stream);
      // Every PIECE_MS (a minute for the hospital's server) the piece so far goes on and a new one begins.
      rec.current.timer = setInterval(
        () => {
          finishPiece();
          if (rec.current) startPiece(rec.current.stream);
        },
        local ? LOCAL_PIECE_MS : PIECE_MS,
      );
    } catch {
      wanted.current = false;
      setError("マイクを使えませんでした");
    }
  }, [on, local, startPiece, finishPiece]);

  /** Stop recording; the last piece is diarized, then onDone. */
  const stop = useCallback(() => {
    wanted.current = false;
    const r = rec.current;
    if (!r) return;
    if (r.timer) clearInterval(r.timer);
    finishPiece();
    r.stream.getTracks().forEach((x) => x.stop());
    rec.current = null;
  }, [finishPiece]);

  useEffect(() => {
    closed.current = false;
    return () => {
      closed.current = true;
      wanted.current = false;
      const r = rec.current;
      if (r) {
        if (r.timer) clearInterval(r.timer);
        if (r.mr?.state === "recording") r.mr.stop();
        r.stream.getTracks().forEach((x) => x.stop());
        rec.current = null;
      }
      worker.current?.terminate();
      worker.current = null;
      ready.current = false;
    };
  }, []);

  return { supported, on, model, progress, pending, error, toggle, start, stop };
}
