import { describe, expect, it } from "vitest";
import type { RxLine } from "../national/rx-lines";
import type { ImagingOrder, InjectionOrder, LabOrder, OrderEntry, ProcedureOrder } from "../types";
import { calculateOpdClaim, OPD_CODES, type OpdClaimInput } from "./opd-claim";

// Today is 2026-11-04 10:30. The visit's orders are from this morning.
let seq = 0;
const order = (o: ImagingOrder | InjectionOrder | LabOrder | ProcedureOrder, time = "09:00"): OrderEntry => ({ kind: "order", id: `o${++seq}`, day: 0, time, author: "山本", status: "有効", order: o });
const lab = (codes: string[], time = "09:10"): OrderEntry => order({ type: "lab", codes, collect: { day: 0, time }, priority: "至急" });
const rxLine = (drug: string, timings: RxLine["timings"] = ["朝"]): RxLine => ({ rp: 1, drug, perDose: 1, unit: "錠", timings, prn: null, maxPerDay: null, days: 28 });

function claim(over: Partial<OpdClaimInput> = {}) {
  return calculateOpdClaim({ today: "2026-11-04", nowTime: "10:30", visit: { id: "opd-6", name: "中谷 修", age: 71, kind: "再診", department: "総合診療科" }, entries: [], rx: [], ...over });
}
const codes = (r: ReturnType<typeof claim>) => r.acts.flatMap((a) => a.parts.flatMap((p) => p.lines.map((l) => l.code)));
const points = (r: ReturnType<typeof claim>, code: string) => r.acts.filter((a) => a.parts.some((p) => p.lines.some((l) => l.code === code))).reduce((s, a) => s + a.parts.reduce((t, p) => t + p.points, 0) * a.count, 0);

describe("外来の算定：初診料・再診料", () => {
  it("再診で何もない日：再診料 76点 ＋ 外来管理加算 52点 = 128点（A001、200床未満の病院）", () => {
    const r = claim();
    expect(r.month).toBe("2026-11");
    expect(r.day).toBe(4);
    expect(codes(r)).toEqual([OPD_CODES.再診料, OPD_CODES.外来管理加算]);
    expect(r.totalPoints).toBe(128);
    expect(r.acts[0].shikibetsu).toBe("12");
  });
  it("初診：初診料 291点（A000）", () => {
    const r = claim({ visit: { id: "opd-3", name: "吉村 拓也", age: 32, kind: "初診", department: "総合診療科" } });
    expect(codes(r)).toEqual([OPD_CODES.初診料]);
    expect(r.totalPoints).toBe(291);
    expect(r.acts[0].shikibetsu).toBe("11");
  });
  it("画像診断をした日は外来管理加算を算定しない（A001 注8）", () => {
    const r = claim({ entries: [order({ type: "imaging", modality: "X線", region: "R-CHEST", views: ["立位正面（PA）"], purpose: "咳", when: { day: 0, time: "09:30", priority: "至急" }, transport: "独歩" })] });
    expect(codes(r)).not.toContain(OPD_CODES.外来管理加算);
    expect(codes(r)).toContain("170000410"); // 写真診断
    expect(codes(r)).toContain("170027910"); // 単純撮影デジタル
    expect(r.acts.find((a) => a.shikibetsu === "12")?.basis).toContain("注8");
  });
});

describe("外来の算定：検体検査", () => {
  const r = claim({ entries: [lab(["SET-LYTES", "LAB-BUN", "LAB-CRE", "LAB-BNP"])] });
  it("実施料＋判断料（区分ごと）＋検体検査管理加算（Ⅰ）＋採血料", () => {
    const c = codes(r);
    expect(c).toContain("160162350"); // BNP
    expect(c).toContain("160061910"); // 生化学的検査（Ⅰ）判断料
    expect(c).toContain(OPD_CODES.検体検査管理加算1);
    expect(c).toContain(OPD_CODES.血液採取静脈);
    expect(points(r, OPD_CODES.血液採取静脈)).toBe(40);
    expect(r.issues.some((i) => i.text.includes("月1回"))).toBe(true);
  });
  it("検体検査は外来管理加算を妨げない", () => {
    expect(codes(r)).toContain(OPD_CODES.外来管理加算);
  });
  it("まだ採っていない検体は算定しない", () => {
    const later = claim({ entries: [lab(["LAB-CRP"], "15:00")] });
    expect(codes(later)).not.toContain("160054710");
    expect(later.issues.some((i) => i.text.includes("まだ採っていない"))).toBe(true);
  });
});

describe("外来の算定：処方箋料・注射・処置", () => {
  it("院外処方せん：処方箋料 60点（その他）、内服7種類以上は 32点", () => {
    const few = claim({ rx: [{ items: [rxLine("ORAL-A"), rxLine("ORAL-B")] }] });
    expect(codes(few)).toContain(OPD_CODES.処方箋料その他);
    expect(points(few, OPD_CODES.処方箋料その他)).toBe(60);
    const many = claim({ rx: [{ items: ["a", "b", "c", "d", "e", "f", "g"].map((d) => rxLine(`ORAL-${d}`)) }] });
    expect(codes(many)).toContain(OPD_CODES.処方箋料7種類以上);
    expect(points(many, OPD_CODES.処方箋料7種類以上)).toBe(32);
  });
  it("点滴（500mL未満・入院外）：手技料 53点 ＋ 薬剤料", () => {
    const r = claim({ entries: [order({ type: "injection", items: [{ drugCode: "INJ-NS100", amount: 1, unit: "本" }], route: "点滴静注", schedule: { kind: "once" }, start: { day: 0, time: "09:30" } })] });
    expect(codes(r)).toContain(OPD_CODES.点滴注射入院外500未満);
    const act = r.acts.find((a) => a.shikibetsu === "33")!;
    expect(act.parts[0].points).toBe(53);
    expect(act.parts[1].points).toBeGreaterThan(0);
  });
  it("外来では100cm²未満の創傷処置も算定し、外来管理加算は算定しない", () => {
    const r = claim({ entries: [order({ type: "procedure", code: "PROC-WOUND", site: "右前腕", area: "lt100", schedule: { kind: "once" }, start: { day: 0, time: "09:40" } } as unknown as ProcedureOrder)] });
    expect(codes(r)).toContain("140000610");
    expect(codes(r)).not.toContain(OPD_CODES.外来管理加算);
  });
  it("names what the prototype does not claim", () => {
    expect(claim().excluded.join("")).toContain("時間外");
    expect(claim().sources.join("")).toContain("医科診療行為マスター");
  });
});
