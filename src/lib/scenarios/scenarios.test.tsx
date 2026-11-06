import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { generateScenarios, SCENARIOS } from ".";
import { patientMonthPayload } from "../billing/payload";
import { patientMonth } from "../billing/month";
import { DEFAULT_OPTIONS } from "../billing/model";
import { dpcMonth } from "../billing/dpc-claim";
import { FICTIONAL_COEFFICIENT } from "../billing/dpc";
import { receiptRecords, checkUke } from "../billing/uke";
import { receiptInspection } from "../billing/inspect-run";
import { ReceiptRequest } from "../billing/request";
import { findDrug, findOralDrug, findLab, findSet } from "../master";
import { findProc } from "../procedures";
import { loadMaster } from "../masters/server";
import { injectionCell, prescriptionCell, procedureCell } from "../calendar";
import { fluidByDay } from "../flowsheet";
import { dietAt, dietLabel } from "../diet";
import { callHits } from "../standing";
import { createDischargeDraft, collectFacts } from "../discharge";
import { summaryFacts } from "../summary";
import { transferSummary } from "../transfer";
import { ordersOf } from "../record";
import { InjectionCalendar, PrescriptionCalendar, ProcedureCalendar } from "@/components/Calendars";
import { FlowSheet } from "@/components/FlowSheet";
import { StandingCalendar } from "@/components/StandingCalendar";
import { DietCalendar } from "@/components/DietCalendar";

const today = { y: 2026, m: 11, d: 6 };
const iso = "2026-11-06";
const noop = () => {};
const masterDx = new Map(loadMaster("b").rows.map((r) => [r[0], r]));
const inputs = SCENARIOS.cases.map((c) => patientMonthPayload(c.patient, c.patient.history, c.diagnoses, DEFAULT_OPTIONS, { diets: c.diets, insurance: SCENARIOS.insurance[c.patient.id]?.[0].insurance }));

describe("100人の再現可能な時系列", () => {
  it("seed・ID・年齢・段階・保存対象が再現される", () => {
    expect(generateScenarios()).toEqual(SCENARIOS);
    expect(generateScenarios(42).patients).not.toEqual(SCENARIOS.patients);
    expect(SCENARIOS.patients).toHaveLength(100);
    expect(new Set(SCENARIOS.patients.map((p) => p.id)).size).toBe(100);
    expect(new Set(SCENARIOS.patients.map((p) => p.name)).size).toBe(100);
    expect(new Set(SCENARIOS.cases.map((c) => c.stage)).size).toBe(4);
    expect(Math.min(...SCENARIOS.patients.map((p) => p.age))).toBe(0);
    expect(Math.max(...SCENARIOS.patients.map((p) => p.age))).toBe(100);
    expect(SCENARIOS.patients.some((p) => p.admittedOn < -90)).toBe(true);
    expect(SCENARIOS.asks.some((a) => a.kind.includes("回復期"))).toBe(true);
    for (const e of SCENARIOS.er.filter((e) => e.admittedAs)) expect(SCENARIOS.patients.some((p) => p.id === e.admittedAs)).toBe(true);
    for (const c of SCENARIOS.cases) {
      for (const d of c.diagnoses) {
        expect(masterDx.get(d.code)?.[2], `${c.patient.id}: ${d.name}`).toBe(d.name);
        expect(masterDx.get(d.code)?.[8]).toBe(d.icd10);
      }
      expect(c.patient.history.every((e) => e.day <= 0)).toBe(true);
      if (c.patient.dischargedAt) expect(c.patient.history.filter((e) => e.kind === "order" && e.status === "有効")).toHaveLength(0);
    }
  });

  it("100人の算定API入力と全オーダのマスター参照が有効", () => {
    const parsed = ReceiptRequest.safeParse({ today: iso, nowTime: "12:00", month: "2026-11", patients: inputs });
    expect(parsed.success, parsed.success ? "" : parsed.error.message).toBe(true);
    expect(ReceiptRequest.safeParse({ today: iso, nowTime: "12:00", month: "2026-11", patients: [...inputs, inputs[0]] }).success).toBe(false);
    for (const p of SCENARIOS.patients) for (const e of ordersOf(p.history)) {
      if (e.order.type === "injection") for (const item of e.order.items) expect(findDrug(item.drugCode), item.drugCode).toBeDefined();
      if (e.order.type === "prescription") expect(findOralDrug(e.order.drugCode), e.order.drugCode).toBeDefined();
      if (e.order.type === "lab") for (const code of e.order.codes) expect(findLab(code) ?? findSet(code), code).toBeDefined();
      if (e.order.type === "procedure") expect(findProc(e.order.code), e.order.code).toBeDefined();
    }
  });

  it.each(SCENARIOS.cases.map((c, i) => ({ ...c, input: inputs[i] })))("$patient.id 算定・DPC・会計・UKE・点検・カレンダー・サマリ", ({ patient: p, diagnoses, diets, input }) => {
    // Every admission spans its actual months, including the 105-day fixture.
    const pm = patientMonth(input, iso, "12:00", "2026-11");
    expect(Number.isFinite(pm.claim.totalPoints)).toBe(true);
    expect(pm.bill.totalYen).toBeGreaterThanOrEqual(0);
    expect(pm.bill.totalYen).toBe(pm.bill.medicalYen + pm.bill.mealFutanYen);
    const dpc = dpcMonth({ ...input, today: iso, nowTime: "12:00" }, "2026-11", { coefficient: FICTIONAL_COEFFICIENT, transfer: null });
    expect(dpc.month).toBe("2026-11");
    const records = receiptRecords(pm.receipt, 1, "2026-11");
    expect(records[0].startsWith("RE,")).toBe(true);
    if (pm.claim.days > 0) expect(checkUke(records, [pm.receipt])).toEqual([]);
    expect(pm.claim.days).toBe(Math.max(0, Math.min(0, p.dischargedAt?.day ?? 0) - Math.max(-5, p.admittedOn) + 1));
    expect(dpc.ffsTotal).toBe(pm.claim.totalPoints);
    if (dpc.pkg && dpc.dpcTotal !== null) expect(dpc.dpcTotal).toBe(dpc.pkg.total + dpc.outsideTotal);
    const inspection = receiptInspection([input], iso, "12:00", "2026-11")[0];
    expect(inspection.points).toBe(pm.claim.totalPoints);
    const orders = ordersOf(p.history);
    for (const e of orders) for (const day of [-1, 0, 1]) {
      if (e.order.type === "injection") expect(injectionCell(e, day, 720)).toBeDefined();
      if (e.order.type === "prescription") expect(prescriptionCell(e, day, 720)).toBeDefined();
      if (e.order.type === "procedure") expect(procedureCell(e, day, 720)).toBeDefined();
    }
    expect(fluidByDay(orders, [-1, 0, 1], 720)).toBeDefined();
    expect(typeof dietLabel(dietAt(diets, p.id, 0, "昼"))).toBe("string");
    expect(callHits(SCENARIOS.standing[p.id][0], p.vitals.at(-1))).toBeInstanceOf(Array);
    expect(createDischargeDraft(p, p.history, [], today).patientId).toBe(p.id);
    expect(collectFacts(p, orders, diagnoses, today, p.dischargedAt?.day ?? 0)).toBeDefined();
    expect(summaryFacts(p, orders, today, { diagnoses })).not.toHaveLength(0);
    expect(transferSummary(p, orders, { restrained: false })).toBeInstanceOf(Array);
  });

  it("100人で主要なカルテ画面をサーバーレンダリングできる", () => {
    for (const p of SCENARIOS.patients) {
      const common = { patient: p, entries: p.history, today, nowTime: "12:00", selectedDay: null, onSelectDay: noop, onStopDraft: noop, draftedStops: [] };
      for (const Component of [InjectionCalendar, PrescriptionCalendar, ProcedureCalendar]) expect(renderToStaticMarkup(createElement(Component, common))).toContain("table");
      expect(renderToStaticMarkup(createElement(FlowSheet, common))).toBeTruthy();
      expect(renderToStaticMarkup(createElement(StandingCalendar, { ...common, lines: SCENARIOS.standingLines[p.id] }))).toBeTruthy();
      expect(renderToStaticMarkup(createElement(DietCalendar, { ...common, diets: SCENARIOS.diets }))).toBeTruthy();
    }
  }, 30000);

});
