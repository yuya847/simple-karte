// Shapes shared by the billing engine (server) and the billing screens (client).

import type { DietOrder } from "../diet";
import type { Diagnosis } from "../diagnoses";
import type { CultureResult, DailyRecord, DayOffset, HistoryEntry, Sex } from "../types";

/** 診療識別 (記録条件仕様 別表20). */
export type Shikibetsu = "11" | "12" | "13" | "21" | "22" | "24" | "27" | "31" | "32" | "33" | "40" | "60" | "70" | "80" | "90" | "92" | "97";

export const SHIKIBETSU_NAME: Record<Shikibetsu, string> = {
  "11": "初診",
  "12": "再診",
  "13": "医学管理",
  "21": "投薬 内服",
  "22": "投薬 屯服",
  "24": "投薬 調剤",
  "27": "投薬 調基",
  "31": "注射 皮下筋肉内",
  "32": "注射 静脈内",
  "33": "注射 その他（点滴）",
  "40": "処置",
  "60": "検査",
  "70": "画像診断",
  "80": "その他",
  "90": "入院基本料",
  "92": "特定入院料・その他",
  "97": "食事療養・標準負担額",
};

export interface ClaimLine {
  record: "SI" | "IY" | "TO" | "CO";
  code: string;
  name: string;
  /** IY: amount in the master unit; SI: 数量データ (e.g. meals per day). */
  quantity?: number;
  unit?: string;
  /** IY: yen for this line's quantity (薬価 × 数量). */
  yen?: number;
  /** TO: 単位コード to write (only when the master has none), 単価 (円) to write, 商品名及び規格又はサイズ. */
  unitCode?: string;
  unitPrice?: number;
  product?: string;
  /** コメント written with this record (記載要領 別表Ⅰ), up to 3. */
  comments?: { code: string; text?: string; label: string }[];
}

/** One 点数・回数算定単位: its lines, and the points (or yen for 97) on the last line. */
export interface ClaimPart {
  lines: ClaimLine[];
  points: number;
  /** true when `points` is yen (食事療養). */
  yen?: boolean;
}

/** One 一連の行為 (a receipt entry), repeated `count` times over the month. */
export interface ClaimAct {
  shikibetsu: Shikibetsu;
  parts: ClaimPart[];
  count: number;
  /** day of month → times */
  days: Record<number, number>;
  /** Why this is billed, in plain words with the rule it rests on. */
  basis: string;
}

export interface ClaimIssue {
  level: "excluded" | "choose" | "review" | "info";
  text: string;
  codes?: string[];
}

/** 加算 that depend on the patient's condition: a person confirms them. The engine never assumes them. */
export interface BillingOptions {
  /** 救急医療管理加算 (A205): 1 or 2, entered when the patient met the state on admission. */
  kyukyu: "" | "1" | "2";
  /** 認知症ケア加算 (A247): 認知症高齢者の日常生活自立度ランクⅢ以上. */
  ninchisho: boolean;
  /** せん妄ハイリスク患者ケア加算 (A247-2): risk screening done. */
  senmou: boolean;
  /** 入退院支援加算 (A246) at discharge. */
  nyutaiin: boolean;
  /** 協力対象施設入所者入院加算 (A253): 1 往診あり / 2 それ以外. */
  kyoryoku: "" | "1" | "2";
  /** 特別食加算 (入院時食事療養): the diet is a 特別食 on a 食事箋. */
  specialDiet: boolean;
  /** 薬剤管理指導料 (B008) days, with 1 (特に安全管理が必要な医薬品) or 2, and 注2 麻薬管理指導加算 when given. */
  yakuzaiShido: { day: DayOffset; kind: "1" | "2"; mayaku?: boolean }[];
  /** 入院栄養食事指導料１ (B001 10 イ) days, counted in order (初回・2回目), from 指導の記録 when the patient is eligible. */
  eiyoShido?: { day: DayOffset }[];
}

export const DEFAULT_OPTIONS: BillingOptions = {
  kyukyu: "",
  ninchisho: false,
  senmou: false,
  nyutaiin: false,
  kyoryoku: "",
  specialDiet: false,
  yakuzaiShido: [],
  eiyoShido: [],
};

/** 食事療養標準負担額の区分（限度額適用・標準負担額減額認定などで決まる）. */
export type MealClass = "一般" | "低所得Ⅱ（90日以下）" | "低所得Ⅱ（90日超）" | "低所得Ⅰ" | "指定難病等";

export interface ClaimInput {
  /** Today in Japan, "YYYY-MM-DD", and the time now "HH:MM". Day offsets are relative to today. */
  today: string;
  nowTime: string;
  /** Claim month "YYYY-MM". */
  month: string;
  patient: {
    id: string;
    name: string;
    sex: Sex;
    age: number;
    admittedOn: DayOffset;
    dischargedOn?: DayOffset;
  };
  entries: HistoryEntry[];
  /** Injection doses the ward recorded as 未実施 ("orderId|minutes"): not claimed. */
  notGiven?: string[];
  daily: DailyRecord[];
  cultures: CultureResult[];
  diagnoses: Diagnosis[];
  options: BillingOptions;
  /** Default 一般. */
  mealClass?: MealClass;
  /** Diet orders (when given, meals are counted from them). */
  diets?: DietOrder[];
  /** 診療情報提供書 issued (day offsets). */
  letters?: { day: DayOffset; to: string; dischargeDay?: DayOffset; attach?: boolean }[];
}

export interface ClaimResult {
  month: string;
  /** First and last billed day (day of month), and how many days. */
  from: number | null;
  to: number | null;
  days: number;
  acts: ClaimAct[];
  totalPoints: number;
  meals: { ryoyoYen: number; futanYen: number };
  issues: ClaimIssue[];
  /** Versions of the official data used. */
  sources: string[];
}
