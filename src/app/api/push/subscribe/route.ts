// POST /api/push/subscribe — this device receives notifications for this person (医師・看護師). Added to the
// workspace's pushSubs on the server (merged with what is saved; the other records stay as they are).

import { isWorkspaceId } from "@/lib/portal/token";
import { PUSH_ROLES, readKeys } from "@/lib/push/push";
import { PushFull, PushUnavailable, addSub, pushUnavailable } from "@/lib/push/server";
import { limitedBy } from "@/lib/rate-limit";

const noStore = { "cache-control": "no-store" };
const fail = (error: string, status: number) => Response.json({ error }, { status, headers: noStore });
const text = (v: unknown, max: number) => (typeof v === "string" && v.trim() && v.length <= max ? v.trim() : null);

export async function POST(request: Request) {
  if (limitedBy(request, "push-subscribe", 10)) return fail("回数の上限に達しました。しばらくしてからもう一度。", 429);
  const why = pushUnavailable();
  if (why) return fail(why, 503);
  const body = (await request.json().catch(() => null)) as { ws?: unknown; name?: unknown; role?: unknown; device?: unknown; sub?: unknown } | null;
  const role = PUSH_ROLES.find((r) => r === body?.role);
  const name = text(body?.name, 60);
  const device = text(body?.device, 40) ?? "端末";
  const sub = readKeys(body?.sub);
  if (!body || !isWorkspaceId(body.ws) || !role || !name) return fail("登録できません。", 400);
  if (!sub) return fail("この端末の通知の宛先が読めません。", 400);
  try {
    const entry = await addSub(body.ws, { name, role, device, sub });
    return Response.json({ id: entry.id }, { headers: noStore });
  } catch (e) {
    if (e instanceof PushFull) return fail("通知を受ける端末が上限に達しています。", 429);
    if (e instanceof PushUnavailable) return fail(e.message, 409);
    console.error(e);
    return fail("いま登録できません。しばらくしてからもう一度。", 503);
  }
}
