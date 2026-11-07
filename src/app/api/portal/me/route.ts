// POST /api/portal/me — what the patient's page shows, for this patient only (the server reads the workspace and
// leaves everything else out). `only: "call"`: just the 外来's call, asked every few seconds.

import { portalCall, portalView } from "@/lib/portal/view";
import { readRecords } from "@/lib/portal/server";
import { openToken, subjectKey } from "@/lib/portal/token";
import { limitedBy } from "@/lib/rate-limit";

const noStore = { "cache-control": "no-store" };

export async function POST(request: Request) {
  if (limitedBy(request, "portal-read", 400)) return Response.json({ error: "回数の上限に達しました。しばらくしてからもう一度。" }, { status: 429, headers: noStore });
  const body = (await request.json().catch(() => null)) as { session?: unknown; only?: unknown } | null;
  const claims = openToken(body?.session, "session");
  if (!claims) return Response.json({ error: "もう一度 QR を読み取ってください。", expired: true }, { status: 401, headers: noStore });
  try {
    const { data, live, today } = await readRecords(claims.w);
    if (body?.only === "call") {
      const call = portalCall(claims.p, data);
      return call ? Response.json(call, { headers: noStore }) : Response.json({ error: "見つかりません。", expired: true }, { status: 401, headers: noStore });
    }
    const view = portalView(claims.p, data, today);
    if (!view) return Response.json({ error: "見つかりません。", expired: true }, { status: 401, headers: noStore });
    return Response.json({ ...view, canSend: live, draftKey: subjectKey(claims) }, { headers: noStore });
  } catch (e) {
    console.error(e);
    return Response.json({ error: "いま読めません。しばらくしてからもう一度。" }, { status: 503, headers: noStore });
  }
}
