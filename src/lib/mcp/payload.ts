import { z } from "zod";
import { AiOrder, AiWireOrder, fromWire } from "../ai-schema";

export const proposal = z.object({
  patient: z.string().regex(/^P-[A-F0-9]{12}$/),
  orders: z.array(z.union([AiOrder, AiWireOrder])).min(1).max(30),
});
export function parseProposal(value: unknown) {
  const p = proposal.parse(value);
  return { patient: p.patient, orders: p.orders.map(o => {
    const app = AiOrder.safeParse(o);
    return app.success ? app.data : fromWire({ orders: [AiWireOrder.parse(o)], not_understood: [] }).orders[0];
  }) };
}
export function encodePayload(value: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  return btoa(Array.from(bytes, b => String.fromCharCode(b)).join("")).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}
export function decodePayload(value: string) {
  if (value.length > 60000 || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("下書きの形式が不正です");
  return parseProposal(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(atob(value.replaceAll("-", "+").replaceAll("_", "/")), c => c.charCodeAt(0)))));
}
