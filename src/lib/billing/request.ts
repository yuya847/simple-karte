// Request shapes of the billing APIs. The chart's own records pass through; the engine reads only what it needs.

import { z } from "zod";

const Day = z.number().int().min(-400).max(400);
const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const Month = z.string().regex(/^\d{4}-\d{2}$/);

const Modifier = z.object({ code: z.string().regex(/^\d{4}$/), name: z.string().max(40) });

export const PatientMonthSchema = z.object({
  patient: z.object({
    id: z.string().max(40),
    name: z.string().max(60),
    kana: z.string().max(80),
    sex: z.enum(["男", "女"]),
    age: z.number().int().min(0).max(130),
    admittedOn: Day,
    dischargedOn: Day.optional(),
  }),
  entries: z.array(z.looseObject({ kind: z.enum(["note", "order"]) })).max(2000),
  daily: z.array(z.looseObject({ day: Day })).max(800),
  cultures: z.array(z.looseObject({ collectedOn: Day })).max(200),
  diagnoses: z
    .array(
      z.object({
        id: z.string().max(80),
        code: z.string().regex(/^\d{7}$/),
        name: z.string().max(80),
        icd10: z.string().max(10).optional(),
        prefixes: z.array(Modifier).max(10),
        suffixes: z.array(Modifier).max(10),
        main: z.boolean(),
        start: Day,
        outcome: z.enum(["継続", "治癒", "死亡", "中止"]),
        outcomeDay: Day.optional(),
      }),
    )
    .max(100),
  options: z.object({
    kyukyu: z.enum(["", "1", "2"]),
    ninchisho: z.boolean(),
    senmou: z.boolean(),
    nyutaiin: z.boolean(),
    kyoryoku: z.enum(["", "1", "2"]),
    specialDiet: z.boolean(),
    yakuzaiShido: z.array(z.object({ day: Day, kind: z.enum(["1", "2"]) })).max(10),
  }),
});

export const ClaimRequest = PatientMonthSchema.extend({ today: IsoDate, nowTime: z.string().regex(/^\d{2}:\d{2}$/), month: Month });

export const ReceiptRequest = z.object({
  today: IsoDate,
  nowTime: z.string().regex(/^\d{2}:\d{2}$/),
  month: Month,
  patients: z.array(PatientMonthSchema).min(1).max(60),
});
