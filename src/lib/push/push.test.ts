import { describe, expect, it } from "vitest";
import { mergeWorkspace } from "../merge-workspace";
import { INITIAL_DOCTOR_BOOK, doctorsOf } from "../patient-doctors";
import type { ResultItem } from "../results";
import { activeSubs, countLine, deviceName, planPush, readItems, readKeys, readPrefs, readSubs, resultLine, shortId, whoOf, type PushItem, type PushSub } from "./push";
import { doctorsToTell, toPushItems } from "./targets";

const keys = (n: string) => ({ endpoint: `https://fcm.googleapis.com/fcm/send/${n}`, keys: { p256dh: `BKey${n}`, auth: `auth${n}` } });
const sub = (x: Partial<PushSub> & Pick<PushSub, "id" | "name" | "role">): PushSub => ({ device: "iPhone", iso: "2026-11-07T12:00:00.000Z", sub: keys(x.id), ...x });
const item = (x: Partial<PushItem> & Pick<PushItem, "key">): PushItem => ({ patientId: "90010231", panic: false, doctors: ["山本（専攻医）", "研修医 田中"], nurse: "看護師 伊藤", ...x });
const result = (x: Partial<ResultItem> & Pick<ResultItem, "key">): ResultItem => ({ patientId: "90010231", kind: "検査", day: 0, time: "14:00", title: "検体検査 3項目", detail: "すべて基準範囲の中", panic: [], ...x });

describe("通知の宛先と端末の記録", () => {
  it("端末の宛先は、知っている通知の配信先（https）の URL と鍵だけを受け付ける", () => {
    expect(readKeys(keys("a"))).toEqual(keys("a"));
    expect(readKeys({ endpoint: "https://web.push.apple.com/QGx", keys: { p256dh: "BX-_", auth: "a_b" } })).not.toBeNull();
    expect(readKeys({ endpoint: "https://updates.push.services.mozilla.com/wpush/v2/x", keys: { p256dh: "B", auth: "a" } })).not.toBeNull();
    // Anything else could make the server call an address of someone's choosing.
    expect(readKeys({ endpoint: "https://example.com/push", keys: { p256dh: "B", auth: "a" } })).toBeNull();
    expect(readKeys({ endpoint: "https://fcm.googleapis.com.evil.example/x", keys: { p256dh: "B", auth: "a" } })).toBeNull();
    expect(readKeys({ endpoint: "http://fcm.googleapis.com/x", keys: { p256dh: "B", auth: "a" } })).toBeNull();
    expect(readKeys({ endpoint: "https://fcm.googleapis.com/x", keys: { p256dh: "B<script>", auth: "a" } })).toBeNull();
    expect(readKeys(null)).toBeNull();
  });

  it("保存されたものを形を確かめて読み、止めた端末は宛先を持たない", () => {
    const got = readSubs([sub({ id: "1", name: "山本（専攻医）", role: "医師" }), { id: "2", name: "x", role: "薬剤師", device: "Mac", iso: "t" }, sub({ id: "3", name: "看護師 伊藤", role: "看護師", stopped: { iso: "t", by: "看護師 伊藤" } }), null, "x"]);
    expect(got.map((s) => [s.id, !!s.sub, !!s.stopped])).toEqual([["1", true, false], ["3", false, true]]);
    expect(activeSubs(got).map((s) => s.id)).toEqual(["1"]);
    expect(readSubs("x")).toEqual([]);
    expect(readPrefs(null)).toEqual({ detail: false });
    expect(readPrefs({ detail: "yes" }).detail).toBe(false);
    expect(readPrefs({ detail: true, by: "山本（専攻医）", iso: "t", rulesChecked: true })).toEqual({ detail: true, by: "山本（専攻医）", iso: "t", rulesChecked: true });
  });

  it("ページから来た結果は形を確かめ、50件まで", () => {
    const got = readItems([{ key: "k1", patientId: "p", panic: true, doctors: ["山本（専攻医）", "山本（専攻医）", 3], nurse: "看護師 伊藤", who: "70代男性", line: "K 7.2↑\u0007" }, { key: "", patientId: "p" }, "x"]);
    expect(got).toEqual([{ key: "k1", patientId: "p", panic: true, doctors: ["山本（専攻医）"], nurse: "看護師 伊藤", who: "70代男性", line: "K 7.2↑ " }]);
    expect(readItems(Array.from({ length: 80 }, (_, i) => ({ key: `k${i}`, patientId: "p" })))).toHaveLength(50);
  });

  it("病棟の保存とサーバーが足した端末は、保存のときに両方残り、病棟で外した端末は戻らない", () => {
    const yamamoto = sub({ id: "1", name: "山本（専攻医）", role: "医師" });
    const base = { pushSubs: [yamamoto], notes: { x: 1 } };
    // システム管理 で外した (the ward's page).
    const ward = { pushSubs: [{ ...yamamoto, sub: null, stopped: { iso: "t2", by: "山本（専攻医）" } }], notes: { x: 1 } };
    // Meanwhile the server added a nurse's phone to the saved row (only its entry; the other records stay).
    const saved = mergeWorkspace({ pushSubs: [sub({ id: "2", name: "看護師 伊藤", role: "看護師" })] }, base, null).data;
    expect(saved.notes).toEqual({ x: 1 });
    const merged = readSubs(mergeWorkspace(ward, saved, base).data.pushSubs);
    expect(merged.map((s) => [s.id, !!s.stopped, !!s.sub])).toEqual([["1", true, false], ["2", false, true]]);
    // And the server stopping a device (its subscription ended) is not undone by a page that still has it.
    const serverStopped = mergeWorkspace({ pushSubs: [{ ...yamamoto, sub: null, stopped: { iso: "t3", by: "送れない端末（購読の終了）" } }] }, base, null).data;
    expect(readSubs(mergeWorkspace(base, serverStopped, base).data.pushSubs)[0].stopped?.by).toBe("送れない端末（購読の終了）");
  });
});

describe("通知の文", () => {
  const subs = [sub({ id: "d1", name: "山本（専攻医）", role: "医師" }), sub({ id: "d2", name: "木下（総合診療科 B）", role: "医師" }), sub({ id: "n1", name: "看護師 伊藤", role: "看護師" }), sub({ id: "n2", name: "看護師 佐藤", role: "看護師" })];
  const items = [item({ key: "a", panic: true }), item({ key: "b" })];

  it("既定は件数だけ：医師は受け持ちの患者の新しい結果、看護師は担当のベッドのパニック値だけ", () => {
    const got = planPush(subs, items, false, () => "XXXX");
    expect(got.map((m) => [m.subId, m.body, m.urgent])).toEqual([
      ["d1", "新しい結果 2件・パニック値 1件", true],
      ["n1", "パニック値 1件", true],
    ]);
    expect(got.every((m) => m.title === "Simple Karte")).toBe(true);
    expect(JSON.stringify(got.map((m) => m.body))).not.toContain("90010231");
    expect(planPush(subs, [item({ key: "c" })], false, () => "XXXX").map((m) => m.subId)).toEqual(["d1"]);
    expect(countLine("医師", [item({ key: "c" })])).toBe("新しい結果 1件");
  });

  it("病院の設定がオンなら、仮の ID（年代と性別）と値を3件まで、パニック値を先に", () => {
    const more = [item({ key: "b", who: "70代男性", line: "CRP 11.8↑" }), item({ key: "a", panic: true, who: "70代男性", line: "K 7.2↑" }), item({ key: "c", line: "画像の報告" }), item({ key: "d", line: "病理の報告" })];
    const got = planPush(subs.slice(0, 1), more, true, () => "A3F9");
    expect(got[0].body).toBe("新しい結果 4件・パニック値 1件\nA3F9（70代男性）K 7.2↑\nA3F9（70代男性）CRP 11.8↑\nA3F9 画像の報告\nほか 1件");
    // A stopped device gets nothing.
    expect(planPush([{ ...subs[0], sub: null, stopped: { iso: "t", by: "x" } }], more, true, () => "A3F9")).toEqual([]);
  });

  it("仮の ID は MCP の仮 ID の先頭4文字、年代は10歳刻み", () => {
    expect(shortId("P-A3F9C1D2E5B7")).toBe("A3F9");
    expect(whoOf({ age: 72, sex: "男" })).toBe("70代男性");
    expect(whoOf({ age: 8, sex: "女" })).toBe("10歳未満女性");
    expect(whoOf({ age: 93, sex: "女" })).toBe("90歳以上女性");
  });

  it("値の行：パニック値を先に、基準範囲の外を↑↓で3つまで", () => {
    const k = { code: "K", name: "K", value: 7.2, unit: "mEq/L", side: "高" as const, limit: 7 };
    expect(resultLine(result({ key: "x", detail: "基準範囲の外：K 7.2H、CRP 11.8H、Hb 9.1L、Alb 2.4L", panic: [k] }))).toBe("K 7.2↑・CRP 11.8↑・Hb 9.1↓");
    expect(resultLine(result({ key: "x", detail: "すべて基準範囲の中" }))).toBe("基準範囲の中");
    expect(resultLine(result({ key: "x", kind: "培養", title: "血液培養 中間報告（2セット中1セット陽性）", panic: [{ code: "BC", name: "血液培養陽性（グラム陽性球菌）", value: NaN, unit: "", side: "高", limit: NaN }] }))).toBe("血液培養陽性（グラム陽性球菌）");
    expect(resultLine(result({ key: "x", kind: "培養", title: "尿培養 最終報告" }))).toBe("尿培養 最終報告");
    expect(resultLine(result({ key: "x", kind: "画像", title: "CT 胸部（石田）" }))).toBe("画像の報告");
  });

  it("端末の名前はブラウザから", () => {
    expect(deviceName("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)")).toBe("iPhone");
    expect(deviceName("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 5)).toBe("iPad");
    expect(deviceName("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 0)).toBe("Mac");
    expect(deviceName("Mozilla/5.0 (Linux; Android 15; Pixel 9) Mobile")).toBe("Android スマートフォン");
    expect(deviceName("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe("Windows");
    expect(deviceName("curl/8")).toBe("端末");
  });
});

describe("誰に送るか（ページで決める）", () => {
  it("受け持ちの医師：主治医のチーム・担当医・コンサルト医", () => {
    const sakura = doctorsToTell(doctorsOf("山本（専攻医）", INITIAL_DOCTOR_BOOK["90010231"]));
    expect(sakura).toEqual(expect.arrayContaining(["山本（専攻医）", "研修医 田中", "指導医 高橋", "中川（循環器内科）"]));
    expect(sakura).not.toContain("木下（総合診療科 B）");
    expect(doctorsToTell(doctorsOf("中川（循環器内科）", INITIAL_DOCTOR_BOOK["90035054"]))).toContain("山本（専攻医）");
  });

  it("受け取る端末がない結果は送らない。設定がオフなら年代も値も送らない", () => {
    const subs = [sub({ id: "d1", name: "山本（専攻医）", role: "医師" }), sub({ id: "n1", name: "看護師 伊藤", role: "看護師" })];
    const k = { code: "K", name: "K", value: 7.2, unit: "mEq/L", side: "高" as const, limit: 7 };
    const fresh = [result({ key: "a", detail: "基準範囲の外：K 7.2H", panic: [k] }), result({ key: "a" }), result({ key: "b", patientId: "other" })];
    const about = (pid: string) => (pid === "90010231" ? { patient: { age: 72, sex: "男" as const }, doctors: ["山本（専攻医）"], nurse: "看護師 伊藤" } : { doctors: ["木下（総合診療科 B）"] });
    expect(toPushItems(fresh, subs, false, about)).toEqual([{ key: "a", patientId: "90010231", panic: true, doctors: ["山本（専攻医）"], nurse: "看護師 伊藤" }]);
    expect(toPushItems(fresh, subs, true, about)[0]).toMatchObject({ who: "70代男性", line: "K 7.2↑" });
    // A nurse alone is told of a panic value only.
    expect(toPushItems([result({ key: "c" })], subs.slice(1), false, about)).toEqual([]);
  });
});
