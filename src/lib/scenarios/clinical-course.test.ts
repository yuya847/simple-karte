import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PatientBar } from "../../components/PatientBar";
import { describe, expect, it } from "vitest";
import { generateScenarios } from ".";
import type { NoteEntry } from "../types";
import { dietAt, findTherapeutic } from "../diet";
import { ordersOf } from "../record";

const scenarios = generateScenarios();
const notes = scenarios.patients.flatMap((p) => p.history.filter((e): e is NoteEntry => e.kind === "note"));

describe("病名と経過がつながる100人の臨床記録", () => {
  it.each([20261106, 42, 7])("seed %s：入院主病名は20種類以上、単一病名に集中しない", (seed) => {
    const admitted = generateScenarios(seed).cases.filter((c) => c.stage === "入院");
    const names = admitted.map((c) => c.diagnoses.find((d) => d.main)!.name);
    expect(new Set(names).size).toBeGreaterThanOrEqual(20);
    for (const name of new Set(names)) expect(names.filter((n) => n === name).length / names.length).toBeLessThan(0.3);
  });

  it("すべての入院日にバイタルがあり、結果は記録時点より未来を含まない", () => {
    for (const { patient: p, stage } of scenarios.cases) {
      const last = p.dischargedAt?.day ?? 0;
      for (let day = p.admittedOn; day <= last; day++) {
        expect(p.vitals.some((v) => v.day === day), `${p.id} day ${day}`).toBe(true);
        expect(p.history.some((e) => e.kind === "note" && e.role === "医師" && e.day === day)).toBe(true);
      }
      expect(p.history.some((e) => e.kind === "note" && e.day === p.admittedOn && e.text?.includes(stage === "救急" ? "救急初療記録" : "入院時記録"))).toBe(true);
      expect(p.labs.every((l) => l.day <= (stage === "外来" ? 0 : last))).toBe(true);
      expect(p.cultures.every((c) => c.collectedOn <= last && (c.reportedOn === undefined || c.reportedOn <= last))).toBe(true);
      const initial = p.labs.find((l) => l.day === p.admittedOn && l.values.WBC !== undefined)!;
      for (const code of ["WBC", "Hb", "Plt", "CRP", "BUN", "Cre", "Na", "K"]) expect(initial.values[code], `${p.id} ${code}`).toBeTypeOf("number");
      for (const diet of scenarios.diets.filter((d) => d.patientId === p.id && d.therapeutic)) expect(findTherapeutic(diet.therapeutic), diet.therapeutic).toBeDefined();
    }
  });

  it("敗血症は血液培養・腎機能・乳酸・抗菌薬を備え、確定結果に感受性がある", () => {
    const cases = scenarios.patients.slice(0, 100).filter((p) => /敗血症/.test(p.admissionDiagnosis));
    expect(cases).toHaveLength(2);
    for (const p of cases) {
      expect(p.cultures.some((c) => c.specimen === "血液" && c.sets === "2セット")).toBe(true);
      if (p.admittedOn < -2) expect(p.cultures.some((c) => c.susceptibility?.length)).toBe(true);
      else expect(p.cultures.every((c) => c.status === "培養中" && !c.organism && !c.susceptibility)).toBe(true);
      expect(p.labs.some((l) => l.values.Cre > 0 && l.values.Lac > 0)).toBe(true);
      if (p.admittedOn < 0) expect(p.labs.filter((l) => l.values.CRP !== undefined).at(-1)!.values.CRP).toBeLessThan(p.labs[0].values.CRP);
      const expected = p.infections.includes("MRSA") ? "INJ-VCM05" : "INJ-CTRX1";
      expect(ordersOf(p.history).some((e) => e.order.type === "injection" && e.order.items.some((d) => d.drugCode === expected))).toBe(true);
    }
    const mrsa = cases.find((p) => p.infections.includes("MRSA"))!;
    expect(mrsa.labs.some((l) => l.values.VCM > 0 && l.values.Cre > 0)).toBe(true);
    expect(mrsa.cultures.some((c) => c.collectedOn > mrsa.admittedOn && c.organism?.startsWith("発育なし"))).toBe(true);
  });

  it("同一文章の記事は1割未満で、以前の汎用文を使わず、SOAPと看護DARを持つ", () => {
    const bodies = notes.map((n) => n.text ?? JSON.stringify(n.soap ?? n.focus));
    expect(1 - new Set(bodies).size / bodies.length).toBeLessThan(0.1);
    expect(bodies.join("\n")).not.toMatch(/前回評価以後の生活状況を確認|の経過を再評価/);
    expect(notes.filter((n) => n.soap && Object.values(n.soap).every(Boolean)).length).toBeGreaterThan(100);
    expect(notes.filter((n) => n.focus?.some((f) => f.d && f.act && f.r)).length).toBeGreaterThan(100);
    
    for (const role of ["療法士", "管理栄養士", "MSW"]) expect(notes.some((n) => n.role === role)).toBe(true);
  });

  it("術後、抜管、食事再開、透析導入、終末期の記録が実際のイベントと一致する", () => {
    const hip = scenarios.patients[17];
    expect(scenarios.surgeries.some((s) => s.patientId === hip.id && s.procedure === "人工骨頭挿入術" && s.day === 0)).toBe(true);
    expect(hip.history.some((e) => e.kind === "note" && e.text?.includes("機械的VTE予防"))).toBe(true);
    const respiratory = scenarios.patients[12];
    expect(respiratory.vitals.find((v) => v.day === respiratory.admittedOn + 1)?.o2).toContain("人工呼吸器");
    expect(dietAt(scenarios.diets, respiratory.id, respiratory.admittedOn + 4, "夕")?.kind).toBe("嚥下調整食");
    const dialysis = scenarios.patients[14];
    expect(ordersOf(dialysis.history).some((e) => e.order.type === "procedure" && e.order.hd?.purpose === "導入" && e.order.hd.minutes === 120)).toBe(true);
    const dead = scenarios.patients[28];
    expect(scenarios.discharges[dead.id].outcome).toBe("6");
    expect(dead.dischargedAt?.time).toBe("14:20");
    expect(dead.history.some((e) => e.kind === "note" && e.text?.includes("死亡確認"))).toBe(true);
  });

  it("救急・外来の診療記事と退院サマリ・紹介状が病名ごとの内容を持つ", () => {
    for (const er of scenarios.er.filter((e) => !e.admittedAs)) {
      const base = scenarios.patients.find(p => p.id === er.id)!;
      expect(base.history.some(n => n.kind === "note" && n.text?.includes("救急初療記録"))).toBe(true);
      expect(scenarios.visitChartNotes[`er:${er.id}`] ?? []).toHaveLength(0);
      expect(scenarios.visitOrders[`er:${er.id}`] ?? []).toHaveLength(0);
    }
    for (const opd of scenarios.opd) expect(scenarios.visitNotes[`opd:${opd.id}`].some((n) => n.text.includes("外来再診 SOAP"))).toBe(true);
    for (const draft of Object.values(scenarios.discharges)) {
      expect(draft.sections.complaint.length).toBeGreaterThan(2);
      expect(draft.sections.present.length).toBeGreaterThan(10);
      expect(draft.letter.purpose).toContain(scenarios.patients.find((p) => p.id === draft.patientId)!.admissionDiagnosis);
    }
  });
});

it("部屋のない救急患者を直接開いても病棟名へ置き換えない", () => {
  const p = scenarios.patients.find(p => p.id === "99000112")!;
  const html = renderToStaticMarkup(createElement(PatientBar, { patient: p, today: { y: 2026, m: 11, d: 7 }, diagnoses: [], onOpenDiagnoses: () => {}, onOpenDirective: () => {} }));
  expect(html).toContain("救急外来");
  expect(html).not.toContain("5階東病棟");
});
