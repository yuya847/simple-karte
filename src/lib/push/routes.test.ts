// スマートフォンへの通知を、ブラウザなしで端から端まで：端末の登録 → 検査室で結果を確定 → /api/push/notify が
// 登録した端末に送る。保存先（Supabase の RPC）はこのテストの中の1行、通知の送信は差し替える（何も外に出ない）。
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_DESK, confirmReport, deskLabs, drawRows, receive } from "../lab-desk";
import { marKey, type AdminRecord } from "../mar";
import { PATIENTS } from "../patients";
import { currentEntries } from "../record";
import { PANIC_LIMITS, resultsOf, unseen } from "../results";
import type { OrderEntry } from "../types";
import type { WorkPatient } from "../worksheet";
import { readSubs, type PushKeys } from "./push";

const WS = "00000000-0000-4000-8000-0000000000aa";
const keys = (n: string): PushKeys => ({ endpoint: `https://fcm.googleapis.com/fcm/send/${n}`, keys: { p256dh: `BKey${n}`, auth: `auth${n}` } });
type Row = { version: number; day: string; data: Record<string, unknown>; updated_at: string };
let row: Row | null = null;
let saves = 0;

const post = (body: unknown) => new Request("http://localhost/api/push", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.9" }, body: JSON.stringify(body) });
const routes = async () => ({
  key: await import("@/app/api/push/key/route"),
  subscribe: await import("@/app/api/push/subscribe/route"),
  unsubscribe: await import("@/app/api/push/unsubscribe/route"),
  notify: await import("@/app/api/push/notify/route"),
  send: await import("./send"),
  targets: await import("./targets"),
  anonymize: await import("../mcp/anonymize"),
});

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
  vi.stubEnv("VAPID_PUBLIC_KEY", "BPublicKeyForTheTest");
  vi.stubEnv("VAPID_PRIVATE_KEY", "private-key-for-the-test");
  vi.stubEnv("VAPID_SUBJECT", "mailto:test@example.com");
  row = null;
  saves = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      if (url.endsWith("/rpc/load_workspace")) return new Response(JSON.stringify(row ? [row] : []));
      if (url.endsWith("/rpc/save_workspace_checked")) {
        if ((row?.updated_at ?? null) !== body.p_expected) return new Response("false");
        row = { version: body.p_version, day: body.p_day, data: body.p_data, updated_at: `2026-11-07T12:00:${String(++saves).padStart(2, "0")}Z` };
        return new Response("true");
      }
      throw new Error(`unexpected ${url}`);
    }),
  );
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

// 佐倉 修（72歳男性、512、主治医 山本）: an electrolyte draw at 14:00 today, confirmed by the laboratory with K 7.2 (a panic value).
const sakura = PATIENTS[0];
const order: OrderEntry = { kind: "order", id: "ord-push", day: 0, time: "09:00", author: "山本（専攻医）", status: "有効", order: { type: "lab", codes: ["SET-LYTES"], collect: { day: 0, time: "14:00" }, priority: "定時" } };
const people: WorkPatient[] = [{ patient: sakura, room: "512", entries: [...currentEntries(sakura, undefined).filter((e): e is OrderEntry => e.kind === "order"), order] }];
const T14 = 14 * 60;
const drawn: Record<string, AdminRecord> = { [marKey("ord-push", T14)]: { key: marKey("ord-push", T14), orderId: "ord-push", patientId: sakura.id, at: T14, status: "実施", doneAt: "14:02", by: "看護師 伊藤", checked: { patient: true, label: true } } };
function confirmAtLab(values: Record<string, number>) {
  const r = drawRows(people, drawn, EMPTY_DESK, 9 * 60, T14 + 10).find((x) => x.orderId === "ord-push")!;
  return confirmReport(receive(EMPTY_DESK, r, "検査技師 中村", T14 + 10), r, values, "検査技師 中村", T14 + 40);
}
/** What the page does after the laboratory's 確定: the results that were not there before (未確認の結果). */
function newResults(values: Record<string, number>) {
  const before = unseen(resultsOf(sakura, PANIC_LIMITS), {});
  const after = unseen(resultsOf({ ...sakura, labs: [...sakura.labs, ...deskLabs(confirmAtLab(values), sakura.id)] }, PANIC_LIMITS), {});
  return after.filter((i) => !before.some((b) => b.key === i.key));
}
const about = (doctors: string[]) => () => ({ patient: sakura, doctors, nurse: "看護師 伊藤" });

describe("スマートフォンへの通知（サーバー）", () => {
  it("登録 → 結果の確定 → 受け持ちの医師と担当の看護師の端末に、件数だけを一度だけ送る", async () => {
    const r = await routes();
    const sent: { endpoint: string; payload: string; urgency: string }[] = [];
    r.send.replacePushSender(async (sub, payload, opts) => void sent.push({ endpoint: sub.endpoint, payload, urgency: opts.urgency }));

    const key = await (await r.key.GET(new Request(`http://localhost/api/push/key?ws=${WS}`))).json();
    expect(key).toEqual({ key: "BPublicKeyForTheTest", why: null, name: null });

    for (const [name, role, k] of [["山本（専攻医）", "医師", "yamamoto"], ["木下（総合診療科 B）", "医師", "kinoshita"], ["看護師 伊藤", "看護師", "ito"], ["看護師 佐藤", "看護師", "sato"]] as const) {
      const res = await r.subscribe.POST(post({ ws: WS, name, role, device: "iPhone", sub: keys(k) }));
      expect(res.status).toBe(200);
    }
    expect(readSubs(row!.data.pushSubs).map((s) => s.name).sort()).toEqual(["山本（専攻医）", "木下（総合診療科 B）", "看護師 伊藤", "看護師 佐藤"].sort());
    expect((await (await r.key.GET(new Request(`http://localhost/api/push/key?ws=${WS}&endpoint=${encodeURIComponent(keys("yamamoto").endpoint)}`))).json()).name).toBe("山本（専攻医）");
    // Not a push service: refused.
    expect((await r.subscribe.POST(post({ ws: WS, name: "山本（専攻医）", role: "医師", device: "iPhone", sub: { endpoint: "https://example.com/x", keys: { p256dh: "B", auth: "a" } } }))).status).toBe(400);

    const fresh = newResults({ Na: 139, K: 7.2, Cl: 104 });
    expect(fresh).toHaveLength(1);
    const subs = readSubs(row!.data.pushSubs);
    const doctors = r.targets.doctorsToTell({ attending: sakura.attending, others: [] });
    const items = r.targets.toPushItems(fresh, subs, false, about(doctors));
    expect(items).toEqual([{ key: fresh[0].key, patientId: sakura.id, panic: true, doctors, nurse: "看護師 伊藤" }]);

    const res = await r.notify.POST(post({ ws: WS, items }));
    expect(await res.json()).toEqual({ sent: 2, stopped: 0 });
    expect(sent.map((s) => [s.endpoint.split("/").at(-1), JSON.parse(s.payload), s.urgency]).sort()).toEqual([
      ["ito", { title: "Simple Karte", body: "パニック値 1件" }, "high"],
      ["yamamoto", { title: "Simple Karte", body: "新しい結果 1件・パニック値 1件" }, "high"],
    ]);
    // No patient information in what goes out.
    const out = JSON.stringify(sent.map((s) => s.payload));
    for (const word of [sakura.name, sakura.id, "512", "K 7.2", "70代"]) expect(out).not.toContain(word);
    // Kept as sent: the same result again sends nothing.
    expect(Object.keys(row!.data.pushSent as object)).toEqual([fresh[0].key]);
    expect(await (await r.notify.POST(post({ ws: WS, items }))).json()).toEqual({ sent: 0, stopped: 0 });
    expect(sent).toHaveLength(2);
  });

  it("病院の設定がオンなら仮の ID・年代と性別・値。送れなくなった端末は止まる", async () => {
    const r = await routes();
    for (const [name, k] of [["山本（専攻医）", "yamamoto"], ["研修医 田中", "tanaka"]] as const) await r.subscribe.POST(post({ ws: WS, name, role: "医師", device: "Android スマートフォン", sub: keys(k) }));
    row!.data = { ...row!.data, pushPrefs: { detail: true, by: "山本（専攻医）", iso: "2026-11-07T12:00:00Z", rulesChecked: true } };
    const sent: { endpoint: string; body: string }[] = [];
    r.send.replacePushSender(async (sub, payload) => {
      if (sub.endpoint.endsWith("tanaka")) throw Object.assign(new Error("Gone"), { statusCode: 410 });
      sent.push({ endpoint: sub.endpoint, body: JSON.parse(payload).body });
    });
    const fresh = newResults({ Na: 139, K: 7.2, Cl: 104 });
    const items = r.targets.toPushItems(fresh, readSubs(row!.data.pushSubs), true, about(["山本（専攻医）", "研修医 田中"]));
    expect(await (await r.notify.POST(post({ ws: WS, items }))).json()).toEqual({ sent: 1, stopped: 1 });
    const id = r.anonymize.pseudonym(sakura.id).slice(2, 6);
    expect(sent[0].body).toBe(`新しい結果 1件・パニック値 1件\n${id}（70代男性）K 7.2↑`);
    expect(sent[0].body).not.toContain(sakura.name);
    expect(readSubs(row!.data.pushSubs).map((s) => [s.name, s.stopped?.by ?? null]).sort()).toEqual([["山本（専攻医）", null], ["研修医 田中", "送れない端末（購読の終了）"]].sort());
  });

  it("「通知を止める」で外れ、同じ端末を別の人が登録すると前の登録は止まる", async () => {
    const r = await routes();
    await r.subscribe.POST(post({ ws: WS, name: "山本（専攻医）", role: "医師", device: "iPhone", sub: keys("shared") }));
    await r.subscribe.POST(post({ ws: WS, name: "研修医 田中", role: "医師", device: "iPhone", sub: keys("shared") }));
    expect(readSubs(row!.data.pushSubs).map((s) => [s.name, !!s.stopped]).sort()).toEqual([["山本（専攻医）", true], ["研修医 田中", false]].sort());
    expect(await (await r.unsubscribe.POST(post({ ws: WS, endpoint: keys("shared").endpoint, by: "研修医 田中" }))).json()).toEqual({ stopped: true });
    expect(readSubs(row!.data.pushSubs).every((s) => s.stopped && !s.sub)).toBe(true);
    expect((await (await r.key.GET(new Request(`http://localhost/api/push/key?ws=${WS}&endpoint=${encodeURIComponent(keys("shared").endpoint)}`))).json()).name).toBeNull();
  });

  it("鍵がない環境では、鍵は出さず理由を返し、登録も送信もしない", async () => {
    vi.stubEnv("VAPID_PRIVATE_KEY", "");
    const r = await routes();
    expect(await (await r.key.GET(new Request(`http://localhost/api/push/key?ws=${WS}`))).json()).toEqual({ key: null, why: "通知の鍵（VAPID）が設定されていません", name: null });
    expect((await r.subscribe.POST(post({ ws: WS, name: "山本（専攻医）", role: "医師", device: "iPhone", sub: keys("a") }))).status).toBe(503);
    expect((await r.notify.POST(post({ ws: WS, items: [{ key: "k", patientId: "p", doctors: ["山本（専攻医）"] }] }))).status).toBe(503);
    expect(row).toBeNull();
  });

  it("薬剤師などは登録できない（通知は医師・看護師）", async () => {
    const r = await routes();
    expect((await r.subscribe.POST(post({ ws: WS, name: "薬剤師 小林", role: "薬剤師", device: "iPhone", sub: keys("a") }))).status).toBe(400);
    expect((await r.subscribe.POST(post({ ws: "not-a-workspace", name: "山本（専攻医）", role: "医師", device: "iPhone", sub: keys("a") }))).status).toBe(400);
  });
});
