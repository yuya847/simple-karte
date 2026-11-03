// POST /api/dpc — one (fictional) patient's month as DPC（診断群分類別包括評価）would bill it, next to the
// 出来高 claim: the proposed DPC code with the reason for each digit, the 入院期間, the 包括 points and what
// stays 出来高. Server side because the 区分 of each claimed line comes from the official master.
// Nothing is sent to Claude: everything is computed by code. The doctor decides the code.

import { dpcMonth, DpcRequest, dpcView } from "@/lib/billing/dpc-claim";
import type { ClaimInput } from "@/lib/billing/model";

export async function POST(request: Request) {
  const body = DpcRequest.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "DPC の計算に必要な情報が足りません。" }, { status: 400 });
  const { month, dpc, ...rest } = body.data;
  try {
    // The class's lookup tables stay on the server; the screen gets its name and the chosen row.
    return Response.json(dpcView(dpcMonth(rest as unknown as Omit<ClaimInput, "month">, month, dpc)));
  } catch (e) {
    console.error("dpc failed", e);
    return Response.json({ error: "DPC を計算できませんでした。" }, { status: 500 });
  }
}
