import { describe, expect, it } from "vitest";
import { expiryCounts, expiryExtension, expiryInbox, expiryRequest, receivesExpiry } from "./rx-expiry-workflow";
import { rxExpiries } from "./rx-expiry";
import { PATIENTS } from "./patients";
import { toOrder, type CheckContext } from "./drafts";
import type { OrderEntry } from "./types";
const today = { y: 2026, m: 11, d: 6 };
const patient = { ...PATIENTS[0], ward: "5階東" };
const entry: OrderEntry = { kind: "order", id: "expiry", day: -2, time: "09:00", author: patient.attending, status: "有効", order: { type: "prescription", category: "定期", drugCode: "ORAL-AMLO5", amount: 1, unit: "錠", timings: ["朝"], start: { day: -2 }, days: 4 } };
describe("処方切れの伝達と医師の判断", () => {
  it("主治医・チームと、研修医の指導医へ届ける", () => {
    const doctors = { attending: "別の主治医", others: [{ name: "研修医 田中", role: "担当医" as const, by: "医師", since: { day: 0, time: "09:00" } }] };
    expect(receivesExpiry("指導医 高橋", doctors)).toBe(true);
    expect(receivesExpiry("別の主治医", doctors)).toBe(true);
    expect(receivesExpiry("放射線科 石田", doctors)).toBe(false);
  });
  it("他職種の伝達を患者一覧に載せ、終了で件数も消す", () => {
    const r = rxExpiries(patient, [entry], today)[0];
    const request = expiryRequest(patient, r, "薬剤師 小林");
    const people = [{ patient, entries: [entry] }];
    const inbox = expiryInbox(people, today, { [patient.id]: [request] }, () => true);
    expect(expiryCounts(inbox)).toEqual({ total: 1, today: 0, tomorrow: 1 });
    expect(inbox[0].messages[0]).toContain("明日で切れます（薬剤師 小林）");
    expect(expiryCounts(expiryInbox(people, today, { [patient.id]: [request, { ...request, id: `${request.id}:done` }] }, () => true)).total).toBe(0);
    expect(expiryInbox(people, today, {}, () => false)).toEqual([]);
  });
  it("Doも変更日数もExtendDraftへ入り、確定までは元処方を変えない", () => {
    const ctx: CheckContext = { activeOrders: [entry], labOrders: [], drafts: [], nowTime: "09:00", fmtDay: String, describe: () => "" };
    const draft = expiryExtension(entry, 4, "draft");
    expect(draft).toMatchObject({ kind: "extend", targetOrderId: entry.id, addDays: 4 });
    expect(toOrder(draft, ctx).extend).toEqual({ orderId: entry.id, days: 8 });
    expect(toOrder(expiryExtension(entry, 7, "changed"), ctx).extend?.days).toBe(11);
    expect(entry.order.type === "prescription" && entry.order.days).toBe(4);
  });
});
