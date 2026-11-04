import type { InjectionSchedule } from "./types";
/** 架空の病院の取り決め。24:00 は当日の終端。 */
export function defaultDoseTimes(schedule?: InjectionSchedule): string[] {
  const count = schedule?.kind === "per_day" ? schedule.count : schedule?.kind === "every_hours" ? 24 / schedule.hours : 0;
  return [...({ 1: ["10:00"], 2: ["10:00", "22:00"], 3: ["06:00", "14:00", "22:00"], 4: ["06:00", "12:00", "18:00", "24:00"] }[count] ?? [])];
}
export function parseDuration(text: string): number | null {
  const m = text.trim().match(/^(?:(\d+)時間)?(?:(\d+)分?)?$/);
  const n = m ? Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0) : 0;
  return n > 0 && n <= 1440 ? n : null;
}
export const validDoseTime = (t: string) => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(t) || t === "24:00";
export const clockMinutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
export function validateInjectionEnd(startDay: number, start: string, days: number, endDay?: number, end?: string, duration = 0, times?: string[]): string[] {
  const errors: string[] = [];
  if (times && (times.some((t) => !validDoseTime(t)) || new Set(times).size !== times.length)) errors.push("投与時刻は重複のない HH:MM（24:00可）で入力してください。");
  if (days && (!Number.isInteger(days) || days < 1)) errors.push("日数は1以上の整数で入力してください。");
  if (!end) return errors;
  const from = startDay * 1440 + clockMinutes(start || "00:00");
  const to = (endDay ?? startDay) * 1440 + clockMinutes(end);
  if (to <= from) errors.push("終了は開始より後にしてください。");
  if (days && Math.ceil((to - startDay * 1440) / 1440) !== days) errors.push("終了日と日数が一致していません。");
  if (times?.some((t) => (endDay ?? startDay) * 1440 + clockMinutes(t) + duration > to)) errors.push("指定した回数・投与時刻では最後の投与が終了時刻を超えます。");
  return errors;
}
/** 入力欄の移動。選択肢は上下、欄は左右・Enter・Tab。 */
export function injectionFieldIndex(index: number, key: string, count: number): number {
  return Math.max(0, Math.min(count - 1, index + (key === "ArrowLeft" ? -1 : ["ArrowRight", "Enter", "Tab"].includes(key) ? 1 : 0)));
}
/** 最終投与の開始＋1回の時間。終了指定がないときの表示用。 */
export function automaticInjectionEnd(startDay: number, start: string, days: number, times: string[] | undefined, duration: number): { day: number; time: string } | null {
  const clocks = times?.filter(validDoseTime).map(clockMinutes) ?? [];
  if ((!clocks.length && !validDoseTime(start)) || duration <= 0 || !Number.isFinite(duration)) return null;
  const last = clocks.length ? Math.max(...clocks) : clockMinutes(start);
  const at = (startDay + Math.max(1, days) - 1) * 1440 + last + Math.round(duration);
  const minute = ((at % 1440) + 1440) % 1440;
  return { day: Math.floor(at / 1440), time: `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}` };
}
