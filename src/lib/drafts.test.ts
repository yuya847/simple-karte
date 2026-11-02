import { describe, expect, it } from "vitest";
import type { AiDraftResponse, AiOrder } from "./ai-schema";
import {
  checkDraft,
  draftsFromAi,
  isReady,
  ratePlan,
  resolvedCollect,
  toOrder,
  type CheckContext,
  type Draft,
  type InjectionDraft,
  type LabDraft,
  type StopDraft,
} from "./drafts";
import { PATIENTS } from "./patients";
import type { OrderEntry } from "./types";

const sakura = PATIENTS[0];
const orders = sakura.history.filter((e): e is OrderEntry => e.kind === "order");

function ctx(drafts: Draft[] = [], extra: Partial<CheckContext> = {}): CheckContext {
  return {
    activeOrders: orders.filter((o) => o.status === "有効"),
    labOrders: orders.filter((o) => o.order.type === "lab" && o.status !== "中止"),
    drafts,
    nowTime: "08:30",
    fmtDay: (d) => `D${d}`,
    describe: (o) => o.id,
    ...extra,
  };
}

const injection = (over: Partial<InjectionDraft> = {}): InjectionDraft => ({
  id: "d1",
  origin: "ai",
  sourceText: "",
  comment: null,
  kind: "injection",
  items: [{ drugCode: "INJ-VEENF500", said: "ヴィーンF", amount: 500, unit: "mL" }],
  route: null,
  schedule: { kind: "per_day", count: 2 },
  infusionMinutes: 1200,
  infusionScope: "unclear",
  rateMlPerH: null,
  prefer: null,
  start: { day: 0, time: null },
  days: null,
  duplicate: { action: "replace", orderId: "sakura-veenf" },
  ...over,
});

const vcm = (over: Partial<InjectionDraft> = {}): InjectionDraft =>
  injection({
    id: "vcm",
    items: [
      { drugCode: "INJ-VCM05", said: "VCM", amount: 1, unit: "g" },
      { drugCode: "INJ-NS100", said: "生食100", amount: 100, unit: "mL" },
    ],
    schedule: { kind: "every_hours", hours: 12 },
    infusionMinutes: 60,
    infusionScope: "per_dose",
    start: { day: 0, time: "10:00" },
    duplicate: null,
    ...over,
  });

const lab = (over: Partial<LabDraft> = {}): LabDraft => ({
  id: "l1",
  origin: "ai",
  sourceText: "",
  comment: null,
  kind: "lab",
  tests: [{ code: "LAB-CBC", said: "CBC" }],
  collect: { day: 1, when: "morning_routine", time: null, beforeDose: null },
  priority: null,
  cultureSets: null,
  duplicateOk: false,
  ...over,
});

const keyOf = (issues: ReturnType<typeof checkDraft>, key: string) => issues.find((i) => i.key === key);

describe("infusion time and rate", () => {
  it("asks whether '20時間で' is per bag or for the whole day, with both rates computed", () => {
    const issue = keyOf(checkDraft(injection(), ctx()), "scope");
    expect(issue?.level).toBe("ask");
    expect(issue?.choices?.map((c) => c.label)).toEqual(["1袋を20時間で（25mL/時）", "2袋を20時間で（50mL/時）"]);
    expect(issue?.choices?.[0].note).toContain("24時間を超えます");
  });

  it("computes the rate once the doctor picks 'whole day'", () => {
    const d = injection({ infusionScope: "whole_day" });
    expect(ratePlan(d)).toMatchObject({ rateMlPerH: 50, minutesPerDose: 600 });
    const issues = checkDraft(d, ctx());
    expect(keyOf(issues, "rate-calc")?.formula).toBe("500mL × 2 ÷ 20時間 = 50mL/時");
    expect(isReady(issues)).toBe(true);
  });

  it("stops when per-bag time × bags per day goes over 24 hours", () => {
    const issues = checkDraft(injection({ infusionScope: "per_dose" }), ctx());
    expect(keyOf(issues, "over-24h")?.level).toBe("stop");
    expect(isReady(issues)).toBe(false);
  });

  it("asks when the said rate and the said time disagree", () => {
    const issues = checkDraft(injection({ infusionScope: "whole_day", rateMlPerH: 80 }), ctx());
    const issue = keyOf(issues, "rate-mismatch");
    expect(issue?.level).toBe("ask");
    expect(issue?.message).toContain("50mL/時");
    expect(issue?.message).toContain("80mL/時");
  });

  it("uses the rate when the doctor prefers it", () => {
    expect(ratePlan(injection({ infusionScope: "whole_day", rateMlPerH: 80, prefer: "rate" }))).toMatchObject({ rateMlPerH: 80 });
  });

  it("computes the rate of a diluted antibiotic and fills the only route from the master", () => {
    const issues = checkDraft(vcm(), ctx());
    expect(keyOf(issues, "rate-calc")?.formula).toBe("100mL ÷ 1時間 = 100mL/時");
    expect(keyOf(issues, "route")?.level).toBe("info");
    expect(isReady(issues)).toBe(true);
    const { order } = toOrder(vcm(), ctx());
    expect(order).toMatchObject({ route: "点滴静注", minutesPerDose: 60, rateMlPerH: 100, start: { day: 0, time: "10:00" } });
  });
});

describe("units and master", () => {
  it("stops on a unit the drug cannot take", () => {
    const d = vcm({ items: [{ drugCode: "INJ-VCM05", said: "VCM", amount: 1, unit: "mL" }] });
    const issue = keyOf(checkDraft(d, ctx()), "unit-0");
    expect(issue?.level).toBe("stop");
    expect(issue?.message).toContain("g・mg・V");
  });

  it("stops on a drug that is not in the master and offers close names", () => {
    const d = vcm({ items: [{ drugCode: null, said: "バンコ", amount: 1, unit: "g" }] });
    const issue = keyOf(checkDraft(d, ctx()), "drug-0");
    expect(issue?.level).toBe("stop");
    expect(issue?.choices?.[0].label).toContain("バンコマイシン");
  });

  it("drops codes Claude made up", () => {
    const o: AiOrder = {
      kind: "injection",
      source_text: "X 1g",
      drugs: [{ code: "INJ-NOT-REAL", said: "X", amount: 1, unit: "g" }],
      route: null,
      frequency: { kind: "once", value: null },
      infusion: { minutes: null, applies_to: null, rate_ml_per_h: null },
      start: { day: "today", time: null },
      days: null,
      tests: [],
      collect: { day: "unspecified", when: "unspecified", time: null, before_dose_number: null, before_dose_drug_code: null },
      priority: null,
      culture_sets: null,
      comment: null,
    };
    const res: AiDraftResponse = { orders: [o], not_understood: [{ source_text: "いつもの", reason: "中身が分からない" }] };
    let n = 0;
    const drafts = draftsFromAi(res, () => `x${++n}`);
    expect((drafts[0] as InjectionDraft).items[0].drugCode).toBeNull();
    expect(drafts[1].kind).toBe("unclear");
  });
});

describe("duplicates and stops", () => {
  it("asks when the same fluid is already running, and replacing stops the old order", () => {
    const d = injection({ infusionScope: "whole_day", duplicate: null });
    const issue = keyOf(checkDraft(d, ctx()), "duplicate");
    expect(issue?.level).toBe("ask");
    const replaced = issue!.choices![0].apply!(d) as InjectionDraft;
    expect(isReady(checkDraft(replaced, ctx()))).toBe(true);
    expect(toOrder(replaced, ctx()).stopIds).toEqual(["sakura-veenf"]);
  });

  it("finds the one running order to stop", () => {
    const d: StopDraft = { id: "s", origin: "ai", sourceText: "CEZは中止", comment: null, kind: "stop", drugCode: "INJ-CEZ1", said: "CEZ", targetOrderId: null };
    const issues = checkDraft(d, ctx());
    expect(isReady(issues)).toBe(true);
    expect(toOrder(d, ctx()).stopIds).toEqual(["sakura-cez"]);
  });

  it("stops when there is nothing to stop", () => {
    const d: StopDraft = { id: "s", origin: "ai", sourceText: "", comment: null, kind: "stop", drugCode: "INJ-FRS20", said: "ラシックス", targetOrderId: null };
    expect(checkDraft(d, ctx())[0].level).toBe("stop");
  });

  it("asks when the same lab item is already ordered for that day", () => {
    const existing: OrderEntry = {
      kind: "order",
      id: "tomorrow-routine",
      day: 0,
      time: "08:00",
      author: "",
      status: "有効",
      order: { type: "lab", codes: ["SET-ROUTINE"], collect: { day: 1, time: "06:00" }, priority: "定時" },
    };
    const issues = checkDraft(lab(), ctx([], { labOrders: [existing] }));
    expect(keyOf(issues, "duplicate")?.choices?.map((c) => c.label)).toEqual(["重ねて出す", "この下書きを消す"]);
  });
});

describe("collection time", () => {
  it("reads '明日朝' as the routine morning draw", () => {
    const d = lab();
    expect(resolvedCollect(d, ctx())).toMatchObject({ day: 1, time: "06:00", priority: "定時" });
    expect(isReady(checkDraft(d, ctx()))).toBe(true);
  });

  it("times a vancomycin level 30 minutes before the 3rd dose of the drafted regimen", () => {
    const v = vcm();
    const level = lab({
      tests: [{ code: "LAB-VCM", said: "VCM濃度" }],
      collect: { day: null, when: "before_dose", time: null, beforeDose: { n: 3, drugCode: "INJ-VCM05" } },
    });
    const c = ctx([v, level]);
    // 1st 10:00 today, 2nd 22:00, 3rd 10:00 tomorrow → draw 09:30 tomorrow
    expect(resolvedCollect(level, c)).toMatchObject({ day: 1, time: "09:30" });
    expect(toOrder(level, c).order).toMatchObject({ collect: { day: 1, time: "09:30" } });
  });

  it("asks for the number of blood culture sets when not said", () => {
    const d = lab({ tests: [{ code: "LAB-BCX", said: "血培" }], collect: { day: 0, when: "now", time: null, beforeDose: null } });
    const issues = checkDraft(d, ctx());
    expect(keyOf(issues, "sets-0")?.level).toBe("ask");
    expect(resolvedCollect(d, ctx())).toMatchObject({ day: 0, time: "08:30", priority: "至急" });
  });

  it("asks when an injection start time has already passed", () => {
    const issues = checkDraft(vcm({ start: { day: 0, time: "07:00" } }), ctx());
    expect(keyOf(issues, "start-past")?.level).toBe("ask");
  });
});
