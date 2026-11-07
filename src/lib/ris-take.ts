import { risScheduleText } from "./ris";
// 放射線部の指示受け（診療放射線技師）: the imaging orders the doctors gave (X線・CT・MRI・ポータブル), in the
// same form as the ward's 指示受け (order-take.ts / order-sheet.ts, after the 富士通 HOPE/EGMAIN-GX catalog): the
// untaken ones by day and kind, which must be taken one at a time, the band marks of a patient (infection,
// contrast allergy, pregnancy, metal), the 「項目名：値」 lines, the 指示確認 items of a contrast or MRI study
// (consent, kidney function, allergy, metformin / metal, pacemaker, claustrophobia), the day's worklist per
// room and device, and the round of portable studies by room. Code lists and compares; the technologist and
// the doctors decide. Nothing here calls AI.

import type { ConsentRecord } from "./consent";
import { addDays, formatShort, type CalendarDate } from "./dates";
import { egfr, findRegion, latestCre, type ImagingOrder } from "./exams";
import { abs } from "./flowsheet";
import { findOralDrug } from "./master";
import { CONFIRM_SOURCES } from "./order-confirm";
import type { SheetField, Stamp as SheetStamp } from "./order-sheet";
import { findRoom, RIS_ROOMS, type RisRoom, type RisRow, type RisWork } from "./ris";
import type { OrderEntry, Patient } from "./types";

export const RIS_TAKE_SOURCES = [
  CONFIRM_SOURCES[0],
  { label: "日本腎臓学会・日本医学放射線学会・日本循環器学会「腎障害患者におけるヨード造影剤使用に関するガイドライン2018」", url: "https://cdn.jsn.or.jp/data/guideline-201911.pdf" },
  { label: "合同造影剤安全性委員会「ヨード造影剤とビグアナイド系糖尿病薬との併用注意について（第2報）」2012年4月", url: "https://www.radiology.jp/content/files/994.pdf" },
  { label: "日本医学放射線学会「ヨード造影剤問診表 質問項目と推奨度」", url: "https://www.radiology.jp/content/files/827.pdf" },
];

/** What this fictional hospital decided for its radiology 指示受け (架空の病院の取り決め). */
export const RIS_TAKE_RULES = {
  one: "至急・造影・MRI・妊娠中の指示は、まとめて受けずに1件ずつ受けます（造影は同意・腎機能・アレルギー、MRI は体内金属を確かめるため）。",
  late: "遅れの目安は、至急 15分・ほかは 60分（指示から）、または予定の時刻を過ぎたもの。ワークリストは予定から 15分を過ぎて始まっていないものを遅れとします。",
  rooms: "装置は一般撮影室1・CT室・MRI室・回診用（ポータブル）の4つ。X線室は1室です。",
  pregnancy: "12〜55歳の女性の X線・CT では妊娠の可能性を確かめます（医師のオーダの確認と同じ範囲）。",
};

// ---------------------------------------------------------------------------
// The kinds to tick at the top, the days, taken or not, one at a time, late
// ---------------------------------------------------------------------------

export type RisTakeKind = "X線" | "CT" | "MRI" | "エコー" | "ポータブル";
export const RIS_TAKE_KINDS: RisTakeKind[] = ["X線", "CT", "MRI", "エコー", "ポータブル"];

/** The kind a modality is ticked under (エコー is here for a modality the order master may add). */
export function kindOf(modality: string): RisTakeKind {
  if (modality === "ポータブルX線") return "ポータブル";
  if (/エコー|超音波/.test(modality)) return "エコー";
  if (modality === "CT" || modality === "MRI") return modality;
  return "X線";
}

/** The days the screen moves through (yesterday … tomorrow), as the ward's 指示受け. */
export const RIS_TAKE_DAYS = { min: -1, max: 1 } as const;

/** A row belongs to a day when the order was given that day or is booked for that day. */
export const risTakeOnDay = (r: Pick<RisRow, "orderedAt" | "order">, day: number) => r.orderedAt.day === day || r.order.when.day === day;

/** Taken (指示受け・受付) by the technologist. */
export const isTakenRis = (r: Pick<RisRow, "work">) => !!r.work?.arrived;

export const usesContrast = (o: Pick<ImagingOrder, "contrast">) => !!o.contrast && o.contrast !== "単純";

/** Why the row must be taken one at a time (empty = may be taken in bulk). 架空の病院の取り決め. */
export function mustTakeOne(r: Pick<RisRow, "order" | "pregnancy">): string[] {
  const out: string[] = [];
  if (r.pregnancy) out.push("妊娠中");
  if (r.order.when.priority === "至急") out.push("至急");
  if (usesContrast(r.order)) out.push("造影（同意・腎機能・アレルギーを確かめる）");
  if (r.order.modality === "MRI") out.push("MRI（体内金属の確認）");
  return out;
}

export const RIS_TAKE_LATE_MIN = { urgent: 15, other: 60 } as const;

/** Untaken and late: 至急 15分・ほかは 60分 since the order, or the booked time has passed. */
export function risTakeLate(r: Pick<RisRow, "work" | "order" | "orderedAt" | "at">, nowAbs: number): boolean {
  if (isTakenRis(r)) return false;
  const since = nowAbs - abs(r.orderedAt.day, r.orderedAt.time);
  if (r.order.when.priority === "至急") return since >= RIS_TAKE_LATE_MIN.urgent;
  return since >= RIS_TAKE_LATE_MIN.other || nowAbs >= r.at;
}

export interface RisFlag {
  text: string;
  tone: "shu" | "yamabuki" | "ink";
}

/** The marks on a row: 至急・造影・MRI（金属）. */
export function rowFlags(r: Pick<RisRow, "order">): RisFlag[] {
  const f: RisFlag[] = [];
  if (r.order.when.priority === "至急") f.push({ text: "至急", tone: "shu" });
  if (usesContrast(r.order)) f.push({ text: `造影（${r.order.contrast}）`, tone: "yamabuki" });
  if (r.order.modality === "MRI") f.push({ text: r.order.answers?.metal ? `体内金属 ${r.order.answers.metal}` : "体内金属の確認がまだ", tone: r.order.answers?.metal ? "ink" : "yamabuki" });
  return f;
}

// ---------------------------------------------------------------------------
// The band of a patient: what the technologist must see before calling
// ---------------------------------------------------------------------------

type PatientFacts = Pick<Patient, "sex" | "age" | "allergies" | "infections" | "pregnancy">;

/** Of child-bearing age for the pregnancy question (the same range the doctor's order check uses, 架空). */
export const askPregnancy = (p: Pick<PatientFacts, "sex" | "age" | "pregnancy">) => !!p.pregnancy || (p.sex === "女" && p.age >= 12 && p.age <= 55);

const irradiates = (m: string) => m !== "MRI" && kindOf(m) !== "エコー";

/** Marks in the band: infections, contrast allergy, pregnancy, metal (for the rows of this patient). */
export function patientMarks(p: PatientFacts, rows: Pick<RisRow, "order">[]): RisFlag[] {
  const out: RisFlag[] = p.infections.map((x) => ({ text: `感染症：${x}`, tone: "shu" as const }));
  for (const a of p.allergies) if (/造影剤|ヨード|ガドリニウム/.test(a)) out.push({ text: `アレルギー：${a}`, tone: "shu" });
  if (p.pregnancy) out.push({ text: `妊娠中${p.pregnancy.weeks ? `（${p.pregnancy.weeks}週）` : ""}`, tone: "shu" });
  else if (askPregnancy(p) && rows.some((r) => irradiates(r.order.modality))) {
    const answered = rows.filter((r) => irradiates(r.order.modality)).every((r) => r.order.answers?.pregnancy);
    out.push(answered ? { text: `妊娠 ${rows.find((r) => r.order.answers?.pregnancy)!.order.answers!.pregnancy}`, tone: "ink" } : { text: "妊娠の可能性を確かめる", tone: "yamabuki" });
  }
  const mri = rows.filter((r) => r.order.modality === "MRI");
  if (mri.length) {
    const metal = mri.find((r) => r.order.answers?.metal)?.order.answers?.metal;
    out.push(metal ? { text: `体内金属（MRI）${metal}`, tone: "ink" } : { text: "体内金属（MRI）の確認がまだ", tone: "yamabuki" });
  }
  return out;
}

// ---------------------------------------------------------------------------
// The block of one order: heading, 「項目名：値」 lines, the three 「日時／者」 pairs
// ---------------------------------------------------------------------------

/** "CT　腹部・骨盤　単純＋造影" → the heading: kind, region and contrast. */
export function risTakeTitle(r: Pick<RisRow, "order">): string {
  const o = r.order;
  const region = findRegion(o.region)?.name ?? o.region;
  return [o.modality, region, o.contrast].filter(Boolean).join("　");
}

const dayText = (today: CalendarDate, day: number, time?: string) => `${formatShort(addDays(today, day))}${time ? ` ${time}` : ""}`;

/** The 「項目名：値」 lines of an imaging order (only the items the order has). `consent` is the consent form's state when one exists. */
export function risTakeFields(r: Pick<RisRow, "order" | "orderedAt" | "at">, today: CalendarDate, consent?: string): SheetField[] {
  const o = r.order;
  const f: SheetField[] = [];
  const put = (label: string, value: string | undefined | null | false) => {
    if (value) f.push({ label, value });
  };
  put("部位", findRegion(o.region)?.name ?? o.region);
  put("体位・方向", [o.position, o.views?.join("＋")].filter(Boolean).join("・"));
  put("造影", o.contrast);
  put("読影", o.reading);
  put("予定", o.when.priority === "至急" ? risScheduleText(r) : `${dayText(today, o.when.day, o.when.time)} 予約`);
  put("搬送", o.transport);
  put("同意", consent ?? (usesContrast(o) ? "同意書の記録なし" : undefined));
  put("医師の確認", o.acks?.join("・"));
  put("体内金属", o.answers?.metal);
  put("妊娠", o.answers?.pregnancy);
  put("依頼目的", o.purpose);
  put("備考", o.comment);
  return f;
}

/** The labels of the three pairs on the right (the ward's are 指示開始・実施・指示受け). */
export const RIS_STAMP_LABELS = { start: ["指示日時", "指示医"], done: ["予定日時", "撮影室・装置"], take: ["指示受け日時", "受けた技師"] } as const;

const stampDay = (today: CalendarDate, s: { day: number; time: string }) => (s.day === 0 ? s.time : `${formatShort(addDays(today, s.day))} ${s.time}`);

export function risStamps(r: Pick<RisRow, "order" | "orderedAt" | "orderedBy" | "work">, today: CalendarDate): { start: SheetStamp; done: SheetStamp; take: SheetStamp } {
  const w = r.work;
  const room = findRoom(w?.room);
  const o = r.order;
  return {
    start: { at: dayText(today, r.orderedAt.day, r.orderedAt.time), by: r.orderedBy },
    done: { at: o.when.priority === "至急" ? risScheduleText(r) : w?.slot ? dayText(today, w.slot.day, w.slot.time) : dayText(today, o.when.day, o.when.time), by: room ? `${room.room}（${room.ae}）` : "" },
    take: w?.arrived ? { at: stampDay(today, w.arrived), by: w.arrived.by } : { at: "", by: "" },
  };
}

/** The consent form's state for an order, in words ("同意 11/3（火）" / "説明前"), or undefined when there is none. */
export function consentTextOf(orderId: string, consents: Pick<ConsentRecord, "orderId" | "status" | "explainedAt">[] | undefined, today: CalendarDate): string | undefined {
  const c = consents?.find((x) => x.orderId === orderId);
  if (!c) return undefined;
  return c.explainedAt ? `${c.status}（${dayText(today, c.explainedAt.day, c.explainedAt.time)}）` : c.status;
}

// ---------------------------------------------------------------------------
// 指示確認: what a contrast or MRI study asks the technologist to look at
// ---------------------------------------------------------------------------

export interface ConfirmItem {
  label: string;
  value: string;
  /** ok = nothing stands out, warn = something in the record to weigh, ask = not in the record, ask the patient or the doctor. */
  tone: "ok" | "warn" | "ask";
}

/** Contrast (CT・MRI) and MRI studies are confirmed before the patient is called (架空の病院の取り決め). */
export const needsRisConfirm = (o: Pick<ImagingOrder, "modality" | "contrast">) => usesContrast(o) || o.modality === "MRI";

/** Taken, needing confirmation, not yet confirmed, not finished. */
export const confirmPending = (r: Pick<RisRow, "order" | "work">) => isTakenRis(r) && needsRisConfirm(r.order) && !r.work?.confirmed && !r.work?.done && !r.work?.notDone;

const CRE_STALE_DAYS = 90;

/** The items of 指示確認, from the order, the patient's record and the running prescriptions. */
export function risConfirmItems(r: Pick<RisRow, "orderId" | "order">, patient: Patient, entries: OrderEntry[], consents: Pick<ConsentRecord, "orderId" | "status" | "explainedAt">[] | undefined, today: CalendarDate): ConfirmItem[] {
  const o = r.order;
  const items: ConfirmItem[] = [];
  const acks = o.acks ?? [];
  if (usesContrast(o)) {
    const gd = o.modality === "MRI";
    const consent = consentTextOf(r.orderId, consents, today);
    const form = consents?.find((c) => c.orderId === r.orderId);
    const consented = form ? form.status === "同意" : o.consent?.state === "取得済み";
    items.push(consented ? { label: "同意", value: consent || "同意書取得済み", tone: "ok" } : consent ? { label: "同意", value: consent, tone: consented ? "ok" : "ask" } : { label: "同意", value: gd ? "MRI の造影には同意書の様式がありません。医師の説明を確かめる" : "同意書の記録がありません。医師に確かめる", tone: "ask" });
    const cre = latestCre(patient);
    if (cre) {
      const e = egfr(cre.value, patient.age, patient.sex);
      const stale = cre.day < -CRE_STALE_DAYS;
      items.push({
        label: "腎機能",
        value: `Cre ${cre.value} mg/dL（${formatShort(addDays(today, cre.day))}）・eGFR ${e}${stale ? "。測定から90日を超えている" : e < 30 ? "。eGFR 30未満" : ""}${acks.includes("腎機能承知") ? "。医師：腎機能承知" : ""}`,
        tone: stale || e < 30 ? "warn" : "ok",
      });
    } else items.push({ label: "腎機能", value: "Cre の値がありません。医師に確かめる", tone: "ask" });
    const allergy = patient.allergies.filter((a) => /造影剤|ヨード|ガドリニウム/.test(a) && (gd ? /ガドリニウム/.test(a) : !/ガドリニウム/.test(a)));
    items.push(allergy.length ? { label: gd ? "ガドリニウムのアレルギー" : "ヨードのアレルギー", value: `${allergy.join("、")}${acks.includes("造影剤アレルギー承知") ? "。医師：承知" : ""}`, tone: "warn" } : { label: gd ? "ガドリニウムのアレルギー" : "ヨードのアレルギー", value: "記録なし", tone: "ok" });
    const asthma = patient.allergies.find((a) => a.includes("喘息"));
    if (asthma) items.push({ label: "喘息", value: `${asthma}${acks.includes("喘息承知") ? "。医師：承知" : ""}`, tone: "warn" });
    if (!gd) {
      const bg = entries.filter((e) => e.status === "有効" && e.order.type === "prescription" && findOralDrug(e.order.drugCode)?.classes?.includes("ビグアナイド系")).map((e) => findOralDrug((e.order as { drugCode: string }).drugCode)!.name);
      items.push(bg.length ? { label: "メトホルミン（ビグアナイド系）", value: `${bg.join("、")} 内服中${acks.includes("ビグアナイド休薬指示済み") ? "。医師：休薬の指示済み" : "。休薬の指示を医師に確かめる"}`, tone: acks.includes("ビグアナイド休薬指示済み") ? "warn" : "ask" } : { label: "メトホルミン（ビグアナイド系）", value: "内服なし", tone: "ok" });
    }
  }
  if (o.modality === "MRI") {
    items.push(o.answers?.metal ? { label: "体内金属", value: o.answers.metal, tone: /なし/.test(o.answers.metal) ? "ok" : "warn" } : { label: "体内金属", value: "オーダに確認がありません。入室の前に本人に聞く", tone: "ask" });
    const texts = [...patient.cautions, ...(patient.contraindications ?? []), o.answers?.metal ?? ""];
    const pm = texts.find((t) => /ペースメーカ|ICD|人工内耳/.test(t));
    items.push(pm ? { label: "ペースメーカー・人工内耳", value: pm, tone: "warn" } : { label: "ペースメーカー・人工内耳", value: "カルテに記載なし。入室の前に本人に聞く", tone: "ask" });
    const claus = texts.find((t) => /閉所/.test(t));
    items.push(claus ? { label: "閉所", value: claus, tone: "warn" } : { label: "閉所", value: "カルテに記載なし。本人に聞く", tone: "ask" });
  }
  if (irradiates(o.modality) && askPregnancy(patient)) {
    items.push(patient.pregnancy ? { label: "妊娠", value: `妊娠中${patient.pregnancy.weeks ? `（${patient.pregnancy.weeks}週）` : ""}。放射線科医と相談`, tone: "warn" } : o.answers?.pregnancy ? { label: "妊娠", value: o.answers.pregnancy, tone: /なし/.test(o.answers.pregnancy) ? "ok" : "warn" } : { label: "妊娠", value: "オーダに確認がありません。本人に聞く", tone: "ask" });
  }
  return items;
}

// ---------------------------------------------------------------------------
// The day's worklist per room and device, and the round of portable studies
// ---------------------------------------------------------------------------

export interface WorklistLane {
  room: RisRoom;
  rows: RisRow[];
}

const dayOfRow = (r: RisRow) => (r.work?.slot ? r.work.slot.day : Math.floor(r.at / 1440));

/** The taken studies of a day by room, in time order; those without a room apart. */
export function worklist(rows: RisRow[], day: number): { lanes: WorklistLane[]; unassigned: RisRow[] } {
  const mine = rows.filter((r) => isTakenRis(r) && !r.work?.notDone && dayOfRow(r) === day).sort((a, b) => a.at - b.at);
  return {
    lanes: RIS_ROOMS.map((room) => ({ room, rows: mine.filter((r) => r.work?.room === room.key) })),
    unassigned: mine.filter((r) => !r.work?.room),
  };
}

export type WorkStep = "呼出" | "来室" | "撮影開始" | "撮影終了" | "画像送信" | "済";

/** The next step of a taken study. A portable has no 呼出 (the technologist goes to the room). */
export function nextStep(r: Pick<RisRow, "order" | "work">): WorkStep {
  const w = r.work;
  if (w?.images) return "済";
  if (w?.done) return "画像送信";
  if (w?.started) return "撮影終了";
  if (w?.inRoom) return "撮影開始";
  if (w?.called || r.order.modality === "ポータブルX線") return "来室";
  return "呼出";
}

/** 呼出: an outpatient or ER patient goes on the waiting room display; a ward patient is brought by the ward. */
export const callHow = (room: string): NonNullable<RisWork["called"]>["how"] => (/外来|救急/.test(room) ? "待合の表示" : "病棟へ搬送依頼");

export const WORKLIST_LATE_MIN = 15;

/** Booked time passed by 15 minutes and not started (架空の病院の取り決め). */
export const worklistLate = (r: Pick<RisRow, "at" | "work">, nowAbs: number) => !r.work?.started && !r.work?.notDone && nowAbs - r.at >= WORKLIST_LATE_MIN;

const roomOrder = (room: string) => {
  const m = room.match(/\d+/);
  return m ? Number(m[0]) : Number.MAX_SAFE_INTEGER;
};

/** The portable studies taken and not yet done, in the order of the rooms (one round of the ward). */
export function portableRound(rows: RisRow[]): RisRow[] {
  return rows.filter((r) => r.order.modality === "ポータブルX線" && isTakenRis(r) && !r.work?.done && !r.work?.notDone).sort((a, b) => roomOrder(a.room) - roomOrder(b.room) || a.room.localeCompare(b.room) || a.at - b.at);
}

// ---------------------------------------------------------------------------
// For the top row's やること
// ---------------------------------------------------------------------------

export interface RisTodo {
  /** Requests nobody took yet. */
  untaken: number;
  /** Taken contrast or MRI studies not yet confirmed. */
  unconfirmed: number;
  /** Today's studies not yet done (taken or not). */
  notDoneToday: number;
}

export function risTodo(rows: RisRow[]): RisTodo {
  return {
    untaken: rows.filter((r) => r.status === "依頼").length,
    unconfirmed: rows.filter(confirmPending).length,
    notDoneToday: rows.filter((r) => dayOfRow(r) === 0 && !r.work?.done && !r.work?.notDone).length,
  };
}

/** A registered form takes precedence over the order snapshot. */
export function consentReady(r: Pick<RisRow, "orderId" | "order">, consents?: Pick<ConsentRecord, "orderId" | "status">[]): boolean {
  const form = consents?.find((c) => c.orderId === r.orderId);
  return form ? form.status === "同意" : r.order.consent?.state === "取得済み";
}

/** 受付と撮影完了で共通の、人による造影前確認。 */
export const CONTRAST_CHECKS = ["腎機能を確かめた", "アレルギーを確かめた", "同意書あり"];
export function contrastSafetyProblems(r: Pick<RisRow, "order">, consentOk: boolean, checks: string[]): string[] {
  if (!usesContrast(r.order)) return [];
  return [...(!consentOk ? ["同意書がありません。"] : []), ...CONTRAST_CHECKS.filter(x => !checks.includes(x)).map(x => x === "同意書あり" ? "同意書の確認がまだです。" : x.replace("を確かめた", "の確認がまだです。"))];
}
