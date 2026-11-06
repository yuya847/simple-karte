import { describe, expect, it } from "vitest";
import { moveProblem, problemBlocks, problemMarkerEnd, problemTree, renumberProblems, stripProblemMarker } from "./note-problems";
import { isBlankNote, noteText, parseNote } from "./notes";

describe("＃ のプロブレムの番号", () => {
  it("numbers a bare '＃' and '＃尿路感染症' as typed, the caret following", () => {
    expect(renumberProblems("＃", 1)).toEqual({ text: "＃1 ", caret: 3 });
    expect(renumberProblems("＃尿路感染症", 6)).toEqual({ text: "＃1 尿路感染症", caret: 8 });
    expect(renumberProblems("A)\n＃尿路感染症\n＃高血圧", 14)).toEqual({ text: "A)\n＃1 尿路感染症\n＃2 高血圧", caret: 18 });
  });

  it("half-width # lines stay as written", () => {
    expect(renumberProblems("#尿路感染症").text).toBe("#尿路感染症");
    expect(renumberProblems("# 尿路感染症").text).toBe("# 尿路感染症");
    // A bare "#" waits for what follows (it may be "#7").
    expect(renumberProblems("#").text).toBe("#");
    expect(renumberProblems("# ").text).toBe("# ");
  });

  it("gives the numbers again (full-width) when they are off, and keeps a title that starts with a digit", () => {
    expect(renumberProblems("＃2 高血圧\n＃2 糖尿病\n＃  7 貧血").text).toBe("＃1 高血圧\n＃2 糖尿病\n＃3 貧血");
    expect(renumberProblems("＃ 1回目の転倒").text).toBe("＃1 1回目の転倒");
    expect(renumberProblems("＃2型糖尿病").text).toBe("＃1 2型糖尿病");
    expect(renumberProblems("＃1. 心不全\n＃2） 腎不全").text).toBe("＃1 心不全\n＃2 腎不全");
  });

  it("an indented '＃' line is a problem too, keeping its indent", () => {
    expect(renumberProblems("A)\n  ＃高血圧\n　#貧血").text).toBe("A)\n  ＃1 高血圧\n　#貧血");
  });

  it("leaves the half-width '#' of a number alone: at the start of a line (#7 90%狭窄) and inside it (LAD #7)", () => {
    const text = "S) 痛みなし\n#7 90%狭窄\nLAD #7 90%狭窄\nRCA #2 完全閉塞\n#1 尿路感染症\nA) #不要";
    expect(renumberProblems(text, 0)).toEqual({ text, caret: 0 });
    expect(problemBlocks(text)).toEqual([]);
    // Inside a problem's body, a coronary segment number stays as written.
    expect(renumberProblems("＃2 虚血性心疾患\n  LAD #7 90%狭窄\n＃5 高血圧").text).toBe("＃1 虚血性心疾患\n  LAD #7 90%狭窄\n＃2 高血圧");
  });

  it("a caret on a line below moves with the lines above", () => {
    const r = renumberProblems("＃a\n本文", 4);
    expect(r.text).toBe("＃1 a\n本文");
    expect(r.text.slice(r.caret)).toBe("文");
  });

  it("a nurse's focus (＃ or #) keeps its title without the number and an empty frame stays blank", () => {
    expect(parseNote("＃1 転倒\nD) 座り込み\n＃2 不眠\nD) 2時まで覚醒").focus).toEqual([
      { title: "転倒", d: "座り込み" },
      { title: "不眠", d: "2時まで覚醒" },
    ]);
    expect(parseNote("#1 転倒\nD) 座り込み").focus?.[0].title).toBe("転倒");
    expect(parseNote("＃ 1回目の転倒\nD) 座り込み").focus?.[0].title).toBe("1回目の転倒");
    expect(isBlankNote(renumberProblems("＃ \nD) \nAct) \nR) \n").text)).toBe(true);
    expect(isBlankNote("# \nD) \nAct) \nR) \n")).toBe(true);
    // A doctor's SOAP keeps the numbered lines as written.
    expect(noteText(parseNote("A)\n＃1 尿路感染症\n  CRP 改善\n＃2 高血圧\nP) CTRX 継続"))).toBe("A) ＃1 尿路感染症\n  CRP 改善\n＃2 高血圧\nP) CTRX 継続");
  });
});

describe("＃ のブロックの並べ替え", () => {
  const note = "S) 発熱なし\nA)\n＃1 尿路感染症\n  CRP 改善\n\n＃2 高血圧\n  安定\n＃3 貧血\nP) CTRX 継続\n＃1 退院調整\n";

  it("finds the blocks with their lines, split by SOAP marks", () => {
    expect(problemBlocks(note)).toEqual([
      { number: 1, title: "尿路感染症", from: 2, to: 3, segment: 2 },
      { number: 2, title: "高血圧", from: 5, to: 6, segment: 2 },
      { number: 3, title: "貧血", from: 7, to: 7, segment: 2 },
      { number: 4, title: "退院調整", from: 9, to: 9, segment: 3 },
    ]);
  });

  it("moves a block with its body and numbers again; P) stays where it is", () => {
    expect(moveProblem(note, 2, 0)).toBe("S) 発熱なし\nA)\n＃1 貧血\n\n＃2 尿路感染症\n  CRP 改善\n＃3 高血圧\n  安定\nP) CTRX 継続\n＃4 退院調整\n");
    expect(moveProblem(note, 0, 1)).toBe("S) 発熱なし\nA)\n＃1 高血圧\n  安定\n\n＃2 尿路感染症\n  CRP 改善\n＃3 貧血\nP) CTRX 継続\n＃4 退院調整\n");
  });

  it("does not move a block into another SOAP section, or onto itself", () => {
    expect(moveProblem(note, 3, 0)).toBe(note);
    expect(moveProblem(note, 1, 1)).toBe(note);
    expect(moveProblem(note, 9, 0)).toBe(note);
  });
});

describe("枝番", () => {
  it("numbers two depths, siblings and roots, ignoring ordinary body and half-width #", () => {
    const text = "＃肺炎\n  ＃喀痰\n    ＃結果\n  本文\n  ＃血培\n#7 狭窄\n#見出し\n＃高血圧";
    const expected = "＃1 肺炎\n  ＃1-1 喀痰\n    ＃1-1-1 結果\n  本文\n  ＃1-2 血培\n#7 狭窄\n#見出し\n＃2 高血圧";
    expect(renumberProblems(text).text).toBe(expected);
    expect(renumberProblems(expected).text).toBe(expected);
    expect(renumberProblems(expected.replace("  ＃1-2", "＃1-2")).text).toContain("＃2 血培\n#7 狭窄\n#見出し\n＃3 高血圧");
  });
  it("renumbers inserted and deleted children and keeps the caret on the title", () => {
    const text = "＃1 肺炎\n  ＃追加\n  ＃1-1 培養\n＃2 高血圧";
    const result = renumberProblems(text, text.indexOf("培養"));
    expect(result.text).toBe("＃1 肺炎\n  ＃1-1 追加\n  ＃1-2 培養\n＃2 高血圧");
    expect(result.text.slice(result.caret)).toBe("培養\n＃2 高血圧");
    expect(renumberProblems(result.text.replace("  ＃1-1 追加\n", "")).text).toContain("  ＃1-1 培養");
  });
  it("reads written paths even without indent and leaves legacy flat indices available", () => {
    const tree = problemTree("＃1 肺炎\n＃1-1 培養\n＃1-1-1 結果\n＃2 高血圧");
    expect(tree.map((p) => p.path)).toEqual(["1", "2"]);
    expect(tree[0].children[0].title).toBe("培養");
    expect(tree[0].children[0].children[0].path).toBe("1-1-1");
    expect(problemBlocks("＃1 肺炎\n  ＃1-1 培養")[1].number).toBe(2);
    expect(parseNote("＃1 肺炎\nD) 観察\n  ＃1-1 培養\nD) 採取").focus?.map((f) => f.title)).toEqual(["肺炎", "培養"]);
  });
});

describe("＃ の記号を Backspace で消す", () => {
  it("記号の終わりの位置と、記号を外した行", () => {
    expect(problemMarkerEnd("  ＃1-1 ")).toBe(7);
    expect(stripProblemMarker("  ＃1-1 ")).toBe("  ");
    expect(stripProblemMarker("＃2 肺炎")).toBe("肺炎");
    expect(problemMarkerEnd("肺炎")).toBeNull();
  });
});
