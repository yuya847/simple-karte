import { describe, expect, it } from "vitest";
import type { AiDraftResponse, AiOrder } from "./ai-schema";
import {
  applyChoice,
  checkDraft,
  draftsFromAi,
  isReady,
  newProcedureDraft,
  ratePlan,
  resolvedCollect,
  scopeFromWords,
  toOrder,
  type CheckContext,
  type Draft,
  type InjectionDraft,
  type LabDraft,
  type ProcedureDraft,
  type StopDraft,
} from "./drafts";
import { PATIENTS } from "./patients";
import { parseSize } from "./procedures";
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
    expect(issue?.message).toContain("50.0mL/時");
    expect(issue?.message).toContain("80.0mL/時");
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

describe("per-bag or whole-day, decided from the words", () => {
  it.each([
    ["ヴィーンFは1日2本を続けて、20時間で", null],
    ["生食500を1日2本、20時間で", null],
    ["生食500 1本20時間で 1日2本", "per_dose"],
    ["生食500を1日2本、2本を20時間で", "whole_day"],
    ["ソルデム3A 1日分を24時間で", "whole_day"],
    ["生食５００を１本あたり１０時間で", "per_dose"],
  ])("%s → %s", (text, expected) => {
    expect(scopeFromWords(text)).toBe(expected);
  });

  it("overrides Claude's guess when the words do not say", () => {
    const o: AiOrder = {
      kind: "injection",
      source_text: "ヴィーンFは1日2本を続けて、20時間で",
      drugs: [{ code: "INJ-VEENF500", said: "ヴィーンF", amount: 1, unit: "本" }],
      route: null,
      frequency: { kind: "per_day", value: 2 },
      infusion: { minutes: 1200, applies_to: "whole_day", rate_ml_per_h: null },
      start: { day: "unspecified", time: null },
      days: null,
      tests: [],
      collect: { day: "unspecified", when: "unspecified", time: null, before_dose_number: null, before_dose_drug_code: null },
      priority: null,
      culture_sets: null,
      exam: "",
      exam_region: "",
      exam_contrast: "",
      exam_purpose: "",
      rx_category: "",
      rx_amount_is: "",
      rx_timings: [],
      rx_max_per_day: 0,
      procedure_code: "",
      site: "",
      size_said: "",
      depth: "",
      o2_device: "",
      o2_lpm: 0,
      comment: null,
    };
    const [d] = draftsFromAi({ orders: [o], not_understood: [] }, () => "x");
    expect((d as InjectionDraft).infusionScope).toBe("unclear");
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
      exam: "",
      exam_region: "",
      exam_contrast: "",
      exam_purpose: "",
      rx_category: "",
      rx_amount_is: "",
      rx_timings: [],
      rx_max_per_day: 0,
      procedure_code: "",
      site: "",
      size_said: "",
      depth: "",
      o2_device: "",
      o2_lpm: 0,
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

  it("finds a running oral prescription to stop", () => {
    const d: StopDraft = { id: "s", origin: "manual", sourceText: "", comment: null, kind: "stop", drugCode: "ORAL-AMLO5", said: "アムロジピン", targetOrderId: null };
    expect(isReady(checkDraft(d, ctx()))).toBe(true);
    expect(toOrder(d, ctx()).stopIds).toEqual(["sakura-amlo"]);
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

describe("処置の下書き", () => {
  const oura = PATIENTS.find((p) => p.id === "90010244")!;
  const ouraOrders = oura.history.filter((e): e is OrderEntry => e.kind === "order");
  const ouraCtx = (drafts: Draft[] = []) => ctx(drafts, { activeOrders: ouraOrders.filter((o) => o.status === "有効") });
  const apply = (d: Draft, issues: ReturnType<typeof checkDraft>, key: string, label: string) => {
    const c = keyOf(issues, key)!.choices!.find((x) => x.label.startsWith(label))!;
    return c.apply!(d);
  };

  it("an oxygen draft picked by hand asks for the device and the flow, offering the running device first", () => {
    let d: Draft = newProcedureDraft("PROC-O2", "p1");
    let issues = checkDraft(d, ouraCtx());
    expect(keyOf(issues, "o2-device")!.choices![0].label).toBe("鼻カニュラ（今の酸素と同じ）");
    expect(keyOf(issues, "o2-flow")!.choices).toBeUndefined();
    d = apply(d, issues, "o2-device", "鼻カニュラ");
    issues = checkDraft(d, ouraCtx());
    expect(keyOf(issues, "o2-flow")!.choices!.map((c) => c.label)).toEqual(["0.5L/分", "1L/分", "2L/分", "3L/分", "4L/分", "5L/分", "6L/分"]);
    d = apply(d, issues, "o2-flow", "2L");
    issues = checkDraft(d, ouraCtx());
    expect(keyOf(issues, "o2-volume")!.formula).toBe("2L/分 × 1,440分 = 2,880L");
    // the 1L order is running: replace or add
    expect(keyOf(issues, "duplicate")!.level).toBe("ask");
    d = apply(d, issues, "duplicate", "前のオーダを止めて");
    issues = checkDraft(d, ouraCtx());
    expect(isReady(issues)).toBe(true);
    const r = toOrder(d, ouraCtx());
    expect(r.order).toMatchObject({ type: "procedure", code: "PROC-O2", o2: { device: "鼻カニュラ", lpm: 2 }, schedule: { kind: "continuous" } });
    expect(r.stopIds).toEqual(["oura-o2-1l"]);
  });

  it("a flow outside the ward's range for the device is asked, not changed", () => {
    const d = { ...newProcedureDraft("PROC-O2", "p1"), o2: { device: "鼻カニュラ" as const, lpm: 8 } };
    const issues = checkDraft(d, ctx());
    expect(keyOf(issues, "o2-range")!.level).toBe("ask");
    expect(isReady(checkDraft({ ...d, flowOk: true }, ctx()))).toBe(true);
  });

  it("a pressure ulcer: the area is computed from the lengths said; depth and schedule are asked", () => {
    const d: ProcedureDraft = { ...newProcedureDraft("PROC-ULCER", "p2"), site: "仙骨部", size: { lengthCm: 12, widthCm: 10, areaCm2: null } };
    let issues = checkDraft(d, ctx());
    expect(keyOf(issues, "area")).toMatchObject({ level: "info", message: "100〜500cm²未満", formula: "12cm × 10cm = 120cm²" });
    expect(keyOf(issues, "depth")!.level).toBe("ask");
    expect(keyOf(issues, "schedule")!.choices!.map((c) => c.label)).toEqual(["1日1回", "1日2回", "隔日"]);
    const ready: ProcedureDraft = { ...d, depth: "D3", schedule: { kind: "per_day", count: 1 } };
    issues = checkDraft(ready, ctx());
    expect(keyOf(issues, "depth")!.message).toContain("重度褥瘡処置 J001-4");
    expect(isReady(issues)).toBe(true);
    expect(toOrder(ready, ctx()).order).toMatchObject({ area: "100-500", depth: "D3", site: "仙骨部", comment: "12cm × 10cm" });
  });

  it("under 100cm² can be ordered, with a note that it is not billed in hospital", () => {
    const d: ProcedureDraft = { ...newProcedureDraft("PROC-WOUND", "p3"), site: "左前腕", area: "lt100", schedule: { kind: "per_day", count: 1 } };
    const issues = checkDraft(d, ctx());
    expect(keyOf(issues, "area-lt100")!.level).toBe("info");
    expect(isReady(issues)).toBe(true);
  });

  it("an enema always uses its drug; nothing else is asked but when", () => {
    const d: ProcedureDraft = { ...newProcedureDraft("PROC-GE", "p4"), schedule: { kind: "once" } };
    const issues = checkDraft(d, ctx());
    expect(isReady(issues)).toBe(true);
    expect(toOrder(d, ctx()).order).toMatchObject({ drug: { code: "TOP-GE120", amount: 1 } });
  });

  it("stopping a procedure finds the one running order", () => {
    const stop: StopDraft = { id: "s", origin: "ai", sourceText: "酸素オフ", comment: null, kind: "stop", drugCode: null, procCode: "PROC-O2", said: "酸素", targetOrderId: null };
    const issues = checkDraft(stop, ouraCtx());
    expect(isReady(issues)).toBe(true);
    expect(toOrder(stop, ouraCtx()).stopIds).toEqual(["oura-o2-1l"]);
  });

  it("from Claude's output: lengths stay as said, the schedule and the stop map to the master", () => {
    const base = {
      drugs: [] as AiOrder["drugs"],
      route: null,
      frequency: { kind: "unspecified" as const, value: null },
      infusion: { minutes: null, applies_to: null, rate_ml_per_h: null },
      start: { day: "unspecified" as const, time: null },
      days: null,
      tests: [] as AiOrder["tests"],
      collect: { day: "unspecified" as const, when: "unspecified" as const, time: null, before_dose_number: null, before_dose_drug_code: null },
      priority: null,
      culture_sets: null,
      comment: null,
    } satisfies Partial<AiOrder>;
    const none = { exam: "" as const, exam_region: "", exam_contrast: "" as const, exam_purpose: "", rx_category: "" as const, rx_amount_is: "" as const, rx_timings: [], rx_max_per_day: 0, procedure_code: "", site: "", size_said: "", depth: "", o2_device: "", o2_lpm: 0 };
    const res: AiDraftResponse = {
      orders: [
        {
          ...base,
          ...none,
          kind: "procedure",
          source_text: "仙骨部の褥瘡 10×8cm、ゲーベン塗布で1日1回",
          procedure_code: "PROC-ULCER",
          site: "仙骨部",
          size_said: "10×8cm",
          frequency: { kind: "per_day", value: 1 },
          drugs: [{ code: "TOP-GEBEN", said: "ゲーベン", amount: null, unit: null }],
        },
        { ...base, ...none, kind: "stop", source_text: "尿カテ抜去", procedure_code: "PROC-FOLEY" },
        { ...base, ...none, kind: "procedure", source_text: "吸引は痰が多い時", procedure_code: "PROC-SUCTION", frequency: { kind: "prn", value: null }, comment: "痰が多い時" },
      ],
      not_understood: [],
    };
    let n = 0;
    const [ulcer, stop, suction] = draftsFromAi(res, () => `x${++n}`);
    expect(ulcer).toMatchObject({ kind: "procedure", code: "PROC-ULCER", size: { lengthCm: 10, widthCm: 8 }, schedule: { kind: "per_day", count: 1 } });
    expect(keyOf(checkDraft(ulcer, ctx()), "area")!.formula).toBe("10cm × 8cm = 80cm²");
    expect(keyOf(checkDraft(ulcer, ctx()), "drug-amount")!.choices!.map((c) => c.label)).toEqual(["5g", "10g", "20g"]);
    expect(stop).toMatchObject({ kind: "stop", procCode: "PROC-FOLEY", drugCode: null });
    expect(suction).toMatchObject({ schedule: { kind: "prn", condition: "痰が多い時" }, comment: null });
  });

  it.each([
    ["12×10センチ", { lengthCm: 12, widthCm: 10 }],
    ["１２ｃｍ x １０ｃｍ", { lengthCm: 12, widthCm: 10 }],
    ["8かける6", { lengthCm: 8, widthCm: 6 }],
    ["30×20mm", { lengthCm: 3, widthCm: 2 }],
    ["5cm四方", { lengthCm: 5, widthCm: 5 }],
    ["150平方センチ", { areaCm2: 150 }],
    ["手のひら大", null],
  ])("size words %s are read in code", (words, expected) => {
    expect(parseSize(words)).toEqual(expected);
  });
});

describe("KCl mixed into a fluid (混注)", () => {
  const ctx0 = {
    activeOrders: [],
    labOrders: [],
    drafts: [],
    nowTime: "09:00",
    fmtDay: (d: number) => String(d),
    describe: () => "",
    allergies: [],
    consents: [],
    patientFacts: null,
  } as unknown as Parameters<typeof checkDraft>[1];
  const kclDraft = (kcl: number, fluid: string | null, minutes: number, perDay = 1): InjectionDraft => ({
    id: "k",
    origin: "manual",
    sourceText: "",
    comment: null,
    kind: "injection",
    items: [{ drugCode: "INJ-KCL20", said: "KCL", amount: kcl, unit: "mEq" }, ...(fluid ? [{ drugCode: fluid, said: "", amount: 1, unit: "本" }] : [])],
    route: "点滴静注",
    schedule: { kind: "per_day", count: perDay },
    infusionMinutes: minutes,
    infusionScope: "per_dose",
    rateMlPerH: null,
    prefer: null,
    start: { day: 0, time: null },
    days: null,
    duplicate: null,
  });
  const keys = (d: InjectionDraft) => checkDraft(d, ctx0).map((i) => i.key);

  it("stops KCl without a fluid", () => {
    expect(keys(kclDraft(20, null, 60))).toContain("kcl-mix");
  });
  it("checks concentration, rate and daily amount by code", () => {
    expect(keys(kclDraft(20, "INJ-SOL3A500", 240))).toContain("kcl-calc");
    expect(keys(kclDraft(40, "INJ-SOL3A500", 240))).toContain("kcl-conc");
    expect(keys(kclDraft(20, "INJ-SOL3A500", 30))).toContain("kcl-rate");
    expect(keys(kclDraft(20, "INJ-SOL3A500", 240, 6))).toContain("kcl-day");
  });
});

it("今すぐの注射は下書きの時刻が過ぎても確定時刻で開始する", () => {
  const d = injection({ startNow: true, start: { day: 0, time: "07:29" }, schedule: { kind: "once" }, doseTimes: ["07:29"], route: "点滴静注", infusionMinutes: 60, infusionScope: "per_dose", days: 1, end: { day: 0, time: "08:29" } });
  const c = ctx([], { nowTime: "10:03", activeOrders: [] });
  expect(checkDraft(d, c).filter((i) => i.level !== "info")).toEqual([]);
  expect(toOrder(d, c).order).toMatchObject({ start: { day: 0, time: "10:03" }, doseTimes: ["10:03"], end: { day: 0, time: "11:03" } });
  const fixed = { ...d, startNow: false };
  const choice = checkDraft(fixed, c).find((i) => i.key === "start-past")!.choices![0];
  const next = applyChoice(fixed, choice);
  expect(isReady(checkDraft(next, c))).toBe(true);
  expect(toOrder(next, c).order).toMatchObject({ start: { day: 0, time: "10:03" }, end: { day: 0, time: "11:03" } });
});

it("今すぐの検体検査は確定時刻に採取し、過去時刻の確認を出さない", () => {
  const d = lab({ collect: { day: 0, when: "now", time: null, beforeDose: null } });
  const c = ctx([], { nowTime: "10:03", activeOrders: [], labOrders: [] });
  expect(checkDraft(d, c).some((i) => i.key === "collect-past")).toBe(false);
  expect(toOrder(d, c).order).toMatchObject({ collect: { day: 0, time: "10:03" } });
});
