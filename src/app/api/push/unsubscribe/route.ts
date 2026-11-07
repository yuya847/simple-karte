// POST /api/push/unsubscribe — this device stops receiving (its line in pushSubs stays, marked stopped).

import { isWorkspaceId } from "@/lib/portal/token";
import { PushUnavailable, pushUnavailable, stopSub } from "@/lib/push/server";
import { limitedBy } from "@/lib/rate-limit";

const noStore = { "cache-control": "no-store" };
const fail = (error: string, status: number) => Response.json({ error }, { status, headers: noStore });

export async function POST(request: Request) {
  if (limitedBy(request, "push-unsubscribe", 10)) return fail("回数の上限に達しました。しばらくしてからもう一度。", 429);
  const why = pushUnavailable();
  if (why) return fail(why, 503);
  const body = (await request.json().catch(() => null)) as { ws?: unknown; endpoint?: unknown; by?: unknown } | null;
  const endpoint = typeof body?.endpoint === "string" && body.endpoint.length <= 1000 ? body.endpoint : null;
  const by = typeof body?.by === "string" && body.by.trim() && body.by.length <= 60 ? body.by.trim() : "この端末";
  if (!body || !isWorkspaceId(body.ws) || !endpoint) return fail("止められません。", 400);
  try {
    return Response.json({ stopped: await stopSub(body.ws, endpoint, by) }, { headers: noStore });
  } catch (e) {
    if (e instanceof PushUnavailable) return fail(e.message, 409);
    console.error(e);
    return fail("いま止められません。しばらくしてからもう一度。", 503);
  }
}
