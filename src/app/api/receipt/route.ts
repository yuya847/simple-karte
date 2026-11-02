// POST /api/receipt — the month's receipt files (RECEIPTC.UKE) for the ward's (fictional) patients:
// one file for 社会保険 and one for 国民健康保険・後期高齢者医療. Computed by code on the server.

import { patientMonth, type PatientMonthInput } from "@/lib/billing/month";
import { ReceiptRequest } from "@/lib/billing/request";
import { buildUke, type Payer } from "@/lib/billing/uke";

const PAYER_NAME: Record<Payer, string> = { "1": "社会保険（審査支払機構）", "2": "国民健康保険・後期高齢者医療（国保連合会）" };

function nextMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}

export async function POST(request: Request) {
  const body = ReceiptRequest.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "レセプトに必要な情報が足りません。" }, { status: 400 });
  const { today, nowTime, month, patients } = body.data;
  try {
    const months = patients.map((p) => patientMonth(p as unknown as PatientMonthInput, today, nowTime, month)).filter((pm) => pm.claim.days > 0);
    const receipts = months.map((pm) => pm.receipt);
    const files = (["1", "2"] as Payer[]).map((payer) => {
      const f = buildUke(receipts, payer, month, nextMonth(month));
      return {
        payer,
        label: PAYER_NAME[payer],
        filename: "RECEIPTC.UKE",
        count: f.count,
        totalPoints: f.totalPoints,
        problems: f.problems,
        text: f.text,
        base64: Buffer.from(f.bytes).toString("base64"),
      };
    });
    return Response.json({ month, submitMonth: nextMonth(month), files });
  } catch (e) {
    console.error("receipt failed", e);
    return Response.json({ error: "レセプトを作れませんでした。" }, { status: 500 });
  }
}
