import type { ErPatient } from "../er";
import type { OpdPatient } from "../opd";
import type { HistoryEntry } from "../types";

// 架空の病院の表示診療時間。祝日は明示した日付だけを扱う（日曜・年末年始は下で判定）。
export const ER_HOURS = { open: 8 * 60, close: 18 * 60, saturdayClose: 12 * 60, nightStart: 22 * 60, nightEnd: 6 * 60 } as const;
export const ER_HOLIDAYS = ["2026-01-01", "2026-01-12", "2026-02-11", "2026-02-23", "2026-03-20", "2026-04-29", "2026-05-03", "2026-05-04", "2026-05-05", "2026-05-06", "2026-07-20", "2026-08-11", "2026-09-21", "2026-09-22", "2026-09-23", "2026-10-12", "2026-11-03", "2026-11-23"];
export const ER_RULE_HINT = "架空の病院の取り決め：表示診療時間は平日8〜18時・土曜8〜12時。日曜・2026年の祝日・12月29日〜1月3日は休日。深夜22〜6時を優先し、休日・時間外の順で1つだけ算定します。受診時刻は到着時刻で代用（予定受診ではない救急受診を想定）。2026年以外の祝日は未対応。初診・再診は人が確認します。下書きは算定に入りません。";
export const ER_SOURCE = { label: "厚生労働省：医科点数表 A000・A001（時間外等）、A205（救急医療管理加算は入院）", url: "https://www.mhlw.go.jp/content/10808000/001662535.pdf" };
export type EmergencyContext = { arrivedAbs: number; admittedAs?: string };
export function arrivalDate(today: string, arrivedAbs: number): string {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + Math.floor(arrivedAbs / 1440));
  return d.toISOString().slice(0, 10);
}
export function emergencyBand(today: string, arrivedAbs: number, holidays: readonly string[] = ER_HOLIDAYS): "時間外" | "休日" | "深夜" | null {
  const date = arrivalDate(today, arrivedAbs);
  const min = ((arrivedAbs % 1440) + 1440) % 1440;
  if (min >= ER_HOURS.nightStart || min < ER_HOURS.nightEnd) return "深夜";
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  const md = date.slice(5);
  if (day === 0 || holidays.includes(date) || md >= "12-29" || md <= "01-03") return "休日";
  return min < ER_HOURS.open || min >= (day === 6 ? ER_HOURS.saturdayClose : ER_HOURS.close) ? "時間外" : null;
}
export function emergencyAsOpd(p: ErPatient, kind: "初診" | "再診"): OpdPatient {
  return { ...p, department: "救急外来", doctor: "救急担当医", slot: null, status: "会計待ち", kind, reason: p.complaint, problems: [], meds: [], visits: [] };
}
/** Role desks are separate. Count all waiting drafts once, excluding the legacy shared copy if role desks exist. */
export function pendingDraftCount(charts: Record<string, { drafts: unknown[] }>, id: string): number {
  const desks = Object.entries(charts).filter(([key]) => key.startsWith(`${id}|`));
  return desks.length ? desks.reduce((n, [, c]) => n + c.drafts.length, 0) : charts[id]?.drafts.length ?? 0;
}
export function transferEmergencyOrders(ward: HistoryEntry[], visit: HistoryEntry[]): HistoryEntry[] {
  const ids = new Set(ward.flatMap((e) => e.kind === "order" ? [e.id] : []));
  return [...ward, ...visit.filter((e) => e.kind === "order" && !ids.has(e.id))];
}

/** 医事課が救急の保険登録から開く患者基本情報の節。 */
export function emergencyRegistrationSection(role: string, patientKey: string): string | undefined {
  return role === "医事課" && patientKey.startsWith("er:") ? "pi-insurance" : undefined;
}
