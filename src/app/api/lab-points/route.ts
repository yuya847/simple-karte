// POST /api/lab-points — the 実施料 of the lab items picked on the order screen, read from the official
// 医科診療行為マスター on the server (the master files are large). Computed by code; nothing is sent to Claude.

import { z } from "zod";
import { labPoints } from "@/lib/billing/lab-points";

const Body = z.object({ codes: z.array(z.string().max(40)).max(200) });

export async function POST(request: Request) {
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "項目のコードが読めません。" }, { status: 400 });
  try {
    return Response.json(labPoints(body.data.codes));
  } catch (e) {
    console.error("lab-points failed", e);
    return Response.json({ error: "点数を読めませんでした。" }, { status: 500 });
  }
}
