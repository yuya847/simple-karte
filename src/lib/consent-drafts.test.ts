import { expect, it } from "vitest";
import { orderConsentDrafts, surgeryConsentDrafts } from "./consent-drafts";
import type { OrderEntry } from "./types";
it("オーダごとの下書きは正しい患者・オーダを参照し、明示指定との重複を作らない", () => {
  let sequence = 0;
  const orders = [
    { id: "upper", order: { type: "physio", test: "PHY-EGD" } },
    { id: "lower", order: { type: "physio", test: "PHY-CF" } },
  ] as Pick<OrderEntry, "id" | "order">[];
  const records = orderConsentDrafts(orders, "patient-a", "10:15", () => String(++sequence), ["CONSENT-EGD"]);
  expect(records.map(r => [r.patientId, r.orderId, r.code, r.status])).toEqual([
    ["patient-a", "upper", "CONSENT-EGD", "説明前"], ["patient-a", "lower", "CONSENT-COLONOSCOPY", "説明前"],
  ]);
  expect(new Set(records.map(r => r.id)).size).toBe(2);
  expect(records.every(r => r.createdAt.time === "10:15" && !r.explainedAt && !r.signatures)).toBe(true);
});
it("手術申込は申込番号と術式・部位・左右を引き継ぎ、同意済みにはしない", () => {
  const records = surgeryConsentDrafts({ id: "op-1", procedure: "人工骨頭置換術", site: "股関節", side: "左", laparoscopic: false }, "patient-b", "11:00", () => "new");
  expect(records.map(r => r.code)).toEqual(["CONSENT-SURGERY", "CONSENT-ANESTHESIA", "CONSENT-HEMIARTHROPLASTY"]);
  expect(records.every(r => r.patientId === "patient-b" && r.orderId === "op-1" && r.status === "説明前" && r.details?.["左右"] === "左")).toBe(true);
});
