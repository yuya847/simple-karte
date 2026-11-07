import { describe, expect, it } from "vitest";
import { ABX_RENAL, abxInjection, dialysisFromOrders, mepmBase, renalFunction, renalRow, renalWeight } from "./abx-renal";
import { DRUGS } from "./master";
import { SCENARIOS } from "./scenarios";
import { latestCre } from "./exams";
const lv = ABX_RENAL.find(d => d.code === "622622001")!;
const mepm = ABX_RENAL.find(d => d.code === "621948001")!;
describe("電子添文の腎機能用量", () => {
  it("CG式と日本人eGFR式、性別、実・理想・補正体重", () => {
    expect(renalFunction(68, "男", 60, 1).ccr).toBe(60);
    expect(renalFunction(68, "女", 60, 1).ccr).toBe(51);
    expect(renalFunction(68, "女", 60, 1).egfr).toBeCloseTo(194 * 68 ** -0.287 * 0.739);
    const p = { heightCm: 170, weightKg: 90 };
    expect(renalWeight(p, "actual")).toBe(90);
    expect(renalWeight(p, "ideal")).toBeCloseTo(63.58);
    expect(renalWeight(p, "adjusted")).toBeCloseTo(74.148);
  });
  it.each([0, -1, NaN, Infinity, null])("不正または未測定のCreを計算しない：%s", cre => expect(renalFunction(68, "男", 60, cre)).toEqual({ ccr: null, egfr: null }));
  it("小児・不明体重を成人式に代入しない", () => {
    expect(renalFunction(5, "男", 18, 0.3).ccr).toBeNull();
    expect(renalFunction(68, "男", null, 1).ccr).toBeNull();
  });
  it.each([[19.999, 48], [20, 24], [49.999, 24], [50, 24]])("丸めずLVFX区分を照合：%s", (ccr, hours) => expect(renalRow(lv, ccr, null)?.hours).toBe(hours));
  it("MEPMの10・25・26・50の境界と添文の空白を補間しない", () => {
    for (const value of [10, 25, 26, 50]) expect(renalRow(mepm, value, null)).not.toBeNull();
    for (const value of [25.01, 25.99, 50.01]) expect(renalRow(mepm, value, null)).toBeNull();
    expect(renalRow(mepm, 9.99, null)?.hours).toBe(24);
  });
  it("透析・不明値・未記載・TDMを通常表に代入しない", () => {
    for (const hd of ["HD", "CHDF"] as const) expect(renalRow(lv, 20, hd)).toBeNull();
    for (const v of [null, NaN, Infinity, -1]) expect(renalRow(lv, v, null)).toBeNull();
    expect(renalRow(ABX_RENAL.find(d => d.family === "VCM")!, 20, null)).toBeNull();
  });
  it("医師が選ぶ通常量・適応を添文の範囲で計算", () => {
    expect(mepmBase("化膿性髄膜炎", 6, 3)).toBe(2000);
    expect(mepmBase("発熱性好中球減少症", 3, 3)).toBe(1000);
    expect(mepmBase("化膿性髄膜炎以外の一般感染症", 1, 2)).toBe(500);
    expect(mepmBase("", 3, 3)).toBeNull();
    expect(mepmBase("重症・難治性感染症", 3, 2)).toBeNull();
  });
  it("薬・生食・量・回数・投与時刻を注射入力へ受け渡す", () => {
    const order = abxInjection(mepm, 20, null, 1000, "maintenance", { day: 0, time: "10:00" }, 100)!;
    expect(order.items).toEqual([{ drugCode: "621948001", amount: 500, unit: "mg" }, { drugCode: "INJ-NS100", amount: 100, unit: "mL" }]);
    expect(order.schedule).toEqual({ kind: "every_hours", hours: 12 });
    expect(order.doseTimes).toEqual(["10:00", "22:00"]);
    expect(order.start).toEqual({ day: 0, time: "10:00" });
    expect(abxInjection(mepm, 20, "HD", 1000, "maintenance", { day: 0, time: "10:00" }, 100)).toBeNull();
  });
  it("初日量は1回だけ、維持は48時間ごと・隔日", () => {
    expect(abxInjection(lv, 19, null, null, "first", { day: 0, time: "10:00" }, null)?.schedule).toEqual({ kind: "once" });
    const order = abxInjection(lv, 19, null, null, "maintenance", { day: 2, time: "10:00" }, null)!;
    expect(order.items[0].amount).toBe(250);
    expect(order.schedule).toEqual({ kind: "every_hours", hours: 48 });
    expect(order.dayPattern).toEqual({ kind: "every", n: 2 });
  });
  it("全注射品目は採用品目と結びつき、出典・版・節を持つ", () => {
    for (const item of ABX_RENAL) {
      if (item.route === "注射") expect(DRUGS.some(d => d.code === item.code), item.code).toBe(true);
      expect(item.source.url).toMatch(/^https:\/\/www.pmda.go.jp\//);
      expect(item.source.version).toContain("版");
      expect(item.source.sections).toContain("6");
    }
  });
  it("停止済み・未来の透析を現在の透析とみなさない", () => {
    const p = SCENARIOS.patients.find(p => dialysisFromOrders(p.history) === "HD")!;
    expect(dialysisFromOrders(p.history.map(e => e.kind === "order" ? { ...e, status: "中止" } : e))).toBeNull();
    expect(dialysisFromOrders(p.history.map(e => e.kind === "order" && e.order.type === "procedure" ? { ...e, order: { ...e.order, start: { day: 1 } } } : e))).toBeNull();
  });
  it("112人にCCr20前後と透析患者がいる", () => {
    expect(SCENARIOS.patients).toHaveLength(112);
    expect(SCENARIOS.patients.some(p => { const ccr = renalFunction(p.age, p.sex, p.weightKg, latestCre(p)?.value ?? null).ccr; return ccr !== null && ccr >= 19 && ccr <= 21; })).toBe(true);
    expect(SCENARIOS.patients.some(p => dialysisFromOrders(p.history) === "HD")).toBe(true);
  });
});
