// 計算の道具に入れる値を、開いている患者のカルテから拾う。今より後の記録は使わない。
// 拾うだけで、値を直したり推定したりしない（どれを使うかは医師が画面で入れ直せる）。

import { addDays, formatShort, type CalendarDate } from "../dates";
import { abs } from "../flowsheet";
import type { Patient, VitalSign } from "../types";

/** 拾った値と、その記録の日（今日 = 0）と時刻。time が null は日ごとの記録、day が null はプロファイルの値。 */
export interface Picked {
  value: number;
  day: number | null;
  time: string | null;
}

const newestFirst = <T extends { day: number; time: string }>(rows: T[]) => [...rows].sort((a, b) => abs(b.day, b.time) - abs(a.day, a.time));
const seen = (nowAbs: number) => (r: { day: number; time: string }) => abs(r.day, r.time) <= nowAbs;

/** 検査値の最新（今以前）。code は検査結果の項目コード（Na・Cre・PaO2 など）。 */
export function latestLab(p: Pick<Patient, "labs">, code: string, nowAbs: number): Picked | null {
  const r = newestFirst(p.labs.filter(seen(nowAbs))).find((l) => Number.isFinite(l.values[code]));
  return r ? { value: r.values[code], day: r.day, time: r.time } : null;
}

type VitalKey = "bt" | "hr" | "sbp" | "dbp" | "rr" | "spo2";

/** バイタルの最新（今以前）。 */
export function latestVital(p: Pick<Patient, "vitals">, key: VitalKey, nowAbs: number): Picked | null {
  const v = newestFirst(p.vitals.filter(seen(nowAbs))).find((x) => Number.isFinite(x[key]));
  return v ? { value: v[key]!, day: v.day, time: v.time } : null;
}

/** 収縮期・拡張期が同じ記録にそろった最新の血圧。 */
export function latestBp(p: Pick<Patient, "vitals">, nowAbs: number): { sbp: number; dbp: number; day: number; time: string } | null {
  const v = newestFirst(p.vitals.filter(seen(nowAbs))).find((x) => Number.isFinite(x.sbp) && Number.isFinite(x.dbp));
  return v ? { sbp: v.sbp!, dbp: v.dbp!, day: v.day, time: v.time } : null;
}

/** GCS が付いた最新のバイタル（E・V・M のどれかがある記録）。 */
export function latestGcs(p: Pick<Patient, "vitals">, nowAbs: number): (NonNullable<VitalSign["gcs"]> & { day: number; time: string }) | null {
  const v = newestFirst(p.vitals.filter(seen(nowAbs))).find((x) => x.gcs && (x.gcs.e !== undefined || x.gcs.v !== undefined || x.gcs.m !== undefined));
  return v?.gcs ? { ...v.gcs, day: v.day, time: v.time } : null;
}

/** その時刻以前で、酸素の記録がある最新のバイタル。 */
export function oxygenAt(p: Pick<Patient, "vitals">, atAbs: number): { o2: string; day: number; time: string } | null {
  const v = newestFirst(p.vitals.filter(seen(atAbs))).find((x) => !!x.o2);
  return v?.o2 ? { o2: v.o2, day: v.day, time: v.time } : null;
}

/** 体重：日ごとの記録（今日まで）の最新、なければプロファイルの体重。 */
export function latestWeight(p: Pick<Patient, "weightKg" | "daily">): Picked | null {
  const d = [...p.daily].filter((x) => x.day <= 0 && Number.isFinite(x.weightKg) && x.weightKg! > 0).sort((a, b) => b.day - a.day)[0];
  if (d) return { value: d.weightKg!, day: d.day, time: null };
  return Number.isFinite(p.weightKg) && p.weightKg > 0 ? { value: p.weightKg, day: null, time: null } : null;
}

/** 「今日 08:00」「昨日」「11/5 06:00」「プロファイル」。 */
export function whenText(day: number | null, time: string | null, today: CalendarDate): string {
  if (day === null) return "プロファイル";
  const date = day === 0 ? "今日" : day === -1 ? "昨日" : formatShort(addDays(today, day)).replace(/（.）/, "");
  return time ? `${date} ${time}` : date;
}

export const pickedText = (p: Picked, today: CalendarDate) => whenText(p.day, p.time, today);
