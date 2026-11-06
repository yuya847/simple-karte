import { describe, expect, it } from "vitest";
import { ASSUMED_INSURANCE_ISSUE, INSURANCE, type Insurance } from "./insurance";
import { DEFAULT_OPTIONS } from "./model";
import { patientMonth, type PatientMonthInput } from "./month";
import { patientMonthPayload } from "./payload";
import { ClaimRequest } from "./request";
import { PATIENTS } from "../patients";
import type { OrderEntry } from "../types";

describe("保険の登録を算定に使う", () => {
  // A patient admitted in this session: no insurance in the demo data.
  const p = { ...PATIENTS[0], id: "90029999", history: [] };
  const run = (insurance?: Insurance) => patientMonth(patientMonthPayload(p, [], [], DEFAULT_OPTIONS, { insurance }) as unknown as PatientMonthInput, "2026-11-03", "12:00", "2026-11");
  const registered = INSURANCE["90010231"];

  it("assumes from age while nothing is registered, and says so", () => {
    const r = run();
    expect(r.insurance.assumed).toBe(true);
    expect(r.claim.issues.some((i) => i.text === ASSUMED_INSURANCE_ISSUE)).toBe(true);
  });
  it("uses the registered insurance once 医事課 registers it: the note goes away", () => {
    const r = run(registered);
    expect(r.insurance).toEqual(registered);
    expect(r.claim.issues.some((i) => i.text === ASSUMED_INSURANCE_ISSUE)).toBe(false);
    expect(r.receipt.patient.insurance.insurerNumber).toBe(registered.insurerNumber);
  });
  it("the API takes the registered insurance, drops unknown fields and refuses a wrong 検証番号", () => {
    const body = { today: "2026-11-03", nowTime: "12:00", month: "2026-11", ...patientMonthPayload(p, [], [], DEFAULT_OPTIONS, { insurance: { ...registered, assumed: true } as Insurance }) };
    const ok = ClaimRequest.safeParse(body);
    expect(ok.success).toBe(true);
    expect(ok.data?.insurance).toEqual(registered);
    const last = Number(registered.insurerNumber.slice(-1));
    const wrong = registered.insurerNumber.slice(0, -1) + String((last + 1) % 10);
    expect(ClaimRequest.safeParse({ ...body, insurance: { ...registered, insurerNumber: wrong } }).success).toBe(false);
  });
});

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

describe("保険の適用期間", () => {
  it("現在の保険より請求月の履歴を優先し、期間外は未登録として知らせる", () => {
    const p = {...PATIENTS[0], id: "period-trial"};
    const old = {...INSURANCE["90010260"], validFrom: "2026-10-01", validUntil: "2026-10-31"};
    const next = {...old, kind: "共済" as const, validFrom: "2026-11-01", validUntil: "2027-10-31"};
    const input = patientMonthPayload(p, [], [], DEFAULT_OPTIONS, {insurance: next, insuranceHistory: [old, next]}) as unknown as PatientMonthInput;
    expect(patientMonth(input, "2026-11-07", "10:00", "2026-10").insurance).toEqual(old);
    expect(patientMonth(input, "2026-11-07", "10:00", "2026-11").insurance).toEqual(next);
    expect(patientMonth(input, "2026-11-07", "10:00", "2026-09").insurance.assumed).toBe(true);
  });
});
