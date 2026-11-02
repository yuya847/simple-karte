// The shape Claude must return. Claude only transcribes what the doctor said into these
// fields. Anything not said stays null: defaults, calculations and checks happen in code.

import { z } from "zod";

const Drug = z.object({
  code: z.string().nullable().describe("Master drug code, or null if the drug is not in the master"),
  said: z.string().describe("The drug as the doctor said it"),
  amount: z.number().nullable().describe("Amount as said, or null if not said"),
  unit: z.string().nullable().describe("Unit exactly as said (g, mg, mL, 本, V, A ...), or null"),
});

const Test = z.object({
  code: z.string().nullable().describe("Master lab code or set code, or null if not in the master"),
  said: z.string(),
});

export const AiOrder = z.object({
  kind: z.enum(["injection", "lab", "stop"]),
  source_text: z.string().describe("The exact part of the instruction this order came from"),

  // injection / stop
  drugs: z.array(Drug).describe("Main drug first, then diluent or mixed drugs. Empty for lab orders"),
  route: z.enum(["点滴静注", "静注", "皮下注", "筋注"]).nullable(),
  frequency: z.object({
    kind: z.enum(["per_day", "every_hours", "once", "unspecified"]),
    value: z.number().nullable().describe("per_day: times or bags per day; every_hours: interval in hours"),
  }),
  infusion: z.object({
    minutes: z.number().nullable().describe('Infusion time said, in minutes ("1時間で" = 60, "20時間で" = 1200)'),
    applies_to: z
      .enum(["per_dose", "whole_day", "unclear"])
      .nullable()
      .describe("Whether the infusion time is for one bag/dose or for the whole day's amount. unclear if the words allow both"),
    rate_ml_per_h: z.number().nullable().describe('Rate if said ("80でキープ" = 80)'),
  }),
  start: z.object({
    day: z.enum(["today", "tomorrow", "unspecified"]),
    time: z.string().nullable().describe('"HH:MM" if a clock time was said'),
  }),
  days: z.number().nullable().describe("Number of days if said"),

  // lab
  tests: z.array(Test).describe("Empty for injection and stop orders"),
  collect: z.object({
    day: z.enum(["today", "tomorrow", "day_after_tomorrow", "unspecified"]),
    when: z.enum(["morning_routine", "now", "specific_time", "before_dose", "unspecified"]),
    time: z.string().nullable().describe('"HH:MM" when when = specific_time'),
    before_dose_number: z.number().nullable().describe('For drug level draws: "3回目の前" = 3'),
    before_dose_drug_code: z.string().nullable().describe("Master drug code of the drug whose dose the draw is timed to"),
  }),
  priority: z.enum(["定時", "至急"]).nullable().describe("Only if the doctor said it"),
  culture_sets: z.number().nullable().describe("Number of culture sets if said"),

  comment: z.string().nullable().describe("Anything else the doctor said about this order"),
});

export const AiDraftResponse = z.object({
  orders: z.array(AiOrder),
  not_understood: z
    .array(z.object({ source_text: z.string(), reason: z.string() }))
    .describe("Parts of the instruction that could not be turned into an order"),
});

export type AiOrder = z.infer<typeof AiOrder>;
export type AiDraftResponse = z.infer<typeof AiDraftResponse>;

export const DraftRequest = z.object({
  text: z.string().trim().min(1).max(800),
});
