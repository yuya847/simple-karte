// POST /api/dpc — one (fictional) patient's month as DPC（診断群分類別包括評価）would bill it, next to the
// 出来高 claim: the proposed DPC code with the reason for each digit, the 入院期間, the 包括 points and what
// stays 出来高. Server side because the 区分 of each claimed line comes from the official master.
// Nothing is sent to Claude: everything is computed by code. The doctor decides the code.

import { z } from "zod";
import { dpcMonth } from "@/lib/billing/dpc-claim";
import { ClaimRequest } from "@/lib/billing/request";
import type { ClaimInput } from "@/lib/billing/model";

const DpcRequest = ClaimRequest.extend({
  dpc: z.object({
    mainDiagnosisId: z.string().max(80).optional(),
    coefficient: z.number().min(0.5).max(3),
    transfer: z.boolean().nullable(),
  }),
});

export async function POST(request: Request) {
  const body = DpcRequest.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "DPC の計算に必要な情報が足りません。" }, { status: 400 });
  const { month, dpc, ...rest } = body.data;
  try {
    const r = dpcMonth(rest as unknown as Omit<ClaimInput, "month">, month, dpc);
    // The class's lookup tables stay on the server; the screen needs its name and the chosen row.
    const outcome = r.outcome?.ok ? { ...r.outcome, d: { ...r.outcome.d, cls: { code: r.outcome.d.cls.code, name: r.outcome.d.cls.name, mdcName: r.outcome.d.cls.mdcName } } } : r.outcome;
    return Response.json({ ...r, outcome });
  } catch (e) {
    console.error("dpc failed", e);
    return Response.json({ error: "DPC を計算できませんでした。" }, { status: 500 });
  }
}
