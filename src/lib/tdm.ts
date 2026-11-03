// TDM（治療薬物モニタリング）: vancomycin from two measured levels (peak and trough) in one dosing
// interval at steady state, with the one-compartment intermittent-infusion equations (Sawchuk-Zaske).
// Plain code with every formula shown. The pharmacist proposes, the doctor decides; nothing here
// recommends a dose. A single trough level does not give an AUC (that needs Bayesian software).

export interface Regimen {
  /** mg per dose. */
  dose: number;
  /** Dosing interval, hours. */
  tau: number;
  /** Infusion time, hours. */
  tinf: number;
}

export interface Levels {
  /** Peak sample: hours from the start of the infusion, and μg/mL. */
  peak: { t: number; c: number };
  /** Trough sample: hours before the next dose (0 = just before), and μg/mL. */
  trough: { before: number; c: number };
}

export interface TdmResult {
  k: number;
  halfLife: number;
  cmax: number;
  cmin: number;
  vd: number;
  cl: number;
  aucTau: number;
  auc24: number;
  /** AUC by the trapezoid (infusion) + exponential (elimination) parts, as a cross-check. */
  aucTrapezoid24: number;
  steps: string[];
}

const r = (x: number, d = 2) => Number(x.toFixed(d));

export function sawchukZaske(reg: Regimen, lv: Levels): TdmResult | { error: string } {
  const { dose, tau, tinf } = reg;
  const t1 = lv.peak.t;
  const t2 = tau - lv.trough.before;
  if (!(dose > 0 && tau > 0 && tinf > 0)) return { error: "投与量・投与間隔・点滴時間を入れてください。" };
  if (!(lv.peak.c > 0 && lv.trough.c > 0)) return { error: "ピークとトラフの濃度を入れてください。" };
  if (t1 < tinf) return { error: "ピークの採血は点滴が終わってから（点滴開始からの時間 ≧ 点滴時間）にしてください。" };
  if (t2 <= t1) return { error: "トラフの採血の時刻がピークより後になるようにしてください。" };
  if (lv.peak.c <= lv.trough.c) return { error: "ピークの濃度がトラフより高くなっていません。採血の時刻と値を確かめてください。" };
  const k = Math.log(lv.peak.c / lv.trough.c) / (t2 - t1);
  const cmax = lv.peak.c * Math.exp(k * (t1 - tinf));
  const cmin = lv.trough.c * Math.exp(-k * (tau - t2));
  const vd = ((dose / tinf) * (1 - Math.exp(-k * tinf))) / (k * (cmax - cmin * Math.exp(-k * tinf)));
  const cl = k * vd;
  const aucTau = dose / cl;
  const auc24 = (aucTau * 24) / tau;
  const aucTrap = (tinf * (cmax + cmin)) / 2 + (cmax - cmin) / k;
  const steps = [
    `k = ln(ピーク ÷ トラフ) ÷ 2点の間の時間 = ln(${lv.peak.c} ÷ ${lv.trough.c}) ÷ ${r(t2 - t1)} = ${r(k, 4)} /時`,
    `半減期 = 0.693 ÷ k = ${r(Math.LN2 / k, 1)} 時間`,
    `Cmax（点滴終了時）= ピーク × e^(k × ${r(t1 - tinf)}) = ${r(cmax, 1)} μg/mL`,
    `Cmin（次の投与の直前）= トラフ × e^(−k × ${r(tau - t2)}) = ${r(cmin, 1)} μg/mL`,
    `Vd = (投与量 ÷ 点滴時間) × (1 − e^(−k×点滴時間)) ÷ (k × (Cmax − Cmin × e^(−k×点滴時間))) = ${r(vd, 1)} L`,
    `CL = k × Vd = ${r(cl, 2)} L/時`,
    `AUC（1回の間隔）= 投与量 ÷ CL = ${r(aucTau, 0)}、AUC24 = × 24 ÷ ${tau} = ${r(auc24, 0)} μg·h/mL`,
  ];
  return { k, halfLife: Math.LN2 / k, cmax, cmin, vd, cl, aucTau, auc24, aucTrapezoid24: (aucTrap * 24) / tau, steps };
}

/** Predicted steady state for another regimen, with the patient's k and Vd from the levels. */
export function predict(res: Pick<TdmResult, "k" | "vd" | "cl">, reg: Regimen) {
  const { k, cl } = res;
  const cmax = ((reg.dose / reg.tinf) * (1 - Math.exp(-k * reg.tinf))) / (cl * (1 - Math.exp(-k * reg.tau)));
  const cmin = cmax * Math.exp(-k * (reg.tau - reg.tinf));
  const auc24 = (reg.dose * (24 / reg.tau)) / cl;
  return { cmax, cmin, auc24 };
}

/** Hours between two clock readings on day offsets. */
export const hoursBetween = (a: { day: number; time: string }, b: { day: number; time: string }) => {
  const m = (x: { day: number; time: string }) => x.day * 1440 + Number(x.time.slice(0, 2)) * 60 + Number(x.time.slice(3, 5));
  return (m(b) - m(a)) / 60;
};

/** A TDM report from the pharmacist to the doctor (the proposal is the pharmacist's own words). */
export interface TdmReport {
  id: string;
  patientId: string;
  drug: string;
  regimen: Regimen;
  levels: Levels;
  auc24: number;
  cmin: number;
  proposal: string;
  at: string;
  by: string;
  status: "医師へ報告" | "確認済";
}

/** Targets shown next to the result (filled from the guideline; the decision stays with people). */
export const VCM_GUIDE = "日本化学療法学会・日本TDM学会「抗菌薬TDM臨床実践ガイドライン2022」";
export const VCM_TARGET: { auc24: [number, number] | null; source: string } = { auc24: [400, 600], source: `${VCM_GUIDE} p.12` };

/** What the guideline says about sampling and kidneys (shown as reference; the decision stays with people). */
export const VCM_NOTES: { text: string; source: string }[] = [
  { text: "トラフは投与前30分以内、ピークは点滴終了1〜2時間後に採血する", source: `${VCM_GUIDE} p.12` },
  { text: "軽中等症・ソフトを使わないときの初回は、4〜5回目の投与の直前（3日目）", source: `${VCM_GUIDE} p.12` },
  { text: "重症・腎機能低下・腎障害のリスクがある症例は、ピークとトラフの2点採血がすすめられている", source: `${VCM_GUIDE} p.10` },
  { text: "成人ではトラフ値だけで効果と安全の両方を満たす目標は設定できないとされる", source: `${VCM_GUIDE} p.13` },
  { text: "eGFR 30未満では代わりの薬も考える", source: `${VCM_GUIDE} p.19` },
];

/** mg per dose and the schedule from a vancomycin injection order, when they can be read. */
export function regimenFromOrder(o: { items: { drugCode: string; amount: number; unit: string }[]; schedule: { kind: string; hours?: number }; minutesPerDose?: number }): Partial<Regimen> {
  const it = o.items.find((x) => x.drugCode.startsWith("INJ-VCM"));
  if (!it) return {};
  const mg = it.unit === "g" ? it.amount * 1000 : it.unit === "mg" ? it.amount : it.unit === "V" || it.unit === "瓶" ? it.amount * 500 : undefined;
  return { dose: mg, tau: o.schedule.kind === "every_hours" ? o.schedule.hours : undefined, tinf: o.minutesPerDose ? o.minutesPerDose / 60 : undefined };
}
