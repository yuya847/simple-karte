// 輸血部門 (the blood bank of the fictional hospital, part of 検査室): each patient's blood typing and
// irregular antibody screen, the bags taken in from the blood centre (製造番号・有効期限), the crossmatch,
// the bag assigned to a transfusion order, issue, the bedside check (wristband and bag barcodes, two
// people), observation at the start, 5 and 15 minutes and the end, adverse reactions, returns and
// disposal, and the record kept for 20 years. The transfusion order itself is the existing PROC-TX
// order (procedures.ts); this file never makes another one.
//
// Whether a bag may go to a patient, what is due and when, what a symptom counts as and how long a
// record is kept are worked out here in code, from the sources below. People read barcodes, type what
// they saw and confirm.

import { addDays, type CalendarDate } from "./dates";
import { abs } from "./flowsheet";
import { TX_GUIDE, TX_NOTICE, TX_PRODUCTS } from "./procedures";
import type { DayOffset, OrderEntry, Patient, TxOrder } from "./types";

// ---------------------------------------------------------------------------
// Sources (read 2026-11-04)
// ---------------------------------------------------------------------------

export const BLOOD_SOURCES = {
  guide: TX_GUIDE,
  notice: TX_NOTICE,
  oldGuideline: {
    label: "厚生労働省「輸血療法の実施に関する指針」（平成17年9月改定版。令和8年3月24日に廃止）",
    url: "https://www.mhlw.go.jp/new-info/kobetu/iyaku/kenketsugo/dl/5tekisei3a.pdf",
  },
  law: { label: "医薬品医療機器等法 第68条の22 第3項・第4項（特定生物由来製品の使用の記録と保存）", url: "https://laws.e-gov.go.jp/law/335AC0000000145" },
  rule: { label: "医薬品医療機器等法施行規則 第237条（記録する事項）・第240条第2項（使用した日から少なくとも20年）", url: "https://laws.e-gov.go.jp/law/336M50000100001" },
  symptoms: { label: "日本輸血・細胞治療学会「輸血副反応の症状項目」（資料1）", url: "https://yuketsu.jstmct.or.jp/wp-content/uploads/2021/06/7b7babe71e8e5a1494c3b844a1ebc344.pdf" },
  reportForm: { label: "日本輸血・細胞治療学会「輸血副反応報告書」（資料5：件数はバッグごと、症状は重複可）", url: "https://yuketsu.jstmct.or.jp/wp-content/uploads/2021/06/96de4421c32ba8f04c56dd1243ae89fb.pdf" },
} as const;

/** Where each rule comes from, in the words shown on the screen. */
export const BLOOD_RULES = {
  typing: "血液型は、異なる時点で採血した2つの検体で確かめ、結果が一致したときに確定する。同じ検体は異なる技師が二重に測る（実践ガイド Ⅰ-3-5)、Ⅱ-2-3)a・b）。",
  antibody: "不規則抗体スクリーニングは間接抗グロブリン試験を必ず含める。臨床的意義のある抗体があれば対応抗原陰性の血液を選ぶ（実践ガイド Ⅰ-3-7)・8)）。",
  sample: "赤血球製剤の依頼には、輸血日を含め3日以内に採血した交差適合試験用の検体を添える（実践ガイド Ⅱ-1-2)c）。",
  crossmatch: "交差適合試験の主試験は間接抗グロブリン試験を含む方法で行い、主試験が陽性の赤血球は輸血に使わない。血漿・血小板の交差適合試験は省略できる（実践ガイド Ⅰ-3-10)・11)）。",
  computer: "コンピュータクロスマッチは、血液型が異なる検体で2回以上・3日以内の検体で臨床的意義のある抗体が過去にもない・入庫後に製剤の ABO をオモテ検査で確かめた、をすべて満たすときに使える（実践ガイド Ⅱ-3-2)a 表1）。",
  same: "輸血には患者と同じ ABO・RhD 型の製剤を使うのが原則（実践ガイド Ⅰ-3-10)）。緊急時の異型適合血は、この試作では扱わない。",
  receive: "入庫では、納品伝票と製剤の本体で製剤の種類・製造番号・有効期限を照合し、外観に異常がないことを確かめて登録する（実践ガイド Ⅱ-1-2)b）。",
  issue: "払出では患者・血液型・製剤の種類・製造番号・有効期限・数量を照合し、払い出した人と受け取った人を残す。一回に払い出すのは直ちに使う最小量、できれば一症例一バッグ（実践ガイド Ⅱ-1-2)d）。",
  bedside: "輸血の前に外観を確かめ、受け渡しと実施のときに患者氏名・血液型・製造番号などを2人で声に出して確かめて記録する。リストバンドと製剤の電子照合も有効（実践ガイド Ⅱ-3-3)a）。準備は一回に一患者。",
  observe: "開始後5分間はベッドサイドで観察し、15分経過後に再び観察する。終了後に患者名・血液型・製造番号を再び確かめ、終了時刻と副反応の有無を記録する（実践ガイド Ⅱ-3-3)b・c）。",
  before: "輸血の前に体温・血圧・脈拍、できれば SpO2（経皮的動脈血酸素飽和度）を測る（廃止前の「輸血療法の実施に関する指針」Ⅶ-1-10)。実践ガイドに同じ記載はないため、この架空の病院の取り決めとして続けている）。",
  records: "特定生物由来製品（輸血用血液製剤）は、使用の対象者の氏名・住所、製剤の名称と製造番号、使用した年月日などを記録し、使用した日から少なくとも20年保存する（医薬品医療機器等法 第68条の22、同施行規則 第237条・第240条第2項、実践ガイド Ⅱ-4-3)a）。",
  reaction: "副反応は詳細を記録し、輸血部門に知らせる。原因の究明のため、使用済みバッグと輸血セットは清潔に回収する。血液センターへの情報提供は原因究明と安全性の向上のため（実践ガイド Ⅱ-2-6)、Ⅱ-4-3)d）。",
  roomTime: "赤血球製剤は室温60分までは品質が保たれる、という研究がある（実践ガイド Ⅱ-2-4)a）。",
} as const;

/**
 * What happens to a bag that was issued but not used. The guide leaves this to each hospital
 * (実践ガイド Ⅱ-1-2)d: 使用されなかった製剤の取り扱いは各医療機関で定義する); this is the fictional hospital's.
 */
export const RETURN_RULE = {
  minutes: 60,
  text: "この架空の病院の取り決め：払い出した製剤が使われなかったときは、すぐ輸血部門へ返す。赤血球で、払出から60分以内に戻り外観に異常がなければ在庫に戻す（ほかの患者に使える）。それ以外（60分を超えた・外観の異常・血漿・血小板）は廃棄し、廃棄の記録を残す。",
} as const;

// ---------------------------------------------------------------------------
// Records
// ---------------------------------------------------------------------------

export type Abo = "A" | "B" | "O" | "AB";
export type Rh = "+" | "-";
export type Product = TxOrder["product"];
export interface Moment {
  day: DayOffset;
  time: string;
}

/** One blood typing on one sample: ABO (オモテ・ウラ), RhD, and the antibody screen if it was done. */
export interface Typing {
  id: string;
  patientId: string;
  /** When the sample was drawn (a different time from the other typings counts as another sample). */
  sample: Moment;
  abo: Abo;
  rh: Rh;
  /** オモテ検査とウラ検査が一致した. A typing that does not match is kept but does not confirm the type. */
  frontBackMatch: boolean;
  /** 不規則抗体スクリーニング（間接抗グロブリン試験を含む）, when done on this sample. */
  antibody?: "陰性" | "陽性";
  /** The antibody identified (e.g. 抗E), when positive. */
  antibodyName?: string;
  by: string;
  /** The second technologist (同一検体の二重チェック). */
  checkedBy: string;
  at: Moment;
}

export type CrossmatchMethod = "間接抗グロブリン試験" | "コンピュータクロスマッチ";

export interface Crossmatch {
  method: CrossmatchMethod;
  /** When the patient's sample was drawn. */
  sample: Moment;
  /** 主試験 (間接抗グロブリン試験). For a computer crossmatch: 適合 when every condition was met. */
  major: "適合" | "不適合";
  /** For a patient with an antibody: the bag was checked to lack the antigen. */
  antigenNegative?: boolean;
  by: string;
  checkedBy?: string;
  at: Moment;
}

/** A bag in the blood bank, from the day it came in. */
export interface BloodUnit {
  /** 製造番号 (the bag's barcode). Fictional numbers only. */
  lot: string;
  product: Product;
  units: number;
  abo: Abo;
  rh: Rh;
  /** 有効期限 (the last moment it may be used). */
  expires: Moment;
  /** 放射線照射済み. */
  irradiated: boolean;
  received: Moment & { by: string };
  /** 入庫後に製剤の ABO をオモテ検査で確かめた (a condition of the computer crossmatch). */
  aboChecked?: Moment & { by: string };
  assigned?: Moment & { orderId: string; patientId: string; by: string };
  crossmatch?: Crossmatch;
  issued?: Moment & { by: string; to: string };
  returned?: Moment & { by: string; minutesOut: number; appearanceOk: boolean; outcome: "在庫に戻した" | "廃棄" };
  discarded?: Moment & { by: string; reason: DiscardReason; note?: string };
}

export const DISCARD_REASONS = ["有効期限切れ", "返却（使えない）", "外観の異常", "破損", "その他"] as const;
export type DiscardReason = (typeof DISCARD_REASONS)[number];

/** 日本輸血・細胞治療学会「輸血副反応の症状項目」の17項目. */
export const SYMPTOMS = [
  "発熱",
  "悪寒・戦慄",
  "熱感・ほてり",
  "掻痒感・かゆみ",
  "発赤・顔面紅潮",
  "発疹・蕁麻疹",
  "呼吸困難",
  "嘔気・嘔吐",
  "胸痛・腹痛・腰背部痛",
  "頭痛・頭重感",
  "血圧低下",
  "血圧上昇",
  "動悸・頻脈",
  "血管痛",
  "意識障害",
  "赤褐色尿（血色素尿）",
  "その他",
] as const;
export type Symptom = (typeof SYMPTOMS)[number];
/** 太字・イタリックの項目：重症副反応の可能性が高く、詳細を確認する. */
export const SEVERE: Symptom[] = ["呼吸困難", "血圧低下", "意識障害", "赤褐色尿（血色素尿）"];

export const OBS_POINTS = ["開始前", "開始5分", "開始15分", "終了時"] as const;
export type ObsPoint = (typeof OBS_POINTS)[number];

export interface Observation extends Moment {
  point: ObsPoint;
  by: string;
  bt?: number;
  sbp?: number;
  dbp?: number;
  hr?: number;
  spo2?: number;
  symptoms: Symptom[];
  note?: string;
}

export interface Reaction extends Moment {
  symptoms: Symptom[];
  /** Minutes from the start to the first symptom. */
  onsetMin: number;
  /** What was done (e.g. 輸血を中止し、生理食塩液に切り替えた). */
  action: string;
  by: string;
  /** The bag and set kept for the blood bank (使用済みバッグと輸血セットを清潔に回収). */
  bagKept: boolean;
  /** Received by the blood bank. */
  received?: Moment & { by: string };
  /** Reported to the blood centre (模擬：つながない). */
  centre?: Moment & { by: string };
}

/** The bedside record of one bag. */
export interface TxAdmin {
  lot: string;
  orderId: string;
  patientId: string;
  check: Moment & { by: string; second: string; wristband: string; bag: string; appearanceOk: boolean };
  start?: Moment & { by: string };
  obs: Observation[];
  end?: Moment & { by: string; ml: number; rechecked: boolean; stopped: boolean };
  reaction?: Reaction;
}

export interface BloodBank {
  typings: Typing[];
  units: BloodUnit[];
  admins: Record<string, TxAdmin>;
}

export const EMPTY_BANK: BloodBank = { typings: [], units: [], admins: {} };

const mins = (m: Moment) => abs(m.day, m.time);
export const momentOf = (a: number): Moment => {
  const day = Math.floor(a / 1440);
  const m = a - day * 1440;
  return { day, time: `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}` };
};
const dayWord = (d: DayOffset) => (d === 0 ? "今日" : d === 1 ? "明日" : d === -1 ? "昨日" : d > 0 ? `${d}日後` : `${-d}日前`);
export const momentText = (m: Moment) => `${dayWord(m.day)} ${m.time}`;
export const typeText = (abo: Abo, rh: Rh) => `${abo}型 Rh${rh === "+" ? "(+)" : "(−)"}`;

// ---------------------------------------------------------------------------
// The patient's blood type: earlier record + typings in this session
// ---------------------------------------------------------------------------

export interface BloodState {
  /** The type as it stands (from the record, else the first typing that matched front and back). */
  abo?: Abo;
  rh?: Rh;
  /** Separate samples that agree (the record's checks count as earlier samples). */
  samples: number;
  confirmed: boolean;
  /** A typing that does not agree with the others, or front and back that do not match: the type is not used. */
  conflict: string | null;
  /** The latest screen (this session first, else the record). */
  antibody?: "陰性" | "陽性";
  /** Antibodies found, now or before (they stay even when a later screen is negative). */
  antibodies: string[];
  /** The latest screen's sample. */
  antibodySample?: Moment;
}

export function bloodState(base: Patient["blood"] | undefined, typings: Typing[]): BloodState {
  const mine = [...typings].sort((a, b) => mins(a.sample) - mins(b.sample));
  const good = mine.filter((t) => t.frontBackMatch);
  const abo = base?.abo ?? good[0]?.abo;
  const rh = base?.rh ?? good[0]?.rh;
  let conflict: string | null = null;
  const bad = mine.find((t) => !t.frontBackMatch);
  if (bad) conflict = `${momentText(bad.sample)}の検体でオモテ検査とウラ検査が一致しません。原因を精査するまで血液型は確定しません。`;
  const other = good.find((t) => t.abo !== abo || t.rh !== rh);
  if (other) conflict = `${momentText(other.sample)}の検体は ${typeText(other.abo, other.rh)}で、${abo ? typeText(abo, rh!) : ""}と一致しません。検体の取り違いを含めて確かめるまで、血液型は確定しません。`;
  const times = new Set(good.filter((t) => t.abo === abo && t.rh === rh).map((t) => `${t.sample.day}|${t.sample.time}`));
  const samples = (base?.checks ?? 0) + times.size;
  const screened = [...mine].filter((t) => t.antibody).sort((a, b) => mins(a.sample) - mins(b.sample));
  const last = screened.at(-1);
  const antibodies = [...new Set([...(base?.antibody === "陽性" ? ["記録にある不規則抗体"] : []), ...screened.filter((t) => t.antibody === "陽性").map((t) => t.antibodyName?.trim() || "同定前の不規則抗体")])];
  return {
    abo,
    rh,
    samples,
    confirmed: !conflict && !!abo && samples >= 2,
    conflict,
    antibody: last?.antibody ?? base?.antibody,
    antibodies,
    antibodySample: last?.sample,
  };
}

/** The chart's 血液型 with the typings of this session (the order's checks read it). A conflict keeps the record as it was. */
export function bloodOf(base: Patient["blood"] | undefined, typings: Typing[]): Patient["blood"] | undefined {
  if (!typings.length) return base;
  const s = bloodState(base, typings);
  if (!s.abo || !s.rh) return base;
  if (s.conflict) return base ?? undefined;
  return { abo: s.abo, rh: s.rh, checks: s.samples, ...(s.antibody ? { antibody: s.antibody } : {}) };
}

/** What stops a typing from being recorded. */
export function typingProblems(t: Pick<Typing, "by" | "checkedBy" | "sample">, nowAbs: number): string[] {
  const out: string[] = [];
  if (!t.checkedBy.trim()) out.push("2人目の技師の名前を入れてください（同一検体の二重チェック）。");
  else if (t.checkedBy.trim() === t.by.trim()) out.push("2人目は別の技師です（同一検体の二重チェック）。");
  if (!t.sample.time) out.push("検体の採血時刻を入れてください。");
  else if (mins(t.sample) > nowAbs) out.push("採血時刻が今より後です。");
  return out;
}

// ---------------------------------------------------------------------------
// Transfusion orders (PROC-TX) as the blood bank sees them
// ---------------------------------------------------------------------------

export interface TxRequest {
  entry: OrderEntry;
  tx: TxOrder;
  patientId: string;
  name: string;
  room: string;
  /** When the transfusion is to start. */
  at: number;
}

export function txRequests(people: { patient: Pick<Patient, "id" | "name">; room: string; entries: OrderEntry[] }[]): TxRequest[] {
  return people
    .flatMap((x) =>
      x.entries.flatMap((e) => {
        const o = e.order;
        if (e.status === "中止" || o.type !== "procedure" || !o.tx) return [];
        return [{ entry: e, tx: o.tx, patientId: x.patient.id, name: x.patient.name, room: x.room, at: abs(o.start.day, o.start.time ?? e.time) }];
      }),
    )
    .sort((a, b) => a.at - b.at);
}

/** The bags an order needs (2単位 bags for 4単位 of red cells; 240 and 480 for 6単位 of plasma). */
export function bagsFor(product: Product, units: number): number[] {
  if (product === "RBC") return units === 4 ? [2, 2] : [units];
  if (product === "FFP") return units === 6 ? [2, 4] : [units];
  return [units];
}

export const productName = (p: Product) => TX_PRODUCTS[p].name;
export const bagLabel = (u: Pick<BloodUnit, "product" | "units">) =>
  u.product === "FFP" ? `${u.units * 120}（${u.units}単位）` : `${u.units}単位`;

export type UnitState = "在庫" | "割付済み" | "払出済み" | "輸血中" | "輸血済み" | "廃棄" | "期限切れ";

export function unitState(u: BloodUnit, admins: Record<string, TxAdmin>, nowAbs: number): UnitState {
  if (u.discarded) return "廃棄";
  const a = admins[u.lot];
  if (a?.end) return "輸血済み";
  if (a?.start) return "輸血中";
  if (u.issued) return "払出済み";
  if (mins(u.expires) < nowAbs) return "期限切れ";
  if (u.assigned) return "割付済み";
  return "在庫";
}

export const unitsOf = (bank: BloodBank, orderId: string) => bank.units.filter((u) => u.assigned?.orderId === orderId && !u.discarded);

/** Bags in stock that may be assigned to the order: same product and type as the patient, good until the start, oldest expiry first. */
export function candidates(bank: BloodBank, req: TxRequest, blood: BloodState, nowAbs: number): BloodUnit[] {
  return bank.units
    .filter((u) => unitState(u, bank.admins, nowAbs) === "在庫" && u.product === req.tx.product && u.abo === blood.abo && u.rh === blood.rh && mins(u.expires) >= Math.max(nowAbs, req.at))
    .sort((a, b) => mins(a.expires) - mins(b.expires));
}

/** Units still to assign: what the order needs minus the bags already on it. */
export function stillNeeded(req: TxRequest, assigned: BloodUnit[]): number[] {
  const need = [...bagsFor(req.tx.product, req.tx.units)];
  for (const u of assigned) {
    const i = need.indexOf(u.units);
    if (i >= 0) need.splice(i, 1);
  }
  return need;
}

// ---------------------------------------------------------------------------
// Crossmatch and issue
// ---------------------------------------------------------------------------

/** The sample is new enough: drawn on the transfusion day or the two days before (輸血日を含め3日以内). */
export const sampleFresh = (sample: Moment, txAbs: number) => sample.day >= Math.floor(txAbs / 1440) - 2;

/** The conditions of a computer crossmatch, each with whether it is met. */
export function computerConditions(blood: BloodState, unit: BloodUnit, sample: Moment | null, txAbs: number): { text: string; ok: boolean }[] {
  return [
    { text: "ABO・RhD 血液型を異なる検体で2回以上確かめた", ok: blood.confirmed },
    { text: "輸血日を含め3日以内の検体で不規則抗体が陰性", ok: !!blood.antibodySample && sampleFresh(blood.antibodySample, txAbs) && blood.antibody === "陰性" },
    { text: "臨床的意義のある抗体が過去にも検出されていない", ok: blood.antibodies.length === 0 },
    { text: "入庫後に製剤の ABO をオモテ検査で確かめた", ok: !!unit.aboChecked },
    { text: "交差適合試験用の検体を輸血日を含め3日以内に採血した", ok: !!sample && sampleFresh(sample, txAbs) },
  ];
}

/** Why a bag cannot be issued for the order yet (empty when it can). */
export function issueBlocks(unit: BloodUnit, req: TxRequest, blood: BloodState, nowAbs: number): string[] {
  const out: string[] = [];
  if (blood.conflict) out.push(blood.conflict);
  else if (!blood.confirmed) out.push(`血液型の確認が${blood.samples}回です（異なる時点の検体で2回）。`);
  if (blood.abo && (unit.abo !== blood.abo || unit.rh !== blood.rh)) out.push(`製剤（${typeText(unit.abo, unit.rh)}）が患者（${typeText(blood.abo, blood.rh!)}）と同じ型ではありません。`);
  if (unit.product !== req.tx.product) out.push("オーダと違う製剤です。");
  if (mins(unit.expires) < nowAbs) out.push(`有効期限（${momentText(unit.expires)}）を過ぎています。`);
  if ((unit.product === "RBC" || unit.product === "PC") && !unit.irradiated) out.push("放射線照射がされていません。");
  if (unit.product === "RBC") {
    if (!blood.antibody) out.push("不規則抗体スクリーニングの結果がありません。");
    const cm = unit.crossmatch;
    if (!cm) out.push("交差適合試験の結果がありません。");
    else {
      if (cm.major !== "適合") out.push("交差適合試験が不適合です。この製剤は輸血に使いません。");
      if (!sampleFresh(cm.sample, req.at)) out.push(`交差適合試験の検体（${momentText(cm.sample)}採血）が、輸血日を含め3日以内ではありません。`);
      if (blood.antibodies.length && !cm.antigenNegative) out.push(`不規則抗体（${blood.antibodies.join("・")}）があります。対応抗原陰性の製剤であることを確かめてください。`);
      if (cm.method === "コンピュータクロスマッチ") {
        const miss = computerConditions(blood, unit, cm.sample, req.at).filter((c) => !c.ok);
        if (miss.length) out.push(`コンピュータクロスマッチの条件を満たしません：${miss.map((c) => c.text).join("、")}。`);
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// At the bedside: the check, observation and reactions
// ---------------------------------------------------------------------------

export interface CheckLine {
  tone: "ok" | "stop";
  text: string;
}

/** The bedside check of one bag: the wristband and the bag read, the bag against the order, two people. */
export function bedsideCheck(p: {
  req: Pick<TxRequest, "patientId" | "name" | "tx" | "entry">;
  blood: BloodState;
  bank: BloodBank;
  wristband: string;
  bag: string;
  by: string;
  second: string;
  appearanceOk: boolean;
  nowAbs: number;
}): { ok: boolean; unit?: BloodUnit; lines: CheckLine[] } {
  const lines: CheckLine[] = [];
  const add = (ok: boolean, text: string) => lines.push({ tone: ok ? "ok" : "stop", text });
  const wb = p.wristband.trim();
  const code = p.bag.trim();
  add(wb === p.req.patientId, wb ? (wb === p.req.patientId ? `リストバンド：${p.req.name}さん（ID ${wb}）` : `リストバンドが違います（${wb}）。${p.req.name}さんではありません。輸血しないでください。`) : "リストバンドを読んでください。");
  const unit = p.bank.units.find((u) => u.lot === code);
  if (!code) add(false, "製剤のバーコード（製造番号）を読んでください。");
  else if (!unit) add(false, `製造番号 ${code} は輸血部門の記録にありません。`);
  else if (unit.assigned?.orderId !== p.req.entry.id) add(false, `製造番号 ${code} はこのオーダ・この患者の製剤ではありません。輸血しないでください。`);
  else if (!unit.issued) add(false, `製造番号 ${code} はまだ払い出されていません。`);
  else if (p.bank.admins[code]?.start) add(false, `製造番号 ${code} はもう輸血を始めています。`);
  else {
    add(true, `製剤：${productName(unit.product)} ${bagLabel(unit)}　製造番号 ${unit.lot}`);
    const b = p.blood;
    add(unit.abo === b.abo && unit.rh === b.rh, `血液型：患者 ${b.abo ? typeText(b.abo, b.rh!) : "未確定"}／製剤 ${typeText(unit.abo, unit.rh)}`);
    add(mins(unit.expires) >= p.nowAbs, `有効期限：${momentText(unit.expires)}${mins(unit.expires) < p.nowAbs ? "（過ぎています）" : ""}`);
    if (unit.product === "RBC") add(unit.crossmatch?.major === "適合", `交差適合試験：${unit.crossmatch ? `${unit.crossmatch.major}（${unit.crossmatch.method}）` : "結果なし"}`);
    else lines.push({ tone: "ok", text: "交差適合試験：省略（血漿・血小板）" });
    if (unit.product !== "FFP") add(unit.irradiated, `放射線照射：${unit.irradiated ? "済み" : "なし"}`);
    if (unit.product === "RBC" && unit.issued) {
      const out = p.nowAbs - mins(unit.issued);
      lines.push({ tone: "ok", text: `払出から ${out}分${out > RETURN_RULE.minutes ? `（${RETURN_RULE.minutes}分を超えています。輸血部門に確かめてください）` : ""}` });
    }
  }
  add(p.appearanceOk, p.appearanceOk ? "外観：色・溶血・凝集物・破損に異常なし" : "外観（色・溶血・凝集物・破損）を確かめてください。");
  const second = p.second.trim();
  add(!!second && second !== p.by.trim(), !second ? "一緒に確かめた2人目の名前を入れてください（2人で声に出して確かめる）。" : second === p.by.trim() ? "2人目は別の人です。" : `確認：${p.by} と ${second}（読み合わせ）`);
  return { ok: lines.every((l) => l.tone === "ok"), unit, lines };
}

/** The observation points with their due moment (5 and 15 minutes after the start) and whether recorded. */
export function obsPlan(a: TxAdmin | undefined, nowAbs: number): { point: ObsPoint; due: number | null; state: "済み" | "これから" | "時刻を過ぎた"; rec?: Observation }[] {
  const start = a?.start ? mins(a.start) : null;
  return OBS_POINTS.map((point) => {
    const rec = a?.obs.find((o) => o.point === point);
    const due = point === "開始5分" && start !== null ? start + 5 : point === "開始15分" && start !== null ? start + 15 : null;
    const state = rec ? "済み" : due !== null && nowAbs >= due ? "時刻を過ぎた" : "これから";
    return { point, due, state, rec };
  });
}

/**
 * Symptoms the vital signs already show, by the definitions of the symptom list: 発熱 38℃以上（輸血前から
 * 38℃以上なら1℃以上の上昇）、血圧低下・上昇 収縮期 30mmHg 以上、頻脈 成人 100回/分以上.
 */
export function vitalSymptoms(before: Pick<Observation, "bt" | "sbp" | "hr"> | undefined, now: Pick<Observation, "bt" | "sbp" | "hr">, adult: boolean): { symptom: Symptom; why: string }[] {
  const out: { symptom: Symptom; why: string }[] = [];
  if (now.bt !== undefined) {
    if (before?.bt !== undefined && before.bt >= 38) {
      if (now.bt - before.bt >= 1) out.push({ symptom: "発熱", why: `体温 ${before.bt}→${now.bt}℃（輸血前から38℃以上で1℃以上の上昇）` });
    } else if (now.bt >= 38) out.push({ symptom: "発熱", why: `体温 ${now.bt}℃（38℃以上）` });
  }
  if (now.sbp !== undefined && before?.sbp !== undefined) {
    if (before.sbp - now.sbp >= 30) out.push({ symptom: "血圧低下", why: `収縮期血圧 ${before.sbp}→${now.sbp}mmHg（30mmHg 以上の低下）` });
    if (now.sbp - before.sbp >= 30) out.push({ symptom: "血圧上昇", why: `収縮期血圧 ${before.sbp}→${now.sbp}mmHg（30mmHg 以上の上昇）` });
  }
  if (adult && now.hr !== undefined && now.hr >= 100) out.push({ symptom: "動悸・頻脈", why: `脈拍 ${now.hr}/分（成人 100回/分以上）` });
  return out;
}

export const severeOf = (s: Symptom[]) => s.filter((x) => SEVERE.includes(x));

// ---------------------------------------------------------------------------
// Returns, disposal, and the 20-year record
// ---------------------------------------------------------------------------

/** What happens to a bag returned unused (the fictional hospital's rule). */
export function returnOutcome(unit: BloodUnit, returnAbs: number, appearanceOk: boolean): { minutesOut: number; outcome: "在庫に戻した" | "廃棄"; why: string } {
  const minutesOut = unit.issued ? returnAbs - mins(unit.issued) : 0;
  if (unit.product !== "RBC") return { minutesOut, outcome: "廃棄", why: "血漿・血小板は払い出したあと在庫に戻さない（架空の病院の取り決め）" };
  if (!appearanceOk) return { minutesOut, outcome: "廃棄", why: "外観に異常がある" };
  if (minutesOut > RETURN_RULE.minutes) return { minutesOut, outcome: "廃棄", why: `払出から${minutesOut}分（${RETURN_RULE.minutes}分を超えた）` };
  return { minutesOut, outcome: "在庫に戻した", why: `払出から${minutesOut}分（${RETURN_RULE.minutes}分以内）・外観に異常なし` };
}

/** The date a record must be kept until: 20 years from the day of use (少なくとも). */
export function keepUntil(used: CalendarDate): CalendarDate {
  const leap = used.m === 2 && used.d === 29;
  return { y: used.y + 20, m: used.m, d: leap ? 28 : used.d };
}

export interface UsageRecord {
  lot: string;
  patientId: string;
  name: string;
  /** 住所: not in this prototype's fictional patients. */
  address: string | null;
  product: string;
  used: CalendarDate;
  keep: CalendarDate;
  /** Items 施行規則 第237条 asks for that the record does not have. */
  missing: string[];
  reaction: boolean;
}

/** One record per bag that was transfused (施行規則 第237条：氏名・住所、名称・製造番号、使用した年月日). */
export function usageRecords(bank: BloodBank, nameOf: (pid: string) => { name: string; address?: string | null } | undefined, today: CalendarDate): UsageRecord[] {
  return Object.values(bank.admins)
    .filter((a) => a.start)
    .map((a) => {
      const u = bank.units.find((x) => x.lot === a.lot);
      const who = nameOf(a.patientId);
      const used = addDays(today, a.start!.day);
      const address = who?.address ?? null;
      return {
        lot: a.lot,
        patientId: a.patientId,
        name: who?.name ?? a.patientId,
        address,
        product: u ? `${productName(u.product)} ${bagLabel(u)}` : "—",
        used,
        keep: keepUntil(used),
        missing: [!who?.name && "氏名", !address && "住所", !u && "製剤の名称"].filter((x): x is string => !!x),
        reaction: !!a.reaction,
      };
    })
    .sort((x, y) => x.used.y - y.used.y || x.used.m - y.used.m || x.used.d - y.used.d || x.lot.localeCompare(y.lot));
}

/** Reactions counted like the society's report form: per bag, by product; symptoms may overlap. */
export function reactionCounts(bank: BloodBank): { product: Product; bags: number; reactions: number; symptoms: Partial<Record<Symptom, number>> }[] {
  return (["RBC", "FFP", "PC"] as Product[]).map((product) => {
    const used = Object.values(bank.admins).filter((a) => a.start && bank.units.find((u) => u.lot === a.lot)?.product === product);
    const hit = used.filter((a) => a.reaction);
    const symptoms: Partial<Record<Symptom, number>> = {};
    for (const a of hit) for (const s of a.reaction!.symptoms) symptoms[s] = (symptoms[s] ?? 0) + 1;
    return { product, bags: used.length, reactions: hit.length, symptoms };
  });
}

// ---------------------------------------------------------------------------
// Fictional stock delivered by the blood centre this morning (製造番号 are made up, "SK" = Simple Karte)
// ---------------------------------------------------------------------------

export function initialBank(nowAbs: number): BloodBank {
  const recv = (dayBack: number): Moment & { by: string } => ({ ...momentOf(Math.max(0, nowAbs - 60) - dayBack * 1440), by: "検査技師 中村" });
  const exp = (day: number, time = "23:59"): Moment => ({ day, time });
  const u = (lot: string, product: Product, units: number, abo: Abo, rh: Rh, expires: Moment, dayBack = 0): BloodUnit => ({ lot, product, units, abo, rh, expires, irradiated: product !== "FFP", received: recv(dayBack) });
  return {
    typings: [],
    admins: {},
    units: [
      u("SK2611-0101", "RBC", 2, "A", "+", exp(12)),
      u("SK2611-0102", "RBC", 2, "A", "+", exp(18)),
      u("SK2611-0103", "RBC", 2, "A", "+", exp(20)),
      u("SK2611-0104", "RBC", 1, "A", "+", exp(15)),
      u("SK2611-0111", "RBC", 2, "O", "+", exp(9)),
      u("SK2611-0112", "RBC", 2, "O", "+", exp(16)),
      u("SK2610-0098", "RBC", 2, "O", "+", exp(-1), 20),
      u("SK2611-0121", "RBC", 2, "B", "+", exp(11)),
      u("SK2611-0122", "RBC", 2, "B", "+", exp(17)),
      u("SK2611-0131", "RBC", 2, "AB", "+", exp(14)),
      u("SK2605-0201", "FFP", 2, "A", "+", exp(190), 1),
      u("SK2605-0202", "FFP", 4, "A", "+", exp(195), 1),
      u("SK2605-0211", "FFP", 4, "O", "+", exp(200), 1),
      u("SK2605-0221", "FFP", 2, "B", "+", exp(185), 1),
      u("SK2611-0301", "PC", 10, "A", "+", exp(2)),
    ],
  };
}
