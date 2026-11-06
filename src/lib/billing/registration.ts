// 保険の登録 (医事課): the patient's insurance as the window reads it from the cards (保険証・資格確認書、
// 高齢受給者証、限度額適用認定証、マイナ保険証のオンライン資格確認). Code checks the entries and works out
// what follows from them (窓口で限度額を使えるか・食事の標準負担額の区分・レセプト種別・特記事項); a person
// registers. The claim then uses it instead of the age-based assumption (month.ts).
// All patients and numbers are FICTIONAL. The same registration is shown and changed from the 患者基本情報
// window (保険・制度), which adds 公費 (受給者証), 生活保護・自費・労災, the 有効期限 and how the 資格 was checked.

import { PATIENTS } from "../patients";
import type { DayOffset } from "../types";
import { kohiKind } from "./futan";
import { ageOn, checkDigit, futanKubun, INSURANCE, receiptType, tokkiCode, TOKKI_NAME, type Coverage, type IncomeClass, type Insurance, type InsurerKind, type Kohi, type VerifyMethod } from "./insurance";
import type { MealClass } from "./model";

export const INSURER_KINDS: InsurerKind[] = ["協会けんぽ", "組合健保", "共済", "国保", "後期高齢者"];

/**
 * 保険の種類 as the window picks it: the 医保 kinds, and the cases without 医保. Each choice sets the
 * form's `coverage` and (for 医保) `kind`.
 */
export const KIND_OPTIONS: { label: string; coverage: Coverage; kind: InsurerKind | "" }[] = [
  { label: "国民健康保険", coverage: "医保", kind: "国保" },
  { label: "後期高齢者医療", coverage: "医保", kind: "後期高齢者" },
  { label: "協会けんぽ（社保）", coverage: "医保", kind: "協会けんぽ" },
  { label: "組合健保（社保）", coverage: "医保", kind: "組合健保" },
  { label: "共済（社保）", coverage: "医保", kind: "共済" },
  { label: "生活保護（医療扶助のみ）", coverage: "生活保護", kind: "" },
  { label: "自費", coverage: "自費", kind: "" },
  { label: "労災", coverage: "労災", kind: "" },
  { label: "公費のみ（医保なし）", coverage: "公費のみ", kind: "" },
];

export const kindOptionOf = (f: Pick<InsuranceForm, "coverage" | "kind">) => KIND_OPTIONS.find((o) => (f.coverage || "医保") === o.coverage && (o.coverage !== "医保" || o.kind === f.kind));

/** One 受給者証 as typed. */
export interface KohiForm {
  lawNo: string;
  /** 制度名 (from KOHI_KINDS by 法別番号, or typed). */
  name: string;
  payerNumber: string;
  recipientNumber: string;
  /** 自己負担上限月額 as written on the 受給者証 (digits); empty when the 制度 has none. */
  capYen: string;
}
export const emptyKohi = (): KohiForm => ({ lawNo: "", name: "", payerNumber: "", recipientNumber: "", capYen: "" });

/** How the window learned the 適用区分 (所得区分) for the 高額療養費 limit. */
export const PROOFS = ["なし", "限度額適用認定証", "限度額適用・標準負担額減額認定証", "マイナ保険証（オンライン資格確認）"] as const;
export type Proof = (typeof PROOFS)[number];

export const UNDER70_CLASSES: IncomeClass[] = ["ア", "イ", "ウ", "エ", "オ"];
export const ELDER_CLASSES: IncomeClass[] = ["現役並みⅢ", "現役並みⅡ", "現役並みⅠ", "一般", "低所得Ⅱ", "低所得Ⅰ"];
export const KOUKI_CLASSES: IncomeClass[] = ["現役並みⅢ", "現役並みⅡ", "現役並みⅠ", "一般Ⅱ", "一般Ⅰ", "低所得Ⅱ", "低所得Ⅰ"];

/** What 医事課 types from the cards. Nothing is chosen in advance. */
export interface InsuranceForm {
  kind: InsurerKind | "";
  insurerNumber: string;
  symbol: string;
  number: string;
  branch: string;
  relation: Insurance["relation"] | "";
  birthDate: string;
  rate: "" | "10" | "20" | "30";
  incomeClass: IncomeClass | "";
  /** 高齢受給者証 seen (70〜74歳). */
  elderCard: boolean;
  proof: Proof | "";
  /** 過去12か月の入院日数（減額認定を受けていた期間）, as typed. For 区分オ・低所得Ⅱ. */
  stayDays: string;
  /** 医保 (default when empty), or a case without 医保. */
  coverage: Coverage | "";
  /** 受給者証 (公費), in the order shown. */
  kohi: KohiForm[];
  /** 有効期限 "YYYY-MM-DD" of the 資格確認書・受給者証; empty when none is written. */
  validUntil: string;
  /** 資格確認の方法 and the day it was done. */
  verify: VerifyMethod | "";
  verifiedOn: string;
}

export const EMPTY_FORM: InsuranceForm = {
  kind: "",
  insurerNumber: "",
  symbol: "",
  number: "",
  branch: "",
  relation: "",
  birthDate: "",
  rate: "",
  incomeClass: "",
  elderCard: false,
  proof: "",
  stayDays: "",
  coverage: "",
  kohi: [],
  validUntil: "",
  verify: "",
  verifiedOn: "",
};

/** A form saved before these fields existed gets their defaults (records in this browser or the workspace). */
export const normalizeForm = (f: Partial<InsuranceForm> | undefined): InsuranceForm => ({ ...EMPTY_FORM, ...(f ?? {}), kohi: (f?.kohi ?? []).map((k) => ({ ...emptyKohi(), ...k })) });

export const isMedical = (f: Pick<InsuranceForm, "coverage">) => !f.coverage || f.coverage === "医保";

export interface InsuranceRecord {
  form: InsuranceForm;
  /** What the claim uses, worked out from the form when it was registered. */
  insurance: Insurance;
  action: "登録" | "変更" | "確認";
  by: string;
  at: { day: DayOffset; time: string };
  /** Why it was changed (asked for a 変更 from the 患者基本情報 window). */
  reason?: string;
}

/** Every registration per patient; the last one is in force. */
export type InsuranceBook = Record<string, InsuranceRecord[]>;

export const currentRecord = (book: InsuranceBook, id: string): InsuranceRecord | undefined => {
  const all = book[id] ?? [];
  return all[all.length - 1];
};
export const currentInsurance = (book: InsuranceBook, id: string): Insurance | undefined => currentRecord(book, id)?.insurance;

export const withRecord = (book: InsuranceBook, id: string, r: InsuranceRecord): InsuranceBook => ({ ...book, [id]: [...(book[id] ?? []), r] });

// ---------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------

const SETTEI = "保険者番号等の設定要領 第1（平成20年3月31日 保発第0331012号 別紙1）";
const HOUBETSU_SRC = "同 別表1 法別番号表（01 は当時の政府管掌健康保険、いまの全国健康保険協会管掌健康保険）";
const RATE_SRC = "健康保険法74条1項・110条2項、高齢者の医療の確保に関する法律67条1項";
const CLASS_SRC = "健康保険法施行令42条、高齢者の医療の確保に関する法律施行令15条（自己負担限度額の区分）";
const KOUKI_SRC = "高齢者の医療の確保に関する法律50条・52条（75歳の誕生日から被保険者）";
const FORMAT_SRC = "形式の確かめ";
const UKE_SRC = "記録条件仕様（医科）HO レコード：記号・番号は38バイトまで";

/** 法別番号 (8 digits) a kind of insurer may have. */
const HOUBETSU: Record<Exclude<InsurerKind, "国保">, string[]> = {
  協会けんぽ: ["01"],
  組合健保: ["06", "63"],
  共済: ["31", "32", "33", "34", "72", "73", "74", "75"],
  後期高齢者: ["39"],
};
const HOUBETSU_NAME: Record<string, string> = {
  "01": "全国健康保険協会管掌健康保険",
  "02": "船員保険",
  "03": "日雇特例被保険者の保険（一般療養）",
  "04": "日雇特例被保険者の保険（特別療養費）",
  "06": "組合管掌健康保険",
  "07": "自衛官等の療養の給付",
  "31": "国家公務員共済組合",
  "32": "地方公務員等共済組合",
  "33": "警察共済組合",
  "34": "公立学校共済組合・日本私立学校振興・共済事業団",
  "39": "後期高齢者医療",
  "63": "特定健康保険組合（特例退職）",
  "72": "国家公務員特定共済組合（特例退職）",
  "73": "地方公務員等特定共済組合（特例退職）",
  "74": "警察特定共済組合（特例退職）",
  "75": "公立学校特定共済組合など（特例退職）",
};

/** The 検証番号 worked out the way the 設定要領 shows it (weights 2,1,2,1… from the last digit). */
export function checkDigitWork(body: string): string {
  const digits = [...body].map(Number);
  const n = digits.length;
  let sum = 0;
  const terms = digits.map((v, i) => {
    const w = (n - 1 - i) % 2 === 0 ? 2 : 1;
    const p = v * w;
    const s = Math.floor(p / 10) + (p % 10);
    sum += s;
    return p >= 10 ? `${v}×${w}=${p}→${s}` : `${v}×${w}`;
  });
  const ones = sum % 10;
  return `${terms.join(" + ")} = ${sum} → 10 − ${ones} = ${(10 - ones) % 10}`;
}

// ---------------------------------------------------------------------------
// Age bands (the law counts an age as reached the day before the birthday)
// ---------------------------------------------------------------------------

export type AgeBand = "未就学" | "70歳未満" | "70〜74歳" | "75歳以上";
type Ymd = { y: number; m: number; d: number };

const utc = (x: Ymd) => Date.UTC(x.y, x.m - 1, x.d);
const ymdOf = (t: number): Ymd => {
  const d = new Date(t);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() };
};
const parse = (iso: string): Ymd => {
  const [y, m, d] = iso.split("-").map(Number);
  return { y, m, d };
};

export function validDate(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const p = parse(iso);
  const back = ymdOf(utc(p));
  return back.y === p.y && back.m === p.m && back.d === p.d && p.y >= 1900;
}

/** The day an age is reached: the day before that birthday (年齢計算ニ関スル法律・民法143条). */
function reached(birth: string, years: number): Ymd {
  const b = parse(birth);
  return ymdOf(Date.UTC(b.y + years, b.m - 1, b.d) - 86_400_000);
}

/**
 * 未就学: up to the first 3月31日 on or after the day 6 is reached (健康保険法110条2項1号ロ).
 * 70〜74歳: from the month after the month 70 is reached (健康保険法74条1項2号).
 * 75歳以上: from the 75th birthday (後期高齢者医療).
 */
export function ageBand(birth: string, on: Ymd): AgeBand {
  if (ageOn(birth, on) >= 75) return "75歳以上";
  const r70 = reached(birth, 70);
  const from70 = r70.m === 12 ? { y: r70.y + 1, m: 1 } : { y: r70.y, m: r70.m + 1 };
  if (on.y * 12 + on.m >= from70.y * 12 + from70.m) return "70〜74歳";
  const r6 = reached(birth, 6);
  const march31 = { y: r6.m <= 3 ? r6.y : r6.y + 1, m: 3, d: 31 };
  if (utc(on) <= utc(march31)) return "未就学";
  return "70歳未満";
}

const isGenekiNami = (c: IncomeClass) => c.startsWith("現役並み");

/** The 負担割合 the law gives for this band and 所得区分 (null when the band and class do not go together). */
export function expectedRate(band: AgeBand, kind: InsurerKind, cls: IncomeClass): 10 | 20 | 30 | null {
  if (kind === "後期高齢者") {
    if (!KOUKI_CLASSES.includes(cls)) return null;
    return isGenekiNami(cls) ? 30 : cls === "一般Ⅱ" ? 20 : 10;
  }
  if (band === "75歳以上") return null;
  if (band === "70〜74歳") return ELDER_CLASSES.includes(cls) ? (isGenekiNami(cls) ? 30 : 20) : null;
  if (!UNDER70_CLASSES.includes(cls)) return null;
  return band === "未就学" ? 20 : 30;
}

// ---------------------------------------------------------------------------
// What follows from the form
// ---------------------------------------------------------------------------

const LOW: IncomeClass[] = ["オ", "低所得Ⅱ", "低所得Ⅰ"];

/**
 * Whether the window may apply the 高額療養費 limit (現物給付): the 適用区分 is shown by a 認定証 or
 * given through オンライン資格確認; for 70歳以上 一般・現役並みⅢ the 高齢受給者証 (後期高齢者は
 * 被保険者証・資格確認書) is enough, because the 区分 follows from the 負担割合.
 */
export function windowLimit(f: InsuranceForm): { known: boolean; why: string } {
  if (f.proof && f.proof !== "なし") return { known: true, why: `${f.proof}で区分がわかる` };
  const cls = f.incomeClass;
  const byRate = cls === "一般" || cls === "一般Ⅱ" || cls === "一般Ⅰ" || cls === "現役並みⅢ";
  if (byRate && f.kind === "後期高齢者") return { known: true, why: "後期高齢者の被保険者証（資格確認書）の負担割合で区分がわかる" };
  if (byRate && f.elderCard) return { known: true, why: "高齢受給者証の負担割合で区分がわかる" };
  return { known: false, why: "区分を示すもの（限度額適用認定証・マイナ保険証の情報など）がない" };
}

/** 食事療養標準負担額の区分: the reduced amounts need the 減額認定 (認定証 or オンライン資格確認). */
export function mealClassOf(f: InsuranceForm): MealClass {
  const reduced = f.proof === "限度額適用・標準負担額減額認定証" || f.proof === "マイナ保険証（オンライン資格確認）";
  if (!reduced) return "一般";
  if (f.incomeClass === "オ" || f.incomeClass === "低所得Ⅱ") return Number(f.stayDays || 0) > 90 ? "低所得Ⅱ（90日超）" : "低所得Ⅱ（90日以下）";
  if (f.incomeClass === "低所得Ⅰ") return "低所得Ⅰ";
  return "一般";
}

/** The 受給者証 as the bill uses it (rate and cap from the 制度; the cap typed from the card). */
export function toKohi(k: KohiForm): Kohi {
  const kind = kohiKind(k.lawNo);
  const cap = k.capYen.trim();
  return {
    lawNo: k.lawNo.trim(),
    name: k.name.trim() || kind?.name || `法別 ${k.lawNo}`,
    payerNumber: k.payerNumber.trim(),
    recipientNumber: k.recipientNumber.trim(),
    rate: kind?.rate ?? 0,
    capYen: cap !== "" && kind?.cap === "受給者証" ? Number(cap) : null,
  };
}

/** The insurance the claim uses. Call only when `checkInsurance` has no errors. */
export function toInsurance(f: InsuranceForm): Insurance {
  const symbol = f.symbol.trim();
  const branch = f.branch.trim();
  const extra: Partial<Insurance> = {
    ...(f.kohi.length ? { kohi: f.kohi.map(toKohi) } : {}),
    ...(f.validUntil ? { validUntil: f.validUntil } : {}),
    ...(f.verify ? { verify: { method: f.verify, on: f.verifiedOn } } : {}),
  };
  if (!isMedical(f)) {
    const coverage = f.coverage as Coverage;
    const kohi = extra.kohi ?? [];
    return {
      kind: "国保",
      insurerNumber: "",
      number: "",
      relation: "本人",
      birthDate: f.birthDate,
      rate: coverage === "自費" ? 100 : coverage === "労災" ? 0 : kohi.length ? Math.min(...kohi.map((k) => k.rate)) : 0,
      incomeClass: "該当なし",
      limitKnown: false,
      mealClass: coverage === "生活保護" ? "低所得Ⅱ（90日以下）" : "一般",
      coverage,
      ...extra,
    };
  }
  return {
    kind: f.kind as InsurerKind,
    insurerNumber: f.insurerNumber.trim(),
    ...(symbol ? { symbol } : {}),
    number: f.number.trim(),
    ...(branch ? { branch } : {}),
    relation: f.relation as Insurance["relation"],
    birthDate: f.birthDate,
    rate: Number(f.rate),
    incomeClass: f.incomeClass as IncomeClass,
    limitKnown: windowLimit(f).known,
    mealClass: mealClassOf(f),
    ...(f.stayDays.trim() !== "" ? { daysLast12Months: Number(f.stayDays) } : {}),
    ...extra,
  };
}

const RECEIPT_TYPE_NAME: Record<string, string> = {
  "1111": "医保単独・本人・入院",
  "1113": "医保単独・未就学者・入院",
  "1115": "医保単独・家族・入院",
  "1117": "医保単独・高齢受給者一般・低所得者・入院",
  "1119": "医保単独・高齢受給者7割・入院",
  "1317": "後期高齢者単独・一般・低所得者・入院",
  "1319": "後期高齢者単独・7割・入院",
};

/** What code works out from a registration that passed the checks (shown next to the form). */
export function derived(ins: Insurance, on: Ymd): { label: string; value: string }[] {
  const age = ageOn(ins.birthDate, on);
  const band = ageBand(ins.birthDate, on);
  if (ins.coverage && ins.coverage !== "医保") {
    const k = ins.kohi ?? [];
    return [
      { label: "年齢", value: `${age}歳（${band}）` },
      { label: "請求先", value: ins.coverage === "自費" ? "患者本人（全額）" : ins.coverage === "労災" ? "労働基準監督署（労災保険。この試作では算定しない）" : k.length ? k.map((x) => `公費 ${x.lawNo} ${x.name}（負担者番号 ${x.payerNumber}）`).join("／") : "受給者証が未登録" },
      { label: "窓口の患者負担", value: ins.coverage === "自費" ? "点数 × 10円の全額" : ins.coverage === "労災" ? "なし" : k.length ? k.map((x) => `${x.rate}%${x.capYen !== null ? `・上限 ${x.capYen.toLocaleString("ja-JP")}円/月` : ""}`).join("／") : "—" },
      { label: "レセプト種別", value: "この試作では公費単独・自費・労災のレセプトは作りません" },
    ];
  }
  const rt = receiptType(ins, age, band === "未就学");
  const tokki = tokkiCode(ins, age);
  const kubun = futanKubun(ins, age);
  return [
    { label: "年齢", value: `${age}歳（${band}）` },
    { label: "請求先", value: ins.kind === "国保" || ins.kind === "後期高齢者" ? "国民健康保険団体連合会" : "社会保険診療報酬支払基金" },
    { label: "レセプト種別", value: `${rt} ${RECEIPT_TYPE_NAME[rt] ?? ""}` },
    { label: "窓口の高額療養費", value: ins.limitKnown ? `限度額まで（区分 ${ins.incomeClass}）` : "差し引かない（区分がわからない）" },
    { label: "特記事項", value: tokki ? `${tokki} ${TOKKI_NAME[tokki]}` : "なし" },
    { label: "食事の標準負担額", value: ins.mealClass },
    { label: "一部負担金・食事療養費標準負担額区分", value: kubun ?? "なし" },
  ];
}

export const insuranceSummary = (ins: Insurance) => {
  const kohi = ins.kohi?.length ? `・公費 ${ins.kohi.map((k) => k.lawNo).join("・")}` : "";
  if (ins.coverage && ins.coverage !== "医保") return `${ins.coverage}${kohi}`;
  return `${ins.kind}（${ins.relation}）${ins.rate / 10}割・区分 ${ins.incomeClass}${kohi}`;
};

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

export interface FormCheck {
  /** error: cannot be registered. warn: a person checks the card again. info: what follows. */
  level: "error" | "warn" | "info";
  field?: keyof InsuranceForm;
  text: string;
  basis: string;
}

const KOHI_SRC = "保険者番号等の設定要領 第2（公費負担者番号：法別番号2桁・都道府県番号2桁・実施機関番号3桁・検証番号1桁）・受給者番号は7桁";

/** The 受給者証 entries: numbers in the official form, the 法別番号 matching the 制度, the cap when the 制度 has one. */
export function checkKohi(list: KohiForm[], on: Ymd, validUntil: string): FormCheck[] {
  const out: FormCheck[] = [];
  list.forEach((k, i) => {
    const n = i + 1;
    const kind = kohiKind(k.lawNo);
    if (!k.lawNo) out.push({ level: "error", field: "kohi", text: `公費${n}の制度（法別番号）を選んでください。`, basis: FORMAT_SRC });
    const payer = k.payerNumber.trim();
    if (!/^\d{8}$/.test(payer)) out.push({ level: "error", field: "kohi", text: `公費${n}の負担者番号は8桁の数字です。`, basis: KOHI_SRC });
    else {
      if (checkDigit(payer.slice(0, 7)) !== payer.slice(7)) out.push({ level: "error", field: "kohi", text: `公費${n}の負担者番号の検証番号（最後の1桁）が合いません。計算：${checkDigitWork(payer.slice(0, 7))}（入力は ${payer.slice(7)}）`, basis: KOHI_SRC });
      if (k.lawNo && payer.slice(0, 2) !== k.lawNo) out.push({ level: "error", field: "kohi", text: `公費${n}の負担者番号の最初の2桁（${payer.slice(0, 2)}）が制度の法別番号 ${k.lawNo} と合いません。`, basis: KOHI_SRC });
    }
    if (!/^\d{7}$/.test(k.recipientNumber.trim())) out.push({ level: "error", field: "kohi", text: `公費${n}の受給者番号は7桁の数字です。`, basis: KOHI_SRC });
    const cap = k.capYen.trim();
    if (kind?.cap === "受給者証") {
      if (cap === "") out.push({ level: "warn", field: "kohi", text: `公費${n}（${kind.name}）は受給者証に自己負担上限月額が書いてあります。空のままだと上限なしで計算します。`, basis: kind.basis });
      else if (!/^\d+$/.test(cap)) out.push({ level: "error", field: "kohi", text: `公費${n}の上限月額は円の整数で入れてください。`, basis: FORMAT_SRC });
    } else if (cap !== "") out.push({ level: "warn", field: "kohi", text: `公費${n}（${kind?.name ?? k.lawNo}）には上限月額の決まりがないので、入れた額は使いません。`, basis: kind?.basis ?? FORMAT_SRC });
    if (kind) out.push({ level: "info", field: "kohi", text: `公費${n} ${kind.name}：患者の負担は費用の${kind.rate}%${kind.cap === "受給者証" ? "（受給者証の上限まで）" : ""}。`, basis: kind.basis });
  });
  if (validUntil) {
    if (!validDate(validUntil)) out.push({ level: "error", field: "validUntil", text: "有効期限が日付になっていません。", basis: FORMAT_SRC });
    else if (utc(parse(validUntil)) < utc(on)) out.push({ level: "error", field: "validUntil", text: `有効期限（${validUntil}）が切れています。新しい証を確かめてください。`, basis: FORMAT_SRC });
    else if (utc(parse(validUntil)) - utc(on) < 31 * 86_400_000) out.push({ level: "warn", field: "validUntil", text: `有効期限（${validUntil}）が1か月以内です。更新を伝えてください。`, basis: FORMAT_SRC });
  }
  return out;
}

/** 資格確認の方法 and its day: required for 医保 and 公費; the day must not be in the future. */
export function checkVerify(f: Pick<InsuranceForm, "verify" | "verifiedOn" | "coverage">, on: Ymd): FormCheck[] {
  const out: FormCheck[] = [];
  if (f.coverage === "自費" || f.coverage === "労災") return out;
  if (!f.verify) out.push({ level: "error", field: "verify", text: "資格確認の方法（オンライン資格確認（模擬）・保険証・資格確認書）を選んでください。", basis: "療養担当規則3条（被保険者証等による資格の確認。オンライン資格確認は模擬）" });
  if (f.verifiedOn) {
    if (!validDate(f.verifiedOn)) out.push({ level: "error", field: "verifiedOn", text: "確認日が日付になっていません。", basis: FORMAT_SRC });
    else if (utc(parse(f.verifiedOn)) > utc(on)) out.push({ level: "error", field: "verifiedOn", text: "確認日が今日より後です。", basis: FORMAT_SRC });
  }
  return out;
}

const REQUIRED: [keyof InsuranceForm, string][] = [
  ["kind", "保険の種類"],
  ["insurerNumber", "保険者番号"],
  ["number", "番号"],
  ["relation", "本人・家族"],
  ["birthDate", "生年月日"],
  ["rate", "負担割合"],
  ["incomeClass", "所得区分"],
  ["proof", "適用区分の確かめ方"],
];

/**
 * Checks of the form against the card rules. `age` is the age in the chart, `on` today.
 * Every check names what it rests on.
 */
export function checkInsurance(f: InsuranceForm, ctx: { age: number; on: Ymd }): FormCheck[] {
  const out: FormCheck[] = [];
  if (!isMedical(f)) {
    // No 医保: the birth date, the 受給者証 (for 生活保護・公費のみ) and how the 資格 was checked.
    if (!f.birthDate) out.push({ level: "error", field: "birthDate", text: "生年月日を入れてください。", basis: FORMAT_SRC });
    else if (!validDate(f.birthDate)) out.push({ level: "error", field: "birthDate", text: "生年月日が日付になっていません。", basis: FORMAT_SRC });
    else if (ageOn(f.birthDate, ctx.on) !== ctx.age) out.push({ level: "warn", field: "birthDate", text: `生年月日からは${ageOn(f.birthDate, ctx.on)}歳ですが、カルテは${ctx.age}歳です。本人の確認をしてください。`, basis: FORMAT_SRC });
    if (f.coverage === "生活保護") {
      if (!f.kohi.length) out.push({ level: "error", field: "kohi", text: "生活保護は公費（法別 12）の負担者番号・受給者番号を医療券（受給者証）から入れてください。", basis: "生活保護法15条・34条（医療扶助は指定医療機関への委託で、医療券で確かめる）" });
      else if (!f.kohi.some((k) => k.lawNo === "12")) out.push({ level: "error", field: "kohi", text: "生活保護の公費は法別番号 12 です。", basis: KOHI_SRC });
    }
    if (f.coverage === "公費のみ" && !f.kohi.length) out.push({ level: "error", field: "kohi", text: "医保のない公費単独は、受給者証（公費）を1つ以上入れてください。", basis: FORMAT_SRC });
    if (f.coverage === "労災") out.push({ level: "info", text: "労災は労働基準監督署に請求します（様式第5号など）。この試作では労災の点数表で算定せず、患者負担は 0 円とします。", basis: "労働者災害補償保険法13条（療養補償給付）" });
    if (f.coverage === "自費") out.push({ level: "info", text: "自費は保険を使いません。点数 × 10円の全額が患者負担です。", basis: FORMAT_SRC });
    out.push(...checkKohi(f.kohi, ctx.on, f.validUntil), ...checkVerify(f, ctx.on));
    return out;
  }
  for (const [k, label] of REQUIRED) if (f[k] === "") out.push({ level: "error", field: k, text: `${label}を入れてください。`, basis: FORMAT_SRC });
  out.push(...checkVerify(f, ctx.on));
  if (f.kohi.some((k) => k.lawNo === "12")) out.push({ level: "warn", field: "kohi", text: "生活保護の医療扶助は、ふつう国保の人には併用されません（国保の適用除外）。社保との併用か、生活保護単独かを確かめてください。", basis: "国民健康保険法6条9号（生活保護の受給者は国保の被保険者としない）" });
  out.push(...checkKohi(f.kohi, ctx.on, f.validUntil));

  // 保険者番号: digits, 検証番号, 法別番号, 都道府県番号.
  const no = f.insurerNumber.trim();
  if (no && f.kind) {
    const want = f.kind === "国保" ? 6 : 8;
    if (!/^\d+$/.test(no) || no.length !== want) {
      out.push({ level: "error", field: "insurerNumber", text: `${f.kind}の保険者番号は${want}桁の数字です（${f.kind === "国保" ? "都道府県番号2桁・保険者別番号3桁・検証番号1桁" : "法別番号2桁・都道府県番号2桁・保険者別番号3桁・検証番号1桁"}）。`, basis: `${SETTEI} 1` });
    } else {
      const body = no.slice(0, -1);
      if (checkDigit(body) !== no.slice(-1)) {
        out.push({ level: "error", field: "insurerNumber", text: `検証番号（最後の1桁）が合いません。打ち間違いがないか保険証を見直してください。計算：${checkDigitWork(body)}（入力は ${no.slice(-1)}）`, basis: `${SETTEI} 5` });
      }
      if (f.kind !== "国保") {
        const h = no.slice(0, 2);
        if (!HOUBETSU[f.kind].includes(h)) {
          out.push({ level: "error", field: "insurerNumber", text: `法別番号 ${h}${HOUBETSU_NAME[h] ? `（${HOUBETSU_NAME[h]}）` : ""} は${f.kind}の番号ではありません（${f.kind}は ${HOUBETSU[f.kind].join("・")}）。`, basis: HOUBETSU_SRC });
        }
      }
      const pref = Number(f.kind === "国保" ? no.slice(0, 2) : no.slice(2, 4));
      if (pref < 1 || pref > 47) out.push({ level: "warn", field: "insurerNumber", text: `都道府県番号 ${String(pref).padStart(2, "0")} は 01〜47 の外です。保険証を見直してください。`, basis: `${SETTEI} 3（別表2）` });
    }
  }

  // 記号・番号・枝番.
  const symbol = f.symbol.trim();
  const number = f.number.trim();
  if (/[,，]/.test(symbol + number)) out.push({ level: "error", field: /[,，]/.test(symbol) ? "symbol" : "number", text: "記号・番号に「,」は入れられません（レセプトの区切りの字です）。", basis: UKE_SRC });
  if (symbol.length > 19) out.push({ level: "error", field: "symbol", text: "記号が長すぎます（全角19字まで）。", basis: UKE_SRC });
  if (number.length > 19) out.push({ level: "error", field: "number", text: "番号が長すぎます（全角19字まで）。", basis: UKE_SRC });
  if (f.kind === "後期高齢者") {
    if (symbol) out.push({ level: "warn", field: "symbol", text: "後期高齢者の被保険者証には記号がありません。番号の欄に被保険者番号を入れます。", basis: FORMAT_SRC });
    if (number && !/^\d{8}$/.test(number)) out.push({ level: "warn", field: "number", text: "後期高齢者の被保険者番号は8桁の数字です。", basis: FORMAT_SRC });
    if (f.relation === "家族") out.push({ level: "error", field: "relation", text: "後期高齢者医療に家族（被扶養者）はありません。一人ひとりが被保険者です。", basis: KOUKI_SRC });
  } else if (f.kind) {
    if (f.branch.trim() && !/^\d{2}$/.test(f.branch.trim())) out.push({ level: "error", field: "branch", text: "枝番は2桁の数字です。", basis: FORMAT_SRC });
    if (!f.branch.trim()) out.push({ level: "warn", field: "branch", text: "枝番がありません。保険証の記号・番号の右にある2桁の数字を確かめてください（レセプトの資格確認の欄に入ります）。", basis: FORMAT_SRC });
  }

  // 生年月日 and the age in the chart.
  if (f.birthDate && !validDate(f.birthDate)) out.push({ level: "error", field: "birthDate", text: "生年月日が日付になっていません。", basis: FORMAT_SRC });
  const birthOk = f.birthDate !== "" && validDate(f.birthDate) && utc(parse(f.birthDate)) <= utc(ctx.on);
  if (f.birthDate && validDate(f.birthDate) && !birthOk) out.push({ level: "error", field: "birthDate", text: "生年月日が今日より後です。", basis: FORMAT_SRC });
  if (!birthOk) return out;

  const age = ageOn(f.birthDate, ctx.on);
  const band = ageBand(f.birthDate, ctx.on);
  if (age !== ctx.age) out.push({ level: "warn", field: "birthDate", text: `生年月日からは${age}歳ですが、カルテは${ctx.age}歳です。本人の確認か保険証を見直してください。`, basis: FORMAT_SRC });

  // 後期高齢者 and age.
  if (f.kind === "後期高齢者" && band !== "75歳以上") out.push({ level: "warn", field: "kind", text: `${age}歳で後期高齢者医療に入るのは、65〜74歳で一定の障害の認定を受けた人だけです。認定を確かめてください。`, basis: "高齢者の医療の確保に関する法律50条2号" });
  if (f.kind && f.kind !== "後期高齢者" && band === "75歳以上") out.push({ level: "error", field: "kind", text: `${age}歳（75歳以上）は後期高齢者医療の被保険者です。後期高齢者の被保険者証（資格確認書）で登録してください。`, basis: KOUKI_SRC });

  // 所得区分 and 負担割合.
  if (f.kind && f.incomeClass && !(f.kind !== "後期高齢者" && band === "75歳以上")) {
    const allowed = f.kind === "後期高齢者" ? KOUKI_CLASSES : band === "70〜74歳" ? ELDER_CLASSES : UNDER70_CLASSES;
    const who = f.kind === "後期高齢者" ? "後期高齢者" : band === "70〜74歳" ? "70〜74歳" : "70歳未満";
    if (!allowed.includes(f.incomeClass)) {
      out.push({ level: "error", field: "incomeClass", text: `${who}の所得区分は ${allowed.join("・")} のどれかです（いまは「${f.incomeClass}」）。`, basis: CLASS_SRC });
    } else if (f.rate) {
      const want = expectedRate(band, f.kind, f.incomeClass);
      if (want !== null && want !== Number(f.rate)) {
        out.push({ level: "warn", field: "rate", text: `${who}${band === "未就学" ? "（未就学）" : ""}・区分「${f.incomeClass}」の負担割合は${want / 10}割です（入力は${Number(f.rate) / 10}割）。保険証・高齢受給者証の割合を見直してください。`, basis: RATE_SRC });
      }
    }
  }

  // 高齢受給者証 (70〜74歳).
  if (f.kind && f.kind !== "後期高齢者" && band === "70〜74歳" && !f.elderCard && f.proof !== "マイナ保険証（オンライン資格確認）") {
    out.push({ level: "warn", field: "elderCard", text: "70〜74歳は高齢受給者証（またはマイナ保険証の情報）で負担割合を確かめます。", basis: "健康保険法74条1項（70〜74歳の負担割合。割合は保険者が交付する高齢受給者証に書かれる）" });
  }

  // The 認定証 and the 区分 it goes with.
  if (f.incomeClass) {
    const low = LOW.includes(f.incomeClass);
    if (f.proof === "限度額適用・標準負担額減額認定証" && !low) out.push({ level: "warn", field: "proof", text: `限度額適用・標準負担額減額認定証は住民税非課税の区分（オ・低所得Ⅱ・低所得Ⅰ）の証です。区分「${f.incomeClass}」と合いません。`, basis: CLASS_SRC });
    if (f.proof === "限度額適用認定証" && low) out.push({ level: "warn", field: "proof", text: `区分「${f.incomeClass}」の証は限度額適用・標準負担額減額認定証です（食事の負担も下がります）。証の名前を見直してください。`, basis: CLASS_SRC });
  }
  if (f.stayDays.trim() !== "") {
    const n = Number(f.stayDays);
    if (!Number.isInteger(n) || n < 0 || n > 366) out.push({ level: "error", field: "stayDays", text: "過去12か月の入院日数は0〜366の整数です。", basis: FORMAT_SRC });
    else if (n > 90 && (f.incomeClass === "オ" || f.incomeClass === "低所得Ⅱ")) out.push({ level: "info", field: "stayDays", text: "減額認定を受けてからの入院が90日を超えています：食事は「90日超」の額になります（保険者に長期入院の申請をして、認定証に記載されてから使います）。", basis: "健康保険法85条2項（食事療養標準負担額）" });
  }

  // What follows (always shown).
  const lim = windowLimit(f);
  if (f.incomeClass && f.proof) out.push({ level: "info", text: lim.known ? `窓口で高額療養費の限度額を使います（${lim.why}）。` : `窓口では高額療養費を差し引きません（${lim.why}）。あとで保険者に申請すれば払い戻されます。`, basis: "健康保険法施行令43条（現物給付）" });
  return out;
}

export const hasErrors = (cs: FormCheck[]) => cs.some((c) => c.level === "error");

// ---------------------------------------------------------------------------
// The demo patients, registered on their admission day (FICTIONAL numbers)
// ---------------------------------------------------------------------------

/** The cards of the four demo patients as 医事課 typed them (toInsurance gives INSURANCE back; see the test). */
export const DEMO_FORMS: Record<string, InsuranceForm> = {
  // 72歳・国保・高齢受給者証（2割・一般）
  "90010231": { ...EMPTY_FORM, kind: "国保", insurerNumber: INSURANCE["90010231"].insurerNumber, symbol: "架空", number: "1072", branch: "00", relation: "本人", birthDate: "1954-04-12", rate: "20", incomeClass: "一般", elderCard: true, proof: "なし", verify: "資格確認書", verifiedOn: "2026-10-28" },
  // 86歳・後期高齢者（1割・低所得Ⅱ、限度額適用・標準負担額減額認定証）
  "90010244": { ...EMPTY_FORM, kind: "後期高齢者", insurerNumber: INSURANCE["90010244"].insurerNumber, number: "00086001", relation: "本人", birthDate: "1940-02-20", rate: "10", incomeClass: "低所得Ⅱ", proof: "限度額適用・標準負担額減額認定証", stayDays: "12", verify: "資格確認書", verifiedOn: "2026-10-30" },
  // 79歳・後期高齢者（2割・一般Ⅱ）
  "90010198": { ...EMPTY_FORM, kind: "後期高齢者", insurerNumber: INSURANCE["90010198"].insurerNumber, number: "00079001", relation: "本人", birthDate: "1947-05-03", rate: "20", incomeClass: "一般Ⅱ", proof: "なし", verify: "資格確認書", verifiedOn: "2026-11-01" },
  // 64歳・協会けんぽの家族（3割・区分ウ、マイナ保険証で区分の情報あり）
  "90010260": { ...EMPTY_FORM, kind: "協会けんぽ", insurerNumber: INSURANCE["90010260"].insurerNumber, symbol: "９９９９", number: "64", branch: "01", relation: "家族", birthDate: "1962-03-15", rate: "30", incomeClass: "ウ", proof: "マイナ保険証（オンライン資格確認）", verify: "オンライン資格確認（模擬）", verifiedOn: "2026-11-02" },
};

const withCheck = (body: string) => body + checkDigit(body);

/**
 * Today's outpatients (opd.ts), as 受付 registered them this morning (FICTIONAL numbers, 神奈川県 = 14).
 * Keys are the visit's chart id ("opd:" + id), the same key the 患者基本情報 window uses.
 */
export const OPD_DEMO_FORMS: Record<string, InsuranceForm> = {
  // 石田 正男 78歳・後期高齢者 2割（一般Ⅱ）・マイナ保険証
  "opd:opd-1": { ...EMPTY_FORM, kind: "後期高齢者", insurerNumber: withCheck("3914099"), number: "00078001", relation: "本人", birthDate: "1948-06-10", rate: "20", incomeClass: "一般Ⅱ", proof: "マイナ保険証（オンライン資格確認）", verify: "オンライン資格確認（模擬）", verifiedOn: "2026-11-04", validUntil: "2027-07-31" },
  // 原田 恵子 54歳・協会けんぽ 本人 3割（区分ウ）・資格確認書
  "opd:opd-2": { ...EMPTY_FORM, kind: "協会けんぽ", insurerNumber: withCheck("0114099"), symbol: "８８８８", number: "54", branch: "00", relation: "本人", birthDate: "1972-02-14", rate: "30", incomeClass: "ウ", proof: "なし", verify: "資格確認書", verifiedOn: "2026-11-04" },
  // 吉村 拓也 32歳・生活保護（医療扶助 単独、法別 12。医療券は架空）
  "opd:opd-3": { ...EMPTY_FORM, coverage: "生活保護", birthDate: "1994-08-21", kohi: [{ lawNo: "12", name: "生活保護（医療扶助）", payerNumber: withCheck("1214001"), recipientNumber: "0000321", capYen: "" }], verify: "オンライン資格確認（模擬）", verifiedOn: "2026-11-04" },
  // 中谷 修 71歳・国保 高齢受給者 2割（一般）・資格確認書（会計待ちの人）
  "opd:opd-6": { ...EMPTY_FORM, kind: "国保", insurerNumber: withCheck("14099"), symbol: "架空", number: "1071", branch: "00", relation: "本人", birthDate: "1955-01-20", rate: "20", incomeClass: "一般", elderCard: true, proof: "なし", verify: "資格確認書", verifiedOn: "2026-11-04", validUntil: "2027-07-31" },
};

export const INITIAL_INSURANCE_BOOK: InsuranceBook = Object.fromEntries([
  ...Object.entries(DEMO_FORMS).map(([id, form]) => [
    id,
    [{ form, insurance: toInsurance(form), action: "登録" as const, by: "医事課", at: { day: PATIENTS.find((p) => p.id === id)?.admittedOn ?? 0, time: "16:00" } }],
  ]),
  ...Object.entries(OPD_DEMO_FORMS).map(([id, form]) => [id, [{ form, insurance: toInsurance(form), action: "登録" as const, by: "医事課 渡辺", at: { day: 0, time: "08:30" } }]]),
]);
