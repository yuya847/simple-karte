import { describe, expect, it } from "vitest";
import { chartIdOf, WARD_CHART_PATIENTS } from "./ward-charts";
import {
  DESIGN_ITEMS,
  PRESSURE_SOURCES,
  REASSESS_DAYS,
  areaOf,
  courseOf,
  designComplete,
  designText,
  designTotal,
  fitWithin,
  initialUlcers,
  pocketCodeOf,
  pressurePlanAuto,
  samplePhoto,
  scoreProblems,
  sizeCodeOf,
  ulcerDue,
  wardUlcerRows,
  type DesignScore,
  type PressureUlcer,
} from "./pressure-course";

const score = (x: Partial<DesignScore> = {}): DesignScore => ({ depth: "D3", e: "e3", s: "s6", i: "i1", g: "g3", n: "N3", p: "p0", ...x });

describe("DESIGN-R®2020 の項目と点数（通知 別紙3 のとおり）", () => {
  it("has the six items that are added up, with the points of 別紙3", () => {
    expect(DESIGN_ITEMS.map((x) => x.name)).toEqual(["滲出液", "大きさ（cm²）", "炎症・感染", "肉芽形成（良性肉芽が占める割合）", "壊死組織", "ポケット（cm²）"]);
    const pts = Object.fromEntries(DESIGN_ITEMS.map((x) => [x.key, x.grades.map((g) => g.points)]));
    expect(pts).toEqual({ e: [0, 1, 3, 6], s: [0, 3, 6, 8, 9, 12, 15], i: [0, 1, 3, 3, 9], g: [0, 1, 3, 4, 5, 6], n: [0, 3, 6], p: [0, 6, 9, 12, 24] });
    // 「3C」と「3」はどちらも3点 (※3).
    expect(DESIGN_ITEMS.find((x) => x.key === "i")!.grades.filter((g) => g.points === 3).map((g) => g.code)).toEqual(["I3C", "I3"]);
    expect(PRESSURE_SOURCES.form.url).toMatch(/^https:\/\/www\.mhlw\.go\.jp\//);
    expect(PRESSURE_SOURCES.scale.url).toContain("jspu.org");
  });

  it("adds up the six items but not the depth (別紙3 ※1)", () => {
    expect(designTotal(score())).toBe(3 + 6 + 1 + 3 + 3 + 0);
    expect(designTotal(score({ depth: "d1" }))).toBe(designTotal(score({ depth: "D5" })));
    expect(designTotal(score({ e: "E6", s: "S15", i: "I9", g: "G6", n: "N6", p: "P24" }))).toBe(66);
    expect(designText(score())).toBe("D3-e3s6i1g3N3p0");
  });

  it("knows when every item has been chosen", () => {
    expect(designComplete(score())).toBe(true);
    expect(designComplete({ ...score(), g: "" })).toBe(false);
    expect(designComplete({ ...score(), e: "e2" })).toBe(false);
  });

  it("finds the size and pocket bins from what was measured (cm²)", () => {
    expect(areaOf({ lengthCm: 4.5, widthCm: 3 })).toBe(13.5);
    expect([0, 3.9, 4, 15.9, 16, 35.9, 36, 63.9, 64, 99.9, 100].map(sizeCodeOf)).toEqual(["s0", "s3", "s6", "s6", "s8", "s8", "s9", "s9", "s12", "s12", "S15"]);
    // ポケット = ポケットの面積 − 潰瘍面積.
    expect(pocketCodeOf(13.5, 13.5)).toBe("p0");
    expect(pocketCodeOf(16, 13.5)).toBe("P6");
    expect(pocketCodeOf(30, 13.5)).toBe("P12");
    expect(pocketCodeOf(60, 13.5)).toBe("P24");
  });

  it("says where the chosen codes and the measurement disagree", () => {
    expect(scoreProblems(score({ s: "s6" }), { lengthCm: 4.5, widthCm: 3 })).toEqual([]);
    expect(scoreProblems(score({ s: "s8" }), { lengthCm: 4.5, widthCm: 3 })[0]).toContain("13.5cm² は s6");
    expect(scoreProblems(score(), { lengthCm: 2, widthCm: 3 })[0]).toContain("短径");
    expect(scoreProblems(score({ s: "s6", p: "p0" }), { lengthCm: 4.5, widthCm: 3 }, { lengthCm: 6, widthCm: 5 })[0]).toContain("P12");
  });
});

describe("経過・期限・病棟の一覧", () => {
  const u: PressureUlcer = { id: "u1", patientId: "p1", site: "仙骨部", foundOn: -10, origin: "院内発生", by: "看護師 A", assessments: [] };
  const at = (day: number, s: Partial<DesignScore> = {}) => ({ id: `a${day}`, at: { day, time: "10:00" }, by: "看護師 A", score: score(s), note: "" });

  it("is due on the day it was found until the first assessment, then 7 days after the last", () => {
    expect(ulcerDue(u)).toEqual({ dueOn: -10, state: "期限切れ" });
    expect(ulcerDue({ ...u, assessments: [at(-7)] })).toEqual({ dueOn: -7 + REASSESS_DAYS, state: "今日まで" });
    expect(ulcerDue({ ...u, assessments: [at(-7), at(-2)] }).state).toBe("期限内");
    expect(ulcerDue({ ...u, assessments: [at(-9)], healed: { day: -1, time: "10:00", by: "x" } }).state).toBe("治癒");
  });

  it("lists the ward's patients with pressure injuries, overdue first, with the change in the total", () => {
    const rows = wardUlcerRows(
      [
        { ...u, id: "a", patientId: "p1", assessments: [at(-3, { s: "s8" }), at(-1)] },
        { ...u, id: "b", patientId: "p2", assessments: [at(-9)] },
        { ...u, id: "c", patientId: "p3", assessments: [at(-9)], healed: { day: 0, time: "09:00", by: "x" } },
        { ...u, id: "d", patientId: "elsewhere", assessments: [at(-1)] },
      ],
      (id) => ({ p1: { name: "一", room: "512" }, p2: { name: "二", room: "515B" }, p3: { name: "三", room: "516A" } })[id],
    );
    expect(rows.map((r) => r.ulcer.id)).toEqual(["b", "a"]);
    expect(rows[1].change).toBe(-2);
    expect(rows[0].due.state).toBe("期限切れ");
  });

  it("keeps the course in time order", () => {
    expect(courseOf({ ...u, assessments: [at(-1), at(-5), at(-3)] }).map((a) => a.at.day)).toEqual([-5, -3, -1]);
  });
});

describe("写真の取り込み", () => {
  it("only makes an image smaller, keeping its shape", () => {
    expect(fitWithin(4000, 3000, 480)).toEqual({ width: 480, height: 360 });
    expect(fitWithin(300, 1200, 480)).toEqual({ width: 120, height: 480 });
    expect(fitWithin(320, 240, 480)).toEqual({ width: 320, height: 240 });
    expect(fitWithin(0, 10, 480)).toEqual({ width: 0, height: 0 });
  });

  it("the samples are drawn shapes marked as fictional", () => {
    const p = samplePhoto(1);
    expect(p.sample).toBe(true);
    expect(p.dataUrl.startsWith("data:image/svg+xml")).toBe(true);
    expect(decodeURIComponent(p.dataUrl)).toContain("架空の見本（図形）");
  });
});

describe("架空の記録と診療計画書", () => {
  it("the fictional ulcers belong to 5階東 patients and their codes match what was measured", () => {
    const ids = new Set(WARD_CHART_PATIENTS.map((p) => p.id));
    for (const u of initialUlcers()) {
      expect(ids.has(u.patientId)).toBe(true);
      for (const a of u.assessments) {
        expect(designComplete(a.score)).toBe(true);
        expect(scoreProblems(a.score, a.size, a.pocket)).toEqual([]);
        expect(a.photo?.sample ?? true).toBe(true);
      }
    }
    expect(initialUlcers()[0].patientId).toBe(chartIdOf("515", "A"));
  });

  it("fills the plan's record parts: the ulcers now, the risk items, the latest DESIGN-R®", () => {
    const [noguchi] = initialUlcers();
    const f = pressurePlanAuto({ ulcers: [noguchi], fmt: (d) => `D${d}`, risk: { adl: "B2", items: [{ label: "病的骨突出", yes: "あり", no: "なし", on: true }, { label: "関節拘縮", yes: "あり", no: "なし" }], by: "看護師 A", day: -4 } });
    expect(f.ulcerNow).toBe("あり（仙骨部）");
    expect(f.foundOn).toBe("仙骨部 D-4（持ち込み）");
    expect(f.design).toBe("仙骨部　D3-e3s6i1g3N3p0（合計16点）　D-1 看護師 渡辺");
    expect(f.risk).toContain("病的骨突出：あり");
    expect(f.risk).toContain("関節拘縮：（未評価）");
    expect(pressurePlanAuto({ ulcers: [], fmt: String }).risk).toContain("まだ");
  });
});
