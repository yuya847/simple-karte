// Request shapes of the billing APIs. The chart's own records pass through; the engine reads only what it needs.

import { z } from "zod";
import { validInsurerNumber } from "./insurance";

const Day = z.number().int().min(-400).max(400);
const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const Month = z.string().regex(/^\d{4}-\d{2}$/);

const Modifier = z.object({ code: z.string().regex(/^\d{4}$/), name: z.string().max(40) });

/** The insurance 医事課 registered (保険の登録). The 保険者番号 must pass its 検証番号 here too. */
const KohiSchema = z.object({
  lawNo: z.string().regex(/^\d{2}$/),
  name: z.string().max(60),
  payerNumber: z.string().regex(/^\d{8}$/),
  recipientNumber: z.string().regex(/^\d{7}$/),
  rate: z.number().int().min(0).max(100),
  capYen: z.number().int().min(0).max(10_000_000).nullable(),
});

export const InsuranceSchema = z
  .object({
    kind: z.enum(["協会けんぽ", "組合健保", "共済", "国保", "後期高齢者"]),
    insurerNumber: z.string().max(8),
    symbol: z.string().min(1).max(19).optional(),
    number: z.string().max(19),
    branch: z.string().regex(/^\d{2}$/).optional(),
    relation: z.enum(["本人", "家族"]),
    birthDate: IsoDate,
    rate: z.number().int().min(0).max(100),
    incomeClass: z.enum(["ア", "イ", "ウ", "エ", "オ", "現役並みⅢ", "現役並みⅡ", "現役並みⅠ", "一般", "一般Ⅱ", "一般Ⅰ", "低所得Ⅱ", "低所得Ⅰ", "該当なし"]),
    limitKnown: z.boolean(),
    mealClass: z.enum(["一般", "低所得Ⅱ（90日以下）", "低所得Ⅱ（90日超）", "低所得Ⅰ", "指定難病等"]),
    daysLast12Months: z.number().int().min(0).max(366).optional(),
    coverage: z.enum(["医保", "生活保護", "自費", "労災", "公費のみ"]).optional(),
    kohi: z.array(KohiSchema).max(4).optional(),
    validUntil: IsoDate.optional(),
    verify: z.object({ method: z.enum(["オンライン資格確認（模擬）", "保険証", "資格確認書"]), on: z.string().max(10) }).optional(),
  })
  // 医保 needs a well-formed 保険者番号・番号 and a 10〜30% rate; the cases without 医保 carry none.
  .refine((i) => (i.coverage && i.coverage !== "医保") || (validInsurerNumber(i.insurerNumber) && i.number.length > 0 && [10, 20, 30].includes(i.rate)), { message: "保険の内容が読めません。" });

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
  notGiven: z.array(z.string().max(80)).max(3000).optional(),
  daily: z.array(z.looseObject({ day: Day })).max(800),
  cultures: z.array(z.looseObject({ collectedOn: Day })).max(200),
  diets: z.array(z.looseObject({ patientId: z.string().max(40) })).max(300).optional(),
  letters: z.array(z.object({ day: Day, to: z.string().max(80), dischargeDay: Day.optional(), attach: z.boolean().optional() })).max(20).optional(),
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
        outcome: z.enum(["継続", "治癒", "死亡", "中止", "移行"]),
        outcomeDay: Day.optional(),
        notClaimable: z.boolean().optional(),
        auto: z.object({ from: z.enum(["記事", "入院申込"]), noteId: z.string().optional(), at: z.string() }).optional(),
        effectiveFrom: Month.optional(),
        effectiveTo: Month.optional(),
        comment: z.string().max(1000).optional(),
        hideCommentOnClaim: z.boolean().optional(),
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
    yakuzaiShido: z.array(z.object({ day: Day, kind: z.enum(["1", "2"]), mayaku: z.boolean().optional() })).max(10),
    eiyoShido: z.array(z.object({ day: Day })).max(10).optional(),
  }),
  insurance: InsuranceSchema.optional(),
});

export const ClaimRequest = PatientMonthSchema.extend({ today: IsoDate, nowTime: z.string().regex(/^\d{2}:\d{2}$/), month: Month });

export const ReceiptRequest = z.object({
  today: IsoDate,
  nowTime: z.string().regex(/^\d{2}:\d{2}$/),
  month: Month,
  // The evaluation ward has 100 patients; retain a bounded request size.
  patients: z.array(PatientMonthSchema).min(1).max(100),
});
