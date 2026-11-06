import { expect, it } from "vitest";
import { cathCodes, cathConsents, cathProblems, emptyCath } from "./cardiac-cath";
import { checkPhysio, emptyPhysio } from "./exams";
import { toOrder, type CheckContext } from "./drafts";
import { orderConsentDrafts } from "./consent-drafts";
import { SCENARIOS } from "./scenarios";
import { physioRows } from "./physio-desk";
import { slotsFor } from "./exam-slots";
it("検査と確認を医師が指定し、カテとPCIの同意書をオーダへつなぐ", () => {
  expect(cathProblems(emptyCath()).length).toBeGreaterThan(0);
  const cath = { ...emptyCath(), studies: ["冠動脈造影 CAG", "右心カテ"], approach: "橈骨" as const, side: "右" as const, renalChecked: true, allergyChecked: true, metformin: "内服なしを確認", pci: true };
  expect(cathProblems(cath)).toEqual([]);
  expect(cathCodes(cath)).toEqual(["160064510", "160064610"]);
  const draft = { ...emptyPhysio("d", "PHY-CATH"), cath, consentPlanned: true, purpose: "虚血評価", place: "検査室" as const, transport: "車椅子" as const, when: { day: 1, time: "09:00", priority: "予約" as const } };
  const ctx = { nowTime: "10:00", activeOrders: [], consents: [], fmtDay: String } as unknown as CheckContext;
  expect(checkPhysio(draft, ctx).filter(i => i.level !== "info")).toEqual([]);
  const result = toOrder(draft, ctx);
  expect(result.order).toMatchObject({ test: "PHY-CATH", cath });
  expect(result.consents).toEqual(cathConsents(cath));
  let n = 0;
  expect(orderConsentDrafts([{ id: "o", order: result.order! }], "A", "10:00", () => String(++n), result.consents).map(c => [c.patientId, c.orderId, c.code])).toEqual([["A", "o", "CONSENT-CATH"], ["A", "o", "CONSENT-PCI"]]);
});
it("100人の1〜2件が生理検査室の受付に出る", () => {
  const rows = physioRows(SCENARIOS.patients.map(patient => ({ patient, room: patient.room, entries: patient.history.filter(e => e.kind === "order") })), SCENARIOS.physioDesk).filter(r => r.test === "PHY-CATH");
  expect(rows.length).toBeGreaterThanOrEqual(1); expect(rows.length).toBeLessThanOrEqual(2);
  expect(rows.every(r => r.status === "予約")).toBe(true);
  expect(slotsFor("PHY-CATH", 1, [], { y: 2026, m: 11, d: 4 }).map(s => s.time)).toEqual(["09:00", "11:00", "14:00", "16:00"]);
});
it("予定のみは算定せず、実施済みの左心・右心をマスターコードで算定する", async () => {
  const { calculateClaim } = await import("./billing/engine");
  const { DEFAULT_OPTIONS } = await import("./billing/model");
  const order = { type: "physio" as const, test: "PHY-CATH", cath: { ...emptyCath(), studies: ["冠動脈造影 CAG", "右心カテ"] }, purpose: "虚血評価", when: { day: -1, time: "09:00", priority: "予約" as const }, place: "検査室" as const };
  const calculate = (day: number) => calculateClaim({ today: "2026-11-05", nowTime: "18:00", month: "2026-11", patient: { id: "t", name: "試験", sex: "男", age: 70, admittedOn: -3 }, entries: [{ kind: "order", id: "c", day: -2, time: "09:00", author: "医師", status: "有効", order: { ...order, when: { ...order.when, day } } }], daily: [], cultures: [], diagnoses: [], options: DEFAULT_OPTIONS });
  const codes = (day: number) => calculate(day).acts.flatMap(a => a.parts.flatMap(p => p.lines.map(l => l.code)));
  expect(codes(-1)).toContain("160064510"); expect(codes(-1)).toContain("160064610");
  expect(codes(1)).not.toContain("160064510");
});
