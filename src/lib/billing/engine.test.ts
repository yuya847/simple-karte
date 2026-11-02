import { describe, expect, it } from "vitest";
import type { DailyRecord, InjectionOrder, LabOrder, OrderEntry, PrescriptionOrder } from "../types";
import { calculateClaim, seikagaku1Points } from "./engine";
import { type BillingOptions, type ClaimAct, type ClaimInput, DEFAULT_OPTIONS } from "./model";

// Today is Monday 2026-11-02, 10:00. Day offsets count from it: -1 = 11/1 (Sunday), -32 = 10/1 (Thursday).
const TODAY = "2026-11-02";
const OCT1 = -32;

let seq = 0;
const order = (day: number, o: InjectionOrder | LabOrder | PrescriptionOrder, extra: Partial<OrderEntry> = {}): OrderEntry => ({
  kind: "order",
  id: `o${++seq}`,
  day,
  time: "09:00",
  author: "試験",
  status: "有効",
  order: o,
  ...extra,
});
const lab = (day: number, codes: string[], time = "06:00", comment?: string) =>
  order(day, { type: "lab", codes, collect: { day, time }, priority: "定時", comment });

function claim(month: string, over: Omit<Partial<ClaimInput>, "options"> & { admittedOn?: number; dischargedOn?: number; options?: Partial<BillingOptions> } = {}) {
  const { admittedOn = OCT1, dischargedOn, options, ...rest } = over;
  return calculateClaim({
    today: TODAY,
    nowTime: "10:00",
    month,
    patient: { id: "t", name: "試験 太郎", sex: "男", age: 70, admittedOn, dischargedOn },
    entries: [],
    daily: [],
    cultures: [],
    diagnoses: [],
    ...rest,
    options: { ...DEFAULT_OPTIONS, ...options },
  });
}

/** The receipt entries that contain this code, with their total count. */
function find(acts: ClaimAct[], code: string) {
  const hits = acts.filter((a) => a.parts.some((p) => p.lines.some((l) => l.code === code)));
  return { count: hits.reduce((s, a) => s + a.count, 0), days: hits.flatMap((a) => Object.keys(a.days).map(Number)).sort((x, y) => x - y), acts: hits };
}

describe("入院基本料と入院期間加算（A100）", () => {
  const r = claim("2026-10");

  it("bills every day of the month from the admission day", () => {
    expect(r.days).toBe(31);
    expect(find(r.acts, "190199910").count).toBe(31);
  });

  it("入院期間加算 450点 for days 1–14 and 192点 for days 15–30, none from day 31", () => {
    expect(find(r.acts, "190079470")).toMatchObject({ count: 14, days: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14] });
    expect(find(r.acts, "190079670").count).toBe(16);
    const day31 = r.acts.find((a) => a.days[31] && a.shikibetsu === "90" && a.parts[0].lines[0].code === "190199910");
    expect(day31?.parts[0].points).toBe(1597);
  });

  it("the 入院料 and its 入院期間加算 are one unit: 1597 + 450 = 2047点", () => {
    const first = find(r.acts, "190079470").acts[0];
    expect(first.parts[0].points).toBe(2047);
  });

  it("25対1急性期看護補助体制加算 for 14 days only", () => {
    expect(find(r.acts, "190145710").count).toBe(14);
  });

  it("初日の加算 once, on the admission day", () => {
    for (const code of ["190832110", "190889910", "190120510", "190147310", "190147510", "190206910", "190207010"]) {
      expect(find(r.acts, code), code).toMatchObject({ count: 1, days: [1] });
    }
  });

  it("病棟薬剤業務実施加算２ once a week, weeks running Sunday to Saturday", () => {
    // 10/1 is a Thursday; the next weeks start on 10/4, 10/11, 10/18 and 10/25.
    expect(find(r.acts, "190192110").days).toEqual([1, 4, 11, 18, 25]);
  });

  it("評価料と物価対応料 every day", () => {
    expect(find(r.acts, "180737910").count).toBe(31);
    expect(find(r.acts, "180712910").count).toBe(31);
    expect(find(r.acts, "180820810").count).toBe(31);
  });

  it("the next month has no 初日 or 期間 加算 (入院32日目から)", () => {
    const n = claim("2026-11");
    expect(n.days).toBe(2);
    expect(find(n.acts, "190079470").count + find(n.acts, "190079670").count).toBe(0);
    expect(find(n.acts, "190147310").count).toBe(0);
    expect(find(n.acts, "190145710").count).toBe(0);
    // 11/1 is a Sunday: a new week, so 病棟薬剤業務実施加算２ again
    expect(find(n.acts, "190192110").days).toEqual([1]);
  });
});

describe("加算 that a person confirms", () => {
  it("nothing patient-dependent is assumed", () => {
    const r = claim("2026-10");
    for (const code of ["190171910", "190172010", "190193310", "190218510", "190192310"]) expect(find(r.acts, code).count).toBe(0);
  });

  it("救急医療管理加算２ for the first 7 days", () => {
    const r = claim("2026-10", { options: { kyukyu: "2" } });
    expect(find(r.acts, "190172010")).toMatchObject({ count: 7, days: [1, 2, 3, 4, 5, 6, 7] });
  });

  it("認知症ケア加算３: 47点 up to day 14, then 13点", () => {
    const r = claim("2026-10", { options: { ninchisho: true } });
    expect(find(r.acts, "190193310").count).toBe(14);
    expect(find(r.acts, "190193410").count).toBe(17);
  });

  it("せん妄ハイリスク患者ケア加算 is dropped on a day with 認知症ケア加算 (背反テーブル)", () => {
    const r = claim("2026-10", { options: { ninchisho: true, senmou: true } });
    expect(find(r.acts, "190218510").count).toBe(0);
    expect(r.issues.some((i) => i.level === "excluded" && i.text.includes("せん妄"))).toBe(true);
  });

  it("入退院支援加算１ on the discharge day", () => {
    const r = claim("2026-10", { dischargedOn: -12, options: { nyutaiin: true } }); // 10/21
    expect(find(r.acts, "190192310")).toMatchObject({ count: 1, days: [21] });
    expect(r.days).toBe(21);
  });
});

describe("注射", () => {
  it("点滴 under 500mL a day: no 点滴注射 手技料, drugs only", () => {
    const vcm = order(OCT1, {
      type: "injection",
      items: [
        { drugCode: "INJ-VCM05", amount: 1, unit: "g" },
        { drugCode: "INJ-NS100", amount: 100, unit: "mL" },
      ],
      route: "点滴静注",
      schedule: { kind: "every_hours", hours: 12 },
      start: { day: OCT1, time: "10:00" },
    });
    const r = claim("2026-10", { entries: [vcm] });
    expect(find(r.acts, "130003810").count).toBe(0);
    // 10/2: two doses × (2瓶 × 681 + 1袋 × 144) = 3,012円 → 301点
    const day2 = r.acts.find((a) => a.shikibetsu === "33" && a.days[2]);
    expect(day2?.parts).toHaveLength(1);
    expect(day2?.parts[0].points).toBe(301);
    expect(day2?.parts[0].lines.map((l) => [l.code, l.quantity])).toEqual([
      ["620005694", 4],
      ["640412105", 2],
    ]);
  });

  it("500mL or more a day: 点滴注射 102点 and the day's drugs as one 剤", () => {
    const fluid = order(OCT1, {
      type: "injection",
      items: [{ drugCode: "INJ-NS500", amount: 500, unit: "mL" }],
      route: "点滴静注",
      schedule: { kind: "per_day", count: 2 },
      start: { day: OCT1, time: "00:00" },
    });
    const r = claim("2026-10", { entries: [fluid] });
    const day2 = r.acts.find((a) => a.shikibetsu === "33" && a.days[2])!;
    expect(day2.parts[0]).toMatchObject({ points: 102 });
    // 2袋 × 236円 = 472円 → 47点
    expect(day2.parts[1].points).toBe(47);
  });

  it("静注 in hospital: no 手技料, the day's drugs only", () => {
    const frs = order(OCT1, {
      type: "injection",
      items: [{ drugCode: "INJ-FRS20", amount: 20, unit: "mg" }],
      route: "静注",
      schedule: { kind: "every_hours", hours: 12 },
      start: { day: OCT1, time: "08:00" },
    });
    const r = claim("2026-10", { entries: [frs] });
    const day2 = r.acts.find((a) => a.shikibetsu === "32" && a.days[2])!;
    expect(day2.parts).toHaveLength(1);
    expect(day2.parts[0].points).toBe(21); // 2管 × 104円 = 208円 → 21点
    expect(find(r.acts, "130003510").count).toBe(0);
  });
});

describe("検体検査", () => {
  it("生化学的検査（Ⅰ）の項目数による点数", () => {
    expect(seikagaku1Points(4)).toBeNull();
    expect(seikagaku1Points(5)).toBe(93);
    expect(seikagaku1Points(7)).toBe(93);
    expect(seikagaku1Points(8)).toBe(99);
    expect(seikagaku1Points(9)).toBe(99);
    expect(seikagaku1Points(10)).toBe(103);
  });

  const r = claim("2026-10", { entries: [lab(OCT1, ["SET-ROUTINE"], "14:00"), lab(OCT1 + 1, ["SET-ROUTINE"]), lab(OCT1 + 7, ["SET-ROUTINE"])] });

  it("12 items in one draw → 103点, with 入院時初回加算 on the first draw after admission only", () => {
    const chem = find(r.acts, "160017410").acts; // ＴＰ
    const first = chem.find((a) => a.days[1])!;
    expect(first.parts[0].points).toBe(123);
    const later = chem.find((a) => a.days[2])!;
    expect(later.parts[0].points).toBe(103);
    expect(later.count).toBe(2); // 10/2 and 10/8
    expect(find(r.acts, "160161510").count).toBe(1);
  });

  it("判断料 once a month on the first day, and 検体検査管理加算（Ⅱ） once", () => {
    expect(find(r.acts, "160061810")).toMatchObject({ count: 1, days: [1] }); // 血液学的
    expect(find(r.acts, "160061910")).toMatchObject({ count: 1, days: [1] }); // 生化学的（Ⅰ）
    expect(find(r.acts, "160062110")).toMatchObject({ count: 1, days: [1] }); // 免疫学的
    expect(find(r.acts, "160182770")).toMatchObject({ count: 1, days: [1] });
  });

  it("no 採血料 in hospital", () => {
    expect(find(r.acts, "160095710").count).toBe(0);
    expect(r.issues.some((i) => i.text.includes("採血料"))).toBe(true);
  });

  it("血液培養 from 2 sites: twice, each with 嫌気性培養加算", () => {
    const b = claim("2026-10", { entries: [lab(OCT1, ["LAB-BCX"], "14:00", "2セット")] });
    const bcx = find(b.acts, "160058610");
    expect(bcx.count).toBe(2);
    expect(bcx.acts[0].parts[0].lines.map((l) => l.code)).toEqual(["160058610", "160058970"]);
    expect(find(b.acts, "160062210").count).toBe(1); // 微生物学的検査判断料
  });

  it("a draw that has not happened yet is not billed", () => {
    const later = claim("2026-11", { entries: [lab(0, ["SET-ROUTINE"], "14:00")] });
    expect(find(later.acts, "160017410").count).toBe(0);
  });
});

describe("特定薬剤治療管理料１（バンコマイシン）", () => {
  it("measured twice or more: 470点 + 注7 530点, once in the month", () => {
    const r = claim("2026-10", { entries: [lab(OCT1 + 2, ["LAB-VCM"]), lab(OCT1 + 4, ["LAB-VCM"])] });
    const t = find(r.acts, "113000410");
    expect(t).toMatchObject({ count: 1, days: [3] });
    expect(t.acts[0].parts[0].points).toBe(1000);
  });

  it("carries the comments the 記載要領 asks for: (カ) and 初回の算定年月 (令和8年10月 → ０８１０)", () => {
    const r = claim("2026-10", { entries: [lab(OCT1 + 2, ["LAB-VCM"]), lab(OCT1 + 4, ["LAB-VCM"])] });
    const line = find(r.acts, "113000410").acts[0].parts[0].lines[0];
    expect(line.comments?.map((c) => [c.code, c.text])).toEqual([
      ["820100568", undefined],
      ["840000538", "０８１０"],
    ]);
    expect(line.comments?.[1].label).toContain("令和8年10月");
  });

  it("measured once: 470点 + 注8 初回月加算 280点, and a note to recalculate", () => {
    const r = claim("2026-10", { entries: [lab(OCT1 + 2, ["LAB-VCM"])] });
    expect(find(r.acts, "113000410").acts[0].parts[0].points).toBe(750);
    expect(r.issues.some((i) => i.text.includes("注7"))).toBe(true);
  });
});

describe("投薬（入院）", () => {
  const mgo = order(OCT1, { type: "prescription", category: "定期", drugCode: "ORAL-MGO330", amount: 1, unit: "錠", timings: ["朝", "夕"], start: { day: OCT1, timing: "夕" } });
  const home = order(OCT1, { type: "prescription", category: "持参薬", drugCode: "ORAL-AMLO5", amount: 1, unit: "錠", timings: ["朝"], start: { day: OCT1 + 1, timing: "朝" } });

  it("内服 per day, 調剤料 7点 a day, 調剤技術基本料 42点 once a month; 持参薬 not billed", () => {
    const r = claim("2026-10", { entries: [mgo, home] });
    expect(find(r.acts, "620005434").count).toBe(31); // 10/1 夕 only, then 朝・夕
    expect(find(r.acts, "620007860").count).toBe(0);
    expect(find(r.acts, "120001110").count).toBe(31);
    expect(find(r.acts, "120001710")).toMatchObject({ count: 1, days: [1] });
    expect(r.issues.some((i) => i.text.includes("持参薬"))).toBe(true);
  });

  it("no 調剤技術基本料 in a month with 薬剤管理指導料", () => {
    const r = claim("2026-10", { entries: [mgo], options: { yakuzaiShido: [{ day: OCT1 + 3, kind: "2" }] } });
    expect(find(r.acts, "120001710").count).toBe(0);
    expect(find(r.acts, "120001610")).toMatchObject({ count: 1, days: [4] });
  });
});

describe("入院時食事療養（Ⅰ）", () => {
  const daily: DailyRecord[] = [
    { day: OCT1, meals: [null, null, 8] },
    { day: OCT1 + 1, meals: [10, 5, 0] },
    { day: OCT1 + 2, meals: "絶食" },
  ];

  it("730円 a meal served, 標準負担額 550円 a meal; none on a fasting day", () => {
    const r = claim("2026-10", { daily });
    expect(r.meals).toEqual({ ryoyoYen: 730 * 4, futanYen: 550 * 4 });
    expect(find(r.acts, "197000110").days).toEqual([1, 2]);
  });

  it("特別食加算 76円 a meal when a person marks the diet", () => {
    const r = claim("2026-10", { daily, options: { specialDiet: true } });
    expect(r.meals.ryoyoYen).toBe((730 + 76) * 4);
  });

  it("each amount is its own unit (記載要領): 食事療養費, 特別食加算, 標準負担額 (a meal served counts even if not eaten)", () => {
    const r = claim("2026-10", { daily, options: { specialDiet: true } });
    const day2 = r.acts.find((a) => a.shikibetsu === "97" && a.days[2])!;
    expect(day2.parts.map((p) => [p.lines[0].code, p.lines[0].quantity, p.points])).toEqual([
      ["197000110", 3, 2190],
      ["197000470", 3, 228],
      ["197000810", 3, 1650],
    ]);
  });

  it("標準負担額 follows the patient's 区分 (低所得Ⅱ・90日以下 270円)", () => {
    const r = claim("2026-10", { daily, mealClass: "低所得Ⅱ（90日以下）" });
    expect(r.meals.futanYen).toBe(270 * 4);
    expect(find(r.acts, "197000910").count).toBe(2);
  });
});
