"use client";

import { IsoDayInput } from "../DayInput";
import { useEffect, useState } from "react";
import { addDays, daysFrom, isoDate, type CalendarDate } from "@/lib/dates";
import { diagnosisLabel, diagnosisProblems, type Diagnosis, type Modifier, type Outcome } from "@/lib/diagnoses";
import type { DiseaseHit, ModifierHit } from "@/lib/masters/byomei";
import { OPD_DEPTS } from "@/lib/liaison";

const field = "rounded border border-rule bg-sheet p-1 text-sm";
const SITES = ["右", "左", "両側", "上", "下", "前", "後", "内", "外"];
function MasterSearch({ modifier, onPick, initial = "" }: { modifier?: "prefix" | "suffix"; onPick: (h: DiseaseHit | ModifierHit) => void; initial?: string }) {
  const [q, setQ] = useState(initial);
  const [hits, setHits] = useState<(DiseaseHit | ModifierHit)[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!q.trim()) return;
    const controller = new AbortController();
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/byomei?q=${encodeURIComponent(q)}`, { signal: controller.signal });
        if (!r.ok) throw new Error();
        const data = await r.json();
        setHits(modifier ? data.modifiers.filter((m: ModifierHit) => m.position === modifier) : data.diseases);
        setError("");
      } catch { if (!controller.signal.aborted) setError("マスターを検索できませんでした"); }
    }, 200);
    return () => { clearTimeout(t); controller.abort(); };
  }, [q, modifier]);
  return <div><input autoComplete="off" aria-label={modifier ? "修飾語を検索" : "病名を検索"} placeholder={modifier ? "修飾語を検索" : "病名・読みで検索"} className={field} value={q} onChange={e => { setQ(e.target.value); setHits([]); }} />{error && <p role="alert">{error}</p>}{q.trim() && <ul className="max-h-40 overflow-auto">{hits.map(h => <li key={h.code}><button type="button" className="w-full p-1 text-left text-sm hover:bg-paper" onClick={() => { onPick(h); setQ(""); setHits([]); }}>{h.name}　{h.code}{"icd10" in h ? `　${h.icd10}${h.notClaimable ? "　保険請求外" : ""}` : ""}</button></li>)}</ul>}</div>;
}
export function DiagnosisDetail({ initial, today, department, query, onSave, onClose }: { initial: Diagnosis; today: CalendarDate; department: string; query?: string; onSave: (d: Diagnosis) => void; onClose: () => void }) {
  const [d, setD] = useState<Diagnosis>({ ...initial, department: initial.department ?? department, encounter: initial.encounter ?? "入院", insurance: initial.insurance ?? "全保険共通" });
  const [slot, setSlot] = useState<{ side: "prefixes" | "suffixes"; index: number } | null>(null);
  const [sites, setSites] = useState<ModifierHit[] | null>(null);
  const [error, setError] = useState("");
  const patch = (p: Partial<Diagnosis>) => setD(prev => ({ ...prev, ...p }));
  const put = (side: "prefixes" | "suffixes", index: number, m?: Modifier) => { const ms = [...d[side]]; if (m) ms[index] = { code: m.code, name: m.name }; else ms.splice(index, 1); patch({ [side]: ms.filter(Boolean) }); };
  const problems = diagnosisProblems(d);
  const date = (label: string, key: "start" | "onsetDay" | "surgeryDay" | "outcomeDay") => <label>{label}<IsoDayInput className={field} value={d[key] === undefined ? "" : isoDate(addDays(today, d[key]!))} onChange={e => { const [y,m,day] = e.target.value.split("-").map(Number); patch({ [key]: e.target.value ? daysFrom(today, { y, m, d: day }) : key === "start" ? 0 : undefined }); }} /></label>;
  return <section className="space-y-4"><h3 className="font-bold">病名の詳細設定</h3>
    <MasterSearch initial={query} onPick={h => { if ("icd10" in h) patch({ code: h.code, name: h.name, icd10: h.icd10, notClaimable: h.notClaimable }); }} />
    <p className="rounded bg-paper p-2 font-bold">{d.name ? diagnosisLabel(d) : "病名を選んでください"}<span className="block text-xs font-normal">コード {d.code || "—"}　ICD-10 {d.icd10 || "—"}</span></p>
    <div className="flex gap-2"><button type="button" className={field} aria-pressed={d.suffixes.some(m => m.code === "8002")} onClick={() => { if (!d.suffixes.some(m => m.code === "8002") && d.suffixes.length >= 2) { setError("接尾語の枠を空けてください"); return; } patch({ suffixes: d.suffixes.some(m => m.code === "8002") ? d.suffixes.filter(m => m.code !== "8002") : [...d.suffixes, { code: "8002", name: "の疑い" }] }); }}>疑い</button>
    <button type="button" className={field} onClick={async () => { try { const results = await Promise.all(SITES.map(async q => { const r = await fetch(`/api/byomei?q=${encodeURIComponent(q)}`); if (!r.ok) throw new Error(); return (await r.json()).modifiers as ModifierHit[]; })); setSites(results.flat().filter((m, i, all) => SITES.includes(m.name) && all.findIndex(x => x.code === m.code) === i)); } catch { setError("部位を検索できませんでした"); } }}>部位</button></div>
    {sites && <div className="flex gap-2">{sites.map(m => <button type="button" key={m.code} className={field} onClick={() => { if (d.prefixes.length >= 2) { setError("接頭語の枠を空けてください"); return; } patch({ prefixes: [...d.prefixes, m] }); setSites(null); }}>{m.name}</button>)}</div>}
    <div className="grid grid-cols-3 gap-2">{(["prefixes", "suffixes"] as const).map(side => <div key={side} className={side === "suffixes" ? "col-start-3 row-start-1" : ""}>{[0,1].map(i => <div key={i} className="my-1"><button type="button" className={field} onClick={() => setSlot({ side, index: i })}>{side === "prefixes" ? "接頭語" : "接尾語"} {i+1}：{d[side][i]?.name || "選ぶ"}</button>{d[side][i] && <button type="button" className="ml-2 text-xs" onClick={() => put(side,i)}>外す</button>}</div>)}{d[side].slice(2).map((m,i) => <p key={i} className="text-xs">既存の修飾語：{m.name}<button type="button" onClick={() => put(side,i+2)}>外す</button></p>)}</div>)}<div className="col-start-2 row-start-1 self-center rounded bg-paper p-2 text-sm">主病名：{d.name || "未選択"}</div></div>
    {slot && <MasterSearch key={`${slot.side}-${slot.index}`} modifier={slot.side === "prefixes" ? "prefix" : "suffix"} onPick={m => { put(slot.side, slot.index, m); setSlot(null); }} />}
    <div className="flex flex-wrap gap-3"><label>主病名区分 <select className={field} value={String(d.main)} onChange={e => patch({ main: e.target.value === "true" })}><option value="false">主病名なし</option><option value="true">主病名</option></select></label>
    <label>診療科 <select className={field} value={d.department} onChange={e => patch({ department: e.target.value })}>{[...new Set([department, d.department!, ...OPD_DEPTS.map(x => x.name)])].map(x => <option key={x}>{x}</option>)}</select></label>
    <label>入外 <select className={field} value={d.encounter} onChange={e => patch({ encounter: e.target.value as Diagnosis["encounter"] })}>{["入院","外来","共通"].map(x => <option key={x}>{x}</option>)}</select></label>
    <label>保険 <select className={field} value={d.insurance} onChange={e => patch({ insurance: e.target.value as Diagnosis["insurance"] })}>{["全保険共通","主保険","公費"].map(x => <option key={x}>{x}</option>)}</select></label></div>
    <div className="flex flex-wrap gap-3">{date("開始日", "start")}{date("発症日", "onsetDay")}
    {(["effectiveFrom", "effectiveTo"] as const).map((key,i) => <label key={key}>有効年月（{i ? "終了" : "開始"}）<input type="month" className={field} value={d[key] ?? ""} onChange={e => patch({ [key]: e.target.value || undefined })}/></label>)}
    {date("手術日", "surgeryDay")}<label>区分 <select className={field} value={d.outcome} onChange={e => patch({ outcome: e.target.value as Outcome, outcomeDay: e.target.value === "継続" ? undefined : d.outcomeDay ?? 0 })}>{["継続","治癒","死亡","中止","移行"].map(x => <option key={x}>{x}</option>)}</select></label>{date("転帰日", "outcomeDay")}</div>
    <label className="block">コメント<textarea className={`${field} block w-full`} maxLength={1000} value={d.comment ?? ""} onChange={e => patch({ comment: e.target.value })} /></label>
    <label className="block text-sm"><input type="checkbox" checked={d.hideCommentOnClaim ?? false} onChange={e => patch({ hideCommentOnClaim: e.target.checked })}/> コメントをレセプトに出さない</label>


    {problems.map(p => <p key={p} className="text-sm text-shu">{p}</p>)}{error && <p role="alert">{error}</p>}
    <div className="flex gap-3"><button type="button" className="rounded bg-ai px-4 py-2 text-white disabled:opacity-40" disabled={problems.length > 0} onClick={() => onSave(d)}>登録</button><button type="button" className={field} onClick={onClose}>閉じる</button></div>
  </section>;
}

/* Help migration source (references and dynamic wording):
<p >部位はマスターの名前（右・左・両側・上・下・前・後・内・外）から選びます。有効年月は開始月から終了月まで（両端を含む）。保険の選択は模擬の記録用です。いずれも院内の取り決めです。レセプトの補足コメントは40バイト以内です。</p>
<p >区分の移行は履歴を残し算定から除きます（ORCA 病名登録マニュアル）。</p>
*/
