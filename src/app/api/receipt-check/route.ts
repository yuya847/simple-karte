// POST /api/receipt-check — for レセプトの点検: each (fictional) patient's month through the same claim as
// /api/claim and the same receipt checks as /api/receipt, with every check kept. Computed by code on the
// server (the masters are read there). Nothing is sent to Claude.

import { receiptInspection } from "@/lib/billing/inspect-run";
import type { PatientMonthInput } from "@/lib/billing/month";
import { ReceiptRequest } from "@/lib/billing/request";

export async function POST(request: Request) {
  const body = ReceiptRequest.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "点検に必要な情報が足りません。" }, { status: 400 });
  const { today, nowTime, month, patients } = body.data;
  try {
    return Response.json({ month, patients: receiptInspection(patients as unknown as PatientMonthInput[], today, nowTime, month) });
  } catch (e) {
    console.error("receipt-check failed", e);
    return Response.json({ error: "レセプトの点検ができませんでした。" }, { status: 500 });
  }
}
