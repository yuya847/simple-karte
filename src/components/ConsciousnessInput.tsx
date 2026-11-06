"use client";
import { JCS_SCORES } from "@/lib/consciousness";
import type { VitalSign } from "@/lib/types";
type Value = Pick<VitalSign, "jcs" | "gcs">;
export function ConsciousnessInput({ value, onChange }: { value: Value; onChange: (v: Value) => void }) {
  const box = "rounded border border-rule bg-paper px-2 py-1.5";
  return <fieldset className="col-span-2 flex flex-wrap items-center gap-2">
    <legend>意識（JCS・GCS）</legend>
    <label>JCS <select aria-label="JCS" className={box} value={value.jcs?.score ?? ""} onChange={e => onChange({ ...value, jcs: e.target.value ? { score: e.target.value as NonNullable<VitalSign["jcs"]>["score"], modifiers: value.jcs?.modifiers } : undefined })}>
      <option value="">未入力</option>{JCS_SCORES.map(s => <option key={s}>{s}</option>)}
    </select></label>
    {(["R", "I", "A"] as const).map(m => <label key={m} className="p-1"><input type="checkbox" disabled={!value.jcs} checked={value.jcs?.modifiers?.includes(m) ?? false} onChange={e => { if (value.jcs) onChange({ ...value, jcs: { ...value.jcs, modifiers: e.target.checked ? [...(value.jcs.modifiers ?? []), m] : value.jcs.modifiers?.filter(x => x !== m) } }); }} />{m}</label>)}
    {([["e", "E", 4], ["v", "V", 5], ["m", "M", 6]] as const).map(([key, label, max]) => <label key={key}>GCS {label} <select aria-label={`GCS ${label}`} className={box} value={value.gcs?.[key] ?? ""} onChange={e => { const gcs = { ...value.gcs, [key]: e.target.value ? Number(e.target.value) : undefined }; onChange({ ...value, gcs: Object.values(gcs).some(x => x !== undefined) ? gcs : undefined }); }}><option value="">未入力</option>{Array.from({ length: max }, (_, i) => <option key={i + 1}>{i + 1}</option>)}</select></label>)}
    
  </fieldset>;
}
