// GET /api/push/key?ws=…&endpoint=… — the public VAPID key for this device's subscription (null, with why, when
// notifications cannot be used here), and who is registered for this browser in the workspace.

import { isWorkspaceId } from "@/lib/portal/token";
import { pushUnavailable, registeredName } from "@/lib/push/server";
import { vapid } from "@/lib/push/send";
import { limitedBy } from "@/lib/rate-limit";

const noStore = { "cache-control": "no-store" };

export async function GET(request: Request) {
  if (limitedBy(request, "push-key", 60)) return Response.json({ key: null, why: "回数の上限に達しました。しばらくしてからもう一度。", name: null }, { status: 429, headers: noStore });
  const params = new URL(request.url).searchParams;
  const why = pushUnavailable();
  if (why) return Response.json({ key: null, why, name: null }, { headers: noStore });
  const ws = params.get("ws");
  const endpoint = params.get("endpoint");
  const name = isWorkspaceId(ws) && endpoint ? await registeredName(ws, endpoint.slice(0, 1000)).catch(() => null) : null;
  return Response.json({ key: vapid()!.publicKey, why: null, name }, { headers: noStore });
}
