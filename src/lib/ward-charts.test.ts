import { describe, expect, it } from "vitest";
import { dpcMonth } from "./billing/dpc-claim";
import { FICTIONAL_COEFFICIENT } from "./billing/dpc";
import { DEFAULT_OPTIONS, type ClaimInput } from "./billing/model";
import { patientMonthPayload } from "./billing/payload";
import { dietAt, nextMeal } from "./diet";
import { findPhysio } from "./exams";
import { abs } from "./flowsheet";
import { findDrug, findLab, findOralDrug, findSet } from "./master";
import { findDisease } from "./masters/byomei";
import { news2 } from "./news2";
import { flagsFor, leaveFlags } from "./patient-flags";
import { PATIENTS } from "./patients";
import { PROCEDURES } from "./procedures";
import { PANIC_LIMITS, resultsOf } from "./results";
import type { OrderEntry } from "./types";
import { BEDS, OTHER_FLOOR_BEDS, doctorFor, isolationFor } from "./ward";
import { WARD_CHARTS, WARD_CHART_DIAGNOSES, WARD_CHART_DIETS, WARD_CHART_DX, WARD_CHART_PATIENTS, buildWardCharts, chartIdOf, isWardChart, withChartDiagnoses, withChartDiets, withCharts } from "./ward-charts";

const others = [...BEDS, ...OTHER_FLOOR_BEDS].filter((b) => b.other);
const chartOf = (name: string) => WARD_CHART_PATIENTS.find((p) => p.name === name)!;
const ordersOf = (name: string) => chartOf(name).history.filter((e): e is OrderEntry => e.kind === "order");

describe("every other-team inpatient has a small fictional chart", () => {
  it("one chart per bed, linked from the bed, with the bed's person", () => {
    expect(WARD_CHARTS).toHaveLength(others.length);
    for (const b of others) {
      const p = WARD_CHART_PATIENTS.find((x) => x.id === chartIdOf(b.room, b.bed))!;
      expect(p).toMatchObject({ name: b.other!.name, sex: b.other!.sex, age: b.other!.age, department: b.other!.department, room: b.room, attending: doctorFor(b.other!.department) });
    }
    const linked = withCharts([...BEDS, ...OTHER_FLOOR_BEDS]);
    expect(linked.every((b) => !!b.patientId)).toBe(true);
    // The team's beds keep their own patients; the other beds keep the placeholder too.
    expect(linked.filter((b) => PATIENTS.some((p) => p.id === b.patientId))).toHaveLength(BEDS.filter((b) => b.patientId).length);
    expect(linked.filter((b) => b.other).every((b) => isWardChart(b.patientId!))).toBe(true);
  });

  it("numbers do not clash with the team's patients or with today's admissions (9002…)", () => {
    const ids = WARD_CHART_PATIENTS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => /^9003\d{4}$/.test(id))).toBe(true);
    expect(PATIENTS.some((p) => isWardChart(p.id))).toBe(false);
  });

  it("is made the same way every time (no randomness at run time)", () => {
    expect(JSON.stringify(buildWardCharts())).toBe(JSON.stringify(WARD_CHARTS));
    expect(chartOf("岡部 正二").id).toBe("90035010");
    expect(chartOf("片山 ひさ").id).toBe("90036020");
    expect(chartOf("堀 誠").id).toBe("90035051");
  });

  it("every name has a katakana reading", () => {
    for (const p of WARD_CHART_PATIENTS) expect(p.kana, p.name).toMatch(/^[ァ-ヶー]+ [ァ-ヶー]+$/);
  });

  it("admitted 0〜30 days ago; each has an admission note, vitals around today and one lab set", () => {
    for (const p of WARD_CHART_PATIENTS) {
      expect(p.admittedOn).toBeGreaterThanOrEqual(-30);
      expect(p.admittedOn).toBeLessThanOrEqual(0);
      expect(p.history.some((e) => e.kind === "note" && e.role === "医師" && e.day === p.admittedOn)).toBe(true);
      expect(p.vitals.length).toBeGreaterThanOrEqual(2);
      expect(p.vitals.at(-1)).toMatchObject({ day: 0, time: "06:00" });
      expect(p.vitals.every((v, i) => i === 0 || abs(v.day, v.time) > abs(p.vitals[i - 1].day, p.vitals[i - 1].time))).toBe(true);
      expect(p.labs).toHaveLength(1);
      expect(abs(p.labs[0].day, p.labs[0].time)).toBeGreaterThan(abs(p.admittedOn, "00:00"));
    }
  });

  it("this morning's vitals do not reach NEWS2 5 (the charts are calm on purpose)", () => {
    for (const p of WARD_CHART_PATIENTS) expect(news2(p.vitals.at(-1)!).total, p.name).toBeLessThan(5);
  });

  it("lab values have no panic values, except the creatinine of 末期腎不全 before dialysis", () => {
    for (const p of WARD_CHART_PATIENTS) {
      const panic = resultsOf(p, PANIC_LIMITS).flatMap((i) => i.panic.map((h) => h.code));
      expect(panic, p.name).toEqual(WARD_CHART_DIAGNOSES[p.id][0].name === "末期腎不全" ? ["Cre"] : []);
    }
  });
});

describe("only codes of the masters", () => {
  it("disease names and codes are the official 傷病名マスター's, unchanged", () => {
    for (const [code, name, icd10] of WARD_CHART_DX) {
      const m = findDisease(code);
      expect(m?.name, code).toBe(name);
      expect(m?.icd10, code).toBe(icd10);
    }
    for (const list of Object.values(WARD_CHART_DIAGNOSES)) {
      expect(list.filter((d) => d.main)).toHaveLength(1);
      for (const d of list) expect(WARD_CHART_DX.some(([c, n, i]) => c === d.code && n === d.name && i === d.icd10)).toBe(true);
    }
  });

  it("drugs, tests and procedures are this app's", () => {
    for (const p of WARD_CHART_PATIENTS)
      for (const e of p.history) {
        if (e.kind !== "order") continue;
        const o = e.order;
        if (o.type === "injection") for (const it of o.items) expect(findDrug(it.drugCode), it.drugCode).toBeTruthy();
        if (o.type === "prescription") expect(findOralDrug(o.drugCode), o.drugCode).toBeTruthy();
        if (o.type === "lab") for (const c of o.codes) expect(findLab(c) ?? findSet(c), c).toBeTruthy();
        if (o.type === "procedure") expect(PROCEDURES.some((x) => x.code === o.code), o.code).toBe(true);
        if (o.type === "physio") expect(findPhysio(o.test), o.test).toBeTruthy();
      }
  });
});

describe("the bed's note becomes facts of the record", () => {
  it("新入院 → admitted today (at night, from the ED)", () => {
    for (const name of ["今井 武", "高田 由美"]) expect(chartOf(name).admittedOn).toBe(0);
  });

  it("明日退院 → a 退院 order for tomorrow (at the ward's planned time where there is one)", () => {
    const leave = (name: string) => ordersOf(name).find((e) => e.order.type === "procedure" && e.order.code === "PROC-LEAVE")?.order;
    expect(leave("堀 誠")).toMatchObject({ leave: { kind: "退院", from: { day: 1, time: "10:00" } } });
    expect(leave("杉本 進")).toMatchObject({ leave: { kind: "退院", from: { day: 1, time: "11:00" } } });
    for (const name of ["荒木 洋子", "山口 正夫"]) expect(leave(name)).toMatchObject({ leave: { kind: "退院", from: { day: 1 } } });
  });

  it("酸素投与中 → an oxygen order running now and the mark", () => {
    for (const name of ["岡部 正二", "片山 ひさ"]) {
      const p = chartOf(name);
      expect(flagsFor(p, ordersOf(name), abs(0, "09:00")).some((f) => f.label.startsWith("酸素"))).toBe(true);
      expect(p.vitals.at(-1)?.o2).toMatch(/^鼻カニュラ/);
    }
  });

  it("飛沫予防策 → the infection names the precaution (and only there)", () => {
    for (const p of WARD_CHART_PATIENTS) {
      const note = others.find((b) => chartIdOf(b.room, b.bed) === p.id)!.other!.note ?? "";
      expect(isolationFor(p.infections), p.name).toBe(note.includes("飛沫予防策") ? "飛沫予防策" : null);
    }
  });

  it("転倒注意 → the caution (and only there)", () => {
    for (const p of WARD_CHART_PATIENTS) {
      const note = others.find((b) => chartIdOf(b.room, b.bed) === p.id)!.other!.note ?? "";
      expect(p.cautions, p.name).toEqual(note.includes("転倒注意") ? ["転倒注意"] : []);
    }
  });

  it("術後1日目・2日目 → the operation note on that day", () => {
    const opNote = (name: string) => chartOf(name).history.find((e) => e.kind === "note" && !!e.text?.includes("を行った"));
    expect(opNote("宮崎 達也")?.day).toBe(-2);
    expect(opNote("金子 博之")?.day).toBe(-1);
    expect(opNote("本田 誠一")?.day).toBe(-1);
    expect(opNote("青木 トシ")?.day).toBeLessThan(0);
  });

  it("明日手術 → 絶食 from tomorrow morning, and no operation note yet", () => {
    const p = chartOf("高野 義男");
    expect(p.admissionDiagnosis).toMatch(/の予定）$/);
    expect(dietAt(WARD_CHART_DIETS, p.id, 1, "朝")?.kind).toBe("絶食");
    expect(p.history.some((e) => e.kind === "note" && !!e.text?.includes("を行った"))).toBe(false);
  });

  it("検査予定 → a test booked for tomorrow", () => {
    for (const name of ["西田 浩", "横山 文子"]) expect(ordersOf(name).some((e) => e.order.type === "physio" && e.order.when.day === 1)).toBe(true);
  });

  it("everyone has a diet for the next meal", () => {
    const next = nextMeal(abs(0, "09:00"));
    for (const p of WARD_CHART_PATIENTS) expect(dietAt(WARD_CHART_DIETS, p.id, next.day, next.meal), p.name).toBeTruthy();
  });
});

describe("records saved before the charts existed", () => {
  it("get the charts' diagnoses and diets back, without replacing what was saved", () => {
    const saved = { "90010231": [], [WARD_CHART_PATIENTS[0].id]: [] };
    const dx = withChartDiagnoses(saved);
    expect(dx["90010231"]).toEqual([]);
    expect(dx[WARD_CHART_PATIENTS[0].id]).toEqual([]);
    expect(dx[WARD_CHART_PATIENTS[1].id]).toEqual(WARD_CHART_DIAGNOSES[WARD_CHART_PATIENTS[1].id]);
    const mine = WARD_CHART_DIETS.find((d) => d.patientId === WARD_CHART_PATIENTS[2].id)!;
    const diets = withChartDiets([{ ...mine, id: "changed", kind: "絶食" }]);
    expect(diets.filter((d) => d.patientId === mine.patientId)).toEqual([{ ...mine, id: "changed", kind: "絶食" }]);
    expect(new Set(diets.map((d) => d.patientId)).size).toBe(WARD_CHART_PATIENTS.length);
  });

  it("the 明日退院 order shows as the list's mark", () => {
    expect(leaveFlags(ordersOf("山口 正夫")).map((f) => f.label)).toEqual(["明日 10:00 退院"]);
    expect(leaveFlags(ordersOf("岡部 正二"))).toEqual([]);
  });
});

describe("DPC works on these charts", () => {
  const TODAY = "2026-11-04";
  const dpcOf = (id: string) => {
    const p = WARD_CHART_PATIENTS.find((x) => x.id === id)!;
    const payload = patientMonthPayload(p, p.history, WARD_CHART_DIAGNOSES[id], DEFAULT_OPTIONS, { diets: WARD_CHART_DIETS });
    return dpcMonth({ ...(payload as unknown as Omit<ClaimInput, "month" | "today" | "nowTime">), today: TODAY, nowTime: "12:00" }, "2026-11", { coefficient: FICTIONAL_COEFFICIENT, transfer: null });
  };

  it("a 心不全 or 誤嚥性肺炎 or 尿路の感染症 chart gets a code of the carried classes", () => {
    const withClass = WARD_CHART_PATIENTS.filter((p) => /^(I50|J69|N10|N390|L03)/.test(WARD_CHART_DIAGNOSES[p.id][0].icd10 ?? ""));
    expect(withClass.length).toBeGreaterThan(3);
    for (const p of withClass) {
      const r = dpcOf(p.id);
      expect(r.outcome?.ok, p.name).toBe(true);
    }
  });

  it("the others are calculated too, and say why there is no code", () => {
    const p = WARD_CHART_PATIENTS.find((x) => WARD_CHART_DIAGNOSES[x.id][0].name === "大腿骨頚部骨折")!;
    const r = dpcOf(p.id);
    expect(r.outcome && !r.outcome.ok).toBe(true);
  });
});
