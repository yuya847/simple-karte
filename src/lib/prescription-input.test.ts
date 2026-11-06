import { describe, expect, it } from "vitest";
import { findOralDrug, PRESCRIPTION_DRUGS } from "./master";
import { PEN_NEEDLE_CODE, TOPICAL_PRESCRIPTIONS } from "./prescription-kind";
import { checkPrescription, toPrescriptionOrders, type PrescriptionDraft } from "./rx";
import { bagsOf, bagLine } from "./discharge-rx";
import { oralToDispense } from "./oral-dispense";
import { PATIENTS } from "./patients";
import { linesFromDrafts } from "./national/rx-lines";
import type { CheckContext } from "./drafts";
import type { OrderEntry } from "./types";
const ctx: CheckContext = { activeOrders: [], labOrders: [], drafts: [], nowTime: "09:00", fmtDay: String, describe: e => e.id, allergies: [] };
export const topicalDraft = (over: Partial<PrescriptionDraft> = {}): PrescriptionDraft => ({ id: "top", kind: "prescription", origin: "manual", sourceText: "", comment: "自己管理", category: "臨時", administration: { kind: "外用", usage: "1日1回 腰に貼付" }, items: [{ drugCode: "620003477", said: "ロキソニンパップ", daily: null, perDose: 14 }], timings: [], days: null, prn: null, maxPerDay: null, start: { day: 0, timing: null }, acks: [], ...over });
export const entryOf = (d: PrescriptionDraft): OrderEntry => ({ id: d.id, kind: "order", status: "有効", day: 0, time: "09:00", author: "医師", order: toPrescriptionOrders(d, "09:00", d.id)[0] });
describe("外用・材料の総量処方", () => {
  it("採用外用全品目とペン針を検索できる", () => {
    expect(TOPICAL_PRESCRIPTIONS.length).toBeGreaterThan(100);
    for (const d of TOPICAL_PRESCRIPTIONS) expect(findOralDrug(d.code)?.prescriptionKind).toBe("外用");
    for (const term of ["インスリン針", "ペン針"]) expect(PRESCRIPTION_DRUGS.find(d => d.aliases.includes(term))?.code).toBe(PEN_NEEDLE_CODE);
  });
  it("外用は日数・頓用条件なしで総量を保存し、用法と総量を処方行へ渡す", () => {
    const d = topicalDraft();
    expect(checkPrescription(d, ctx)).toEqual([]);
    const o = entryOf(d).order;
    expect(o).toMatchObject({ type: "prescription", amount: 14, unit: "枚", administration: d.administration });
    expect(linesFromDrafts([d])[0]).toMatchObject({ perDose: 14, days: null, administration: d.administration });
    expect(checkPrescription(topicalDraft({ administration: { kind: "外用", usage: "" } }), ctx).some(i => i.level === "stop")).toBe(true);
  });
  it("針は整数本で処方し、端数を拒否する", () => {
    const d = topicalDraft({ administration: { kind: "材料", usage: "自己注射用" }, items: [{ drugCode: PEN_NEEDLE_CODE, said: "ペン針", daily: null, perDose: 30 }] });
    expect(checkPrescription(d, ctx)).toEqual([]);
    expect(entryOf(d).order).toMatchObject({ amount: 30, unit: "本" });
    d.items[0].perDose = 0.5;
    expect(checkPrescription(d, ctx).some(i => i.level === "stop")).toBe(true);
  });
  it("調剤・退院薬袋・お薬手帳でも回数や日数を掛けない", () => {
    const d = topicalDraft();
    const e = entryOf(d);
    const dispensed = oralToDispense([{ patient: PATIENTS[0], room: "101", entries: [e] }], { kind: "臨時" }, 600);
    expect(dispensed[0].rps[0].lines[0].total).toBe(14);
    const bag = bagsOf([entryOf(topicalDraft({ category: "退院時" }))])[0];
    expect(bag.kind).toBe("外用");
    expect(bag.drugs[0].total).toBe(14);
    expect(bagLine(bag)).toContain("総量14枚");
    expect(bagLine(bag)).toContain("腰に貼付");
    expect(bagLine(bag)).not.toContain("日分");
  });
});
