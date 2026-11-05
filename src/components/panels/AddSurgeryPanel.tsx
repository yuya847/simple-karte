"use client";

import { useState } from "react";
import { addDays, daysFrom, isoDate, minutesOf, type CalendarDate } from "@/lib/dates";
import { fitsOrSlot, orSlots } from "@/lib/or-slots";
import { ANESTHESIAS, OR_ROOMS, OR_RULES, POSITIONS, SIDES, type Surgery } from "@/lib/surgery";
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
    <p className="hint text-xs text-ink-soft">模擬の手術申込です。AI は使いません。登録済みの患者情報を引用しています。術前の確認は医師が確かめてください。申込も枠を使います。開室 {OR_RULES.open}〜{OR_RULES.close}、手術の間に片付け {OR_RULES.turnover}分、前日 {OR_RULES.deadline}締切は架空の病院の取り決めです。空き枠は所要時間で選び、保存時にも確認します。</p>
    <label className="block">術式<textarea aria-label="術式" className={input} value={draft.procedure} onChange={(e) => set("procedure", e.target.value)} /></label>
    <div className="grid grid-cols-2 gap-2">{text("部位", draft.site, (v) => set("site", v))}{select("左右", draft.side ?? "", SIDES, (v) => set("side", v as Surgery["side"]))}{select("体位", draft.position ?? "", POSITIONS, (v) => set("position", v as Surgery["position"]))}{select("麻酔", draft.anesthesia ?? "", ANESTHESIAS, (v) => set("anesthesia", v as Surgery["anesthesia"]))}</div>
    <label className="block">予定日<input aria-label="予定日" type="date" className={input} min={isoDate(today)} value={isoDate(addDays(today, draft.day))} onChange={(e) => { if (!e.target.value) return; const [y, m, d] = e.target.value.split("-").map(Number); setDraft((s) => ({ ...s, day: daysFrom(today, { y, m, d }), start: null })); }} /></label>
    <div className="grid grid-cols-2 gap-2"><label>希望の開始時刻<input aria-label="希望の開始時刻" type="time" className={input} value={draft.start ?? ""} onChange={(e) => set("start", e.target.value || null)} /></label><label>所要時間（分）<input aria-label="所要時間（分）" className={input} type="number" min={1} step={1} value={draft.minutes ?? ""} onChange={(e) => set("minutes", Number(e.target.value))} /></label></div>
    <fieldset className="space-y-2 rounded border border-rule p-2"><legend>手術室ごとの空き</legend>{OR_ROOMS.map((room) => <div key={room}><button type="button" className="font-bold underline" aria-pressed={draft.room === room} onClick={() => set("room", room)}>{room}{draft.room === room ? "（選択中）" : ""}</button><div className="flex flex-wrap gap-1">{orSlots(draft.day, room, surgeries).map((slot) => <button type="button" key={slot.start} disabled={slot.minutes < (draft.minutes ?? 0)} onClick={() => setDraft((s) => ({ ...s, room, start: slot.start }))} className="rounded border border-rule px-2 py-1 disabled:opacity-40">{slot.start}から {slot.minutes}分</button>)}{orSlots(draft.day, room, surgeries).length === 0 && <span>空きなし</span>}</div></div>)}</fieldset>
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
