"use client";

import { Fragment, useState } from "react";
import type { Diagnosis } from "@/lib/diagnoses";
import type { StandingLine } from "@/lib/standing-lines";
import type { AdminRecord } from "@/lib/mar";
import type { Patient, OrderEntry } from "@/lib/types";
import { can, denyReason, type Staff } from "@/lib/roles";
import { antibioticMonitoring, infectionRank, latestRecords, toggleSpecialistRow, OHAT, ohatTotal, dotFor, equipmentOf, antibioticsOf, infectionFlags, oralFlags, appendRecord, type SpecialistRecord, type SpecialistScreen } from "@/lib/specialist";

import { DayInput } from "./DayInput";
import { TimeInput } from "./TimeInput";
import { addDays, daysFrom, isoDate, todayInTokyo, nowTimeInTokyo } from "@/lib/dates";

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
  const [opened, setOpened] = useState<string | null>(null);
  const [error, setError] = useState("");
  const save = (r: Omit<SpecialistRecord, "id" | "by">) => {
    if (!can(props.me.role, `${props.screen}.record`)) return;
    const record = { ...r, id: crypto.randomUUID(), by: props.me.name };
    try {
      const next = appendRecord(records, record);
      localStorage.setItem(KEY, JSON.stringify(next));
      setRecords(next); setError(""); setOpened(null);
      props.onNote(r.patientId, `【${{ equipment: "臨床工学技士の記録", infection: "ICT ラウンド", oral: "口腔ケア・申し送り（医師・看護師宛）" }[r.screen]}】${r.at}\n${r.text}`);
      if (r.screen === "infection") props.onRound(r.patientId, r.text);
    } catch { setError("保存できませんでした。入力内容と端末の保存容量を確認してください。"); }
  };
  const today = isoDate(todayInTokyo());
  const flagsOf = (p: Patient, entries: OrderEntry[]) => oralFlags(p, entries, props.surgeryIds.includes(p.id), props.standingLines[p.id], props.nowTime, props.diagnoses?.[p.id]?.filter(d => d.outcome === "継続" && d.start <= 0 && !d.auto).map(d => d.name));
  const people = props.people.filter(x => !x.patient.dischargedAt);
  const rows = people.flatMap(({ patient: p, entries }) => {
    const devices = props.screen === "equipment" ? equipmentOf(entries, props.standingLines[p.id], props.nowTime) : [undefined];
    if (props.screen === "infection" && !infectionFlags(p).length && !antibioticsOf(entries).length) return [];
    return devices.map(device => {
      const history = latestRecords(records.filter(r => r.patientId === p.id && r.screen === props.screen && (!device || r.equipmentId === device.id)));
      const assessments = history.filter(r => r.scores);
      const done = history.some(r => r.at.slice(0, 10) === today && r.at <= `${today}T${nowTimeInTokyo()}` && (props.screen !== "oral" || r.care || !r.scores));
      return { p, entries, device, history, assessments, done, key: `${props.screen}:${p.id}:${device?.id ?? ""}` };
    });
  }).sort((a, b) => props.screen === "infection" ? infectionRank(a.p, a.entries) - infectionRank(b.p, b.entries) : Number(a.done) - Number(b.done) || (props.screen === "oral" ? Number(!!a.assessments.length) - Number(!!b.assessments.length) || flagsOf(b.p, b.entries).priority.length - flagsOf(a.p, a.entries).priority.length : 0));
  const abxPeople = people.map(x => ({ ...x, abx: antibioticsOf(x.entries) }));
  return <section className="h-full overflow-auto bg-paper p-5"><h1 className="mb-3 text-lg font-bold">{{ equipment: "医療機器", infection: "感染対策", oral: "口腔ケア" }[props.screen]}</h1>{error && <p role="alert" className="text-shu">{error}</p>}
    {props.screen === "infection" && <p className="mb-3 text-sm">耐性菌 {people.filter(x => infectionFlags(x.patient).length).length} 人 ／ 抗MRSA薬 {abxPeople.filter(x => x.abx.some(a => a.kind.includes("抗MRSA"))).length} 人 ／ 広域 {abxPeople.filter(x => x.abx.some(a => a.kind && !a.kind.includes("抗MRSA"))).length} 人 ／ 培養未提出で抗菌薬使用中 {abxPeople.filter(x => x.abx.some(a => !antibioticMonitoring(x.patient, a.startDay).culture)).length} 人</p>}
    <table className="w-full text-left text-sm"><thead><tr><th>部屋</th><th>氏名</th>{props.screen === "equipment" ? <><th>機器</th><th>最後の点検（日時・結果・者）</th><th>今日の点検</th></> : props.screen === "oral" ? <><th>優先の理由</th><th>最後の OHAT-J</th><th>前回比</th><th>今日のケア</th></> : <><th>耐性菌・抗菌薬</th><th>ラウンド</th></>}</tr></thead><tbody>
      {rows.map(({ p, entries, device, history, assessments, done, key }) => <Fragment key={key}>
        <tr className="cursor-pointer border-t border-rule hover:bg-paper" onClick={() => setOpened(toggleSpecialistRow(opened, key))}>
          <td className="p-2">{p.room}</td><td><button aria-expanded={opened === key} aria-controls={`form-${key}`} onClick={e => { e.stopPropagation(); setOpened(toggleSpecialistRow(opened, key)); }} className="text-ai underline">{p.name}</button></td>
          {props.screen === "equipment" ? <><td>{device?.label}</td><td>{history[0] ? `${history[0].at.replace("T", " ")} ${history[0].result ?? history[0].text} ${history[0].by}` : "未点検"}</td><td>{done ? "済" : "未"}</td></> : props.screen === "oral" ? <><td>{flagsOf(p, entries).priority.join("・") || "—"}</td><td>{assessments[0] ? `${ohatTotal(assessments[0].scores!)}/16（${assessments[0].at.slice(0, 10)}）` : "未評価"}</td><td>{assessments.length > 1 ? `${ohatTotal(assessments[0].scores!) - ohatTotal(assessments[1].scores!) > 0 ? "+" : ""}${ohatTotal(assessments[0].scores!) - ohatTotal(assessments[1].scores!)}` : "—"}</td><td>{done ? "済" : "未"}</td></> : <><td>{infectionFlags(p).map(f => f.text).join("・")} {antibioticsOf(entries).map(a => `${a.names}${a.kind ? `【${a.kind}】` : ""}`).join("・")}</td><td>{history[0]?.at.replace("T", " ") ?? "未記録"}</td></>}
        </tr>
        {props.screen === "infection" && <tr><td colSpan={4}><InfectionDetails patient={p} entries={entries} administrations={props.administrations} /></td></tr>}
        {opened === key && <tr id={`form-${key}`}><td colSpan={props.screen === "oral" ? 6 : props.screen === "equipment" ? 5 : 4}><PatientWork key={key} {...props} patient={p} entries={entries} initialDeviceId={device?.id} records={history} save={save} /></td></tr>}
      </Fragment>)}
    </tbody></table>{!rows.length && <p className="p-3 text-sm">対象の患者はいません。</p>}
  </section>;
}
function InfectionDetails({ patient: p, entries, administrations }: { patient: Patient; entries: OrderEntry[]; administrations: AdminRecord[] }) {
  const antibiotics = antibioticsOf(entries);
  return <>{infectionFlags(p).map((r, i) => <p key={i}>{r.specimen} {r.text}：{r.precaution}</p>)}{antibiotics.length > 0 && <table className="my-2 w-full text-left text-sm"><thead><tr><th>抗菌薬</th><th>区分</th><th>使用日数</th><th>使用中の培養</th><th>薬物血中濃度測定（TDM）</th></tr></thead><tbody>{antibiotics.map(a => { const monitoring = antibioticMonitoring(p, a.startDay); return <tr key={`${a.id}:${a.code}`}><td>{a.names}</td><td>{a.kind || "—"}</td><td>開始から {a.days}日目 ／ DOT {dotFor(antibiotics.filter(b => b.code === a.code).map(b => b.id), p.id, administrations)}日（実施記録）</td><td>{monitoring.culture ? "あり" : "なし"}</td><td>{monitoring.tdm ? "あり" : "結果なし"}</td></tr>; })}</tbody></table>}</>;
}

function PatientWork({ patient: p, entries, records, save, initialDeviceId, ...props }: Props & { patient: Patient; entries: OrderEntry[]; initialDeviceId?: string; records: SpecialistRecord[]; save: (r: Omit<SpecialistRecord, "id" | "by">) => void }) {
  const [scores, setScores] = useState<number[]>(Array(8).fill(-1));
  const [kind, setKind] = useState("始業点検");
  const [deviceId, setDeviceId] = useState(initialDeviceId ?? "");
  const [result, setResult] = useState("異常なし");
  const [text, setText] = useState("");
  const [at, setAt] = useState(() => `${isoDate(todayInTokyo())}T${nowTimeInTokyo()}`);
  const [start, setStart] = useState(""); const [end, setEnd] = useState("");
  const [uf, setUf] = useState(""); const [qb, setQb] = useState(""); const [anticoag, setAnticoag] = useState("");
  const [oralKind, setOralKind] = useState("OHAT-J 評価");
  const equipment = equipmentOf(entries, props.standingLines[p.id], props.nowTime);
  const denied = denyReason(props.me.role, `${props.screen}.record`);
  const selected = equipment.find(e => e.id === deviceId);
  const total = scores.every(s => s >= 0) ? ohatTotal(scores) : null;
  const valid = props.screen === "equipment" ? !!selected && (kind !== "透析実施" || (!!selected.hd && !!start && !!end && end >= start && uf !== "" && Number(uf) >= 0 && qb !== "" && Number(qb) > 0 && !!anticoag.trim())) && (result !== "異常あり" || !!text.trim()) : props.screen === "oral" && oralKind === "OHAT-J 評価" ? total !== null : !!text.trim();
  return <article className="mb-4 rounded border border-rule bg-sheet p-4"><button className="font-bold text-ai underline" onClick={() => props.onOpen(p.id)}>{p.room} {p.name}</button>
    <fieldset disabled={!!denied} title={denied ?? undefined} className="mt-3 flex flex-wrap items-end gap-3 disabled:opacity-50">
      <label>記録日時<RecordTime value={at} onChange={setAt} label="記録" /></label>
      {props.screen === "equipment" && <><label>機器<select className="block border border-rule p-1" disabled={!!initialDeviceId} value={deviceId} onChange={e => setDeviceId(e.target.value)}><option value="">選択</option>{equipment.map(e => <option key={e.id} value={e.id}>{e.label}</option>)}</select></label><label>記録<select className="block border border-rule p-1" value={kind} onChange={e => setKind(e.target.value)}>{["始業点検", "使用中点検", "透析実施"].map(k => <option key={k}>{k}</option>)}</select></label>{kind !== "透析実施" ? <label>結果<select className="block border border-rule p-1" value={result} onChange={e => setResult(e.target.value)}><option>異常なし</option><option>異常あり</option></select></label> : <>{[["開始", start, setStart], ["終了", end, setEnd]].map(([label, value, setter]) => <label key={String(label)}>{String(label)}<RecordTime value={String(value)} onChange={setter as (s: string) => void} label={String(label)} /></label>)}<label>除水量 L<input className="block border border-rule p-1" type="number" min="0" step="0.1" value={uf} onChange={e => setUf(e.target.value)} /></label><label>血流量 mL/分<input className="block border border-rule p-1" type="number" min="1" value={qb} onChange={e => setQb(e.target.value)} /></label><label>抗凝固薬・量<input className="block border border-rule p-1" value={anticoag} onChange={e => setAnticoag(e.target.value)} /></label></>}</>}
      {props.screen === "oral" && <><label>記録<select className="block border border-rule p-1" value={oralKind} onChange={e => setOralKind(e.target.value)}><option>OHAT-J 評価</option><option>ケア実施・申し送り</option></select></label>{oralKind === "OHAT-J 評価" && <div className="flex w-full flex-wrap gap-3">{OHAT.map((label, i) => <label key={label}>{label}<select className="block border border-rule p-1" value={scores[i]} onChange={e => setScores(old => old.map((v, j) => j === i ? Number(e.target.value) : v))}><option value={-1}>未評価</option>{[0, 1, 2].map(v => <option key={v}>{v}</option>)}</select></label>)}<span>合計 {total ?? "未評価"} /16</span></div>}</>}
      <label className="w-full">{props.screen === "infection" ? "ICT ラウンド・主治医への連絡" : "実施内容・コメント・申し送り"}<textarea className="block w-full border border-rule p-2" value={text} onChange={e => setText(e.target.value)} /></label>
      <button className="rounded bg-ai px-3 py-2 text-white disabled:opacity-40" disabled={!valid || !at} onClick={() => {
        if (!valid || denied) return;
        const body = props.screen === "equipment" ? `${selected!.label} ${kind}：${kind === "透析実施" ? `${start}〜${end}、除水量 ${uf} L、血流量 ${qb} mL/分、抗凝固薬 ${anticoag}` : result} ${text}` : props.screen === "oral" && oralKind === "OHAT-J 評価" ? `OHAT-J ${OHAT.map((k, i) => `${k} ${scores[i]}`).join("・")} 合計 ${total}/16 ${text}` : text;
        save({ patientId: p.id, screen: props.screen, at, text: body, care: props.screen === "oral" && oralKind === "ケア実施・申し送り", ...(props.screen === "equipment" ? { equipmentId: deviceId, result: kind === "透析実施" ? "透析実施" : result } : {}), ...(props.screen === "oral" && oralKind === "OHAT-J 評価" ? { scores: [...scores] } : {}) });
      }}>記録を保存</button>
    </fieldset>
    {records.length > 0 && <ol className="mt-3 space-y-2 border-t border-rule pt-2 text-sm">{records.slice().reverse().map(r => <li key={r.id}><time>{r.at.replace("T", " ")}</time> {r.by} {r.scores && <strong>OHAT-J {ohatTotal(r.scores)}/16 </strong>}<p className="whitespace-pre-wrap">{r.text}</p></li>)}</ol>}
  </article>;
}

function RecordTime({ value, onChange, label }: { value: string; onChange: (s: string) => void; label: string }) {
  const today = todayInTokyo();
  const [date, time = ""] = value.split("T");
  const [y, m, d] = (date || isoDate(today)).split("-").map(Number);
  return <span className="flex gap-2"><DayInput label={`${label}日`} today={today} value={date ? daysFrom(today, { y, m, d }) : null} onChange={day => onChange(`${isoDate(addDays(today, day))}T${time}`)} /><TimeInput aria-label={`${label}時刻`} value={time} onChange={e => onChange(`${date || isoDate(today)}T${e.target.value}`)} /></span>;
}
