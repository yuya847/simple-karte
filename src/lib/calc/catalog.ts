// 「計算」の道具の一覧：入れる値（初期値はカルテから）と、式・点の出し方（formulas.ts・scores.ts・sofa.ts）、
// 記事に入れる1行。画面（CalcWindow.tsx）はこの定義を並べて描くだけ。式と出典は各ファイルのコメントと
// 「使い方」（src/lib/help/content.ts の CalcWindow）にある。

import { dialysisFromOrders, renalFunction, renalWeight, type WeightKind } from "../abx-renal";
import { fio2At, ventAt } from "../icu/abg";
import type { IcuRecords } from "../icu/types";
import { abs } from "../flowsheet";
import type { CalendarDate } from "../dates";
import type { HistoryEntry, Patient } from "../types";
import { latestBp, latestGcs, latestLab, latestVital, latestWeight, oxygenAt, pickedText, whenText, type Picked } from "./chart";
import { aaDo2, albuminCorrectedAg, alveolarO2, anionGap, ageBand, concentration, continuousRate, correctedCa, correctedNa, fmt, freeWaterDeficit, intermittentRate, meld, NA_GLUCOSE_FACTORS, pf, TBW_FACTORS, tbwFactor } from "./formulas";
import { adrop, chadsVasc, childPugh, curb65, gcs, GCS_OPTIONS, hasBled, HAS_BLED_CRE_MG_DL, nihss, NIHSS_ITEMS, qsofa, type ScoreSum } from "./scores";
import { SOFA_DRUGS, sofaFromMaterial, sofaLine, sofaPrefill, type Filled } from "./sofa";

export type { Filled };

export interface Ctx {
  patient: Patient;
  /** 今（今日0時からの分）。これより後の記録は使わない。 */
  nowAbs: number;
  today: CalendarDate;
  icu: IcuRecords;
  /** ICU 記録の患者 ID（救急外来の er: を外したもの）。 */
  icuId: string;
  entries: HistoryEntry[];
}

export interface Opt {
  value: string;
  label: string;
  /** その選択の点（あり＝2点 など）。 */
  points?: number;
}
interface FieldBase {
  key: string;
  label: string;
  /** 同じ row の欄は1行に並べる。 */
  row?: string;
  show?: (v: Values) => boolean;
}
export type Field = (FieldBase & { kind: "num"; unit?: string }) | (FieldBase & { kind: "choice"; options: Opt[]; numbered?: boolean });

/** 医師が入れ直した値と初期値を重ねたもの（文字列。空は未入力）。 */
export type Values = Record<string, string>;

export interface Outcome {
  results: { label?: string; value: string | null; unit?: string; faint?: boolean }[];
  /** 項目ごとの点など（小さく並べる）。 */
  parts?: string[];
  /** 未選択の項目（合計を出していないとき）。 */
  missing?: string[];
  /** 記事に入れる1行。そろっていなければ null。 */
  line: string | null;
}

export interface CalcDef {
  key: string;
  name: string;
  group: string;
  fields: Field[];
  /** カルテからの初期値（キーは fields の key）。 */
  prefill?: (c: Ctx) => Record<string, Filled | null>;
  /** 初期値の代わりに、参考に出すカルテの値（Child-Pugh の PT 欄の PT-INR など）。 */
  notes?: (c: Ctx) => Record<string, string>;
  compute: (v: Values, c: Ctx) => Outcome;
}

// ---------------------------------------------------------------------------

const num = (v: Values, k: string): number | null => {
  const s = (v[k] ?? "").trim();
  if (s === "") return null;
  const n = Number(s.normalize("NFKC"));
  return Number.isFinite(n) ? n : null;
};
const str = (v: Values, k: string): string | null => ((v[k] ?? "") === "" ? null : v[k]);
const yes = (v: Values, k: string): boolean | null => (v[k] === "あり" ? true : v[k] === "なし" ? false : null);
const sexOf = (v: Values): "男" | "女" | null => (v.sex === "男" || v.sex === "女" ? v.sex : null);

const picked = (p: Picked | null, c: Ctx, digits?: number): Filled | null => (p ? { value: digits === undefined ? String(p.value) : fmt(p.value, digits), from: pickedText(p, c.today) } : null);
const lab = (code: string) => (c: Ctx) => picked(latestLab(c.patient, code, c.nowAbs), c);
const vital = (key: "rr" | "sbp" | "dbp" | "spo2" | "hr") => (c: Ctx) => picked(latestVital(c.patient, key, c.nowAbs), c);
const age = (c: Ctx): Filled => ({ value: String(c.patient.age), from: "プロファイル" });
const sex = (c: Ctx): Filled => ({ value: c.patient.sex, from: "プロファイル" });
const weight = (c: Ctx) => picked(latestWeight(c.patient), c);

const YN = (points = 1): Opt[] => [
  { value: "あり", label: "あり", points },
  { value: "なし", label: "なし", points: 0 },
];
const SEX: Opt[] = [{ value: "男", label: "男" }, { value: "女", label: "女" }];

const n = (label: string, key: string, unit?: string, extra: Partial<FieldBase> = {}): Field => ({ kind: "num", key, label, unit, ...extra });
const ch = (label: string, key: string, options: Opt[], extra: Partial<FieldBase> & { numbered?: boolean } = {}): Field => ({ kind: "choice", key, label, options, ...extra });

/** 点数の結果：合計（そろわないときは選んだ分を薄く）と項目ごとの点。 */
function scored(name: string, s: ScoreSum, opts: { suffix?: string; line?: (s: ScoreSum) => string } = {}): Outcome {
  const parts = s.items.map((i) => `${i.label} ${i.un ? "UN" : i.points ?? "—"}`);
  return {
    results: [{ value: String(s.total ?? s.sum), unit: opts.suffix, faint: s.total === null }],
    parts,
    missing: s.missing,
    line: s.total === null ? null : `${name} ${s.total}${opts.suffix ?? ""}（${opts.line ? opts.line(s) : s.items.map((i) => `${i.label.split(" ")[0]}${i.un ? "UN" : i.points}`).join(" ")}）`,
  };
}
/** 当てはまった項目だけを並べる（CHA₂DS₂-VASc・HAS-BLED）。 */
const metItems = (s: ScoreSum) => s.items.filter((i) => (i.points ?? 0) > 0).map((i) => `${i.label}${i.points}`).join(" ") || "該当なし";

/** 最新の PaO2 の採血時の FiO2（ICU の呼吸器の設定、なければ採血時のバイタルの室内気を 0.21）。 */
function fio2AtGas(c: Ctx): Filled | null {
  const gas = c.patient.labs.filter((l) => abs(l.day, l.time) <= c.nowAbs && Number.isFinite(l.values.PaO2)).sort((a, b) => abs(b.day, b.time) - abs(a.day, a.time))[0];
  if (!gas) return null;
  const t = abs(gas.day, gas.time);
  const f = fio2At(c.icu.vents, c.icuId, t);
  if (f !== null) return { value: String(f), from: `${ventAt(c.icu.vents, c.icuId, t)?.mode ?? "呼吸器"}（${whenText(gas.day, gas.time, c.today)}）` };
  const air = oxygenAt(c.patient, t);
  return air?.o2 === "室内気" && !ventAt(c.icu.vents, c.icuId, t) ? { value: "0.21", from: `室内気（${whenText(air.day, air.time, c.today)}）` } : null;
}

const WEIGHT_KINDS: { value: string; kind: WeightKind }[] = [
  { value: "実体重", kind: "actual" },
  { value: "理想体重", kind: "ideal" },
  { value: "補正体重", kind: "adjusted" },
];

// ---------------------------------------------------------------------------

export const CALCS: CalcDef[] = [
  {
    key: "sofa",
    name: "SOFA",
    group: "重症度",
    fields: [
      n("PaO2", "pao2", "mmHg", { row: "resp" }),
      n("FiO2", "fio2", "", { row: "resp" }),
      ch("呼吸補助", "support", YN(0)),
      n("Plt", "plt", "万/μL"),
      n("T-Bil", "bil", "mg/dL"),
      n("MAP", "map", "mmHg"),
      ...SOFA_DRUGS.map((d) => n(d.short, d.key, "γ", { row: "drugs" })),
      n("GCS", "gcs", ""),
      n("Cre", "cre", "mg/dL", { row: "renal" }),
      n("尿量", "urine", "mL/日", { row: "renal" }),
    ],
    prefill: (c) => sofaPrefill(c.patient, c.icu, c.icuId, c.nowAbs, c.today),
    compute: (v) => {
      const r = sofaFromMaterial({
        pao2: num(v, "pao2"),
        fio2: num(v, "fio2"),
        support: yes(v, "support"),
        plt: num(v, "plt"),
        bil: num(v, "bil"),
        map: num(v, "map"),
        gamma: Object.fromEntries(SOFA_DRUGS.map((d) => [d.key, num(v, d.key)])),
        gcs: num(v, "gcs"),
        cre: num(v, "cre"),
        urine: num(v, "urine"),
      });
      return {
        results: [{ value: String(r.total ?? r.items.reduce((s, i) => s + (i.score ?? 0), 0)), faint: r.total === null }],
        parts: r.items.map((i) => `${i.label} ${i.score ?? "—"}`),
        missing: r.missing,
        line: sofaLine(r),
      };
    },
  },
  {
    key: "qsofa",
    name: "qSOFA",
    group: "重症度",
    fields: [n("呼吸数", "rr", "/分"), ch("意識変容", "altered", YN()), n("収縮期血圧", "sbp", "mmHg")],
    prefill: (c) => {
      const g = latestGcs(c.patient, c.nowAbs);
      const total = g && g.e && g.v && g.m ? g.e + g.v + g.m : null;
      return { rr: vital("rr")(c), sbp: vital("sbp")(c), altered: g && total !== null ? { value: total < 15 ? "あり" : "なし", from: `GCS ${total}（${whenText(g.day, g.time, c.today)}）` } : null };
    },
    compute: (v) => scored("qSOFA", qsofa({ rr: num(v, "rr"), altered: yes(v, "altered"), sbp: num(v, "sbp") })),
  },
  {
    key: "gcs",
    name: "GCS",
    group: "重症度",
    fields: [ch("E 開眼", "e", GCS_OPTIONS.e, { numbered: true }), ch("V 言語", "v", GCS_OPTIONS.v, { numbered: true }), ch("M 運動", "m", GCS_OPTIONS.m, { numbered: true })],
    prefill: (c) => {
      const g = latestGcs(c.patient, c.nowAbs);
      const at = g ? whenText(g.day, g.time, c.today) : "";
      return { e: g?.e ? { value: String(g.e), from: at } : null, v: g?.v ? { value: String(g.v), from: at } : null, m: g?.m ? { value: String(g.m), from: at } : null };
    },
    compute: (v) => {
      const r = gcs(str(v, "e"), str(v, "v"), str(v, "m"));
      const all = !!(str(v, "e") && str(v, "v") && str(v, "m"));
      return { results: [{ value: r.total === null ? null : String(r.total) }], parts: [r.text], line: all ? (r.total === null ? `GCS ${r.text}` : `GCS ${r.total}（${r.text}）`) : null };
    },
  },
  {
    key: "nihss",
    name: "NIHSS",
    group: "重症度",
    fields: NIHSS_ITEMS.map((i) => ch(`${i.key} ${i.label}`, i.key, i.options, { numbered: true })),
    compute: (v) => {
      const s = nihss(Object.fromEntries(NIHSS_ITEMS.map((i) => [i.key, str(v, i.key)])));
      return { ...scored("NIHSS", s, { line: (x) => x.items.map((i) => `${i.label}:${i.un ? "UN" : i.points}`).join(" ") }), parts: undefined };
    },
  },
  {
    key: "free-water",
    name: "自由水欠乏量",
    group: "水・電解質",
    fields: [n("Na", "na", "mmol/L"), n("体重", "weight", "kg"), ch("係数", "factor", TBW_FACTORS.map((f) => ({ value: String(f.value), label: `${f.value} ${f.label}` })))],
    prefill: (c) => ({
      na: lab("Na")(c),
      weight: weight(c),
      factor: { value: String(tbwFactor(ageBand(c.patient.age), c.patient.sex)), from: `${c.patient.age}歳・${c.patient.sex}` },
    }),
    compute: (v) => {
      const na = num(v, "na"), w = num(v, "weight"), f = num(v, "factor");
      const r = freeWaterDeficit(na, w, f);
      return { results: [{ value: r ? fmt(r.liters) : null, unit: "L" }], parts: r ? [`体水分量 ${fmt(r.tbw)} L`] : [], line: r ? `自由水欠乏 ${fmt(r.liters)} L（Na ${na}、体重 ${w}kg、係数 ${f}）` : null };
    },
  },
  {
    key: "corrected-na",
    name: "補正 Na（高血糖）",
    group: "水・電解質",
    fields: [n("Na", "na", "mmol/L"), n("血糖", "glu", "mg/dL")],
    prefill: (c) => ({ na: lab("Na")(c), glu: lab("Glu")(c) }),
    compute: (v) => {
      const na = num(v, "na"), glu = num(v, "glu");
      const rs = NA_GLUCOSE_FACTORS.map((f) => ({ f, value: correctedNa(na, glu, f.factor) }));
      return {
        results: rs.map((r) => ({ label: `係数 ${r.f.factor}`, value: r.value === null ? null : fmt(r.value), unit: "mmol/L" })),
        line: rs.every((r) => r.value !== null) ? `補正 Na ${rs.map((r) => `${fmt(r.value!)}（係数${r.f.factor}）`).join("・")}、Na ${na}・血糖 ${glu}` : null,
      };
    },
  },
  {
    key: "corrected-ca",
    name: "補正 Ca",
    group: "水・電解質",
    fields: [n("Ca", "ca", "mg/dL"), n("Alb", "alb", "g/dL")],
    prefill: (c) => ({ ca: lab("Ca")(c), alb: lab("Alb")(c) }),
    compute: (v) => {
      const ca = num(v, "ca"), alb = num(v, "alb");
      const r = correctedCa(ca, alb);
      return { results: [{ value: r === null ? null : fmt(r), unit: "mg/dL" }], line: r === null ? null : `補正 Ca ${fmt(r)} mg/dL（Ca ${ca}、Alb ${alb}）` };
    },
  },
  {
    key: "anion-gap",
    name: "アニオンギャップ",
    group: "水・電解質",
    fields: [n("Na", "na", "mmol/L", { row: "ag" }), n("Cl", "cl", "mmol/L", { row: "ag" }), n("HCO3", "hco3", "mmol/L", { row: "ag" }), n("Alb", "alb", "g/dL"), ch("基準の Alb", "ref", [{ value: "4.4", label: "4.4" }, { value: "4.0", label: "4.0" }])],
    prefill: (c) => ({ na: lab("Na")(c), cl: lab("Cl")(c), hco3: lab("HCO3")(c), alb: lab("Alb")(c) }),
    compute: (v) => {
      const ag = anionGap(num(v, "na"), num(v, "cl"), num(v, "hco3"));
      const corrected = albuminCorrectedAg(ag, num(v, "alb"), num(v, "ref"));
      return {
        results: [{ label: "AG", value: ag === null ? null : fmt(ag), unit: "mmol/L" }, { label: "Alb 補正", value: corrected === null ? null : fmt(corrected), unit: "mmol/L" }],
        line: ag === null ? null : `AG ${fmt(ag)}（Na ${v.na}、Cl ${v.cl}、HCO3 ${v.hco3}）${corrected === null ? "" : `・Alb 補正 AG ${fmt(corrected)}（Alb ${v.alb}、基準 ${v.ref}）`}`,
      };
    },
  },
  {
    key: "renal",
    name: "CCr・eGFR",
    group: "水・電解質",
    fields: [n("Cre", "cre", "mg/dL"), n("年齢", "age", "歳", { row: "who" }), ch("性別", "sex", SEX, { row: "who" }), n("体重", "weight", "kg", { row: "body" }), n("身長", "height", "cm", { row: "body" }), ch("CCr の体重", "wkind", WEIGHT_KINDS.map((k) => ({ value: k.value, label: k.value })))],
    prefill: (c) => ({ cre: lab("Cre")(c), age: age(c), sex: sex(c), weight: weight(c), height: Number.isFinite(c.patient.heightCm) && c.patient.heightCm > 0 ? { value: String(c.patient.heightCm), from: "プロファイル" } : null, wkind: { value: "実体重", from: "" } }),
    compute: (v) => {
      const kind = WEIGHT_KINDS.find((k) => k.value === v.wkind)?.kind ?? null;
      const w = kind ? renalWeight({ heightCm: num(v, "height") ?? NaN, weightKg: num(v, "weight") ?? NaN }, kind) : null;
      const a = num(v, "age"), s = sexOf(v), cre = num(v, "cre");
      const r = a !== null && s ? renalFunction(a, s, w, cre) : { ccr: null, egfr: null };
      const parts = [`${v.wkind || "体重"} ${w === null ? "—" : fmt(w)} kg`];
      return {
        results: [{ label: "CCr", value: r.ccr === null ? null : fmt(r.ccr), unit: "mL/min" }, { label: "eGFR", value: r.egfr === null ? null : fmt(r.egfr), unit: "mL/min/1.73m²" }],
        parts,
        line: r.ccr === null && r.egfr === null ? null : [r.ccr !== null && `CCr ${fmt(r.ccr)} mL/min（${v.wkind} ${fmt(w!)}kg）`, r.egfr !== null && `eGFR ${fmt(r.egfr)} mL/min/1.73m²`].filter(Boolean).join("・") + `（Cre ${cre}、${a}歳 ${s}）`,
      };
    },
  },
  {
    key: "pf",
    name: "P/F・A-aDO2",
    group: "呼吸",
    fields: [n("PaO2", "pao2", "mmHg", { row: "gas" }), n("PaCO2", "paco2", "mmHg", { row: "gas" }), n("FiO2", "fio2", ""), n("大気圧", "patm", "mmHg")],
    prefill: (c) => ({ pao2: lab("PaO2")(c), paco2: lab("PaCO2")(c), fio2: fio2AtGas(c), patm: { value: "760", from: "" } }),
    compute: (v) => {
      const pao2 = num(v, "pao2"), paco2 = num(v, "paco2"), fio2 = num(v, "fio2"), patm = num(v, "patm");
      const ratio = pf(pao2, fio2), alv = alveolarO2(fio2, paco2, patm), gap = aaDo2(fio2, pao2, paco2, patm);
      return {
        results: [{ label: "P/F", value: ratio === null ? null : String(ratio) }, { label: "A-aDO2", value: gap === null ? null : fmt(gap, 0), unit: "mmHg" }],
        parts: alv === null ? [] : [`PAO2 ${fmt(alv, 0)} mmHg`],
        line: ratio === null && gap === null ? null : [ratio !== null && `P/F ${ratio}（PaO2 ${pao2}、FiO2 ${fio2}）`, gap !== null && `A-aDO2 ${fmt(gap, 0)} mmHg（PaCO2 ${paco2}、大気圧 ${patm}）`].filter(Boolean).join("・"),
      };
    },
  },
  {
    key: "adrop",
    name: "A-DROP",
    group: "呼吸",
    fields: [n("年齢", "age", "歳", { row: "who" }), ch("性別", "sex", SEX, { row: "who" }), n("BUN", "bun", "mg/dL"), ch("脱水", "dehydration", YN()), n("SpO2", "spo2", "%", { row: "o2" }), n("PaO2", "pao2", "Torr", { row: "o2" }), ch("意識変容", "altered", YN()), n("収縮期血圧", "sbp", "mmHg")],
    prefill: (c) => ({ age: age(c), sex: sex(c), bun: lab("BUN")(c), spo2: vital("spo2")(c), pao2: lab("PaO2")(c), sbp: vital("sbp")(c) }),
    compute: (v) => scored("A-DROP", adrop({ age: num(v, "age"), sex: sexOf(v), bun: num(v, "bun"), dehydration: yes(v, "dehydration"), spo2: num(v, "spo2"), pao2: num(v, "pao2"), altered: yes(v, "altered"), sbp: num(v, "sbp") })),
  },
  {
    key: "curb65",
    name: "CURB-65",
    group: "呼吸",
    fields: [ch("意識障害", "confusion", YN()), n("BUN", "bun", "mg/dL"), n("呼吸数", "rr", "/分"), n("収縮期血圧", "sbp", "mmHg", { row: "bp" }), n("拡張期血圧", "dbp", "mmHg", { row: "bp" }), n("年齢", "age", "歳")],
    prefill: (c) => {
      const bp = latestBp(c.patient, c.nowAbs);
      const at = bp ? whenText(bp.day, bp.time, c.today) : "";
      return { bun: lab("BUN")(c), rr: vital("rr")(c), sbp: bp ? { value: String(bp.sbp), from: at } : null, dbp: bp ? { value: String(bp.dbp), from: at } : null, age: age(c) };
    },
    compute: (v) => {
      const s = curb65({ confusion: yes(v, "confusion"), bun: num(v, "bun"), rr: num(v, "rr"), sbp: num(v, "sbp"), dbp: num(v, "dbp"), age: num(v, "age") });
      const out = scored("CURB-65", s, { line: (x) => x.items.map((i) => `${i.key === "65" ? "年齢" : i.key}${i.points}`).join(" ") });
      const bun = num(v, "bun");
      return { ...out, parts: [...(out.parts ?? []), ...(bun === null ? [] : [`尿素 ${fmt(bun / 2.8014)} mmol/L`])] };
    },
  },
  {
    key: "chads-vasc",
    name: "CHA₂DS₂-VASc",
    group: "循環",
    fields: [ch("心不全", "chf", YN()), ch("高血圧", "htn", YN()), n("年齢", "age", "歳", { row: "who" }), ch("性別", "sex", SEX, { row: "who" }), ch("糖尿病", "dm", YN()), ch("脳卒中・TIA・血栓塞栓症", "stroke", YN(2)), ch("血管疾患", "vascular", YN())],
    prefill: (c) => ({ age: age(c), sex: sex(c) }),
    compute: (v) => scored("CHA₂DS₂-VASc", chadsVasc({ chf: yes(v, "chf"), htn: yes(v, "htn"), age: num(v, "age"), dm: yes(v, "dm"), stroke: yes(v, "stroke"), vascular: yes(v, "vascular"), sex: sexOf(v) }), { line: metItems }),
  },
  {
    key: "has-bled",
    name: "HAS-BLED",
    group: "循環",
    fields: [ch("高血圧（収縮期 >160）", "htn", YN()), ch("腎機能異常", "renal", YN()), ch("肝機能異常", "liver", YN()), ch("脳卒中", "stroke", YN()), ch("出血の既往・素因", "bleeding", YN()), ch("不安定な INR", "labile", YN()), n("年齢", "age", "歳"), ch("抗血小板薬・NSAIDs", "drugs", YN()), ch("飲酒", "alcohol", YN())],
    prefill: (c) => {
      const cre = latestLab(c.patient, "Cre", c.nowAbs);
      const hd = dialysisFromOrders(c.entries);
      const renal = hd ? { value: "あり", from: `${hd}のオーダ` } : cre && cre.value >= HAS_BLED_CRE_MG_DL ? { value: "あり", from: `Cre ${cre.value}（${pickedText(cre, c.today)}）` } : null;
      return { age: age(c), renal };
    },
    compute: (v) => scored("HAS-BLED", hasBled({ htn: yes(v, "htn"), renal: yes(v, "renal"), liver: yes(v, "liver"), stroke: yes(v, "stroke"), bleeding: yes(v, "bleeding"), labile: yes(v, "labile"), age: num(v, "age"), drugs: yes(v, "drugs"), alcohol: yes(v, "alcohol") }), { line: metItems }),
  },
  {
    key: "child-pugh",
    name: "Child-Pugh",
    group: "肝",
    fields: [
      n("T-Bil", "bil", "mg/dL", { row: "lab" }),
      n("Alb", "alb", "g/dL", { row: "lab" }),
      ch("PT 延長", "pt", [{ value: "1", label: "4秒未満", points: 1 }, { value: "2", label: "4〜6秒", points: 2 }, { value: "3", label: "6秒超", points: 3 }]),
      ch("腹水", "ascites", [{ value: "1", label: "なし", points: 1 }, { value: "2", label: "軽度", points: 2 }, { value: "3", label: "中等度以上", points: 3 }]),
      ch("脳症", "enceph", [{ value: "1", label: "なし", points: 1 }, { value: "2", label: "1〜2度", points: 2 }, { value: "3", label: "3〜4度", points: 3 }]),
    ],
    prefill: (c) => ({ bil: lab("T-Bil")(c), alb: lab("Alb")(c) }),
    notes: (c) => {
      const inr = latestLab(c.patient, "PT-INR", c.nowAbs);
      const out: Record<string, string> = {};
      if (inr) out.pt = `PT-INR ${inr.value}（${pickedText(inr, c.today)}）`;
      return out;
    },
    compute: (v) => {
      const s = childPugh({ bil: num(v, "bil"), alb: num(v, "alb"), pt: num(v, "pt"), ascites: num(v, "ascites"), enceph: num(v, "enceph") });
      const out = scored("Child-Pugh", s, { suffix: "点" });
      return { ...out, results: [{ ...out.results[0], label: s.grade ?? undefined }], line: out.line && s.grade ? out.line.replace(/点（/, `点 ${s.grade}（`) : null };
    },
  },
  {
    key: "meld",
    name: "MELD",
    group: "肝",
    fields: [n("T-Bil", "bil", "mg/dL"), n("PT-INR", "inr", ""), n("Cre", "cre", "mg/dL")],
    prefill: (c) => ({ bil: lab("T-Bil")(c), inr: lab("PT-INR")(c), cre: lab("Cre")(c) }),
    compute: (v) => {
      const bil = num(v, "bil"), inr = num(v, "inr"), cre = num(v, "cre");
      const r = meld(bil, inr, cre);
      const bounded = r ? ([["T-Bil", bil, r.used.bil], ["PT-INR", inr, r.used.inr], ["Cre", cre, r.used.cre]] as const).filter(([, a, b]) => a !== b).map(([k, , b]) => `${k} は ${b} として計算`) : [];
      return { results: [{ value: r ? fmt(r.score) : null }], parts: bounded, line: r ? `MELD ${fmt(r.score)}（T-Bil ${bil}、PT-INR ${inr}、Cre ${cre}）` : null };
    },
  },
  {
    key: "abx-conc",
    name: "抗菌薬の濃度",
    group: "薬",
    fields: [
      n("薬剤量", "amount", "mg", { row: "sol" }),
      n("総量", "volume", "mL", { row: "sol" }),
      ch("投与", "mode", [{ value: "1回", label: "1回量を時間で" }, { value: "持続", label: "1日量を24時間で" }]),
      n("1回量", "dose", "mg", { row: "once", show: (v) => v.mode !== "持続" }),
      n("投与時間", "minutes", "分", { row: "once", show: (v) => v.mode !== "持続" }),
      n("1日量", "daily", "mg", { show: (v) => v.mode === "持続" }),
    ],
    compute: (v) => {
      const amount = num(v, "amount"), volume = num(v, "volume");
      const c = concentration(amount, volume);
      const conc = c === null ? null : `濃度 ${fmt(c, 2)} mg/mL（${amount} mg／${volume} mL）`;
      if (v.mode === "持続") {
        const daily = num(v, "daily");
        const rate = continuousRate(daily, c);
        return { results: [{ label: "濃度", value: c === null ? null : fmt(c, 2), unit: "mg/mL" }, { label: "速さ", value: rate === null ? null : fmt(rate), unit: "mL/h" }], line: conc && (rate === null ? conc : `${conc}・1日 ${daily} mg を24時間で ${fmt(rate)} mL/h`) };
      }
      const dose = num(v, "dose"), minutes = num(v, "minutes");
      const r = intermittentRate(dose, c, minutes);
      const volumeOnly = c !== null && dose !== null && dose > 0 ? dose / c : null;
      return {
        results: [{ label: "濃度", value: c === null ? null : fmt(c, 2), unit: "mg/mL" }, { label: "液量", value: volumeOnly === null ? null : fmt(volumeOnly), unit: "mL" }, { label: "速さ", value: r ? fmt(r.mlPerH) : null, unit: "mL/h" }],
        line: conc && (r ? `${conc}・1回 ${dose} mg＝${fmt(r.volumeMl)} mL を${minutes}分で ${fmt(r.mlPerH)} mL/h` : volumeOnly !== null ? `${conc}・1回 ${dose} mg＝${fmt(volumeOnly)} mL` : conc),
      };
    },
  },
];

/** 一覧の並び（群の見出しの順）。 */
export const CALC_GROUPS = [...new Set(CALCS.map((c) => c.group))];

/** 初期値（カルテ）と医師の入れ直しを重ねる。overrides の "" は「消した」。 */
export function resolveValues(def: CalcDef, filled: Record<string, Filled | null>, overrides: Record<string, string> | undefined): Values {
  const v: Values = {};
  for (const f of def.fields) v[f.key] = overrides && f.key in overrides ? overrides[f.key] : filled[f.key]?.value ?? "";
  return v;
}

/** その計算の初期値（例外を出さない。拾えないときは空）。 */
export function prefillOf(def: CalcDef, c: Ctx): Record<string, Filled | null> {
  try {
    return def.prefill?.(c) ?? {};
  } catch {
    return {};
  }
}
