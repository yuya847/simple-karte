// インシデントレポート of the fictional hospital. The reporter writes what happened and picks the
// 影響度レベル; code only checks what is missing, whether the times make sense, and lists what to do
// next under the fictional hospital's rules (架空の病院の取り決め) and the law (医療法 第6条の10).
// Whether a death is a 医療事故 under the law is decided by the hospital's 管理者, not by this code.
// Reports are for improving the system, not for blaming the person.

import { minutesOf } from "./dates";
import { STAFF, type Role } from "./roles";
import type { DayOffset } from "./types";

export type Place = "病棟" | "外来" | "救急外来" | "手術室" | "透析室" | "検査室" | "薬剤部" | "その他";
export const PLACES: Place[] = ["病棟", "外来", "救急外来", "手術室", "透析室", "検査室", "薬剤部", "その他"];

export type IncidentKind = "転倒・転落" | "薬剤（内服）" | "注射・点滴" | "輸血" | "検査" | "チューブ・ドレーン類" | "医療機器" | "患者誤認" | "食事" | "その他";
export const KINDS: IncidentKind[] = ["転倒・転落", "薬剤（内服）", "注射・点滴", "輸血", "検査", "チューブ・ドレーン類", "医療機器", "患者誤認", "食事", "その他"];

export type Level = "0" | "1" | "2" | "3a" | "3b" | "4a" | "4b" | "5";

export interface LevelInfo {
  level: Level;
  /** 傷害の継続性 */
  continuity: string;
  /** 傷害の程度 */
  degree: string;
  /** 傷害の内容 (the official wording) */
  text: string;
}

/** インシデント影響度分類 (国立大学附属病院医療安全管理協議会), worded as in the source. */
export const LEVELS: LevelInfo[] = [
  { level: "0", continuity: "－", degree: "", text: "エラーや医薬品・医療用具の不具合が見られたが、患者には実施されなかった" },
  { level: "1", continuity: "なし", degree: "", text: "患者への実害はなかった（何らかの影響を与えた可能性は否定できない）" },
  { level: "2", continuity: "一過性", degree: "軽度", text: "処置や治療は行わなかった（患者観察の強化、バイタルサインの軽度変化、安全確認のための検査などの必要性は生じた）" },
  { level: "3a", continuity: "一過性", degree: "中等度", text: "簡単な処置や治療を要した（消毒、湿布、皮膚の縫合、鎮痛剤の投与など）" },
  { level: "3b", continuity: "一過性", degree: "高度", text: "濃厚な処置や治療を要した（バイタルサインの高度変化、人工呼吸器の装着、手術、入院日数の延長、外来患者の入院、骨折など）" },
  { level: "4a", continuity: "永続的", degree: "軽度〜中等度", text: "永続的な障害や後遺症が残ったが、有意な機能障害や美容上の問題は伴わない" },
  { level: "4b", continuity: "永続的", degree: "中等度〜高度", text: "永続的な障害や後遺症が残り、有意な機能障害や美容上の問題を伴う" },
  { level: "5", continuity: "死亡", degree: "", text: "死亡（原疾患の自然経過によるものを除く）" },
];

export const LEVEL_SOURCE =
  "国立大学附属病院長会議常置委員会 医療安全管理体制問題小委員会「国立大学附属病院における医療上の事故等の公表に関する指針」（2005年3月3日）の参考表「医療安全管理協議会で定めた現行の『影響度分類』」 https://www.umin.ac.jp/nuh_open/H17shishin.pdf";

export const levelInfo = (l: Level): LevelInfo => LEVELS.find((x) => x.level === l)!;

const RANK: Record<Level, number> = { "0": 0, "1": 1, "2": 2, "3a": 3, "3b": 4, "4a": 5, "4b": 6, "5": 7 };
/** a is at least as serious as b. */
export const atLeast = (a: Level, b: Level): boolean => RANK[a] >= RANK[b];

export const FACTORS = ["確認不足", "観察不足", "判断", "知識", "技術", "連絡と報告", "勤務の状況", "環境", "医療機器", "患者の要因", "仕組み"] as const;
export type Factor = (typeof FACTORS)[number];

export type IncidentStatus = "報告済" | "医療安全管理室で確認中" | "対策済";
export const STATUSES: IncidentStatus[] = ["報告済", "医療安全管理室で確認中", "対策済"];

/** The status that comes after this one, or null at the end. */
export const nextStatus = (s: IncidentStatus): IncidentStatus | null => STATUSES[STATUSES.indexOf(s) + 1] ?? null;

export interface Moment {
  day: DayOffset;
  time: string;
}

export interface IncidentPatient {
  id: string;
  name: string;
  room: string;
}

/** "508A 北村 博" */
export const patientLabel = (p: IncidentPatient): string => `${p.room} ${p.name}`;

export interface StatusChange {
  status: IncidentStatus;
  by: string;
  at: Moment;
}

export interface IncidentReport {
  id: string;
  occurred: Moment;
  found: Moment;
  place: Place;
  /** What "その他" is, or which ward. */
  placeNote?: string;
  /** The patient, when there is one (the room and name are kept as they were at the time). */
  patient?: IncidentPatient;
  kind: IncidentKind;
  kindNote?: string;
  level: Level;
  what: string;
  response: string;
  factors: Factor[];
  prevention: string;
  reporter: { role: Role; name: string };
  reportedAt: Moment;
  status: IncidentStatus;
  /** Every status, from 報告済 on (append only). */
  log: StatusChange[];
}

/** What the form holds before it is sent. Nothing is chosen at the start. */
export interface IncidentDraft {
  occurredDay: DayOffset | null;
  occurredTime: string;
  foundDay: DayOffset | null;
  foundTime: string;
  place: Place | null;
  placeNote: string;
  patientId: string | null;
  kind: IncidentKind | null;
  kindNote: string;
  level: Level | null;
  what: string;
  response: string;
  factors: Factor[];
  prevention: string;
}

export const emptyDraft = (): IncidentDraft => ({
  occurredDay: null,
  occurredTime: "",
  foundDay: null,
  foundTime: "",
  place: null,
  placeNote: "",
  patientId: null,
  kind: null,
  kindNote: "",
  level: null,
  what: "",
  response: "",
  factors: [],
  prevention: "",
});

/** The days a reporter can pick: 今日・昨日・2日前. */
export const DAY_CHOICES: { value: DayOffset; label: string }[] = [
  { value: 0, label: "今日" },
  { value: -1, label: "昨日" },
  { value: -2, label: "2日前" },
];

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
export const validTime = (t: string): boolean => TIME.test(t.trim());

/** Required fields that are not filled yet (要因 and 再発防止の案 may be added later). */
export function missingOf(d: IncidentDraft): string[] {
  const out: string[] = [];
  if (d.occurredDay === null || !validTime(d.occurredTime)) out.push("発生日時");
  if (d.foundDay === null || !validTime(d.foundTime)) out.push("発見日時");
  if (!d.place) out.push("場所");
  else if (d.place === "その他" && !d.placeNote.trim()) out.push("場所（その他の内容）");
  if (!d.kind) out.push("種類");
  else if (d.kind === "その他" && !d.kindNote.trim()) out.push("種類（その他の内容）");
  if (!d.level) out.push("影響度レベル");
  if (!d.what.trim()) out.push("何が起きたか");
  if (!d.response.trim()) out.push("その後の対応");
  return out;
}

const at = (m: Moment) => m.day * 1440 + minutesOf(m.time);

/** Times that cannot be right: found before it happened, or later than now. */
export function timeProblems(d: IncidentDraft, nowTime: string): string[] {
  const out: string[] = [];
  const now = at({ day: 0, time: nowTime });
  const occ = d.occurredDay !== null && validTime(d.occurredTime) ? at({ day: d.occurredDay, time: d.occurredTime.trim() }) : null;
  const found = d.foundDay !== null && validTime(d.foundTime) ? at({ day: d.foundDay, time: d.foundTime.trim() }) : null;
  if (occ !== null && occ > now) out.push("発生日時がいまより後になっています");
  if (found !== null && found > now) out.push("発見日時がいまより後になっています");
  if (occ !== null && found !== null && found < occ) out.push("発見日時が発生日時より前になっています");
  return out;
}

export interface LevelNote {
  text: string;
  /** Where the rule comes from. */
  rule: "架空の病院の取り決め" | "医療法";
  /** Do it now, by voice as well. */
  urgent?: boolean;
  source?: string;
}

export const ACCIDENT_LAW_SOURCE =
  "医療法 第6条の10（e-Gov法令検索 https://laws.e-gov.go.jp/law/323AC0000000205 ）、厚生労働省「医療事故調査制度に関するQ&A（Q2）」 https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/0000061214.html";

/** What to do next for this level, as the fictional hospital's rules (and the law for level 5). */
export function levelNotes(level: Level): LevelNote[] {
  const H = "架空の病院の取り決め" as const;
  const out: LevelNote[] = [];
  if (!atLeast(level, "2")) out.push({ text: "その日の勤務が終わるまでに、このレポートを出します。", rule: H });
  else out.push({ text: "所属長（病棟の看護師長など）に伝え、その日のうちにこのレポートを出します。", rule: H });
  if (atLeast(level, "2")) out.push({ text: "主治医に伝え、患者の様子と行ったことをカルテに書きます。", rule: H });
  if (atLeast(level, "3b")) {
    out.push({ text: "すぐに医療安全管理者へ口頭でも連絡します（夜間・休日は管理当直へ）。レポートは後からでかまいません。", rule: H, urgent: true });
    out.push({ text: "使った薬・点滴・器具・記録は、捨てたり直したりせずに残します。", rule: H });
    out.push({ text: "患者・家族への説明は主治医が行い、説明したことをカルテに書きます。", rule: H });
  }
  if (atLeast(level, "4a")) out.push({ text: "医療安全管理者から病院長に報告します。", rule: H });
  if (level === "5")
    out.push({
      text: "医療事故調査制度：病院の医療従事者が行った医療に起因する（疑いを含む）死亡・死産で、管理者（病院長）が予期しなかったものは、管理者が判断して、遅滞なく医療事故調査・支援センターへ報告します。報告の前に遺族へ説明し、院内で医療事故調査を行います（第6条の11）。過誤があったかどうかは問いません。当てはまるかどうかを決めるのは管理者で、この画面ではありません。",
      rule: "医療法",
      urgent: true,
      source: ACCIDENT_LAW_SOURCE,
    });
  return out;
}

export const PURPOSE_NOTE = "インシデントレポートは、仕組みを良くするために出すものです。報告した人や関わった人を責めるためのものではありません。";
export const PURPOSE_SOURCE =
  "WHO（World Health Organization：世界保健機関）「WHO Draft Guidelines for Adverse Event Reporting and Learning Systems」（2005年）：報告の仕組みが役立つための一番大事な条件は、報告で罰せられないこと（Non-punitive） https://www.who.int/publications/i/item/WHO-EIP-SPO-QPS-05.3";

/** Builds the report from a complete draft (call missingOf first). */
export function toReport(
  d: IncidentDraft,
  x: { id: string; reporter: { role: Role; name: string }; now: Moment; patient?: IncidentPatient },
): IncidentReport {
  return {
    id: x.id,
    occurred: { day: d.occurredDay!, time: d.occurredTime.trim() },
    found: { day: d.foundDay!, time: d.foundTime.trim() },
    place: d.place!,
    placeNote: d.placeNote.trim() || undefined,
    patient: x.patient,
    kind: d.kind!,
    kindNote: d.kindNote.trim() || undefined,
    level: d.level!,
    what: d.what.trim(),
    response: d.response.trim(),
    factors: FACTORS.filter((f) => d.factors.includes(f)),
    prevention: d.prevention.trim(),
    reporter: x.reporter,
    reportedAt: x.now,
    status: "報告済",
    log: [{ status: "報告済", by: x.reporter.name, at: x.now }],
  };
}

/** The reports with one report's status changed (new arrays; the old ones are not changed). */
export function applyStatus(reports: IncidentReport[], id: string, change: StatusChange): IncidentReport[] {
  return reports.map((r) => (r.id === id ? { ...r, status: change.status, log: [...r.log, change] } : r));
}

export interface IncidentFilter {
  kind: IncidentKind | null;
  level: Level | null;
  status: IncidentStatus | null;
}

/** Filtered, newest report first. */
export function filterReports(reports: IncidentReport[], f: IncidentFilter): IncidentReport[] {
  return reports.filter((r) => (!f.kind || r.kind === f.kind) && (!f.level || r.level === f.level) && (!f.status || r.status === f.status)).sort((a, b) => at(b.reportedAt) - at(a.reportedAt));
}

export const countByStatus = (reports: IncidentReport[]): Record<IncidentStatus, number> =>
  Object.fromEntries(STATUSES.map((s) => [s, reports.filter((r) => r.status === s).length])) as Record<IncidentStatus, number>;

const nurse = { role: STAFF.看護師.role, name: STAFF.看護師.name };
const SAFETY = "医療安全管理者（架空）";

/** Past reports of the fictional hospital, shown when the screen opens. */
export const INITIAL_INCIDENTS: IncidentReport[] = [
  {
    id: "inc-0001",
    occurred: { day: -4, time: "03:10" },
    found: { day: -4, time: "03:15" },
    place: "病棟",
    placeNote: "5階東病棟",
    patient: { id: "90010198", room: "508A", name: "北村 博" },
    kind: "転倒・転落",
    level: "2",
    what: "夜間、ナースコールを押さずに1人でトイレへ歩こうとして、ベッドの横で尻もちをついているのを巡回のときに見つけた。本人は「頭は打っていない」と話した。",
    response: "当直医に報告し、診察を受けた。意識・麻痺・瞳孔・バイタルサインを朝まで時間を追って観察し、変化はなかった。朝に主治医へ報告した。",
    factors: ["観察不足", "患者の要因", "環境"],
    prevention: "夜間に排泄で起きる時間を申し送りで共有し、その前に声をかけて付き添う。ベッドの高さを下げ、ナースコールを手の届く所に置く。",
    reporter: nurse,
    reportedAt: { day: -4, time: "06:30" },
    status: "対策済",
    log: [
      { status: "報告済", by: nurse.name, at: { day: -4, time: "06:30" } },
      { status: "医療安全管理室で確認中", by: SAFETY, at: { day: -4, time: "10:00" } },
      { status: "対策済", by: SAFETY, at: { day: -2, time: "16:00" } },
    ],
  },
  {
    id: "inc-0002",
    occurred: { day: -1, time: "08:05" },
    found: { day: -1, time: "12:10" },
    place: "病棟",
    placeNote: "5階東病棟",
    patient: { id: "90010260", room: "511", name: "森 久美子" },
    kind: "薬剤（内服）",
    level: "1",
    what: "朝食後の内服薬（整腸剤）を配り忘れた。昼の配薬のときに、配薬カートに朝の分が残っているのに気づいた。",
    response: "主治医に報告した。指示で朝の分は飲まず、昼から続けた。患者に説明し、様子に変わりはない。",
    factors: ["確認不足", "勤務の状況"],
    prevention: "配薬のあとに、配薬カートの朝の段が空になっているかをもう1人と確かめる。",
    reporter: nurse,
    reportedAt: { day: -1, time: "13:00" },
    status: "医療安全管理室で確認中",
    log: [
      { status: "報告済", by: nurse.name, at: { day: -1, time: "13:00" } },
      { status: "医療安全管理室で確認中", by: SAFETY, at: { day: -1, time: "16:30" } },
    ],
  },
  {
    id: "inc-0003",
    occurred: { day: -2, time: "14:20" },
    found: { day: -2, time: "14:20" },
    place: "病棟",
    placeNote: "5階東病棟",
    kind: "医療機器",
    level: "0",
    what: "輸液ポンプを使う前の点検で、アラームの音量が一番小さくなっているのを見つけた。患者にはまだ使っていない。",
    response: "使うのをやめて臨床工学室に連絡し、別のポンプに替えた。点検のあと、音量を元に戻して返してもらった。",
    factors: ["医療機器", "仕組み"],
    prevention: "貸し出しのときの点検表に、アラーム音量の確認を足す。",
    reporter: nurse,
    reportedAt: { day: -2, time: "15:00" },
    status: "報告済",
    log: [{ status: "報告済", by: nurse.name, at: { day: -2, time: "15:00" } }],
  },
];
