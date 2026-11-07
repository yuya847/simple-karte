import type { OrderEntry, Patient } from "../types";
import type { BedAssignment } from "../ward";
import { floorOf } from "../ward";
import { abs } from "../flowsheet";
import { currentOxygen } from "./current-oxygen";
import { doseText, rateAt } from "./gamma";
import { hourlyBalance } from "./balance";
import { sofaFacts, sofaScore } from "./sofa";
import { lineDays } from "./lines";
import { mapWithMeasured } from "./vitals";
import type { IcuRecords, UnitKind } from "./types";

export type BoardOrders = Record<string, OrderEntry[]>;
export function boardRows(unit: UnitKind, patients: Patient[], beds: BedAssignment[], records: IcuRecords, today: number, nowAbs: number, orders: BoardOrders = {}) {
  return Array.from({ length: 8 }, (_, i) => {
    const bed = `${unit}${i + 1}`;
    const assignment = beds.find(b => b.room === bed && b.patientId);
    const patient = patients.find(p => p.id === assignment?.patientId && !p.dischargedAt) ?? null;
    const base = { bed, patient };
    if (!patient) return { ...base, days: null, diagnosis: "", vent: "", infusions: [], crrt: "", sofaToday: null, sofaYesterday: null, lines: [], balance24h: null, latest: null, planned: null, stay: null };
    const pid = patient.id;
    const stays = records.stays.filter(s => s.patientId === pid && abs(s.in.day,s.in.time) <= nowAbs).sort((a,b) => abs(a.in.day,a.in.time)-abs(b.in.day,b.in.time));
    const stay = stays.at(-1) ?? null;
    const latestVital = patient.vitals.filter(v => abs(v.day,v.time) <= nowAbs).sort((a,b) => abs(a.day,a.time)-abs(b.day,b.time)).at(-1);
    const hourly = records.hourly.filter(h => h.patientId === pid && abs(h.at.day,h.at.time) <= nowAbs).sort((a,b) => abs(a.at.day,a.at.time)-abs(b.at.day,b.at.time));
    const measured = hourly.filter(h => h.map !== undefined).at(-1);
    const rass = hourly.filter(h => h.rass !== undefined).at(-1)?.rass;
    const c = records.crrt.filter(c => c.patientId === pid && abs(c.at.day,c.at.time) <= nowAbs && (!c.end || abs(c.end.day,c.end.time) > nowAbs)).sort((a,b) => abs(a.at.day,a.at.time)-abs(b.at.day,b.at.time)).at(-1);
    const balance = hourlyBalance(patient,records,today,nowAbs).reduce((sum,h) => ({ inMl: sum.inMl+h.inMl, outMl: sum.outMl+h.outMl, netMl: sum.netMl+h.netMl }),{ inMl:0,outMl:0,netMl:0 });
    const move = (orders[pid] ?? []).flatMap(e => e.status === "有効" && e.order.type === "procedure" && e.order.code === "PROC-MOVE" && e.order.move?.to ? [e.order] : []).sort((a,b) => abs(a.start.day,a.start.time ?? "00:00")-abs(b.start.day,b.start.time ?? "00:00"))[0];
    return { ...base, days: today-(stays[0]?.in.day ?? patient.admittedOn)+1, diagnosis: patient.admissionDiagnosis,
      vent: currentOxygen(records, pid, nowAbs) ?? latestVital?.o2 ?? "—",
      infusions: records.infusions.filter(inf => inf.patientId === pid && rateAt(inf,nowAbs) !== null).map(inf => `${inf.name} ${doseText(inf,nowAbs).split("（")[0]}`),
      crrt: c ? `${c.mode} QB ${c.qb} 除水 ${c.removalMlPerH}mL/h` : "",
      sofaToday: sofaScore(sofaFacts(patient,records,today,nowAbs)).total, sofaYesterday: sofaScore(sofaFacts(patient,records,today-1,nowAbs)).total,
      lines: records.lines.filter(l => l.patientId === pid && abs(l.insertedAt.day,l.insertedAt.time) <= nowAbs && (!l.removedAt || abs(l.removedAt.day,l.removedAt.time) > nowAbs)).map(l => ({ kind: l.kind === "尿道カテーテル" ? "尿カテ" : l.kind, days: lineDays(l,today).replace("日目","日"), flag: today-l.insertedAt.day+1 >= 7 })),
      balance24h: balance, latest: { hr: latestVital?.hr, map: mapWithMeasured(measured,latestVital?.sbp,latestVital?.dbp), spo2: latestVital?.spo2, rr: latestVital?.rr, bt: latestVital?.bt, rass },
      planned: move ? { to: floorOf(move.move!.to!.room).replace("病棟",""), day: move.start.day, time: move.start.time ?? "" } : null, stay };
  });
}
