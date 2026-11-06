// 閲覧制限: a doctor marks a patient (a member of staff, a well-known person …) whose chart only the care
// team opens as usual. Anyone else gives a reason first (a "break the glass" step), and every open is
// logged. Code works out who is on the care team and shows it; whether to open, and why, is the person's.

import { onTeamOf } from "./doctors";
import { teamOf as nurseTeamOf } from "./phs";
import type { Role } from "./roles";
import type { DayOffset } from "./types";
import { WARD_NAME, floorOf, nurseFor } from "./ward";

export const LIMIT_SOURCES = {
  scope: {
    label: "厚生労働省「医療情報システムの安全管理に関するガイドライン 第7.0版 システム運用編」14.2 アクセス権限の管理：情報の区分と利用者のグループごとに利用権限を決め、権限は必要最小限にする",
    url: "https://www.mhlw.go.jp/content/10808000/001716295.pdf",
  },
  log: {
    label: "同 17 証跡のレビュー・システム監査 遵守事項①：アクセスログを記録し、定期的に確かめる（少なくとも、利用者・時刻・操作した医療情報が分かるように）",
    url: "https://www.mhlw.go.jp/content/10808000/001716295.pdf",
  },
};

/** What the guideline leaves to the hospital; this fictional hospital's choices. */
export const LIMIT_RULES = {
  who: "閲覧制限の設定と解除は医師が行い、理由を残します。",
  team: "担当チーム：主治医とそのチームの医師、その部屋の受け持ち看護師、この勤務の受け持ちチーム（5階東 A・B）を選んだ看護師。",
  glass: "担当チームのほかの人が開くときは、理由を選んで残してから開きます。開いた記録は監査ログに残り、あとで確かめます。",
};

export const LIMIT_KINDS = ["職員", "著名人など（VIP）", "本人・家族の希望", "その他"] as const;
export type LimitKind = (typeof LIMIT_KINDS)[number];

export interface When {
  day: DayOffset;
  time: string;
}

/** One setting or removal; every one is kept, the last per patient is in force. */
export interface AccessLimit {
  id: string;
  patientId: string;
  on: boolean;
  kind?: LimitKind;
  reason: string;
  by: string;
  at: When;
}

/** The example limit (森 久美子, a member of this fictional hospital's staff): kept for the tests and for turning on by hand. */
export const EXAMPLE_LIMIT: AccessLimit = { id: "limit-90010260-1", patientId: "90010260", on: true, kind: "職員", reason: "当院の職員。本人の希望により、担当チームのほかは理由を残して開く", by: "山本（専攻医）", at: { day: -2, time: "21:10" } };
/** No chart is limited at the start (ユーザー 2026-11-05：「閲覧制限はオフでいい、一旦」). Turn one on from the chart's 閲覧制限 tool. */
export const INITIAL_LIMITS: AccessLimit[] = [];

/** The limit in force for the patient, or null. */
export function currentLimit(all: AccessLimit[], patientId: string): AccessLimit | null {
  const last = all.filter((l) => l.patientId === patientId).at(-1);
  return last?.on ? last : null;
}

/** Why the setting cannot be saved yet, or null. */
export function limitProblem(on: boolean, kind: LimitKind | "", reason: string): string | null {
  if (on && !kind) return "区分を選んでください。";
  if (!reason.trim()) return on ? "閲覧制限にする理由を書いてください。" : "外す理由を書いてください。";
  return null;
}

/** Who may set or remove it (架空の病院の取り決め). */
export const limitDeny = (role: Role): string | null => (role === "医師" ? null : `閲覧制限の設定と解除は医師が行います（いまは${role}で入っています）。`);

export interface Viewer {
  role: Role;
  name: string;
}

export interface TeamPatient {
  attending: string;
  room: string;
}

/** The care team of a patient, as shown on the reason step (the basis of the check). */
export function careTeam(p: TeamPatient): { attending: string; nurse: string; nurseTeam: string | null } {
  const onWard = floorOf(p.room) === WARD_NAME;
  return { attending: p.attending, nurse: nurseFor(p.room), nurseTeam: onWard ? `5階東 ${nurseTeamOf(p.room)} チーム` : null };
}

/**
 * On the care team: a doctor of the attending's team; the room's nurse, or a nurse who chose the room's
 * team (A/B) for this shift. Everyone else (other jobs, other teams) gives a reason.
 */
export function inCareTeam(v: Viewer, p: TeamPatient, nurseTeam: string): boolean {
  if (v.role === "医師") return onTeamOf(v.name, p.attending);
  if (v.role === "看護師") return nurseFor(p.room) === v.name || (!!nurseTeam && floorOf(p.room) === WARD_NAME && nurseTeamOf(p.room) === nurseTeam);
  return false;
}

export const GLASS_REASONS = ["当直・休日の診療", "急変・救急の対応", "依頼を受けた診療（他科依頼など）", "薬剤・検査・栄養・退院支援などの業務", "医事・診療情報の業務", "その他"] as const;
export type GlassReason = (typeof GLASS_REASONS)[number];

/** A reason given to open a limited chart (kept for the session's record, and logged). */
export interface GlassEntry {
  id: string;
  patientId: string;
  by: string;
  role: Role;
  at: When;
  reason: GlassReason;
  note: string;
}

/** Why the reason is not enough yet, or null. */
export function glassProblem(reason: GlassReason | "", note: string): string | null {
  if (!reason) return "理由を選んでください。";
  if (reason === "その他" && !note.trim()) return "「その他」のときは、理由を書いてください。";
  return null;
}

/** The reason this person gave for this patient (the latest), if any. */
export const grantOf = (all: GlassEntry[], patientId: string, by: string): GlassEntry | undefined => all.filter((g) => g.patientId === patientId && g.by === by).at(-1);

export const glassText = (g: Pick<GlassEntry, "reason" | "note">) => `${g.reason}${g.note.trim() ? `：${g.note.trim()}` : ""}`;

/** The audit event of opening a chart: plain, on the care team of a limited patient, waiting for a reason, or with a reason. */
export function openEvent(limit: AccessLimit | null, inTeam: boolean, grant: GlassEntry | undefined): { action: string; detail?: string; restricted?: true } {
  if (!limit) return { action: "カルテを開いた" };
  if (inTeam) return { action: "カルテを開いた", detail: "閲覧制限の患者（担当チームとして）", restricted: true };
  if (grant) return { action: `閲覧制限の患者を開いた（${grant.reason}）`, detail: `${grant.at.time} に残した理由：${glassText(grant)}`, restricted: true };
  return { action: "閲覧制限の患者を選んだ（理由の入力へ）", restricted: true };
}
