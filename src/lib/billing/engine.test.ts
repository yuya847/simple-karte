import { describe, expect, it } from "vitest";
import type { DailyRecord, InjectionOrder, LabOrder, OrderEntry, PrescriptionOrder, ProcedureOrder } from "../types";
import { materialPoints, oxygenYen } from "./drug";
import { calculateClaim, seikagaku1Points } from "./engine";
import { type BillingOptions, type ClaimAct, type ClaimInput, DEFAULT_OPTIONS } from "./model";

// Today is Monday 2026-11-02, 10:00. Day offsets count from it: -1 = 11/1 (Sunday), -32 = 10/1 (Thursday).
const TODAY = "2026-11-02";
const OCT1 = -32;

let seq = 0;
const order = (day: number, o: InjectionOrder | LabOrder | PrescriptionOrder | ProcedureOrder, extra: Partial<OrderEntry> = {}): OrderEntry => ({
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

describe("処置（第9部）", () => {
  const proc = (day: number, o: Omit<ProcedureOrder, "type" | "start"> & { start?: ProcedureOrder["start"] }, extra: Partial<OrderEntry> = {}) =>
    order(day, { type: "procedure", start: { day, time: "09:00" }, ...o } as ProcedureOrder, extra);

  it("酸素の価格: the official examples (2.31円×10L×1.3 = 30円 → 3点, 0.30円×300L×1.3 = 117円 → 12点)", () => {
    expect(oxygenYen(2.31, 10)).toBe(30);
    expect(materialPoints(30)).toBe(3);
    expect(oxygenYen(0.3, 300)).toBe(117);
    expect(materialPoints(117)).toBe(12);
  });

  it("酸素吸入 65点 a day, and the oxygen used: flow × minutes, at the purchase price (0.16円 ≤ 0.19円)", () => {
    // 2L/分 from 10/31 09:00 to 11/1 09:00 (stopped), then 1L/分 to now (11/2 10:00)
    const r = claim("2026-10", {
      admittedOn: -5,
      entries: [
        proc(-2, { code: "PROC-O2", o2: { device: "鼻カニュラ", lpm: 2 }, schedule: { kind: "continuous" } }, { status: "中止", stoppedOn: -1, stoppedTime: "09:00" }),
      ],
    });
    const o2 = find(r.acts, "140005610");
    expect(o2.days).toEqual([31]);
    const act = o2.acts[0];
    expect(act.parts[0].points).toBe(65);
    // 10/31: 09:00–24:00 = 900分 × 2L = 1,800L → 0.16 × 1800 × 1.3 = 374.4 → 374円 → 37点
    expect(act.parts[1].lines[0]).toMatchObject({ code: "739200000", quantity: 1800, unitPrice: 0.16 });
    expect(act.parts[1].lines[1].code).toBe("770020070");
    expect(act.parts[1].points).toBe(37);
  });

  it("two flows on one day: one 酸素吸入, the oxygen summed", () => {
    const r = claim("2026-11", {
      admittedOn: -5,
      entries: [
        proc(-2, { code: "PROC-O2", o2: { device: "鼻カニュラ", lpm: 2 }, schedule: { kind: "continuous" } }, { status: "中止", stoppedOn: -1, stoppedTime: "09:00" }),
        proc(-1, { code: "PROC-O2", o2: { device: "鼻カニュラ", lpm: 1 }, schedule: { kind: "continuous" } }),
      ],
    });
    const nov1 = find(r.acts, "140005610").acts.find((a) => a.days[1])!;
    expect(nov1.count).toBe(1);
    // 00:00–09:00 2L (1,080L) + 09:00–24:00 1L (900L) = 1,980L → 411.84 → 412円 → 41点
    expect(nov1.parts[1].lines[0].quantity).toBe(1980);
    expect(nov1.parts[1].points).toBe(41);
    // today up to now only: 00:00–10:00 1L = 600L → 124.8 → 125円 → 13点
    const nov2 = find(r.acts, "140005610").acts.find((a) => a.days[2])!;
    expect(nov2.parts[1].lines[0].quantity).toBe(600);
    expect(nov2.parts[1].points).toBe(13);
  });

  it("喀痰吸引 48点 once a day on days it was done (必要時: from the record)", () => {
    const r = claim("2026-11", {
      admittedOn: -5,
      entries: [proc(-2, { code: "PROC-SUCTION", schedule: { kind: "prn" }, done: [{ day: -1, time: "02:00" }, { day: -1, time: "05:00" }, { day: 0, time: "08:00" }] })],
    });
    expect(find(r.acts, "140003810")).toMatchObject({ count: 2, days: [1, 2] });
  });

  it("膀胱留置カテーテル: 留置カテーテル設置 40点 and the catheter (233円 → 23点) on the day it went in only", () => {
    const r = claim("2026-11", { admittedOn: -5, entries: [proc(-1, { code: "PROC-FOLEY", schedule: { kind: "continuous" } })] });
    const f = find(r.acts, "140013810");
    expect(f).toMatchObject({ count: 1, days: [1] });
    expect(f.acts[0].parts[1].lines[0]).toMatchObject({ record: "TO", code: "710010158", unitCode: "007" });
    expect(f.acts[0].parts[1].points).toBe(23);
  });

  it("グリセリン浣腸: no 手技料 (basic fee), the drug only (156.80円 → 16点)", () => {
    const r = claim("2026-11", { admittedOn: -5, entries: [proc(-1, { code: "PROC-GE", schedule: { kind: "once" }, drug: { code: "TOP-GE120", amount: 1 } })] });
    const ge = find(r.acts, "620486001");
    expect(ge.count).toBe(1);
    expect(ge.acts[0].parts).toHaveLength(1);
    expect(ge.acts[0].parts[0].points).toBe(16);
  });

  it("創傷処置 100〜500cm² 60点 each time it is done; ゲーベン 10g (128円 → 13点) with it", () => {
    const r = claim("2026-11", {
      admittedOn: -5,
      entries: [proc(-1, { code: "PROC-WOUND", site: "右下腿", area: "100-500", schedule: { kind: "per_day", count: 2 }, drug: { code: "TOP-GEBEN", amount: 10 } }, { time: "08:00" })],
    });
    // 11/1 10:00 and 18:00, 11/2 10:00 (now) → 3 times
    const w = find(r.acts, "140000710");
    expect(w.count).toBe(3);
    expect(w.acts[0].parts.map((p) => p.points)).toEqual([60, 13]);
  });

  it("創傷処置 under 100cm² is not billed in hospital (not after surgery), but the drug is; 15円以下 is not billed (J300)", () => {
    const r = claim("2026-11", {
      admittedOn: -5,
      entries: [
        proc(-1, { code: "PROC-WOUND", site: "左前腕", area: "lt100", schedule: { kind: "per_day", count: 1 }, drug: { code: "TOP-GEBEN", amount: 5 } }, { time: "08:00" }),
        proc(-1, { code: "PROC-WOUND", site: "右前腕", area: "lt100", schedule: { kind: "per_day", count: 1 }, drug: { code: "TOP-VASELINE", amount: 3 } }, { time: "08:00" }),
      ],
    });
    expect(find(r.acts, "140000610").count).toBe(0);
    expect(r.issues.some((i) => i.level === "excluded" && i.text.includes("100cm²未満"))).toBe(true);
    // ゲーベン 5g = 64円 → 6点, billed as a drug of 処置
    expect(find(r.acts, "620008991").acts[0].parts[0].points).toBe(6);
    // 白色ワセリン 3g = 9.48円 ≦ 15円 → not billed
    expect(find(r.acts, "620001705").count).toBe(0);
    expect(r.issues.some((i) => i.text.includes("J300 注1"))).toBe(true);
    expect(r.issues.some((i) => i.level === "review" && i.text.includes("面積を合算"))).toBe(true);
  });

  it("褥瘡 D3: 重度褥瘡処置 once a day for 2 months from the first one, then 創傷処置", () => {
    // first on 2026-09-02 (day -61): 2 months end on 11/1 → 11/2 is 創傷処置
    const r = claim("2026-11", {
      admittedOn: -70,
      entries: [proc(-61, { code: "PROC-ULCER", site: "仙骨部", area: "100-500", depth: "D3", schedule: { kind: "per_day", count: 2 } }, { time: "08:00" })],
    });
    expect(find(r.acts, "140048710")).toMatchObject({ count: 1, days: [1] });
    expect(find(r.acts, "140000710")).toMatchObject({ count: 1, days: [2] });
  });

  it("褥瘡 d2 is billed as 創傷処置 from the start", () => {
    const r = claim("2026-11", {
      admittedOn: -5,
      entries: [proc(-1, { code: "PROC-ULCER", site: "仙骨部", area: "100-500", depth: "d2", schedule: { kind: "per_day", count: 1 } }, { time: "08:00" })],
    });
    expect(find(r.acts, "140048710").count).toBe(0);
    expect(find(r.acts, "140000710").count).toBe(2);
  });
});

describe("検体検査を1項目ずつ（SRL の単位）", () => {
  it("WBC と Plt を選んでも末梢血液一般は1回、Na と Cl もナトリウム及びクロールは1回", () => {
    const r = claim("2026-11", { admittedOn: -5, entries: [lab(-1, ["LAB-WBC", "LAB-PLT", "LAB-NA", "LAB-CL", "LAB-K", "LAB-MG"])] });
    expect(find(r.acts, "160008010").count).toBe(1);
    expect(find(r.acts, "160021110").count).toBe(1);
    // Na・Cl、K、Mg = 3項目（4項目以下は各点数の合計 11 × 3）
    expect(find(r.acts, "160022210").acts[0].parts[0].points).toBe(33);
  });
  it("内分泌（D008 の12〜51）を3項目以上 → 項目数の点数（FT4・BNP・NT-proBNP は1週間ルールで2項目に）", () => {
    const r = claim("2026-11", { admittedOn: -5, entries: [lab(-1, ["LAB-FT4", "LAB-BNP", "LAB-NTBNP", "LAB-TSH"])] });
    expect(find(r.acts, "160162350").count).toBe(0); // BNP 130 < NT-proBNP 136
    expect(r.issues.some((i) => i.text.includes("D008 通知(7)イ"))).toBe(true);
    // FT4 + NT-proBNP = 2項目 → 包括にならず各点数。TSH（D008 の6、包括外）も同じ欄に：121 + 136 + 98
    expect(find(r.acts, "160033310").acts[0].parts[0].points).toBe(355);
  });
  it("内分泌を3項目（FT4・NT-proBNP・BNP を1週間あけて）→ 410点", () => {
    const r = claim("2026-11", { admittedOn: -20, entries: [lab(-15, ["LAB-BNP"]), lab(-1, ["LAB-FT4", "LAB-NTBNP"])] });
    expect(find(r.acts, "160162350").count).toBe(1);
  });
  it("出血・凝固（D006 の14〜34）を3項目以上: 530点（Dダイマーは1項目なので各点数）", () => {
    const r = claim("2026-11", { admittedOn: -5, entries: [lab(-1, ["LAB-DD", "LAB-PT", "LAB-APTT", "LAB-FIB"])] });
    expect(find(r.acts, "160114010").acts[0].parts[0].points).toBe(127 + 18 + 29 + 23);
  });
});
