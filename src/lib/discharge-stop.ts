// 退院時の一括中止: at discharge, the orders that would still run (or are still booked) after the patient
// leaves, gathered by code and put in groups. The doctor confirms each group to stop; nothing is stopped by
// code. 退院時処方 (taken home) and the 退院 order itself are not listed: they belong to the discharge.
// The standard spec asks for it (電子カルテ標準仕様 v1.0 2.02-14-4 退院一括削除). All data is fictional.

import { orderEndDay } from "./drafts";
import { examAt } from "./exams";
import { orderInterval } from "./flowsheet";
import { procInterval } from "./proc-timing";
import type { OrderEntry } from "./types";
import type { StandingOrders } from "./standing";

export const DISCHARGE_STOP_SOURCE = { label: "電子カルテ標準仕様研究会「電子カルテシステム標準仕様書 v1.0」2.02 指示・オーダ 14 病棟業務 4「退院一括削除」（入院中に予定していたオーダを、退院で止めるために一括で削除できること）", url: "http://hci-bc.com/pdf/StandardSpec_v1body_c.pdf" };

export type StopGroupKey = "注射" | "内服" | "処置" | "検査" | "依頼・予約" | "指示簿";

export const STOP_GROUPS: { key: StopGroupKey; label: string }[] = [
  { key: "注射", label: "注射（点滴・静注など）" },
  { key: "内服", label: "内服（定期・臨時・持参薬。退院時処方は除く）" },
  { key: "処置", label: "処置（酸素・カテーテル・創傷処置など）" },
  { key: "検査", label: "これからの検査（採血・画像・生理）" },
  { key: "依頼・予約", label: "依頼・予約（リハビリ・他科依頼・指導・外泊・移動）" },
  { key: "指示簿", label: "指示簿（安静度・頓用・医師を呼ぶ基準・条件付き指示）" },
];

const REQUESTS = ["PROC-REHAB", "PROC-CONSULT", "PROC-GUIDE", "PROC-LEAVE", "PROC-MOVE"];

/** The group an order belongs to when it still runs after `nowAbs`, or null when it does not. */
export function remainingGroup(e: OrderEntry, nowAbs: number): StopGroupKey | null {
  const o = e.order;
  if (e.status === "中止" || e.status === "終了" || e.status === "実施済") return null;
  const today = Math.floor(nowAbs / 1440);
  if (o.type === "injection") {
    const { to } = orderInterval(e, nowAbs);
    return to === null || to > nowAbs ? "注射" : null;
  }
  if (o.type === "prescription") {
    if (o.category === "退院時") return null;
    const end = orderEndDay(o);
    return end === null || end >= today ? "内服" : null;
  }
  if (o.type === "procedure") {
    // The 退院 order is the discharge itself.
    if (o.code === "PROC-LEAVE" && o.leave?.kind === "退院") return null;
    const { from, to } = procInterval(e, nowAbs);
    const running = o.schedule.kind === "once" ? from > nowAbs : to === null || to > nowAbs;
    if (!running) return null;
    return REQUESTS.includes(o.code) ? "依頼・予約" : "処置";
  }
  if (o.type === "lab") return o.collect.day * 1440 + toMin(o.collect.time) > nowAbs ? "検査" : null;
  if (o.type === "imaging" || o.type === "physio") return examAt(o, e.day * 1440 + toMin(e.time)) > nowAbs ? "検査" : null;
  return null;
}

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

/** Whether a 指示簿 version still asks for anything (a version with nothing left is how it is ended). */
export function standingInForce(s: StandingOrders | undefined): boolean {
  if (!s) return false;
  return !!(s.rest || s.bath || s.vitals || s.weight || s.io || s.calls.length || s.callConscious || s.prn.length || (s.conds ?? []).length);
}

export interface StopGroup {
  key: StopGroupKey;
  label: string;
  entries: OrderEntry[];
}

/** The groups that still have something, in the order of STOP_GROUPS (指示簿 when one is in force). */
export function remainingGroups(entries: OrderEntry[], nowAbs: number, standing?: StandingOrders): StopGroup[] {
  const by = new Map<StopGroupKey, OrderEntry[]>();
  for (const e of entries) {
    const g = remainingGroup(e, nowAbs);
    if (g) by.set(g, [...(by.get(g) ?? []), e]);
  }
  return STOP_GROUPS.flatMap((g) => {
    if (g.key === "指示簿") return standingInForce(standing) ? [{ ...g, entries: [] }] : [];
    const es = by.get(g.key);
    return es?.length ? [{ ...g, entries: es }] : [];
  });
}

/** What the doctor confirmed: the orders to stop, and whether to end the 指示簿. */
export function chosenStops(groups: StopGroup[], keys: StopGroupKey[]): { ids: string[]; standing: boolean; groups: StopGroup[] } {
  const picked = groups.filter((g) => keys.includes(g.key));
  return { ids: picked.flatMap((g) => g.entries.map((e) => e.id)), standing: picked.some((g) => g.key === "指示簿"), groups: picked };
}

/** The 指示簿 version that ends it: nothing left in force, with the reason in その他. */
export function endedStanding(by: string, at: { day: number; time: string }): StandingOrders {
  return { rest: null, bath: null, vitals: null, weight: null, io: null, calls: [], callConscious: false, prn: [], conds: [], other: `退院のため指示簿を終了（${at.time} ${by}）`, by, at };
}
