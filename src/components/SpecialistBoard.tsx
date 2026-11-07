"use client";

import { useWindowEntry } from "@/lib/window-entry";
import { boardEquipment } from "@/lib/equipment-board";
import type { IcuRecords } from "@/lib/icu/types";
import type { VentSetting } from "@/lib/icu/types";
import { Fragment, useState } from "react";
import type { Diagnosis } from "@/lib/diagnoses";
import type { StandingLine } from "@/lib/standing-lines";
import type { AdminRecord } from "@/lib/mar";
import type { Patient, OrderEntry } from "@/lib/types";
import { can, denyReason, type Staff } from "@/lib/roles";
import { equipmentRecordProblems } from "@/lib/equipment-record";
import { compareOralPatients, antibioticMonitoring, infectionRank, latestRecords, toggleSpecialistRow, OHAT, ohatTotal, dotFor, antibioticsOf, infectionFlags, oralFlags, appendRecord, type SpecialistRecord, type SpecialistScreen } from "@/lib/specialist";

import { DayInput } from "./DayInput";
import { TimeInput } from "./TimeInput";
import { addDays, daysFrom, isoDate, todayInTokyo, nowTimeInTokyo } from "@/lib/dates";

interface Props {
  vents?: VentSetting[];
  screen: SpecialistScreen;
  icu?: IcuRecords;
  beds?: { patientId?: string; room: string; bed: string }[];
  administrations: AdminRecord[];
  standingLines: Record<string, StandingLine[]>;
  nowTime: string;
  diagnoses?: Record<string, Diagnosis[]>;
  people: { patient: Patient; entries: OrderEntry[] }[];
  surgeryIds: string[];
  me: Staff;
  onOpen: (id: string) => void;
  onReview?: (id: string) => void;
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
    if (!can(props.me.role, `${props.screen}.record`)) return false;
    const record = { ...r, id: crypto.randomUUID(), by: props.me.name };
    try {
      const next = appendRecord(records, record);
      localStorage.setItem(KEY, JSON.stringify(next));
      setRecords(next); setError(""); setOpened(null);
      props.onNote(r.patientId, `【${{ equipment: "臨床工学技士の記録", infection: "ICT ラウンド", oral: "口腔ケア・申し送り（医師・看護師宛）" }[r.screen]}】${r.at}\n${r.text}`);
      if (r.screen === "infection") props.onRound(r.patientId, r.text);
      return true;
    } catch { setError("保存できませんでした。入力内容と端末の保存容量を確認してください。"); return false; }
  };
  const today = isoDate(todayInTokyo());
  const flagsOf = (p: Patient, entries: OrderEntry[]) => oralFlags(p, entries, props.surgeryIds.includes(p.id), props.standingLines[p.id], props.nowTime, props.diagnoses?.[p.id]?.filter(d => d.outcome === "継続" && d.start <= 0 && !d.auto).map(d => d.name), props.vents);
  const people = props.people.filter(x => !x.patient.dischargedAt).map(x => { const bed = props.beds?.find(b => b.patientId === x.patient.id); return bed ? { ...x, patient: { ...x.patient, room: `${bed.room}${bed.bed}` } } : x; });
  const rows = people.flatMap(({ patient: p, entries }) => {
    const devices = props.screen === "equipment" ? boardEquipment(p.id, entries, props.standingLines[p.id], props.nowTime, props.icu) : [undefined];
    if (props.screen === "infection" && !infectionFlags(p).length && !antibioticsOf(entries).length) return [];
    return devices.map(device => {
      const history = latestRecords(records.filter(r => r.patientId === p.id && r.screen === props.screen && (!device || (r.equipmentId === device.id || device.aliases?.includes(r.equipmentId ?? "")))));
      const assessments = history.filter(r => r.scores);
      const done = history.some(r => r.at.slice(0, 10) === today && r.at <= `${today}T${nowTimeInTokyo()}` && (props.screen !== "oral" || r.care || !r.scores));
      return { p, entries, device, history, assessments, done, key: `${props.screen}:${p.id}:${device?.id ?? ""}` };
    });
  }).sort((a, b) => props.screen === "infection" ? infectionRank(a.p, a.entries) - infectionRank(b.p, b.entries) : props.screen === "oral" ? compareOralPatients(a.p, flagsOf(a.p, a.entries).priority.length, b.p, flagsOf(b.p, b.entries).priority.length) : Number(a.done) - Number(b.done));
  const abxPeople = people.map(x => ({ ...x, abx: antibioticsOf(x.entries) }));
  return <section className="h-full overflow-auto bg-paper p-5"><h1 className="mb-3 text-lg font-bold">{{ equipment: "医療機器", infection: "感染対策", oral: "口腔ケア" }[props.screen]}</h1>{error && <p role="alert" className="text-shu">{error}</p>}
    {props.screen === "infection" && <p className="mb-3 text-sm">耐性菌 {people.filter(x => infectionFlags(x.patient).length).length} 人 ／ 抗MRSA薬 {abxPeople.filter(x => x.abx.some(a => a.kind.includes("抗MRSA"))).length} 人 ／ 広域 {abxPeople.filter(x => x.abx.some(a => a.kind && !a.kind.includes("抗MRSA"))).length} 人 ／ 培養未提出で抗菌薬使用中 {abxPeople.filter(x => x.abx.some(a => !antibioticMonitoring(x.patient, a.startDay).culture)).length} 人</p>}
    <table className="w-full text-left text-sm"><thead><tr><th>部屋</th><th>氏名</th>{props.screen === "equipment" ? <><th>機器</th><th>最後の点検（日時・結果・者）</th><th>今日の点検</th></> : props.screen === "oral" ? <><th>優先の理由</th><th>最後の OHAT-J</th><th>前回比</th><th>今日のケア</th></> : <><th>耐性菌</th><th>抗菌薬（日数・DOT）</th><th>培養</th><th>TDM</th><th>確かめる</th><th>ラウンド</th></>}</tr></thead><tbody>
      {rows.map(({ p, entries, device, history, assessments, done, key }, i) => <Fragment key={key}>
        <tr className="cursor-pointer border-t border-rule hover:bg-paper" onClick={() => setOpened(toggleSpecialistRow(opened, key))}>
          <td className="p-2">{props.screen !== "equipment" && i > 0 && rows[i - 1].p.id === p.id ? "" : p.room || p.ward}</td><td className={props.screen !== "equipment" && i > 0 && rows[i - 1].p.id === p.id ? "opacity-0" : ""}><button aria-expanded={opened === key} aria-controls={`form-${key}`} onClick={e => { e.stopPropagation(); setOpened(toggleSpecialistRow(opened, key)); }} className="text-ai underline">{p.name}</button></td>
          {props.screen === "equipment" ? <><td>{device?.label}</td><td>{history[0] ? `${history[0].at.replace("T", " ")} ${history[0].result ?? history[0].text} ${history[0].by}` : "未点検"}</td><td>{done ? "済" : "未"}</td></> : props.screen === "oral" ? <><td>{flagsOf(p, entries).priority.join("・") || "—"}</td><td>{assessments[0] ? `${ohatTotal(assessments[0].scores!)}/16（${assessments[0].at.slice(0, 10)}）` : "未評価"}</td><td>{assessments.length > 1 ? `${ohatTotal(assessments[0].scores!) - ohatTotal(assessments[1].scores!) > 0 ? "+" : ""}${ohatTotal(assessments[0].scores!) - ohatTotal(assessments[1].scores!)}` : "—"}</td><td>{done ? "済" : "未"}</td></> : <InfectionCells patient={p} entries={entries} administrations={props.administrations} onReview={() => props.onReview?.(p.id)} last={history[0]?.at.replace("T", " ") ?? "未記録"} />}
        </tr>
        {opened === key && <tr id={`form-${key}`}><td colSpan={props.screen === "oral" ? 6 : props.screen === "equipment" ? 5 : 8}><PatientWork key={key} {...props} patient={p} entries={entries} initialDeviceId={device?.id} records={history} save={save} /></td></tr>}
      </Fragment>)}
    </tbody></table>{!rows.length && <p className="p-3 text-sm">対象の患者はいません。</p>}
  </section>;
}
/** One row per patient: the 耐性菌, every antibiotic (days from the start and DOT), culture, TDM and what to check. */
function InfectionCells({ patient: p, entries, administrations, last, onReview }: { patient: Patient; entries: OrderEntry[]; administrations: AdminRecord[]; last: string; onReview: () => void }) {
  const antibiotics = antibioticsOf(entries);
  const flags = infectionFlags(p);
  const mon = antibiotics.map((a) => antibioticMonitoring(p, a.startDay));
  // DOT from the 実施 records; with none recorded (the fictional past is counted as given), the days since the start.
  const dot = (a: (typeof antibiotics)[number]) => { const n = dotFor(antibiotics.filter((b) => b.code === a.code).map((b) => b.id), p.id, administrations); return n || a.days; };
  // A resistant organism with no drug of its group in use: the team checks (no drug is suggested).
  const checks = [
    ...(flags.some((f) => /MRSA/.test(f.text)) && !antibiotics.some((a) => a.kind.includes("抗MRSA")) ? ["MRSA 検出・抗MRSA薬の使用なし"] : []),
    ...(antibiotics.length && !mon.some((m) => m.culture) ? ["抗菌薬使用中・培養の提出なし"] : []),
    ...(antibiotics.some((a) => a.kind.includes("抗MRSA")) && !mon.some((m) => m.tdm) ? ["抗MRSA薬・TDM の結果なし"] : []),
  ];
  return <>
    <td className="py-1.5 align-top">{flags.length ? flags.map((f, i) => <div key={i} className="font-bold text-shu">{f.specimen} {f.text}</div>) : "—"}</td>
    <td className="align-top">{antibiotics.length ? antibiotics.map((a) => <div key={`${a.id}:${a.code}`}>{a.names}{a.kind && <button type="button" onClick={e => { e.stopPropagation(); onReview(); }} className="ml-1 rounded bg-yamabuki-soft px-1 text-[11px] text-yamabuki">{a.kind}</button>} <span className="nums text-ink-soft">{a.days}日目・DOT {dot(a)}日</span></div>) : "—"}</td>
    <td className="align-top">{antibiotics.length ? (mon.some((m) => m.culture) ? "提出あり" : <span className="text-yamabuki">なし</span>) : "—"}</td>
    <td className="align-top">{mon.some((m) => m.tdm) ? "結果あり" : "—"}</td>
    <td className="align-top">{checks.length ? checks.map((c) => <div key={c} className="text-yamabuki">{c}</div>) : "—"}</td>
    <td className="align-top">{last}</td>
  </>;
}

function PatientWork({ patient: p, entries, records, save, initialDeviceId, ...props }: Props & { patient: Patient; entries: OrderEntry[]; initialDeviceId?: string; records: SpecialistRecord[]; save: (r: Omit<SpecialistRecord, "id" | "by">) => boolean }) {
  const scope = `${p.id}:${props.me.role}:${props.screen}`;
  const [scores, setScores, clearScores] = useWindowEntry<number[]>("specialist.scores", () => Array(8).fill(-1), scope);
  const [kind, setKind] = useState("始業点検");
  const [deviceId, setDeviceId] = useState(initialDeviceId ?? "");
  const [result, setResult] = useState("異常なし");
  const [text, setText, clearText] = useWindowEntry("specialist.text", "", scope);
  const [at, setAt, clearAt] = useWindowEntry("specialist.at", () => `${isoDate(todayInTokyo())}T${nowTimeInTokyo()}`, scope);
  const [start, setStart] = useState(""); const [end, setEnd] = useState("");
  const [uf, setUf] = useState(""); const [qb, setQb] = useState(""); const [anticoag, setAnticoag] = useState("");
  const [oralKind, setOralKind, clearOralKind] = useWindowEntry("specialist.oralKind", "OHAT-J 評価", scope);
  const equipment = boardEquipment(p.id, entries, props.standingLines[p.id], props.nowTime, props.icu);
  const denied = denyReason(props.me.role, `${props.screen}.record`);
  const selected = equipment.find(e => e.id === deviceId);
  const total = scores.every(s => s >= 0) ? ohatTotal(scores) : null;
  const missing = equipmentRecordProblems(selected, kind, start, end, uf, qb, anticoag, result, text);
  const valid = props.screen === "equipment" ? missing.length === 0 : props.screen === "oral" && oralKind === "OHAT-J 評価" ? total !== null : !!text.trim();
  return <article className="mb-4 rounded border border-rule bg-sheet p-4"><button className="font-bold text-ai underline" onClick={() => props.onOpen(p.id)}>{p.room} {p.name}</button>
    <fieldset disabled={!!denied} title={denied ?? undefined} className="mt-3 flex flex-wrap items-end gap-3 disabled:opacity-50">
      <label>記録日時<RecordTime value={at} onChange={setAt} label="記録" /></label>
      {props.screen === "equipment" && <><label>機器<select className="block border border-rule p-1" disabled={!!initialDeviceId} value={deviceId} onChange={e => setDeviceId(e.target.value)}><option value="">選択</option>{equipment.map(e => <option key={e.id} value={e.id}>{e.label}</option>)}</select></label><label>記録<select className="block border border-rule p-1" value={kind} onChange={e => setKind(e.target.value)}>{["始業点検", "使用中点検", "透析実施"].map(k => <option key={k}>{k}</option>)}</select></label>{kind !== "透析実施" ? <label>結果<select className="block border border-rule p-1" value={result} onChange={e => setResult(e.target.value)}><option>異常なし</option><option>異常あり</option></select></label> : <>{[["開始", start, setStart], ["終了", end, setEnd]].map(([label, value, setter]) => <label key={String(label)}>{String(label)}<RecordTime value={String(value)} onChange={setter as (s: string) => void} label={String(label)} /></label>)}<label>除水量 L<input className="block border border-rule p-1" type="number" min="0" step="0.1" value={uf} onChange={e => setUf(e.target.value)} /></label><label>血流量 mL/分<input className="block border border-rule p-1" type="number" min="1" value={qb} onChange={e => setQb(e.target.value)} /></label><label>抗凝固薬・量<input className="block border border-rule p-1" value={anticoag} onChange={e => setAnticoag(e.target.value)} /></label></>}</>}
      {props.screen === "oral" && <><label>記録<select className="block border border-rule p-1" value={oralKind} onChange={e => setOralKind(e.target.value)}><option>OHAT-J 評価</option><option>ケア実施・申し送り</option></select></label>{oralKind === "OHAT-J 評価" && <div className="flex w-full flex-wrap gap-3">{OHAT.map((label, i) => <label key={label}>{label}<select className="block border border-rule p-1" value={scores[i]} onChange={e => setScores(old => old.map((v, j) => j === i ? Number(e.target.value) : v))}><option value={-1}>未評価</option>{[0, 1, 2].map(v => <option key={v}>{v}</option>)}</select></label>)}<span>合計 {total ?? "未評価"} /16</span></div>}</>}
      <label className="w-full">{props.screen === "infection" ? "ICT ラウンド・主治医への連絡" : "実施内容・コメント・申し送り"}<textarea className="block w-full border border-rule p-2" value={text} onChange={e => setText(e.target.value)} /></label>
      <button className="rounded bg-ai px-3 py-2 text-white disabled:opacity-40" disabled={!valid || !at} onClick={() => {
        if (!valid || denied) return;
        const body = props.screen === "equipment" ? `${selected!.label} ${kind}：${kind === "透析実施" ? `${start}〜${end}、除水量 ${uf} L、血流量 ${qb} mL/分、抗凝固薬 ${anticoag}` : result} ${text}` : props.screen === "oral" && oralKind === "OHAT-J 評価" ? `OHAT-J ${OHAT.map((k, i) => `${k} ${scores[i]}`).join("・")} 合計 ${total}/16 ${text}` : text;
        if (save({ patientId: p.id, screen: props.screen, at, text: body, care: props.screen === "oral" && oralKind === "ケア実施・申し送り", ...(props.screen === "equipment" ? { equipmentId: deviceId, result: kind === "透析実施" ? "透析実施" : result } : {}), ...(props.screen === "oral" && oralKind === "OHAT-J 評価" ? { scores: [...scores] } : {}) })) { clearScores(); clearText(); clearAt(); clearOralKind(); }
      }}>記録を保存</button>
      {props.screen === "equipment" && (!valid || !at) && <span className="text-[11px] text-shu">不足：{[...missing, ...(!at ? ["記録日時"] : [])].join("・")}</span>}
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
