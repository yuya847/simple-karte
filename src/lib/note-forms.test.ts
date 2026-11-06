import { describe, expect, it } from "vitest";
import { formFrame, hasPart, isBlankNote, nextFrame, noteFormOf, noteText, parseNote, reviseNote, versionsOf } from "./notes";
import type { NoteEntry } from "./types";

describe("フォーカス（D・Act・R）", () => {
  it("reads foci with D・Act・R and gives them back", () => {
    const raw = "# 転倒\nD) 22:10 ベッドの横に座り込んでいた。\n外傷なし\nAct) 当直医へ報告、全身を観察\nR) 痛みの訴えなし\n＃ 不眠\nD) 2時まで覚醒";
    const p = parseNote(raw);
    expect(p.focus).toEqual([
      { title: "転倒", d: "22:10 ベッドの横に座り込んでいた。\n外傷なし", act: "当直医へ報告、全身を観察", r: "痛みの訴えなし" },
      { title: "不眠", d: "2時まで覚醒" },
    ]);
    expect(p.soap).toBeUndefined();
    expect(parseNote(noteText(p))).toEqual(p);
  });

  it("the empty frame is blank; SOAP's A) is not Act)", () => {
    expect(isBlankNote(formFrame("フォーカス（DAR）", "10:00"))).toBe(true);
    expect(parseNote("S) 痛い\nA) 改善\nP) 継続").soap).toEqual({ s: "痛い", a: "改善", p: "継続" });
    expect(parseNote("#1 蜂窩織炎\nS) 痛みは軽い").soap?.s).toBe("#1 蜂窩織炎\n痛みは軽い");
  });
});

describe("経時記録", () => {
  it("reads lines by clock time; lines without a time go with the one before", () => {
    const p = parseNote("【経時記録】\n9:30 訪室、入眠中\n10:15 BT 38.2℃\n悪寒あり\n11:00 \n");
    expect(p.timeline).toEqual([
      { time: "09:30", text: "訪室、入眠中" },
      { time: "10:15", text: "BT 38.2℃\n悪寒あり" },
    ]);
    expect(noteText(p)).toBe("【経時記録】\n09:30 訪室、入眠中\n10:15 BT 38.2℃\n悪寒あり");
    expect(parseNote(noteText(p))).toEqual(p);
    expect(parseNote("06:00 起床\n07:30 朝食 全量").timeline).toHaveLength(2);
    expect(isBlankNote(formFrame("経時記録", "10:15"))).toBe(true);
  });
});

describe("記録の形式", () => {
  it("tells the form from the marks, also for an empty frame", () => {
    expect(noteFormOf("S)\nO)\nA)\nP)\n")).toBe("SOAP");
    expect(noteFormOf(formFrame("フォーカス（DAR）", "10:00"))).toBe("フォーカス（DAR）");
    expect(noteFormOf(formFrame("経時記録", "10:00"))).toBe("経時記録");
    expect(noteFormOf("夜間 良眠。")).toBe("自由文");
    expect(noteFormOf("#1 心不全\nS) 息切れ軽い")).toBe("SOAP");
  });

  it("a nurse goes on in the same form; others start from their template", () => {
    expect(nextFrame("看護師", "# 転倒\nD) x", "11:00")).toBe("# \nD) \nAct) \nR) \n");
    expect(nextFrame("看護師", "【経時記録】\n10:00 x", "11:00")).toBe("【経時記録】\n11:00 \n");
    expect(nextFrame("医師", "【経時記録】\n10:00 x", "11:00")).toBe("");
  });

  it("parts to narrow the record to", () => {
    const f = parseNote("# 転倒\nD) 座り込み\nR) 痛みなし");
    expect(hasPart(f, "#")).toBe(true);
    expect(hasPart(f, "D")).toBe(true);
    expect(hasPart(f, "Act")).toBe(false);
    expect(hasPart(f, "S")).toBe(false);
    const s = parseNote("S) 痛い\nP) 継続");
    expect(hasPart(s, "S")).toBe(true);
    expect(hasPart(s, "O")).toBe(false);
    expect(hasPart(parseNote("【経時記録】\n10:00 訪室"), "経時")).toBe(true);
    expect(hasPart(s, "全")).toBe(true);
  });

  it("a correction of a focus note keeps the focus and the earlier version", () => {
    const e: NoteEntry = { kind: "note", day: 0, time: "22:30", author: "看護師 佐藤", role: "看護師", ...parseNote("# 転倒\nD) 座り込み") };
    const v2 = reviseNote(e, "# 転倒\nD) 座り込み\nR) 痛みなし", "看護師 佐藤", { day: 0, time: "23:00" }, "追記");
    expect(v2.focus?.[0].r).toBe("痛みなし");
    expect(v2.soap).toBeUndefined();
    expect(versionsOf(v2)[0].focus?.[0].r).toBeUndefined();
  });
});
