import { z } from "zod";
import { AiOrder, AiWireOrder, fromWire } from "../ai-schema";

// A model filling the tool's JSON Schema may leave out fields that were not said, or mix the app's shape
// (null = not said) with the wire shape ("" / 0 / "unspecified"). Every order is brought to one full AiOrder,
// so what is encoded in the link always decodes again.
const APP_BLANK = {
  source_text: "", exam: "", exam_region: "", exam_contrast: "", exam_purpose: "",
  rx_category: "", rx_amount_is: "", rx_timings: [], rx_max_per_day: 0,
  procedure_code: "", site: "", size_said: "", depth: "", o2_device: "", o2_lpm: 0,
  drugs: [], route: null, frequency: { kind: "unspecified", value: null },
  infusion: { minutes: null, applies_to: null, rate_ml_per_h: null },
  start: { day: "unspecified", time: null }, days: null, tests: [],
  collect: { day: "unspecified", when: "unspecified", time: null, before_dose_number: null, before_dose_drug_code: null },
  priority: null, culture_sets: null, comment: null,
};
const WIRE_BLANK = {
  ...APP_BLANK, route: "unspecified", frequency: { kind: "unspecified", value: 0 },
  infusion: { minutes: 0, applies_to: "unspecified", rate_ml_per_h: 0 },
  start: { day: "unspecified", time: "" }, days: 0,
  collect: { day: "unspecified", when: "unspecified", time: "", before_dose_number: 0, before_dose_drug_code: "" },
  priority: "unspecified", culture_sets: 0, comment: "",
};
type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
/** Fill what is missing (or null, for the wire shape) from the blank, one level into the nested objects. */
function fill(blank: Obj, raw: Obj, nullIsMissing: boolean): Obj {
  const out: Obj = { ...blank };
  for (const [k, v] of Object.entries(raw)) {
    if (v === undefined || (nullIsMissing && v === null)) continue;
    out[k] = isObj(v) && isObj(blank[k]) ? fill(blank[k] as Obj, v, nullIsMissing) : v;
  }
  return out;
}

/** One proposed order in either shape (complete or not) → the app's full AiOrder. Throws when it is neither. */
export function toAiOrder(raw: unknown): AiOrder {
  const app = AiOrder.safeParse(raw);
  if (app.success) return app.data;
  const wire = AiWireOrder.safeParse(raw);
  if (wire.success) return fromWire({ orders: [wire.data], not_understood: [] }).orders[0];
  if (!isObj(raw)) throw new Error("オーダの形が正しくありません");
  const filledApp = AiOrder.safeParse(fill(APP_BLANK, raw, false));
  if (filledApp.success) return filledApp.data;
  const filledWire = AiWireOrder.parse(fill(WIRE_BLANK, raw, true));
  return AiOrder.parse(fill(APP_BLANK, fromWire({ orders: [filledWire], not_understood: [] }).orders[0] as unknown as Obj, false));
}

export const proposal = z.object({
  patient: z.string().regex(/^P-[A-F0-9]{12}$/),
  orders: z.array(z.record(z.string(), z.unknown())).min(1).max(30),
});
export function parseProposal(value: unknown) {
  const p = proposal.parse(value);
  return { patient: p.patient, orders: p.orders.map(toAiOrder) };
}
export function encodePayload(value: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  return btoa(Array.from(bytes, b => String.fromCharCode(b)).join("")).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}
export function decodePayload(value: string) {
  if (value.length > 60000 || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("下書きの形式が不正です");
  return parseProposal(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(atob(value.replaceAll("-", "+").replaceAll("_", "/")), c => c.charCodeAt(0)))));
}
