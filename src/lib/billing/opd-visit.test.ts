import { describe, expect, it } from "vitest";
import type { OrderEntry } from "../types";
import { buildOpdVisit, outsidePrescriptionLines, visitPrescriptions } from "./opd-visit";
import { calculateOpdClaim, OPD_CODES } from "./opd-claim";
import { POST } from "@/app/api/opd-claim/route";

const prescription = (patch: Partial<OrderEntry> = {}): OrderEntry => ({ kind: "order", id: "rx1", day: 0, time: "09:00", status: "有効", author: "医師", order: { type: "prescription", dispensing: "院外", category: "臨時", drugCode: "ORAL-FRS20", amount: 1, unit: "錠", timings: ["朝"], start: { day: 0 }, days: 7, rp: "rp1" }, ...patch });
const booking: OrderEntry = { kind: "order", id: "booking", day: 0, time: "09:15", status: "有効", author: "医師", order: { type: "procedure", code: "PROC-OPD", start: { day: 14 }, schedule: { kind: "once" }, opd: { dept: "循環器内科", day: 14, slot: "午前", purpose: "再診" } } };
const input = { today: "2026-11-05", nowTime: "10:30", visit: { id: "ishida", name: "石田 正男", age: 78, kind: "再診" as const, department: "循環器内科" }, entries: [prescription(), booking], rx: [] };
const codes = (r: ReturnType<typeof calculateOpdClaim>) => r.acts.flatMap((a) => a.parts.flatMap((p) => p.lines.map((l) => l.code)));

describe("受診の確定処方を組み立てる純粋関数", () => {
  it("基本診療料は予約の有無によらず受診区分で決まり、外来管理加算は選択と併算定条件による", () => {
    const plan = { kind: "再診" as const, entries: [booking], managementExcluded: false };
    expect(buildOpdVisit(plan).basicCodes).toEqual([OPD_CODES.再診料]);
    expect(buildOpdVisit({ ...plan, outpatientManagement: true }).basicCodes).toEqual([OPD_CODES.再診料, OPD_CODES.外来管理加算]);
    expect(buildOpdVisit({ ...plan, outpatientManagement: true, managementExcluded: true }).basicCodes).toEqual([OPD_CODES.再診料]);
    expect(buildOpdVisit({ ...plan, kind: "初診" }).basicCodes).toEqual([OPD_CODES.初診料]);
  });
  it("確定オーダから院外処方を取り出し、未来の予約や中止・前日の処方を混ぜない", () => {
    const entries = [prescription(), prescription({ id: "stop", status: "中止" }), prescription({ id: "old", day: -1 }), booking];
    const before = JSON.stringify(entries);
    expect(visitPrescriptions(entries)).toHaveLength(1);
    expect(outsidePrescriptionLines(entries)[0]).toMatchObject({ drug: "ORAL-FRS20", days: 7 });
    expect(JSON.stringify(entries)).toBe(before);
  });
  it("旧画面の確定処方も保持し、院内処方は電子処方箋へ混ぜない", () => {
    const p = prescription();
    if (p.order.type !== "prescription") throw new Error();
    p.order.dispensing = "院内";
    const legacy = [{ items: outsidePrescriptionLines([prescription()]) }];
    expect(visitPrescriptions([p], legacy).map((r) => r.dispensing)).toEqual(["院内", "院外"]);
    expect(outsidePrescriptionLines([p], legacy)).toHaveLength(1);
  });
});
describe("再診→7日分の処方→再診予約→外来会計", () => {
  it("再診料と処方箋料を計上、未来の予約は算定せず、管理加算は人が選ぶ", () => {
    const r = calculateOpdClaim(input);
    expect(codes(r)).toEqual([OPD_CODES.再診料, OPD_CODES.処方箋料その他]);
    expect(r.totalPoints).toBe(136);
    expect(r.issues.some((i) => i.text.includes("まだ行っていない時刻"))).toBe(true);
    expect(codes(calculateOpdClaim({ ...input, outpatientManagement: true }))).toContain(OPD_CODES.外来管理加算);
    expect(codes(calculateOpdClaim({ ...input, specificDisease: true }))).not.toContain(OPD_CODES.特定疾患院外);
  });
  it("28日以上でも特定疾患処方管理加算は選択するまで付けない", () => {
    const p = prescription();
    if (p.order.type !== "prescription") throw new Error();
    p.order.days = 28;
    expect(codes(calculateOpdClaim({ ...input, entries: [p] }))).not.toContain(OPD_CODES.特定疾患院外);
    expect(codes(calculateOpdClaim({ ...input, entries: [p], specificDisease: true }))).toContain(OPD_CODES.特定疾患院外);
  });
  it("API 経由でも確定オーダが処方箋料になる", async () => {
    const response = await POST(new Request("http://localhost/api/opd-claim", { method: "POST", body: JSON.stringify(input) }));
    expect(response.status).toBe(200);
    expect((await response.json()).totalPoints).toBe(136);
  });
  it("院内なら処方箋料を計上せず、調剤料と薬剤料を計上", () => {
    const p = prescription();
    if (p.order.type !== "prescription") throw new Error();
    p.order.dispensing = "院内";
    const r = calculateOpdClaim({ ...input, entries: [p] });
    expect(r.acts.find((a) => a.shikibetsu === "21")?.count).toBe(7);
    expect(r.acts.find((a) => a.shikibetsu === "21")?.parts[0].points).toBeGreaterThan(0);
    expect(codes(r)).toContain(OPD_CODES.調剤料外来);
    expect(codes(r)).toContain(OPD_CODES.処方料その他);
    expect(codes(r)).not.toContain(OPD_CODES.処方箋料その他);
  });
});
