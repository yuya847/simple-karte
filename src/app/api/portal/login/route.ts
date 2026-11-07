// POST /api/portal/login — the patient's tab: the QR's token and the birth date. Right: a session token for this
// tab. Wrong a few times: the QR is locked for a while.

import { findPerson, personBirth } from "@/lib/portal/view";
import { readRecords } from "@/lib/portal/server";
import { openToken, sealToken, subjectKey } from "@/lib/portal/token";
import { createTries } from "@/lib/portal/tries";
import { limitedBy } from "@/lib/rate-limit";

const noStore = { "cache-control": "no-store" };
const tries = createTries();
const fail = (error: string, status: number, extra: Record<string, unknown> = {}) => Response.json({ error, ...extra }, { status, headers: noStore });

export async function POST(request: Request) {
  if (limitedBy(request, "portal-login", 30)) return fail("回数の上限に達しました。しばらくしてからもう一度。", 429);
  const body = (await request.json().catch(() => null)) as { token?: unknown; birth?: unknown } | null;
  const claims = openToken(body?.token, "card");
  if (!claims) return fail("この QR は使えません。病院で新しい QR を受け取ってください。", 401, { expired: true });
  const key = subjectKey(claims);
  if (tries.left(key) <= 0) return fail("回数の上限に達しました。しばらくしてからもう一度。", 429);
  const birth = typeof body?.birth === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.birth) ? body.birth : null;
  if (!birth) return fail("生年月日を入れてください。", 400);
  try {
    const { data, today } = await readRecords(claims.w);
    const person = findPerson(claims.p, data);
    if (person && personBirth(person, data, today) === birth) {
      tries.clear(key);
      return Response.json({ session: sealToken("session", claims.w, claims.p) }, { headers: noStore });
    }
  } catch (e) {
    console.error(e);
    return fail("いま開けません。しばらくしてからもう一度。", 503);
  }
  const left = tries.fail(key);
  return left > 0 ? fail("生年月日が違います。", 401, { left }) : fail("回数の上限に達しました。しばらくしてからもう一度。", 429);
}
