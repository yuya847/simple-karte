// 点数で数えるスコア。項目ごとの点はコードが出し、選ばれていない項目は「未選択」として合計を出さない。
// 重症度の区分や、そのあと何をするかは画面に出さない（決めるのは医師）。

/** 1つの項目：points が null は未選択・値なし。UN（NIHSS の評価できない項目）は points 0・un true。 */
export interface Criterion {
  key: string;
  label: string;
  points: number | null;
  un?: boolean;
}
export interface ScoreSum {
  items: Criterion[];
  /** 全項目がそろったときだけの合計。 */
  total: number | null;
  /** 選んだ項目だけの計（途中経過）。 */
  sum: number;
  missing: string[];
}

export function sumOf(items: Criterion[]): ScoreSum {
  const missing = items.filter((i) => i.points === null).map((i) => i.label);
  const sum = items.reduce((s, i) => s + (i.points ?? 0), 0);
  return { items, total: missing.length ? null : sum, sum, missing };
}

const has = (n: number | null | undefined): n is number => n !== null && n !== undefined && Number.isFinite(n);
const flag = (b: boolean | null, points = 1): number | null => (b === null ? null : b ? points : 0);
const atLeast = (n: number | null, limit: number) => (has(n) ? (n >= limit ? 1 : 0) : null);
const atMost = (n: number | null, limit: number) => (has(n) ? (n <= limit ? 1 : 0) : null);

// ---------------------------------------------------------------------------
// GCS：Teasdale G, Jennett B. Assessment of coma and impaired consciousness. A practical scale. Lancet 1974;2:81-84。
// NT（評価できない）：Teasdale G ほか. The Glasgow Coma Scale at 40 years. Lancet Neurol 2014;13:844-854。
// ---------------------------------------------------------------------------

export type GcsPart = "e" | "v" | "m";
export const GCS_OPTIONS: Record<GcsPart, { value: string; label: string }[]> = {
  e: [
    { value: "4", label: "自発的に開眼" },
    { value: "3", label: "呼びかけで開眼" },
    { value: "2", label: "痛み刺激で開眼" },
    { value: "1", label: "開眼しない" },
    { value: "NT", label: "評価できない" },
  ],
  v: [
    { value: "5", label: "見当識あり" },
    { value: "4", label: "混乱した会話" },
    { value: "3", label: "不適当な言葉" },
    { value: "2", label: "意味のない発声" },
    { value: "1", label: "発声なし" },
    { value: "NT", label: "評価できない" },
  ],
  m: [
    { value: "6", label: "命令に従う" },
    { value: "5", label: "痛みの部位に手が来る" },
    { value: "4", label: "痛みから逃げる（屈曲）" },
    { value: "3", label: "異常屈曲" },
    { value: "2", label: "伸展" },
    { value: "1", label: "動かない" },
    { value: "NT", label: "評価できない" },
  ],
};

/** E・V・M（"NT" を含む）。どれかが NT・未選択なら合計は出さない。 */
export function gcs(e: string | null, v: string | null, m: string | null): { total: number | null; text: string } {
  const parts = [e, v, m];
  const text = `E${e ?? "—"}V${v ?? "—"}M${m ?? "—"}`;
  return { total: parts.every((p) => p !== null && /^\d$/.test(p)) ? parts.reduce((s, p) => s + Number(p), 0) : null, text };
}

// ---------------------------------------------------------------------------
// NIHSS（15項目、0〜42点）：NIH Stroke Scale（NINDS）https://www.ninds.nih.gov/health-information/stroke/assess-and-treat/nih-stroke-scale
// Brott T ほか. Measurements of acute cerebral infarction: a clinical examination scale. Stroke 1989;20:864-870。
// UN（切断・関節癒合、構音は挿管など）は点に数えない。
// ---------------------------------------------------------------------------

export interface NihssItem {
  key: string;
  label: string;
  options: { value: string; label: string }[];
}
const o = (...rows: [string, string][]) => rows.map(([value, label]) => ({ value, label }));
const ARM = o(["0", "10秒保持"], ["1", "10秒以内に下垂"], ["2", "抗重力の動きあり"], ["3", "抗重力の動きなし"], ["4", "動きなし"], ["UN", "切断・関節癒合"]);
const LEG = o(["0", "5秒保持"], ["1", "5秒以内に下垂"], ["2", "抗重力の動きあり"], ["3", "抗重力の動きなし"], ["4", "動きなし"], ["UN", "切断・関節癒合"]);
export const NIHSS_ITEMS: NihssItem[] = [
  { key: "1a", label: "意識水準", options: o(["0", "覚醒"], ["1", "軽い刺激で覚醒"], ["2", "繰り返し・強い刺激で覚醒"], ["3", "反射のみ・無反応"]) },
  { key: "1b", label: "質問（月・年齢）", options: o(["0", "両方正答"], ["1", "片方正答"], ["2", "両方誤答"]) },
  { key: "1c", label: "従命（開閉眼・手）", options: o(["0", "両方できる"], ["1", "片方できる"], ["2", "両方できない"]) },
  { key: "2", label: "最良の注視", options: o(["0", "正常"], ["1", "部分的注視麻痺"], ["2", "完全注視麻痺・共同偏視"]) },
  { key: "3", label: "視野", options: o(["0", "欠損なし"], ["1", "部分的半盲"], ["2", "完全半盲"], ["3", "両側半盲（皮質盲を含む）"]) },
  { key: "4", label: "顔面麻痺", options: o(["0", "正常"], ["1", "軽度"], ["2", "部分的"], ["3", "完全"]) },
  { key: "5a", label: "上肢の運動 左", options: ARM },
  { key: "5b", label: "上肢の運動 右", options: ARM },
  { key: "6a", label: "下肢の運動 左", options: LEG },
  { key: "6b", label: "下肢の運動 右", options: LEG },
  { key: "7", label: "運動失調", options: o(["0", "なし"], ["1", "1肢"], ["2", "2肢"], ["UN", "切断・関節癒合"]) },
  { key: "8", label: "感覚", options: o(["0", "正常"], ["1", "軽度〜中等度の低下"], ["2", "重度〜完全な脱失"]) },
  { key: "9", label: "最良の言語", options: o(["0", "失語なし"], ["1", "軽度〜中等度の失語"], ["2", "重度の失語"], ["3", "無言・全失語"]) },
  { key: "10", label: "構音障害", options: o(["0", "正常"], ["1", "軽度〜中等度"], ["2", "重度"], ["UN", "挿管・身体的な障壁"]) },
  { key: "11", label: "消去現象・注意障害", options: o(["0", "なし"], ["1", "1つの感覚で"], ["2", "高度・2つ以上の感覚で"]) },
];

export function nihss(chosen: Record<string, string | null>): ScoreSum {
  return sumOf(NIHSS_ITEMS.map((i) => {
    const v = chosen[i.key] ?? null;
    return { key: i.key, label: i.key, points: v === null ? null : v === "UN" ? 0 : Number(v), un: v === "UN" };
  }));
}

// ---------------------------------------------------------------------------
// qSOFA：呼吸数 22/分以上、意識変容（厳密には GCS < 15）、収縮期血圧 100 mmHg 以下、各1点。
// 出典：Seymour CW ほか. JAMA 2016;315:762-774 ／ Singer M ほか. JAMA 2016;315:801-810。
// ---------------------------------------------------------------------------

export const qsofa = (f: { rr: number | null; altered: boolean | null; sbp: number | null }): ScoreSum =>
  sumOf([
    { key: "rr", label: "呼吸数", points: atLeast(f.rr, 22) },
    { key: "altered", label: "意識変容", points: flag(f.altered) },
    { key: "sbp", label: "収縮期血圧", points: atMost(f.sbp, 100) },
  ]);

// ---------------------------------------------------------------------------
// A-DROP（日本呼吸器学会 成人肺炎診療ガイドライン2017 表3、2007年版より改変）：
// A 男性70歳以上・女性75歳以上、D BUN 21 mg/dL 以上または脱水あり、R SpO2 90% 以下（PaO2 60 Torr 以下）、
// O 意識変容あり、P 収縮期血圧 90 mmHg 以下。各1点。
// ---------------------------------------------------------------------------

export function adrop(f: { age: number | null; sex: "男" | "女" | null; bun: number | null; dehydration: boolean | null; spo2: number | null; pao2: number | null; altered: boolean | null; sbp: number | null }): ScoreSum {
  const a = has(f.age) && f.sex ? (f.age >= (f.sex === "男" ? 70 : 75) ? 1 : 0) : null;
  const d = (has(f.bun) && f.bun >= 21) || f.dehydration === true ? 1 : has(f.bun) && f.dehydration === false ? 0 : null;
  const r = (has(f.spo2) && f.spo2 <= 90) || (has(f.pao2) && f.pao2 <= 60) ? 1 : has(f.spo2) || has(f.pao2) ? 0 : null;
  return sumOf([
    { key: "A", label: "A 年齢", points: a },
    { key: "D", label: "D 脱水", points: d },
    { key: "R", label: "R 呼吸", points: r },
    { key: "O", label: "O 意識", points: flag(f.altered) },
    { key: "P", label: "P 血圧", points: atMost(f.sbp, 90) },
  ]);
}

// ---------------------------------------------------------------------------
// CURB-65：Confusion、Urea > 7 mmol/L、呼吸数 30/分以上、収縮期 < 90 または拡張期 ≤ 60 mmHg、65歳以上。各1点。
// 出典：Lim WS ほか. Thorax 2003;58:377-382。
// BUN（mg/dL）から尿素（mmol/L）へ：÷ 2.8014（尿素 1 mmol が含む窒素 28.014 mg、dL → L）。
// ---------------------------------------------------------------------------

export const ureaMmolFromBun = (bun: number) => bun / 2.8014;

export function curb65(f: { confusion: boolean | null; bun: number | null; rr: number | null; sbp: number | null; dbp: number | null; age: number | null }): ScoreSum {
  const u = has(f.bun) ? (ureaMmolFromBun(f.bun) > 7 ? 1 : 0) : null;
  const b = (has(f.sbp) && f.sbp < 90) || (has(f.dbp) && f.dbp <= 60) ? 1 : has(f.sbp) && has(f.dbp) ? 0 : null;
  return sumOf([
    { key: "C", label: "C 意識", points: flag(f.confusion) },
    { key: "U", label: "U 尿素", points: u },
    { key: "R", label: "R 呼吸数", points: atLeast(f.rr, 30) },
    { key: "B", label: "B 血圧", points: b },
    { key: "65", label: "65歳以上", points: atLeast(f.age, 65) },
  ]);
}

// ---------------------------------------------------------------------------
// CHA₂DS₂-VASc：心不全 1、高血圧 1、75歳以上 2、糖尿病 1、脳卒中・TIA・血栓塞栓症 2、血管疾患 1、
// 65〜74歳 1、女性 1（0〜9点）。出典：Lip GY ほか. Chest 2010;137:263-272。
// ---------------------------------------------------------------------------

export function chadsVasc(f: { chf: boolean | null; htn: boolean | null; age: number | null; dm: boolean | null; stroke: boolean | null; vascular: boolean | null; sex: "男" | "女" | null }): ScoreSum {
  return sumOf([
    { key: "C", label: "心不全", points: flag(f.chf) },
    { key: "H", label: "高血圧", points: flag(f.htn) },
    { key: "A2", label: "75歳以上", points: has(f.age) ? (f.age >= 75 ? 2 : 0) : null },
    { key: "D", label: "糖尿病", points: flag(f.dm) },
    { key: "S2", label: "脳卒中・TIA・血栓塞栓症", points: flag(f.stroke, 2) },
    { key: "V", label: "血管疾患", points: flag(f.vascular) },
    { key: "A", label: "65〜74歳", points: has(f.age) ? (f.age >= 65 && f.age < 75 ? 1 : 0) : null },
    { key: "Sc", label: "女性", points: f.sex ? (f.sex === "女" ? 1 : 0) : null },
  ]);
}

// ---------------------------------------------------------------------------
// HAS-BLED：高血圧（収縮期 > 160 mmHg）1、腎機能異常 1・肝機能異常 1、脳卒中 1、出血の既往・素因 1、
// 不安定な INR 1、高齢（> 65歳）1、薬（抗血小板薬・NSAIDs）1・飲酒 1（0〜9点）。
// 腎機能異常：維持透析・腎移植・Cre ≥ 200 μmol/L（2.26 mg/dL）。
// 出典：Pisters R ほか. Chest 2010;138:1093-1100。
// ---------------------------------------------------------------------------

export const HAS_BLED_CRE_MG_DL = 200 / 88.4;

export function hasBled(f: { htn: boolean | null; renal: boolean | null; liver: boolean | null; stroke: boolean | null; bleeding: boolean | null; labile: boolean | null; age: number | null; drugs: boolean | null; alcohol: boolean | null }): ScoreSum {
  return sumOf([
    { key: "H", label: "高血圧", points: flag(f.htn) },
    { key: "Ar", label: "腎機能異常", points: flag(f.renal) },
    { key: "Al", label: "肝機能異常", points: flag(f.liver) },
    { key: "S", label: "脳卒中", points: flag(f.stroke) },
    { key: "B", label: "出血", points: flag(f.bleeding) },
    { key: "L", label: "不安定な INR", points: flag(f.labile) },
    { key: "E", label: "65歳超", points: has(f.age) ? (f.age > 65 ? 1 : 0) : null },
    { key: "Dd", label: "薬", points: flag(f.drugs) },
    { key: "Da", label: "飲酒", points: flag(f.alcohol) },
  ]);
}

// ---------------------------------------------------------------------------
// Child-Pugh：T-Bil < 2 / 2〜3 / > 3 mg/dL、Alb > 3.5 / 2.8〜3.5 / < 2.8 g/dL、PT 延長 4秒未満 / 4〜6秒 / 6秒超、
// 腹水 なし / 軽度 / 中等度以上、脳症 なし / 1〜2度 / 3〜4度 を 1・2・3点。5〜6点 A、7〜9点 B、10〜15点 C。
// 出典：Pugh RN ほか. Transection of the oesophagus for bleeding oesophageal varices. Br J Surg 1973;60:646-649。
// ---------------------------------------------------------------------------

export function childPugh(f: { bil: number | null; alb: number | null; pt: number | null; ascites: number | null; enceph: number | null }): ScoreSum & { grade: "A" | "B" | "C" | null } {
  const bil = has(f.bil) ? (f.bil < 2 ? 1 : f.bil <= 3 ? 2 : 3) : null;
  const alb = has(f.alb) ? (f.alb > 3.5 ? 1 : f.alb >= 2.8 ? 2 : 3) : null;
  const s = sumOf([
    { key: "bil", label: "T-Bil", points: bil },
    { key: "alb", label: "Alb", points: alb },
    { key: "pt", label: "PT", points: f.pt },
    { key: "ascites", label: "腹水", points: f.ascites },
    { key: "enceph", label: "脳症", points: f.enceph },
  ]);
  return { ...s, grade: s.total === null ? null : s.total <= 6 ? "A" : s.total <= 9 ? "B" : "C" };
}
