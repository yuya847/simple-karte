import { describe, expect, it } from "vitest";
import { dischargeChecklist } from "./discharge-check";
import type { OrderEntry } from "./types";

const inj: OrderEntry = { kind: "order", id: "i", day: 0, time: "09:00", author: "医師", status: "有効", order: { type: "injection", items: [] } as never };
const guide: OrderEntry = { kind: "order", id: "g", day: 0, time: "09:00", author: "医師", status: "有効", order: { type: "procedure", code: "PROC-GUIDE", start: { day: 0 }, guide: { kind: "栄養食事指導", note: "" } } as never };

describe("退院の準備", () => {
  it("lists what is still to do, from the record", () => {
    const items = dischargeChecklist({ entries: [inj, guide], homeRx: { exists: true, handed: false }, documents: ["退院証明書"], guidance: [], restrained: true });
    const state = Object.fromEntries(items.map((i) => [i.label, i.state]));
    expect(state).toMatchObject({ 退院時の薬: "todo", 退院証明書: "ok", 退院療養計画書: "todo", 指導の依頼: "todo", 身体的拘束: "todo", "注射・酸素・カテーテルの有効なオーダ": "todo" });
  });
  it("is all done when everything is finished", () => {
    const items = dischargeChecklist({ entries: [guide], homeRx: { exists: false, handed: false }, documents: ["退院証明書", "退院療養計画書"], guidance: ["栄養食事指導"], restrained: false });
    expect(items.filter((i) => i.state === "todo")).toEqual([]);
    expect(items[0].state).toBe("none");
  });
});

describe("退院日は算定に渡る", () => {
  it("puts the day discharge was carried out into the claim's patient", async () => {
    const { patientMonthPayload } = await import("./billing/payload");
    const { PATIENTS } = await import("./patients");
    const { DEFAULT_OPTIONS } = await import("./billing/model");
    const p = { ...PATIENTS[0], dischargedAt: { day: 0, time: "10:00", by: "看護師 佐藤" } };
    expect(patientMonthPayload(p, [], [], DEFAULT_OPTIONS).patient).toMatchObject({ dischargedOn: 0 });
    expect(patientMonthPayload(PATIENTS[0], [], [], DEFAULT_OPTIONS).patient).not.toHaveProperty("dischargedOn");
  });
});
