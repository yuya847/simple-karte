// オンライン資格確認（模擬）: what the national service answers about a patient's insurance (資格情報), and —
// when the patient agrees at the card reader — the 薬剤情報 and 特定健診情報. The items and their names follow
// the public documents (ONSHI_SOURCES); the vendor-only 医療機関等ONS (where the interface spec is) was not
// used, so the item list is the one the public documents give. The answers are FICTIONAL and made in code
// (the same every time). 医事課 copies the 資格情報 into 保険の登録, where the usual checks run.

import { addDays, isoDate, type CalendarDate } from "../dates";
import { ageOn, checkDigit, INSURANCE, type IncomeClass, type InsurerKind } from "../billing/insurance";
import { ageBand, DEMO_FORMS, EMPTY_FORM, expectedRate, type InsuranceForm } from "../billing/registration";
import { timingName } from "../rx";
import { birthDateOf, pick, seedOf } from "./fictional";
import { codesOf, OTHER_INSTITUTIONS, otherRxOf } from "./other-records";
import type { SpecRef, Unfilled } from "./spec";

export const ONSHI_SOURCES: SpecRef[] = [
  { name: "厚生労働省「オンライン資格確認について（医療機関・施術所等、システムベンダ向け）」", url: "https://www.mhlw.go.jp/stf/newpage_08280.html", note: "全体の案内" },
  { name: "厚生労働省「オンライン資格確認等システムに関する運用等に係る検討結果について」", version: "令和3年4月版", url: "https://www.mhlw.go.jp/content/10200000/000726675.pdf", note: "資格情報の項目（基本情報・加入者資格情報・被保険者証等情報・高齢受給者証情報・限度額適用認定証関連情報）と適用区分の値（A01〜A99・B01〜B08）" },
  { name: "厚生労働省「システムベンダ向け技術解説書【医療機関・薬局】」", version: "令和8年10月 第1.6版", url: "https://www.mhlw.go.jp/content/10200000/000575785.pdf", note: "照会の結果（有効・無効など）、照会番号、薬剤情報・特定健診情報は同意後24時間に限り照会できること" },
  { name: "厚生労働省「医療機関・患者が閲覧できる医療情報について」", version: "令和8年10月", url: "https://www.mhlw.go.jp/content/10800000/001753948.pdf", note: "薬剤情報の項目（処方年月日・医療機関名・薬局名・医薬品名・成分名・処方区分・使用区分・用法・1回使用量・調剤数量）と保存期間、電子処方箋の処方・調剤情報（100日）" },
  { name: "厚生労働省「顔認証付きカードリーダーの同意画面の改善について」", url: "https://www.mhlw.go.jp/stf/newpage_44002.html", note: "同意の画面（全て同意する／個別に同意する：手術・診療とお薬・健診）、限度額の同意画面の廃止（マイナ保険証）" },
  { name: "医療情報基盤・診療報酬審査支払機構「保健医療情報の提供」（特定健診情報・薬剤情報の帳票）", url: "https://www.hpdx.or.jp/datahealth/hoken_iryo_joho.html", note: "特定健診情報の項目（直近5回分）" },
  { name: "事務連絡「『オンライン資格確認』本格運用開始について」（令和3年10月15日）", url: "https://kouseikyoku.mhlw.go.jp/tokaihokuriku/iryo_hoken/sonota/000203802.pdf", note: "オンライン資格確認で確かめた限度額は、認定証の提示があったものとして扱う" },
];

/** Who is asked about: the chart's patient, or what the window typed for a new outpatient. */
export interface OnshiPerson {
  /** Chart id (inpatient) or outpatient id; also sent as the 照会番号. */
  id?: string;
  name: string;
  kana: string;
  sex: "男" | "女";
  age: number;
  birthDate?: string;
}

/**
 * What the patient chose at the 顔認証付きカードリーダー (全て同意する／個別に同意する). The 限度額 needs a
 * consent only when asked with the 資格確認書 (マイナ保険証: no consent screen since 2024-10-07).
 */
export interface OnshiConsent {
  /** 過去の診療・お薬情報（薬剤情報）. */
  drugs: boolean;
  /** 過去の健診情報（特定健診情報）. */
  checkups: boolean;
  /** 限度額適用認定証関連情報の提供 (資格確認書での照会のとき). */
  limit: boolean;
}

/** 資格確認書の券面から照会するとき: 保険者番号・記号・番号・枝番・生年月日. */
export interface CardQuery {
  insurerNumber: string;
  symbol: string;
  number: string;
  branch: string;
  birthDate: string;
}

export type OnshiStatus = "有効" | "無効" | "該当資格なし";

/** 適用区分 (限度額適用認定証関連情報) as the 令和3年の項目表 gives the values. */
export const LIMIT_CLASS_CODES: { code: string; label: string; cls: IncomeClass | null }[] = [
  { code: "A01", label: "ア", cls: "ア" },
  { code: "A02", label: "イ", cls: "イ" },
  { code: "A03", label: "ウ", cls: "ウ" },
  { code: "A04", label: "エ", cls: "エ" },
  { code: "A05", label: "オ", cls: "オ" },
  { code: "A06", label: "オ（境）", cls: "オ" },
  { code: "A99", label: "滞納により未設定", cls: null },
  { code: "B01", label: "現役並みⅢ", cls: "現役並みⅢ" },
  { code: "B02", label: "現役並みⅡ", cls: "現役並みⅡ" },
  { code: "B03", label: "現役並みⅠ", cls: "現役並みⅠ" },
  { code: "B04", label: "一般", cls: "一般" },
  { code: "B05", label: "低所得Ⅱ", cls: "低所得Ⅱ" },
  { code: "B06", label: "低所得Ⅰ", cls: "低所得Ⅰ" },
  { code: "B07", label: "低所得Ⅰ（老福）", cls: "低所得Ⅰ" },
  { code: "B08", label: "低所得Ⅰ（境）", cls: "低所得Ⅰ" },
];

const classCodeOf = (c: IncomeClass): string => (c === "一般Ⅱ" || c === "一般Ⅰ" ? "B04" : LIMIT_CLASS_CODES.find((x) => x.cls === c)!.code);

export interface QualificationInfo {
  /** 基本情報. 住所・郵便番号 are left empty (the prototype's patients have no address). */
  name: string;
  kana: string;
  sex: "男" | "女";
  birthDate: string;
  address: string;
  /** 加入者資格情報. */
  insurerNumber: string;
  insurerName: string;
  /** 被保険者証記号 (none for 後期高齢者医療). */
  symbol: string;
  number: string;
  branch: string;
  /** 本人・家族の別 (1:本人、2:家族); not set for 後期高齢者医療. */
  relation: "本人" | "家族" | null;
  /** 被保険者氏名 (when the patient is a 家族). */
  insuredName?: string;
  acquired: string;
  /** 被保険者証等情報. */
  card: { kind: string; issued: string; validFrom: string; validTo: string; /** 一部負担金割合 (後期高齢者医療). */ rate?: 10 | 20 | 30 };
  /** 高齢受給者証情報 (70〜74歳). */
  elder?: { issued: string; validFrom: string; validTo: string; rate: 20 | 30 };
  /** 限度額適用認定証関連情報. */
  limit?: { kind: "限度額適用認定証" | "限度額適用・標準負担額減額認定証"; issued: string; validFrom: string; validTo: string; classCode: string; longStayFrom?: string };
}

export interface DrugInfoRow {
  /** 処方年月日 (a レセプト gives the month and day of 調剤; an 電子処方箋 the day). */
  date: string;
  institution: string;
  pharmacy: string;
  drug: string;
  ingredient: string;
  /** 処方区分 (院内・院外) and 使用区分 (内服・頓服…). */
  rxKind: "院外" | "院内";
  use: "内服" | "頓服";
  usage: string;
  perDose: string;
  quantity: string;
  via: "レセプト" | "電子処方箋（調剤情報）";
}

export interface CheckupItem {
  group: string;
  label: string;
  unit: string;
}
/** 特定健診情報 items shown (the DX審査支払機構 帳票; 詳細項目 and 質問票 are left out of this mock). */
export const CHECKUP_ITEMS: CheckupItem[] = [
  { group: "身体計測", label: "身長", unit: "cm" },
  { group: "身体計測", label: "体重", unit: "kg" },
  { group: "身体計測", label: "腹囲", unit: "cm" },
  { group: "身体計測", label: "BMI", unit: "" },
  { group: "血圧", label: "収縮期血圧", unit: "mmHg" },
  { group: "血圧", label: "拡張期血圧", unit: "mmHg" },
  { group: "血中脂質", label: "中性脂肪", unit: "mg/dL" },
  { group: "血中脂質", label: "HDLコレステロール", unit: "mg/dL" },
  { group: "血中脂質", label: "LDLコレステロール", unit: "mg/dL" },
  { group: "肝機能", label: "GOT（AST）", unit: "U/L" },
  { group: "肝機能", label: "GPT（ALT）", unit: "U/L" },
  { group: "肝機能", label: "γ-GT（γ-GTP）", unit: "U/L" },
  { group: "血糖", label: "空腹時血糖", unit: "mg/dL" },
  { group: "血糖", label: "HbA1c", unit: "%" },
  { group: "尿", label: "尿糖", unit: "" },
  { group: "尿", label: "尿蛋白", unit: "" },
  { group: "判定", label: "メタボリックシンドローム判定", unit: "" },
  { group: "判定", label: "保健指導レベル", unit: "" },
];

export interface CheckupRow {
  date: string;
  kind: "特定健診" | "後期高齢者健診";
  values: Record<string, string>;
}

export interface OnshiResult {
  status: OnshiStatus;
  /** Why, for 無効・該当資格なし. */
  reason?: string;
  checkedAt: string;
  how: "マイナ保険証" | "資格確認書";
  /** 照会番号: the hospital's patient number, returned with the answer. */
  queryNo: string;
  info?: QualificationInfo;
  drugs?: DrugInfoRow[];
  checkups?: CheckupRow[];
  /** What was not asked (no consent) or not given. */
  notGiven: string[];
}

export const ONSHI_UNFILLED: Unfilled[] = [
  { field: "住所・郵便番号", why: "この試作の患者には住所の記録がないので空のまま（保険者の登録も任意）。" },
  { field: "特定疾病療養受療証情報", why: "この試作の算定は特定疾病（長期高額疾病）を扱わないので返しません。" },
  { field: "診療情報・手術情報", why: "この試作では薬剤情報と特定健診情報だけを見せます。" },
  { field: "特定健診の詳細項目・質問票・医師の判断", why: "主な項目だけを架空の値で返します。受診勧奨判定値の印（▲▽）は判定値の出典を確かめていないので付けません。" },
  { field: "70歳未満の負担割合", why: "公開資料では、資格情報が70歳未満の3割・未就学児の2割を返すか確かめられませんでした。写すときは年齢と区分から法の割合をコードで入れ、「コードで入れた」と示します。" },
  { field: "後期高齢者の一般Ⅱ・一般Ⅰ", why: "令和3年の項目表の適用区分には一般（B04）しかないので、被保険者証の負担割合（2割・1割）で分けて写します（この試作の取り決め）。" },
  { field: "結果のコード値・資格喪失の画面", why: "結果コードの値は公開されていないので、有効・無効・該当資格なしの言葉だけを返します。" },
];

// ---------------------------------------------------------------------------
// The fictional answer
// ---------------------------------------------------------------------------

const INSURER_NAME: Record<InsurerKind, string> = {
  協会けんぽ: "全国健康保険協会（架空の支部番号）",
  組合健保: "架空健康保険組合",
  共済: "架空共済組合",
  国保: "架空市 国民健康保険",
  後期高齢者: "架空県 後期高齢者医療広域連合",
};

const withCheck = (body: string) => body + checkDigit(body);

/** A fictional insurer number of the kind (神奈川県 = 14, 保険者別番号 099 as in billing/insurance.ts). */
const insurerNumberOf = (kind: InsurerKind) => withCheck(kind === "国保" ? "14099" : kind === "後期高齢者" ? "3914099" : kind === "協会けんぽ" ? "0114099" : kind === "組合健保" ? "0614099" : "3114099");

/** The kind of insurer from the number (6 digits: 国保; else the 法別番号). */
export function kindOfNumber(no: string): InsurerKind | null {
  if (/^\d{6}$/.test(no)) return "国保";
  if (!/^\d{8}$/.test(no)) return null;
  const h = no.slice(0, 2);
  if (h === "39") return "後期高齢者";
  if (h === "01") return "協会けんぽ";
  if (h === "06" || h === "63") return "組合健保";
  if (["31", "32", "33", "34", "72", "73", "74", "75"].includes(h)) return "共済";
  return null;
}

const queryNoOf = (p: OnshiPerson) => p.id ?? `受付-${seedOf(`${p.name}|${p.kana}`) % 100000}`;

/** The record the fictional service holds for a person (the demo patients: what their cards say). */
function recordOf(person: OnshiPerson, today: CalendarDate): QualificationInfo & { kind: InsurerKind; incomeClass: IncomeClass; rate: 10 | 20 | 30 } {
  const key = person.id ?? `${person.name}|${person.kana}|${person.age}`;
  const seed = seedOf(key);
  const birthDate = person.birthDate || birthDateOf({ id: key, age: person.age }, today);
  const card = person.id ? DEMO_FORMS[person.id] : undefined;
  const band = ageBand(birthDate, today);
  const age = ageOn(birthDate, today);
  const kind: InsurerKind = card?.kind || (age >= 75 ? "後期高齢者" : age >= 70 ? "国保" : pick<InsurerKind>(["協会けんぽ", "組合健保", "国保", "共済"], seed));
  const incomeClass = (card?.incomeClass || (kind === "後期高齢者" ? "一般Ⅰ" : band === "70〜74歳" ? "一般" : "ウ")) as IncomeClass;
  const rate = (card?.rate ? Number(card.rate) : (expectedRate(band, kind, incomeClass) ?? 30)) as 10 | 20 | 30;
  const iso = (d: number) => isoDate(addDays(today, d));
  // 高齢受給者証・後期高齢者の証・限度額の証: 8月1日から翌年7月31日まで (架空の値).
  const fy = today.m >= 8 ? today.y : today.y - 1;
  const term = { issued: `${fy}-07-15`, validFrom: `${fy}-08-01`, validTo: `${fy + 1}-07-31` };
  const kouki = kind === "後期高齢者";
  const relation: "本人" | "家族" | null = kouki ? null : card?.relation || pick<"本人" | "家族">(["本人", "家族"], seed, 1);
  const acquired = kouki ? `${Number(birthDate.slice(0, 4)) + 75}${birthDate.slice(4)}` : iso(-((seed % 3000) + 200));
  const low = incomeClass === "オ" || incomeClass === "低所得Ⅱ" || incomeClass === "低所得Ⅰ";
  const needsLimitCard = !(kouki && (incomeClass === "一般Ⅱ" || incomeClass === "一般Ⅰ" || incomeClass === "現役並みⅢ")) && !(band === "70〜74歳" && (incomeClass === "一般" || incomeClass === "現役並みⅢ"));
  return {
    kind,
    incomeClass,
    rate,
    name: person.name,
    kana: person.kana,
    sex: person.sex,
    birthDate,
    address: "",
    insurerNumber: (person.id ? INSURANCE[person.id]?.insurerNumber : undefined) ?? insurerNumberOf(kind),
    insurerName: INSURER_NAME[kind],
    symbol: kouki ? "" : card ? card.symbol : String((seed % 9000) + 1000),
    number: card ? card.number : kouki ? String((seed % 90000000) + 10000000) : String((seed % 900) + 100),
    branch: kouki ? "" : card ? card.branch : "00",
    relation,
    ...(relation === "家族" ? { insuredName: `${person.name.split(" ")[0]} 架空（被保険者）` } : {}),
    acquired: acquired > iso(0) ? iso(-30) : acquired,
    card: kouki ? { kind: "被保険者証（一般）", ...term, rate } : { kind: "被保険者証（一般）", issued: acquired > iso(0) ? iso(-30) : acquired, validFrom: acquired > iso(0) ? iso(-30) : acquired, validTo: "" },
    ...(band === "70〜74歳" && !kouki ? { elder: { ...term, rate: rate === 30 ? 30 : 20 } } : {}),
    ...(needsLimitCard ? { limit: { kind: low ? "限度額適用・標準負担額減額認定証" : "限度額適用認定証", ...term, classCode: classCodeOf(incomeClass) } } : {}),
  };
}

const ingredientName = (drug: string) => codesOf(drug)?.generic?.name.replace(/^【般】/, "") ?? codesOf(drug)?.ingredient ?? "";

/** 特定健診情報 (fictional): the last two years for people 40 and over; 後期高齢者健診 from 75. */
function checkupsOf(seed: number, age: number, sex: "男" | "女", today: CalendarDate, heightCm?: number, weightKg?: number): CheckupRow[] {
  if (age < 40) return [];
  const h = heightCm ?? (sex === "男" ? 166 : 153) + (seed % 9) - 4;
  const w0 = weightKg ?? Math.round(h * h * 0.0023 * 10) / 10;
  return [1, 2].map((n) => {
    const v = (base: number, spread: number, salt: number) => base + (((seed >>> salt) % (spread * 2 + 1)) - spread);
    const w = Math.round((w0 + (n === 2 ? 1.2 : 0)) * 10) / 10;
    const bmi = Math.round((w / (h / 100) ** 2) * 10) / 10;
    const waist = Math.round(bmi * 3.4 + (sex === "男" ? 4 : 0));
    const sbp = v(134, 10, 3);
    const tg = v(140, 50, 5);
    const ldl = v(132, 25, 7);
    const glu = v(102, 8, 9);
    const a1c = Math.round(v(58, 4, 11)) / 10;
    const metab = waist >= (sex === "男" ? 85 : 90) ? (sbp >= 130 || tg >= 150 || glu >= 110 ? "予備群該当" : "非該当") : "非該当";
    const date = isoDate(addDays(today, -(n === 1 ? 160 + (seed % 60) : 525 + (seed % 60))));
    return {
      date,
      kind: age >= 75 ? "後期高齢者健診" : "特定健診",
      values: {
        身長: String(h),
        体重: String(w),
        腹囲: String(waist),
        BMI: String(bmi),
        収縮期血圧: String(sbp),
        拡張期血圧: String(v(80, 8, 4)),
        中性脂肪: String(tg),
        HDLコレステロール: String(v(56, 10, 6)),
        LDLコレステロール: String(ldl),
        "GOT（AST）": String(v(23, 6, 8)),
        "GPT（ALT）": String(v(21, 8, 10)),
        "γ-GT（γ-GTP）": String(v(30, 15, 12)),
        空腹時血糖: String(glu),
        HbA1c: a1c.toFixed(1),
        尿糖: "－",
        尿蛋白: (seed >>> 13) % 4 === 0 ? "±" : "－",
        メタボリックシンドローム判定: metab,
        保健指導レベル: age >= 75 ? "判定不能" : metab === "予備群該当" ? "動機付け支援" : "情報提供",
      },
    };
  });
}

/**
 * The fictional answer of オンライン資格確認 for a person (deterministic). With the 資格確認書, the numbers
 * typed must match the record, or the answer is 該当資格なし (as for a typing error).
 */
export function fictionalQualification(req: { person: OnshiPerson; consent: OnshiConsent; how: OnshiResult["how"]; card?: CardQuery; body?: { heightCm?: number; weightKg?: number } }, today: CalendarDate, checkedAt: string): OnshiResult {
  const { person, consent, how } = req;
  const rec = recordOf(person, today);
  const queryNo = queryNoOf(person);
  if (how === "資格確認書") {
    const c = req.card;
    const same = (a = "", b = "") => a.normalize("NFKC").trim() === b.normalize("NFKC").trim();
    if (!c || !same(c.insurerNumber, rec.insurerNumber) || !same(c.symbol, rec.symbol) || !same(c.number, rec.number) || !same(c.birthDate, rec.birthDate) || (c.branch.trim() !== "" && !same(c.branch, rec.branch))) {
      return { status: "該当資格なし", reason: "入力した保険者番号・記号・番号・枝番・生年月日に合う資格がありません（入力の誤り、新しい保険者の登録が間に合っていないことなど）。", checkedAt, how, queryNo, notGiven: [] };
    }
  }
  const { kind: _kind, incomeClass: _cls, rate: _rate, ...info } = rec;
  void _kind;
  void _cls;
  void _rate;
  const notGiven: string[] = [];
  const limitOk = how === "マイナ保険証" || consent.limit;
  if (!limitOk && info.limit) notGiven.push("限度額適用認定証関連情報（資格確認書での照会で、限度額の情報提供に同意がない）");
  const out: QualificationInfo = limitOk ? info : { ...info, limit: undefined };
  const drugsOk = how === "マイナ保険証" && consent.drugs;
  const checkupsOk = how === "マイナ保険証" && consent.checkups;
  if (!drugsOk) notGiven.push(how === "マイナ保険証" ? "薬剤情報（同意がない）" : "薬剤情報（マイナ保険証での本人確認と同意が要る）");
  if (!checkupsOk) notGiven.push(how === "マイナ保険証" ? "特定健診情報（同意がない）" : "特定健診情報（マイナ保険証での本人確認と同意が要る）");
  const iso = (d: number) => isoDate(addDays(today, d));
  const drugs = drugsOk
    ? (person.id ? otherRxOf(person.id) : [])
        // A レセプト reaches the service 10〜40 days after the visit; an 電子処方箋 the day it is dispensed.
        .filter((x) => x.via === "電子処方箋" || x.issuedOn <= -40)
        .map((x): DrugInfoRow => {
          const c = codesOf(x.drug);
          return {
            date: iso(x.issuedOn),
            institution: OTHER_INSTITUTIONS[x.prescriber].name,
            pharmacy: OTHER_INSTITUTIONS[x.pharmacy].name,
            drug: c?.name ?? x.drug,
            ingredient: ingredientName(x.drug),
            rxKind: "院外",
            use: x.timings.length ? "内服" : "頓服",
            usage: x.timings.length ? `1日${x.timings.length}回 ${timingName(x.timings)}` : "頓用",
            perDose: `${x.perDose}${c?.unit ?? ""}`,
            quantity: `${x.perDose * Math.max(1, x.timings.length)}${c?.unit ?? ""} ${x.days}日分`,
            via: x.via === "電子処方箋" ? "電子処方箋（調剤情報）" : "レセプト",
          };
        })
        .sort((a, b) => b.date.localeCompare(a.date))
    : undefined;
  const checkups = checkupsOk ? checkupsOf(seedOf(queryNo), ageOn(rec.birthDate, today), person.sex, today, req.body?.heightCm, req.body?.weightKg) : undefined;
  return { status: "有効", checkedAt, how, queryNo, info: out, ...(drugs ? { drugs } : {}), ...(checkups ? { checkups } : {}), notGiven };
}

// ---------------------------------------------------------------------------
// Into 保険の登録
// ---------------------------------------------------------------------------

export interface CopiedForm {
  form: InsuranceForm;
  /** Fields code worked out (not in the answer), shown as 「コードで入れた」. */
  derived: { field: keyof InsuranceForm; why: string }[];
}

/** The registration form filled from the answer. 医事課 checks it in 保険の登録 and registers. */
export function formFromQualification(info: QualificationInfo, today: CalendarDate, current: InsuranceForm = EMPTY_FORM): CopiedForm {
  const derived: CopiedForm["derived"] = [];
  const kind = kindOfNumber(info.insurerNumber);
  const band = ageBand(info.birthDate, today);
  const kouki = kind === "後期高齢者";
  const limitCls = info.limit ? LIMIT_CLASS_CODES.find((x) => x.code === info.limit!.classCode)?.cls ?? null : null;
  const cardRate = info.card.rate ?? info.elder?.rate;
  let incomeClass: IncomeClass | "" = limitCls ?? "";
  if (kouki && (limitCls === "一般" || (!limitCls && cardRate !== 30))) {
    incomeClass = cardRate === 20 ? "一般Ⅱ" : "一般Ⅰ";
    derived.push({ field: "incomeClass", why: `後期高齢者の一般Ⅱ・一般Ⅰは、被保険者証の負担割合（${(cardRate ?? 10) / 10}割）で分けた` });
  } else if (!limitCls && kouki && cardRate === 30) {
    incomeClass = "現役並みⅢ";
    derived.push({ field: "incomeClass", why: "後期高齢者で3割・限度額の証がない：現役並みⅢ（認定証が要らない区分）として入れた。確かめてください" });
  } else if (!limitCls && info.elder) {
    incomeClass = info.elder.rate === 30 ? "現役並みⅢ" : "一般";
    derived.push({ field: "incomeClass", why: `高齢受給者証の負担割合（${info.elder.rate / 10}割）で、限度額の証が要らない区分として入れた。確かめてください` });
  }
  let rate = cardRate ? (String(cardRate) as InsuranceForm["rate"]) : "";
  if (!rate && kind && incomeClass) {
    const want = expectedRate(band, kind, incomeClass);
    if (want) {
      rate = String(want) as InsuranceForm["rate"];
      derived.push({ field: "rate", why: `資格情報に割合がないので、年齢（${band}）と区分から法の割合をコードで入れた` });
    }
  }
  return {
    form: {
      ...current,
      kind: kind ?? "",
      insurerNumber: info.insurerNumber,
      symbol: info.symbol,
      number: info.number,
      branch: info.branch,
      relation: info.relation ?? "本人",
      birthDate: info.birthDate,
      rate,
      incomeClass: incomeClass || current.incomeClass,
      elderCard: !!info.elder || current.elderCard,
      proof: info.limit || info.elder || kouki ? "マイナ保険証（オンライン資格確認）" : current.proof || "なし",
      coverage: "医保",
      verify: "オンライン資格確認（模擬）",
      verifiedOn: isoDate(today),
    },
    derived,
  };
}
