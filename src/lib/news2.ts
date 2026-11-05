// NEWS2（National Early Warning Score 2、英国 Royal College of Physicians 2017）. Plain code: each
// parameter's band and the total. What to do with a score is the ward's rule and the doctor's call;
// the app shows the score, which parameters scored, and the RCP's suggested monitoring as reference.
// SpO2 uses Scale 1 (Scale 2 for hypercapnic respiratory failure is chosen by a doctor; not here).

import type { VitalSign } from "./types";

export type Acvpu = "A" | "C" | "V" | "P" | "U";
export const ACVPU_LABEL: Record<Acvpu, string> = { A: "清明（A）", C: "新たな混乱（C）", V: "声に反応（V）", P: "痛みに反応（P）", U: "反応なし（U）" };

export interface News2Part {
  name: string;
  value: string;
  score: number;
}

export interface News2 {
  total: number;
  parts: News2Part[];
  /** A single parameter scored 3. */
  red: boolean;
  risk: "低" | "低〜中" | "中" | "高";
  /** RCP's suggested minimum monitoring (reference only). */
  monitoring: string;
  /** Parameters not measured (the score is then incomplete). */
  missing: string[];
}

const band = (v: number, rules: [number, number, number][]) => rules.find(([lo, hi]) => v >= lo && v <= hi)?.[2] ?? 0;

export const onOxygen = (o2?: string) => !!o2 && o2 !== "室内気" && !/^室内/.test(o2);

export const news2Risk = (total: number, red = false): News2["risk"] => total >= 7 ? "高" : total >= 5 ? "中" : red ? "低〜中" : "低";

export function news2(v: Pick<VitalSign, "rr" | "spo2" | "o2" | "sbp" | "hr" | "bt"> & { avpu?: Acvpu }): News2 {
  const parts: News2Part[] = [];
  const missing: string[] = [];
  const add = (name: string, value: number | undefined, score: (x: number) => number, unit = "") => {
    if (value === undefined || Number.isNaN(value)) missing.push(name);
    else parts.push({ name, value: `${value}${unit}`, score: score(value) });
  };
  add("呼吸数", v.rr, (x) => band(x, [[-Infinity, 8, 3], [9, 11, 1], [12, 20, 0], [21, 24, 2], [25, Infinity, 3]]), "/分");
  add("SpO2", v.spo2, (x) => band(x, [[-Infinity, 91, 3], [92, 93, 2], [94, 95, 1], [96, Infinity, 0]]), "%");
  parts.push({ name: "酸素", value: onOxygen(v.o2) ? (v.o2 ?? "") : "室内気", score: onOxygen(v.o2) ? 2 : 0 });
  add("収縮期血圧", v.sbp, (x) => band(x, [[-Infinity, 90, 3], [91, 100, 2], [101, 110, 1], [111, 219, 0], [220, Infinity, 3]]));
  add("脈拍", v.hr, (x) => band(x, [[-Infinity, 40, 3], [41, 50, 1], [51, 90, 0], [91, 110, 1], [111, 130, 2], [131, Infinity, 3]]), "/分");
  if (v.avpu) parts.push({ name: "意識", value: ACVPU_LABEL[v.avpu], score: v.avpu === "A" ? 0 : 3 });
  else missing.push("意識");
  add("体温", v.bt, (x) => (x <= 35.0 ? 3 : x <= 36.0 ? 1 : x <= 38.0 ? 0 : x <= 39.0 ? 1 : 2), "℃");
  const total = parts.reduce((s, p) => s + p.score, 0);
  const red = parts.some((p) => p.score === 3);
  const risk = news2Risk(total, red);
  const monitoring = total >= 7 ? "連続モニタリング" : total >= 5 || red ? "少なくとも1時間ごと" : total >= 1 ? "少なくとも4〜6時間ごと" : "少なくとも12時間ごと";
  return { total, parts, red, risk, monitoring, missing };
}
