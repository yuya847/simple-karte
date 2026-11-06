import { describe, expect, it } from "vitest";
import { interventionDraft, insulinDay, repeatedScale, glucoseEntry } from "./insulin-intervention";
import { toOrder } from "./drafts";
import { currentEntries } from "./record";
import { doseTimes } from "./flowsheet";
import { defaultSliding } from "./insulin";
import { insulinDoses } from "./insulin-doses";
import { menuRecord } from "./order-execute";
import { buildWorksheet } from "./worksheet";
import { glucosePoints } from "./flow-meds";
import { PATIENTS } from "./patients";
import { addInsulinDemo, demoInsulinRecords } from "./insulin-demo";
import type { InjectionOrder, OrderEntry } from "./types";
const order: InjectionOrder = { type: "injection", items: [{ drugCode: "DEMO-INS-LISPRO", amount: 0, unit: "単位" }], route: "皮下注", schedule: { kind: "per_day", count: 4 }, start: { day: -6, time: "07:30" }, insulinDoses: insulinDoses([2, 2, 2, 0]), doseTimes: ["07:30", "11:30", "17:30", "21:00"], sliding: defaultSliding() };
const entry: OrderEntry = { kind: "order", id: "ins", day: -6, time: "07:00", author: "医師", status: "有効", order };
describe("インスリン介入", () => {
  it("入力を注射の変更下書きにし、開始日時と旧版を保持する", () => {
    const d = interventionDraft("DEMO-INS-LISPRO", "２－２－２－０", 1, undefined, entry);
    expect(d.insulinDoses?.map(x => x.units)).toEqual([2, 2, 2, 0]);
    expect(d.duplicate).toEqual({ action: "replace", orderId: "ins" });
    expect(d.start).toEqual({ day: 1, time: "07:30" });
    const saved = toOrder(d, { drafts: [d], activeOrders: [entry], labOrders: [], nowTime: "10:00", fmtDay: String, describe: e => e.id });
    expect(saved.stopIds).toEqual([entry.id]);
    const next: OrderEntry = { ...entry, id: "next", day: 0, order: saved.order! };
    const previous = currentEntries({ ...PATIENTS[0], history: [entry] }, { added: [next], stopped: saved.stopIds, stopTimes: { ins: "10:00" } })[0] as OrderEntry;
    expect(previous.stoppedOn).toBe(1);
    expect(previous.stoppedTime).toBe("07:30");
    expect(doseTimes(previous, 600, 0, 1440)).toHaveLength(4);
    expect(doseTimes(previous, 600, 1440, 2880)).toHaveLength(0);
    expect(interventionDraft("DEMO-INS-GLARGINE", "0-0-2-0", 2, undefined).doseTimes).toEqual(["17:30"]);
    expect(() => interventionDraft("DEMO-INS-LISPRO", "31-2-2-0", 1, undefined)).toThrow();
    expect(() => interventionDraft("DEMO-INS-LISPRO", "2-2-2-0", 0, undefined)).toThrow();
  });
  it("看護師の同じ実施記録から血糖・総量・スケール分を集計し、取り消しを除外する", () => {
    const patient = PATIENTS[0];
    const item = buildWorksheet([{ patient, room: "101", entries: [entry] }], 0, 1440, 0).timed[0];
    const r = menuRecord(item, { status: "実施", day: 0, time: "07:30", by: "看護師", glucose: 280 })!;
    expect(r.insulin).toEqual({ glucose: 280, units: 6 });
    expect(insulinDay([entry], { [r.key]: r }, patient.id, 0)).toMatchObject({ total: 6, scale: 4 });
    expect(glucosePoints([], [], [], [r])[0].value).toBe(280);
    expect(insulinDay([entry], { a: { ...r, cancellation: { by: "看護師", at: "08:00", reason: "訂正" } }, b: { ...r, patientId: "other" }, c: { ...r, status: "未実施" } }, patient.id, 0).total).toBe(0);
    expect(insulinDay([entry], {}, patient.id, 0).total).toBe(0);
  });
  it("100人の架空の糖尿病・DKA・ステロイド患者に数日分を作り、連続した実施量を数える", () => {
    const patients = Array.from({ length: 100 }, (_, i) => ({ ...structuredClone(PATIENTS[0]), id: `demo-${i}`, admittedOn: -6, admissionDiagnosis: ["糖尿病", "DKA", "ステロイド使用"][i % 3], history: [], daily: [] }));
    patients.forEach(addInsulinDemo);
    const records = demoInsulinRecords(patients);
    expect(Object.keys(records)).toHaveLength(2400);
    const entries = patients[0].history as OrderEntry[];
    expect(repeatedScale(entries, records, patients[0].id, -1)).toContain("3日続けて朝のスケール4単位以上");
    expect(patients[0].daily).toHaveLength(7);
  });
});

it("血糖入力は共通の看護観察を開き、既存の観察項目を二重に作らない", () => {
  const first = glucoseEntry([], "p", 0, "10:00", "看護師", "glu");
  expect(first.request).toEqual({ kind: "care", item: "血糖測定", lo: 0, hi: 1440 });
  expect(first.order?.unit).toBe("mg/dL");
  expect(glucoseEntry([first.order!], "p", 0, "11:00", "看護師", "next").order).toBeUndefined();
});
