// POST /api/claim — the inpatient 出来高 claim of one (fictional) patient for one month.
// Runs on the server because the official masters and the 電子点数表 are read there.
// Nothing is sent to Claude: every point is computed by code.

import { z } from "zod";
import { calculateClaim } from "@/lib/billing/engine";
import type { ClaimInput } from "@/lib/billing/model";

const Day = z.number().int().min(-400).max(400);

const Request = z.object({
  today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  nowTime: z.string().regex(/^\d{2}:\d{2}$/),
  month: z.string().regex(/^\d{4}-\d{2}$/),
  patient: z.object({
    id: z.string().max(40),
    name: z.string().max(60),
    sex: z.enum(["男", "女"]),
    age: z.number().int().min(0).max(130),
    admittedOn: Day,
    dischargedOn: Day.optional(),
  }),
  // The chart's own shapes; the engine reads only the fields it needs.
  entries: z.array(z.looseObject({ kind: z.enum(["note", "order"]) })).max(2000),
  daily: z.array(z.looseObject({ day: Day })).max(800),
  cultures: z.array(z.looseObject({ collectedOn: Day })).max(200),
  diagnoses: z.array(z.looseObject({ code: z.string() })).max(200),
  options: z.object({
    kyukyu: z.enum(["", "1", "2"]),
    ninchisho: z.boolean(),
    senmou: z.boolean(),
    nyutaiin: z.boolean(),
    kyoryoku: z.enum(["", "1", "2"]),
    specialDiet: z.boolean(),
    yakuzaiShido: z.array(z.object({ day: Day, kind: z.enum(["1", "2"]) })).max(10),
  }),
  mealClass: z.enum(["一般", "低所得Ⅱ（90日以下）", "低所得Ⅱ（90日超）", "低所得Ⅰ", "指定難病等"]).optional(),
});

export async function POST(request: Request) {
  const body = Request.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "算定に必要な情報が足りません。" }, { status: 400 });
  try {
    return Response.json({
      result: calculateClaim(body.data as unknown as ClaimInput),
    });
  } catch (e) {
    console.error("claim failed", e);
    return Response.json({ error: "算定できませんでした。" }, { status: 500 });
  }
}
