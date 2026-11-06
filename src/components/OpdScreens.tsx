"use client";

// Two full-screen pages of 外来 for a monitor or an iPad: the waiting-room display (受付番号だけ) and the
// 再来受付機 (模擬: the 診察券 number is typed; no machine or card reader is connected).

import { displayText } from "@/lib/display-text";
import { Delete, Maximize, X } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { DISPLAY_NOTE, isCardNo, ticketLabel, type DisplayBoard, type KioskResult } from "@/lib/opd-desk";

function FullScreen({ label, onClose, children }: { label: string; onClose: () => void; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  return (
    <div ref={box} role="dialog" aria-modal="true" aria-label={label} className="fixed inset-0 z-50 flex flex-col overflow-auto bg-ink text-white">
      <div className="flex items-center gap-2 px-4 py-2 text-sm">
        <span className="rounded border border-dashed border-white/50 px-1.5 py-0.5 text-[11px]">模擬</span>
        <span className="text-white/70">{label}</span>
        <button
          type="button"
          onClick={() => {
            try {
              if (!document.fullscreenElement) box.current?.requestFullscreen?.().catch(() => undefined);
              else document.exitFullscreen?.().catch(() => undefined);
            } catch {
              // Full screen is not allowed here (iPad Safari, an embedded page): the page still fills the window.
            }
          }}
          className="ml-auto flex items-center gap-1 rounded border border-white/40 px-2 py-1 hover:bg-white/10"
        >
          <Maximize size={14} />
          全画面
        </button>
        <button
          type="button"
          onClick={() => {
            if (document.fullscreenElement) document.exitFullscreen?.().catch(() => undefined);
            onClose();
          }}
          className="flex items-center gap-1 rounded border border-white/40 px-2 py-1 hover:bg-white/10"
        >
          <X size={14} />
          閉じる
        </button>
      </div>
      {children}
    </div>
  );
}

/** 待合の番号表示: per 診察室 the number in the room, the numbers being called and the next; and 会計. */
export function WaitingDisplay({ board, nowTime, onClose }: { board: DisplayBoard; nowTime: string; onClose: () => void }) {
  const nums = (xs: number[], big = false) => (xs.length ? xs.map((n) => <span key={n} className={`nums inline-block rounded px-2 ${big ? "bg-yamabuki text-ink" : "bg-white/10"}`}>{ticketLabel(n)}</span>) : <span className="text-white/40">—</span>);
  return (
    <FullScreen label="待合の番号表示" onClose={onClose}>
      <div className="flex items-end justify-between px-6 pb-2">
        <h1 className="text-3xl font-bold">外来　診察のご案内</h1>
        <p className="nums text-3xl">{nowTime}</p>
      </div>
      <div className="grid flex-1 gap-4 px-6 pb-6 lg:grid-cols-[2fr_1fr]">
        <div className="grid content-start gap-3 sm:grid-cols-2">
          {board.rooms.map((r) => (
            <section key={r.room} className="rounded-xl border border-white/20 p-4">
              <h2 className="flex items-baseline justify-between">
                <span className="text-2xl font-bold">{r.room}</span>
                <span className="text-white/70">{displayText(r.dept)}</span>
              </h2>
              <p className="mt-2 text-sm text-white/70">お呼びしています。{r.room}へお入りください</p>
              <p className="flex flex-wrap gap-2 text-4xl font-bold">{nums(r.calling, true)}</p>
              <p className="mt-2 text-sm text-white/70">診察中</p>
              <p className="flex flex-wrap gap-2 text-2xl">{nums(r.now)}</p>
              <p className="mt-2 text-sm text-white/70">まもなくお呼びします</p>
              <p className="flex flex-wrap gap-2 text-2xl">{nums(r.next)}</p>
            </section>
          ))}
        </div>
        <section className="rounded-xl border border-white/20 p-4">
          <h2 className="text-2xl font-bold">お会計</h2>
          <p className="mt-2 text-sm text-white/70">お会計の準備ができました。会計窓口へお越しください</p>
          <p className="flex flex-wrap gap-2 text-4xl font-bold">{nums(board.pay.calling, true)}</p>
          <p className="mt-4 text-sm text-white/70">お会計を準備しています</p>
          <p className="flex flex-wrap gap-2 text-2xl">{nums(board.pay.preparing)}</p>
        </section>
      </div>
      <p className="px-6 pb-4 text-xs text-white/60">受付票の番号でお呼びします。{DISPLAY_NOTE}この表示は、この端末の中だけの模擬です（待合のモニタにはつないでいません）。</p>
    </FullScreen>
  );
}

/** 再来受付機（模擬）: type the 診察券番号 (as the card would be read) and receive today's 予約. */
export function KioskScreen({ onRead, samples, onSlip, onClose }: { onRead: (cardNo: string) => KioskResult; samples: { cardNo: string; label: string }[]; onSlip: (patientId: string) => void; onClose: () => void }) {
  const [digits, setDigits] = useState("");
  const [result, setResult] = useState<KioskResult | null>(null);
  const press = (d: string) => setDigits((s) => (s.length < 7 ? s + d : s));
  const read = (no: string) => {
    setResult(onRead(no));
    setDigits("");
  };
  const key = "nums rounded-xl bg-white/10 py-5 text-3xl font-bold hover:bg-white/20 active:bg-white/30";
  return (
    <FullScreen label="再来受付機（模擬）" onClose={onClose}>
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center gap-4 px-6 pb-6">
        <h1 className="text-3xl font-bold">再来受付</h1>
        {!result ? (
          <>
            <p className="text-lg text-white/80">診察券の番号（7桁）を入れてください</p>
            <p className="nums h-16 w-full rounded-xl bg-white text-center text-5xl leading-[4rem] tracking-[0.3em] text-ink">{digits || " "}</p>
            <div className="grid w-full grid-cols-3 gap-3">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
                <button key={d} type="button" onClick={() => press(d)} className={key}>
                  {d}
                </button>
              ))}
              <button type="button" onClick={() => setDigits((s) => s.slice(0, -1))} aria-label="1文字消す" className={`${key} flex items-center justify-center`}>
                <Delete size={28} />
              </button>
              <button type="button" onClick={() => press("0")} className={key}>
                0
              </button>
              <button type="button" disabled={!isCardNo(digits)} onClick={() => read(digits)} className="rounded-xl bg-wakatake py-5 text-2xl font-bold disabled:opacity-40">
                受付
              </button>
            </div>
            <div className="w-full text-sm text-white/70">
              模擬の診察券（押すと読み取ったことにします）：
              <div className="mt-1 flex flex-wrap gap-2">
                {samples.map((s) => (
                  <button key={s.cardNo} type="button" onClick={() => read(s.cardNo)} className="nums rounded border border-white/30 px-2 py-1 hover:bg-white/10">
                    {s.cardNo} {s.label}
                  </button>
                ))}
              </div>
            </div>
          </>
        ) : (
          <div className="w-full rounded-xl bg-white p-6 text-center text-ink">
            {result.kind === "受付しました" || result.kind === "受付済み" ? (
              <>
                <p className="text-xl font-bold">{result.kind === "受付しました" ? "受付しました" : "すでに受付しています"}</p>
                <p className="mt-2 text-sm">受付番号</p>
                <p className="nums text-6xl font-bold">{ticketLabel(result.ticket)}</p>
                <p className="mt-3 text-lg">
                  {result.patient.department}　{result.patient.slot ? `予約 ${result.patient.slot}` : "予約外"}
                </p>
                <p className="mt-1 text-sm text-ink-soft">番号でお呼びします。待合の表示をご覧ください。</p>
                <button type="button" onClick={() => onSlip(result.patient.id)} className="mt-3 rounded-md border border-rule px-3 py-1.5">
                  受付票を印刷
                </button>
              </>
            ) : result.kind === "今日の予約がありません" ? (
              <>
                <p className="text-xl font-bold">今日の予約がありません</p>
                <p className="mt-2">受付窓口へお越しください。</p>
              </>
            ) : (
              <>
                <p className="text-xl font-bold">番号が見つかりません</p>
                <p className="mt-2">診察券の番号を確かめて、もう一度入れてください。初めての方は受付窓口へお越しください。</p>
              </>
            )}
            <button type="button" onClick={() => setResult(null)} className="mt-4 rounded-md bg-ai px-4 py-2 font-bold text-white">
              最初の画面へ
            </button>
          </div>
        )}
        <p className="text-xs text-white/60">この画面は再来受付機の模擬です。本物の受付機や診察券の読み取りにはつないでいません。予約のある再診の患者だけを受け付けます（初診と予約外は窓口<span className="hint">。院内の取り決め</span>）。</p>
      </div>
    </FullScreen>
  );
}
