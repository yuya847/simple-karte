// 麻薬の処方（麻薬及び向精神薬取締法）: who may prescribe a 麻薬 and what a 麻薬処方箋 must carry. Code checks the
// licence on record and lists the items the law names, with what the order has for each; the pharmacist reads
// the prescription and the doctor decides the drug. The licences below are FICTIONAL.
//
// - 第27条第1項: only a 麻薬施用者 may give (施用), hand out for use (交付) or prescribe a 麻薬.
// - 第27条第6項・施行規則 第9条の3: a 麻薬処方箋 carries the patient's name, the drug, 分量・用法用量, the
//   prescriber's name and licence number, the date, (the patient's address, how long it is valid, the name and
//   address of the 麻薬業務所 — these three may be left out when the hospital's own pharmacy dispenses it), and
//   the prescriber's 記名押印 or 署名.
// - 第5条: a licence runs from the day it is given to 31 December of the next year.

import { addDays, isoDate, type CalendarDate } from "./dates";
import { doctorOf } from "./doctors";
import { isNarcotic } from "./drug-class";
import { anyDrugName, findDrug, findOralDrug } from "./master";
import { STAFF } from "./roles";
import type { DayOffset, Order, OrderEntry, Patient } from "./types";

export const NARCOTIC_SOURCES = {
  law: {
    label: "麻薬及び向精神薬取締法（昭和28年法律第14号）第5条（免許の有効期間）・第27条（麻薬施用者でなければ麻薬を施用・交付・処方できない。第6項：処方箋の記載事項）・第33条（麻薬管理者）・第34条（保管）・第35条（事故・調剤済麻薬の廃棄の届出）・第39条（帳簿）・第41条（診療録への記載）",
    url: "https://laws.e-gov.go.jp/law/328AC0000000014",
  },
  rule: {
    label: "麻薬及び向精神薬取締法施行規則 第9条の3（麻薬処方箋の記載事項。院内の調剤所で調剤するときは、患者の住所・処方箋の使用期間・麻薬業務所の名称と所在地を省ける）",
    url: "https://laws.e-gov.go.jp/law/328M50000100014",
  },
  manual: {
    label: "厚生労働省医薬食品局監視指導・麻薬対策課「病院・診療所における麻薬管理マニュアル」（平成23年4月）第4 施用・交付、第5 麻薬処方せん、第6 記録（帳簿）、第7 廃棄、第8 事故届",
    url: "https://www.mhlw.go.jp/bunya/iyakuhin/yakubuturanyou/dl/mayaku_kanri_01.pdf",
  },
};

/** What the sources do not decide: this fictional hospital's choices. */
export const NARCOTIC_RULES = {
  licences: "",
  prn: "麻薬は指示簿の頓用には入れず、その都度オーダします。",
  outpatient: "院外の麻薬処方せん（患者の住所・使用期間・麻薬業務所の名称と所在地が要る）は、この試作では出せません。",
};

export interface Licence {
  kind: "麻薬施用者" | "麻薬管理者";
  /** 免許証の番号 (fictional). */
  no: string;
  /** Last day of the licence ("YYYY-MM-DD"): 31 December of the year after it was given (第5条). */
  until: string;
}

/** Licences on record, by the name used in the record (all fictional). 研修医 田中 and 木下 have none. */
export const LICENCES: Record<string, Licence[]> = {
  [STAFF.医師.name]: [{ kind: "麻薬施用者", no: "第 1-04127 号", until: "2027-12-31" }],
  "指導医 高橋": [{ kind: "麻薬施用者", no: "第 1-02388 号", until: "2026-12-31" }],
  [STAFF.薬剤師.name]: [{ kind: "麻薬管理者", no: "第 2-00316 号", until: "2027-12-31" }],
};

/** The hospital's 麻薬管理者 (第33条: one is needed where two or more 麻薬施用者 work). */
export const NARCOTIC_MANAGER = STAFF.薬剤師.name;

/** The licence of this kind, if one is on record and still valid on `today`; else why not. */
export function licenceOf(name: string, kind: Licence["kind"], today: CalendarDate): { ok: true; licence: Licence } | { ok: false; why: string } {
  const l = (LICENCES[name] ?? []).find((x) => x.kind === kind);
  if (!l) return { ok: false, why: `${name}さんには${kind}の免許番号が登録されていません。` };
  if (isoDate(today) > l.until) return { ok: false, why: `${name}さんの${kind}免許（${l.no}）は ${l.until} で有効期間が過ぎています（第5条）。` };
  return { ok: true, licence: l };
}

/** The 麻薬 in an order (by drug code). */
export function narcoticsIn(o: Order): string[] {
  const codes = o.type === "injection" ? o.items.map((i) => i.drugCode) : o.type === "prescription" ? [o.drugCode] : [];
  return codes.filter(isNarcotic);
}

/**
 * Why these orders cannot be confirmed by this prescriber, or null: a 麻薬 needs a 麻薬施用者 with a valid
 * licence (第27条第1項). The fictional hospital's rule for 研修医 is checked separately (cosign.ts).
 */
export function narcoticBlock(orders: Order[], prescriber: string, today: CalendarDate): string | null {
  const drugs = [...new Set(orders.flatMap(narcoticsIn))];
  if (!drugs.length) return null;
  const l = licenceOf(prescriber, "麻薬施用者", today);
  if (l.ok) return null;
  return `確定していません：麻薬（${drugs.map(anyDrugName).join("・")}）は麻薬施用者でなければ処方できません（麻薬及び向精神薬取締法 第27条第1項）。${l.why}`;
}

// ---------------------------------------------------------------------------
// 麻薬処方箋の記載事項
// ---------------------------------------------------------------------------

export interface RxItem {
  item: string;
  value: string;
  /** ok = written; missing = must be written and is not; omitted = may be left out (院内); check = a person checks it. */
  state: "ok" | "missing" | "omitted" | "check";
  basis: string;
}

const LAW = "法 第27条第6項";
const RULE = "施行規則 第9条の3";

const fmt = (d: CalendarDate) => `${d.y}年${d.m}月${d.d}日`;

/** 用法・用量 of a 麻薬 order, in words (with the days for an oral one). */
export function usageText(o: Order): { text: string; complete: boolean } {
  if (o.type === "prescription") {
    const prn = o.timings.length === 0;
    const per = `1回${o.amount}${o.unit}`;
    if (prn) return { text: `${per} 頓用 ${o.prn ?? ""}`.trim(), complete: !!o.prn };
    return { text: `${per} 1日${o.timings.length}回（${o.timings.join("・")}）${o.days ? ` ${o.days}日分` : ""}`, complete: !!o.days };
  }
  if (o.type === "injection") {
    const sch = o.schedule.kind === "once" ? "1回" : o.schedule.kind === "per_day" ? `1日${o.schedule.count}回` : `${o.schedule.hours}時間ごと`;
    return { text: `${o.items.map((i) => `${i.amount}${i.unit}`).join("＋")} ${o.route} ${sch}${o.days ? ` ${o.days}日間` : ""}`, complete: true };
  }
  return { text: "", complete: false };
}

/** 分量 of the 麻薬 in the order (per time, and in tablets or ampoules). */
function amountText(o: Order): string {
  if (o.type === "prescription") return `1回${o.amount}${o.unit}`;
  if (o.type === "injection") return o.items.filter((i) => isNarcotic(i.drugCode)).map((i) => `${i.amount}${i.unit}`).join("・");
  return "";
}

const productName = (code: string) => {
  const inj = findDrug(code);
  if (inj) return `${inj.name} ${inj.package}`.normalize("NFKC");
  const o = findOralDrug(code);
  return (o ? `${o.name} ${o.strength}` : anyDrugName(code)).normalize("NFKC");
};

/**
 * What a 院内 麻薬処方箋 must carry (法 第27条第6項・施行規則 第9条の3), and what this order has for each. The
 * signature is checked by a person (the order was confirmed in the chart; whether that counts as 署名 was not
 * decided here).
 */
export function rxItems(entry: OrderEntry, patient: Pick<Patient, "name" | "age">, today: CalendarDate): RxItem[] {
  const o = entry.order;
  const drugs = narcoticsIn(o);
  const prescriber = entry.verbal?.doctor ?? entry.author;
  const lic = licenceOf(prescriber, "麻薬施用者", addDays(today, entry.day));
  const usage = usageText(o);
  return [
    { item: "患者の氏名", value: patient.name, state: patient.name ? "ok" : "missing", basis: LAW },
    { item: "患者の年齢", value: `${patient.age}歳`, state: "ok", basis: "マニュアル 第5(1)①" },
    { item: "麻薬の品名", value: drugs.map(productName).join("・"), state: drugs.length ? "ok" : "missing", basis: LAW },
    { item: "分量", value: amountText(o), state: "ok", basis: LAW },
    { item: "用法・用量（投薬日数を含む）", value: usage.text || "—", state: usage.complete ? "ok" : "missing", basis: `${LAW}・マニュアル 第5(1)③` },
    { item: "発行の年月日", value: fmt(addDays(today, entry.day)), state: "ok", basis: RULE },
    { item: "麻薬施用者の氏名", value: prescriber + (doctorOf(prescriber) ? "" : "（医師の一覧にない）"), state: "ok", basis: LAW },
    { item: "麻薬施用者の免許証の番号", value: lic.ok ? lic.licence.no : lic.why, state: lic.ok ? "ok" : "missing", basis: LAW },
    { item: "記名押印又は署名", value: "印刷した処方箋で薬剤師が確かめる", state: "check", basis: LAW },
    { item: "患者の住所", value: "院内の調剤所で調剤するため省略", state: "omitted", basis: `${RULE} ただし書` },
    { item: "処方箋の使用期間", value: "院内の調剤所で調剤するため省略", state: "omitted", basis: `${RULE} ただし書` },
    { item: "麻薬業務所の名称・所在地", value: "院内の調剤所で調剤するため省略", state: "omitted", basis: `${RULE} ただし書` },
  ];
}

export const rxComplete = (items: RxItem[]) => items.every((i) => i.state !== "missing");

/** 麻薬 orders of a patient written since `since` (day offset), newest first. */
export function narcoticOrders(entries: OrderEntry[], since: DayOffset = -1): OrderEntry[] {
  return entries.filter((e) => e.day >= since && narcoticsIn(e.order).length > 0).sort((a, b) => b.day - a.day || b.time.localeCompare(a.time));
}
