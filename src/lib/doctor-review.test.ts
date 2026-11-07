import { describe, expect, it } from "vitest";
import { ingredientDose, latestWeight } from "./dose-ingredient";
import { pregnancyLabel } from "./pregnancy";
import { generateScenarios } from "./scenarios";
import { findOralDrug } from "./master";
import { checkDraft, newProcedureDraft, type CheckContext } from "./drafts";
import type { OrderEntry } from "./types";
import { OBSERVATION_PRESETS } from "./flow-observation";

const data = generateScenarios();
describe("医師の画面点検", () => {
  it("一般100人の検査引用は、記載した採血日の最終結果と一致する", () => {
    let count = 0;
    for (const p of data.patients.slice(0, 100)) for (const e of p.history) {
      if (e.kind !== "note") continue;
      const text = [e.text, e.soap?.o].join(" ");
      const match = text.match(/採血（入院(\d+)日目）：([^。]+)/);
      if (!match) continue;
      const day = p.admittedOn + Number(match[1]) - 1;
      expect(day).toBeLessThanOrEqual(e.day);
      const values = Object.assign({}, ...p.labs.filter(l => l.day === day).sort((a, b) => a.time.localeCompare(b.time)).map(l => l.values));
      for (const [, code, value] of match[2].matchAll(/(WBC|Hb|CRP|Cre|Na|K) ([\d.]+)/g)) expect(Number(value), `${p.id} ${e.day} ${code}`).toBe(values[code]);
      count++;
    }
    expect(count).toBeGreaterThan(1000);
    const p = data.patients.find(p => p.id === "99000022")!;
    const note = p.history.find(e => e.kind === "note" && e.day === 0 && e.soap);
    expect(note?.kind === "note" && note.soap?.o).toContain(`Cre ${p.labs.at(-1)!.values.Cre}mg/dL`);
  });
  it("カロナール50%の製剤0.4gは200mg、18kgで11.11mg/kg", () => {
    const drug = findOralDrug("620000032")!;
    expect(ingredientDose(drug, 0.4, 18)?.mg).toBe(200);
    expect(ingredientDose(drug, 0.4, 18)?.mgPerKg).toBeCloseTo(11.111);
    expect(ingredientDose(drug, 0.4, 0)?.mgPerKg).toBeNull();
    for (const amount of [0, -1, NaN, Infinity]) expect(ingredientDose(drug, amount, 18)).toBeNull();
    expect(ingredientDose({ name: "不明散", strength: "不明", unit: "g" }, 1, 18)).toBeNull();
    expect(ingredientDose({ name: "配合散50%", strength: "50%", unit: "g" }, 1, 18)).toBeNull();
    expect(ingredientDose({ name: "シロップ", strength: "20mg/mL", unit: "mL" }, 10, 20)).toEqual({ mg: 200, mgPerKg: 10 });
    expect(ingredientDose({ name: "カロナールシロップ２％", strength: "2%", unit: "mL" }, 10, 20)).toEqual({ mg: 200, mgPerKg: 10 });
    expect(ingredientDose({ name: "シロップ60%", strength: "60%", unit: "mL" }, 10, 20)).toBeNull();
  });
  it("体重は測定日の新しい値を使い、未来の測定を使わない", () => {
    expect(latestWeight({ weightKg: 18, daily: [{ day: -2, weightKg: 17 }, { day: 0, weightKg: 19 }, { day: 1, weightKg: 20 }] as never })).toBe(19);
  });
  it("28週0日の入院から11日目は29週3日、翌日は29週4日", () => {
    expect(pregnancyLabel({ weeks: 28, referenceDay: -10 }, -10)).toBe("29週3日");
    expect(pregnancyLabel({ weeks: 28, referenceDay: -10 }, -10, 1)).toBe("29週4日");
    expect(pregnancyLabel({ weeks: 28, referenceDay: 0 }, -10)).toBe("28週0日");
    expect(pregnancyLabel({ weeks: null }, -10)).toBe("週数不明");
  });
  it("透析導入の過去の単回と実施済を除き、継続指示を重複候補にする", () => {
    const p = data.patients.find(p => p.id === "99000015")!;
    const hd = p.history.filter((e): e is OrderEntry => e.kind === "order" && e.order.type === "procedure" && e.order.code === "PROC-HD");
    expect(hd.length).toBeGreaterThanOrEqual(2);
    const d = { ...newProcedureDraft("PROC-HD", "hd"), code: "PROC-HD", start: { day: 0, time: null } };
    const ctx: CheckContext = { activeOrders: hd, labOrders: [], drafts: [d], nowTime: "08:00", fmtDay: String, describe: e => e.id };
    const duplicate = checkDraft(d, ctx).find(i => i.key === "duplicate");
    const ongoing = hd.find(e => e.order.type === "procedure" && e.order.schedule.kind !== "once")!;
    expect(duplicate?.message).toContain(ongoing.id);
    const once = hd.find(e => e.order.type === "procedure" && e.order.schedule.kind === "once")!;
    expect(checkDraft(d, { ...ctx, activeOrders: [{ ...once, status: "有効" }] }).some(i => i.key === "duplicate")).toBe(false);
    const done = { ...ongoing, status: "実施済" as const };
    expect(checkDraft(d, { ...ctx, activeOrders: [done] }).some(i => i.key === "duplicate")).toBe(false);
  });
  it("一般100人の記事にある主要な内服治療には処方履歴がある", () => {
    for (const { patient: p, stage } of data.cases.slice(0, 100)) {
      const duration = (p.dischargedAt?.day ?? 0) - p.admittedOn;
      const codes = p.history.flatMap(e => e.kind === "order" && e.order.type === "prescription" ? [e.order.drugCode] : []);
      const required = /ディフィシル/.test(p.admissionDiagnosis) && duration >= 1 ? ["620008047"]
        : /アテローム血栓性脳梗塞/.test(p.admissionDiagnosis) ? ["610443053"]
        : /心不全/.test(p.admissionDiagnosis) && duration >= 3 ? stage === "入院" ? ["ORAL-FRS20", "ORAL-SPL25", "ORAL-ENA5"] : ["ORAL-FRS20"]
        : /肝硬変/.test(p.admissionDiagnosis) ? ["ORAL-FRS20", "ORAL-SPL25"] : [];
      for (const code of required) expect(codes, `${p.id} ${code}`).toContain(code);
    }
  });
  it("NIHSSを数値の観察項目として追加できる", () => {
    expect(OBSERVATION_PRESETS.find(p => p.item === "NIHSS")).toMatchObject({ inputKind: "number", unit: "点" });
  });
});
