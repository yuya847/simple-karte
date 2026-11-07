// POST /api/portal/token — the chart asks for the QR of a patient (診察券 or the bedside). The token names the
// workspace and the patient, encrypted and signed by the server; the patient opens it with the birth date.

import { workspaceOn } from "@/lib/workspace";
import { isSubject, isWorkspaceId, sealToken } from "@/lib/portal/token";
import { limitedBy } from "@/lib/rate-limit";

const noStore = { "cache-control": "no-store" };

export async function POST(request: Request) {
  if (limitedBy(request, "portal-token", 60)) return Response.json({ error: "回数の上限に達しました。10分ほどおいてから試してください。" }, { status: 429, headers: noStore });
  const body = (await request.json().catch(() => null)) as { ws?: unknown; subject?: unknown } | null;
  if (!body || !isSubject(body.subject) || !(body.ws === null || isWorkspaceId(body.ws))) return Response.json({ error: "患者が違います。" }, { status: 400, headers: noStore });
  const ws = workspaceOn() ? body.ws : null;
  return Response.json({ token: sealToken("card", ws, body.subject) }, { headers: noStore });
}
