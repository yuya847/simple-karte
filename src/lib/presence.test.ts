import { describe, expect, it } from "vitest";
import { coAuthors, editorLine, editorsOf, editorsOn, EDITOR_TTL, EMPTY_PRESENCE, isMsg, livePeers, mergedText, onPatient, peerLine, receive, savedElsewhere, Seen, TAB_TTL, thisTab, withDevices } from "./presence";

const here = (tab: string, patient: string | null, editing = false) => ({ t: "here" as const, tab, who: "看護師 佐藤", role: "看護師", patient, editing });
const edit = (tab: string, text: string, cursor = text.length) => ({ t: "edit" as const, tab, who: "看護師 佐藤", role: "看護師", patient: "p1", note: "n1", label: "10:32 の記事", text, cursor });

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
    expect(receive(EMPTY_PRESENCE, here("e", "p1"), 1000, true, "端末").peers.e.where).toBe("端末");
  });
});

describe("同時利用：誰がどの記事を直しているか", () => {
  it("keeps each editor's latest text and caret, by note and by patient, and forgets one that finished or went quiet", () => {
    let s = receive(EMPTY_PRESENCE, edit("b", "S) 熱はな"), 1000, false);
    s = receive(s, edit("b", "S) 熱はない", 3), 1300, false);
    s = receive(s, { ...edit("c", "O) 体温"), who: "医師 山本", role: "医師", note: "n2" }, 1300, false);
    expect(editorsOf(s, "n1", 2000).map((e) => [e.text, e.cursor])).toEqual([["S) 熱はない", 3]]);
    expect(editorsOn(s, "p1", 2000).map((e) => e.tab)).toEqual(["b", "c"]);
    expect(editorLine(editorsOf(s, "n1", 2000)[0])).toBe("看護師 佐藤（10:32 の記事を修正中）");
    expect(editorLine(editorsOf(s, "n2", 2000)[0])).toBe("医師 山本（10:32 の記事を修正中）");
    s = receive(s, { t: "edit-end", tab: "b", note: "n1" }, 2000, false);
    expect(editorsOf(s, "n1", 2000)).toEqual([]);
    expect(editorsOf(s, "n2", 1300 + EDITOR_TTL + 1)).toEqual([]);
    expect(receive(s, { t: "bye", tab: "c" }, 2000, false).editors).toEqual({});
  });

  it("names the people who corrected a note together once each", () => {
    expect(coAuthors("医師 山本", [{ who: "看護師 佐藤" }, { who: "医師 山本" }])).toBe("医師 山本・看護師 佐藤");
  });
});

describe("あとから保存された記録の取り込み", () => {
  it("notes another page's save (only when the records are shared) so that it is read and merged", () => {
    const saved = { t: "saved" as const, tab: "b", who: "看護師 佐藤", role: "看護師", at: "10:32", changes: [{ patient: "p1", what: "記事の確定" }] };
    expect(receive(EMPTY_PRESENCE, saved, 1000, false).stale).toBeNull();
    const s = receive(receive(EMPTY_PRESENCE, saved, 1000, true), { ...saved, at: "10:33", changes: [{ patient: "p1", what: "オーダの確定" }] }, 1100, true);
    expect(s.stale).toEqual({ by: "看護師 佐藤", role: "看護師", at: "10:33", where: "タブ", patients: { p1: ["記事の確定", "オーダの確定"] } });
    expect(receive(EMPTY_PRESENCE, saved, 1000, true, "端末").stale?.where).toBe("端末");
    const d = savedElsewhere(EMPTY_PRESENCE, "医師 山本", "医師", "10:40");
    expect(d.stale?.where).toBe("端末");
    expect(mergedText("医師 山本", "端末", "10:40")).toBe("医師 山本さんの変更を取り込みました（別の端末・10:40 の保存）。");
  });

  it("ignores messages that are not ours", () => {
    expect(isMsg(here("b", null))).toBe(true);
    expect(isMsg(edit("b", "x"))).toBe(true);
    expect(isMsg({ t: "edit-end", tab: "b", note: "n1" })).toBe(true);
    expect(isMsg({ t: "here", tab: "b" })).toBe(false);
    expect(isMsg({ ...edit("b", "x"), cursor: -1 })).toBe(false);
    expect(isMsg({ ...edit("b", "x".repeat(20_001)) })).toBe(false);
    expect(isMsg({ t: "saved", tab: "b", who: "x", role: "看護師", at: "10:00", changes: [{ patient: "", what: "x" }] })).toBe(false);
    expect(isMsg({ t: "bye", tab: "x".repeat(200) })).toBe(false);
    expect(isMsg("hello")).toBe(false);
  });

  it("drops a message heard twice (through the tabs' channel and the workspace's channel)", () => {
    const seen = new Seen(2);
    expect(seen.fresh("a:1")).toBe(true);
    expect(seen.fresh("a:1")).toBe(false);
    expect(seen.fresh("a:2")).toBe(true);
    expect(seen.fresh("a:3")).toBe(true);
    expect(seen.fresh("a:3")).toBe(false);
  });

  it("gives this page one id", () => {
    expect(thisTab()).toBe(thisTab());
  });
});
