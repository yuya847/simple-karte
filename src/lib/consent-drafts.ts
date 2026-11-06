import type { ConsentCode, ConsentRecord } from "./consent";
import { orderConsentCodes, surgeryConsentCodes } from "./document-catalog";
import type { OrderEntry } from "./types";
import type { Surgery } from "./surgery";

/** One draft per form and order, including explicit choices from the existing order checker. */
export function orderConsentDrafts(orders: Pick<OrderEntry, "id" | "order">[], patientId: string, time: string, newId: () => string, planned: ConsentCode[] = []): ConsentRecord[] {
  return orders.flatMap((entry, index) => [...new Set([...orderConsentCodes(entry.order), ...(index === 0 ? planned : [])])].map(code => ({
    id: newId(), patientId, code, status: "説明前" as const, orderId: entry.id, createdAt: { day: 0, time }, answers: {},
  })));
}
export function surgeryConsentDrafts(surgery: Pick<Surgery, "id" | "procedure" | "site" | "side" | "laparoscopic">, patientId: string, time: string, newId: () => string): ConsentRecord[] {
  return surgeryConsentCodes(surgery).map(code => ({
    id: newId(), patientId, code, status: "説明前", orderId: surgery.id, createdAt: { day: 0, time }, answers: {},
    details: { "術式・手技": surgery.procedure, "部位": surgery.site, "左右": surgery.side ?? "" },
  }));
}
