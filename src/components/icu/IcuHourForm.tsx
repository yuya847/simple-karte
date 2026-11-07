"use client";

// ICU・HCU の1時間の記録（量・観察）を入れる欄。経過表のセルから開く。保存の形は ICU 記録の hourly（H:00 の記録が
// H−1時〜H時の量）で、時間表と同じ。

import { useState, type FormEvent } from "react";
import { abs } from "@/lib/flowsheet";
import { HOURLY_FIELDS, hourRecord, hourlyFromValues } from "@/lib/icu/hourly-entry";
import type { HourlyRecord } from "@/lib/icu/types";
import type { VitalSign } from "@/lib/types";
import { Field, button, input } from "./parts";

const hh = (h: number) => String(h).padStart(2, "0");

export function IcuHourForm({ patientId, records, vitals, at, nowAbs, by, newId, label, onSave, onClose }: { patientId: string; records: HourlyRecord[]; vitals: VitalSign[]; at: number; nowAbs: number; by: string; newId: () => string; label: (day: number) => string; onSave: (r: HourlyRecord) => void; onClose: () => void }) {
  const day = Math.floor(at / 1440);
  const [hour, setHour] = useState(Math.floor((at - day * 1440) / 60));
  const [error, setError] = useState("");
  const end = abs(day, `${hh(hour)}:00`);
  const old = hourRecord(records, patientId, end);
  const vital = vitals.filter((v) => v.day === day && Number(v.time.slice(0, 2)) === hour).sort((a, b) => a.time.localeCompare(b.time)).at(-1);
  const hours = Array.from({ length: 24 }, (_, h) => h).filter((h) => abs(day, `${hh(h)}:00`) <= nowAbs);
  function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    try {
      onSave(hourlyFromValues(Object.fromEntries([...new FormData(e.currentTarget)].map(([k, v]) => [k, String(v)])), old, { id: newId(), patientId, at: { day, time: `${hh(hour)}:00` }, by }));
      onClose();
    } catch (error) {
      setError((error as Error).message);
    }
  }
  return (
    <form key={end} onSubmit={save} onClick={(e) => e.stopPropagation()} className="sticky left-0 z-10 max-w-3xl space-y-2 rounded border border-ai bg-sheet p-3 text-xs print:hidden">
      <div className="flex items-center justify-between gap-2">
        <b className="flex items-center gap-1">
          {label(day)}
          <select aria-label="時刻" className="rounded border border-rule bg-sheet px-1 py-0.5" value={hour} onChange={(e) => { setHour(Number(e.target.value)); setError(""); }}>
            {hours.map((h) => <option key={h} value={h}>{h}時</option>)}
          </select>
          の記録
        </b>
        <button type="button" className="rounded border border-rule px-2 py-1" onClick={onClose}>閉じる</button>
      </div>
      {error && <p role="alert" className="text-shu">{error}</p>}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {HOURLY_FIELDS.map(([k, l]) => <Field key={k} label={l}><input className={input} name={k} type="number" step="any" min={k === "rass" ? -5 : 0} max={k === "rass" ? 4 : k === "cpot" ? 8 : undefined} defaultValue={old?.[k]} /></Field>)}
        {(["e", "v", "m"] as const).map((k) => <Field key={k} label={`GCS ${k.toUpperCase()}`}><select className={input} name={`gcs${k.toUpperCase()}`} defaultValue={old?.gcs?.[k] ?? vital?.gcs?.[k] ?? ""}><option value="" />{Array.from({ length: k === "e" ? 4 : k === "v" ? 5 : 6 }, (_, i) => <option key={i + 1}>{i + 1}</option>)}{k === "v" && <option>T</option>}</select></Field>)}
        <Field label="CAM-ICU"><select name="camIcu" className={input} defaultValue={old?.camIcu ?? ""}>{["", "陰性", "陽性", "評価不能"].map((x) => <option key={x}>{x}</option>)}</select></Field>
        {([["pupilRight", "右瞳孔 mm"], ["pupilLeft", "左瞳孔 mm"]] as const).map(([k, l], i) => <Field key={k} label={l}><input name={k} className={input} type="number" min="0" step="0.1" defaultValue={i ? old?.pupils?.left : old?.pupils?.right} /></Field>)}
        {["reactRight", "reactLeft"].map((k, i) => <Field key={k} label={`${i ? "左" : "右"}対光反射`}><select name={k} className={input} defaultValue={i ? old?.pupils?.reactLeft : old?.pupils?.reactRight}>{["+", "-", "遅"].map((x) => <option key={x}>{x}</option>)}</select></Field>)}
        <label className="flex items-center gap-1"><input name="arterialLine" type="checkbox" defaultChecked={old?.arterialLine} />動脈ライン</label>
      </div>
      <Field label="記録"><input className={input} name="note" defaultValue={old?.note} /></Field>
      <button className={button}>保存</button>
    </form>
  );
}
