// 主治医・担当医・コンサルト医: the doctors of a patient besides the attending (主治医, kept in Patient.attending).
// A doctor on a team (担当医) or asked by 他科依頼 (コンサルト医) sees the patient on their own lists, so a
// patient they look after is never missed. Who is added is decided by a doctor; the code only keeps the list,
// matches names and writes the marks. A consult order not yet answered puts the asked department's doctor
// on the list as 「依頼中」 (provisional) until the reply names who took it. All names are fictional.

import { doctorsIn } from "./consult";
import { onTeamOf } from "./doctors";
import type { DayOffset, HistoryEntry } from "./types";
import { doctorFor } from "./ward";

export type DoctorRole = "担当医" | "コンサルト医";

export interface OtherDoctor {
  name: string;
  role: DoctorRole;
  /** The doctor's department (shown for a コンサルト医: 「コンサルト 循環器内科 中川」). */
  department?: string;
  since: { day: DayOffset; time: string };
  /** Who put the doctor on the list. */
  by: string;
  note?: string;
  /** 依頼中: taken from a consult order nobody has answered yet (not kept; it follows the order). */
  pending?: boolean;
}

export interface PatientDoctors {
  attending: string;
  others: OtherDoctor[];
}

/** What is kept per patient id (the attending is in the patient's record). */
export type DoctorBook = Record<string, OtherDoctor[]>;

export type Relation = "主治医" | DoctorRole;

const same = (a: OtherDoctor, b: Pick<OtherDoctor, "name" | "role">) => a.name === b.name && a.role === b.role;

/** Add a doctor; the same person in the same role replaces the earlier entry (a provisional one included). */
export function addDoctor(list: OtherDoctor[], d: OtherDoctor): OtherDoctor[] {
  return [...list.filter((x) => !same(x, d)), d];
}

export function removeDoctor(list: OtherDoctor[], name: string, role: DoctorRole): OtherDoctor[] {
  return list.filter((x) => !(x.name === name && x.role === role));
}

/**
 * コンサルト医 from the 他科依頼 orders (PROC-CONSULT) still in force: answered ones name the doctor who
 * replied; the others put the asked department's doctor on the list as 依頼中.
 */
export function consultDoctors(entries: HistoryEntry[], replies: Record<string, { by: string; at: string; closed?: boolean }>, whoOf: (department: string) => string = doctorFor): OtherDoctor[] {
  const out: OtherDoctor[] = [];
  for (const e of entries) {
    if (e.kind !== "order" || e.status !== "有効" || e.order.type !== "procedure" || e.order.code !== "PROC-CONSULT" || !e.order.consult) continue;
    const dept = e.order.consult.dept;
    const r = replies[e.id];
    if (r?.closed) continue;
    const d: OtherDoctor = r && r.by
      ? { name: r.by, role: "コンサルト医", department: dept, since: { day: 0, time: r.at }, by: r.by, note: "他科依頼の返書" }
      : { name: e.order.consult.doctor === "" ? (doctorsIn(dept)[0]?.name || whoOf(dept)) : (e.order.consult.doctor ?? whoOf(dept)), role: "コンサルト医", department: dept, since: { day: e.day, time: e.time }, by: e.author, note: "他科依頼（返書待ち）", pending: true };
    const names = !r && e.order.consult.doctor === "" ? doctorsIn(dept).map(x => x.name) : [];
    for (const name of names.length ? names : [d.name]) {
      const next = { ...d, name };
      if (!out.some((x) => same(x, next))) out.push(next);
    }
  }
  return out;
}

/** The list as it stands: what was registered, plus the consult orders (a registered doctor wins over a provisional one). */
export function doctorsOf(attending: string, kept: OtherDoctor[] | undefined, fromOrders: OtherDoctor[] = []): PatientDoctors {
  let others = kept ?? [];
  for (const d of fromOrders) if (!others.some((x) => same(x, d))) others = [...others, d];
  return { attending, others };
}

/** How this doctor relates to the patient: on the attending's team → 主治医; else as registered; else none. */
export function relationOf(name: string, pd: PatientDoctors): Relation | null {
  if (onTeamOf(name, pd.attending)) return "主治医";
  const roles = pd.others.filter((d) => d.name === name).map((d) => d.role);
  if (roles.includes("担当医")) return "担当医";
  if (roles.includes("コンサルト医")) return "コンサルト医";
  return null;
}

export const involved = (name: string, pd: PatientDoctors): boolean => relationOf(name, pd) !== null;

/** The short mark for a list row: 主治医／担当／コンサルト. */
export const relationMark = (r: Relation): string => (r === "担当医" ? "担当" : r === "コンサルト医" ? "コンサルト" : "主治医");

/** One doctor as written in the patient bar: 「担当医 研修医 田中」「コンサルト 循環器内科 中川（依頼中）」. */
export const doctorLabel = (d: OtherDoctor): string => `${relationMark(d.role)}${d.role === "担当医" ? "医" : ""} ${d.department && d.role === "コンサルト医" && !d.name.includes(d.department) ? `${d.department} ` : ""}${d.name}${d.pending ? "（依頼中）" : ""}`;

/** The whole line: 「主治医 山本（専攻医）／担当医 研修医 田中／コンサルト 中川（循環器内科）」. */
export const doctorsLine = (pd: PatientDoctors): string => [`主治医 ${pd.attending}`, ...pd.others.map(doctorLabel)].join("／");

/** Every doctor's name on the list (for the 主治医 pulldown and 「主治医別」). */
export const doctorNames = (pd: PatientDoctors): string[] => [pd.attending, ...pd.others.map((d) => d.name)].filter((n, i, xs) => xs.indexOf(n) === i);

/** Fictional starting point (架空): the team's 研修医 and two consultants on our patients; 山本 asked about two other teams' patients. */
export const INITIAL_DOCTOR_BOOK: DoctorBook = {
  // 佐倉 修（総合診療科、主治医 山本）: the team's resident, and 循環器内科 asked about the heart.
  "90010231": [
    { name: "研修医 田中", role: "担当医", since: { day: -3, time: "09:00" }, by: "山本（専攻医）", note: "入院時から担当" },
    { name: "中川（循環器内科）", role: "コンサルト医", department: "循環器内科", since: { day: -1, time: "15:00" }, by: "中川（循環器内科）", note: "他科依頼の返書（心房細動の管理）" },
  ],
  // 大浦 トメ: the resident.
  "90010244": [{ name: "研修医 田中", role: "担当医", since: { day: -5, time: "09:00" }, by: "山本（専攻医）" }],
  // 北村 博: 腎臓内科 asked about the kidneys.
  "90010198": [{ name: "井上（腎臓内科）", role: "コンサルト医", department: "腎臓内科", since: { day: -2, time: "16:30" }, by: "井上（腎臓内科）", note: "他科依頼の返書（腎機能低下）" }],
  // 505-D 小池 隆（循環器内科、主治医 中川）and 503 村井 和子（消化器内科、主治医 田村）: 山本 was asked to see them.
  "90035054": [{ name: "山本（専攻医）", role: "コンサルト医", department: "総合診療科", since: { day: -1, time: "11:00" }, by: "山本（専攻医）", note: "他科依頼の返書（発熱の精査）" }],
  "90035030": [{ name: "山本（専攻医）", role: "コンサルト医", department: "総合診療科", since: { day: -2, time: "14:00" }, by: "山本（専攻医）", note: "他科依頼の返書（せん妄の対応）" }],
};
