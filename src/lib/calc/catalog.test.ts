import { describe, expect, it } from "vitest";
import { sofaScore, sofaFacts } from "../icu/sofa";
import { emptyIcuRecords } from "../icu/types";
import { icuFixture, icuPatient } from "../icu/test-fixture";
import type { Patient } from "../types";
import { CALCS, prefillOf, resolveValues, type Ctx } from "./catalog";
import { latestLab, latestWeight, whenText } from "./chart";
import { sofaFromMaterial, sofaLine, sofaPrefill, type SofaMaterial } from "./sofa";

const today = { y: 2026, m: 11, d: 7 };
const ward: Patient = {
  ...structuredClone(icuPatient),
  id: "ward-test",
  sex: "女",
  age: 80,
  ward: "5階東",
  weightKg: 50,
  daily: [{ day: -1, weightKg: 48 }],
  vitals: [
    { day: -1, time: "06:00", rr: 24, sbp: 98, dbp: 50, spo2: 91, o2: "室内気", gcs: { e: 3, v: 4, m: 6 } },
    { day: 0, time: "23:00", rr: 12, sbp: 150, dbp: 80 },
  ],
  labs: [
    { day: -1, time: "06:00", values: { Na: 156, Glu: 300, Ca: 8, Alb: 2, Cl: 110, HCO3: 20, Cre: 1.4, BUN: 30, PaO2: 70, PaCO2: 35, Plt: 12, "T-Bil": 1.5, "PT-INR": 1.3 } },
    { day: 0, time: "23:00", values: { Na: 170 } },
  ],
};
const ctx = (p: Patient, icu = emptyIcuRecords()): Ctx => ({ patient: p, nowAbs: 8 * 60, today, icu, icuId: p.id, entries: [] });
const run = (key: string, c: Ctx, overrides?: Record<string, string>) => {
  const def = CALCS.find((d) => d.key === key)!;
  const filled = prefillOf(def, c);
  const values = resolveValues(def, filled, overrides);
  return { filled, values, out: def.compute(values, c) };
};

describe("カルテから拾う値", () => {
  it("今より後の記録は使わない。体重は日ごとの記録の最新、なければプロファイル", () => {
    expect(latestLab(ward, "Na", 8 * 60)).toEqual({ value: 156, day: -1, time: "06:00" });
    expect(latestWeight(ward)).toEqual({ value: 48, day: -1, time: null });
    expect(latestWeight({ ...ward, daily: [] })).toEqual({ value: 50, day: null, time: null });
    expect([whenText(0, "08:00", today), whenText(-1, "06:00", today), whenText(-2, null, today), whenText(null, null, today)]).toEqual(["今日 08:00", "昨日 06:00", "11/5", "プロファイル"]);
  });
});

describe("計算の一覧", () => {
  it("どの計算にも名前・群・欄があり、key は重ならない", () => {
    expect(new Set(CALCS.map((c) => c.key)).size).toBe(CALCS.length);
    for (const c of CALCS) {
      expect(c.fields.length).toBeGreaterThan(0);
      expect(new Set(c.fields.map((f) => f.key)).size).toBe(c.fields.length);
    }
  });
  it("自由水欠乏：Na・体重・係数（80歳女性は 0.45）をカルテから入れ、1行にする", () => {
    const { filled, out } = run("free-water", ctx(ward));
    expect(filled.na).toEqual({ value: "156", from: "昨日 06:00" });
    expect(filled.weight?.value).toBe("48");
    expect(filled.factor?.value).toBe("0.45");
    expect(out.results[0].value).toBe("2.5");
    expect(out.line).toBe("自由水欠乏 2.5 L（Na 156、体重 48kg、係数 0.45）");
  });
  it("医師が押して入れ直した値を使い、消した欄は空になる", () => {
    const { out } = run("free-water", ctx(ward), { factor: "0.5", weight: "60" });
    expect(out.line).toBe("自由水欠乏 3.4 L（Na 156、体重 60kg、係数 0.5）");
    expect(run("free-water", ctx(ward), { na: "" }).out.line).toBeNull();
  });
  it("補正 Na は 1.6 と 2.4 の両方、補正 Ca、AG は基準の Alb を選んでから補正", () => {
    expect(run("corrected-na", ctx(ward)).out.line).toBe("補正 Na 159.2（係数1.6）・160.8（係数2.4）、Na 156・血糖 300");
    expect(run("corrected-ca", ctx(ward)).out.line).toBe("補正 Ca 10 mg/dL（Ca 8、Alb 2）");
    expect(run("anion-gap", ctx(ward)).out.line).toBe("AG 26（Na 156、Cl 110、HCO3 20）");
    expect(run("anion-gap", ctx(ward), { ref: "4.4" }).out.line).toBe("AG 26（Na 156、Cl 110、HCO3 20）・Alb 補正 AG 32（Alb 2、基準 4.4）");
  });
  it("CCr・eGFR は抗菌薬の量と同じ式（renalFunction）", () => {
    const { out } = run("renal", ctx(ward));
    const ccr = ((140 - 80) * 48) / (72 * 1.4) * 0.85;
    expect(out.results[0].value).toBe(String(Number(ccr.toFixed(1))));
    expect(out.line).toContain("（Cre 1.4、80歳 女）");
  });
  it("P/F：採血時のバイタルが室内気なら FiO2 0.21", () => {
    const { filled, out } = run("pf", ctx(ward));
    expect(filled.fio2).toEqual({ value: "0.21", from: "室内気（昨日 06:00）" });
    expect(out.results[0].value).toBe("333");
    expect(out.line).toContain("A-aDO2 36 mmHg（PaCO2 35、大気圧 760）");
  });
  it("qSOFA は最新のバイタルと GCS < 15 の意識変容", () => {
    const { filled, out } = run("qsofa", ctx(ward));
    expect(filled.altered).toEqual({ value: "あり", from: "GCS 13（昨日 06:00）" });
    expect(out.line).toBe("qSOFA 3（呼吸数1 意識変容1 収縮期血圧1）");
  });
  it("A-DROP は脱水と意識を医師が選ぶまで合計を出さない", () => {
    const first = run("adrop", ctx(ward));
    expect(first.out.line).toBeNull();
    expect(first.out.missing).toEqual(["O 意識"]);
    expect(run("adrop", ctx(ward), { altered: "なし" }).out.line).toBe("A-DROP 2（A1 D1 R0 O0 P0）");
  });
  it("NIHSS は15項目を押すと1行になる", () => {
    const all = Object.fromEntries(CALCS.find((c) => c.key === "nihss")!.fields.map((f) => [f.key, "0"]));
    const { out } = run("nihss", ctx(ward), { ...all, "1a": "1", "5b": "UN" });
    expect(out.line).toBe("NIHSS 1（1a:1 1b:0 1c:0 2:0 3:0 4:0 5a:0 5b:UN 6a:0 6b:0 7:0 8:0 9:0 10:0 11:0）");
  });
  it("Child-Pugh の PT 欄には PT-INR を参考に出し、点は医師が選ぶ", () => {
    const def = CALCS.find((c) => c.key === "child-pugh")!;
    expect(def.notes?.(ctx(ward))).toEqual({ pt: "PT-INR 1.3（昨日 06:00）" });
    expect(run("child-pugh", ctx(ward), { pt: "1", ascites: "1", enceph: "1" }).out.line).toBe("Child-Pugh 7点 B（T-Bil1 Alb3 PT1 腹水1 脳症1）");
  });
  it("抗菌薬の濃度：濃度・1回の液量・mL/h、持続は1日量から", () => {
    expect(run("abx-conc", ctx(ward), { amount: "2000", volume: "100", dose: "1000", minutes: "60" }).out.line).toBe("濃度 20 mg/mL（2000 mg／100 mL）・1回 1000 mg＝50 mL を60分で 50 mL/h");
    expect(run("abx-conc", ctx(ward), { amount: "2000", volume: "100", mode: "持続", daily: "6000" }).out.line).toBe("濃度 20 mg/mL（2000 mg／100 mL）・1日 6000 mg を24時間で 12.5 mL/h");
  });
});

describe("SOFA（どの患者でも。点は icu/sofa.ts の sofaScore）", () => {
  const material: SofaMaterial = { pao2: 80, fio2: 0.5, support: true, plt: 12, bil: 1, map: 65, gamma: { nad: 0.2 }, gcs: 9, cre: 1.3, urine: null };
  it("材料から sofaScore と同じ点を出し、1行にする", () => {
    const r = sofaFromMaterial(material);
    expect(r.items.map((i) => i.score)).toEqual([3, 1, 0, 4, 3, 1]);
    expect(sofaLine(r)).toBe("SOFA 12（呼吸3 凝固1 肝0 循環4 神経3 腎1）");
  });
  it("呼吸補助が未選択なら呼吸は不明、24時間尿量を入れたときだけ尿量の点", () => {
    expect(sofaFromMaterial({ ...material, support: null }).missing).toEqual(["呼吸"]);
    expect(sofaLine(sofaFromMaterial({ ...material, support: null }))).toBeNull();
    expect(sofaFromMaterial({ ...material, urine: 150 }).items[5].score).toBe(4);
  });
  it("ICU の患者は今日の ICU 記録（sofaFacts）の材料が入り、点は ICU 記録の SOFA と同じ", () => {
    const r = icuFixture();
    const nowAbs = 24 * 60 - 1;
    const filled = sofaPrefill(icuPatient, r, icuPatient.id, nowAbs, today);
    expect(filled.pao2?.value).toBe("160");
    expect(filled.fio2?.value).toBe("0.4");
    expect(filled.support?.value).toBe("あり");
    expect(filled.nad?.value).toBe("0.12");
    expect(filled.urine?.value).toBe("720");
    const def = CALCS.find((c) => c.key === "sofa")!;
    const out = def.compute(resolveValues(def, filled, undefined), { patient: icuPatient, nowAbs, today, icu: r, icuId: icuPatient.id, entries: [] });
    expect(out.results[0].value).toBe(String(sofaScore(sofaFacts(icuPatient, r, 0, nowAbs)).total));
  });
  it("一般病棟の患者は最新の値と室内気から入り、足りない欄は空のまま", () => {
    const filled = sofaPrefill(ward, emptyIcuRecords(), ward.id, 8 * 60, today);
    expect(filled.pao2).toEqual({ value: "70", from: "昨日 06:00" });
    expect(filled.fio2?.value).toBe("0.21");
    expect(filled.support?.value).toBe("なし");
    expect(filled.map).toEqual({ value: "66", from: "98/50（昨日 06:00）" });
    expect(filled.gcs?.value).toBe("13");
    expect(filled.urine).toBeNull();
    expect(filled.nad).toBeNull();
  });
});
