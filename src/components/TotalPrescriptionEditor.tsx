"use client";
import { useId } from "react";
import type { PrescriptionUse } from "@/lib/prescription-kind";
import { TOPICAL_METHODS, TOPICAL_SITES } from "@/lib/prescription-kind";
export function TotalPrescriptionEditor({ value, onChange }: { value: PrescriptionUse; onChange: (value: PrescriptionUse) => void }) {
  const id = useId();
  const match = value.usage.match(/^1日(\d+)回\s+(.*?)に(.+)$/);
  const times = value.frequency ? String(value.frequency) : match?.[1] ?? "", site = value.site ?? match?.[2] ?? "", method = value.method ?? match?.[3] ?? "";
  const change = (n: string, s: string, m: string) => onChange({ ...value, frequency: Number(n) || undefined, site: s, method: m, usage: n && s && m ? `1日${n}回 ${s}に${m}` : "" });
  return <div className="flex flex-wrap items-center gap-2">
    {value.kind === "外用" && <><label>回数 <select aria-label="外用の回数" value={times} onChange={e => change(e.target.value, site, method)}><option value="">選ぶ</option>{[1, 2, 3, 4, 5, 6].map(n => <option key={n} value={n}>1日{n}回</option>)}</select></label>
      <label>部位 <input aria-label="外用の部位" list={id} value={site} onChange={e => change(times, e.target.value, method)} className="w-20 border-b border-rule" /><datalist id={id}>{TOPICAL_SITES.map(s => <option key={s} value={s} />)}</datalist></label>
      <label>使い方 <select aria-label="外用の使い方" value={method} onChange={e => change(times, site, e.target.value)}><option value="">選ぶ</option>{TOPICAL_METHODS.map(m => <option key={m}>{m}</option>)}</select></label></>}
    <label className="basis-full">用法 <input aria-label={`${value.kind}の用法`} value={value.usage} onChange={e => onChange({ kind: value.kind, usage: e.target.value })} className="w-72 max-w-full border-b border-rule" /></label>
  </div>;
}
