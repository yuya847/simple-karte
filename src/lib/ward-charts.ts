// FICTIONAL minimal charts for the inpatients outside the 山本チーム: the other teams' beds on 5階東 and the
// patients of 5階南・6階東 (ward.ts lists each by bed with name, sex, age, department and a note).
//
// Each chart is made by code from its bed and name with a fixed seed (nothing random at run time, the same
// chart on every page load): an admission day, 主病名 and a short problem list that fit the department and
// the bed's note (術後・明日退院・転倒注意・酸素投与中 …), the admission note, a few vital sets around today,
// one lab set near the reference ranges, the diet and a few orders. Disease names and codes are those of
// the official 傷病名マスター unchanged (the tests check every one); drugs, tests and procedures come from
// this app's masters. The charts are kept small on purpose: they make the ward read as a ward, and the
// patient list, the map and the DPC column can show everyone the same way. Nobody here is a real person.

import type { Diagnosis } from "./diagnoses";
import { dietAt, type DietOrder, type Meal } from "./diet";
import type { DoseTiming, HistoryEntry, LabResult, Order, OrderEntry, Patient, RehabOrder, Sex, VitalSign } from "./types";
import { BEDS, OTHER_FLOOR_BEDS, WARD_PLANS, doctorFor, floorOf, type BedAssignment, type OtherPatient } from "./ward";

// ---------------------------------------------------------------------------
// Seeded numbers (FNV-1a for the seed, mulberry32 for the sequence)
// ---------------------------------------------------------------------------

function seedOf(s: string): number {
  let h = 2166136261;
  for (const c of s) {
    h ^= c.codePointAt(0)!;
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

type Rand = () => number;

function rand(seed: number): Rand {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const int = (r: Rand, lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
const between = (r: Rand, lo: number, hi: number, digits: number) => Number((lo + r() * (hi - lo)).toFixed(digits));
const pick = <T>(r: Rand, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)];

const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
const minutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
const later = (t: string, min: number) => hhmm(Math.min(minutes(t) + min, 23 * 60 + 59));

// ---------------------------------------------------------------------------
// Names: the readings of the fictional names in ward.ts
// ---------------------------------------------------------------------------

const KANA: Record<string, string> = {
  "岡部 正二": "オカベ ショウジ", "村井 和子": "ムライ カズコ", "堀 誠": "ホリ マコト", "西田 浩": "ニシダ ヒロシ", "小池 隆": "コイケ タカシ",
  "上野 幸子": "ウエノ サチコ", "吉川 ミツ": "ヨシカワ ミツ", "久保 恵": "クボ メグミ", "原 啓介": "ハラ ケイスケ", "松尾 実": "マツオ ミノル",
  "今井 武": "イマイ タケシ", "田村 昭": "タムラ アキラ", "杉本 進": "スギモト ススム", "坂口 典子": "サカグチ ノリコ", "石原 清子": "イシハラ キヨコ",
  "中野 英子": "ナカノ エイコ", "横山 文子": "ヨコヤマ フミコ", "野口 ハル": "ノグチ ハル", "菅原 洋子": "スガワラ ヨウコ", "藤井 さよ": "フジイ サヨ",
  "高田 由美": "タカダ ユミ", "安藤 キヨ": "アンドウ キヨ",
  "森田 健一": "モリタ ケンイチ", "青木 トシ": "アオキ トシ", "宮崎 達也": "ミヤザキ タツヤ", "大塚 茂": "オオツカ シゲル", "内田 勝": "ウチダ マサル",
  "柴田 和枝": "シバタ カズエ", "島田 久美子": "シマダ クミコ", "平野 ふみ": "ヒラノ フミ", "工藤 修二": "クドウ シュウジ", "高野 義男": "タカノ ヨシオ",
  "野村 一郎": "ノムラ イチロウ", "水野 清": "ミズノ キヨシ", "桜井 美代子": "サクライ ミヨコ", "酒井 千代": "サカイ チヨ", "荒木 洋子": "アラキ ヨウコ",
  "金子 博之": "カネコ ヒロユキ", "関 さち子": "セキ サチコ", "熊谷 進": "クマガイ ススム", "菊地 正": "キクチ タダシ", "千葉 栄一": "チバ エイイチ",
  "岩崎 由紀": "イワサキ ユキ", "松本 静": "マツモト シズカ", "中島 トミ": "ナカジマ トミ", "大橋 京子": "オオハシ キョウコ", "武田 勇": "タケダ イサム",
  "小松 和夫": "コマツ カズオ", "新井 秀樹": "アライ ヒデキ",
  "古川 弘": "フルカワ ヒロシ", "片山 ひさ": "カタヤマ ヒサ", "吉田 隆": "ヨシダ タカシ", "本田 誠一": "ホンダ セイイチ", "小島 昇": "コジマ ノボル",
  "広瀬 勉": "ヒロセ ツトム", "大野 恵子": "オオノ ケイコ", "藤田 静江": "フジタ シズエ", "西村 加代": "ニシムラ カヨ", "浅野 健": "アサノ ケン",
  "永井 光男": "ナガイ ミツオ", "上田 和也": "ウエダ カズヤ", "山口 正夫": "ヤマグチ マサオ", "石井 春子": "イシイ ハルコ", "河野 早苗": "コウノ サナエ",
  "福田 直人": "フクダ ナオト", "小野 さくら": "オノ サクラ", "増田 輝夫": "マスダ テルオ", "杉山 守": "スギヤマ マモル", "樋口 修": "ヒグチ オサム",
  "久保田 礼子": "クボタ レイコ", "安田 君子": "ヤスダ キミコ", "菅野 美智子": "カンノ ミチコ", "岡田 博": "オカダ ヒロシ", "中山 武": "ナカヤマ タケシ",
};

// ---------------------------------------------------------------------------
// Diseases: [傷病名コード, 傷病名, ICD-10] exactly as in the official 傷病名マスター (b_20260601)
// ---------------------------------------------------------------------------

const DX = {
  肺炎: ["4860030", "肺炎", "J189"],
  細菌性肺炎: ["4829003", "細菌性肺炎", "J159"],
  誤嚥性肺炎: ["5070003", "誤嚥性肺炎", "J690"],
  慢性閉塞性肺疾患: ["8840399", "慢性閉塞性肺疾患", "J449"],
  間質性肺炎: ["4860015", "間質性肺炎", "J849"],
  気管支喘息: ["4939008", "気管支喘息", "J459"],
  インフルエンザ: ["4871001", "インフルエンザ", "J111"],
  慢性呼吸不全: ["7991007", "慢性呼吸不全", "J9619"],
  慢性心不全: ["4289018", "慢性心不全", "I509"],
  うっ血性心不全: ["8830796", "うっ血性心不全", "I500"],
  労作性狭心症: ["8841212", "労作性狭心症", "I208"],
  心房細動: ["4273006", "心房細動", "I489"],
  発作性心房細動: ["8846942", "発作性心房細動", "I480"],
  胃潰瘍: ["5319009", "胃潰瘍", "K259"],
  総胆管結石: ["8836679", "総胆管結石", "K805"],
  急性胆管炎: ["5761006", "急性胆管炎", "K830"],
  急性膵炎: ["5770019", "急性膵炎", "K859"],
  大腸ポリープ: ["2113008", "大腸ポリープ", "K635"],
  結腸憩室炎: ["5621008", "結腸憩室炎", "K573"],
  肝硬変症: ["8831512", "肝硬変症", "K746"],
  尿路感染症: ["8838561", "尿路感染症", "N390"],
  急性腎盂腎炎: ["5901002", "急性腎盂腎炎", "N10"],
  脱水症: ["8837433", "脱水症", "E86"],
  下腿蜂巣炎: ["8831322", "下腿蜂巣炎", "L031"],
  大腿骨頚部骨折: ["8208009", "大腿骨頚部骨折", "S7200"],
  大腿骨転子部骨折: ["8837314", "大腿骨転子部骨折", "S7210"],
  腰椎圧迫骨折: ["8054003", "腰椎圧迫骨折", "S3200"],
  変形性膝関節症: ["7153018", "変形性膝関節症", "M171"],
  橈骨遠位端骨折: ["8838017", "橈骨遠位端骨折", "S5250"],
  腰部脊柱管狭窄症: ["7240012", "腰部脊柱管狭窄症", "M4806"],
  アテローム血栓性脳梗塞: ["8842255", "アテローム血栓性脳梗塞", "I633"],
  ラクナ梗塞: ["4341049", "ラクナ梗塞", "I638"],
  心原性脳塞栓症: ["8842272", "心原性脳塞栓症", "I634"],
  パーキンソン病: ["3320002", "パーキンソン病", "G20"],
  症候性てんかん: ["3458012", "症候性てんかん", "G408"],
  急性虫垂炎: ["5409005", "急性虫垂炎", "K358"],
  鼠径ヘルニア: ["5509004", "鼠径ヘルニア", "K409"],
  胆のう結石症: ["8837169", "胆のう結石症", "K802"],
  急性胆のう炎: ["8832408", "急性胆のう炎", "K810"],
  大腸癌: ["1539004", "大腸癌", "C189"],
  胃癌: ["1519006", "胃癌", "C169"],
  慢性腎臓病: ["8844106", "慢性腎臓病", "N189"],
  末期腎不全: ["8842116", "末期腎不全", "N185"],
  ネフローゼ症候群: ["5819004", "ネフローゼ症候群", "N049"],
  糖尿病性腎症: ["2503005", "糖尿病性腎症", "E142"],
  急性腎障害: ["8849597", "急性腎障害", "N288"],
  前立腺肥大症: ["8836591", "前立腺肥大症", "N40"],
  尿管結石症: ["8838506", "尿管結石症", "N201"],
  膀胱癌: ["1889005", "膀胱癌", "C679"],
  腎細胞癌: ["1890010", "腎細胞癌", "C64"],
  尿閉: ["7882002", "尿閉", "R33"],
  高血圧症: ["8833421", "高血圧症", "I10"],
  "２型糖尿病": ["2500015", "２型糖尿病", "E11"],
  脂質異常症: ["8844446", "脂質異常症", "E785"],
  便秘症: ["8840042", "便秘症", "K590"],
  不眠症: ["8839792", "不眠症", "G470"],
  骨粗鬆症: ["7330006", "骨粗鬆症", "M8199"],
  認知症: ["8842618", "認知症", "F03"],
  アルツハイマー型認知症: ["8842549", "アルツハイマー型認知症", "G309"],
  逆流性食道炎: ["5301002", "逆流性食道炎", "K210"],
  腎性貧血: ["2858001", "腎性貧血", "N19"],
} as const satisfies Record<string, readonly [code: string, name: string, icd10: string]>;

export type DxKey = keyof typeof DX;
/** The master entries used here (for the tests). */
export const WARD_CHART_DX: readonly (readonly [string, string, string])[] = Object.values(DX);

// ---------------------------------------------------------------------------
// The cases each department draws from
// ---------------------------------------------------------------------------

type Iv = "drip" | "acetate" | "ctrx" | "sbt" | "cez" | "cez1" | "frs";
type RxSpec = readonly [code: string, amount: number, timings: DoseTiming[]];
type DietSpec = Pick<DietOrder, "kind" | "staple" | "side" | "therapeutic" | "energyKcal" | "saltG" | "proteinG" | "dysphagia" | "thickness" | "npoReason" | "comment">;

interface Case {
  /** 入院時の診断 (as shown on the map and the list). */
  title: string;
  /** 主病名 first, then the problems that come with it. */
  dx: DxKey[];
  /** Days since admission: [fewest, most]. */
  stay: readonly [number, number];
  sex?: Sex;
  s: string;
  o: string;
  a: string;
  p: string;
  iv?: Iv[];
  rx?: RxSpec[];
  /** アセトアミノフェン 疼痛時. */
  prn?: boolean;
  diet: DietSpec;
  /** 絶食 at admission; the diet above from two days later. */
  npoFirst?: boolean;
  /** Lab values that differ from the reference ranges (all others are drawn inside them). */
  lab?: Record<string, number>;
  /** Extra tests ordered with the lab set (e.g. BNP). */
  labCodes?: string[];
  /** Body temperature at admission (℃), for a fever. */
  fever?: number;
  /** Oxygen by nasal cannula (L/分). */
  o2?: number;
  foley?: boolean;
  rehab?: RehabOrder["field"];
  /** The operation, done the day after admission unless the bed's note says when. */
  op?: string;
  /** Days after the operation the diet starts (1 when not given). */
  eatAfter?: number;
}

const REG: DietSpec = { kind: "常食", staple: "米飯", side: "常菜" };
const KAYU: DietSpec = { kind: "常食", staple: "全粥", side: "常菜" };
const SOFT: DietSpec = { kind: "嚥下調整食", dysphagia: "3", thickness: "薄いとろみ", staple: "全粥", side: "刻み" };
const HEART: DietSpec = { kind: "治療食", therapeutic: "TD-SALT-HEART", saltG: 6, staple: "米飯", side: "常菜" };
const KIDNEY: DietSpec = { kind: "治療食", therapeutic: "TD-KIDNEY", energyKcal: 1600, proteinG: 40, saltG: 6, staple: "米飯", side: "常菜" };
const DM: DietSpec = { kind: "治療食", therapeutic: "TD-ENERGY", energyKcal: 1600, staple: "米飯", side: "常菜" };

const CASES: Record<string, Case[]> = {
  呼吸器内科: [
    { title: "細菌性肺炎", dx: ["細菌性肺炎", "高血圧症"], stay: [2, 6], s: "3日前から咳と痰、昨日から発熱。", o: "右下肺に湿性ラ音。胸部X線で右下肺野に浸潤影。", a: "細菌性肺炎。", p: "抗菌薬と補液を開始。喀痰培養を提出。", iv: ["ctrx", "drip"], rx: [["ORAL-AMLO5", 1, ["朝"]]], diet: KAYU, lab: { WBC: 9800, Neut: 78, CRP: 4.6 }, fever: 38.4 },
    { title: "慢性閉塞性肺疾患の増悪", dx: ["慢性閉塞性肺疾患", "慢性呼吸不全", "不眠症"], stay: [4, 10], s: "1週間前から息切れが強くなった。", o: "呼気の延長と喘鳴あり。", a: "慢性閉塞性肺疾患の増悪。", p: "酸素吸入。SpO2 と呼吸数を見て流量を下げる。", o2: 1, rx: [["ORAL-LPZ15", 1, ["朝"]]], diet: REG, lab: { CRP: 1.2 } },
    { title: "誤嚥性肺炎", dx: ["誤嚥性肺炎", "認知症", "便秘症"], stay: [4, 12], s: "施設職員より：食事中のむせが増え、昨日から発熱。", o: "右下肺に湿性ラ音。", a: "誤嚥性肺炎。", p: "絶食で抗菌薬を開始。嚥下の評価のあと食事を再開。", iv: ["sbt", "drip"], rx: [["ORAL-MGO330", 1, ["朝", "昼", "夕"]]], diet: SOFT, npoFirst: true, lab: { WBC: 9200, CRP: 3.1, Alb: 3.2 }, fever: 38.2 },
    { title: "間質性肺炎", dx: ["間質性肺炎", "慢性呼吸不全", "逆流性食道炎"], stay: [7, 20], s: "労作時の息切れが続いている。", o: "両側背部に捻髪音。", a: "間質性肺炎。", p: "酸素吸入を続け、呼吸機能を見て在宅酸素を検討。", o2: 2, rx: [["ORAL-LPZ15", 1, ["朝"]]], diet: REG, lab: { CRP: 0.8, LDH: 248 } },
    { title: "気管支喘息発作", dx: ["気管支喘息", "脂質異常症"], stay: [2, 5], s: "夜間に咳と喘鳴が出て眠れない。", o: "両肺に呼気性喘鳴。", a: "気管支喘息発作。", p: "吸入と補液。発作が落ち着いたら退院を相談。", iv: ["drip"], rx: [["ORAL-ROSU25", 1, ["夕"]]], diet: REG },
  ],
  消化器内科: [
    { title: "胃潰瘍（出血）", dx: ["胃潰瘍", "高血圧症"], stay: [3, 8], s: "黒色便が2日続き、ふらつく。", o: "眼瞼結膜やや蒼白。上腹部に軽い圧痛。", a: "出血性胃潰瘍。内視鏡で止血済み。", p: "絶食と補液。止血を確かめてから食事を再開。", iv: ["drip"], rx: [["ORAL-LPZ15", 1, ["朝"]]], diet: { kind: "治療食", therapeutic: "TD-ULCER", staple: "全粥", side: "常菜" }, npoFirst: true, lab: { Hb: 10.2, BUN: 24 } },
    { title: "総胆管結石性胆管炎", dx: ["急性胆管炎", "総胆管結石", "２型糖尿病"], stay: [4, 9], s: "右上腹部の痛みと発熱、尿の色が濃い。", o: "右季肋部に圧痛。眼球結膜に軽い黄染。", a: "総胆管結石による急性胆管炎。入院2日目に内視鏡で結石を除去。", p: "抗菌薬を続け、採血を見て食事を上げる。", iv: ["ctrx", "drip"], rx: [["ORAL-MET250", 1, ["朝", "夕"]]], diet: DM, npoFirst: true, lab: { AST: 42, ALT: 48, CRP: 2.4, WBC: 8900 }, fever: 38.6 },
    { title: "大腸ポリープ（内視鏡的切除）", dx: ["大腸ポリープ", "脂質異常症"], stay: [1, 2], s: "検診の便潜血で精査。自覚症状なし。", o: "腹部は平坦・軟。", a: "大腸ポリープ。内視鏡で切除した。", p: "切除のあとの出血がないことを確かめて退院。", rx: [["ORAL-ROSU25", 1, ["夕"]]], diet: KAYU },
    { title: "急性膵炎", dx: ["急性膵炎", "脂質異常症"], stay: [4, 10], s: "上腹部から背中にかけての痛み。", o: "心窩部に圧痛。腸蠕動音は弱い。", a: "急性膵炎（軽症）。", p: "絶食と補液。痛みと AMY を見て膵臓食から再開。", iv: ["acetate"], prn: true, diet: { kind: "治療食", therapeutic: "TD-PANCREAS", energyKcal: 1400, staple: "全粥", side: "常菜" }, npoFirst: true, lab: { AMY: 186, CRP: 1.8 } },
    { title: "結腸憩室炎", dx: ["結腸憩室炎", "便秘症"], stay: [2, 5], s: "左下腹部の痛みと微熱。", o: "左下腹部に圧痛。反跳痛なし。", a: "結腸憩室炎。", p: "腸を休めて抗菌薬。痛みが引いたら食事を再開。", iv: ["sbt", "drip"], rx: [["ORAL-MGO330", 1, ["朝", "夕"]]], diet: KAYU, npoFirst: true, lab: { WBC: 9600, CRP: 3.8 }, fever: 37.8 },
    { title: "肝硬変症（腹水の増加）", dx: ["肝硬変症", "２型糖尿病", "便秘症"], stay: [7, 15], s: "お腹が張って体重が増えた。", o: "腹部膨満、波動あり。下腿浮腫あり。", a: "肝硬変症、腹水の増加。", p: "利尿薬を調整し、体重と尿量を見る。", rx: [["ORAL-SPL25", 1, ["朝"]], ["ORAL-FRS20", 1, ["朝"]], ["ORAL-MGO330", 1, ["朝", "昼", "夕"]]], diet: { kind: "治療食", therapeutic: "TD-LIVER", energyKcal: 1600, proteinG: 50, staple: "米飯", side: "常菜" }, lab: { Alb: 2.9, Plt: 9.8, AST: 38, NH3: 72 } },
  ],
  循環器内科: [
    { title: "慢性心不全の増悪", dx: ["慢性心不全", "心房細動", "高血圧症"], stay: [4, 12], s: "1週間で体重が3kg増え、横になると苦しい。", o: "両下腿に圧痕性浮腫。頸静脈怒張あり。", a: "慢性心不全の増悪。", p: "利尿薬を増やし、体重と尿量を毎日見る。", rx: [["ORAL-FRS20", 1, ["朝"]], ["ORAL-BISO25", 1, ["朝"]], ["ORAL-ENA5", 1, ["朝"]]], diet: HEART, lab: { BNP: 320 }, labCodes: ["LAB-BNP"] },
    { title: "労作性狭心症（冠動脈造影）", dx: ["労作性狭心症", "脂質異常症", "２型糖尿病"], stay: [1, 3], s: "坂道で胸が締めつけられる。休むと治まる。", o: "心雑音なし。下腿浮腫なし。", a: "労作性狭心症。冠動脈造影の目的で入院。", p: "造影のあと穿刺部と腎機能を見る。", rx: [["ORAL-AMLO5", 1, ["朝"]], ["ORAL-ROSU25", 1, ["夕"]]], diet: DM, lab: { Glu: 132 } },
    { title: "うっ血性心不全", dx: ["うっ血性心不全", "慢性腎臓病", "高血圧症"], stay: [2, 6], s: "数日前から息切れとむくみ。", o: "両下肺に湿性ラ音。両下腿浮腫。", a: "うっ血性心不全。", p: "利尿薬を静注。酸素は SpO2 を見て下げる。", iv: ["frs"], rx: [["ORAL-SPL25", 1, ["朝"]], ["ORAL-AMLO5", 1, ["朝"]]], o2: 1, diet: HEART, lab: { BNP: 540, Cre: 1.48, BUN: 26 }, labCodes: ["LAB-BNP"] },
    { title: "発作性心房細動", dx: ["発作性心房細動", "高血圧症"], stay: [2, 4], s: "動悸が半日続いた。", o: "脈は不整。心雑音なし。", a: "発作性心房細動。", p: "心拍数を調整し、心エコーで評価。", rx: [["ORAL-BISO25", 1, ["朝"]], ["ORAL-AMLO5", 1, ["朝"]]], diet: HEART },
  ],
  "総合診療科（B チーム）": [
    { title: "尿路感染症", dx: ["尿路感染症", "認知症", "便秘症"], stay: [2, 6], s: "家族より：昨日から元気がなく、熱がある。", o: "下腹部に軽い圧痛。CVA 叩打痛なし。", a: "尿路感染症。", p: "尿培養のあと抗菌薬。補液。", iv: ["ctrx", "drip"], rx: [["ORAL-MGO330", 1, ["朝", "夕"]]], diet: KAYU, lab: { WBC: 9400, CRP: 3.6 }, fever: 38.3 },
    { title: "誤嚥性肺炎", dx: ["誤嚥性肺炎", "アルツハイマー型認知症"], stay: [3, 9], s: "施設職員より：むせこみと発熱。", o: "右下肺に湿性ラ音。", a: "誤嚥性肺炎。", p: "絶食で抗菌薬。嚥下の評価を依頼。", iv: ["sbt", "drip"], rx: [["ORAL-DNP5", 1, ["朝"]]], diet: SOFT, npoFirst: true, lab: { WBC: 9100, CRP: 2.9, Alb: 3.1 }, fever: 38.0 },
    { title: "脱水症", dx: ["脱水症", "２型糖尿病"], stay: [1, 4], s: "数日前から食欲がなく、水分もとれていない。", o: "口腔内乾燥。皮膚のツルゴール低下。", a: "脱水症。", p: "補液。食事と水分の量を見る。", iv: ["acetate"], rx: [["ORAL-MET250", 1, ["朝", "夕"]]], diet: DM, lab: { BUN: 27, Cre: 1.05, Na: 146 } },
    { title: "下腿蜂巣炎", dx: ["下腿蜂巣炎", "高血圧症"], stay: [3, 7], s: "左下腿が赤く腫れて痛い。", o: "左下腿前面に発赤・熱感・圧痛。", a: "下腿蜂巣炎。", p: "抗菌薬。発赤の範囲をマーキングして見る。", iv: ["cez"], rx: [["ORAL-AMLO5", 1, ["朝"]]], diet: REG, lab: { WBC: 8800, CRP: 2.7 }, fever: 37.9 },
    { title: "急性腎盂腎炎", dx: ["急性腎盂腎炎", "骨粗鬆症"], stay: [2, 5], sex: "女", s: "悪寒を伴う発熱と右の腰の痛み。", o: "右 CVA 叩打痛あり。", a: "急性腎盂腎炎。", p: "尿培養・血液培養のあと抗菌薬。補液。", iv: ["ctrx", "drip"], diet: KAYU, lab: { WBC: 10200, CRP: 5.2 }, fever: 38.8 },
  ],
  整形外科: [
    { title: "大腿骨頚部骨折（人工骨頭挿入術後）", dx: ["大腿骨頚部骨折", "骨粗鬆症"], stay: [5, 14], s: "自宅で転倒し、右の股関節が痛くて立てない。", o: "右下肢の短縮と外旋。X線で右大腿骨頚部骨折。", a: "右大腿骨頚部骨折。", p: "入院翌日に人工骨頭挿入術。術後はリハビリ。", op: "人工骨頭挿入術", iv: ["cez1"], prn: true, rehab: "運動器", diet: REG, lab: { Hb: 10.8 } },
    { title: "腰椎圧迫骨折", dx: ["腰椎圧迫骨折", "骨粗鬆症", "便秘症"], stay: [7, 20], s: "尻もちをついてから腰が痛くて動けない。", o: "第1腰椎の棘突起に叩打痛。下肢の麻痺なし。", a: "腰椎圧迫骨折。", p: "コルセットを作り、痛みを見ながら離床とリハビリ。", rx: [["ORAL-LOX60", 1, ["朝", "昼", "夕"]], ["ORAL-REBA100", 1, ["朝", "昼", "夕"]], ["ORAL-MGO330", 1, ["朝", "夕"]]], rehab: "運動器", diet: REG },
    { title: "変形性膝関節症（人工膝関節置換術後）", dx: ["変形性膝関節症", "高血圧症"], stay: [4, 14], s: "右膝の痛みで歩くのがつらい。手術目的で入院。", o: "右膝の内反変形と可動域の制限。", a: "右変形性膝関節症。", p: "入院翌日に人工膝関節置換術。術後はリハビリ。", op: "人工膝関節置換術", iv: ["cez1"], prn: true, rx: [["ORAL-AMLO5", 1, ["朝"]]], rehab: "運動器", diet: REG, lab: { Hb: 11.6 } },
    { title: "大腿骨転子部骨折（骨接合術後）", dx: ["大腿骨転子部骨折", "認知症", "骨粗鬆症"], stay: [6, 18], s: "施設で転倒。左の股関節を痛がる。", o: "左股関節の運動時痛。X線で左大腿骨転子部骨折。", a: "左大腿骨転子部骨折。", p: "入院翌日に骨接合術。術後はリハビリ。", op: "骨接合術", iv: ["cez1"], prn: true, rehab: "運動器", diet: KAYU, lab: { Hb: 10.4, Alb: 3.3 } },
    { title: "腰部脊柱管狭窄症（除圧術後）", dx: ["腰部脊柱管狭窄症", "２型糖尿病"], stay: [3, 10], s: "歩くと脚がしびれて休み休みでないと歩けない。", o: "間欠性跛行。下肢筋力は保たれている。", a: "腰部脊柱管狭窄症。", p: "入院翌日に腰椎の除圧術。術後はリハビリ。", op: "腰椎の除圧術", iv: ["cez1"], prn: true, rx: [["ORAL-MET250", 1, ["朝", "夕"]]], rehab: "運動器", diet: DM },
    { title: "橈骨遠位端骨折（骨接合術後）", dx: ["橈骨遠位端骨折", "骨粗鬆症"], stay: [1, 3], s: "手をついて転び、左手首が痛い。", o: "左手関節の腫脹と変形。", a: "左橈骨遠位端骨折。", p: "入院翌日に骨接合術。腫れと指の動きを見る。", op: "骨接合術", iv: ["cez1"], prn: true, diet: REG },
  ],
  脳神経内科: [
    { title: "アテローム血栓性脳梗塞", dx: ["アテローム血栓性脳梗塞", "高血圧症", "脂質異常症"], stay: [7, 25], s: "家族より：朝から右手が使いにくく、言葉が出にくい。", o: "右上肢の軽い麻痺と構音障害。MRI で左大脳に梗塞巣。", a: "アテローム血栓性脳梗塞。", p: "リハビリ（PT・OT・ST）を続け、血圧を見る。", rx: [["ORAL-AMLO5", 1, ["朝"]], ["ORAL-ROSU25", 1, ["夕"]]], rehab: "脳血管疾患等", diet: KAYU },
    { title: "ラクナ梗塞", dx: ["ラクナ梗塞", "２型糖尿病"], stay: [5, 14], s: "左手足のしびれと力の入りにくさ。", o: "左上下肢の軽い麻痺。MRI で右放線冠に小さな梗塞巣。", a: "ラクナ梗塞。", p: "リハビリを続け、血糖を見る。", rx: [["ORAL-MET250", 1, ["朝", "夕"]]], rehab: "脳血管疾患等", diet: DM, lab: { Glu: 138 } },
    { title: "心原性脳塞栓症", dx: ["心原性脳塞栓症", "心房細動", "便秘症"], stay: [10, 28], s: "家族より：急に左の手足が動かなくなった。", o: "左片麻痺。MRI で右中大脳動脈の領域に梗塞巣。", a: "心原性脳塞栓症。", p: "リハビリ（PT・OT・ST）と、とろみ付きの食事。", rx: [["ORAL-BISO25", 1, ["朝"]], ["ORAL-MGO330", 1, ["朝", "夕"]]], rehab: "脳血管疾患等", diet: SOFT },
    { title: "パーキンソン病（症状の調整）", dx: ["パーキンソン病", "便秘症", "不眠症"], stay: [7, 20], s: "動きが遅くなり、薬が切れる時間が増えた。", o: "安静時振戦と筋強剛。小刻み歩行。", a: "パーキンソン病。", p: "持参薬の飲む時刻を調整し、リハビリで歩行を見る。", rx: [["ORAL-MGO330", 1, ["朝", "夕"]]], rehab: "脳血管疾患等", diet: REG },
    { title: "症候性てんかん", dx: ["症候性てんかん", "高血圧症"], stay: [2, 5], s: "家族より：1分ほど全身がけいれんした。", o: "来院時は意識清明。神経学的な異常なし。", a: "症候性てんかん（脳梗塞の後遺症のあと）。", p: "脳波を取り、発作がないか見る。", iv: ["drip"], rx: [["ORAL-AMLO5", 1, ["朝"]]], diet: REG },
  ],
  外科: [
    { title: "急性虫垂炎（腹腔鏡下虫垂切除術後）", dx: ["急性虫垂炎"], stay: [2, 4], s: "みぞおちの痛みが右下腹部に移ってきた。", o: "右下腹部に圧痛と反跳痛。CT で虫垂の腫大。", a: "急性虫垂炎。", p: "腹腔鏡下虫垂切除術。術後は抗菌薬と補液。", op: "腹腔鏡下虫垂切除術", iv: ["sbt", "acetate"], prn: true, diet: KAYU, lab: { WBC: 9800, CRP: 3.4 }, fever: 37.9 },
    { title: "胆のう結石症（腹腔鏡下胆のう摘出術後）", dx: ["胆のう結石症", "脂質異常症"], stay: [2, 5], s: "食後の右上腹部痛を何度か繰り返している。手術目的で入院。", o: "腹部は平坦・軟。", a: "胆のう結石症。", p: "入院翌日に腹腔鏡下胆のう摘出術。", op: "腹腔鏡下胆のう摘出術", iv: ["acetate"], prn: true, rx: [["ORAL-ROSU25", 1, ["夕"]]], diet: KAYU },
    { title: "急性胆のう炎", dx: ["急性胆のう炎", "高血圧症"], stay: [3, 7], s: "右上腹部の痛みと発熱。", o: "マーフィー徴候陽性。", a: "急性胆のう炎。", p: "絶食と抗菌薬。炎症が引いたら手術の時期を相談。", iv: ["sbt", "drip"], rx: [["ORAL-AMLO5", 1, ["朝"]]], diet: KAYU, npoFirst: true, lab: { WBC: 10400, CRP: 4.8 }, fever: 38.1 },
    { title: "鼠径ヘルニア（ヘルニア修復術後）", dx: ["鼠径ヘルニア", "高血圧症"], stay: [1, 3], s: "右の鼠径部のふくらみ。手術目的で入院。", o: "右鼠径部に還納できる膨隆。", a: "右鼠径ヘルニア。", p: "入院翌日にヘルニア修復術。", op: "鼠径ヘルニア修復術", iv: ["acetate"], prn: true, rx: [["ORAL-AMLO5", 1, ["朝"]]], diet: REG },
    { title: "大腸癌（腹腔鏡下結腸切除術後）", dx: ["大腸癌", "高血圧症", "２型糖尿病"], stay: [6, 14], s: "便潜血陽性で見つかった。手術目的で入院。", o: "腹部は平坦・軟。", a: "大腸癌。", p: "入院翌日に腹腔鏡下結腸切除術。術後は食事を段階的に上げる。", op: "腹腔鏡下結腸切除術", eatAfter: 2, iv: ["acetate"], prn: true, rx: [["ORAL-AMLO5", 1, ["朝"]], ["ORAL-MET250", 1, ["朝", "夕"]]], diet: KAYU, lab: { Hb: 11.2 } },
    { title: "胃癌（腹腔鏡下幽門側胃切除術後）", dx: ["胃癌", "逆流性食道炎"], stay: [7, 16], s: "検診の内視鏡で見つかった。手術目的で入院。", o: "腹部は平坦・軟。", a: "胃癌。", p: "入院翌日に腹腔鏡下幽門側胃切除術。術後は分割食。", op: "腹腔鏡下幽門側胃切除術", eatAfter: 3, iv: ["acetate"], prn: true, rx: [["ORAL-LPZ15", 1, ["朝"]]], diet: { kind: "常食", staple: "五分粥", side: "一口大", comment: "1日6回の分割食" }, lab: { Hb: 11.4, Alb: 3.4 } },
  ],
  腎臓内科: [
    { title: "慢性腎臓病（腎機能低下の精査）", dx: ["慢性腎臓病", "腎性貧血", "高血圧症"], stay: [5, 12], s: "健診で腎機能の低下を指摘された。", o: "両下腿に軽い浮腫。", a: "慢性腎臓病。", p: "腎臓食と血圧の調整。腎機能の推移を見る。", rx: [["ORAL-AMLO5", 1, ["朝"]]], diet: KIDNEY, lab: { Cre: 2.38, BUN: 34, Hb: 10.6, K: 4.9 } },
    { title: "ネフローゼ症候群", dx: ["ネフローゼ症候群", "脂質異常症"], stay: [7, 20], s: "まぶたと足のむくみが続いている。", o: "眼瞼と両下腿の浮腫。", a: "ネフローゼ症候群。", p: "腎生検の結果を待ち、治療を決める。", rx: [["ORAL-FRS20", 1, ["朝"]], ["ORAL-ROSU25", 1, ["夕"]]], diet: KIDNEY, lab: { Alb: 2.4, TC: 312 } },
    { title: "糖尿病性腎症", dx: ["糖尿病性腎症", "２型糖尿病", "高血圧症"], stay: [5, 14], s: "むくみと血糖の悪化。", o: "両下腿浮腫。", a: "糖尿病性腎症。", p: "腎臓食と血糖・血圧の調整。", rx: [["ORAL-AMLO5", 1, ["朝"]]], diet: KIDNEY, lab: { Cre: 1.86, BUN: 30, Glu: 168, HbA1c: 7.8 } },
    { title: "急性腎障害（脱水）", dx: ["急性腎障害", "脱水症"], stay: [3, 8], s: "下痢が続き、尿が少ない。", o: "口腔内乾燥。", a: "脱水による急性腎障害。", p: "補液。尿量と腎機能を見る。", iv: ["acetate"], diet: REG, lab: { Cre: 1.62, BUN: 32 } },
    { title: "尿路感染症", dx: ["尿路感染症", "慢性腎臓病"], stay: [2, 6], s: "発熱と排尿時の痛み。", o: "恥骨上部に圧痛。", a: "尿路感染症。", p: "尿培養のあと抗菌薬。腎機能を見て量を決める。", iv: ["ctrx", "drip"], diet: KIDNEY, lab: { WBC: 9300, CRP: 3.2, Cre: 1.44 }, fever: 38.2 },
  ],
  泌尿器科: [
    { title: "前立腺肥大症（経尿道的前立腺切除術後）", dx: ["前立腺肥大症", "高血圧症"], stay: [2, 6], sex: "男", s: "尿が出にくく、夜に何度も起きる。手術目的で入院。", o: "直腸診で前立腺の腫大。", a: "前立腺肥大症。", p: "入院翌日に経尿道的前立腺切除術。尿カテーテルは血尿を見て抜く。", op: "経尿道的前立腺切除術", iv: ["cez1", "acetate"], foley: true, rx: [["ORAL-AMLO5", 1, ["朝"]]], diet: REG },
    { title: "尿管結石症（経尿道的尿管砕石術後）", dx: ["尿管結石症"], stay: [1, 3], s: "右の脇腹から下腹部への強い痛み。", o: "右 CVA 叩打痛。CT で右尿管に結石。", a: "右尿管結石症。", p: "入院翌日に経尿道的尿管砕石術。痛み止めを使う。", op: "経尿道的尿管砕石術", iv: ["acetate"], prn: true, diet: REG },
    { title: "膀胱癌（経尿道的膀胱腫瘍切除術後）", dx: ["膀胱癌", "高血圧症"], stay: [2, 5], s: "肉眼的血尿で見つかった。手術目的で入院。", o: "腹部は平坦・軟。", a: "膀胱癌。", p: "入院翌日に経尿道的膀胱腫瘍切除術。", op: "経尿道的膀胱腫瘍切除術", iv: ["acetate"], foley: true, rx: [["ORAL-AMLO5", 1, ["朝"]]], diet: REG },
    { title: "急性腎盂腎炎", dx: ["急性腎盂腎炎", "便秘症"], stay: [2, 5], sex: "女", s: "悪寒と発熱、左の腰の痛み。", o: "左 CVA 叩打痛あり。", a: "急性腎盂腎炎。", p: "尿培養のあと抗菌薬。補液。", iv: ["ctrx", "drip"], diet: KAYU, lab: { WBC: 10800, CRP: 6.1 }, fever: 38.9 },
    { title: "腎細胞癌（腹腔鏡下腎摘除術後）", dx: ["腎細胞癌", "高血圧症"], stay: [4, 9], s: "健診の腹部エコーで右の腎臓の腫瘤を指摘された。手術目的で入院。", o: "腹部は平坦・軟。", a: "右腎細胞癌。", p: "入院翌日に腹腔鏡下腎摘除術。", op: "腹腔鏡下腎摘除術", iv: ["acetate"], prn: true, rx: [["ORAL-AMLO5", 1, ["朝"]]], diet: REG, lab: { Cre: 1.12 } },
    { title: "尿閉", dx: ["尿閉", "前立腺肥大症", "便秘症"], stay: [2, 6], sex: "男", s: "昨夜から尿が出ない。", o: "下腹部の膨隆。導尿で 800mL。", a: "前立腺肥大症による尿閉。", p: "尿カテーテルを留置。抜く日を相談。", foley: true, rx: [["ORAL-MGO330", 1, ["朝", "夕"]]], diet: REG },
  ],
};

/** 腎臓内科「透析導入」: one case of its own. */
const DIALYSIS_START: Case = {
  title: "末期腎不全（血液透析導入）",
  dx: ["末期腎不全", "腎性貧血", "高血圧症"],
  stay: [3, 7],
  s: "倦怠感と食欲の低下、むくみが強くなった。",
  o: "両下腿浮腫。左前腕に内シャントあり（作成済み）。",
  a: "末期腎不全。",
  p: "血液透析を導入する。導入の日程と条件は腎臓内科と透析室で決める。",
  rx: [["ORAL-AMLO5", 1, ["朝"]]],
  diet: KIDNEY,
  lab: { Cre: 6.42, BUN: 62, K: 5.1, Hb: 9.4 },
};

/** 呼吸器内科「飛沫予防策」. */
const INFLUENZA: Case = {
  title: "インフルエンザ",
  dx: ["インフルエンザ", "慢性閉塞性肺疾患"],
  stay: [1, 3],
  s: "昨日からの高熱と咳、関節の痛み。",
  o: "咽頭発赤。迅速抗原検査で A 型陽性。",
  a: "インフルエンザ。慢性閉塞性肺疾患があるため入院。",
  p: "個室で飛沫予防策。抗インフルエンザ薬と補液。",
  iv: ["drip"],
  diet: KAYU,
  lab: { CRP: 2.2 },
  fever: 38.7,
};

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

function ivOrder(kind: Iv, start: { day: number; time: string }): Order {
  const base = { type: "injection" as const, route: "点滴静注" as const, start };
  switch (kind) {
    case "drip":
      return { ...base, items: [{ drugCode: "INJ-SOL3A500", amount: 500, unit: "mL" }], schedule: { kind: "per_day", count: 2 }, rateMlPerH: 42, days: 3 };
    case "acetate":
      return { ...base, items: [{ drugCode: "INJ-VEENF500", amount: 500, unit: "mL" }], schedule: { kind: "per_day", count: 2 }, rateMlPerH: 42, days: 3 };
    case "ctrx":
      return { ...base, items: [{ drugCode: "INJ-CTRX1", amount: 2, unit: "g" }, { drugCode: "INJ-NS100", amount: 100, unit: "mL" }], schedule: { kind: "every_hours", hours: 24 }, minutesPerDose: 30, days: 7 };
    case "sbt":
      return { ...base, items: [{ drugCode: "INJ-SBTABPC3", amount: 3, unit: "g" }, { drugCode: "INJ-NS100", amount: 100, unit: "mL" }], schedule: { kind: "every_hours", hours: 6 }, minutesPerDose: 30, days: 7 };
    case "cez":
      return { ...base, items: [{ drugCode: "INJ-CEZ1", amount: 2, unit: "g" }, { drugCode: "INJ-NS100", amount: 100, unit: "mL" }], schedule: { kind: "every_hours", hours: 8 }, minutesPerDose: 30, days: 7 };
    case "cez1":
      return { ...base, items: [{ drugCode: "INJ-CEZ1", amount: 1, unit: "g" }, { drugCode: "INJ-NS100", amount: 100, unit: "mL" }], schedule: { kind: "every_hours", hours: 8 }, minutesPerDose: 30, days: 2, comment: "術後の感染予防" };
    case "frs":
      return { type: "injection", route: "静注", start, items: [{ drugCode: "INJ-FRS20", amount: 20, unit: "mg" }], schedule: { kind: "per_day", count: 1 }, days: 3 };
  }
}

const mealAfter = (day: number, time: string): { day: number; meal: Meal } => {
  const t = minutes(time);
  if (t < minutes("07:00")) return { day, meal: "朝" };
  if (t < minutes("11:30")) return { day, meal: "昼" };
  if (t < minutes("17:00")) return { day, meal: "夕" };
  return { day: day + 1, meal: "朝" };
};

// ---------------------------------------------------------------------------
// One chart
// ---------------------------------------------------------------------------

export interface WardChart {
  patient: Patient;
  diagnoses: Diagnosis[];
  diets: DietOrder[];
}

/** The chart's patient number: 9003 + room + bed (A=1 … D=4, a private room 0). 9001・9002 are taken. */
export const chartIdOf = (room: string, bed: string): string => `9003${room}${bed ? "ABCD".indexOf(bed) + 1 : 0}`;

/** What the bed's note says, read as facts of the record. */
interface NoteFacts {
  newToday: boolean;
  homeTomorrow: boolean;
  examTomorrow: boolean;
  falls: boolean;
  oxygen: boolean;
  droplet: boolean;
  rehab: boolean;
  /** Days since the operation (術後◯日目), or "some days" (術後). */
  afterOp: number | "days" | null;
  opTomorrow: boolean;
  dialysis: boolean;
}

function readNote(note = ""): NoteFacts {
  const n = note.match(/術後(\d+)日目/);
  return {
    newToday: note.includes("新入院"),
    homeTomorrow: note.includes("明日退院"),
    examTomorrow: note.includes("検査予定"),
    falls: note.includes("転倒注意"),
    oxygen: note.includes("酸素投与中"),
    droplet: note.includes("飛沫予防策"),
    rehab: note.includes("リハビリ中"),
    afterOp: n ? Number(n[1]) : note.includes("術後") ? "days" : null,
    opTomorrow: note.includes("明日手術"),
    dialysis: note.includes("透析導入"),
  };
}

function chooseCase(o: OtherPatient, facts: NoteFacts, nth: number): Case {
  if (facts.dialysis) return DIALYSIS_START;
  if (facts.droplet) return INFLUENZA;
  const all = (CASES[o.department] ?? CASES["総合診療科（B チーム）"]).filter((c) => !c.sex || c.sex === o.sex);
  const fit = all.filter((c) => {
    if (facts.afterOp !== null || facts.opTomorrow) return !!c.op;
    if (facts.rehab) return !!c.rehab;
    if (facts.oxygen) return c.dx[0] !== "気管支喘息";
    return true;
  });
  const list = fit.length ? fit : all;
  // The n-th patient of a department takes the n-th case (from a fixed start per department), so the
  // department's patients do not all have the same disease.
  return list[(nth + seedOf(o.department)) % list.length];
}

const BLOOD = [
  ["A", 4],
  ["O", 3],
  ["B", 2],
  ["AB", 1],
] as const;

function bloodOf(r: Rand): NonNullable<Patient["blood"]> {
  let x = r() * 10;
  for (const [abo, w] of BLOOD) {
    if ((x -= w) < 0) return { abo, rh: "+", checks: 2, antibody: "陰性" };
  }
  return { abo: "A", rh: "+", checks: 2, antibody: "陰性" };
}

/** Lab values inside (or near) the 共用基準範囲 of master.ts, then the case's own values. */
function labValues(r: Rand, sex: Sex, age: number, own: Record<string, number> = {}): Record<string, number> {
  const male = sex === "男";
  const old = age >= 75;
  const v: Record<string, number> = {
    WBC: Math.round(between(r, 4300, 7800, 0) / 100) * 100,
    Neut: between(r, 50, 70, 0),
    Hb: male ? between(r, old ? 12.8 : 13.6, 15.6, 1) : between(r, old ? 11.4 : 11.8, 13.8, 1),
    Plt: between(r, 16, 30, 1),
    CRP: between(r, 0.05, 0.4, 2),
    AST: between(r, 15, 29, 0),
    ALT: between(r, male ? 11 : 8, male ? 30 : 22, 0),
    BUN: between(r, 10, old ? 22 : 19, 0),
    Cre: male ? between(r, 0.7, 1.05, 2) : between(r, 0.5, 0.78, 2),
    Na: between(r, 138, 143, 0),
    K: between(r, 3.7, 4.6, 1),
    Alb: between(r, old ? 3.5 : 3.8, 4.4, 1),
  };
  return { ...v, ...own };
}

interface Vit {
  day: number;
  time: string;
  bt: number;
  hr: number;
  sbp: number;
  dbp: number;
  rr: number;
  spo2: number;
}

function chartFor(b: BedAssignment, nth: number): WardChart | null {
  const o = b.other;
  if (!o) return null;
  const id = chartIdOf(b.room, b.bed);
  const r = rand(seedOf(`${b.room}-${b.bed}-${o.name}`));
  const facts = readNote(o.note);
  const c = chooseCase(o, facts, nth);
  const attending = doctorFor(o.department);
  const ward = floorOf(b.room).replace("病棟", "");

  // When: the stay, the operation, and the clock time of admission.
  let stay = int(r, c.stay[0], c.stay[1]);
  // Going home tomorrow: at the end of the case's usual stay.
  if (facts.homeTomorrow) stay = c.stay[1];
  if (facts.examTomorrow) stay = int(r, 1, 3);
  if (facts.opTomorrow) stay = int(r, 1, 2);
  if (facts.rehab) stay = Math.max(stay, int(r, 14, 24));
  // A planned operation is done the day after admission (so at least yesterday when it is already done).
  if (c.op && !facts.opTomorrow) stay = Math.max(stay, 2);
  if (typeof facts.afterOp === "number") stay = facts.afterOp + 1;
  else if (facts.afterOp === "days") stay = int(r, 4, 7);
  if (facts.newToday) stay = 0;
  const admittedOn = -Math.min(stay, 30) || 0;
  const opDay: number | null = c.op && !facts.opTomorrow ? admittedOn + 1 : null;
  const admTime = facts.newToday ? "01:30" : c.op ? "10:00" : pick(r, ["10:30", "11:00", "13:30", "14:00", "15:30"]);
  const plannedOp = facts.opTomorrow ? c.op ?? "手術" : null;
  const title = plannedOp ? `${c.title.replace(/（[^（]*）$/, "")}（${plannedOp}の予定）` : c.title;

  const o2 = c.o2 ?? (facts.oxygen ? 2 : undefined);
  const o2Text = o2 ? `鼻カニュラ ${o2}L` : "室内気";
  const male = o.sex === "男";
  const heightCm = male ? int(r, o.age >= 80 ? 155 : 160, o.age >= 80 ? 168 : 176) : int(r, o.age >= 80 ? 140 : 148, o.age >= 80 ? 155 : 162);
  const weightKg = Math.round(((heightCm / 100) ** 2 * between(r, 18.5, 25, 1)) * 10) / 10;

  // Vitals: on admission, the afternoon before (when in hospital), and this morning.
  const base = { bt: between(r, 36.3, 36.9, 1), hr: int(r, 64, 84), sbp: int(r, 112, 138), dbp: int(r, 62, 80), rr: int(r, 14, 18), spo2: o2 ? int(r, 94, 96) : int(r, 96, 98) };
  const atAdmission: Vit = { day: admittedOn, time: later(admTime, 5), ...base, bt: c.fever ?? base.bt, hr: c.fever ? base.hr + 14 : base.hr, rr: c.fever ? base.rr + 2 : base.rr };
  const easing = (d: number) => (c.fever ? Number(Math.max(base.bt, c.fever - 0.6 * (d - admittedOn + 1)).toFixed(1)) : base.bt);
  const series: Vit[] = [atAdmission];
  if (admittedOn <= -2) series.push({ day: -1, time: "14:00", ...base, bt: easing(-1), hr: base.hr + int(r, -4, 4) });
  if (admittedOn === -1 && minutes(admTime) < minutes("18:00")) series.push({ day: -1, time: "20:00", ...base, bt: easing(-1) });
  series.push({ day: 0, time: "06:00", ...base, bt: easing(0), hr: base.hr + int(r, -3, 3), sbp: base.sbp + int(r, -6, 6) });
  const vitals: VitalSign[] = series.map((v) => ({ ...v, o2: o2Text, avpu: "A" }));
  const adm = vitals[0];

  // One lab set: on admission when it was today or yesterday, else a recent morning.
  const morning = pick(r, [-1, -2, 0]);
  const labDay = admittedOn >= -1 || morning <= admittedOn ? admittedOn : morning;
  const labTime = labDay === admittedOn ? later(admTime, 10) : "06:00";
  const labs: LabResult[] = [{ day: labDay, time: labTime, values: labValues(r, o.sex, o.age, c.lab) }];

  // Orders.
  let n = 0;
  const entry = (day: number, time: string, order: Order, status: OrderEntry["status"] = "有効"): OrderEntry => ({ kind: "order", id: `${id}-o${++n}`, day, time, author: attending, status, order });
  const orderTime = later(admTime, 15);
  const orders: OrderEntry[] = [];
  const onAdmission = labDay === admittedOn;
  orders.push(
    entry(onAdmission ? admittedOn : labDay - 1, onAdmission ? orderTime : "15:00", { type: "lab", codes: [onAdmission ? "SET-ADMIT" : "SET-ROUTINE", ...(c.labCodes ?? [])], collect: { day: labDay, time: labTime }, priority: onAdmission ? "至急" : "定時" }, "実施済"),
  );
  // After an operation, its orders are written on the operation day after it (14:40).
  const afterOp = opDay !== null ? { day: opDay, time: "14:40" } : { day: admittedOn, time: orderTime };
  const ivStart = { day: afterOp.day, time: opDay !== null ? "15:00" : later(admTime, 30) };
  // Fluids and antibiotics run for a few days; on a longer stay they are over (still in the record).
  for (const k of c.iv ?? []) orders.push(entry(afterOp.day, afterOp.time, ivOrder(k, ivStart)));
  // 持参薬 from the first dose after admission (the next day, unless admitted in the night).
  const rxDay = minutes(admTime) < minutes("07:00") ? admittedOn : admittedOn + 1;
  for (const [drugCode, amount, timings] of c.rx ?? [])
    orders.push(entry(admittedOn, orderTime, { type: "prescription", category: "持参薬", drugCode, amount, unit: "錠", timings, start: { day: rxDay, timing: timings[0] } }));
  if (c.prn) orders.push(entry(afterOp.day, afterOp.time, { type: "prescription", category: "臨時", drugCode: "ORAL-APAP500", amount: 1, unit: "錠", timings: [], prn: "疼痛時", maxPerDay: 3, start: { day: afterOp.day }, days: 5 }));
  if (o2) orders.push(entry(admittedOn, orderTime, { type: "procedure", code: "PROC-O2", o2: { device: "鼻カニュラ", lpm: o2 }, schedule: { kind: "continuous" }, start: { day: admittedOn, time: later(admTime, 20) } }));
  if (c.foley) orders.push(entry(afterOp.day, afterOp.time, { type: "procedure", code: "PROC-FOLEY", schedule: { kind: "continuous" }, start: { day: afterOp.day, time: opDay !== null ? "14:40" : later(admTime, 20) } }));
  if (c.rehab || facts.rehab) {
    const from = opDay !== null ? opDay + 1 : admittedOn + 1;
    if (from <= 0)
      orders.push(entry(from - 1 >= admittedOn ? from - 1 : admittedOn, "16:00", { type: "procedure", code: "PROC-REHAB", rehab: { field: c.rehab ?? "脳血管疾患等", therapists: c.rehab === "運動器" ? ["PT"] : ["PT", "OT", "ST"], onset: opDay ?? admittedOn, goal: "自宅への退院", cautions: c.op ? "術後の禁忌肢位を守る" : "血圧の変動に注意" }, schedule: { kind: "per_day", count: 1 }, start: { day: from } }));
  }
  if (facts.examTomorrow) {
    const test = o.department === "循環器内科" ? "PHY-UCG" : o.department === "消化器内科" ? "PHY-EGD" : "PHY-ABDUS";
    orders.push(entry(-1, "16:00", { type: "physio", test, purpose: `${title}の評価`, when: { day: 1, time: test === "PHY-UCG" ? "10:00" : "09:30", priority: "予約" }, place: test === "PHY-UCG" ? "ベッドサイド" : "検査室", ...(test === "PHY-UCG" ? {} : { transport: "車椅子" as const }) }));
  }
  if (facts.homeTomorrow) {
    const plan = WARD_PLANS.find((p) => p.kind === "退院" && p.room === b.room && p.bed === b.bed);
    const time = plan?.time ?? "10:00";
    orders.push(entry(-1, "11:00", { type: "procedure", code: "PROC-LEAVE", leave: { kind: "退院", from: { day: 1, time }, destination: "自宅", note: "" }, schedule: { kind: "once" }, start: { day: 1, time } }));
  }

  // Notes: the attending's admission note, the operation, and the plan for tomorrow.
  const notes: HistoryEntry[] = [];
  const plan = [plannedOp ? "手術目的で入院。" : c.p, facts.homeTomorrow ? "経過は良好で、明日退院の予定。" : "", facts.examTomorrow ? "明日、検査の予定。" : "", plannedOp ? `明日 ${plannedOp}の予定。前日21時以降は絶食。` : ""].filter(Boolean).join("");
  notes.push({
    kind: "note",
    day: admittedOn,
    time: later(admTime, 10),
    author: attending,
    role: "医師",
    soap: { s: c.s, o: `BT ${adm.bt?.toFixed(1)}℃、BP ${adm.sbp}/${adm.dbp}、HR ${adm.hr}、SpO2 ${adm.spo2}%（${adm.o2}）。${c.o}`, a: c.a, p: plan },
  });
  if (opDay !== null && c.op) notes.push({ kind: "note", day: opDay, time: "14:30", author: attending, role: "医師", text: `${c.op}を行った。出血は少量、術中の合併症なし。術後の指示はオーダのとおり。` });
  if (facts.homeTomorrow) notes.push({ kind: "note", day: -1, time: "11:00", author: attending, role: "医師", text: "本人と家族に経過と退院後の生活を説明し、明日の退院で了承を得た。" });
  if (facts.falls) notes.push({ kind: "note", day: admittedOn, time: later(admTime, 40), author: "看護師（架空）", role: "看護師", text: "転倒転落のリスク評価：高。ベッドは低床、センサーマットを使う。" });
  const history = [...notes, ...orders].sort((a, b2) => a.day - b2.day || a.time.localeCompare(b2.time));

  // Problems: 主病名 and the rest, all from the admission day.
  const diagnoses: Diagnosis[] = c.dx.map((k, i) => {
    const [code, name, icd10] = DX[k];
    return { id: `${id}-d${i + 1}`, code, name, icd10, prefixes: [], suffixes: [], main: i === 0, start: admittedOn, outcome: "継続" };
  });

  // Diet: 絶食 first where the case starts with it (and the operation day), then the case's diet.
  const diets: DietOrder[] = [];
  const firstMeal = mealAfter(admittedOn, admTime);
  const addDiet = (i: number, from: { day: number; meal: Meal }, spec: DietSpec, day: number, time: string) => diets.push({ id: `diet-${id}-${i}`, patientId: id, from, ...spec, by: attending, at: { day, time } });
  const resume = Math.min(admittedOn + 2, 0);
  if (c.npoFirst && resume > admittedOn) {
    addDiet(1, firstMeal, { kind: "絶食", npoReason: `${title}。評価のため` }, admittedOn, admTime);
    addDiet(2, { day: resume, meal: "昼" }, c.diet, resume - 1, "16:00");
  } else if (c.npoFirst) {
    addDiet(1, firstMeal, { kind: "絶食", npoReason: `${title}。評価のため` }, admittedOn, admTime);
  } else if (opDay !== null) {
    addDiet(1, firstMeal, c.diet, admittedOn, admTime);
    addDiet(2, { day: opDay, meal: "朝" }, { kind: "絶食", npoReason: "手術のため" }, opDay - 1, "16:00");
    const eat = opDay + (c.eatAfter ?? 1);
    if (eat <= 0) addDiet(3, { day: eat, meal: "昼" }, c.diet, eat - 1, "16:00");
  } else {
    addDiet(1, firstMeal, c.diet, admittedOn, admTime);
  }
  if (plannedOp) addDiet(4, { day: 1, meal: "朝" }, { kind: "絶食", npoReason: `${plannedOp}のため（前日21時以降）` }, admittedOn, admTime);
  if (facts.examTomorrow && o.department === "消化器内科") {
    addDiet(5, { day: 1, meal: "朝" }, { kind: "絶食", npoReason: "上部消化管内視鏡のため" }, -1, "16:00");
    addDiet(6, { day: 1, meal: "昼" }, c.diet, -1, "16:00");
  }

  const allergies = r() < 0.12 ? [pick(r, ["ヨード造影剤（蕁麻疹）", "テープかぶれ"])] : [];
  const patient: Patient = {
    id,
    name: o.name,
    kana: KANA[o.name] ?? o.name,
    sex: o.sex,
    age: o.age,
    ward,
    room: b.room,
    department: o.department,
    attending,
    admittedOn,
    admissionDiagnosis: title,
    heightCm,
    weightKg,
    allergies,
    blood: bloodOf(r),
    infections: facts.droplet ? ["インフルエンザ A 型（飛沫予防策）"] : [],
    cautions: facts.falls ? ["転倒注意"] : [],
    history,
    labs,
    cultures: [],
    imaging: [],
    vitals,
    // Yesterday's meals (the staple eaten, in tenths), or 絶食.
    daily: admittedOn <= -2 ? [{ day: -1, meals: dietAt(diets, id, -1, "昼")?.kind === "絶食" ? "絶食" : [int(r, 6, 10), int(r, 5, 10), int(r, 6, 10)] }] : [],
  };
  return { patient, diagnoses, diets };
}

// ---------------------------------------------------------------------------
// Every bed of another team, on every floor
// ---------------------------------------------------------------------------

/** Makes the charts (the same ones on every call). */
export function buildWardCharts(): WardChart[] {
  const nth: Record<string, number> = {};
  return [...BEDS, ...OTHER_FLOOR_BEDS].flatMap((b) => {
    if (!b.other || b.patientId) return [];
    const dept = b.other.department;
    nth[dept] = (nth[dept] ?? -1) + 1;
    return chartFor(b, nth[dept]) ?? [];
  });
}

export const WARD_CHARTS: WardChart[] = buildWardCharts();
export const WARD_CHART_PATIENTS: Patient[] = WARD_CHARTS.map((c) => c.patient);
export const WARD_CHART_DIAGNOSES: Record<string, Diagnosis[]> = Object.fromEntries(WARD_CHARTS.map((c) => [c.patient.id, c.diagnoses]));
export const WARD_CHART_DIETS: DietOrder[] = WARD_CHARTS.flatMap((c) => c.diets);
const IDS = new Set(WARD_CHART_PATIENTS.map((p) => p.id));

/** A patient whose chart is one of these minimal fictional charts. */
export const isWardChart = (patientId: string) => IDS.has(patientId);

/** The beds with each other-team patient linked to their chart (the bed keeps the placeholder too). */
export function withCharts(beds: BedAssignment[]): BedAssignment[] {
  return beds.map((b) => {
    if (b.patientId || !b.other) return b;
    const id = chartIdOf(b.room, b.bed);
    return IDS.has(id) ? { ...b, patientId: id } : b;
  });
}
