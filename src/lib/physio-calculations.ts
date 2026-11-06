/** QT in ms, RR in seconds. ESC: How to measure the QT interval (2024). */
export function physioCalculated(test: string, v: Record<string, number>): Record<string, number> {
  const round = (n: number) => Math.round(n * 10) / 10;
  if (test === "PHY-ECG" && Number.isFinite(v.HR) && v.HR > 0 && Number.isFinite(v.QT) && v.QT > 0) {
    const rr = 60 / v.HR;
    return { QTc: Math.round(v.QT / Math.sqrt(rr)), QTcF: Math.round(v.QT / Math.cbrt(rr)) };
  }
  if (test === "PHY-UCG" && Number.isFinite(v.LVDd) && Number.isFinite(v.LVDs) && v.LVDd > 0 && v.LVDs > 0 && v.LVDs < v.LVDd) {
    // DICOM CP-756: V = 7D³/(2.4+D), D in cm, V in mL.
    const volume = (mm: number) => 7 * (mm / 10) ** 3 / (2.4 + mm / 10);
    const edv = volume(v.LVDd);
    return { FS: round((v.LVDd - v.LVDs) / v.LVDd * 100), LVEF: round((edv - volume(v.LVDs)) / edv * 100) };
  }
  return {};
}

/** Manual overrides survive changes to source measurements; clearing restores automatic entry. */
export function physioWithCalculated(test: string, raw: Record<string, string>, manual: ReadonlySet<string>): Record<string, string> {
  const measured = Object.fromEntries(Object.entries(raw).filter(([, v]) => v.trim() !== "").map(([k, v]) => [k, Number(v)]));
  const result = { ...raw };
  const keys = test === "PHY-ECG" ? ["QTc", "QTcF"] : test === "PHY-UCG" ? ["FS", "LVEF"] : [];
  const calculated = physioCalculated(test, measured);
  for (const key of keys) if (!manual.has(key)) result[key] = calculated[key] === undefined ? "" : String(calculated[key]);
  return result;
}

export interface PhysioFacts { age: number; sex: "男" | "女"; heightCm: number; weightKg: number }
const r1 = (n: number) => Math.round(n * 10) / 10;
const positive = (n: number | undefined): n is number => Number.isFinite(n) && n! > 0;

/** JRS 2001, 日本人のスパイログラムと動脈血液ガス分圧基準値, 表4.
 * https://www.jstage.jst.go.jp/article/jjars/39/5/39_39050S11/_pdf/-char/en
 * Adult regression; LLN = predicted − 1.645 × residual SD (one-sided 5%).
 */
export function spiroPredicted(p: PhysioFacts) {
  if (!Number.isFinite(p.age) || p.age < 18 || p.age > 95 || !positive(p.heightCm)) return undefined;
  const rows = p.sex === "男" ? [[.045, -.023, -2.258, .560], [.042, -.024, -1.785, .573], [.036, -.028, -1.178, .470]] : [[.032, -.018, -1.178, .370], [.031, -.019, -1.105, .378], [.022, -.022, -.005, .315]];
  return Object.fromEntries(rows.map(([h, a, c, sd], i) => {
    const predicted = h * p.heightCm + a * p.age + c;
    return [["VC", "FVC", "FEV1"][i], { predicted, lln: predicted - 1.645 * sd }] as const;
  }).filter(([, v]) => v.predicted > 0)) as Record<string, { predicted: number; lln: number }>;
}

export function spiroCalculated(v: Record<string, number>, p: PhysioFacts) {
  const out: Record<string, number> = {};
  const predicted = spiroPredicted(p);
  for (const suffix of ["", "Post"]) {
    for (const key of ["VC", "FVC", "FEV1"]) {
      const ref = predicted?.[key];
      if (ref) {
        out[`pred${key}`] = ref.predicted;
        out[`lln${key}`] = ref.lln;
        if (positive(v[key + suffix])) out[`p${key}${suffix}`] = v[key + suffix] / ref.predicted * 100;
      }
    }
    if (positive(v[`FVC${suffix}`]) && positive(v[`FEV1${suffix}`])) out[`ratio${suffix}`] = v[`FEV1${suffix}`] / v[`FVC${suffix}`] * 100;
  }
  if (positive(v.FEV1) && positive(v.FEV1Post)) {
    out.responseMl = (v.FEV1Post - v.FEV1) * 1000;
    out.responsePercent = (v.FEV1Post - v.FEV1) / v.FEV1 * 100;
  }
  return out;
}

/** Requested fixed cutoffs; GOLD grades apply to post-bronchodilator airflow limitation, not COPD diagnosis.
 * https://goldcopd.org/wp-content/uploads/2022/12/POCKET-GUIDE-GOLD-2023-ver-1.1-2Dec2022_WMV.pdf
 * Bronchodilator response: ATS/ERS 2005 criterion requested here (not 2022 >10% predicted).
 */
export function ventilationCandidate(v: Record<string, number>, p: PhysioFacts, post = false): string {
  const c = spiroCalculated(v, p), s = post ? "Post" : "";
  if (!Number.isFinite(c[`pVC${s}`]) || !Number.isFinite(c[`ratio${s}`])) return "未判定";
  const restricted = c[`pVC${s}`] < 80 - 1e-9, obstructed = c[`ratio${s}`] < 70 - 1e-9;
  return restricted ? obstructed ? "混合性" : "拘束性" : obstructed ? "閉塞性" : "正常";
}
export function goldCandidate(v: Record<string, number>, p: PhysioFacts): string | undefined {
  const c = spiroCalculated(v, p);
  if (!(c.ratioPost < 70) || !Number.isFinite(c.pFEV1Post)) return undefined;
  return c.pFEV1Post >= 80 - 1e-9 ? "Ⅰ" : c.pFEV1Post >= 50 - 1e-9 ? "Ⅱ" : c.pFEV1Post >= 30 - 1e-9 ? "Ⅲ" : "Ⅳ";
}
export function bronchodilatorResponse(v: Record<string, number>): boolean | undefined {
  if (!positive(v.FEV1) || !positive(v.FEV1Post)) return undefined;
  const delta = v.FEV1Post - v.FEV1;
  return delta + 1e-9 >= .2 && delta / v.FEV1 + 1e-9 >= .12;
}
/** ATS/ERS 2019: highest two acceptable values, independently for FVC and FEV1, ≤0.150 L. */
export function spiroQuality(v: Record<string, number>, suffix = "") {
  const diff = (key: string) => positive(v[key + suffix]) && positive(v[`${key}Second${suffix}`]) ? Math.abs(v[key + suffix] - v[`${key}Second${suffix}`]) * 1000 : undefined;
  const fvc = diff("FVC"), fev1 = diff("FEV1");
  return { fvc, fev1, repeatable: fvc === undefined || fev1 === undefined ? undefined : fvc <= 150 + 1e-8 && fev1 <= 150 + 1e-8 };
}

/** ASE/EACVI 2015 chamber quantification (linear mass, TAPSE, IVC/RAP), cm in cube formula.
 * https://www.asecho.org/wp-content/uploads/2016/02/2015_ChamberQuantificationREV.pdf
 * Simpson input is biplane traced EDV/ESV; no geometric substitute for traced volumes.
 * Simplified Bernoulli: ΔP = 4v²; RVSP assumes no RV outflow/pulmonic obstruction.
 * Mosteller BSA: NEJM 1987;317:1098.
 */
export function echoCalculated(v: Record<string, number>, p?: PhysioFacts): Record<string, number> {
  const out = physioCalculated("PHY-UCG", v);
  if (p && positive(p.heightCm) && positive(p.weightKg)) out.BSA = Math.sqrt(p.heightCm * p.weightKg / 3600);
  if ([v.LVDd, v.IVSd, v.LVPWd].every(positive)) {
    out.LVMass = .8 * 1.04 * (((v.LVDd + v.IVSd + v.LVPWd) / 10) ** 3 - (v.LVDd / 10) ** 3) + .6;
    if (out.BSA) out.LVMI = out.LVMass / out.BSA;
  }
  if (positive(v.EDV) && Number.isFinite(v.ESV) && v.ESV >= 0 && v.ESV < v.EDV) out.SimpsonEF = (v.EDV - v.ESV) / v.EDV * 100;
  if (positive(v.E) && positive(v.A)) out.EA = v.E / v.A;
  if (positive(v.E) && positive(v.eSeptal) && positive(v.eLateral)) out.Ee = v.E / ((v.eSeptal + v.eLateral) / 2);
  if (positive(v.TRV)) out.TRPG = 4 * v.TRV ** 2;
  if (positive(v.IVC) && Number.isFinite(v.IVCCollapse) && v.IVCCollapse >= 0 && v.IVCCollapse <= 100) out.RAP = v.IVC <= 21 && v.IVCCollapse > 50 ? 3 : v.IVC > 21 && v.IVCCollapse < 50 ? 15 : 8;
  if (out.TRPG !== undefined && out.RAP !== undefined) out.RVSP = out.TRPG + out.RAP;
  return Object.fromEntries(Object.entries(out).map(([k, n]) => [k, k === "BSA" ? Math.round(n * 100) / 100 : r1(n)]));
}

/** Editable adult reference table: ASE/EACVI 2015, supplemental table 3; TAPSE ≥17 mm.
 * LVEF limits describe biplane EF; Teichholz is displayed separately without the biplane flag.
 */
export const ECHO_RANGES: Record<string, { male: [number, number]; female: [number, number] }> = {
  LVDd: { male: [42, 58], female: [38, 52] }, LVDs: { male: [25, 40], female: [22, 35] },
  IVSd: { male: [6, 10], female: [6, 9] }, LVPWd: { male: [6, 10], female: [6, 9] },
  LVMass: { male: [88, 224], female: [67, 162] }, LVMI: { male: [49, 115], female: [43, 95] },
  SimpsonEF: { male: [52, 72], female: [54, 74] }, TAPSE: { male: [17, Infinity], female: [17, Infinity] },
};
export function echoFlag(key: string, n: number, sex: PhysioFacts["sex"]) {
  const range = ECHO_RANGES[key]?.[sex === "男" ? "male" : "female"];
  return range && Number.isFinite(n) ? n < range[0] ? "↓" : n > range[1] ? "↑" : "" : "";
}
export const ECHO_FORMULAS: Record<string, string> = {
  LVEF: "Teichholz：V = 7D³/(2.4+D)（D: cm）；EF = (EDV−ESV)/EDV×100",
  FS: "FS = (LVDd−LVDs)/LVDd×100", SimpsonEF: "modified Simpson：EF = (EDV−ESV)/EDV×100",
  BSA: "Mosteller：BSA = √(身長cm×体重kg/3600)", LVMass: "ASE：LV mass = 0.8×1.04×[(IVSd+LVDd+LVPWd)³−LVDd³]+0.6（cm）",
  LVMI: "LVMI = LV mass/BSA", EA: "E/A = E÷A", Ee: "E/e′ = E÷[(中隔e′+側壁e′)/2]",
  TRPG: "簡易ベルヌーイ：TRPG = 4×TR最大流速²", RAP: "RAP：IVC ≤21mm・虚脱>50% →3、>21mm・虚脱<50% →15、その他→8",
  RVSP: "推定RVSP = TRPG+RAP",
};
export type Motion = "正常" | "低収縮" | "無収縮" | "奇異性";
export type Grade = "なし" | "軽度" | "中等度" | "高度";
export const VALVES = ["大動脈弁", "僧帽弁", "三尖弁", "肺動脈弁"] as const;
export interface PhysioSelections { motion?: Record<number, Motion>; valves?: Record<string, { stenosis: Grade; regurgitation: Grade }>; ecg?: string[]; qualityChecked?: boolean; qualityPostChecked?: boolean }
export const ECG_FINDINGS = ["洞調律", "心房細動", "ST変化", "異常Q波", "左室肥大", "右脚ブロック", "左脚ブロック", "房室ブロック", "期外収縮"];

/** Deterministic report text; absence of an observation never implies a normal finding. */
export function physioDraft(test: string, v: Record<string, number>, selections: PhysioSelections, p?: PhysioFacts): string {
  const sentences: string[] = [];
  if (test === "PHY-UCG") {
    const motion = selections.motion ?? {};
    const entries = Object.entries(motion);
    if (entries.length === 17 && entries.every(([, m]) => m === "正常")) sentences.push("左室壁運動は正常");
    else for (const [segment, m] of entries) if (m !== "正常") sentences.push(`第${segment}分画は${m}`);
    const c = echoCalculated(v, p);
    if (c.LVEF !== undefined) sentences.push(`LVEF ${c.LVEF}%（Teichholz）`);
    if (c.SimpsonEF !== undefined) sentences.push(`LVEF ${c.SimpsonEF}%（modified Simpson）`);
    for (const valve of VALVES) {
      const observation = selections.valves?.[valve];
      if (observation?.stenosis && observation.stenosis !== "なし") sentences.push(`${observation.stenosis}の${valve}狭窄`);
      if (observation?.regurgitation && observation.regurgitation !== "なし") sentences.push(`${observation.regurgitation}の${valve}逆流`);
    }
    if (c.RVSP !== undefined) sentences.push(`推定RVSP ${c.RVSP}mmHg`);
  } else if (test === "PHY-ECG") {
    sentences.push(...(selections.ecg ?? []));
    if (positive(v.HR)) sentences.push(`心拍数 ${v.HR}/分`);
    const c = physioCalculated(test, v);
    if (c.QTc !== undefined) sentences.push(`QTc ${c.QTc}ms（Bazett）、${c.QTcF}ms（Fridericia）`);
  } else if (test === "PHY-SPIRO" && p) {
    sentences.push(`換気障害の候補（前）：${ventilationCandidate(v, p)}`);
    if (positive(v.FVCPost)) sentences.push(`換気障害の候補（後）：${ventilationCandidate(v, p, true)}`);
    const gold = goldCandidate(v, p);
    if (gold) sentences.push(`気流閉塞の重症度候補：GOLD ${gold}`);
    const response = bronchodilatorResponse(v);
    if (response !== undefined) sentences.push(`気管支拡張薬反応（12%かつ200mL）：${response ? "あり" : "なし"}`);
  }
  return sentences.length ? `${sentences.join("。")}。` : "";
}
