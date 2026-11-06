"use client";

import { useState } from "react";
import type { Diagnosis } from "@/lib/diagnoses";
import type { StandingLine } from "@/lib/standing-lines";
import type { AdminRecord } from "@/lib/mar";
import type { Patient, OrderEntry } from "@/lib/types";
import { can, denyReason, type Staff } from "@/lib/roles";
import { OHAT, ohatTotal, dotFor, equipmentOf, antibioticsOf, infectionFlags, oralFlags, appendRecord, type SpecialistRecord, type SpecialistScreen } from "@/lib/specialist";

interface Props {
  screen: SpecialistScreen;
  administrations: AdminRecord[];
  standingLines: Record<string, StandingLine[]>;
  nowTime: string;
  diagnoses?: Record<string, Diagnosis[]>;
  people: { patient: Patient; entries: OrderEntry[] }[];
  surgeryIds: string[];
  me: Staff;
  onOpen: (id: string) => void;
  onNote: (id: string, text: string) => void;
  onRound: (id: string, text: string) => void;
}
const KEY = "simple-karte-specialist-v1";
export function SpecialistBoard(props: Props) {
  const [records, setRecords] = useState<SpecialistRecord[]>(() => {
    try { const v: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]"); return Array.isArray(v) ? v.filter((r): r is SpecialistRecord => !!r && typeof r.text === "string" && typeof r.patientId === "string" && typeof r.at === "string" && typeof r.by === "string" && (!r.scores || (Array.isArray(r.scores) && r.scores.length === 8 && r.scores.every((s: unknown) => Number.isInteger(s) && Number(s) >= 0 && Number(s) <= 2)))) : []; } catch { return []; }
  });
  const [error, setError] = useState("");
  const save = (r: Omit<SpecialistRecord, "id" | "by">) => {
    if (!can(props.me.role, `${props.screen}.record`)) return;
    const record = { ...r, id: crypto.randomUUID(), by: props.me.name };
    try {
      const next = appendRecord(records, record);
      localStorage.setItem(KEY, JSON.stringify(next));
      setRecords(next); setError("");
      props.onNote(r.patientId, `【${{ equipment: "臨床工学技士の記録", infection: "ICT ラウンド", oral: "口腔ケア・申し送り（医師・看護師宛）" }[r.screen]}】${r.at}\n${r.text}`);
      if (r.screen === "infection") props.onRound(r.patientId, r.text);
    } catch { setError("保存できませんでした。入力内容と端末の保存容量を確認してください。"); }
  };
  const people = props.people.filter(x => !x.patient.dischargedAt).slice().sort((a, b) => props.screen === "oral" ? oralFlags(b.patient, b.entries, props.surgeryIds.includes(b.patient.id), props.standingLines[b.patient.id], props.nowTime, props.diagnoses?.[b.patient.id]?.filter(d => d.outcome === "継続").map(d => d.name)).priority.length - oralFlags(a.patient, a.entries, props.surgeryIds.includes(a.patient.id), props.standingLines[a.patient.id], props.nowTime, props.diagnoses?.[a.patient.id]?.filter(d => d.outcome === "継続").map(d => d.name)).priority.length : 0);
  return <section className="h-full overflow-auto bg-paper p-5"><h1 className="mb-3 text-lg font-bold">{{ equipment: "医療機器", infection: "感染対策", oral: "口腔ケア" }[props.screen]}</h1>{error && <p role="alert" className="text-shu">{error}</p>}
    {props.screen === "infection" && <p className="hint">予防策と薬剤の使用は医師が判断します。</p>}
    {people.map(({ patient: p, entries }) => <PatientWork key={`${props.screen}:${p.id}`} {...props} patient={p} entries={entries} records={records.filter(r => r.patientId === p.id && r.screen === props.screen)} save={save} />)}
  </section>;
}
function PatientWork({ patient: p, entries, records, save, ...props }: Props & { patient: Patient; entries: OrderEntry[]; records: SpecialistRecord[]; save: (r: Omit<SpecialistRecord, "id" | "by">) => void }) {
  const [scores, setScores] = useState<number[]>(Array(8).fill(-1));
  const [kind, setKind] = useState("始業点検");
  const [deviceId, setDeviceId] = useState("");
  const [result, setResult] = useState("異常なし");
  const [text, setText] = useState("");
  const [at, setAt] = useState(() => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); });
  const [start, setStart] = useState(""); const [end, setEnd] = useState("");
  const [uf, setUf] = useState(""); const [qb, setQb] = useState(""); const [anticoag, setAnticoag] = useState("");
  const [oralKind, setOralKind] = useState("OHAT-J 評価");
  const equipment = equipmentOf(entries, props.standingLines[p.id], props.nowTime); const antibiotics = antibioticsOf(entries); const infections = infectionFlags(p);
  const flags = oralFlags(p, entries, props.surgeryIds.includes(p.id), props.standingLines[p.id], props.nowTime, props.diagnoses?.[p.id]?.filter(d => d.outcome === "継続").map(d => d.name));
  const denied = denyReason(props.me.role, `${props.screen}.record`);
  if (props.screen === "equipment" && !equipment.length && !records.length) return null;
  if (props.screen === "infection" && !antibiotics.length && !infections.length && !records.length) return null;
  const selected = equipment.find(e => e.id === deviceId);
  const total = scores.every(s => s >= 0) ? ohatTotal(scores) : null;
  const valid = props.screen === "equipment" ? !!selected && (kind !== "透析実施" || (!!selected.hd && !!start && !!end && end >= start && uf !== "" && Number(uf) >= 0 && qb !== "" && Number(qb) > 0 && !!anticoag.trim())) && (result !== "異常あり" || !!text.trim()) : props.screen === "oral" && oralKind === "OHAT-J 評価" ? total !== null : !!text.trim();
  return <article className="mb-4 rounded border border-rule bg-sheet p-4"><button className="font-bold text-ai underline" onClick={() => props.onOpen(p.id)}>{p.room} {p.name}</button>
    {props.screen === "equipment" && <><ul>{equipment.map(e => <li key={e.id}>{e.label}{e.hd && `：${e.hd.minutes}分・除水 ${e.hd.uf} L・血流 ${e.hd.qb} mL/分・${e.hd.anticoag.drug} 初回 ${e.hd.anticoag.initial ?? "—"}／持続 ${e.hd.anticoag.hourly ?? "—"}`}</li>)}</ul></>}
    {props.screen === "infection" && <><table className="my-2 w-full text-left text-sm"><thead><tr><th>培養</th><th>予防策</th></tr></thead><tbody>{infections.map((r, i) => <tr key={i}><td>{r.specimen} {r.text}</td><td>{r.precaution}</td></tr>)}</tbody></table><table className="my-2 w-full text-left text-sm"><thead><tr><th>抗菌薬</th><th>区分</th><th>使用</th><th>培養</th><th>薬物血中濃度測定（TDM）</th></tr></thead><tbody>{antibiotics.map(a => <tr key={a.id}><td>{a.names}</td><td>{a.kind}</td><td>処方 {a.days}日目／DOT {dotFor(antibiotics.filter(b => b.names === a.names).map(b => b.id), p.id, props.administrations)}日（保存済の実施記録）</td><td>{p.cultures.length ? "あり" : "なし"}</td><td>{p.labs.some(l => /VCM|バンコマイシン|テイコ|血中濃度/i.test(JSON.stringify(l))) ? "あり" : "結果なし"}</td></tr>)}</tbody></table></>}
    {props.screen === "oral" && <p className="my-2 text-sm">{flags.priority.join("・")}{flags.management && " ／ 周術期等口腔機能管理の対象候補"}</p>}
    <fieldset disabled={!!denied} title={denied ?? undefined} className="mt-3 flex flex-wrap items-end gap-3 disabled:opacity-50">
      <label>記録日時<input className="block border border-rule p-1" type="datetime-local" value={at} onChange={e => setAt(e.target.value)} /></label>
      {props.screen === "equipment" && <><label>機器<select className="block border border-rule p-1" value={deviceId} onChange={e => setDeviceId(e.target.value)}><option value="">選択</option>{equipment.map(e => <option key={e.id} value={e.id}>{e.label}</option>)}</select></label><label>記録<select className="block border border-rule p-1" value={kind} onChange={e => setKind(e.target.value)}>{["始業点検", "使用中点検", "透析実施"].map(k => <option key={k}>{k}</option>)}</select></label>{kind !== "透析実施" ? <label>結果<select className="block border border-rule p-1" value={result} onChange={e => setResult(e.target.value)}><option>異常なし</option><option>異常あり</option></select></label> : <>{[["開始", start, setStart], ["終了", end, setEnd]].map(([label, value, setter]) => <label key={String(label)}>{String(label)}<input className="block border border-rule p-1" type="datetime-local" value={String(value)} onChange={e => (setter as (s: string) => void)(e.target.value)} /></label>)}<label>除水量 L<input className="block border border-rule p-1" type="number" min="0" step="0.1" value={uf} onChange={e => setUf(e.target.value)} /></label><label>血流量 mL/分<input className="block border border-rule p-1" type="number" min="1" value={qb} onChange={e => setQb(e.target.value)} /></label><label>抗凝固薬・量<input className="block border border-rule p-1" value={anticoag} onChange={e => setAnticoag(e.target.value)} /></label></>}</>}
      {props.screen === "oral" && <><label>記録<select className="block border border-rule p-1" value={oralKind} onChange={e => setOralKind(e.target.value)}><option>OHAT-J 評価</option><option>ケア実施・申し送り</option></select></label>{oralKind === "OHAT-J 評価" && <div className="flex w-full flex-wrap gap-3">{OHAT.map((label, i) => <label key={label}>{label}<select className="block border border-rule p-1" value={scores[i]} onChange={e => setScores(old => old.map((v, j) => j === i ? Number(e.target.value) : v))}><option value={-1}>未評価</option>{[0, 1, 2].map(v => <option key={v}>{v}</option>)}</select></label>)}<span>合計 {total ?? "未評価"} /16</span></div>}</>}
      <label className="w-full">{props.screen === "infection" ? "ICT ラウンド・主治医への連絡" : "実施内容・コメント・申し送り"}<textarea className="block w-full border border-rule p-2" value={text} onChange={e => setText(e.target.value)} /></label>
      <button className="rounded bg-ai px-3 py-2 text-white disabled:opacity-40" disabled={!valid || !at} onClick={() => {
        if (!valid || denied) return;
        const body = props.screen === "equipment" ? `${selected!.label} ${kind}：${kind === "透析実施" ? `${start}〜${end}、除水量 ${uf} L、血流量 ${qb} mL/分、抗凝固薬 ${anticoag}` : result} ${text}` : props.screen === "oral" && oralKind === "OHAT-J 評価" ? `OHAT-J ${OHAT.map((k, i) => `${k} ${scores[i]}`).join("・")} 合計 ${total}/16 ${text}` : text;
        save({ patientId: p.id, screen: props.screen, at, text: body, ...(props.screen === "equipment" ? { equipmentId: deviceId } : {}), ...(props.screen === "oral" && oralKind === "OHAT-J 評価" ? { scores: [...scores] } : {}) });
      }}>記録を保存</button>
    </fieldset>
    {records.length > 0 && <ol className="mt-3 space-y-2 border-t border-rule pt-2 text-sm">{records.slice().reverse().map(r => <li key={r.id}><time>{r.at.replace("T", " ")}</time> {r.by} {r.scores && <strong>OHAT-J {ohatTotal(r.scores)}/16 </strong>}<p className="whitespace-pre-wrap">{r.text}</p></li>)}</ol>}
  </article>;
}
