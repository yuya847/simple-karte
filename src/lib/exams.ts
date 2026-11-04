// Imaging (画像検査) and physiological tests (生理検査) of the FICTIONAL hospital: what can be
// ordered, the questions an order must answer, and the checks — all in code. Claude only fills
// in what the doctor said; it never picks a study, a region, a view, a position or a contrast.

import { consentIssue, type CheckContext, type Draft, type Issue } from "./drafts";
import { consentFor, findConsent } from "./consent";
import { minutesOf } from "./dates";
import { findOralDrug } from "./master";
import type { DayOffset, OrderEntry, Patient, Sex } from "./types";

export type Modality = "X線" | "ポータブルX線" | "CT" | "MRI";
export const MODALITIES: Modality[] = ["X線", "ポータブルX線", "CT", "MRI"];
export type Contrast = "単純" | "造影" | "単純＋造影" | "放射線科一任";
export const CONTRASTS: Contrast[] = ["単純", "造影", "単純＋造影", "放射線科一任"];
export type Reading = "緊急読影" | "当日中" | "後日" | "読影不要";
export const READINGS: Reading[] = ["緊急読影", "当日中", "後日", "読影不要"];
export type Transport = "独歩" | "車椅子" | "ストレッチャー" | "病室（ポータブル）";
export type ExamPriority = "予約" | "至急";

// ---------------------------------------------------------------------------
// 体位・左右・方向（呼び方は一般撮影で広く使われる呼称。どの部位に何を用意するかは架空の病院の取り決め）
// ---------------------------------------------------------------------------

export type Position = "立位" | "座位" | "仰臥位" | "側臥位" | "伏臥位";
export const XRAY_POSITIONS: Position[] = ["立位", "座位", "仰臥位", "側臥位"];
export const PORTABLE_POSITIONS: Position[] = ["仰臥位", "座位", "側臥位"];
export const CTMR_POSITIONS: Position[] = ["仰臥位", "伏臥位", "側臥位"];
export const positionsFor = (m: Modality | null): Position[] => (m === "ポータブルX線" ? PORTABLE_POSITIONS : m === "CT" || m === "MRI" ? CTMR_POSITIONS : XRAY_POSITIONS);

export type Side = "右" | "左" | "両側";
export const SIDES: Side[] = ["右", "左", "両側"];

export type RegionGroup = "頭頸部" | "体幹" | "脊椎" | "上肢" | "下肢";
export const REGION_GROUPS: RegionGroup[] = ["頭頸部", "体幹", "脊椎", "上肢", "下肢"];

export const EXAM_SOURCES = {
  naming: "部位・方向（正面・側面・斜位・軸位・開口位 など）・体位（立位・座位・仰臥位・側臥位）の呼び方は、一般撮影で広く使われる呼称（日本放射線技術学会 監修の撮影技術の教科書など）に合わせています。どの部位にどの方向・体位を用意するか、標準の方向と枚数は、この架空の病院の取り決めです。",
  gadolinium: { label: "腎障害患者におけるガドリニウム造影剤使用に関するガイドライン（第3版：2024年5月20日改訂）NSF とガドリニウム造影剤使用に関する合同委員会（日本医学放射線学会・日本腎臓学会）", url: "https://radiology.jp/content/files/gbcansf-gdl_202405.pdf" },
  iodine: { label: "腎障害患者におけるヨード造影剤使用に関するガイドライン2018（日本腎臓学会・日本医学放射線学会・日本循環器学会）", url: "https://cdn.jsn.or.jp/data/guideline-201911.pdf" },
  biguanide: { label: "ヨード造影剤とビグアナイド系糖尿病薬との併用注意について（第2報）合同造影剤安全性委員会 2012年4月", url: "https://www.radiology.jp/content/files/994.pdf" },
};

/** 造影の前の確認の閾値（架空の病院の取り決め。指針は eGFR 30 未満を特に注意としている）. */
export const CONTRAST_RULES = { egfrAsk: 45, egfrGuideline: 30, creStaleDays: 90 };

export interface RegionMaster {
  code: string;
  name: string;
  group: RegionGroup;
  modalities: Modality[];
  /** 左右の指定が要る部位. */
  sided?: boolean;
  /** X線 の方向の候補（この部位で選べるもの）. */
  views?: string[];
  /** 標準の方向（部位を選ぶと既定でチェックが入る）. */
  defaultViews?: string[];
  /** X線 の標準の体位. */
  position?: Position;
  /** E001 写真診断: イ = 頭部・胸部・腹部・脊椎, ロ = その他. */
  xray?: "イ" | "ロ";
  aliases: string[];
}

const XR: Modality[] = ["X線"];
const XCM: Modality[] = ["X線", "CT", "MRI"];

export const REGIONS: RegionMaster[] = [
  // 頭頸部
  { code: "R-HEAD", name: "頭部", group: "頭頸部", modalities: XCM, views: ["正面", "側面", "タウン法"], defaultViews: ["正面", "側面"], position: "座位", xray: "イ", aliases: ["頭", "頭部", "脳", "頭蓋"] },
  { code: "R-SINUS", name: "副鼻腔", group: "頭頸部", modalities: ["X線", "CT"], views: ["ウォーターズ法", "コールドウェル法", "側面"], defaultViews: ["ウォーターズ法"], position: "座位", xray: "イ", aliases: ["副鼻腔", "鼻"] },
  { code: "R-JAW", name: "顎（顎関節・下顎）", group: "頭頸部", modalities: ["X線", "CT"], views: ["正面", "側面", "開口位", "閉口位"], defaultViews: ["正面", "側面"], position: "座位", xray: "イ", aliases: ["顎", "顎関節", "下顎"] },
  { code: "R-NECK", name: "頸部（軟部）", group: "頭頸部", modalities: XCM, views: ["正面", "側面"], defaultViews: ["側面"], position: "座位", xray: "ロ", aliases: ["頸部", "頸部軟部", "喉頭"] },
  // 体幹
  { code: "R-CHEST", name: "胸部", group: "体幹", modalities: ["X線", "ポータブルX線", "CT"], views: ["正面", "側面", "斜位"], defaultViews: ["正面"], position: "立位", xray: "イ", aliases: ["胸", "胸部", "肺", "チェスト"] },
  { code: "R-RIB", name: "肋骨", group: "体幹", modalities: XR, sided: true, views: ["正面", "斜位"], defaultViews: ["正面", "斜位"], position: "立位", xray: "イ", aliases: ["肋骨", "ろっ骨"] },
  { code: "R-ABD", name: "腹部", group: "体幹", modalities: ["X線", "ポータブルX線", "CT"], views: ["臥位正面", "立位正面", "側面"], defaultViews: ["臥位正面"], position: "仰臥位", xray: "イ", aliases: ["腹", "腹部", "おなか"] },
  { code: "R-PELVIS", name: "骨盤", group: "体幹", modalities: XCM, views: ["正面", "インレット", "アウトレット"], defaultViews: ["正面"], position: "仰臥位", xray: "ロ", aliases: ["骨盤"] },
  { code: "R-CHEST-ABD", name: "胸腹部", group: "体幹", modalities: ["CT"], aliases: ["胸腹部", "胸から腹"] },
  { code: "R-ABD-PELVIS", name: "腹部・骨盤", group: "体幹", modalities: ["CT", "MRI"], aliases: ["腹部骨盤", "腹骨盤", "腹部・骨盤"] },
  { code: "R-CHEST-PELVIS", name: "胸部〜骨盤", group: "体幹", modalities: ["CT"], aliases: ["胸部〜骨盤", "胸部から骨盤", "体幹"] },
  // 脊椎
  { code: "R-CSPINE", name: "頸椎", group: "脊椎", modalities: XCM, views: ["正面", "側面", "斜位", "開口位", "前屈位", "後屈位"], defaultViews: ["正面", "側面"], position: "座位", xray: "イ", aliases: ["頸椎", "首"] },
  { code: "R-TSPINE", name: "胸椎", group: "脊椎", modalities: XCM, views: ["正面", "側面"], defaultViews: ["正面", "側面"], position: "立位", xray: "イ", aliases: ["胸椎", "背中"] },
  { code: "R-LSPINE", name: "腰椎", group: "脊椎", modalities: XCM, views: ["正面", "側面", "斜位", "前屈位", "後屈位"], defaultViews: ["正面", "側面"], position: "立位", xray: "イ", aliases: ["腰椎", "腰"] },
  { code: "R-SACRUM", name: "仙骨・尾骨", group: "脊椎", modalities: ["X線", "CT"], views: ["正面", "側面"], defaultViews: ["正面", "側面"], position: "仰臥位", xray: "イ", aliases: ["仙骨", "尾骨", "仙尾骨"] },
  // 上肢（左右が要る）
  { code: "R-SHOULDER", name: "肩関節", group: "上肢", modalities: XCM, sided: true, views: ["正面", "スカプラY", "軸位"], defaultViews: ["正面"], position: "座位", xray: "ロ", aliases: ["肩", "肩関節"] },
  { code: "R-CLAVICLE", name: "鎖骨", group: "上肢", modalities: XR, sided: true, views: ["正面", "斜位（尾頭方向）"], defaultViews: ["正面"], position: "座位", xray: "ロ", aliases: ["鎖骨"] },
  { code: "R-HUMERUS", name: "上腕骨", group: "上肢", modalities: XR, sided: true, views: ["正面", "側面"], defaultViews: ["正面", "側面"], position: "座位", xray: "ロ", aliases: ["上腕", "上腕骨"] },
  { code: "R-ELBOW", name: "肘関節", group: "上肢", modalities: XCM, sided: true, views: ["正面", "側面", "斜位"], defaultViews: ["正面", "側面"], position: "座位", xray: "ロ", aliases: ["肘", "肘関節"] },
  { code: "R-FOREARM", name: "前腕", group: "上肢", modalities: XR, sided: true, views: ["正面", "側面"], defaultViews: ["正面", "側面"], position: "座位", xray: "ロ", aliases: ["前腕"] },
  { code: "R-WRIST", name: "手関節", group: "上肢", modalities: XCM, sided: true, views: ["正面", "側面", "斜位"], defaultViews: ["正面", "側面"], position: "座位", xray: "ロ", aliases: ["手関節", "手首", "手くび"] },
  { code: "R-HAND", name: "手", group: "上肢", modalities: XR, sided: true, views: ["正面", "斜位", "側面"], defaultViews: ["正面", "斜位"], position: "座位", xray: "ロ", aliases: ["手", "手部"] },
  { code: "R-FINGER", name: "手指", group: "上肢", modalities: XR, sided: true, views: ["正面", "側面", "斜位"], defaultViews: ["正面", "側面"], position: "座位", xray: "ロ", aliases: ["手指", "指", "母指", "示指", "中指", "環指", "小指"] },
  // 下肢（左右が要る）
  { code: "R-HIP", name: "股関節", group: "下肢", modalities: XCM, sided: true, views: ["正面", "側面（ラウエンシュタイン法）", "軸位"], defaultViews: ["正面"], position: "仰臥位", xray: "ロ", aliases: ["股関節", "股"] },
  { code: "R-FEMUR", name: "大腿骨", group: "下肢", modalities: XR, sided: true, views: ["正面", "側面"], defaultViews: ["正面", "側面"], position: "仰臥位", xray: "ロ", aliases: ["大腿", "大腿骨", "太もも"] },
  { code: "R-KNEE", name: "膝関節", group: "下肢", modalities: XCM, sided: true, views: ["正面", "側面", "膝蓋骨軸位（スカイライン）", "ローゼンバーグ法"], defaultViews: ["正面", "側面"], position: "仰臥位", xray: "ロ", aliases: ["膝", "膝関節"] },
  { code: "R-LEG", name: "下腿", group: "下肢", modalities: ["X線", "MRI"], sided: true, views: ["正面", "側面"], defaultViews: ["正面", "側面"], position: "仰臥位", xray: "ロ", aliases: ["下腿", "すね"] },
  { code: "R-ANKLE", name: "足関節", group: "下肢", modalities: XCM, sided: true, views: ["正面", "側面", "モーティス（内旋）"], defaultViews: ["正面", "側面"], position: "仰臥位", xray: "ロ", aliases: ["足関節", "足首"] },
  { code: "R-FOOT", name: "足", group: "下肢", modalities: XCM, sided: true, views: ["正面", "斜位", "側面"], defaultViews: ["正面", "斜位"], position: "仰臥位", xray: "ロ", aliases: ["足", "足部"] },
  { code: "R-TOE", name: "足趾", group: "下肢", modalities: XR, sided: true, views: ["正面", "斜位"], defaultViews: ["正面", "斜位"], position: "仰臥位", xray: "ロ", aliases: ["足趾", "趾"] },
];

export function findRegion(code: string) {
  return REGIONS.find((r) => r.code === code);
}

export const regionsFor = (m: Modality) => REGIONS.filter((r) => r.modalities.includes(m));

/** The regions of a modality whose name or alias contains the words typed (「手関節」「ひざ」など。空なら全部）. */
export function searchRegions(m: Modality, text: string): RegionMaster[] {
  const s = text.normalize("NFKC").replace(/\s/g, "");
  return regionsFor(m).filter((r) => !s || [r.name, ...r.aliases].some((a) => a.includes(s) || s.includes(a)));
}

/** 「右手関節」「両側膝関節」: the region's name with the side in front. */
export function regionLabel(code: string, side?: Side | null): string {
  const name = findRegion(code)?.name ?? code;
  return `${side ?? ""}${name}`;
}

/** 「正面・側面（2方向）」. */
export function viewsText(views: string[] | null | undefined): string {
  if (!views?.length) return "";
  return `${views.join("・")}（${views.length}方向）`;
}

/** The sets of views offered when a draft has none (the standard set first, then each single view). */
export function viewSets(r: RegionMaster): string[][] {
  const sets: string[][] = [];
  if (r.defaultViews?.length) sets.push(r.defaultViews);
  for (const v of r.views ?? []) if (!sets.some((s) => s.length === 1 && s[0] === v)) sets.push([v]);
  return sets.slice(0, 5);
}

/** The position an order gets when none was chosen (portable in bed; CT・MRI on the back; otherwise the region's standard). */
export function defaultPosition(modality: Modality | null, region: RegionMaster | undefined): Position {
  if (modality === "ポータブルX線") return "仰臥位";
  if (modality === "CT" || modality === "MRI") return "仰臥位";
  return region?.position ?? "立位";
}

// ---------------------------------------------------------------------------
// CT・MRI の撮影の方法と造影剤（架空の病院の取り決め。何を選ぶかは医師）
// ---------------------------------------------------------------------------

export type CtMode = "通常" | "ダイナミック" | "CTA（血管）" | "CTコロノグラフィ";
export const CT_MODES: CtMode[] = ["通常", "ダイナミック", "CTA（血管）", "CTコロノグラフィ"];
export type CtPhase = "動脈相" | "門脈相" | "平衡相";
export const CT_PHASES: CtPhase[] = ["動脈相", "門脈相", "平衡相"];
export const CT_RECONS = ["骨条件", "肺野条件", "3D（再構成）"];
export const CT_SLICES_MM = [1, 2, 3, 5];

export interface CtMethod {
  mode: CtMode;
  /** ダイナミックの相（動脈相・門脈相・平衡相）. */
  phases: CtPhase[];
  sliceMm: number | null;
  recon: string[];
  /** 撮影の範囲（例：横隔膜上〜恥骨結合）. */
  range: string | null;
}

export const MRI_SEQUENCES = ["T1", "T2", "FLAIR", "拡散強調（DWI）", "MRA", "脂肪抑制", "造影T1"] as const;
export type MriSequence = (typeof MRI_SEQUENCES)[number];
export interface MriMethod {
  sequences: MriSequence[];
}

export interface ContrastAgent {
  code: string;
  /** 一般名と濃度（ヨードは mgI/mL）. */
  name: string;
  kind: "ヨード" | "ガドリニウム";
  mlOptions: number[];
}

/** 造影剤の例（一般名。架空の病院の採用例。製品と本数は放射線部が記録する）. */
export const CONTRAST_AGENTS: ContrastAgent[] = [
  { code: "CA-IOPAMIDOL300", name: "イオパミドール 300 mgI/mL", kind: "ヨード", mlOptions: [50, 80, 100] },
  { code: "CA-IOPAMIDOL370", name: "イオパミドール 370 mgI/mL", kind: "ヨード", mlOptions: [80, 100] },
  { code: "CA-IOHEXOL300", name: "イオヘキソール 300 mgI/mL", kind: "ヨード", mlOptions: [50, 100] },
  { code: "CA-GADOBUTROL", name: "ガドブトロール 1.0 mmol/mL", kind: "ガドリニウム", mlOptions: [5, 7.5, 10] },
  { code: "CA-GADOTERIDOL", name: "ガドテリドール 0.5 mmol/mL", kind: "ガドリニウム", mlOptions: [13, 17] },
];
export const agentsFor = (m: Modality | null) => CONTRAST_AGENTS.filter((a) => (m === "MRI" ? a.kind === "ガドリニウム" : a.kind === "ヨード"));
export const findAgent = (code: string) => CONTRAST_AGENTS.find((a) => a.code === code);

/** Whether the order uses a contrast medium (放射線科一任 may). */
export const usesContrast = (o: { modality: Modality | null; contrast?: Contrast | null; ct?: CtMethod | null }) =>
  (o.modality === "CT" || o.modality === "MRI") && ((!!o.contrast && o.contrast !== "単純") || o.ct?.mode === "CTA（血管）");

// ---------------------------------------------------------------------------
// 造影剤使用の説明と同意（取得の記録はオーダに。同意書の様式は consent.ts）
// ---------------------------------------------------------------------------

export type ConsentState = "取得済み" | "未取得" | "同意しない";
export const CONSENT_STATES: ConsentState[] = ["取得済み", "未取得", "同意しない"];
export const CONSENT_FORMS = ["紙の同意書（カルテに保管）", "電子（タブレットで署名）", "同意書なし（口頭）"] as const;
export type ConsentForm = (typeof CONSENT_FORMS)[number];

export interface ContrastConsent {
  state: ConsentState;
  /** 取得した日時（自由記載。例：11/3 15:00）. */
  at: string | null;
  /** 説明した医師. */
  by: string | null;
  form: ConsentForm | null;
  /** 同意しないときの理由. */
  reason: string | null;
}

export const emptyConsent = (state: ConsentState = "未取得"): ContrastConsent => ({ state, at: null, by: null, form: null, reason: null });

/** 「同意済（11/3 15:00 山本・紙の同意書）」「同意：未取得」「同意しない（理由）」. */
export function consentText(c: ContrastConsent | null | undefined): string {
  if (!c) return "";
  if (c.state === "取得済み") return `同意済${c.at || c.by || c.form ? `（${[c.at, c.by, c.form].filter(Boolean).join(" ")}）` : ""}`;
  if (c.state === "同意しない") return `同意しない${c.reason ? `（${c.reason}）` : ""}`;
  return "同意：未取得";
}

export interface PhysioMaster {
  code: string;
  name: string;
  /** 診療行為コード billed when done (60 検査). */
  codes: string[];
  bedside: boolean;
  note?: string;
  aliases: string[];
}

export const PHYSIO: PhysioMaster[] = [
  { code: "PHY-ECG", name: "心電図（12誘導）", codes: ["160068410"], bedside: true, aliases: ["心電図", "ECG", "12誘導", "エクグ"] },
  { code: "PHY-UCG", name: "心エコー（経胸壁）", codes: ["160072510"], bedside: true, aliases: ["心エコー", "UCG", "心臓超音波", "TTE"] },
  { code: "PHY-ABDUS", name: "腹部エコー", codes: ["160072210"], bedside: true, note: "検査の前は絶食（院内の約束・架空）", aliases: ["腹部エコー", "腹エコー", "腹部超音波"] },
  { code: "PHY-CAROTID", name: "頸動脈エコー", codes: ["160165010"], bedside: false, aliases: ["頸動脈エコー", "頸部エコー", "頸動脈超音波"] },
  { code: "PHY-LEVEIN", name: "下肢静脈エコー", codes: ["160213010"], bedside: true, aliases: ["下肢静脈エコー", "下肢エコー", "DVT検索", "下肢血管エコー"] },
  { code: "PHY-THYROID", name: "甲状腺エコー", codes: ["160165010"], bedside: false, aliases: ["甲状腺エコー", "甲状腺超音波"] },
  { code: "PHY-BREAST", name: "乳腺エコー", codes: ["160165010"], bedside: false, aliases: ["乳腺エコー", "乳房エコー", "乳腺超音波"] },
  { code: "PHY-SOFTUS", name: "軟部エコー（皮下・筋・関節）", codes: ["160165010"], bedside: true, aliases: ["軟部エコー", "表在エコー", "皮下エコー", "関節エコー"] },
  { code: "PHY-SPIRO", name: "呼吸機能（肺気量分画・フローボリューム）", codes: ["160062610", "160062710"], bedside: false, aliases: ["呼吸機能", "スパイロ", "肺機能", "PFT"] },
  { code: "PHY-ABI", name: "ABI（血管伸展性検査）", codes: ["160071750"], bedside: false, aliases: ["ABI", "PWV", "血管伸展性"] },
  { code: "PHY-HOLTER", name: "ホルター心電図（24時間）", codes: ["160069610"], bedside: true, aliases: ["ホルター", "24時間心電図"] },
  { code: "PHY-EEG", name: "脳波", codes: ["160075310"], bedside: false, aliases: ["脳波", "EEG"] },
  // 内視鏡（院内の約束・架空：上部は検査の前の食事を止める、大腸は前日から検査食と下剤）
  { code: "PHY-EGD", name: "上部消化管内視鏡（胃カメラ）", codes: ["160093810"], bedside: false, note: "検査の前は絶食（院内の約束・架空）", aliases: ["胃カメラ", "上部内視鏡", "上部消化管内視鏡", "GF", "EGD", "GIF"] },
  { code: "PHY-CF", name: "大腸内視鏡（全大腸）", codes: ["160094910"], bedside: false, note: "前日から検査食と下剤、当日は絶食（院内の約束・架空）", aliases: ["大腸カメラ", "大腸内視鏡", "下部内視鏡", "CF", "TCS"] },
  { code: "PHY-BF", name: "気管支鏡", codes: ["160092810"], bedside: false, note: "検査の前は絶食（院内の約束・架空）", aliases: ["気管支鏡", "BF", "ブロンコ"] },
];

export function findPhysio(code: string) {
  return PHYSIO.find((p) => p.code === code);
}

/** Booking slots of the fictional hospital (X線 every 30 min, CT/MRI/生理 by the hour). */
export const EXAM_RULES = { open: "09:00", close: "16:30", stat: "今から（至急）" };

// ---------------------------------------------------------------------------
// eGFR（日本人の推算式、日本腎臓学会）: 194 × Cr^-1.094 × 年齢^-0.287（女性 × 0.739）
// ---------------------------------------------------------------------------

export function egfr(cre: number, age: number, sex: Sex): number {
  const v = 194 * Math.pow(cre, -1.094) * Math.pow(age, -0.287) * (sex === "女" ? 0.739 : 1);
  return Math.round(v * 10) / 10;
}

export function latestCre(p: Patient): { value: number; day: DayOffset } | null {
  const rows = [...p.labs].filter((l) => l.values.Cre !== undefined).sort((a, b) => a.day - b.day || minutesOf(a.time) - minutesOf(b.time));
  const last = rows.at(-1);
  return last ? { value: last.values.Cre, day: last.day } : null;
}

// ---------------------------------------------------------------------------
// Drafts
// ---------------------------------------------------------------------------

interface ExamBase {
  id: string;
  origin: "ai" | "manual";
  sourceText: string;
  comment: string | null;
  purpose: string | null;
  when: { day: DayOffset | null; time: string | null; priority: ExamPriority | null };
  acks: string[];
  duplicateOk: boolean;
}

export interface ImagingDraft extends ExamBase {
  kind: "imaging";
  modality: Modality | null;
  region: string | null;
  regionSaid: string;
  /** 左右（要る部位だけ）. */
  side?: Side | null;
  /** 方向（X線）. null = まだ選んでいない（候補から聞く）. */
  views: string[] | null;
  /** 体位. null = 既定（部位の標準、CT・MRI は仰臥位、ポータブルは病室で仰臥位）. */
  position?: Position | null;
  contrast: Contrast | null;
  /** 造影剤（一般名と量）. */
  agent?: { code: string; mL: number | null } | null;
  ct?: CtMethod | null;
  mri?: MriMethod | null;
  /** 条件の備考（荷重位・機能撮影・体幹の固定 など）. */
  note?: string | null;
  transport: Transport | null;
  /** Answers to the safety questions (MRI 体内金属, 妊娠, 閉所恐怖). */
  answers: { metal?: string; pregnancy?: string; claustrophobia?: string };
  /** 読影区分（単純写真）. */
  reading: Reading | null;
  /** Prepare the consent form with the order. */
  consentPlanned?: boolean;
  /** 造影剤使用の説明と同意の取得の記録. */
  consent?: ContrastConsent | null;
}

export interface PhysioDraft extends ExamBase {
  kind: "physio";
  test: string | null;
  said: string;
  place: "検査室" | "ベッドサイド" | null;
  transport: Transport | null;
}

export const EXAM_ACK = { 腎機能: "腎機能承知", 造影剤: "造影剤アレルギー承知", 喘息: "喘息承知", ビグアナイド: "ビグアナイド休薬指示済み", ホルター: "ホルター装着中承知" } as const;

const set = <T extends ImagingDraft | PhysioDraft>(patch: Partial<T>) => (x: Draft) => ({ ...(x as T), ...patch });
const ack = (a: string) => (x: Draft) => ({ ...(x as ImagingDraft), acks: [...new Set([...(x as ImagingDraft).acks, a])] });

function whenChoices<T extends ImagingDraft | PhysioDraft>(): { label: string; apply: (x: Draft) => Draft }[] {
  return [
    { label: EXAM_RULES.stat, apply: set<T>({ when: { day: 0, time: null, priority: "至急" } } as Partial<T>) },
    { label: "今日 14:00 の枠", apply: set<T>({ when: { day: 0, time: "14:00", priority: "予約" } } as Partial<T>) },
    { label: "明日 09:30 の枠", apply: set<T>({ when: { day: 1, time: "09:30", priority: "予約" } } as Partial<T>) },
    { label: "明日 14:00 の枠", apply: set<T>({ when: { day: 1, time: "14:00", priority: "予約" } } as Partial<T>) },
  ];
}

function checkWhen(d: ImagingDraft | PhysioDraft, ctx: CheckContext, issues: Issue[]) {
  if (!d.when.priority) {
    issues.push({ key: "when", level: "ask", title: "日時", message: "いつ行うかが抜けています。", choices: whenChoices() });
  } else if (d.when.priority === "予約" && d.when.time && (d.when.day ?? 0) === 0 && minutesOf(d.when.time) <= minutesOf(ctx.nowTime)) {
    issues.push({ key: "when", level: "ask", title: "日時", message: `今日 ${d.when.time} はもう過ぎています。`, choices: whenChoices() });
  } else {
    issues.push({ key: "when", level: "info", title: "日時", message: d.when.priority === "至急" ? EXAM_RULES.stat : `${ctx.fmtDay(d.when.day ?? 0)} ${d.when.time ?? "（時刻は検査室が決める）"} 予約` });
  }
  if (!d.purpose) issues.push({ key: "purpose", level: "ask", title: "目的", message: "検査の目的（臨床診断・知りたいこと）が抜けています。言い足してください。" });
}

export interface ExamPatientFacts {
  sex: Sex;
  age: number;
  allergies: string[];
  cre: { value: number; day: DayOffset } | null;
  heightCm?: number;
  weightKg?: number;
  /** 妊娠中 marked on the chart (weeks if known). */
  pregnancy?: { weeks: number | null } | null;
}

/** Running oral drugs of a class (e.g. ビグアナイド系), for the contrast check. */
export function runningOfClass(orders: OrderEntry[], cls: string): string[] {
  return orders.flatMap((o) => (o.order.type === "prescription" && findOralDrug(o.order.drugCode)?.classes?.includes(cls) ? [findOralDrug(o.order.drugCode)!.name] : []));
}

/**
 * What the chart says before a contrast medium (read by code, decided by the doctor): the latest Cre and
 * the eGFR from it, the allergy entries that match the medium, asthma, biguanides running, pregnancy.
 */
export function contrastFacts(modality: Modality | null, pt: ExamPatientFacts | null, activeOrders: OrderEntry[], fmtDay: (d: DayOffset) => string) {
  const gd = modality === "MRI";
  const agent = gd ? "ガドリニウム造影剤" : "ヨード造影剤";
  const e = pt?.cre ? egfr(pt.cre.value, pt.age, pt.sex) : null;
  const stale = !!pt?.cre && pt.cre.day < -CONTRAST_RULES.creStaleDays;
  return {
    agent,
    egfr: e,
    egfrText: pt?.cre && e !== null ? `eGFR ${e}（Cre ${pt.cre.value}、${fmtDay(pt.cre.day)}。194 × Cr^−1.094 × 年齢^−0.287${pt.sex === "女" ? " × 0.739" : ""}）` : "Cre の値がありません",
    egfrLow: e !== null && e < CONTRAST_RULES.egfrAsk,
    egfrGuideline: e !== null && e < CONTRAST_RULES.egfrGuideline,
    stale,
    allergy: pt?.allergies.find((a) => a.includes("造影剤") && (gd ? a.includes("ガドリニウム") : !a.includes("ガドリニウム"))) ?? null,
    asthma: pt?.allergies.find((a) => a.includes("喘息")) ?? null,
    biguanides: gd ? [] : runningOfClass(activeOrders, "ビグアナイド系"),
    pregnancy: pt?.pregnancy ?? null,
  };
}

export function checkImaging(d: ImagingDraft, ctx: CheckContext, pt: ExamPatientFacts | null): Issue[] {
  const issues: Issue[] = [];
  if (!d.modality) issues.push({ key: "modality", level: "ask", title: "種類", message: "検査の種類が抜けています。", choices: MODALITIES.map((m) => ({ label: m, apply: set<ImagingDraft>({ modality: m }) })) });
  const region = d.region ? findRegion(d.region) : undefined;
  if (!region) {
    const options = REGIONS.filter((r) => !d.modality || r.modalities.includes(d.modality));
    issues.push({
      key: "region",
      level: d.regionSaid ? "stop" : "ask",
      title: "部位",
      message: d.regionSaid ? `「${d.regionSaid}」は部位のマスターにありません。` : "部位が抜けています。",
      choices: options.map((r) => ({ label: r.name, apply: set<ImagingDraft>({ region: r.code }) })),
    });
  } else if (d.modality && !region.modalities.includes(d.modality)) {
    issues.push({ key: "region", level: "stop", title: "部位", message: `${region.name}の${d.modality}は、この院の検査のマスターにありません（${region.modalities.join("・")}）。` });
  }
  if (region?.sided && !d.side) {
    issues.push({ key: "side", level: "ask", title: "左右", message: `${region.name}は左右の指定が要ります。`, choices: SIDES.map((s) => ({ label: s, apply: set<ImagingDraft>({ side: s }) })) });
  }
  const xray = d.modality === "X線" || d.modality === "ポータブルX線";
  if (xray && region?.views) {
    if (d.modality === "ポータブルX線" && !d.views) {
      issues.push({ key: "views", level: "info", title: "撮影", message: "ポータブルは病室で臥位正面（AP）" });
    } else if (!d.views || d.views.length === 0) {
      issues.push({ key: "views", level: "ask", title: "撮影", message: d.views ? "撮影の方向が選ばれていません（0方向）。" : "撮影の方向が抜けています。", choices: viewSets(region).map((v) => ({ label: v.join("＋"), apply: set<ImagingDraft>({ views: v }) })) });
    }
    const films = (d.views?.length ?? 1) * (d.side === "両側" ? 2 : 1);
    if (films > 1) issues.push({ key: "films", level: "info", title: "算定", message: `同じ部位の2枚目からは写真診断・撮影が100分の50になります（E001・E002 通則）。${d.side === "両側" ? "両側は健側を対照とする同一部位の撮影として枚数に数えます。" : ""}` });
  }
  if (d.modality) {
    const pos = d.position ?? defaultPosition(d.modality, region);
    issues.push({ key: "position", level: "info", title: "体位", message: `${d.modality === "ポータブルX線" ? "病室で " : ""}${pos}${d.position ? "" : "（既定）"}` });
  }
  if (xray && !d.reading) {
    issues.push({ key: "reading", level: "ask", title: "読影", message: "読影区分が抜けています。", choices: READINGS.map((r) => ({ label: r, apply: set<ImagingDraft>({ reading: r }) })) });
  }
  if ((d.modality === "CT" || d.modality === "MRI") && !d.contrast) {
    issues.push({ key: "contrast", level: "ask", title: "造影", message: "単純か造影かが抜けています。", choices: CONTRASTS.map((c) => ({ label: c, apply: set<ImagingDraft>({ contrast: c }) })) });
  }
  // CT の撮影の方法: CTA は造影、ダイナミックは相が要る
  if (d.modality === "CT" && d.ct) {
    if (d.ct.mode === "CTA（血管）" && d.contrast === "単純") {
      issues.push({ key: "ctmode", level: "stop", title: "撮影の方法", message: "CTA（血管）は造影剤を使います。「単純」とは合いません。" });
    } else if (d.ct.mode === "ダイナミック" && d.ct.phases.length === 0) {
      issues.push({
        key: "ctmode",
        level: "ask",
        title: "撮影の方法",
        message: "ダイナミックの相（動脈相・門脈相・平衡相）が選ばれていません。",
        choices: [
          { label: "動脈相＋門脈相", apply: (x) => ({ ...(x as ImagingDraft), ct: { ...(x as ImagingDraft).ct!, phases: ["動脈相", "門脈相"] } }) },
          { label: "動脈相＋門脈相＋平衡相", apply: (x) => ({ ...(x as ImagingDraft), ct: { ...(x as ImagingDraft).ct!, phases: ["動脈相", "門脈相", "平衡相"] } }) },
        ],
      });
    } else if (d.ct.mode === "ダイナミック" && d.contrast === "単純") {
      issues.push({ key: "ctmode", level: "stop", title: "撮影の方法", message: "ダイナミックは造影剤を使います。「単純」とは合いません。" });
    }
  }
  if (d.modality === "MRI" && d.mri?.sequences.includes("造影T1") && d.contrast === "単純") {
    issues.push({ key: "mrimode", level: "stop", title: "撮像", message: "造影T1 はガドリニウム造影剤を使います。「単純」とは合いません。" });
  }
  if (d.modality === "ポータブルX線") {
    if (d.transport !== "病室（ポータブル）") issues.push({ key: "transport", level: "info", title: "移動", message: "病室で撮影（移動なし）" });
  } else if (!d.transport) {
    issues.push({ key: "transport", level: "ask", title: "移動", message: "移動の方法が抜けています。", choices: (["独歩", "車椅子", "ストレッチャー"] as Transport[]).map((t) => ({ label: t, apply: set<ImagingDraft>({ transport: t }) })) });
  }

  // 造影: 腎機能・アレルギー・喘息・ビグアナイド（判断は医師。コードは値と指針の名前を出して承知を求めるだけ）
  // 「放射線科一任」も造影の可能性があるので同じ確認をする。
  const contrastUsed = usesContrast(d);
  if (contrastUsed && pt) {
    const gd = d.modality === "MRI";
    const f = contrastFacts(d.modality, pt, ctx.activeOrders, ctx.fmtDay);
    const guideline = gd
      ? `${EXAM_SOURCES.gadolinium.label}は、長期透析・透析をしていない eGFR 30未満の慢性腎不全・急性腎不全では、できるだけ避けて他の検査で代替するとしています`
      : `${EXAM_SOURCES.iodine.label}は、静脈からの造影で eGFR 30未満に予防策を勧めています`;
    if (pt.cre) {
      if ((f.egfrLow || f.stale) && !d.acks.includes(EXAM_ACK.腎機能)) {
        issues.push({
          key: "egfr",
          level: "ask",
          title: "腎機能",
          message: f.stale
            ? `${f.egfrText}。Cre の測定から${CONTRAST_RULES.creStaleDays}日を超えています。`
            : `${f.egfrText}。eGFR ${CONTRAST_RULES.egfrAsk} 未満は造影の前に医師が確かめます（架空の病院の取り決め）。${f.egfrGuideline ? `${guideline}。` : ""}`,
          choices: [{ label: `確かめた・承知（${EXAM_ACK.腎機能}）`, apply: ack(EXAM_ACK.腎機能) }],
        });
      } else issues.push({ key: "egfr", level: "info", title: "腎機能", message: f.egfrText });
    } else {
      issues.push({ key: "egfr", level: "ask", title: "腎機能", message: "Cre の値がありません。造影の前に腎機能を確かめてください。", choices: [{ label: `承知（${EXAM_ACK.腎機能}）`, apply: ack(EXAM_ACK.腎機能) }] });
    }
    if (f.allergy && !d.acks.includes(EXAM_ACK.造影剤)) {
      issues.push({ key: "allergy", level: "ask", title: "アレルギー", message: `カルテのアレルギー：${f.allergy}（${f.agent}）`, choices: [{ label: `承知して出す（${EXAM_ACK.造影剤}）`, apply: ack(EXAM_ACK.造影剤) }] });
    }
    if (f.asthma && !d.acks.includes(EXAM_ACK.喘息)) {
      issues.push({ key: "asthma", level: "ask", title: "喘息", message: `カルテに喘息の記載：${f.asthma}`, choices: [{ label: `承知して出す（${EXAM_ACK.喘息}）`, apply: ack(EXAM_ACK.喘息) }] });
    }
    if (f.biguanides.length && !d.acks.includes(EXAM_ACK.ビグアナイド)) {
      issues.push({
        key: "biguanide",
        level: "ask",
        title: "内服",
        message: `ビグアナイド系（${f.biguanides.join("、")}）を内服中です。${EXAM_SOURCES.biguanide.label}は、造影の前後の一時休薬を求めています。これは案内であって休薬の指示ではありません。休薬の要否と日数は医師が決めて、処方の変更で指示します。`,
        choices: [{ label: `休薬の指示を出した（${EXAM_ACK.ビグアナイド}）`, apply: ack(EXAM_ACK.ビグアナイド) }],
      });
    }
  }
  // ホルター心電図をつけている日は、X線・CT・MRI と重ならないように（生理検査の案内の例）
  {
    const day = d.when.day ?? 0;
    const holter = ctx.activeOrders.find((o) => o.order.type === "physio" && o.order.test === "PHY-HOLTER" && (o.order.when.day === day || o.order.when.day === day - 1));
    if (holter && !d.acks.includes(EXAM_ACK.ホルター)) {
      issues.push({ key: "holter", level: "ask", title: "ホルター", message: `ホルター心電図をつけている時期と重なります：${ctx.describe(holter)}`, choices: [{ label: `承知（${EXAM_ACK.ホルター}）`, apply: ack(EXAM_ACK.ホルター) }] });
    }
  }
  if (d.modality === "MRI" && !d.answers.metal) {
    issues.push({
      key: "metal",
      level: "ask",
      title: "MRI",
      message: "ペースメーカー・体内金属・人工内耳などの確認が要ります。",
      choices: [
        { label: "確認済み：なし", apply: (x) => ({ ...(x as ImagingDraft), answers: { ...(x as ImagingDraft).answers, metal: "なし（確認済み）" } }) },
        { label: "あり：MRI 対応を確認済み", apply: (x) => ({ ...(x as ImagingDraft), answers: { ...(x as ImagingDraft).answers, metal: "あり（MRI 対応を確認済み）" } }) },
      ],
    });
  }
  if (d.modality === "MRI" && d.answers.claustrophobia) issues.push({ key: "claustro", level: "info", title: "閉所恐怖", message: d.answers.claustrophobia });
  if (pt && ((pt.sex === "女" && pt.age >= 12 && pt.age <= 55) || pt.pregnancy) && d.modality !== "MRI" && !d.answers.pregnancy) {
    issues.push({
      key: "pregnancy",
      level: "ask",
      title: "妊娠",
      message: pt.pregnancy ? `カルテに妊娠中${pt.pregnancy.weeks ? `（${pt.pregnancy.weeks}週）` : ""}の印があります。放射線科と相談してください。` : "妊娠の可能性の確認が要ります。",
      choices: ["なし（確認済み）", "可能性あり（放射線科と相談）"].map((a) => ({ label: a, apply: (x: Draft) => ({ ...(x as ImagingDraft), answers: { ...(x as ImagingDraft).answers, pregnancy: a } }) })),
    });
  }
  checkWhen(d, ctx, issues);
  // 重複: same modality and region on the same day
  if (d.modality && d.region && !d.duplicateOk) {
    const day = d.when.day ?? 0;
    const dup = ctx.activeOrders.find((o) => o.order.type === "imaging" && o.order.modality === d.modality && o.order.region === d.region && (o.order.side ?? null) === (d.side ?? null) && o.order.when.day === day);
    if (dup) issues.push({ key: "dup", level: "ask", title: "重複", message: `同じ日に同じ検査があります：${ctx.describe(dup)}`, choices: [{ label: "重ねて出す", apply: set<ImagingDraft>({ duplicateOk: true }) }, { label: "この下書きを消す", remove: true }] });
  }
  // 造影剤使用の説明と同意: recorded on the order (取得済み), refused (止める), or the form prepared with the order
  if (d.modality && contrastUsed) {
    const code = consentFor({ type: "imaging", modality: d.modality, contrast: d.contrast ?? "造影" });
    const c = d.consent;
    if (c?.state === "同意しない") {
      issues.push({
        key: "consent",
        level: "stop",
        title: "同意書",
        message: `造影剤の使用に同意が得られていません${c.reason ? `（${c.reason}）` : ""}。単純に変えるか、この下書きを消してください。`,
        choices: [{ label: "単純に変える", apply: set<ImagingDraft>({ contrast: "単純", consent: null, agent: null }) }, { label: "この下書きを消す", remove: true }],
      });
    } else if (c?.state === "取得済み") {
      if (!c.by || !c.at) issues.push({ key: "consent", level: "ask", title: "同意書", message: "同意は取得済みですが、説明した医師と取得日時が抜けています。オーダ画面で入れてください。" });
      else issues.push({ key: "consent", level: "info", title: "同意書", message: `${code ? `${findConsent(code).short}：` : ""}${consentText(c)}` });
    } else if (code) {
      const ci = consentIssue(code, ctx, !!d.consentPlanned, (x) => ({ ...(x as ImagingDraft), consentPlanned: true }));
      if (ci) issues.push(ci.level === "ask" ? { ...ci, message: `造影剤使用の同意が未取得です。${ci.message}` } : ci);
    }
  }
  if (d.acks.length) issues.push({ key: "acks", level: "info", title: "承知", message: d.acks.join("・") });
  return issues;
}

export function checkPhysio(d: PhysioDraft, ctx: CheckContext, pt: ExamPatientFacts | null = null): Issue[] {
  const issues: Issue[] = [];
  const m = d.test ? findPhysio(d.test) : undefined;
  if (!m) {
    const s = d.said.replace(/\s/g, "");
    issues.push({
      key: "test",
      level: d.said ? "stop" : "ask",
      title: "検査",
      message: d.said ? `「${d.said}」は生理検査のマスターにありません。` : "検査が抜けています。",
      choices: PHYSIO.filter((p) => !s || [p.name, ...p.aliases].some((a) => a.includes(s) || s.includes(a)))
        .slice(0, 6)
        .map((p) => ({ label: p.name, apply: set<PhysioDraft>({ test: p.code }) })),
    });
    return issues;
  }
  if (!d.place) {
    issues.push({
      key: "place",
      level: "ask",
      title: "場所",
      message: "検査室かベッドサイドかが抜けています。",
      choices: (m.bedside ? (["検査室", "ベッドサイド"] as const) : (["検査室"] as const)).map((p) => ({ label: p, apply: set<PhysioDraft>({ place: p }) })),
    });
  } else if (d.place === "ベッドサイド" && !m.bedside) {
    issues.push({ key: "place", level: "stop", title: "場所", message: `${m.name}はベッドサイドでは行えません（院内の約束・架空）。` });
  } else if (d.place === "検査室" && !d.transport) {
    issues.push({ key: "transport", level: "ask", title: "移動", message: "移動の方法が抜けています。", choices: (["独歩", "車椅子", "ストレッチャー"] as Transport[]).map((t) => ({ label: t, apply: set<PhysioDraft>({ transport: t }) })) });
  }
  if (m.note) issues.push({ key: "note", level: "info", title: "準備", message: m.note });
  if ((d.test === "PHY-ABI" || d.test === "PHY-SPIRO") && pt && (!pt.heightCm || !pt.weightKg)) {
    issues.push({ key: "body", level: "stop", title: "身長・体重", message: `${m.name}には身長と体重が要ります。カルテに入れてください。` });
  }
  if (d.when.priority === "至急" || d.place === "ベッドサイド") {
    issues.push({ key: "phone", level: "info", title: "連絡", message: "至急・ベッドサイドの生理検査は、生理検査室に電話で伝えます（感染症も）。" });
  }
  checkWhen(d, ctx, issues);
  if (!d.duplicateOk) {
    const day = d.when.day ?? 0;
    const dup = ctx.activeOrders.find((o) => o.order.type === "physio" && o.order.test === d.test && o.order.when.day === day);
    if (dup) issues.push({ key: "dup", level: "ask", title: "重複", message: `同じ日に同じ検査があります：${ctx.describe(dup)}`, choices: [{ label: "重ねて出す", apply: set<PhysioDraft>({ duplicateOk: true }) }, { label: "この下書きを消す", remove: true }] });
  }
  return issues;
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

export interface ImagingOrder {
  type: "imaging";
  modality: Modality;
  region: string;
  side?: Side;
  views?: string[];
  position?: Position;
  contrast?: Contrast;
  agent?: { code: string; mL: number | null };
  ct?: CtMethod;
  mri?: MriMethod;
  note?: string;
  purpose: string;
  when: { day: DayOffset; time?: string; priority: ExamPriority };
  transport: Transport;
  acks?: string[];
  answers?: { metal?: string; pregnancy?: string; claustrophobia?: string };
  reading?: Reading;
  consent?: ContrastConsent;
  comment?: string;
}

export interface PhysioOrder {
  type: "physio";
  test: string;
  purpose: string;
  when: { day: DayOffset; time?: string; priority: ExamPriority };
  place: "検査室" | "ベッドサイド";
  transport?: Transport;
  comment?: string;
}

/** When the study counts as done (no 実施 record in this prototype): its time, or the order time when 至急. */
export function examAt(o: ImagingOrder | PhysioOrder, orderedAbs: number): number {
  if (o.when.priority === "至急" || !o.when.time) return o.when.priority === "至急" ? orderedAbs + 30 : o.when.day * 1440 + minutesOf(EXAM_RULES.open);
  return o.when.day * 1440 + minutesOf(o.when.time);
}

export function toImagingOrder(d: ImagingDraft): ImagingOrder {
  const region = d.region ? findRegion(d.region) : undefined;
  const xray = d.modality === "X線" || d.modality === "ポータブルX線";
  const tomo = d.modality === "CT" || d.modality === "MRI";
  const answers = Object.fromEntries(Object.entries(d.answers).filter(([, v]) => v));
  return {
    type: "imaging",
    modality: d.modality!,
    region: d.region!,
    side: region?.sided && d.side ? d.side : undefined,
    views: xray ? (d.views ?? (d.modality === "ポータブルX線" ? ["臥位正面（AP）"] : region?.defaultViews)) : undefined,
    position: d.position ?? defaultPosition(d.modality, region),
    contrast: tomo ? d.contrast! : undefined,
    agent: tomo && usesContrast(d) && d.agent ? d.agent : undefined,
    ct: d.modality === "CT" && d.ct ? d.ct : undefined,
    mri: d.modality === "MRI" && d.mri ? d.mri : undefined,
    note: d.note?.trim() || undefined,
    reading: d.reading ?? undefined,
    purpose: d.purpose!,
    when: { day: d.when.day ?? 0, time: d.when.time ?? undefined, priority: d.when.priority! },
    transport: d.modality === "ポータブルX線" ? "病室（ポータブル）" : d.transport!,
    acks: d.acks.length ? d.acks : undefined,
    answers: Object.keys(answers).length ? answers : undefined,
    consent: tomo && usesContrast(d) && d.consent ? d.consent : undefined,
    comment: d.comment ?? undefined,
  };
}

export function toPhysioOrder(d: PhysioDraft): PhysioOrder {
  return {
    type: "physio",
    test: d.test!,
    purpose: d.purpose!,
    when: { day: d.when.day ?? 0, time: d.when.time ?? undefined, priority: d.when.priority! },
    place: d.place!,
    transport: d.place === "検査室" ? (d.transport ?? undefined) : undefined,
    comment: d.comment ?? undefined,
  };
}

export const emptyImaging = (id: string, modality: Modality | null = null): ImagingDraft => ({
  id,
  origin: "manual",
  sourceText: "（マスターから選択）",
  comment: null,
  kind: "imaging",
  modality,
  region: null,
  regionSaid: "",
  side: null,
  views: null,
  position: null,
  contrast: null,
  agent: null,
  ct: null,
  mri: null,
  note: null,
  transport: modality === "ポータブルX線" ? "病室（ポータブル）" : null,
  answers: {},
  reading: null,
  consent: null,
  purpose: null,
  when: { day: null, time: null, priority: null },
  acks: [],
  duplicateOk: false,
});

export const emptyPhysio = (id: string, test: string | null = null): PhysioDraft => ({
  id,
  origin: "manual",
  sourceText: "（マスターから選択）",
  comment: null,
  kind: "physio",
  test,
  said: "",
  place: null,
  transport: null,
  purpose: null,
  when: { day: null, time: null, priority: null },
  acks: [],
  duplicateOk: false,
});
