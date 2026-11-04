// Drug interactions at order entry: 併用禁忌・併用注意 against the patient's other orders (持参薬 and
// drafts included), and 配合 between drugs mixed in the same injection Rp.
//
// Every pair below was read in the current 電子添文 on PMDA (医療用医薬品 情報検索), sections
// 10.1 併用禁忌・10.2 併用注意 and, for injections, 8. 重要な基本的注意・14. 適用上の注意. The source of
// each pair (product, section, revision, URL) is kept with it and shown next to every finding.
// A pair missing here is "not in this table", not "safe". Code finds the pairs and shows the basis;
// the doctor decides. Nothing is recommended and nothing is blocked silently: 併用禁忌 (and a mix the
// 電子添文 says not to make) waits for the doctor's reason, which is kept on the order.
//
// The same-line question (側管 into a running main line) is not checked: an injection Rp here has no
// line field, so 配合 is checked only between drugs of the same Rp.

import type { CheckContext, Draft, InjectionDraft, Issue } from "./drafts";
import type { PrescriptionDraft } from "./rx";
import { DRUGS, findDrug, findOralDrug } from "./master";
import type { InteractionReason, OrderEntry, PrescriptionOrder } from "./types";

export type InteractionLevel = "併用禁忌" | "併用注意" | "配合";

// ---------------------------------------------------------------------------
// Sources: the 電子添文 read (PMDA 医療用医薬品 詳細表示). `codes` are the master items it is the insert of.
// ---------------------------------------------------------------------------

export interface InteractionSource {
  product: string;
  maker: string;
  /** 作成又は改訂年月 as shown on PMDA when read (2026-11-04). */
  revision: string;
  /** 添付文書番号 on PMDA (company code + YJ code + version). */
  docId: string;
  codes: string[];
}

export const PMDA_DETAIL = "https://www.pmda.go.jp/PmdaSearch/iyakuDetail/";

export const INTERACTION_SOURCES = {
  norvasc: { product: "ノルバスク錠・OD錠", maker: "ヴィアトリス製薬", revision: "2026年5月改訂（第8版）", docId: "671450_2171022F1029_4_07", codes: ["ORAL-AMLO5"] },
  takepronOD: { product: "タケプロンOD錠15・30", maker: "T's製薬（販売：武田薬品工業）", revision: "2026年10月改訂（第9版）", docId: "400061_2329023F1020_2_10", codes: ["ORAL-LPZ15"] },
  calonal: { product: "カロナール錠200・300・500", maker: "あゆみ製薬", revision: "2026年8月改訂（第5版）", docId: "172190_1141007F1063_5_07", codes: ["ORAL-APAP500"] },
  ariceptD: { product: "アリセプトD錠", maker: "エーザイ", revision: "2024年9月改訂（第4版）", docId: "170033_1190012F3029_1_29", codes: ["ORAL-DNP5"] },
  renivace: { product: "レニベース錠", maker: "オルガノン", revision: "2025年9月改訂（第5版）", docId: "181615_2144002F1024_3_04", codes: ["ORAL-ENA5"] },
  maintate: { product: "メインテート錠", maker: "田辺ファーマ", revision: "2026年9月改訂（第4版）", docId: "400315_2123016F1107_1_21", codes: ["ORAL-BISO25"] },
  aldactoneA: { product: "アルダクトンA細粒・錠", maker: "ファイザー", revision: "2025年3月改訂（第4版）", docId: "672212_2133001C1097_3_05", codes: ["ORAL-SPL25"] },
  crestor: { product: "クレストール錠・OD錠", maker: "アストラゼネカ", revision: "2026年3月改訂（第7版）", docId: "670227_2189017F1022_1_33", codes: ["ORAL-ROSU25"] },
  magmitt: { product: "マグミット錠", maker: "マグミット製薬", revision: "2026年9月改訂（第4版）", docId: "731040_2344009F1035_7_06", codes: ["ORAL-MGO330"] },
  lasixTab: { product: "ラシックス錠", maker: "サノフィ（発売：東和薬品）", revision: "2026年4月改訂（第3版）", docId: "780069_2139005F1052_1_07", codes: ["ORAL-FRS20"] },
  loxonin: { product: "ロキソニン錠60mg・細粒10%", maker: "第一三共", revision: "2025年3月改訂（第4版）", docId: "430574_1149019C1149_1_13", codes: ["ORAL-LOX60"] },
  mucosta: { product: "ムコスタ錠100mg", maker: "大塚製薬", revision: "2024年4月改訂（第2版）", docId: "180078_2329021F1102_1_01", codes: ["ORAL-REBA100"] },
  pursennid: { product: "プルゼニド錠12mg", maker: "サンファーマ", revision: "2024年7月改訂（第2版）", docId: "480866_2354003F2316_2_08", codes: ["ORAL-SENNA12"] },
  metglco: { product: "メトグルコ錠", maker: "住友ファーマ", revision: "2023年11月改訂（第5版）", docId: "400093_3962002F2027_1_22", codes: ["ORAL-MET250"] },
  vcm: { product: "塩酸バンコマイシン点滴静注用0.5g", maker: "大蔵製薬（販売：Meiji Seika ファルマ）", revision: "2026年4月改訂（第2版）", docId: "180024_6113400A1200_1_04", codes: ["INJ-VCM05"] },
  cefamezin: { product: "セファメジンα注射用", maker: "LTLファーマ", revision: "2026年9月改訂（第3版）", docId: "171911_6132401D1045_4_07", codes: ["INJ-CEZ1"] },
  sulbacillin: { product: "スルバシリン静注用", maker: "Meiji Seika ファルマ", revision: "2025年9月改訂（第3版）", docId: "780009_6139504F1065_1_19", codes: ["INJ-SBTABPC3"] },
  rocephin: { product: "ロセフィン静注用・点滴静注用バッグ", maker: "太陽ファルマ", revision: "2026年6月改訂（第2版）", docId: "431010_6132419F1020_3_08", codes: ["INJ-CTRX1"] },
  lasixInj: { product: "ラシックス注20mg", maker: "サノフィ（発売：東和薬品）", revision: "2026年4月改訂（第2版）", docId: "780069_2139401A2137_1_22", codes: ["INJ-FRS20"] },
  acelio: { product: "アセリオ静注液1000mgバッグ", maker: "テルモ", revision: "2026年8月改訂（第4版）", docId: "470034_1141400A2020_1_07", codes: ["INJ-APAP1000"] },
  kclTerumo: { product: "KCL注10mEqキット「テルモ」・20mEqキット「テルモ」", maker: "テルモ", revision: "2023年4月改訂（第1版）", docId: "470034_3319402G3028_1_05", codes: ["INJ-KCL20"] },
  veenF: { product: "ヴィーンF輸液", maker: "扶桑薬品工業", revision: "2026年10月改訂（第2版）", docId: "670156_3319557A2044_2_04", codes: ["INJ-VEENF500"] },
  soldem3A: { product: "ソルデム3A輸液", maker: "テルモ", revision: "2023年5月改訂（第1版）", docId: "470034_3319510A4083_1_05", codes: ["INJ-SOL3A500"] },
  otsukaSaline: { product: "大塚生食注", maker: "大塚製薬工場", revision: "2026年8月改訂（第2版）", docId: "180079_3311401A2026_1_14", codes: ["INJ-NS500", "INJ-NS100"] },
  otsukaGlucose: { product: "大塚糖液5%", maker: "大塚製薬工場", revision: "2025年1月改訂（第2版）", docId: "180079_3231401A1094_1_19", codes: ["INJ-GLU5-500", "INJ-GLU5-250"] },
  vitamedin: { product: "ビタメジン静注用", maker: "アルフレッサ ファーマ", revision: "2023年5月改訂（第1版）", docId: "530258_3179506F1023_3_02", codes: ["INJ-VITAMEDIN"] },
  heparinLock: { product: "ヘパリンNaロック用10単位/mLシリンジ「オーツカ」", maker: "大塚製薬工場", revision: "2025年9月改訂（第4版）", docId: "180079_3334402G1064_1_15", codes: ["INJ-HEPLOCK10"] },
  taxol: { product: "タキソール注射液", maker: "チェプラファーム", revision: "2026年9月改訂（第8版）", docId: "450900_4240406A1031_3_05", codes: ["INJ-PTX"] },
  paraplatin: { product: "パラプラチン注射液", maker: "チェプラファーム", revision: "2026年7月改訂（第9版）", docId: "450900_4291403A1088_3_05", codes: ["INJ-CBDCA"] },
  lastet: { product: "ラステット注100mg/5mL", maker: "日本化薬", revision: "2023年3月改訂（第1版）", docId: "530191_4240403A2042_1_10", codes: ["INJ-ETP"] },
  aloxi: { product: "アロキシ静注0.75mg", maker: "大鵬薬品工業", revision: "2026年10月改訂（第3版）", docId: "400107_2391404A1020_1_08", codes: ["INJ-PALO"] },
  proemend: { product: "プロイメンド点滴静注用150mg", maker: "小野薬品工業", revision: "2023年12月改訂（第2版）", docId: "180188_2391405D1020_1_11", codes: ["INJ-FAPR"] },
  dexart: { product: "デキサート注射液", maker: "富士製薬工業", revision: "2026年4月改訂（第3版）", docId: "670109_2454405H1032_1_09", codes: ["INJ-DEX66"] },
  gasterInj: { product: "ガスター注射液", maker: "LTLファーマ", revision: "2026年9月改訂（第2版）", docId: "171911_2325401A1020_2_04", codes: ["INJ-FAMO20"] },
} satisfies Record<string, InteractionSource>;

export type SourceKey = keyof typeof INTERACTION_SOURCES;

export const sourceUrl = (k: SourceKey) => `${PMDA_DETAIL}${INTERACTION_SOURCES[k].docId}`;

/** Where in a 電子添文 a pair is written, and how that 電子添文 names the other drug. */
export interface SourceRef {
  doc: SourceKey;
  /** "10.1", "10.2", "14.1.2" … */
  section: string;
  /** The other drug as the 電子添文 writes it (a class such as 「利尿剤（フロセミド等）」, or a name). */
  as: string;
}

export interface InteractionPair {
  id: string;
  level: InteractionLevel;
  a: string[];
  b: string[];
  /** 配合 the 電子添文 says not to make (配合しないこと・混注しないこと): confirmed only with a reason, like 併用禁忌. */
  mustNot?: boolean;
  /** What the 電子添文 says happens and what to watch (a paraphrase). */
  text: string;
  refs: SourceRef[];
}

/** Not a drug: an order for CT with iodine contrast (ヨード造影剤), for the metformin pair. */
export const IODINE_CONTRAST = "CONTRAST-IODINE";

const AMLO = "ORAL-AMLO5";
const LPZ = "ORAL-LPZ15";
const APAP = "ORAL-APAP500";
const DNP = "ORAL-DNP5";
const ENA = "ORAL-ENA5";
const BISO = "ORAL-BISO25";
const SPL = "ORAL-SPL25";
const ROSU = "ORAL-ROSU25";
const MGO = "ORAL-MGO330";
const LOX = "ORAL-LOX60";
const MET = "ORAL-MET250";
const FRS = ["ORAL-FRS20", "INJ-FRS20"];
const ABX = ["INJ-VCM05", "INJ-CEZ1", "INJ-SBTABPC3", "INJ-CTRX1"];
const lasix = (section: string, as: string): SourceRef[] => [
  { doc: "lasixTab", section, as },
  { doc: "lasixInj", section, as },
];
/** Fluids: 生理食塩液 and 5%ブドウ糖 (the two the タキソール 電子添文 allows). */
const SALINE_GLUCOSE = ["INJ-NS500", "INJ-NS100", "INJ-NSSY10", "INJ-GLU5-500", "INJ-GLU5-250"];
const allInjectionsBut = (...but: string[]) => DRUGS.map((d) => d.code).filter((c) => !but.includes(c));

const BP_UP = "降圧作用が強まることがある（作用の相加）。血圧を見る。";

export const INTERACTIONS: InteractionPair[] = [
  // --- 降圧作用の増強（併用注意） ---
  { id: "amlo-ena", level: "併用注意", a: [AMLO], b: [ENA], text: BP_UP, refs: [{ doc: "norvasc", section: "10.2", as: "降圧作用を有する薬剤" }] },
  {
    id: "amlo-biso",
    level: "併用注意",
    a: [AMLO],
    b: [BISO],
    text: BP_UP,
    refs: [
      { doc: "norvasc", section: "10.2", as: "降圧作用を有する薬剤" },
      { doc: "maintate", section: "10.2", as: "降圧作用を有する薬剤（降圧剤）" },
    ],
  },
  {
    id: "amlo-spl",
    level: "併用注意",
    a: [AMLO],
    b: [SPL],
    text: BP_UP,
    refs: [
      { doc: "norvasc", section: "10.2", as: "降圧作用を有する薬剤" },
      { doc: "aldactoneA", section: "10.2", as: "降圧剤（カルシウム拮抗剤）" },
    ],
  },
  { id: "amlo-frs", level: "併用注意", a: [AMLO], b: FRS, text: BP_UP, refs: [{ doc: "norvasc", section: "10.2", as: "降圧作用を有する薬剤" }, ...lasix("10.2", "他の降圧剤")] },
  { id: "biso-ena", level: "併用注意", a: [BISO], b: [ENA], text: BP_UP, refs: [{ doc: "maintate", section: "10.2", as: "降圧作用を有する薬剤（降圧剤）" }] },
  {
    id: "biso-spl",
    level: "併用注意",
    a: [BISO],
    b: [SPL],
    text: BP_UP,
    refs: [
      { doc: "maintate", section: "10.2", as: "降圧作用を有する薬剤（降圧剤）" },
      { doc: "aldactoneA", section: "10.2", as: "降圧剤（β-遮断剤）" },
    ],
  },
  { id: "biso-frs", level: "併用注意", a: [BISO], b: FRS, text: BP_UP, refs: [{ doc: "maintate", section: "10.2", as: "降圧作用を有する薬剤（降圧剤）" }, ...lasix("10.2", "他の降圧剤（β-遮断剤 等）")] },
  { id: "spl-frs", level: "併用注意", a: [SPL], b: FRS, text: BP_UP, refs: [{ doc: "aldactoneA", section: "10.2", as: "降圧剤（利尿降圧剤等）" }, ...lasix("10.2", "他の降圧剤")] },
  {
    id: "ena-spl",
    level: "併用注意",
    a: [ENA],
    b: [SPL],
    text: "血清カリウム値が上がることがある（ともにカリウムをためる。腎障害・高齢者で起こりやすい）。降圧作用も強まることがある。血清カリウム値と血圧を見る。",
    refs: [
      { doc: "renivace", section: "10.2", as: "カリウム保持性利尿剤（スピロノラクトン）" },
      { doc: "aldactoneA", section: "10.2", as: "ACE阻害剤（エナラプリル）・降圧剤" },
    ],
  },
  {
    id: "ena-frs",
    level: "併用注意",
    a: [ENA],
    b: FRS,
    text: "フロセミドの投与中にエナラプリルを初めて使う・増やすと、高度の血圧低下や腎機能の悪化を起こすことがある（レニン活性が上がっているため）。エナラプリルの初回投与後に一過性の急な血圧低下のおそれ。血圧と腎機能を見る。",
    refs: [...lasix("10.2", "ACE阻害剤"), { doc: "renivace", section: "10.2", as: "利尿降圧剤、利尿剤" }],
  },

  // --- 血清カリウム値の上昇（併用注意） ---
  {
    id: "spl-kcl",
    level: "併用注意",
    a: [SPL],
    b: ["INJ-KCL20"],
    text: "高カリウム血症を起こすことがある（血清カリウム値の上昇の相加。腎障害・高齢者で起こりやすい）。血清カリウム値を見る。",
    refs: [{ doc: "aldactoneA", section: "10.2", as: "カリウム製剤（塩化カリウム）" }],
  },
  {
    id: "ena-kcl",
    level: "併用注意",
    a: [ENA],
    b: ["INJ-KCL20"],
    text: "血清カリウム値が上がることがある（エナラプリルが尿へのカリウムの排泄を抑える。腎機能障害で特に）。血清カリウム値を見る。",
    refs: [{ doc: "renivace", section: "10.2", as: "カリウム補給剤（塩化カリウム）" }],
  },

  // --- ロキソプロフェン（NSAIDs）（併用注意） ---
  {
    id: "lox-spl",
    level: "併用注意",
    a: [LOX],
    b: [SPL],
    text: "降圧作用が弱まることがある。腎機能障害のある人で重い高カリウム血症の報告がある。血圧・血清カリウム値・腎機能を見る。",
    refs: [{ doc: "aldactoneA", section: "10.2", as: "非ステロイド性消炎鎮痛剤" }],
  },
  {
    id: "lox-ena",
    level: "併用注意",
    a: [LOX],
    b: [ENA],
    text: "降圧作用が弱まることがある。腎機能が悪い人ではさらに悪化するおそれ（プロスタグランジンの合成を抑え、腎血流が減る）。血圧と腎機能を見る。",
    refs: [
      { doc: "renivace", section: "10.2", as: "非ステロイド性消炎鎮痛剤" },
      { doc: "loxonin", section: "10.2", as: "降圧剤（ACE阻害剤）" },
    ],
  },
  {
    id: "lox-biso",
    level: "併用注意",
    a: [LOX],
    b: [BISO],
    text: "降圧作用が弱まることがある（プロスタグランジンの合成を抑えるため）。腎機能を悪くするおそれ。血圧と腎機能を見る。",
    refs: [
      { doc: "maintate", section: "10.2", as: "非ステロイド性抗炎症剤" },
      { doc: "loxonin", section: "10.2", as: "降圧剤" },
    ],
  },
  {
    id: "lox-amlo",
    level: "併用注意",
    a: [LOX],
    b: [AMLO],
    text: "降圧作用が弱まるおそれ。腎機能を悪くするおそれ（腎血流が減る）。血圧と腎機能を見る。",
    refs: [{ doc: "loxonin", section: "10.2", as: "降圧剤" }],
  },
  {
    id: "lox-frs",
    level: "併用注意",
    a: [LOX],
    b: FRS,
    text: "フロセミドの利尿作用が弱まるおそれ（腎でのプロスタグランジンの合成を抑え、水・塩類がたまる）。尿量を見る。",
    refs: lasix("10.2", "非ステロイド性消炎鎮痛剤（インドメタシン）"),
  },
  {
    id: "lox-dnp",
    level: "併用注意",
    a: [LOX],
    b: [DNP],
    text: "消化性潰瘍を起こす可能性がある（コリン系の賦活で胃酸の分泌が増える）。消化器の症状を見る。",
    refs: [{ doc: "ariceptD", section: "10.2", as: "非ステロイド性消炎鎮痛剤" }],
  },

  // --- 抗菌薬（併用注意） ---
  {
    id: "cez-diuretic",
    level: "併用注意",
    a: ["INJ-CEZ1"],
    b: [...FRS, SPL],
    text: "腎障害が強まるおそれ（動物で腎障害の増強の報告。機序は明らかでない）。腎機能を見る。",
    refs: [{ doc: "cefamezin", section: "10.2", as: "利尿剤（フロセミド 等）" }, ...lasix("10.2", "セファロスポリン系抗生物質")],
  },
  {
    id: "ctrx-diuretic",
    level: "併用注意",
    a: ["INJ-CTRX1"],
    b: [...FRS, SPL],
    text: "他のセフェム系で、併用による腎障害の増強が報告されている（利尿時の脱水による血中濃度の上昇などが考えられる）。腎機能を見る。",
    refs: [{ doc: "rocephin", section: "10.2", as: "利尿剤（フロセミド 等）" }, ...lasix("10.2", "セファロスポリン系抗生物質")],
  },
  {
    id: "vcm-cbdca",
    level: "併用注意",
    a: ["INJ-VCM05"],
    b: ["INJ-CBDCA"],
    text: "腎障害・聴覚障害が出る、悪化するおそれ（ともに腎毒性・聴器毒性）。バンコマイシンの電子添文は併用を避けること、やむを得ず併用するときは慎重に、としている。腎機能と聴力を見る。",
    refs: [
      { doc: "vcm", section: "10.2", as: "腎毒性及び聴器毒性を有する薬剤（白金含有抗悪性腫瘍剤）" },
      { doc: "paraplatin", section: "10.2", as: "腎毒性及び聴器毒性を有する薬剤" },
    ],
  },
  {
    id: "apap-abx",
    level: "併用注意",
    a: [APAP],
    b: ABX,
    text: "過度の体温下降を起こす頻度が高くなる（機序は不明）。体温などをよく観察する。",
    refs: [{ doc: "calonal", section: "10.2", as: "抗生物質、抗菌剤" }],
  },

  // --- メトホルミン（併用注意） ---
  {
    id: "met-diuretic",
    level: "併用注意",
    a: [MET],
    b: [...FRS, SPL],
    text: "脱水により乳酸アシドーシスを起こすことがある。血糖降下作用が弱まることがある（利尿剤によるカリウムの喪失）。脱水の症状と血糖を見る。",
    refs: [{ doc: "metglco", section: "10.2", as: "利尿作用を有する薬剤（利尿剤）・利尿剤" }],
  },
  {
    id: "met-biso",
    level: "併用注意",
    a: [MET],
    b: [BISO],
    text: "低血糖が起こることがあり（スルホニルウレア剤を併用しているとき特に）、低血糖の症状（頻脈・発汗など）が隠れることがある。血糖を見る。",
    refs: [
      { doc: "metglco", section: "10.2", as: "β遮断剤" },
      { doc: "maintate", section: "10.2", as: "血糖降下剤" },
    ],
  },
  {
    id: "met-dex",
    level: "併用注意",
    a: [MET],
    b: ["INJ-DEX66"],
    text: "メトホルミンの血糖降下作用が弱まることがある（肝での糖新生の促進など）。血糖を見る。",
    refs: [
      { doc: "metglco", section: "10.2", as: "副腎皮質ホルモン" },
      { doc: "dexart", section: "10.2", as: "糖尿病用薬（ビグアナイド系薬剤）" },
    ],
  },
  {
    id: "met-contrast",
    level: "併用注意",
    a: [MET],
    b: [IODINE_CONTRAST],
    text: "乳酸アシドーシスを起こすことがある（腎機能が下がり、メトホルミンの排泄が減る）。電子添文は、ヨード造影剤を使う検査ではメトホルミンを一時的に中止する、としている。",
    refs: [{ doc: "metglco", section: "10.2", as: "ヨード造影剤" }],
  },

  // --- デキサメタゾン（併用注意） ---
  {
    id: "dex-frs",
    level: "併用注意",
    a: ["INJ-DEX66"],
    b: FRS,
    text: "低カリウム血症があらわれることがある（ともにカリウムの排泄を促す）。フロセミドの作用が弱まるおそれ。血清カリウム値を見る。",
    refs: [{ doc: "dexart", section: "10.2", as: "利尿剤（カリウム保持性利尿剤を除く）（フロセミド）・利尿剤" }, ...lasix("10.2", "糖質副腎皮質ホルモン剤")],
  },
  { id: "dex-spl", level: "併用注意", a: ["INJ-DEX66"], b: [SPL], text: "スピロノラクトンの作用が弱まるおそれ（機序不明）。", refs: [{ doc: "dexart", section: "10.2", as: "利尿剤" }] },
  {
    id: "dex-bp",
    level: "併用注意",
    a: ["INJ-DEX66"],
    b: [AMLO, ENA, BISO],
    text: "降圧薬の作用が弱まるおそれ（機序不明）。血圧を見る。",
    refs: [{ doc: "dexart", section: "10.2", as: "血圧降下剤" }],
  },
  {
    id: "dex-dnp",
    level: "併用注意",
    a: ["INJ-DEX66"],
    b: [DNP],
    text: "ドネペジルの代謝が促され、作用が弱まる可能性（デキサメタゾンによる CYP3A4 の誘導）。",
    refs: [{ doc: "ariceptD", section: "10.2", as: "デキサメタゾン" }],
  },
  {
    id: "dex-fapr",
    level: "併用注意",
    a: ["INJ-DEX66"],
    b: ["INJ-FAPR"],
    text: "デキサメタゾンの効果が強まるおそれ（アプレピタントの CYP3A4 阻害）。電子添文は、併用するときはデキサメタゾンの量に注意する（減量するなど）、としている。",
    refs: [{ doc: "proemend", section: "10.2", as: "CYP3A4で代謝される薬剤（デキサメタゾン）" }],
  },

  // --- 酸化マグネシウム（併用注意） ---
  {
    id: "mgo-rosu",
    level: "併用注意",
    a: [MGO],
    b: [ROSU],
    text: "ロスバスタチンの血中濃度が下がるおそれ（機序不明）。",
    refs: [{ doc: "magmitt", section: "10.2", as: "ロスバスタチン" }],
  },
  {
    id: "mgo-lpz",
    level: "併用注意",
    a: [MGO],
    b: [LPZ],
    text: "酸化マグネシウムの緩下作用が弱まるおそれ（胃の中の pH が上がり、溶けにくくなる）。便通を見る。",
    refs: [
      { doc: "magmitt", section: "10.2", as: "プロトンポンプインヒビター（ランソプラゾール）" },
      { doc: "takepronOD", section: "10.2", as: "酸化マグネシウム" },
    ],
  },
  {
    id: "mgo-famo",
    level: "併用注意",
    a: [MGO],
    b: ["INJ-FAMO20"],
    text: "酸化マグネシウムの緩下作用が弱まるおそれ（胃の中の pH が上がり、溶けにくくなる）。便通を見る。",
    refs: [{ doc: "magmitt", section: "10.2", as: "H2受容体拮抗薬（ファモチジン）" }],
  },

  // --- 抗がん薬（併用注意） ---
  {
    id: "ptx-cbdca",
    level: "併用注意",
    a: ["INJ-PTX"],
    b: ["INJ-CBDCA"],
    text: "骨髄抑制などの副作用が重なり、強まるおそれ。患者の状態を観察する。",
    refs: [
      { doc: "taxol", section: "10.2", as: "抗悪性腫瘍剤" },
      { doc: "paraplatin", section: "10.2", as: "抗悪性腫瘍剤" },
    ],
  },
  {
    id: "ptx-etp",
    level: "併用注意",
    a: ["INJ-PTX"],
    b: ["INJ-ETP"],
    text: "骨髄抑制などの副作用が重なり、強まるおそれ。患者の状態を観察する。",
    refs: [
      { doc: "taxol", section: "10.2", as: "抗悪性腫瘍剤" },
      { doc: "lastet", section: "10.2", as: "抗悪性腫瘍剤" },
    ],
  },
  {
    id: "cbdca-etp",
    level: "併用注意",
    a: ["INJ-CBDCA"],
    b: ["INJ-ETP"],
    text: "骨髄抑制などの副作用が重なり、強まるおそれ。患者の状態を観察する。",
    refs: [
      { doc: "paraplatin", section: "10.2", as: "抗悪性腫瘍剤" },
      { doc: "lastet", section: "10.2", as: "抗悪性腫瘍剤" },
    ],
  },
  {
    id: "ptx-amlo",
    level: "併用注意",
    a: ["INJ-PTX"],
    b: [AMLO],
    text: "パクリタキセルの代謝（CYP2C8・CYP3A4 等）が妨げられて血中濃度が上がり、骨髄抑制などが強まるおそれ。患者の状態を観察する。",
    refs: [{ doc: "taxol", section: "10.2", as: "ジヒドロピリジン系カルシウムチャンネルブロッカー（ニフェジピン等）" }],
  },

  // --- 配合（同じ Rp の中だけ） ---
  {
    id: "ctrx-calcium",
    level: "配合",
    a: ["INJ-CTRX1"],
    b: ["INJ-VEENF500"],
    mustNot: true,
    text: "カルシウムを含む輸液との配合で混濁などの変化の報告があり、電子添文は配合しないこと、またカルシウムを含む注射剤・輸液と同時に投与しないこと、としている（新生児で同じ経路から同時に投与し、肺・腎臓の結晶で死亡した例）。",
    refs: [
      { doc: "rocephin", section: "14.1.2・8.3", as: "カルシウムを含有する注射剤又は輸液" },
      { doc: "veenF", section: "3.1 組成", as: "塩化カルシウム水和物（Ca2+ 3mEq/L）を含む" },
    ],
  },
  {
    id: "acelio-mix",
    level: "配合",
    a: ["INJ-APAP1000"],
    b: allInjectionsBut("INJ-APAP1000"),
    mustNot: true,
    text: "電子添文は、この薬（バッグ）に他の薬を混注しない、としている。",
    refs: [{ doc: "acelio", section: "14.2.2", as: "他剤" }],
  },
  {
    id: "ptx-mix",
    level: "配合",
    a: ["INJ-PTX"],
    b: allInjectionsBut("INJ-PTX", ...SALINE_GLUCOSE),
    mustNot: true,
    text: "電子添文は、5%ブドウ糖注射液と生理食塩液のほかの薬とは混注しない、としている。",
    refs: [{ doc: "taxol", section: "14.1.1", as: "5%ブドウ糖注射液及び生理食塩液を除く他の薬剤" }],
  },
  {
    id: "cbdca-chemo-mix",
    level: "配合",
    a: ["INJ-CBDCA"],
    b: ["INJ-PTX", "INJ-ETP"],
    mustNot: true,
    text: "カルボプラチンは錯化合物なので、電子添文は他の抗悪性腫瘍剤とは混注しない、としている。",
    refs: [{ doc: "paraplatin", section: "14.1.3", as: "他の抗悪性腫瘍剤" }],
  },
  {
    id: "cbdca-salt",
    level: "配合",
    a: ["INJ-CBDCA"],
    b: ["INJ-NS500", "INJ-NS100", "INJ-VEENF500", "INJ-SOL3A500", "INJ-KCL20"],
    text: "生理食塩液など無機塩類（NaCl・KCl・CaCl2 等）を含む輸液に混ぜたときは、8時間以内に投与を終える（電子添文）。",
    refs: [
      { doc: "paraplatin", section: "14.2.2", as: "無機塩類（NaCl、KCl、CaCl2等）を含有する輸液" },
      { doc: "veenF", section: "3.1 組成", as: "塩化ナトリウム・塩化カリウム・塩化カルシウム水和物を含む" },
      { doc: "soldem3A", section: "3.1 組成", as: "塩化ナトリウム・塩化カリウムを含む" },
    ],
  },
  {
    id: "cez-famo",
    level: "配合",
    a: ["INJ-CEZ1"],
    b: ["INJ-FAMO20"],
    text: "混ぜると混濁することがある（電子添文）。",
    refs: [{ doc: "cefamezin", section: "14.1.3", as: "ファモチジン" }],
  },
  {
    id: "sbt-glucose",
    level: "配合",
    a: ["INJ-SBTABPC3"],
    b: ["INJ-SOL3A500", "INJ-GLU5-500", "INJ-GLU5-250"],
    text: "糖を含む液に溶かすとアンピシリンの力価が下がるので、速やかに使い、保存しない（電子添文）。",
    refs: [
      { doc: "sulbacillin", section: "14.1", as: "糖質含有溶解液（グルコース等）" },
      { doc: "soldem3A", section: "3.1 組成", as: "ブドウ糖 21.5g/500mL を含む" },
    ],
  },
];

// ---------------------------------------------------------------------------
// Finding pairs
// ---------------------------------------------------------------------------

export interface InteractionFinding {
  /** Unique per pair and the two drugs. */
  key: string;
  pairId: string;
  level: InteractionLevel;
  /** 併用禁忌, or a mix the 電子添文 says not to make: the doctor confirms with a reason. */
  needsReason: boolean;
  /** The drug of the order being checked. */
  code: string;
  name: string;
  /** What it was checked against. */
  other: { code: string; name: string; where: string };
  text: string;
  sources: { label: string; url: string; section: string; as: string }[];
}

/** Something the order is checked against: a drug of another order or draft, or of the same Rp. */
export interface CheckTarget {
  code: string;
  /** "持参薬", "内服（定期）", "注射", "下書き（注射）", "同じ Rp" … */
  where: string;
  sameRp?: boolean;
}

export function interactionName(code: string): string {
  if (code === IODINE_CONTRAST) return "ヨード造影剤（CT の造影）";
  const o = findOralDrug(code);
  if (o) return `${o.name} ${o.strength}`;
  return findDrug(code)?.name ?? code;
}

const sourcesFor = (p: InteractionPair, x: string, y: string) =>
  p.refs
    .filter((r) => INTERACTION_SOURCES[r.doc].codes.some((c) => c === x || c === y))
    .map((r) => {
      const s = INTERACTION_SOURCES[r.doc];
      return { label: `${s.product} 電子添文 ${r.section}（${s.revision}）`, url: sourceUrl(r.doc), section: r.section, as: r.as };
    });

const matches = (p: InteractionPair, x: string, y: string) => x !== y && ((p.a.includes(x) && p.b.includes(y)) || (p.a.includes(y) && p.b.includes(x)));

/**
 * Pairs between the drugs of one Rp, and between them and the targets. 配合 is looked for only between drugs of
 * the same Rp (mixed or given together); 併用 against everything. A drug met in several orders is listed once.
 */
export function findInteractions(rp: string[], targets: CheckTarget[], table: InteractionPair[] = INTERACTIONS): InteractionFinding[] {
  const out = new Map<string, InteractionFinding>();
  const add = (p: InteractionPair, code: string, other: string, where: string) => {
    const key = `${p.id}|${[code, other].sort().join("|")}`;
    const hit = out.get(key);
    if (hit) {
      if (!hit.other.where.split("・").includes(where)) hit.other.where += `・${where}`;
      return;
    }
    out.set(key, {
      key,
      pairId: p.id,
      level: p.level,
      needsReason: p.level === "併用禁忌" || !!p.mustNot,
      code,
      name: interactionName(code),
      other: { code: other, name: interactionName(other), where },
      text: p.text,
      sources: sourcesFor(p, code, other),
    });
  };
  const codes = rp.filter(Boolean);
  codes.forEach((x, i) => {
    for (const y of codes.slice(i + 1)) for (const p of table) if (matches(p, x, y)) add(p, x, y, "同じ Rp");
    for (const t of targets) {
      for (const p of table) {
        if (!matches(p, x, t.code)) continue;
        if (p.level === "配合" && !t.sameRp) continue;
        add(p, x, t.code, t.where);
      }
    }
  });
  const rank: Record<InteractionLevel, number> = { 併用禁忌: 0, 配合: 1, 併用注意: 2 };
  return [...out.values()].sort((a, b) => rank[a.level] - rank[b.level] || Number(b.needsReason) - Number(a.needsReason));
}

// ---------------------------------------------------------------------------
// What a draft or an order is checked against
// ---------------------------------------------------------------------------

const CONTRAST_CT = ["造影", "単純＋造影", "放射線科一任"];

const rxWhere = (c: PrescriptionOrder["category"] | null) => (c === "持参薬" ? "持参薬" : c === "退院時" ? "退院時処方" : `内服${c ? `（${c}）` : ""}`);

/** Drug codes of an order, for the check (CT with contrast counts as ヨード造影剤). */
function orderCodes(e: OrderEntry): { codes: string[]; where: string; home: boolean } {
  const o = e.order;
  if (o.type === "prescription") return { codes: [o.drugCode], where: rxWhere(o.category), home: o.category === "退院時" };
  if (o.type === "injection") return { codes: o.items.map((i) => i.drugCode), where: "注射", home: false };
  if (o.type === "imaging" && o.modality === "CT" && o.contrast && CONTRAST_CT.includes(o.contrast)) return { codes: [IODINE_CONTRAST], where: `CT（${o.contrast}）のオーダ`, home: false };
  return { codes: [], where: "", home: false };
}

function draftCodes(d: Draft): { codes: string[]; where: string; home: boolean } {
  if (d.kind === "prescription") return { codes: d.items.flatMap((i) => (i.drugCode ? [i.drugCode] : [])), where: `下書き（${rxWhere(d.category)}）`, home: d.category === "退院時" };
  if (d.kind === "injection") return { codes: d.items.flatMap((i) => (i.drugCode ? [i.drugCode] : [])), where: "下書き（注射）", home: false };
  if (d.kind === "imaging" && d.modality === "CT" && d.contrast && CONTRAST_CT.includes(d.contrast)) return { codes: [IODINE_CONTRAST], where: `下書き（CT ${d.contrast}）`, home: false };
  return { codes: [], where: "", home: false };
}

/**
 * The other orders and drafts a drug draft is checked against. A 退院時処方 is checked only with other
 * 退院時処方 (it is taken at home, after the ward's orders end); orders being stopped by a draft are left out.
 */
export function draftTargets(d: InjectionDraft | PrescriptionDraft, ctx: Pick<CheckContext, "activeOrders" | "drafts">, stoppedIds: string[]): CheckTarget[] {
  const home = d.kind === "prescription" && d.category === "退院時";
  const gone = new Set([...stoppedIds, ...(d.kind === "injection" && d.duplicate?.action === "replace" ? [d.duplicate.orderId] : [])]);
  const out: CheckTarget[] = [];
  for (const e of ctx.activeOrders) {
    if (gone.has(e.id)) continue;
    const x = orderCodes(e);
    if (x.home !== home) continue;
    for (const code of x.codes) out.push({ code, where: x.where });
  }
  for (const o of ctx.drafts) {
    if (o.id === d.id) continue;
    const x = draftCodes(o);
    if (x.home !== home) continue;
    for (const code of x.codes) out.push({ code, where: x.where });
  }
  return out;
}

/** The findings of a drug draft (its Rp against the other orders and drafts). */
export function draftInteractions(d: InjectionDraft | PrescriptionDraft, ctx: Pick<CheckContext, "activeOrders" | "drafts">, stoppedIds: string[]): InteractionFinding[] {
  return findInteractions(draftCodes(d).codes, draftTargets(d, ctx, stoppedIds));
}

/** The findings of a confirmed order against the patient's other running orders (for 処方監査). */
export function orderInteractions(e: OrderEntry, entries: OrderEntry[]): InteractionFinding[] {
  if (e.status !== "有効") return [];
  const self = orderCodes(e);
  if (!self.codes.length || self.codes[0] === IODINE_CONTRAST) return [];
  // Drugs of one oral Rp are ordered as several orders that share `rp`.
  const rpId = e.order.type === "prescription" ? e.order.rp : undefined;
  const sameRp = (x: OrderEntry) => !!rpId && x.order.type === "prescription" && x.order.rp === rpId;
  const targets: CheckTarget[] = [];
  for (const x of entries) {
    if (x.id === e.id || x.status !== "有効") continue;
    const o = orderCodes(x);
    if (o.home !== self.home) continue;
    for (const code of o.codes) targets.push(sameRp(x) ? { code, where: "同じ Rp", sameRp: true } : { code, where: o.where });
  }
  return findInteractions(self.codes, targets);
}

// ---------------------------------------------------------------------------
// As checks on a draft (see drafts.ts checkDraft) and on the order when confirmed
// ---------------------------------------------------------------------------

type DrugDraft = InjectionDraft | PrescriptionDraft;

const findingLine = (f: InteractionFinding) => `${f.name} × ${f.other.name}（${f.other.where}）：${f.text}`;

/** One issue per finding: 併用注意 and the milder 配合 are information; 併用禁忌 and 配合しないこと wait for a reason. */
export function interactionIssues(d: DrugDraft, ctx: Pick<CheckContext, "activeOrders" | "drafts">, stoppedIds: string[]): Issue[] {
  const reasons = d.interactionReasons ?? {};
  return draftInteractions(d, ctx, stoppedIds).map((f): Issue => {
    const sources = f.sources.map((s) => ({ label: s.label, url: s.url }));
    const title = f.level === "配合" && f.needsReason ? "配合（電子添文：混ぜない）" : f.level;
    const reason = reasons[f.pairId]?.trim();
    if (f.needsReason && !reason) {
      return {
        key: `ix-${f.key}`,
        level: "ask",
        title,
        message: `${findingLine(f)}${f.level === "配合" ? "（ほかの Rp で同じルートから入る薬は調べていません）" : ""}　続けるときは理由を入れてください（オーダに残り、薬剤部に伝わります）。`,
        sources,
        input: {
          placeholder: "続ける理由",
          button: "理由を残して続ける",
          apply: (x, text) => ({ ...(x as DrugDraft), interactionReasons: { ...((x as DrugDraft).interactionReasons ?? {}), [f.pairId]: text.trim() } }) as Draft,
        },
      };
    }
    return {
      key: `ix-${f.key}`,
      level: "info",
      title: reason ? `${title}（理由あり）` : title,
      message: `${findingLine(f)}${reason ? `　理由：${reason}` : ""}`,
      sources,
    };
  });
}

/** The doctor's reasons for the findings that needed one, kept on the order. Only drugs of `codes` (an oral order is one drug). */
export function reasonsToKeep(d: DrugDraft, ctx: Pick<CheckContext, "activeOrders" | "drafts">, stoppedIds: string[], codes?: string[]): InteractionReason[] | undefined {
  const reasons = d.interactionReasons ?? {};
  const kept = draftInteractions(d, ctx, stoppedIds)
    .filter((f) => f.needsReason && reasons[f.pairId]?.trim() && (!codes || codes.includes(f.code) || (f.other.where === "同じ Rp" && codes.includes(f.other.code))))
    .map((f) => ({ pairId: f.pairId, level: f.level, drugs: `${f.name} × ${f.other.name}（${f.other.where}）`, reason: reasons[f.pairId].trim() }));
  return kept.length ? kept : undefined;
}
