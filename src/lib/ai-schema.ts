// What Claude returns. Claude only transcribes what the doctor said into these fields.
// Defaults, calculations and checks happen in code.
//
// Two shapes:
// - AiWire*: the structured-output schema sent to the API. It has no nullable (union) fields,
//   because the API limits them and the size of the compiled grammar. "Not said" is written
//   as "" for text, 0 for numbers and "unspecified" for choices.
// - AiOrder / AiDraftResponse: the same content in the app's shape, with null for "not said".
//   The server converts with fromWire() right after parsing.

import { z } from "zod";

// ---------------------------------------------------------------------------
// The app's shape
// ---------------------------------------------------------------------------

const Drug = z.object({
  code: z.string().nullable(),
  said: z.string(),
  amount: z.number().nullable(),
  unit: z.string().nullable(),
});

const Test = z.object({ code: z.string().nullable(), said: z.string() });

const FREQUENCY = ["per_day", "every_hours", "every_days", "prn", "continuous", "once", "unspecified"] as const;

const RX_TIMING = z.enum(["朝", "昼", "夕", "眠前"]);

export const AiOrder = z.object({
  kind: z.enum(["injection", "lab", "procedure", "prescription", "stop"]),
  source_text: z.string(),
  // prescription
  rx_category: z.enum(["定期", "臨時", "頓用", ""]),
  rx_amount_is: z.enum(["1日量", "1回量", ""]),
  rx_timings: z.array(RX_TIMING),
  rx_max_per_day: z.number(),
  // procedure ("" / 0 = not said; read in drafts.ts)
  procedure_code: z.string(),
  site: z.string(),
  size_said: z.string(),
  depth: z.string(),
  o2_device: z.string(),
  o2_lpm: z.number(),
  // injection / stop / procedure drugs
  drugs: z.array(Drug),
  route: z.enum(["点滴静注", "静注", "皮下注", "筋注"]).nullable(),
  frequency: z.object({ kind: z.enum(FREQUENCY), value: z.number().nullable() }),
  infusion: z.object({
    minutes: z.number().nullable(),
    applies_to: z.enum(["per_dose", "whole_day", "unclear"]).nullable(),
    rate_ml_per_h: z.number().nullable(),
  }),
  start: z.object({ day: z.enum(["today", "tomorrow", "unspecified"]), time: z.string().nullable() }),
  days: z.number().nullable(),
  // lab
  tests: z.array(Test),
  collect: z.object({
    day: z.enum(["today", "tomorrow", "day_after_tomorrow", "unspecified"]),
    when: z.enum(["morning_routine", "now", "specific_time", "before_dose", "unspecified"]),
    time: z.string().nullable(),
    before_dose_number: z.number().nullable(),
    before_dose_drug_code: z.string().nullable(),
  }),
  priority: z.enum(["定時", "至急"]).nullable(),
  culture_sets: z.number().nullable(),
  comment: z.string().nullable(),
});

export const AiDraftResponse = z.object({
  orders: z.array(AiOrder),
  not_understood: z.array(z.object({ source_text: z.string(), reason: z.string() })),
});

export type AiOrder = z.infer<typeof AiOrder>;
export type AiDraftResponse = z.infer<typeof AiDraftResponse>;

// ---------------------------------------------------------------------------
// The wire shape (structured output)
// ---------------------------------------------------------------------------

const WireDrug = z.object({
  code: z.string().describe('Master drug code; "" if the drug is not in the master'),
  said: z.string().describe("The drug as the doctor said it"),
  amount: z.number().describe("Amount as said; 0 if not said"),
  unit: z.string().describe('Unit exactly as said (g, mg, mL, 本, V, A ...); "" if not said'),
});

const WireTest = z.object({
  code: z.string().describe('Master lab code or set code; "" if not in the master'),
  said: z.string(),
});

export const AiWireOrder = z.object({
  kind: z.enum(["injection", "lab", "procedure", "prescription", "stop"]),
  source_text: z.string().describe("The exact part of the instruction this order came from"),

  rx_category: z.enum(["定期", "臨時", "頓用", ""]).describe('Oral prescription: "定期" / "臨時" if said, "頓用" for as-needed; "" otherwise'),
  rx_amount_is: z.enum(["1日量", "1回量", ""]).describe('Whether the amount said is per day ("1日3錠") or per dose ("1回1錠"); "" if not said or not a prescription'),
  rx_timings: z.array(RX_TIMING).describe("When an oral drug is taken, as said (朝食後 → 朝, 毎食後 → 朝 昼 夕, 寝る前 → 眠前). Empty if not said"),
  rx_max_per_day: z.number().describe('As-needed: "1日3回まで" → 3; 0 otherwise'),

  procedure_code: z.string().describe('Master procedure code, for procedure orders and for stopping a procedure; "" otherwise or if not in the master'),
  site: z.string().describe('Body site as said ("仙骨部", "右踵"); "" if not said'),
  size_said: z.string().describe('The size exactly as said ("12×10センチ", "150平方センチ"); "" if not said'),
  depth: z.string().describe('DESIGN-R depth if said: one of d0 d1 d2 D3 D4 D5 DDTI DU; "" if not said'),
  o2_device: z.string().describe('Oxygen device if said: 鼻カニュラ, 簡易酸素マスク or リザーバー付きマスク; "" if not said'),
  o2_lpm: z.number().describe('Oxygen flow in L/min if said ("2L" → 2); 0 if not said'),

  drugs: z.array(WireDrug).describe("Injection: main drug first, then diluent or mixed drugs. Procedure: the drug used with it (ointment, enema), if said. Empty for lab orders"),
  route: z.enum(["点滴静注", "静注", "皮下注", "筋注", "unspecified"]),
  frequency: z.object({
    kind: z.enum(FREQUENCY),
    value: z.number().describe("per_day: times or bags per day; every_hours: interval in hours; every_days: interval in days (隔日 = 2); 0 if not said"),
  }),
  infusion: z.object({
    minutes: z.number().describe('Infusion time said, in minutes ("1時間で" = 60, "20時間で" = 1200); 0 if not said'),
    applies_to: z
      .enum(["per_dose", "whole_day", "unclear", "unspecified"])
      .describe("Whether the infusion time is for one bag/dose or for the whole day's amount. unclear if the words allow both; unspecified if no time was said"),
    rate_ml_per_h: z.number().describe('Rate if said ("80でキープ" = 80); 0 if not said'),
  }),
  start: z.object({
    day: z.enum(["today", "tomorrow", "unspecified"]),
    time: z.string().describe('"HH:MM" if a clock time was said; "" otherwise'),
  }),
  days: z.number().describe("Number of days if said; 0 if not said"),

  tests: z.array(WireTest).describe("Empty for injection, procedure and stop orders"),
  collect: z.object({
    day: z.enum(["today", "tomorrow", "day_after_tomorrow", "unspecified"]),
    when: z.enum(["morning_routine", "now", "specific_time", "before_dose", "unspecified"]),
    time: z.string().describe('"HH:MM" when when = specific_time; "" otherwise'),
    before_dose_number: z.number().describe('For drug level draws: "3回目の前" = 3; 0 otherwise'),
    before_dose_drug_code: z.string().describe('Master drug code of the drug whose dose the draw is timed to; "" otherwise'),
  }),
  priority: z.enum(["定時", "至急", "unspecified"]).describe("Only if the doctor said it"),
  culture_sets: z.number().describe("Number of culture sets if said; 0 if not said"),

  comment: z.string().describe('Anything else the doctor said about this order; "" if nothing'),
});

export const AiWireResponse = z.object({
  orders: z.array(AiWireOrder),
  not_understood: z
    .array(z.object({ source_text: z.string(), reason: z.string() }))
    .describe("Parts of the instruction that could not be turned into an order"),
});

export type AiWireResponse = z.infer<typeof AiWireResponse>;

const str = (s: string) => (s.trim() === "" ? null : s);
const pos = (n: number) => (n > 0 ? n : null);

/** Wire → the app's shape: "" / 0 / "unspecified" become null. */
export function fromWire(w: AiWireResponse): AiDraftResponse {
  return {
    orders: w.orders.map((o) => ({
      kind: o.kind,
      source_text: o.source_text,
      rx_category: o.rx_category,
      rx_amount_is: o.rx_amount_is,
      rx_timings: o.rx_timings,
      rx_max_per_day: o.rx_max_per_day,
      procedure_code: o.procedure_code,
      site: o.site,
      size_said: o.size_said,
      depth: o.depth,
      o2_device: o.o2_device,
      o2_lpm: o.o2_lpm,
      drugs: o.drugs.map((d) => ({ code: str(d.code), said: d.said, amount: pos(d.amount), unit: str(d.unit) })),
      route: o.route === "unspecified" ? null : o.route,
      frequency: { kind: o.frequency.kind, value: pos(o.frequency.value) },
      infusion: {
        minutes: pos(o.infusion.minutes),
        applies_to: o.infusion.applies_to === "unspecified" ? null : o.infusion.applies_to,
        rate_ml_per_h: pos(o.infusion.rate_ml_per_h),
      },
      start: { day: o.start.day, time: str(o.start.time) },
      days: pos(o.days),
      tests: o.tests.map((t) => ({ code: str(t.code), said: t.said })),
      collect: {
        day: o.collect.day,
        when: o.collect.when,
        time: str(o.collect.time),
        before_dose_number: pos(o.collect.before_dose_number),
        before_dose_drug_code: str(o.collect.before_dose_drug_code),
      },
      priority: o.priority === "unspecified" ? null : o.priority,
      culture_sets: pos(o.culture_sets),
      comment: str(o.comment),
    })),
    not_understood: w.not_understood,
  };
}

export const DraftRequest = z.object({
  text: z.string().trim().min(1).max(800),
});
