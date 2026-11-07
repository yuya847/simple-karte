"use client";
import { useState } from "react";
import { InjectionDiluentChoice } from "./panels/InjectionDiluentChoice";
import { ABX_RENAL, MEPM_INDICATIONS, NOT_LISTED, abxInjection, dialysisFromOrders, mepmBase, renalFunction, renalRow, renalWeight, rowDose, type WeightKind } from "@/lib/abx-renal";
import { diluentChoices } from "@/lib/inj-diluent";
import { latestCre } from "@/lib/exams";
import { addDays, formatShort, type CalendarDate } from "@/lib/dates";
import type { HistoryEntry, InjectionOrder, Patient } from "@/lib/types";

const field = "rounded border border-rule bg-sheet px-2 py-1";
const valueText = (v: number | null) => v === null ? "—" : v.toFixed(1);
export function AbxRenalWindow({ patient, entries, today, canOrder, onOrder, onTdm }: { patient: Patient; entries: HistoryEntry[]; today: CalendarDate; canOrder: boolean; onOrder: (order: InjectionOrder) => void; onTdm: () => void }) {
  const [weightKind, setWeightKind] = useState<WeightKind>("actual");
  const [query, setQuery] = useState("");
  const [code, setCode] = useState("");
  const [indication, setIndication] = useState("");
  const [daily, setDaily] = useState("");
  const [count, setCount] = useState("");
  const [phase, setPhase] = useState<"first" | "maintenance" | "">("");
  const [day, setDay] = useState("");
  const [time, setTime] = useState("");
  const [saline, setSaline] = useState<number | null>(null);
  const cre = latestCre(patient);
  const weight = renalWeight(patient, weightKind);
  const renal = renalFunction(patient.age, patient.sex, weight, cre?.value ?? null);
  const dialysis = dialysisFromOrders(entries);
  const item = ABX_RENAL.find(d => d.code === code);
  const row = item ? renalRow(item, renal.ccr, dialysis) : null;
  const base = item?.family === "MEPM" ? mepmBase(indication, Number(daily), Number(count)) : null;
  const mg = row ? rowDose(row, base) : null;
  const ready = item && row && mg !== null && phase && day !== "" && time;
  const order = ready ? abxInjection(item, renal.ccr, dialysis, base, phase, { day: Number(day), time }, saline) : null;
  const selectedMg = phase === "first" && row?.firstMg ? row.firstMg : mg;
  const volumes = item && selectedMg ? diluentChoices([{ drugCode: item.code, amount: String(selectedMg), unit: "mg" }], "点滴静注") : [];
  const changeDrug = (next: string) => { setCode(next); setIndication(""); setDaily(""); setCount(""); setPhase(""); setDay(""); setTime(""); setSaline(null); };
  return <div className="max-h-[75vh] space-y-3 overflow-auto p-3 text-sm" aria-label="抗菌薬の量（模擬）">
    <div className="rounded border border-rule bg-paper p-3">
      <p>{patient.age}歳・{patient.sex}・{patient.weightKg}kg・{patient.heightCm}cm</p>
      <p>Cre {cre ? `${cre.value} mg/dL（${formatShort(addDays(today, cre.day))}）` : "未測定"}{dialysis && <b className="ml-2 text-shu">{dialysis}</b>}</p>
      <label>計算の体重 <select aria-label="計算の体重" value={weightKind} onChange={e => setWeightKind(e.target.value as WeightKind)} className={field}><option value="actual">実体重</option><option value="ideal">理想体重</option><option value="adjusted">補正体重</option></select> {valueText(weight)} kg</label>
      <p className="mt-2 text-xl font-bold">CCr {valueText(renal.ccr)} mL/min</p>
      <p>eGFR {valueText(renal.egfr)} mL/min/1.73m²</p>
      <p className="text-xs text-ink-soft">CG式：(140−年齢)×体重÷(72×Cre){patient.sex === "女" ? "×0.85" : ""}</p>
      <p className="text-xs text-ink-soft">eGFR：194×Cre⁻¹·⁰⁹⁴×年齢⁻⁰·²⁸⁷{patient.sex === "女" ? "×0.739" : ""}</p>
    </div>
    <label className="block">抗菌薬 <input autoComplete="off" aria-label="抗菌薬を検索" placeholder="薬品名・略語" value={query} onChange={e => setQuery(e.target.value)} className={`${field} ml-2`} /></label>
    <select aria-label="抗菌薬を選ぶ" value={code} onChange={e => changeDrug(e.target.value)} className={`${field} w-full`}><option value="">選んでください</option>{ABX_RENAL.filter(d => `${d.name} ${d.abbreviation}`.normalize("NFKC").toLowerCase().includes(query.normalize("NFKC").toLowerCase())).map(d => <option key={d.code} value={d.code}>{d.abbreviation}・{d.name}（{d.route}）</option>)}</select>
    {item && <>
      <a href={item.source.url} target="_blank" rel="noreferrer" title={`${item.source.version}／${item.source.sections}／確認日 ${item.source.checked}`} className="text-xs text-ai underline">出典</a>
      <p className="text-xs text-ink-soft">6節：{item.usual}</p>
      {item.family === "MEPM" && <div className="flex flex-wrap gap-2"><select aria-label="適応" value={indication} onChange={e => { setIndication(e.target.value); setPhase(""); }} className={field}><option value="">適応を選ぶ</option>{MEPM_INDICATIONS.map(i => <option key={i}>{i}</option>)}</select><label>通常の1日量 <input aria-label="通常の1日量" type="number" min="0" step="0.1" value={daily} onChange={e => setDaily(e.target.value)} className={`${field} w-20`} /> g</label><select aria-label="通常の分割回数" value={count} onChange={e => setCount(e.target.value)} className={field}><option value="">分割回数</option><option value="2">2回</option><option value="3">3回</option></select>{base === null && <span className="text-xs">6節の範囲で入力</span>}</div>}
      <section className="rounded border border-ai bg-mizu-soft p-3" aria-label="該当する用量">
        {item.tdm ? <><p className="text-xl font-bold">TDMで調整</p><button type="button" className={`${field} mt-2`} onClick={onTdm}>TDM（治療薬物モニタリング）へ</button></> : row ? <><p>CCr {row.label}</p><p className="text-2xl font-bold">{mg === null ? "通常量を入力" : `${Number(mg.toFixed(3))} mg／回`}・{row.hours}時間ごと</p><p>{row.hours === 48 ? "2日に1回・投与日250mg（非投与日0mg）" : `1日${24 / row.hours}回・${mg === null ? "—" : Number((mg * 24 / row.hours).toFixed(3))} mg/日`}</p>{row.firstMg && <p className="mt-2 font-bold">初日 {row.firstMg}mgを1回／{row.maintenanceDay}日目以降の維持量を上に表示</p>}</> : <p className="text-xl font-bold">{renal.ccr === null && !dialysis ? "腎機能を計算できません" : NOT_LISTED}</p>}
      </section>
      <table className="w-full text-left text-xs"><caption className="text-left">CCr（mL/min）</caption><thead><tr><th>区分</th><th>1回量</th><th>間隔</th></tr></thead><tbody>{item.rows.map(r => <tr key={r.label} className={row === r ? "bg-mizu-soft font-bold" : "border-t border-rule"}><td className="py-2">{r.label}</td><td>{r.mg ? `${r.mg}mg` : `通常の1回量×${r.factor}`}{r.firstMg && <small className="block">初日{r.firstMg}mg・{r.maintenanceDay}日目以降</small>}</td><td>{r.hours}時間ごと</td></tr>)}{!item.rows.length && <tr><td colSpan={3}>{NOT_LISTED}{item.tdm ? "（7.2の図は出典で確認）" : "（CCr別の量・間隔）"}</td></tr>}<tr><td>HD</td><td colSpan={2}>{item.hd ?? NOT_LISTED}</td></tr><tr><td>CHDF</td><td colSpan={2}>{item.chdf ?? NOT_LISTED}</td></tr></tbody></table>
      {item.route === "注射" && row && mg !== null && <div className="space-y-2 border-t border-rule pt-3">
        <select aria-label="初回か維持量か" value={phase} onChange={e => { setPhase(e.target.value as typeof phase); setSaline(null); }} className={field}><option value="">投与する量を選ぶ</option>{row.firstMg && <option value="first">初日 {row.firstMg}mgを1回</option>}<option value="maintenance">{row.firstMg ? `${row.maintenanceDay}日目以降の維持量` : "この量"}</option></select>
        <label className="block">開始 <input aria-label="開始日（今日からの日数）" type="number" min={0} value={day} onChange={e => setDay(e.target.value)} className={`${field} w-16`} /> 日後 <input aria-label="投与開始時刻" type="time" value={time} onChange={e => setTime(e.target.value)} className={field} /></label>
        {row.firstMg && phase === "maintenance" && <p className="text-xs">治療の初日から数え、維持量を投与する日か確認</p>}
        {volumes.length > 0 && <div><InjectionDiluentChoice volumes={volumes} onChoose={setSaline} />{saline !== null && <p className="text-xs">生食 {saline}mL を入れる</p>}</div>}
        <button type="button" disabled={!canOrder || !order} onClick={() => { if (order && canOrder) onOrder(order); }} className="rounded bg-ai px-3 py-2 text-white disabled:opacity-40">この量で注射オーダへ</button>
      </div>}
    </>}
  </div>;
}
