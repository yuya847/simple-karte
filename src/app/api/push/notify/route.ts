// POST /api/push/notify — a confirming screen (検査室・生理検査・放射線部・病理・内視鏡) says which results came in.
// The server reads the devices of the workspace and sends each person a count (「新しい結果 2件・パニック値 1件」;
// with the hospital's setting, a pseudonym and the value). A result is sent once.

import { isWorkspaceId } from "@/lib/portal/token";
import { readItems } from "@/lib/push/push";
import { PushUnavailable, notify, pushUnavailable } from "@/lib/push/server";
import { pushSender, vapid } from "@/lib/push/send";
import { limitedBy } from "@/lib/rate-limit";

const noStore = { "cache-control": "no-store" };
const fail = (error: string, status: number) => Response.json({ error }, { status, headers: noStore });

export async function POST(request: Request) {
  if (limitedBy(request, "push-notify", 60)) return fail("回数の上限に達しました。しばらくしてからもう一度。", 429);
  const why = pushUnavailable();
  if (why) return fail(why, 503);
  const body = (await request.json().catch(() => null)) as { ws?: unknown; items?: unknown } | null;
  const items = readItems(body?.items);
  if (!body || !isWorkspaceId(body.ws)) return fail("送れません。", 400);
  if (!items.length) return Response.json({ sent: 0, stopped: 0 }, { headers: noStore });
  try {
    return Response.json(await notify(body.ws, items, await pushSender(vapid()!)), { headers: noStore });
  } catch (e) {
    if (e instanceof PushUnavailable) return fail(e.message, 409);
    console.error(e);
    return fail("いま送れません。しばらくしてからもう一度。", 503);
  }
}
