import { abs } from "../flowsheet";
import type { Patient } from "../types";
import { unitOf, type IcuRecords } from "./types";

export function hourlyObservations(p: Patient, records: IcuRecords, lo: number, hi: number, nowAbs: number) {
  if (!unitOf(p.ward) || p.dischargedAt) return [];
  const stays = records.stays.filter(s => s.patientId === p.id && s.unit === p.ward);
  const recorded = new Set(records.hourly.filter(h => h.patientId === p.id && abs(h.at.day, h.at.time) <= nowAbs).map(h => Math.floor(abs(h.at.day, h.at.time) / 60)));
  const rows: { at: number; missing: boolean }[] = [];
  for (let t = Math.ceil(lo / 60) * 60; t < hi; t += 60) {
    if (!stays.some(s => t >= abs(s.in.day, s.in.time) && (!s.out || t < abs(s.out.day, s.out.time)))) continue;
    if (recorded.has(t / 60)) continue;
    rows.push({ at: t, missing: t <= nowAbs });
  }
  return rows;
}

export function hourlyObservationText(rows: { at: number; missing: boolean }[], day: number): string {
  const hours = (missing: boolean) => {
    const times = rows.filter(r => r.missing === missing).map(r => r.at);
    const groups: number[][] = [];
    for (const t of times) {
      const last = groups.at(-1);
      if (last && t === last.at(-1)! + 60 && Math.floor(t / 1440) === Math.floor(last[0] / 1440)) last.push(t);
      else groups.push([t]);
    }
    const label = (t: number) => `${Math.floor(t / 1440) === day ? "" : Math.floor(t / 1440) === day + 1 ? "翌" : "前日"}${Math.floor(((t % 1440) + 1440) % 1440 / 60)}`;
    return groups.flatMap(g => g.length >= 3 ? [`${label(g[0])}〜${Math.floor(((g.at(-1)! % 1440) + 1440) % 1440 / 60)}時`] : g.map(t => `${label(t)}時`)).join("・");
  };
  const missing = hours(true), planned = hours(false);
  return [missing && `${missing}が未`, planned && `${planned}予定`].filter(Boolean).join("　");
}
