// POST /api/dpc/batch — the DPC 入院期間 of many (fictional) patients in one request, for the patient list:
// the same calculation as /api/dpc for each, returning only the short brief (class, code, 入院期間).
// Server side because the 区分 of each claimed line comes from the official master. Nothing is sent to
// Claude: everything is computed by code. The doctor decides the code.

import { DpcBatchRequest, dpcBriefs } from "@/lib/billing/dpc-batch";

export async function POST(request: Request) {
  const body = DpcBatchRequest.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "DPC の計算に必要な情報が足りません。" }, { status: 400 });
  return Response.json({ briefs: dpcBriefs(body.data) });
}
