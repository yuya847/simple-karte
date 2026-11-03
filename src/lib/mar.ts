// 与薬・実施の記録（eMAR: electronic Medication Administration Record）.
// A nurse records each scheduled dose or task as 実施 or 未実施 (with a reason). Before giving it,
// the wristband and the label are read (a barcode reader types like a keyboard) and code checks
// patient, drug and time — the three-way check (患者・薬・実施者). No AI here.

import { WARD_RULES } from "./master";
import type { WorkItem } from "./worksheet";

export const NOT_DONE_REASONS = ["患者が拒否", "絶食・検査のため", "医師の指示で中止・延期", "薬が届いていない", "患者が不在", "その他"] as const;
export type NotDoneReason = (typeof NOT_DONE_REASONS)[number];

/** Why a 実施・未実施 record is taken back (it stays in the history). */
export const VOID_REASONS = ["別の患者・別の回に記録した", "実施と未実施を取り違えた", "時刻を間違えた", "その他"] as const;
export type VoidReason = (typeof VOID_REASONS)[number];
export interface VoidedRecord {
  record: AdminRecord;
  by: string;
  at: string;
  reason: VoidReason;
}

export interface AdminRecord {
  key: string;
  orderId: string;
  patientId: string;
  /** Scheduled time (minutes from today 00:00); for 必要時 items, the time it was given. */
  at: number;
  status: "実施" | "未実施";
  /** Time recorded ("HH:MM") and by whom. */
  doneAt: string;
  by: string;
  reason?: NotDoneReason;
  note?: string;
  /** What was read: true = matched. */
  checked: { patient: boolean; label: boolean | null };
  /** Minutes off the scheduled time (+ late, − early), when outside the ward's window. */
  offBy?: number;
}

export const marKey = (orderId: string, at: number) => `${orderId}|${at}`;

/** The code printed on the drug label or specimen label for one dose (fictional format). */
export const labelFor = (orderId: string, at: number) => `${orderId.replace(/[^A-Za-z0-9]/g, "").slice(-6).toUpperCase()}-${at}`;

/** Kinds read with a label (drug or specimen). 処置・検査 only check the wristband. */
export const needsLabel = (kind: WorkItem["kind"]) => kind === "注射" || kind === "内服" || kind === "採血";

export interface ScanResult {
  patient: "ok" | "mismatch" | "none";
  label: "ok" | "mismatch" | "none" | "not-needed";
  /** Minutes off the scheduled time when outside the window. */
  offBy?: number;
  /** Can be recorded as 実施. */
  ok: boolean;
  messages: string[];
}

export function checkScan(item: Pick<WorkItem, "orderId" | "patientId" | "kind" | "at" | "name">, wristband: string, label: string, nowAbs: number): ScanResult {
  const messages: string[] = [];
  const wb = wristband.trim();
  const lb = label.trim().toUpperCase();
  const patient = !wb ? "none" : wb === item.patientId ? "ok" : "mismatch";
  if (patient === "mismatch") messages.push(`リストバンドが違います（${wb}）。${item.name}さんではありません。投与・実施しないでください。`);
  if (patient === "none") messages.push("リストバンドを読んでください。");
  let lab: ScanResult["label"] = "not-needed";
  if (needsLabel(item.kind)) {
    const want = item.at === null ? null : labelFor(item.orderId, item.at);
    lab = !lb ? "none" : lb === want ? "ok" : "mismatch";
    if (lab === "mismatch") messages.push(want && lb.split("-")[0] === want.split("-")[0] ? `同じオーダの別の回のラベルです（${lb}）。この回は ${want} です。` : `ラベルがこのオーダのものではありません（${lb}）。`);
    if (lab === "none") messages.push(item.kind === "採血" ? "検体ラベルを読んでください。" : "薬のラベルを読んでください。");
  }
  let offBy: number | undefined;
  if (item.at !== null) {
    const d = nowAbs - item.at;
    if (Math.abs(d) > WARD_RULES.marWindowMin) {
      offBy = d;
      messages.push(`予定の時刻より ${Math.abs(d)}分 ${d > 0 ? "遅れています" : "早いです"}（この病棟の取り決めは前後 ${WARD_RULES.marWindowMin}分）。`);
    }
  }
  return { patient, label: lab, offBy, ok: patient === "ok" && (lab === "ok" || lab === "not-needed"), messages };
}

export type MarState = "実施" | "未実施" | "記録済み" | "未入力" | "予定";

/**
 * The state of one timed item. Items due before this session began count as recorded (the fictional
 * earlier shifts); after that, a nurse records them.
 */
export function marState(item: Pick<WorkItem, "orderId" | "at">, records: Record<string, AdminRecord>, sessionStart: number, nowAbs: number): MarState {
  if (item.at === null) return "予定";
  const r = records[marKey(item.orderId, item.at)];
  if (r) return r.status;
  if (item.at < sessionStart) return "記録済み";
  return item.at <= nowAbs ? "未入力" : "予定";
}

/** Past due beyond the window without a record. */
export const overdue = (item: Pick<WorkItem, "orderId" | "at">, records: Record<string, AdminRecord>, sessionStart: number, nowAbs: number) =>
  item.at !== null && marState(item, records, sessionStart, nowAbs) === "未入力" && nowAbs - item.at > WARD_RULES.marWindowMin;

/** 必要時 (頓用) given today, and whether another dose would go over the day's limit. */
/** Same calendar day as now (after midnight the clock runs on past 1440, see dates.ts continuedTime). */
const sameDay = (at: number, nowAbs: number) => Math.floor(at / 1440) === Math.floor(nowAbs / 1440);

export function prnToday(orderId: string, records: Record<string, AdminRecord>, maxPerDay?: number, nowAbs = 0) {
  const given = Object.values(records).filter((r) => r.orderId === orderId && r.status === "実施" && sameDay(r.at, nowAbs)).length;
  return { given, over: maxPerDay !== undefined && given >= maxPerDay };
}

/** The id a 指示簿の頓用 is recorded under (it is not an order). */
export const standingPrnId = (patientId: string, ruleId: string) => `standing-${patientId}-${ruleId}`;

/**
 * 指示簿の頓用 (PRN in the standing orders): how many given today, the day's limit, and whether the
 * ordered interval has passed since the last dose (minutes from today 00:00).
 */
export function standingPrnState(
  orderId: string,
  records: Record<string, AdminRecord>,
  rule: { intervalH: number; maxPerDay: number },
  nowAbs: number,
  /** The same drug in this patient's other 頓用 (ids), with one dose in mg and the insert's daily maximum. */
  same?: { ids: string[]; doseMg?: number; maxDailyMg?: { mg: number; source: string } },
) {
  const given = Object.values(records).filter((r) => r.orderId === orderId && r.status === "実施");
  const today = given.filter((r) => sameDay(r.at, nowAbs)).length;
  const hm = (m: number) => `${String(Math.floor((((m % 1440) + 1440) % 1440) / 60)).padStart(2, "0")}:${String((((m % 1440) + 1440) % 1440) % 60).padStart(2, "0")}`;
  // The same drug under another 頓用 counts too: the interval and the daily maximum are per drug.
  const others = same ? Object.values(records).filter((r) => same.ids.includes(r.orderId) && r.status === "実施") : [];
  const lastAny = [...given, ...others].reduce<number | null>((m, r) => (m === null || r.at > m ? r.at : m), null);
  const todayAll = today + others.filter((r) => sameDay(r.at, nowAbs)).length;
  const mgOver = same?.doseMg && same.maxDailyMg ? (todayAll + 1) * same.doseMg > same.maxDailyMg.mg : false;
  const leftAny = lastAny === null ? 0 : lastAny + rule.intervalH * 60 - nowAbs;
  return {
    given: today,
    max: rule.maxPerDay,
    over: today >= rule.maxPerDay || mgOver,
    sameToday: others.length ? todayAll : undefined,
    limit: mgOver && same?.doseMg && same.maxDailyMg ? `同じ薬を今日ほかの頓用も合わせて${todayAll}回（${todayAll * same.doseMg}mg）使っています。もう1回で${(todayAll + 1) * same.doseMg}mg となり、1日の上限 ${same.maxDailyMg.mg}mg（${same.maxDailyMg.source}）を超えます。` : undefined,
    wait:
      leftAny > 0 && lastAny !== null
        ? `${others.some((r) => r.at === lastAny) ? "同じ薬をほかの頓用で" : "前回"} ${hm(lastAny)} に使っています。${rule.intervalH}時間あける指示です（あと${Math.floor(leftAny / 60) ? `${Math.floor(leftAny / 60)}時間` : ""}${leftAny % 60}分）。医師に確かめてください。`
        : undefined,
  };
}
