// POST /api/claim — one (fictional) patient's month: the inpatient 出来高 claim, the bill at the
// window, and the receipt records. Runs on the server because the official masters and the
// 電子点数表 are read there. Nothing is sent to Claude: every point is computed by code. The 摘要 comments
// (公開コメントマスター) and the confirmed 症状詳記 go into the claim and the receipt records here too.

import { patientMonth, type PatientMonthInput } from "@/lib/billing/month";
import { ClaimRequest } from "@/lib/billing/request";
import { receiptSheet } from "@/lib/billing/receipt-sheet";
import { checkUke, receiptRecords } from "@/lib/billing/uke";

export async function POST(request: Request) {
  const body = ClaimRequest.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "算定に必要な情報が足りません。" }, { status: 400 });
  const { today, nowTime, month, ...rest } = body.data;
  try {
    const pm = patientMonth(rest as unknown as PatientMonthInput, today, nowTime, month);
    const lines = receiptRecords(pm.receipt, 1, month);
    return Response.json({
      result: pm.claim,
      bill: pm.bill,
      insurance: pm.insurance,
      receipt: { lines, sheet: receiptSheet(pm.receipt, lines, checkUke(lines, [pm.receipt])), diagnoses: pm.receipt.diagnoses.length },
      documentation: pm.documentation,
    });
  } catch (e) {
    console.error("claim failed", e);
    return Response.json({ error: "算定できませんでした。" }, { status: 500 });
  }
}
