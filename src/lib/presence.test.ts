import { describe, expect, it } from "vitest";
import { EMPTY_PRESENCE, isMsg, livePeers, onPatient, peerLine, receive, savedElsewhere, staleText, TAB_TTL, thisTab, withDevices } from "./presence";

const here = (tab: string, patient: string | null, editing = false) => ({ t: "here" as const, tab, who: "看護師 佐藤", role: "看護師", patient, editing });

describe("同時利用：誰がこのカルテを開いているか", () => {
  it("knows the other tabs from what they say, and forgets one that left or went quiet", () => {
    let s = receive(EMPTY_PRESENCE, here("b", "p1", true), 1000, true);
    s = receive(s, here("c", "p2"), 1000, true);
    expect(onPatient(s, "p1", 2000).map((p) => p.tab)).toEqual(["b"]);
    expect(peerLine(onPatient(s, "p1", 2000)[0])).toBe("看護師 佐藤（別のタブ・記事か下書きを書いています）");
    s = receive(s, { t: "bye", tab: "c" }, 3000, true);
    expect(livePeers(s, 3000).map((p) => p.tab)).toEqual(["b"]);
    expect(livePeers(s, 1000 + TAB_TTL + 1)).toEqual([]);
  });

  it("adds the other devices the workspace answered, keeping the tabs", () => {
    let s = receive(EMPTY_PRESENCE, here("b", "p1"), 1000, true);
    s = withDevices(s, [{ tab: "d", who: "山本（専攻医）", role: "医師", patient: "p1", editing: false }], 1000);
    expect(onPatient(s, "p1", 1500).map(peerLine)).toEqual(["看護師 佐藤（別のタブ）", "山本（専攻医）（医師・別の端末）"]);
    s = withDevices(s, [], 2000);
    expect(onPatient(s, "p1", 2500).map((p) => p.where)).toEqual(["タブ"]);
  });
});

describe("排他制御：あとから保存された記録", () => {
  it("makes this page's records older when another tab saved (only when the records are shared)", () => {
    const saved = { t: "saved" as const, tab: "b", who: "看護師 佐藤", role: "看護師", at: "10:32", changes: [{ patient: "p1", what: "記事の確定" }] };
    expect(receive(EMPTY_PRESENCE, saved, 1000, false).stale).toBeNull();
    const s = receive(receive(EMPTY_PRESENCE, saved, 1000, true), { ...saved, at: "10:33", changes: [{ patient: "p1", what: "オーダの確定" }] }, 1100, true);
    expect(s.stale).toEqual({ by: "看護師 佐藤", role: "看護師", at: "10:33", where: "タブ", patients: { p1: ["記事の確定", "オーダの確定"] } });
    expect(staleText(s.stale!, "p1", "大浦 トメ")).toContain("大浦 トメさんの記録は、別のタブ（看護師 佐藤）で 10:33 に変わりました（記事の確定・オーダの確定）");
    expect(staleText(s.stale!, "p2")).toContain("別のタブ（看護師 佐藤）で 10:33 に記録が保存されました");
    const d = savedElsewhere(EMPTY_PRESENCE, "医師 山本", "医師", "10:40");
    expect(d.stale?.where).toBe("端末");
  });

  it("ignores messages that are not ours", () => {
    expect(isMsg(here("b", null))).toBe(true);
    expect(isMsg({ t: "here", tab: "b" })).toBe(false);
    expect(isMsg({ t: "saved", tab: "b", who: "x", role: "看護師", at: "10:00", changes: [{ patient: "", what: "x" }] })).toBe(false);
    expect(isMsg({ t: "bye", tab: "x".repeat(200) })).toBe(false);
    expect(isMsg("hello")).toBe(false);
  });

  it("gives this page one id", () => {
    expect(thisTab()).toBe(thisTab());
  });
});
