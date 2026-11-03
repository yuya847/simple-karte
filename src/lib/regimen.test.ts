import { describe, expect, it } from "vitest";
import { checkDraft, isReady, ratePlan, toOrder, type CheckContext } from "./drafts";
import { findDrug } from "./master";
import {
  REGIMENS,
  REDUCTIONS,
  addMinutes,
  bsaDuBois,
  calvertDose,
  doseLine,
  findRegimen,
  gfrForCalvert,
  planRegimen,
  regimenDrafts,
  roundToUnit,
  rpsOfDay,
  type Body,
  type RegimenRp,
} from "./regimen";

// A fictional patient: 70歳男性、170cm・60kg、Cre 0.8.
const man: Body = { sex: "男", age: 70, heightCm: 170, weightKg: 60, cre: 0.8 };
const TC = findRegimen("REG-TC-Q3W")!;
const CE = findRegimen("REG-CE")!;
const none = { PTX: 0, CBDCA: 0, ETP: 0 };

const ctx: CheckContext = {
  activeOrders: [],
  labOrders: [],
  drafts: [],
  nowTime: "08:30",
  fmtDay: (d) => `D${d}`,
  describe: (o) => o.id,
  patientFacts: { sex: "男", age: 70, allergies: [], cre: { value: 0.8, day: 0 }, heightCm: 170, weightKg: 60 },
};
const ids = () => {
  let n = 0;
  return () => `r${++n}`;
};
const lineOf = (p: ReturnType<typeof planRegimen>, key: string) => p.lines.find((l) => l.drug.key === key)!;

describe("calculations (each with its formula)", () => {
  it("body surface area by DuBois, to 0.01 m²", () => {
    expect(bsaDuBois(170, 60)).toEqual({ bsa: 1.69, formula: "0.007184 × 60kg^0.425 × 170cm^0.725 = 1.69m²" });
  });

  it("estimates GFR by Cockcroft-Gault (×0.85 for women) and caps it at 125 mL/min", () => {
    expect(gfrForCalvert(man)).toEqual({ value: 72.9, used: 72.9, capped: false, formula: "(140 − 70歳) × 60kg ÷ (72 × Cre 0.8) = 72.9mL/分" });
    const young = gfrForCalvert({ sex: "女", age: 40, weightKg: 70, cre: 0.4 })!;
    expect(young.formula).toBe("(140 − 40歳) × 70kg ÷ (72 × Cre 0.4) × 0.85 = 206.6mL/分");
    expect(young).toMatchObject({ value: 206.6, used: 125, capped: true });
    expect(gfrForCalvert({ ...man, cre: null })).toBeNull();
    expect(gfrForCalvert({ ...man, weightKg: undefined })).toBeNull();
  });

  it("Calvert: AUC × (GFR + 25)", () => {
    expect(calvertDose(6, 72.9)).toEqual({ dose: 587.4, formula: "AUC 6 × (GFR 72.9 + 25) = 587.4mg" });
    expect(calvertDose(6, 125).dose).toBe(900); // FDA: AUC 6 → 900 mg at most
  });

  it("rounds to the unit without floating-point residue", () => {
    expect(roundToUnit(587.4, 10)).toBe(590);
    expect(roundToUnit(335, 10)).toBe(340);
    expect(roundToUnit(20, 1.65)).toBe(19.8);
    expect(roundToUnit(4.95, 1.65)).toBe(4.95);
    expect(roundToUnit(0.75, 0)).toBe(0.75);
  });

  it("adds minutes to a start and carries past midnight", () => {
    expect(addMinutes({ day: 0, time: "09:00" }, 85)).toEqual({ day: 0, time: "10:25" });
    expect(addMinutes({ day: 1, time: "22:30" }, 120)).toEqual({ day: 2, time: "00:30" });
  });
});

describe("CBDCA+PTX（3週ごと）day1", () => {
  it("works out each drug: base × body → 減量 → まるめ → final", () => {
    const p = planRegimen(TC, 1, man, none);
    expect(p.ready).toBe(true);
    const ptx = lineOf(p, "PTX");
    expect(ptx).toMatchObject({ base: "200mg/m²", raw: 338, reduction: 0, reduced: 338, rounded: 340, final: 340 });
    expect(ptx.steps).toEqual([
      "体表面積（DuBois）0.007184 × 60kg^0.425 × 170cm^0.725 = 1.69m²",
      "200mg/m² × 1.69m² = 338mg",
      "減量なし（0%）",
      "まるめ（10mg 単位）：338mg → 340mg",
    ]);
    const cb = lineOf(p, "CBDCA");
    expect(cb).toMatchObject({ base: "AUC 6", raw: 587.4, final: 590 });
    expect(cb.steps).toContain("Calvert：AUC 6 × (GFR 72.9 + 25) = 587.4mg");
    // Premedication: fixed doses from the package insert and the guideline.
    expect(lineOf(p, "DEX")).toMatchObject({ raw: 20, rounded: 19.8, final: 19.8 });
    expect(lineOf(p, "FAMO").final).toBe(20);
    expect(lineOf(p, "PALO").final).toBe(0.75);
    expect(lineOf(p, "FAPR").final).toBe(150);
    expect(p.lines.flatMap((l) => l.warnings).filter((w) => w.level !== "info")).toEqual([]);
  });

  it("applies the 減量率 the doctor chose and says why the final dose differs", () => {
    const p = planRegimen(TC, 1, man, { PTX: 20, CBDCA: 25 });
    const ptx = lineOf(p, "PTX");
    expect(ptx).toMatchObject({ reduction: 20, reduced: 270.4, final: 270 });
    expect(ptx.steps).toContain("減量 20%：338mg × 80% = 270.4mg");
    expect(ptx.warnings).toContainEqual({ level: "info", text: "最終量 270mg は計算値 338mg とまるめの幅を超えて違います（減量 20%）。" });
    expect(lineOf(p, "CBDCA")).toMatchObject({ reduced: 440.6, final: 440 });
    // Premedication is never reduced.
    expect(lineOf(p, "DEX").final).toBe(19.8);
  });

  it("chooses nothing for the doctor: without a 減量率 the plan is not ready", () => {
    const p = planRegimen(TC, 1, man, {});
    expect(p.ready).toBe(false);
    expect(p.missing).toEqual(["PTX の減量率を選んでください（0% も選びます）。", "CBDCA の減量率を選んでください（0% も選びます）。"]);
    expect(regimenDrafts(p, { course: 1, start: { day: 0, time: "09:00" }, newId: ids() })).toEqual([]);
  });

  it("caps GFR at 125 mL/min and says so", () => {
    const p = planRegimen(TC, 1, { sex: "女", age: 40, heightCm: 160, weightKg: 70, cre: 0.4 }, none);
    const cb = lineOf(p, "CBDCA");
    expect(cb.final).toBe(900);
    expect(cb.steps).toContain("GFR 206.6 → 上限 125mL/分");
    expect(cb.warnings[0]).toMatchObject({ level: "warn", text: "推定 GFR 206.6mL/分を上限の 125mL/分にして計算しました（最大量 AUC 6 × 150 = 900mg）。" });
  });

  it("does not calculate when height, weight or Cre is missing, and says which", () => {
    const noHeight = planRegimen(TC, 1, { ...man, heightCm: undefined }, none);
    expect(noHeight.ready).toBe(false);
    expect(lineOf(noHeight, "PTX").final).toBeNull();
    expect(noHeight.missing).toEqual(["身長がカルテにないため、体表面積を計算できません（PTX は計算しません）。"]);
    expect(lineOf(noHeight, "CBDCA").final).toBe(590);

    const noCre = planRegimen(TC, 1, { ...man, cre: null }, none);
    expect(noCre.missing).toEqual(["Creがカルテにないため、GFR を推定できず、CBDCA を計算できません。"]);

    const noWeight = planRegimen(TC, 1, { ...man, weightKg: undefined }, none);
    expect(noWeight.missing).toEqual([
      "体重がカルテにないため、体表面積を計算できません（PTX は計算しません）。",
      "体重がカルテにないため、GFR を推定できず、CBDCA を計算できません。",
    ]);
  });

  it("checks the timing and the solvent against the package inserts", () => {
    const p = planRegimen(TC, 1, man, none);
    expect(p.checks.filter((c) => c.warn.level !== "info")).toEqual([]);
    const fapr = p.checks.find((c) => c.rpKey === "fapr" && c.warn.text.includes("1時間前"))!;
    expect(fapr.warn.text).toBe("ホスアプレピタント：抗がん薬の投与の1時間前に始める（PTXの 60分前に開始・30分前に終了）");
    const dex = p.checks.find((c) => c.rpKey === "dex")!;
    expect(dex.warn.text).toContain("PTXの 75分前に開始・60分前に終了");
  });

  it("turns day1 into drafts in order, with the solvent mixed in, that pass the checks", () => {
    const p = planRegimen(TC, 1, man, none);
    const drafts = regimenDrafts(p, { course: 2, start: { day: 1, time: "09:00" }, newId: ids() });
    expect(drafts.map((d) => [d.items.map((i) => `${findDrug(i.drugCode!)!.aliases[0]} ${i.amount}${i.unit}`).join(" ＋ "), d.route, d.start.time])).toEqual([
      ["ファモチジン 20mg", "静注", "09:00"],
      ["パロノセトロン 0.75mg", "静注", "09:05"],
      ["デキサメタゾン 19.8mg ＋ 生食100 100mL", "点滴静注", "09:10"],
      ["ホスアプレピタント 150mg ＋ 生食100 100mL", "点滴静注", "09:25"],
      ["PTX 340mg ＋ 生食 500mL", "点滴静注", "10:25"],
      ["CBDCA 590mg ＋ 5%ブドウ糖250 250mL", "点滴静注", "13:25"],
    ]);
    const ptx = drafts[4];
    expect(ptx).toMatchObject({ schedule: { kind: "once" }, infusionMinutes: 180, infusionScope: "per_dose", start: { day: 1 }, days: null });
    expect(ptx.comment).toBe("レジメン CBDCA+PTX（3週ごと） 2コース目 day1　抗がん薬　計算：PTX 200mg/m² × 1.69m² = 338mg → 減量なし → 340mg");
    expect(drafts[5].comment).toContain("CBDCA AUC 6 × (GFR 72.9 + 25) = 587.4mg → 減量なし → 590mg");
    expect(ratePlan(ptx).formula).toBe("500mL ÷ 3時間 = 166.7mL/時");
    for (const d of drafts) {
      const issues = checkDraft(d, { ...ctx, drafts });
      expect(issues.filter((i) => i.level === "stop"), d.comment!).toEqual([]);
      expect(isReady(issues), d.comment!).toBe(true);
      expect(toOrder(d, ctx).order).toMatchObject({ type: "injection", schedule: { kind: "once" }, start: { day: 1, time: d.start.time } });
    }
  });
});

describe("CBDCA+ETP（3〜4週ごと）", () => {
  it("day1: antiemetics, CBDCA AUC 5 and ETP 80 mg/m²", () => {
    const p = planRegimen(CE, 1, man, none);
    expect(p.ready).toBe(true);
    expect(p.rps.map((r) => r.key)).toEqual(["palo", "dex1", "fapr", "cbdca", "etp1"]);
    expect(lineOf(p, "CBDCA")).toMatchObject({ raw: 489.5, final: 490 });
    expect(lineOf(p, "ETP")).toMatchObject({ raw: 135.2, final: 140 });
    expect(lineOf(p, "DEX1").final).toBe(4.95);
    expect(p.checks.filter((c) => c.warn.level !== "info")).toEqual([]);
  });

  it("day2 and day3: DEX 3.3 mg and ETP; the 減量率 chosen for ETP holds for every day", () => {
    const p = planRegimen(CE, 2, man, { ETP: 20 });
    expect(p.rps.map((r) => r.key)).toEqual(["dex23", "etp23"]);
    expect(p.ready).toBe(true);
    expect(lineOf(p, "ETP")).toMatchObject({ reduced: 108.2, final: 110 });
    const drafts = regimenDrafts(p, { course: 1, start: { day: 0, time: "10:00" }, newId: ids() });
    expect(drafts.map((d) => d.start.time)).toEqual(["10:00", "10:15"]);
    expect(drafts[1].comment).toBe("レジメン CBDCA+ETP（3〜4週ごと） 1コース目 day2　抗がん薬　計算：ETP 80mg/m² × 1.69m² = 135.2mg → 減量20% → 110mg");
    for (const d of drafts) expect(isReady(checkDraft(d, { ...ctx, drafts })), d.comment!).toBe(true);
  });

  it("warns when the solvent is less than the insert asks for the dose (ETP: 250 mL per 100 mg)", () => {
    const big: Body = { sex: "男", age: 50, heightCm: 195, weightKg: 130, cre: 0.9 };
    const p = planRegimen(CE, 2, big, none);
    expect(lineOf(p, "ETP").final).toBe(210);
    const w = p.checks.find((c) => c.rpKey === "etp23")!.warn;
    expect(w.level).toBe("warn");
    expect(w.text).toContain("溶媒 500mL（210mg には 210 ÷ 100 × 250 = 525mL 以上）");
  });

  it("drafts all pass the checks for each day", () => {
    for (const day of CE.days) {
      const drafts = regimenDrafts(planRegimen(CE, day, man, none), { course: 1, start: { day: 0, time: "09:00" }, newId: ids() });
      expect(drafts.length).toBeGreaterThan(0);
      for (const d of drafts) expect(checkDraft(d, { ...ctx, drafts }).filter((i) => i.level === "stop")).toEqual([]);
    }
  });
});

describe("a per-dose cap (when a source gives one)", () => {
  it("caps the final dose and warns", () => {
    const rp: RegimenRp = {
      key: "x",
      role: "抗がん薬",
      drugs: [{ key: "X", drugCode: "INJ-ETP", short: "X", basis: "mg/kg", value: 2, reducible: true, roundMg: 10, roundNote: "", capMg: { mg: 100, source: { label: "テスト", url: "https://example.org" } }, source: [] }],
      solvent: null,
      route: "点滴静注",
      minutes: 60,
      at: 0,
      days: [1],
    };
    const l = doseLine(rp, rp.drugs[0], man, 0);
    expect(l).toMatchObject({ raw: 120, rounded: 120, final: 100 });
    expect(l.steps).toEqual(["2mg/kg × 60kg = 120mg", "減量なし（0%）", "まるめ（10mg 単位）：120mg → 120mg", "上限 100mg：120mg → 100mg"]);
    expect(l.warnings.map((w) => w.level)).toEqual(["warn", "warn"]);
    expect(l.warnings[1].text).toBe("最終量 100mg は計算値 120mg とまるめの幅を超えて違います（上限）。");
  });
});

describe("the regimen master", () => {
  it("every drug is in the hospital's injection master, given in mg by a route it allows", () => {
    for (const r of REGIMENS)
      for (const rp of r.rps) {
        for (const d of rp.drugs) {
          const m = findDrug(d.drugCode);
          expect(m, `${r.code} ${d.key}`).toBeTruthy();
          expect(m!.units).toContain("mg");
          expect(m!.routes).toContain(rp.route);
        }
        if (rp.solvent) expect(findDrug(rp.solvent.drugCode)?.kind, `${r.code} ${rp.key}`).toBe("輸液");
        if (rp.route === "点滴静注") expect(rp.minutes, `${r.code} ${rp.key}`).toBeGreaterThan(0);
        expect(rp.days.every((d) => r.days.includes(d))).toBe(true);
      }
  });

  it("every dose, rule and note names a public source with a URL", () => {
    const url = /^https:\/\//;
    for (const r of REGIMENS) {
      expect(r.sources.length).toBeGreaterThan(0);
      for (const s of [...r.sources, ...r.notes.map((n) => n.source), ...r.oral.map((o) => o.source)]) expect(s.url).toMatch(url);
      for (const rp of r.rps) {
        for (const d of rp.drugs) {
          expect(d.source.length, `${r.code} ${d.key}`).toBeGreaterThan(0);
          for (const s of d.source) expect(s.url).toMatch(url);
        }
        if (rp.admin) expect(rp.admin.source.url).toMatch(url);
        if (rp.timing) expect(rp.timing.source.url).toMatch(url);
      }
    }
  });

  it("keys are unique and the reductions are the four the doctor chooses from", () => {
    for (const r of REGIMENS) {
      expect(new Set(r.rps.map((x) => x.key)).size).toBe(r.rps.length);
      for (const day of r.days) expect(rpsOfDay(r, day).length).toBeGreaterThan(0);
    }
    expect([...REDUCTIONS]).toEqual([0, 10, 20, 25]);
  });
});

describe("抗がん薬はレジメンの欄からだけ", () => {
  it("stops a chemo drug drafted outside the regimen panel", async () => {
    const { checkDraft } = await import("./drafts");
    const d = {
      id: "x", origin: "manual" as const, sourceText: "（マスターから選択）", comment: null, kind: "injection" as const,
      items: [{ drugCode: "INJ-PTX", said: "PTX", amount: 300, unit: "mg" }],
      route: "点滴静注" as const, schedule: { kind: "once" as const }, infusionMinutes: 180, infusionScope: "per_dose" as const, rateMlPerH: null, prefer: null,
      start: { day: 0, time: null }, days: null, duplicate: null,
    };
    const ctx = { activeOrders: [], labOrders: [], drafts: [], nowTime: "08:30", fmtDay: (n: number) => `D${n}`, describe: () => "" };
    expect(checkDraft(d as never, ctx).find((i) => i.key === "chemo")?.level).toBe("stop");
    expect(checkDraft({ ...d, sourceText: "（レジメン CBDCA+PTX（3週ごと） 1コース目 day1）" } as never, ctx).find((i) => i.key === "chemo")).toBeUndefined();
  });
});
