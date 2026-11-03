// POST /api/claim-check — for 医事課の仕事: each (fictional) patient's month through the same claim as
// /api/claim, returning only the issues a person must look at (確かめる・人が選ぶ). Computed by code on
// the server (the masters are read there). Nothing is sent to Claude.

import { claimChecks, type PatientMonthInput } from "@/lib/billing/month";
import { ReceiptRequest } from "@/lib/billing/request";

export async function POST(request: Request) {
  const body = ReceiptRequest.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "算定に必要な情報が足りません。" }, { status: 400 });
  const { today, nowTime, month, patients } = body.data;
  try {
    return Response.json({ month, patients: claimChecks(patients as unknown as PatientMonthInput[], today, nowTime, month) });
  } catch (e) {
    console.error("claim-check failed", e);
    return Response.json({ error: "算定の確かめができませんでした。" }, { status: 500 });
  }
}
