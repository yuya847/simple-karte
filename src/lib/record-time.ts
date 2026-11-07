import { abs } from "./flowsheet";

/** 記録の時刻で絞る。予定のオーダには使わない。 */
export function recordedVitals<T extends { day: number; time: string }>(rows: T[], nowAbs: number): T[] {
  return rows.filter(r => abs(r.day, r.time) <= nowAbs);
}
export function recordedHourly<T extends { at: { day: number; time: string } }>(rows: T[], nowAbs: number): T[] {
  return rows.filter(r => abs(r.at.day, r.at.time) <= nowAbs);
}

/** 表示用だけを絞り、保存元の未来の試験記録は保持する。 */
export function visibleIcuRecords<T extends { hourly: { id: string; at: { day: number; time: string } }[] }>(records: T, nowAbs: number): T {
  return { ...records, hourly: recordedHourly(records.hourly, nowAbs) };
}
export function retainFutureHourly<T extends { hourly: { id: string; at: { day: number; time: string } }[] }>(saved: T, edited: T, nowAbs: number): T {
  const editedIds = new Set(edited.hourly.map(r => r.id));
  return { ...edited, hourly: [...edited.hourly, ...saved.hourly.filter(r => abs(r.at.day, r.at.time) > nowAbs && !editedIds.has(r.id))] };
}
