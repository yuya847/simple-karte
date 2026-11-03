import { describe, expect, it } from "vitest";
import { DEFAULT_OPTIONS } from "./model";
import { patientMonth, type PatientMonthInput } from "./month";
import { patientMonthPayload } from "./payload";
import { PATIENTS } from "../patients";
import type { OrderEntry } from "../types";

describe("病棟の記録から算定まで", () => {
  it("carries the 未実施 doses and the discharge day through to the claim", () => {
    const p = PATIENTS[0];
    const inj: OrderEntry = {
      kind: "order",
      id: "t-vcm",
      day: -3,
      time: "09:00",
      author: "試験",
      status: "有効",
      order: { type: "injection", items: [{ drugCode: "INJ-VCM05", amount: 1, unit: "g" }, { drugCode: "INJ-NS100", amount: 100, unit: "mL" }], route: "点滴静注", schedule: { kind: "every_hours", hours: 12 }, start: { day: -3, time: "10:00" } } as never,
    };
    const month = "2026-11";
    const run = (notGiven: string[]) =>
      patientMonth(patientMonthPayload({ ...p, history: [], dischargedAt: { day: 0, time: "10:00", by: "看護師" } }, [inj], [], { ...DEFAULT_OPTIONS, nyutaiin: true }, { notGiven }) as unknown as PatientMonthInput, "2026-11-03", "12:00", month);
    // An act groups the days with the same content: quantity × the times on those days.
    const qty = (r: ReturnType<typeof run>) =>
      r.claim.acts
        .filter((a) => a.shikibetsu === "33")
        .reduce((s, a) => s + a.parts.flatMap((x) => x.lines).filter((l) => l.code === "620005694").reduce((t, l) => t + (l.quantity ?? 0), 0) * Object.values(a.days as Record<string, number>).reduce((t, n) => t + n, 0), 0);
    const all = run([]);
    const less = run([`t-vcm|${-2 * 1440 + 22 * 60}`]);
    expect(qty(all) - qty(less)).toBe(2); // one dose of 2 vials
    expect(all.claim.acts.some((a) => a.parts.some((x) => x.lines.some((l) => l.code === "190192310")))).toBe(true); // 入退院支援加算１ on the discharge day
  });
});
