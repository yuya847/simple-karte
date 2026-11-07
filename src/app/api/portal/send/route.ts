// POST /api/portal/send — the patient's answers to the admission questions, or 「検査の結果を見る」 given or taken
// back. Added to the day's records as 患者さんの入力 (portalInbox); a nurse confirms the answers in the chart.

import { cleanIntake, answeredCount } from "@/lib/portal/intake";
import { addToInbox, InboxFull, readRecords } from "@/lib/portal/server";
import { openToken } from "@/lib/portal/token";
import { findPerson } from "@/lib/portal/view";
import { limitedBy } from "@/lib/rate-limit";

const noStore = { "cache-control": "no-store" };
const fail = (error: string, status: number) => Response.json({ error }, { status, headers: noStore });

export async function POST(request: Request) {
  if (limitedBy(request, "portal-send", 20)) return fail("回数の上限に達しました。しばらくしてからもう一度。", 429);
  const body = (await request.json().catch(() => null)) as { session?: unknown; kind?: unknown; answers?: unknown; agree?: unknown } | null;
  const claims = openToken(body?.session, "session");
  if (!claims) return fail("もう一度 QR を読み取ってください。", 401);
  try {
    const { data, live } = await readRecords(claims.w);
    if (!live || !claims.w) return fail("この環境では送れません。", 503);
    const person = findPerson(claims.p, data);
    if (!person) return fail("見つかりません。", 401);
    if (body?.kind === "labs" && typeof body.agree === "boolean") {
      await addToInbox(claims.w, { patientId: claims.p, kind: "labs", via: "スマートフォン", agree: body.agree });
      return Response.json({ ok: true }, { headers: noStore });
    }
    if (body?.kind !== "intake" || person.kind !== "入院") return fail("送れません。", 400);
    const answers = cleanIntake(body.answers);
    if (!answers || answeredCount(answers) === 0) return fail("答えがまだありません。", 400);
    await addToInbox(claims.w, { patientId: claims.p, kind: "intake", via: "スマートフォン", answers });
    return Response.json({ ok: true }, { headers: noStore });
  } catch (e) {
    if (e instanceof InboxFull) return fail("今日はこれ以上送れません。看護師に伝えてください。", 429);
    console.error(e);
    return fail("いま送れません。しばらくしてからもう一度。", 503);
  }
}
