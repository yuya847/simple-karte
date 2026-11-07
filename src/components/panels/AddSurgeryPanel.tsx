"use client";

import { IsoDayInput } from "../DayInput";
import { TimeInput } from "@/components/TimeInput";

import { useRef, useState, type MouseEvent, type PointerEvent } from "react";
import { addDays, daysFrom, isoDate, minutesOf, type CalendarDate } from "@/lib/dates";
import { fitsOrSlot, orSlots } from "@/lib/or-slots";
import { ANESTHESIAS, OR_ROOMS, OR_RULES, POSITIONS, SIDES, type OrRoom, type Surgery } from "@/lib/surgery";
import { requestKind, startSurgeryRequest, surgeryRequestText } from "@/lib/surgery-request";
import type { Patient } from "@/lib/types";
import { useDeny } from "../RoleContext";

export function AddSurgeryPanel({ patient, today, nowTime, surgeries, onSave }: {
  patient: Patient; today: CalendarDate; nowTime: string; surgeries: Surgery[];
  onSave: (s: Surgery, text: string) => void;
}) {
  const deny = useDeny()("order");
  const [draft, setDraft] = useState(() => startSurgeryRequest(patient, minutesOf(nowTime)));
  const set = <K extends keyof Surgery>(key: K, value: Surgery[K]) => setDraft((s) => ({ ...s, [key]: value }));
  const preop = (key: keyof NonNullable<Surgery["preop"]>, value: string) => setDraft((s) => ({ ...s, preop: { ...s.preop!, [key]: value } }));
  const request = { ...draft, kind: requestKind(draft.day, minutesOf(nowTime)), requestedAt: minutesOf(nowTime) };
  const valid = draft.day >= 0 && draft.procedure.trim() && draft.site.trim() && draft.side && draft.position && draft.anesthesia && draft.room && draft.start && fitsOrSlot(draft.day, draft.room, draft.start, draft.minutes ?? 0, surgeries) && Number.isInteger(draft.bloodUnits) && (draft.bloodUnits ?? -1) >= 0;
  const input = "w-full rounded border border-rule bg-sheet px-2 py-1";
  const select = (label: string, value: string, options: readonly string[], change: (v: string) => void) => <label className="block">{label}<select aria-label={label} className={input} value={value} onChange={(e) => change(e.target.value)}><option value="">選んでください</option>{options.map((v) => <option key={v}>{v}</option>)}</select></label>;
  const text = (label: string, value: string, change: (v: string) => void) => <label className="block">{label}<input aria-label={label} className={input} value={value} onChange={(e) => change(e.target.value)} /></label>;
  return <form className="space-y-3 text-sm" onSubmit={(e) => { e.preventDefault(); if (deny || !valid) return; onSave({ ...request, id: crypto.randomUUID() }, surgeryRequestText(request, today)); }}>
    <p className="font-bold">{patient.name}（{patient.sex}・{patient.age}歳）／{patient.ward}／{patient.department}</p>

    <label className="block">術式<textarea aria-label="術式" className={input} value={draft.procedure} onChange={(e) => set("procedure", e.target.value)} /></label>
    <div className="grid grid-cols-2 gap-2">{text("部位", draft.site, (v) => set("site", v))}{select("左右", draft.side ?? "", SIDES, (v) => set("side", v as Surgery["side"]))}{select("体位", draft.position ?? "", POSITIONS, (v) => set("position", v as Surgery["position"]))}{select("麻酔", draft.anesthesia ?? "", ANESTHESIAS, (v) => set("anesthesia", v as Surgery["anesthesia"]))}</div>
    <label className="block">予定日<IsoDayInput aria-label="予定日"  className={input} min={isoDate(today)} value={isoDate(addDays(today, draft.day))} onChange={(e) => { if (!e.target.value) return; const [y, m, d] = e.target.value.split("-").map(Number); setDraft((s) => ({ ...s, day: daysFrom(today, { y, m, d }), start: null })); }} /></label>
    <div className="grid grid-cols-2 gap-2"><label>希望の開始時刻<TimeInput aria-label="希望の開始時刻" className={input} value={draft.start ?? ""} onChange={(e) => set("start", e.target.value || null)} /></label><label>所要時間（分）<input aria-label="所要時間（分）" className={input} type="number" min={1} step={1} value={draft.minutes ?? ""} onChange={(e) => set("minutes", Number(e.target.value))} /></label></div>
    <fieldset className="space-y-1 rounded border border-rule p-2"><legend>手術室ごとの空き</legend><OrDayBars day={draft.day} surgeries={surgeries} room={draft.room} start={draft.start} minutes={draft.minutes ?? 0} onPick={(room, start) => setDraft((s) => ({ ...s, room, start }))} onMinutes={(m) => set("minutes", m)} /></fieldset>
    <p>申込区分：{request.kind}</p>
    <div className="grid grid-cols-2 gap-2">{text("執刀医", draft.surgeon ?? "", (v) => set("surgeon", v))}{text("助手", draft.assistant ?? "", (v) => set("assistant", v))}</div>
    <fieldset className="space-y-2 rounded border border-rule p-2"><legend>術前の確認</legend>
      {select("同意書の有無", draft.preop!.consent, ["未確認", "あり（対象の手術と署名を確認）", "なし"], (v) => preop("consent", v))}
      {text("感染症", draft.infections.join("、"), (v) => set("infections", v.split("、").filter(Boolean)))}
      {text("アレルギー", draft.allergies.join("、"), (v) => set("allergies", v.split("、").filter(Boolean)))}
      {text("抗凝固薬の中止", draft.preop!.anticoagulant, (v) => preop("anticoagulant", v))}
      {text("血液型", draft.preop!.bloodType, (v) => preop("bloodType", v))}
      {select("輸血の準備", draft.blood, ["なし", "血液型・不規則抗体", "輸血準備"], (v) => set("blood", v as Surgery["blood"]))}
      <label className="block">輸血の準備（単位数）<input aria-label="輸血の準備（単位数）" type="number" min={0} step={1} className={input} value={draft.bloodUnits ?? 0} onChange={(e) => set("bloodUnits", Number(e.target.value))} /></label>
      {text("絶食の指示", draft.preop!.fasting, (v) => preop("fasting", v))}
    </fieldset>
    <label className="block">特記<textarea aria-label="特記" className={input} value={draft.special ?? ""} onChange={(e) => set("special", e.target.value)} /></label>
    {!valid && <p className="text-xs text-yamabuki">術式・部位・麻酔と、所要時間が収まる日時・手術室を選んでください。単位数は0以上の整数です。</p>}
    {deny && <p>{deny}</p>}<button type="submit" disabled={!!deny || !valid} className="rounded bg-ai px-3 py-2 text-white disabled:opacity-40">保存する</button>
  </form>;
}

const OPEN = minutesOf(OR_RULES.open);
const CLOSE = minutesOf(OR_RULES.close);
const pct = (m: number) => `${((m - OPEN) / (CLOSE - OPEN)) * 100}%`;
const clock = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const STEP = 15;

/**
 * One bar per operating room from opening to closing: cases (grey), the free time (white), and the request
 * (blue, red when it does not fit). Pressing the free time puts the start there (on 15 minutes); the right end
 * of the request is dragged to change how long it takes (a length that does not fit is not kept).
 */
export function OrDayBars({ day, surgeries, room, start, minutes, onPick, onMinutes }: { day: number; surgeries: Surgery[]; room: OrRoom | null; start: string | null; minutes: number; onPick: (room: OrRoom, start: string) => void; onMinutes: (m: number) => void }) {
  const [preview, setPreview] = useState<number | null>(null);
  const drag = useRef<{ pointer: number; from: number } | null>(null);
  const at = (el: Element, x: number) => {
    const r = el.closest("[data-or-bar]")!.getBoundingClientRect();
    return OPEN + Math.min(1, Math.max(0, (x - r.left) / r.width)) * (CLOSE - OPEN);
  };
  const hours = Array.from({ length: Math.floor(CLOSE / 60) - Math.ceil(OPEN / 60) + 1 }, (_, i) => (Math.ceil(OPEN / 60) + i) * 60);
  const shown = preview ?? minutes;
  return (
    <div className="text-[12px]">
      <div className="relative ml-20 h-4 text-[10px] text-ink-faint" aria-hidden>
        {hours.map((h) => (
          <span key={h} className="nums absolute -translate-x-1/2" style={{ left: pct(h) }}>
            {h / 60}
          </span>
        ))}
      </div>
      {OR_ROOMS.map((r) => {
        const slots = orSlots(day, r, surgeries);
        const cases = surgeries.filter((s) => s.day === day && s.room === r && s.start && s.minutes);
        const mine = room === r && start ? minutesOf(start) : null;
        const fits = mine !== null && fitsOrSlot(day, r, start!, shown, surgeries);
        return (
          <div key={r} className="flex items-center gap-2 py-0.5">
            <span className={`w-[4.5rem] shrink-0 ${room === r ? "font-bold text-ai" : ""}`}>{r}</span>
            <div data-or-bar className="relative h-8 flex-1 overflow-hidden rounded border border-rule bg-tab">
              {hours.map((h) => (
                <span key={h} aria-hidden className="pointer-events-none absolute inset-y-0 w-px bg-rule/60" style={{ left: pct(h) }} />
              ))}
              {slots.map((sl) => {
                const a = minutesOf(sl.start);
                return (
                  <button
                    key={sl.start}
                    type="button"
                    aria-label={`${r} ${sl.start}から ${sl.minutes}分 空き`}
                    title={`${sl.start}〜${clock(a + sl.minutes)} 空き（${sl.minutes}分）`}
                    onClick={(e: MouseEvent<HTMLButtonElement>) => {
                      // A press puts the start where it was pressed (15 minutes); Enter, at the start of the free time.
                      const m = e.detail === 0 ? a : Math.max(a, Math.floor(at(e.currentTarget, e.clientX) / STEP) * STEP);
                      onPick(r, clock(m));
                    }}
                    className="absolute inset-y-0 cursor-copy bg-sheet hover:bg-ai-soft/60 focus-visible:outline-2 focus-visible:outline-ai"
                    style={{ left: pct(a), width: pct(OPEN + sl.minutes) }}
                  />
                );
              })}
              {cases.map((c) => (
                <span key={c.id} title={`${c.start} ${c.minutes}分 ${c.procedure}`} className="pointer-events-auto absolute inset-y-1 truncate rounded bg-ink-faint/40 px-1 text-[10px] leading-6 text-ink-soft" style={{ left: pct(minutesOf(c.start!)), width: pct(OPEN + c.minutes!) }}>
                  {c.procedure}
                </span>
              ))}
              {mine !== null && (
                <span role="img" aria-label={`申込 ${start}から ${shown}分${fits ? "" : "（入りません）"}`} className={`pointer-events-none absolute inset-y-0.5 rounded px-1 text-[10px] font-bold leading-7 text-white ${fits ? "bg-ai/85" : "bg-shu/85"}`} style={{ left: pct(mine), width: pct(OPEN + Math.min(shown, CLOSE - mine)) }}>
                  <span className="nums truncate">
                    {start}〜{clock(mine + shown)}
                  </span>
                  <span
                    aria-hidden
                    className="pointer-events-auto absolute inset-y-0 -right-1 w-3 cursor-ew-resize touch-none"
                    onPointerDown={(e: PointerEvent<HTMLSpanElement>) => {
                      if (e.button !== 0) return;
                      e.preventDefault();
                      e.currentTarget.setPointerCapture(e.pointerId);
                      drag.current = { pointer: e.pointerId, from: minutes };
                    }}
                    onPointerMove={(e: PointerEvent<HTMLSpanElement>) => {
                      if (drag.current?.pointer !== e.pointerId) return;
                      setPreview(Math.max(STEP, Math.round((at(e.currentTarget, e.clientX) - mine) / STEP) * STEP));
                    }}
                    onPointerUp={(e: PointerEvent<HTMLSpanElement>) => {
                      if (drag.current?.pointer !== e.pointerId) return;
                      drag.current = null;
                      const m = Math.max(STEP, Math.round((at(e.currentTarget, e.clientX) - mine) / STEP) * STEP);
                      setPreview(null);
                      if (fitsOrSlot(day, r, start!, m, surgeries)) onMinutes(m);
                    }}
                    onPointerCancel={() => {
                      drag.current = null;
                      setPreview(null);
                    }}
                  >
                    <span className="absolute inset-y-1.5 right-1 w-1 rounded bg-white/90" />
                  </span>
                </span>
              )}
              {slots.length === 0 && <span className="absolute inset-0 flex items-center justify-center text-[11px] text-ink-soft">空きなし</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* Help migration source (references and dynamic wording):
<p >模擬の手術申込です。AI は使いません。登録済みの患者情報を引用しています。術前の確認は医師が確かめてください。申込も枠を使います。開室 {OR_RULES.open}〜{OR_RULES.close}、手術の間に片付け {OR_RULES.turnover}分、前日 {OR_RULES.deadline}締切です。空き枠は所要時間で選び、保存時にも確認します。</p>
*/
