// どの患者でも使える SOFA。点の境は ICU 記録と同じ src/lib/icu/sofa.ts の sofaScore で出し、ここでは
// 画面の材料（医師が入れ直せる値）を SofaFacts にするだけ。材料の初期値は ICU 記録の今日の最悪値
// （sofaFacts）を使い、今日の記録がない項目はカルテの最新値を使う（日付を出す）。

import { abs } from "../flowsheet";
import { fio2At, ventAt } from "../icu/abg";
import { sofaFacts, sofaScore, type SofaFacts } from "../icu/sofa";
import type { IcuRecords } from "../icu/types";
import { mapOf } from "../icu/vitals";
import type { CalendarDate } from "../dates";
import type { Patient } from "../types";
import { latestBp, latestGcs, latestLab, oxygenAt, pickedText, whenText } from "./chart";
import { fmt } from "./formulas";

export const SOFA_DRUGS = [
  { key: "doa", name: "ドパミン", short: "DOA" },
  { key: "dob", name: "ドブタミン", short: "DOB" },
  { key: "nad", name: "ノルアドレナリン", short: "NAd" },
  { key: "ad", name: "アドレナリン", short: "Ad" },
] as const;
export type SofaDrugKey = (typeof SOFA_DRUGS)[number]["key"];

/** 画面の材料。support は呼吸補助（人工呼吸・NPPV・CPAP）。 */
export interface SofaMaterial {
  pao2: number | null;
  fio2: number | null;
  support: boolean | null;
  plt: number | null;
  bil: number | null;
  map: number | null;
  gamma: Partial<Record<SofaDrugKey, number | null>>;
  gcs: number | null;
  cre: number | null;
  /** 24時間の尿量（mL/日）。入れたときだけ使う。 */
  urine: number | null;
}

const EMPTY: SofaFacts = { inputs: {}, respiratory: [], platelets: [], bilirubin: [], maps: [], drugs: [], gcs: [], creatinine: [], urineMl: 0, urineHours: 0 };

/** 材料から点を出す（sofaScore そのまま）。呼吸補助が未選択なら呼吸は不明。 */
export function sofaFromMaterial(m: SofaMaterial) {
  const pf = m.pao2 !== null && m.fio2 !== null && m.fio2 >= 0.21 && m.fio2 <= 1 && m.pao2 >= 0 && m.support !== null ? m.pao2 / m.fio2 : null;
  const facts: SofaFacts = {
    ...EMPTY,
    respiratory: pf === null ? [] : [{ pf, support: m.support === true, basis: `PaO2 ${m.pao2} ÷ FiO2 ${m.fio2}` }],
    platelets: m.plt === null ? [] : [m.plt],
    bilirubin: m.bil === null ? [] : [m.bil],
    maps: m.map === null ? [] : [m.map],
    drugs: SOFA_DRUGS.flatMap((d) => {
      const g = m.gamma[d.key];
      return g !== null && g !== undefined && Number.isFinite(g) && g > 0 ? [{ name: d.name, gamma: g }] : [];
    }),
    gcs: m.gcs === null ? [] : [{ value: m.gcs, basis: "" }],
    creatinine: m.cre === null ? [] : [m.cre],
    urineMl: m.urine ?? 0,
    urineHours: m.urine === null ? 0 : 24,
  };
  return sofaScore(facts);
}

const LINE_LABEL: Record<string, string> = { respiratory: "呼吸", coagulation: "凝固", liver: "肝", cardiovascular: "循環", cns: "神経", renal: "腎" };

/** 「SOFA 9（呼吸3 凝固0 肝0 循環3 神経3 腎0）」。合計が出ないときは null。 */
export function sofaLine(r: ReturnType<typeof sofaScore>): string | null {
  if (r.total === null) return null;
  return `SOFA ${r.total}（${r.items.map((i) => `${LINE_LABEL[i.key] ?? i.label}${i.score}`).join(" ")}）`;
}

/** 材料の初期値と、どの記録から取ったか。 */
export interface Filled {
  value: string;
  from: string;
}

const one = (patch: Partial<SofaFacts>, key: string) => sofaScore({ ...EMPTY, ...patch }).items.find((i) => i.key === key)?.score ?? -1;
const worst = <T>(rows: T[], score: (r: T) => number): T | undefined => [...rows].sort((a, b) => score(b) - score(a))[0];

/**
 * 材料の初期値。icuId は ICU 記録の患者 ID（救急外来の er: を外したもの）。
 * 呼吸：その日の血液ガスの PaO2 と、採血時の FiO2（ICU の呼吸器の設定。設定がなく、採血時のバイタルが
 * 室内気なら 0.21）。呼吸補助は ICU 記録の判定（sofaFacts）を使い、呼吸器の記録が1件もなければ「なし」。
 */
export function sofaPrefill(patient: Patient, icu: IcuRecords, icuId: string, nowAbs: number, today: CalendarDate): Record<string, Filled | null> {
  const p = { ...patient, id: icuId, labs: patient.labs.filter((l) => abs(l.day, l.time) <= nowAbs) };
  const facts = sofaFacts(p, icu, 0, nowAbs);
  const out: Record<string, Filled | null> = {};
  const todayAt = (time: string) => whenText(0, time, today);

  // 呼吸：今日の血液ガス、なければ最新の血液ガスの日。
  const gas = latestLab(p, "PaO2", nowAbs);
  const day = p.labs.some((l) => l.day === 0 && Number.isFinite(l.values.PaO2)) ? 0 : gas?.day ?? null;
  if (day !== null) {
    const dayFacts = day === 0 ? facts : sofaFacts(p, icu, day, nowAbs);
    type Row = { pao2: number; fio2: number | null; support: boolean | null; day: number; time: string; fromVent: boolean; from: string };
    const rows = p.labs.filter((l) => l.day === day && Number.isFinite(l.values.PaO2)).sort((a, b) => abs(b.day, b.time) - abs(a.day, a.time)).map((l): Row => {
      const t = abs(l.day, l.time);
      const base = { pao2: l.values.PaO2, day: l.day, time: l.time };
      const set = dayFacts.inputs.respiratory?.fio2 ?? fio2At(icu.vents, icuId, t);
      if (set !== null && set !== undefined) {
        const r = dayFacts.respiratory.find((x) => Math.abs(x.pf - l.values.PaO2 / set) < 1e-9);
        if (r) return { ...base, fio2: set, support: r.support, fromVent: true, from: ventAt(icu.vents, icuId, t)?.mode ?? "呼吸器" };
      }
      const air = oxygenAt(p, t);
      // 室内気は呼吸補助なし。
      if (air?.o2 === "室内気" && !ventAt(icu.vents, icuId, t)) return { ...base, fio2: 0.21, support: false, fromVent: false, from: `室内気（${whenText(air.day, air.time, today)}）` };
      return { ...base, fio2: null, support: null, fromVent: false, from: "" };
    });
    const pick = worst(rows, (x) => (x.fio2 === null ? -2 : one({ respiratory: [{ pf: x.pao2 / x.fio2, support: x.support === true, basis: "" }] }, "respiratory")));
    if (pick) {
      out.pao2 = { value: String(pick.pao2), from: whenText(pick.day, pick.time, today) };
      out.fio2 = pick.fio2 === null ? null : { value: String(pick.fio2), from: dayFacts.inputs.respiratory && pick.fromVent ? "ICU 記録の医師入力" : pick.from };
      out.support = pick.support === null ? null : { value: pick.support ? "あり" : "なし", from: pick.from };
    }
  }
  if (!out.support && !icu.vents.some((v) => v.patientId === icuId)) out.support = { value: "なし", from: "呼吸器の記録なし" };

  // 凝固・肝・腎：今日の最悪値、なければ最新。
  const lab = (code: string, rows: number[], pickWorst: (xs: number[]) => number) => {
    if (rows.length) {
      const v = pickWorst(rows);
      const r = p.labs.filter((l) => l.day === 0 && l.values[code] === v).sort((a, b) => abs(b.day, b.time) - abs(a.day, a.time))[0];
      return { value: String(v), from: r ? todayAt(r.time) : "今日" };
    }
    const last = latestLab(p, code, nowAbs);
    return last ? { value: String(last.value), from: pickedText(last, today) } : null;
  };
  out.plt = lab("Plt", facts.platelets, (xs) => Math.min(...xs));
  out.bil = lab("T-Bil", facts.bilirubin, (xs) => Math.max(...xs));
  out.cre = lab("Cre", facts.creatinine, (xs) => Math.max(...xs));

  // 循環：今日の MAP の最小と持続投与（ICU 記録）。
  if (facts.maps.length) out.map = { value: String(Math.min(...facts.maps)), from: "今日の最小" };
  else {
    const bp = latestBp(p, nowAbs);
    const m = bp ? mapOf(bp.sbp, bp.dbp) : null;
    out.map = bp && m !== null ? { value: String(m), from: `${bp.sbp}/${bp.dbp}（${whenText(bp.day, bp.time, today)}）` } : null;
  }
  for (const d of SOFA_DRUGS) {
    const gs = facts.drugs.filter((x) => (d.key === "ad" ? /アドレナリン/.test(x.name) && !/ノルアドレナリン/.test(x.name) : x.name.includes(d.name))).map((x) => x.gamma);
    out[d.key] = gs.length ? { value: fmt(Math.max(...gs), 3), from: "ICU 今日の最大" } : null;
  }

  // 中枢神経：今日の GCS の最小（ICU 記録の置き方の注記を含む）、なければ最新の GCS。
  const g = worst(facts.gcs, (x) => -x.value);
  if (g) out.gcs = { value: String(g.value), from: g.basis };
  else {
    const last = latestGcs(p, nowAbs);
    out.gcs = last && last.e && last.v && last.m ? { value: String(last.e + last.v + last.m), from: `E${last.e}V${last.v}M${last.m}（${whenText(last.day, last.time, today)}）` } : null;
  }

  // 尿量：ICU の時間表に今日の24時間分がそろったときだけ。
  out.urine = facts.urineHours === 24 ? { value: String(facts.urineMl), from: "ICU 時間表 24時間" } : null;
  return out;
}
