import { describe, expect, it } from "vitest";
import { chartDeskOf, merge3, mergeWorkspace } from "./merge-workspace";

const note = (id: string, text: string, versions?: { text: string; author: string }[]) => ({ kind: "note", id, day: 0, time: "10:00", author: "医師 山本", role: "医師", text, ...(versions ? { versions } : {}) });

describe("同時に開いたときの記録のマージ", () => {
  it("joins the notes both pages confirmed, by id, the other page's new ones after this page's", () => {
    const base = { notes: { p1: [note("n1", "朝の回診")] } };
    const mine = { notes: { p1: [note("n1", "朝の回診"), note("n2", "昼：疼痛なし")] } };
    const theirs = { notes: { p1: [note("n1", "朝の回診"), note("n3", "看護：良眠")], p2: [note("n4", "入院時")] } };
    const r = mergeWorkspace(mine, theirs, base);
    expect((r.data.notes as Record<string, { id: string }[]>).p1.map((n) => n.id)).toEqual(["n1", "n2", "n3"]);
    expect((r.data.notes as Record<string, { id: string }[]>).p2.map((n) => n.id)).toEqual(["n4"]);
    expect(r.changed).toEqual(["notes"]);
    // n2 is only here: the merged records are to be saved.
    expect(r.kept).toEqual(["notes"]);
    expect(mergeWorkspace(theirs, theirs, base).kept).toEqual([]);
  });

  it("keeps every version when the same note was corrected on both pages (the unsaved local text is retained)", () => {
    const v1 = { text: "体温 36.8", author: "医師 山本" };
    const base = { revised: { p1: { n1: note("n1", "体温 36.8", [v1]) } } };
    const mine = { revised: { p1: { n1: note("n1", "体温 37.2", [v1, { text: "体温 37.2", author: "医師 山本" }]) } } };
    const theirs = { revised: { p1: { n1: note("n1", "体温 36.8、SpO2 97%", [v1, { text: "体温 36.8、SpO2 97%", author: "看護師 佐藤" }]) } } };
    const n = (mergeWorkspace(mine, theirs, base).data.revised as Record<string, Record<string, { text: string; versions: { text: string }[] }>>).p1.n1;
    expect(n.versions.map((v) => v.text)).toEqual(["体温 36.8", "体温 37.2", "体温 36.8、SpO2 97%"]);
    expect(n.text).toBe("体温 37.2");
  });

  it("merges maps key by key and lists without ids as a union", () => {
    const base = { mar: { "o1|0": { status: "実施" } }, stopped: ["o3"] };
    const mine = { mar: { "o1|0": { status: "実施" }, "o2|0": { status: "実施", by: "看護師 佐藤" } }, stopped: ["o3", "o5"] };
    const theirs = { mar: { "o1|0": { status: "実施" }, "o4|1": { status: "未実施" } }, stopped: ["o3", "o6"] };
    const r = mergeWorkspace(mine, theirs, base);
    expect(Object.keys(r.data.mar as object).sort()).toEqual(["o1|0", "o2|0", "o4|1"]);
    expect(r.data.stopped).toEqual(["o3", "o5", "o6"]);
  });

  it("keeps the note and drafts this role is writing, and merges what the chart holds for everyone", () => {
    const desk = (note: string, drafts: { id: string }[]) => ({ note, drafts, added: [], stopped: [], stopTimes: {}, extended: {} });
    const shared = (added: { id: string }[], stopped: string[], stopTimes: Record<string, string>) => ({ note: "", drafts: [], added, stopped, stopTimes, extended: {} });
    const base = { charts: { p1: shared([{ id: "a1" }], [], {}) } };
    const mine = { charts: { p1: shared([{ id: "a1" }, { id: "a2" }], ["x1"], { x1: "10:00" }), "p1|医師": desk("S) 書きかけ", [{ id: "d1" }]) } };
    const theirs = { charts: { p1: shared([{ id: "a1" }, { id: "a3" }], ["x2"], { x2: "10:05" }), "p1|医師": desk("S) あちらの書きかけ", []), "p1|看護師": desk("# 転倒", []) } };
    const r = mergeWorkspace(mine, theirs, base, { local: chartDeskOf("医師") });
    const charts = r.data.charts as Record<string, ReturnType<typeof shared>>;
    expect(charts.p1.added.map((a) => a.id)).toEqual(["a1", "a2", "a3"]);
    expect(charts.p1.stopped).toEqual(["x1", "x2"]);
    expect(charts.p1.stopTimes).toEqual({ x1: "10:00", x2: "10:05" });
    expect(charts["p1|医師"].note).toBe("S) 書きかけ");
    expect(charts["p1|医師"].drafts).toEqual([{ id: "d1" }]);
    // Another role's desk is theirs to keep; this role's desk written elsewhere is not brought in.
    expect(charts["p1|看護師"].note).toBe("# 転倒");
    // What the chart holds for everyone differs from the saved side (a2, x1), so it is to be saved; the desk alone would not be.
    expect(r.kept).toEqual(["charts"]);
    expect(mergeWorkspace({ charts: { p1: shared([], [], {}), "p1|医師": desk("S) 書きかけ", []) } }, { charts: { p1: shared([], [], {}) } }, null, { local: chartDeskOf("医師") }).kept).toEqual([]);
  });

  it("retains id records as a union while allowing map deletions", () => {
    const base = { boardReminders: [{ id: "r1" }, { id: "r2" }], flags: { a: true, b: true } };
    const mine = { boardReminders: [{ id: "r1" }, { id: "r2" }], flags: { a: true, b: true } };
    const theirs = { boardReminders: [{ id: "r1" }], flags: { a: true } };
    expect(mergeWorkspace(mine, theirs, base).data).toEqual({ boardReminders: [{ id: "r1" }, { id: "r2" }], flags: { a: true } });
    expect(mergeWorkspace(mine, theirs, null).data).toEqual({ boardReminders: [{ id: "r1" }, { id: "r2" }], flags: { a: true, b: true } });
  });

  it("keeps local input on a simultaneous scalar edit", () => {
    expect(merge3("a", "b", "a")).toBe("b");
    expect(merge3("b", "a", "a")).toBe("b");
    expect(merge3("b", "c", "a")).toBe("b");
    expect(merge3("b", "c", undefined)).toBe("b");
    expect(merge3({ x: 1, y: 2 }, { x: 1, z: 3 }, { x: 1 })).toEqual({ x: 1, y: 2, z: 3 });
  });

  it("takes the saved records named 'theirs' as they are, keeps those named 'mine', and keeps what the other side lacks", () => {
    const mine = { audit: [{ seq: 1, action: "A" }], __writer: { tab: "me" }, onlyHere: [1] };
    const theirs = { audit: [{ seq: 1, action: "B" }], __writer: { tab: "them" } };
    const r = mergeWorkspace(mine, theirs, null, { theirs: ["audit"], mine: ["__writer"] });
    expect(r.data).toEqual({ audit: [{ seq: 1, action: "B" }], __writer: { tab: "me" }, onlyHere: [1] });
    expect(r.changed).toEqual(["audit"]);
    expect(r.kept).toEqual(["onlyHere"]);
  });

  it("changes nothing when the saved records are the same", () => {
    const same = { notes: { p1: [note("n1", "x")] }, mar: {} };
    expect(mergeWorkspace(same, JSON.parse(JSON.stringify(same)), same).changed).toEqual([]);
  });
});

it("患者の入れかけの Rp は、この職種が入力中の内容を保って保存する", () => {
  const key = JSON.stringify(["90010231:看護師", "injection.入れかけ"]);
  const mine = { windowEntries: { [key]: [{ rows: [{ drugCode: "demo", amount: "2" }] }] } };
  const theirs = { windowEntries: { [key]: [{ rows: [{ drugCode: "demo", amount: "1" }] }] } };
  expect(mergeWorkspace(mine, theirs, null, { local: chartDeskOf("看護師") }).data).toEqual(mine);
});

it("同じidは更新時刻が新しい記録を採り、同時の値の衝突を知らせる", () => {
  const old = { id: "a", value: "old", updatedAt: "2026-11-06T01:00:00Z" };
  const recent = { id: "a", value: "new", updatedAt: "2026-11-06T01:01:00Z" };
  expect(merge3([recent], [old], undefined)).toEqual([recent]);
  expect(merge3([old], [recent], undefined)).toEqual([recent]);
  const conflict = mergeWorkspace({ calls: { a: { to: "医師A" } } }, { calls: { a: { to: "医師B" } } }, { calls: { a: { to: "医師C" } } });
  expect(conflict.data).toEqual({ calls: { a: { to: "医師A" } } });
  expect(conflict.conflicts).toEqual(["calls.a.to"]);
});
it("パニック値の連絡と薬剤師の別記録を双方保持する", () => {
  const base = { calls: {}, notes: [] };
  const mine = { calls: { blood: { to: "主治医", readBack: true } }, notes: [] };
  const theirs = { calls: {}, notes: [{ id: "pharmacist", text: "薬剤師の記録" }] };
  const result = mergeWorkspace(mine, theirs, base);
  expect(result.data.calls).toEqual(mine.calls);
  expect(result.data.notes).toEqual(theirs.notes);
  expect(result.conflicts).toEqual([]);
});

it("前の保存に連絡がなくても、いったん記録したパニック値の連絡を消さない", () => {
  const mine = { calls: { blood: { to: "主治医", readBack: true } } };
  expect(mergeWorkspace(mine, { calls: {} }, mine).data).toEqual(mine);
});
