import { abs } from "../flowsheet";
import type { Patient } from "../types";
import { abgRows, ventAt } from "./abg";
import { currentOxygen } from "./current-oxygen";
import { doseText, rateAt } from "./gamma";
import { icuIoLines } from "./io-lines";
import { lineDays } from "./lines";
import { sofaFacts, sofaScore } from "./sofa";
import { unitOf, type IcuRecords } from "./types";

export function icuHandoffFacts(p: Patient, records: IcuRecords, nowAbs: number): string[] {
  if (!unitOf(p.ward)) return [];
  const day = Math.floor(nowAbs / 1440), out: string[] = [];
  const infusions = records.infusions.filter(i => i.patientId === p.id && rateAt(i, nowAbs) !== null);
  if (infusions.length) out.push(`持続投与：${infusions.map(i => `${i.name} ${doseText(i, nowAbs).split("（")[0]}・${rateAt(i, nowAbs)!.toFixed(1)}mL/時`).join("、")}`);
  const vent = ventAt(records.vents, p.id, nowAbs);
  const abg = abgRows(p, records.vents).filter(l => abs(l.day, l.time) <= nowAbs).at(-1);
  if (vent) out.push(`呼吸：${currentOxygen(records, p.id, nowAbs)}${[vent.ps !== undefined && `PS ${vent.ps}`, vent.pc !== undefined && `PC ${vent.pc}`, vent.vt !== undefined && `VT ${vent.vt}`, vent.rr !== undefined && `RR ${vent.rr}`].filter(Boolean).map(s => ` ${s}`).join("")}　P/F ${abg?.pf ?? "—"}`);
  const rass = records.hourly.filter(h => h.patientId === p.id && h.rass !== undefined && abs(h.at.day, h.at.time) <= nowAbs).sort((a,b) => abs(a.at.day,a.at.time)-abs(b.at.day,b.at.time)).at(-1);
  out.push(`RASS ${rass?.rass ?? "—"}　SOFA（今日）${sofaScore(sofaFacts(p, records, day, nowAbs)).total ?? "—"}`);
  const io = icuIoLines(records, p.id, nowAbs - 1440, nowAbs);
  const total = (side: "IN" | "OUT") => io.filter(i => i.side === side).reduce((s,i) => s+i.ml,0);
  out.push(`24時間の出納（昨日 ${String(Math.floor(nowAbs % 1440 / 60)).padStart(2,"0")}:${String(nowAbs % 60).padStart(2,"0")}〜今日 ${String(Math.floor(nowAbs % 1440 / 60)).padStart(2,"0")}:${String(nowAbs % 60).padStart(2,"0")}）：IN ${total("IN").toFixed(0)}mL／OUT ${total("OUT").toFixed(0)}mL／差 ${(total("IN")-total("OUT")).toFixed(0)}mL（記録分）`);
  const lines = records.lines.filter(l => l.patientId === p.id && abs(l.insertedAt.day,l.insertedAt.time) <= nowAbs && (!l.removedAt || abs(l.removedAt.day,l.removedAt.time) > nowAbs));
  if (lines.length) out.push(`ライン：${lines.map(l => `${l.kind} ${l.site}（${lineDays(l,day)}）`).join("、")}`);
  const c = records.crrt.filter(c => c.patientId === p.id && abs(c.at.day,c.at.time) <= nowAbs && (!c.end || abs(c.end.day,c.end.time)>nowAbs)).sort((a,b)=>abs(a.at.day,a.at.time)-abs(b.at.day,b.at.time)).at(-1);
  if (c) out.push(`CRRT：${c.mode} QB ${c.qb}mL/分・QD ${c.qd.toFixed(1)}mL/時・QF ${c.qf.toFixed(1)}mL/時・除水 ${c.removalMlPerH.toFixed(1)}mL/時・${c.anticoag.drug} ${c.anticoag.ratePerH}${c.anticoag.unit}・${c.access}`);
  return out;
}
