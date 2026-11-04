// POST /api/opd-claim — one (fictional) outpatient visit's points for the window (会計). Runs on the server
// because the official masters are read there. Nothing is sent to Claude: every point is computed by code.
// The patient's share (負担割合・公費・限度額) is worked out on the screen from these points (billing/futan.ts).

import { z } from "zod";
import { calculateOpdClaim } from "@/lib/billing/opd-claim";
import type { HistoryEntry } from "@/lib/types";
import type { RxLine } from "@/lib/national/rx-lines";

const Day = z.number().int().min(-400).max(400);

const Body = z.object({
  today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  nowTime: z.string().regex(/^\d{2}:\d{2}$/),
  visit: z.object({ id: z.string().max(40), name: z.string().max(60), age: z.number().int().min(0).max(130), kind: z.enum(["初診", "再診"]), department: z.string().max(40) }),
  entries: z.array(z.looseObject({ kind: z.enum(["note", "order"]), day: Day.optional() })).max(500),
  rx: z
    .array(
      z.object({
        items: z.array(z.object({ rp: z.number().int(), drug: z.string().max(40), perDose: z.number().nullable(), unit: z.string().max(10), timings: z.array(z.enum(["朝", "昼", "夕", "眠前"])), prn: z.string().max(80).nullable(), maxPerDay: z.number().nullable(), days: z.number().nullable() })).max(60),
      }),
    )
    .max(20),
});

export async function POST(request: Request) {
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "会計に必要な情報が足りません。" }, { status: 400 });
  try {
    const { today, nowTime, visit, entries, rx } = body.data;
    return Response.json(calculateOpdClaim({ today, nowTime, visit, entries: entries as unknown as HistoryEntry[], rx: rx as { items: RxLine[] }[] }));
  } catch (e) {
    console.error("opd-claim failed", e);
    return Response.json({ error: "算定できませんでした。" }, { status: 500 });
  }
}
