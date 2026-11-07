// ICU・HCU（集中治療室・高度治療室）の記録の型。架空の病院・架空のデータだけ。
// 時刻は day（今日 = 0 からの日の差）と "HH:MM"。計算は src/lib/icu/ の関数で行い、ここは形だけ。
import type { DayOffset } from "../types";

export type UnitKind = "ICU" | "HCU";
/** 病棟名（patient.ward に入る文字列）。ベッドは ICU1〜ICU8・HCU1〜HCU8 の個室として ward.ts が作る。 */
export const UNIT_NAMES: Record<UnitKind, string> = { ICU: "ICU", HCU: "HCU" };
export const UNIT_BEDS = 8;
export const unitOf = (ward: string): UnitKind | null => (ward === "ICU" ? "ICU" : ward === "HCU" ? "HCU" : null);

export interface At { day: DayOffset; time: string }

/** 人工呼吸器・NPPV・HFNC の設定（変えるたびに 1 件）。 */
export interface VentSetting {
  id: string; patientId: string; at: At; by: string;
  mode: "A/C-VC" | "A/C-PC" | "SIMV" | "PSV" | "CPAP" | "NPPV" | "HFNC" | "なし";
  airway: "経口挿管" | "気管切開" | "マスク" | "鼻カニュラ" | "なし";
  /** 0.21〜1.0 */
  fio2: number;
  peep?: number; ps?: number; vt?: number; pc?: number; rr?: number;
  /** HFNC の流量 L/分 */
  flow?: number;
  /** 気管チューブの深さ cm（口角） */
  tubeCm?: number;
  /** 実測（看護師・臨床工学技士が入れる） */
  measured?: { ppeak?: number; pplat?: number; vte?: number; rrTotal?: number; etco2?: number; mv?: number };
}

/** 持続投与（シリンジポンプ・輸液ポンプ）。速さの変更は changes に積む。 */
export interface Infusion {
  id: string; patientId: string;
  orderId?: string;
  drugCode: string; name: string;
  /** 溶液：薬剤量と総量（例 ノルアドレナリン 5mg / 50mL）。濃度 = amountMg ÷ volumeMl（mg/mL）。インスリンは「単位」を mg の欄に入れ doseUnit を 単位/h にする。 */
  amountMg: number; volumeMl: number;
  /** 医師の指示の単位。γ = μg/kg/分。 */
  doseUnit: "γ" | "mg/h" | "μg/h" | "mL/h" | "単位/h" | "mg/kg/h";
  /** 計算に使う体重 kg（指示のときに医師が決める）。 */
  weightKg: number;
  start: At; end?: At; by: string;
  /** 速さ（mL/h）の履歴。γ などは gamma.ts がここから計算する。 */
  changes: { at: At; rateMlPerH: number; by: string; reason?: string }[];
  note?: string;
}

/** CRRT（持続的腎代替療法）の条件。 */
export interface CrrtSetting {
  id: string; patientId: string; at: At; by: string;
  mode: "CHDF" | "CHD" | "CHF";
  /** 血流量 mL/分 */ qb: number;
  /** 透析液・置換液 mL/h */ qd: number; qf: number;
  /** 除水 mL/h */ removalMlPerH: number;
  anticoag: { drug: "ナファモスタット" | "ヘパリン" | "なし"; ratePerH: number; unit: "mg/h" | "単位/h" };
  access: string;
  end?: At;
}

/** ライン・チューブ・ドレーン。日数は lines.ts が数える。 */
export interface LineDevice {
  id: string; patientId: string;
  kind: "CVC" | "動脈ライン" | "PICC" | "末梢静脈" | "透析用カテーテル" | "肺動脈カテーテル" | "気管チューブ" | "気管切開チューブ" | "尿道カテーテル" | "胃管" | "胸腔ドレーン" | "腹腔ドレーン" | "脳室ドレーン" | "IABP" | "ECMO" | "その他";
  site: string;
  insertedAt: At; removedAt?: At; by: string;
  /** 太さ・長さ・固定の cm など */ spec?: string;
}

/** 1 時間ごとの看護記録（体温・脈拍・血圧・呼吸数・SpO2 は patient.vitals に入れる。GCS は時間表からも記録する）。 */
export interface HourlyRecord {
  id: string; patientId: string; at: At; by: string;
  /** mmHg（動脈ラインの実測。なければ balance 側で収縮期・拡張期から計算） */ map?: number; cvp?: number;
  arterialLine?: boolean;
  /** RASS −5〜+4 */ rass?: number;
  /** CPOT 0〜8 */ cpot?: number;
  camIcu?: "陰性" | "陽性" | "評価不能";
  pupils?: { right: number; left: number; reactRight: "+" | "-" | "遅"; reactLeft: "+" | "-" | "遅" };
  /** その 1 時間の量 mL */
  urineMl?: number; drainMl?: number; gastricMl?: number; stoolMl?: number; bloodLossMl?: number;
  /** 持続投与以外の IN mL（ボーラス・輸血・経腸栄養以外） */ otherInMl?: number;
  /** 経腸栄養 mL */ enteralMl?: number;
  glucose?: number;
  gcs?: { e?: number; v?: number | "T"; m?: number };
  note?: string;
}

/** 回診のチェックリスト（その日に確認したか。何をするかは医師が記事に書く）。 */
export interface RoundCheck {
  id: string; patientId: string; day: DayOffset; time: string; by: string;
  items: Record<string, "確認" | "該当なし" | null>;
}

/** 転入・転出（救急外来→ICU→HCU→病棟）。移動オーダ（PROC-MOVE）と共通の実施に合わせ、集中治療の視点で残す。 */
export interface UnitStay {
  id: string; patientId: string; unit: UnitKind;
  in: At; out?: At;
  from: string; to?: string;
  reason: string;
}

/** SOFA の材料のうち、人が入れ直した値（コードは置かない。医師が見て決めた入力）。 */
export interface SofaInput {
  id: string; patientId: string; day: DayOffset; by: string; at: At;
  item: "cns" | "respiratory";
  /** 中枢神経：医師が評価した GCS（挿管中の V、鎮静前の値など）。 */
  gcs?: { e: number; v: number; m: number };
  /** 呼吸：採血時の FiO2（室内気 0.21 を含む。医師が入れる）。 */
  fio2?: number;
  reason: string;
}

export interface IcuRecords {
  sofaInputs?: SofaInput[];
  stays: UnitStay[];
  vents: VentSetting[];
  infusions: Infusion[];
  crrt: CrrtSetting[];
  lines: LineDevice[];
  hourly: HourlyRecord[];
  rounds: RoundCheck[];
}
export const emptyIcuRecords = (): IcuRecords => ({ sofaInputs: [], stays: [], vents: [], infusions: [], crrt: [], lines: [], hourly: [], rounds: [] });
