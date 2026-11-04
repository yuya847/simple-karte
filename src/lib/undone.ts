// 未実施の一覧（実施漏れ・算定漏れ）: gathered by code from the orders and the 実施・未実施 records.
// - 実施漏れ: timed items (注射・内服・処置・採血・検査) past their time beyond the ward's window with no
//   record (the same rule as the worksheet's 照合 and the patient list's mark).
// - 算定と記録の食い違い: the billing calculation counts a ward procedure from the order (a time that has
//   passed counts as done; an as-needed one only from the order's own record of when it was done, see
//   proc-timing.ts), so a 実施 record it does not count, or a 未実施 record it still counts, is listed for
//   医事課 to check. Code lists them; people decide what to correct. The standard spec asks for the list
//   (電子カルテ標準仕様 v1.0 2.02-14-3 未実施患者一覧). All data is fictional.

import { WARD_RULES } from "./master";
import { overdue, type AdminRecord } from "./mar";
import { procEvents } from "./proc-timing";
import { procedureTitle } from "./format";
import { buildWorksheet, type WorkKind, type WorkPatient } from "./worksheet";

export const UNDONE_SOURCE = { label: "電子カルテ標準仕様研究会「電子カルテシステム標準仕様書 v1.0」2.02 指示・オーダ 14 病棟業務 3「未実施患者一覧」（診療行為漏れ・算定漏れを防ぐため、実施処理（注射・処置・輸血）が行われていないオーダを一覧で表示する）", url: "http://hci-bc.com/pdf/StandardSpec_v1body_c.pdf" };

/** Ward procedures the billing calculation counts per time or per day (engine.ts: J000・J001-4・J018・J022・J022-2). */
export const BILLED_PROCS: Record<string, string> = {
  "PROC-WOUND": "創傷処置（行った回数ごと）",
  "PROC-ULCER": "褥瘡処置（行った回数ごと）",
  "PROC-SUCTION": "喀痰吸引（1日につき）",
  "PROC-TEKIBEN": "摘便（行った回数ごと）",
  "PROC-GE": "グリセリン浣腸（行った回数ごと）",
};

export interface UndoneRow {
  patientId: string;
  room: string;
  name: string;
  orderId: string;
  kind: WorkKind;
  main: string;
  detail: string;
  /** Scheduled time (minutes from today 00:00). */
  at: number;
  /** Minutes past the scheduled time now. */
  lateMin: number;
}

/** 実施漏れ: past their time (beyond the window) since `since` with no 実施・未実施 record. */
export function undoneRows(people: WorkPatient[], records: Record<string, AdminRecord>, since: number, nowAbs: number): UndoneRow[] {
  return buildWorksheet(people, since, nowAbs + 1, nowAbs)
    .timed.filter((i) => overdue(i, records, since, nowAbs))
    .map((i) => ({ patientId: i.patientId, room: i.room, name: i.name, orderId: i.orderId, kind: i.kind, main: i.main, detail: i.detail, at: i.at!, lateMin: nowAbs - i.at! }));
}

export type GapKind = "実施したが算定に入らない" | "未実施なのに算定に入る";

export interface GapRow {
  kind: GapKind;
  patientId: string;
  room: string;
  name: string;
  orderId: string;
  main: string;
  /** The time of the record (minutes from today 00:00), and who wrote it. */
  at: number;
  by: string;
  /** Why the calculation does (not) count it, in plain words. */
  why: string;
}

/**
 * 実施・未実施 records of ward procedures that the billing calculation reads differently: done but not
 * counted (an as-needed procedure recorded on the ward, not in the order's record of times done), and
 * recorded 未実施 but still counted (a scheduled time that has passed).
 */
export function billingGaps(people: WorkPatient[], records: Record<string, AdminRecord>, nowAbs: number): GapRow[] {
  const out: GapRow[] = [];
  for (const { patient, room, entries } of people) {
    for (const e of entries) {
      if (e.order.type !== "procedure" || !BILLED_PROCS[e.order.code]) continue;
      const o = e.order;
      const mine = Object.values(records).filter((r) => r.orderId === e.id && r.patientId === patient.id);
      if (!mine.length) continue;
      const counted = new Set(procEvents(e, Math.min(...mine.map((r) => r.at)) - 1, nowAbs + 1, nowAbs).filter((t) => t <= nowAbs));
      for (const r of mine) {
        const base = { patientId: patient.id, room, name: patient.name, orderId: e.id, main: procedureTitle(o), at: r.at, by: r.by };
        if (r.status === "実施" && !counted.has(r.at))
          out.push({ ...base, kind: "実施したが算定に入らない", why: `${BILLED_PROCS[o.code]}。${o.schedule.kind === "prn" ? "必要時の処置は、指示に残した実施の時刻から算定を数えます。病棟の実施の記録はまだ入っていません" : "算定は指示の予定の時刻で数えます。この実施の時刻は予定にありません"}` });
        if (r.status === "未実施" && counted.has(r.at)) out.push({ ...base, kind: "未実施なのに算定に入る", why: `${BILLED_PROCS[o.code]}。算定は予定の時刻を過ぎた回を実施として数えます${r.reason ? `（未実施の理由：${r.reason}）` : ""}` });
      }
    }
  }
  return out.sort((a, b) => a.at - b.at || a.room.localeCompare(b.room));
}

/** 「12分」「2時間5分」 */
export const lateText = (min: number) => (min >= 60 ? `${Math.floor(min / 60)}時間${min % 60 ? `${min % 60}分` : ""}` : `${min}分`);

/** The window the ward allows before an item counts as late (master.ts, 架空の病院の取り決め). */
export const UNDONE_WINDOW = `予定の時刻から${WARD_RULES.marWindowMin}分を過ぎても記録がないもの（この病棟の取り決め：前後${WARD_RULES.marWindowMin}分）`;
