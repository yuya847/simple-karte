import { describe, expect, it } from "vitest";
import { checkDraft, isReady, newProcedureDraft, toOrder, type CheckContext, type ProcedureDraft } from "./drafts";
import { procedureLines } from "./format";
import { hdText, hdUfRate } from "./procedures";
import type { HdOrder } from "./types";

const ctx = (weightKg?: number): CheckContext => ({
  activeOrders: [],
  labOrders: [],
  drafts: [],
  nowTime: "08:30",
  fmtDay: (d) => `D${d}`,
  describe: (o) => o.id,
  patientFacts: weightKg ? { sex: "女", age: 64, allergies: [], cre: null, heightCm: 158, weightKg } : null,
});

const hd: HdOrder = {
  purpose: "緊急",
  method: "HD",
  minutes: 240,
  qb: 200,
  membrane: 1.5,
  anticoag: { drug: "ヘパリン", initial: 1000, hourly: 500 },
  uf: 2,
  dw: null,
  access: "透析用カテーテル（右内頸静脈）",
};
const draft = (h: HdOrder | null, over: Partial<ProcedureDraft> = {}): ProcedureDraft => ({ ...newProcedureDraft("PROC-HD", "hd1"), hd: h, schedule: { kind: "once" }, start: { day: 0, time: "13:00" }, ...over });

describe("透析指示", () => {
  it("works out the ultrafiltration rate and writes the sum", () => {
    expect(hdUfRate(2, 240, 55)).toEqual({ rate: 9.1, formula: "2,000mL ÷ 4時間 ÷ 55kg = 9.1mL/kg/時" });
  });

  it("writes the conditions on one line", () => {
    expect(hdText(hd)).toBe("4時間　Qb 200mL/分　膜面積 1.5m²　ヘパリン 初回1,000単位・持続500単位/時　除水 2L　透析用カテーテル（右内頸静脈）");
    expect(hdText({ ...hd, anticoag: { drug: "ナファモスタット", initial: null, hourly: 30 }, dw: 52 })).toContain("ナファモスタット 持続30mg/時　除水 2L　DW 52kg");
  });

  it("cannot be confirmed without the conditions", () => {
    const issues = checkDraft(draft(null), ctx(55));
    expect(issues.find((i) => i.key === "hd")!.level).toBe("stop");
    expect(isReady(issues)).toBe(false);
  });

  it("is ready when the rate is under the mark, and the order carries the conditions", () => {
    const issues = checkDraft(draft(hd), ctx(55));
    expect(issues.find((i) => i.key === "hd-uf")!.level).toBe("info");
    expect(isReady(issues)).toBe(true);
    const order = toOrder(draft(hd), ctx(55)).order!;
    expect(order).toMatchObject({ type: "procedure", code: "PROC-HD", hd });
    expect(procedureLines(order as never, { y: 2026, m: 11, d: 3 }).main).toBe("血液透析（透析指示）　HD（緊急）");
  });

  it("asks when the rate is over 15 mL/kg/時, and goes on once the doctor accepts it", () => {
    const fast = draft({ ...hd, uf: 3, minutes: 180 });
    const issues = checkDraft(fast, ctx(55));
    const ask = issues.find((i) => i.key === "hd-uf")!;
    expect(ask.level).toBe("ask");
    expect(ask.formula).toBe("3,000mL ÷ 3時間 ÷ 55kg = 18.2mL/kg/時");
    expect(isReady(issues)).toBe(false);
    const accepted = ask.choices![0].apply!(fast) as ProcedureDraft;
    expect(isReady(checkDraft(accepted, ctx(55)))).toBe(true);
  });

  it("says so when the chart has no weight", () => {
    const issues = checkDraft(draft(hd), ctx());
    expect(issues.find((i) => i.key === "hd-uf")!.message).toContain("体重がカルテにない");
    expect(isReady(issues)).toBe(true);
  });
});

describe("透析指示の持続（CHDF・CHD・CHF）", () => {
  const crrt: HdOrder = { ...hd, method: "CHDF", minutes: 0, uf: 0, qb: 100, membrane: 1.0, anticoag: { drug: "ナファモスタット", initial: null, hourly: 20 }, qd: 500, qf: 300, removalMlPerH: 50 };
  it("1回の時間はなく、QD・QF・除水を mL/時で1行に書き、開始から継続のオーダになる", () => {
    expect(hdText(crrt)).toBe("持続　Qb 100mL/分　QD 500mL/時　QF 300mL/時　除水 50mL/時　膜面積 1.0m²　ナファモスタット 持続20mg/時　透析用カテーテル（右内頸静脈）");
    expect(hdText({ ...crrt, method: "CHD", qf: undefined })).not.toContain("QF");
    const d = draft(crrt, { schedule: { kind: "continuous" } });
    const issues = checkDraft(d, ctx(55));
    expect(isReady(issues)).toBe(true);
    expect(issues.some((i) => i.key === "hd-uf")).toBe(false);
    const r = toOrder(d, ctx(55));
    expect("order" in r && r.order).toMatchObject({ code: "PROC-HD", schedule: { kind: "continuous" }, hd: { method: "CHDF", qd: 500, qf: 300, removalMlPerH: 50 } });
  });
});
