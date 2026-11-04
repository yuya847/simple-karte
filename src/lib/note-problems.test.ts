import { describe, expect, it } from "vitest";
import { moveProblem, problemBlocks, renumberProblems } from "./note-problems";
import { isBlankNote, noteText, parseNote } from "./notes";

describe("# のプロブレムの番号", () => {
  it("numbers a bare '#' and '#尿路感染症' as typed, the caret following", () => {
    expect(renumberProblems("#", 1)).toEqual({ text: "#1 ", caret: 3 });
    expect(renumberProblems("#尿路感染症", 6)).toEqual({ text: "#1 尿路感染症", caret: 8 });
    expect(renumberProblems("A)\n#尿路感染症\n#高血圧", 14)).toEqual({ text: "A)\n#1 尿路感染症\n#2 高血圧", caret: 18 });
  });

  it("gives the numbers again when they are off, and keeps a title that starts with a digit", () => {
    expect(renumberProblems("#2 高血圧\n#2 糖尿病\n#  7 貧血").text).toBe("#1 高血圧\n#2 糖尿病\n#3 貧血");
    expect(renumberProblems("# 1回目の転倒").text).toBe("#1 1回目の転倒");
    expect(renumberProblems("#2型糖尿病").text).toBe("#1 2型糖尿病");
    expect(renumberProblems("#1. 心不全\n＃2） 腎不全").text).toBe("#1 心不全\n#2 腎不全");
  });

  it("leaves lines that are not at the start, indented lines and text without '#' alone", () => {
    expect(renumberProblems("S) 痛みなし\n  #memo\nA) #不要", 0)).toEqual({ text: "S) 痛みなし\n  #memo\nA) #不要", caret: 0 });
  });

  it("a caret on a line below moves with the lines above", () => {
    const r = renumberProblems("#a\n本文", 4);
    expect(r.text).toBe("#1 a\n本文");
    expect(r.text.slice(r.caret)).toBe("文");
  });

  it("a nurse's focus keeps its title without the number and an empty frame stays blank", () => {
    expect(parseNote("#1 転倒\nD) 座り込み\n#2 不眠\nD) 2時まで覚醒").focus).toEqual([
      { title: "転倒", d: "座り込み" },
      { title: "不眠", d: "2時まで覚醒" },
    ]);
    expect(parseNote("# 1回目の転倒\nD) 座り込み").focus?.[0].title).toBe("1回目の転倒");
    expect(isBlankNote(renumberProblems("# \nD) \nAct) \nR) \n").text)).toBe(true);
    // A doctor's SOAP keeps the numbered lines as written.
    expect(noteText(parseNote("A)\n#1 尿路感染症\n  CRP 改善\n#2 高血圧\nP) CTRX 継続"))).toBe("A) #1 尿路感染症\n  CRP 改善\n#2 高血圧\nP) CTRX 継続");
  });
});

describe("# のブロックの並べ替え", () => {
  const note = "S) 発熱なし\nA)\n#1 尿路感染症\n  CRP 改善\n\n#2 高血圧\n  安定\n#3 貧血\nP) CTRX 継続\n#1 退院調整\n";

  it("finds the blocks with their lines, split by SOAP marks", () => {
    expect(problemBlocks(note)).toEqual([
      { number: 1, title: "尿路感染症", from: 2, to: 3, segment: 2 },
      { number: 2, title: "高血圧", from: 5, to: 6, segment: 2 },
      { number: 3, title: "貧血", from: 7, to: 7, segment: 2 },
      { number: 4, title: "退院調整", from: 9, to: 9, segment: 3 },
    ]);
  });

  it("moves a block with its body and numbers again; P) stays where it is", () => {
    expect(moveProblem(note, 2, 0)).toBe("S) 発熱なし\nA)\n#1 貧血\n\n#2 尿路感染症\n  CRP 改善\n#3 高血圧\n  安定\nP) CTRX 継続\n#4 退院調整\n");
    expect(moveProblem(note, 0, 1)).toBe("S) 発熱なし\nA)\n#1 高血圧\n  安定\n\n#2 尿路感染症\n  CRP 改善\n#3 貧血\nP) CTRX 継続\n#4 退院調整\n");
  });

  it("does not move a block into another SOAP section, or onto itself", () => {
    expect(moveProblem(note, 3, 0)).toBe(note);
    expect(moveProblem(note, 1, 1)).toBe(note);
    expect(moveProblem(note, 9, 0)).toBe(note);
  });
});
