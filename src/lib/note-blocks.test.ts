import { isDividerLine, isSectionHeadingLine, indentBlock } from "./note-blocks";
import { describe, expect, it } from "vitest";
import { fromLines, isHeadingLine, joinWithNext, joinWithPrevious, moveLines, movedLine, nudgeLine, offsetOf, posOf, replaceLine, splitLine, toLines, unitAt } from "./note-blocks";
import { formFrame } from "./notes";

describe("記事の文字列と行の往復", () => {
  it("keeps line breaks, empty lines and a trailing line break", () => {
    for (const text of ["", "\n", "S)\nO)\nA)\nP)\n", "a\n\n\nb", "  字下げ\n\n", formFrame("フォーカス（DAR）", "10:00"), formFrame("経時記録", "10:15")]) {
      expect(fromLines(toLines(text))).toBe(text);
    }
    expect(toLines("S)\nO)\n")).toEqual(["S)", "O)", ""]);
  });

  it("maps an offset to a line and column and back", () => {
    const text = "S) 痛み\nO)\nA) ＃1 尿路感染症";
    expect(posOf(text, 0)).toEqual({ line: 0, col: 0 });
    expect(posOf(text, 5)).toEqual({ line: 0, col: 5 });
    expect(posOf(text, 6)).toEqual({ line: 1, col: 0 });
    expect(posOf(text, text.length)).toEqual({ line: 2, col: 11 });
    expect(offsetOf(text, { line: 1, col: 0 })).toBe(6);
    expect(offsetOf(text, { line: 2, col: 99 })).toBe(text.length);
    expect(offsetOf(text, { line: 9, col: 0 })).toBe(text.lastIndexOf("\n") + 1);
    expect(posOf(text, 999).line).toBe(2);
  });
});

describe("行の操作", () => {
  it("Enter splits the line and keeps the indent; on a ＃ line the next ＃ comes (like a numbered list)", () => {
    const r = splitLine("A)\n＃1 尿路感染症", 1, 9);
    expect(r.text).toBe("A)\n＃1 尿路感染症\n＃ ");
    expect(r.text.slice(r.caret)).toBe("");
    // Enter on an empty "＃n" ends the list: the marker goes and the line is the body of the problem above.
    const end = splitLine("＃1 尿路感染症\n＃2 ", 1, 4);
    expect(end.text).toBe("＃1 尿路感染症\n  ");
    // The same at a deeper level: "＃1-1" Enter → "＃" at that level.
    expect(splitLine("＃1 a\n  ＃1-1 b", 1, 9).text).toBe("＃1 a\n  ＃1-1 b\n  ＃ ");
    const mid = splitLine("  CRP 改善 継続", 0, 8);
    expect(mid.text).toBe("  CRP 改善\n  継続");
    expect(mid.text.slice(mid.caret)).toBe("継続");
    // An indent-only line loses its indent (stepping back out of the body).
    expect(splitLine("＃1 a\n  ", 1, 2).text).toBe("＃1 a\n\n");
    // Enter in the middle of the text of a ＃ line: the rest goes down as the next problem.
    const head = splitLine("＃1 尿路感染症 CRP", 0, 8);
    expect(head.text).toBe("＃1 尿路感染症\n＃ CRP");
  });

  it("Backspace at the start joins the line to the one above; Delete at the end pulls the next one up", () => {
    const r = joinWithPrevious("S) 痛み\n\nO)", 1);
    expect(r.text).toBe("S) 痛み\nO)");
    expect(r.caret).toBe(5);
    const r2 = joinWithPrevious("S) 痛み\nなし", 1);
    expect(r2.text).toBe("S) 痛みなし");
    expect(r2.caret).toBe(5);
    expect(joinWithPrevious("S)\nO)", 0).text).toBe("S)\nO)");
    expect(joinWithNext("S)\nO)", 0)).toEqual({ text: "S)O)", caret: 2 });
    expect(joinWithNext("S)", 0)).toEqual({ text: "S)", caret: 2 });
  });

  it("a pasted text with line breaks makes more lines, the caret after the pasted part", () => {
    const r = replaceLine("S)\nO)\nA)", 1, "O) BT 37.6\nSpO2 96%", 19);
    expect(r.text).toBe("S)\nO) BT 37.6\nSpO2 96%\nA)");
    expect(r.text.slice(r.caret)).toBe("\nA)");
    expect(replaceLine("a\nb", 0, "ab", 1).caret).toBe(1);
  });

  it("a ＃ line's unit is its block; any other line moves alone", () => {
    const text = "A)\n＃1 尿路感染症\n  CRP 改善\n\n＃2 高血圧\nP) 継続";
    expect(unitAt(text, 1)).toEqual({ from: 1, to: 2, problem: true, index: 0 });
    expect(unitAt(text, 2)).toEqual({ from: 2, to: 2, problem: false, index: -1 });
    expect(unitAt(text, 4)).toEqual({ from: 4, to: 4, problem: true, index: 1 });
  });

  it("a drop moves the lines before the target line and numbers the ＃ lines again", () => {
    const text = "A)\n＃1 尿路感染症\n  CRP 改善\n＃2 高血圧\n＃3 貧血\nP)";
    expect(moveLines(text, 3, 3, 1)).toBe("A)\n＃1 高血圧\n＃2 尿路感染症\n  CRP 改善\n＃3 貧血\nP)");
    expect(moveLines(text, 1, 2, 5)).toBe("A)\n＃1 高血圧\n＃2 貧血\n＃3 尿路感染症\n  CRP 改善\nP)");
    expect(moveLines(text, 1, 2, 6)).toBe("A)\n＃1 高血圧\n＃2 貧血\nP)\n＃3 尿路感染症\n  CRP 改善");
    // Onto itself (just before or just after): nothing changes.
    expect(moveLines(text, 1, 2, 1)).toBe(text);
    expect(moveLines(text, 1, 2, 3)).toBe(text);
    expect(movedLine(3, 3, 1)).toBe(1);
    expect(movedLine(1, 2, 5)).toBe(3);
    expect(movedLine(1, 2, 2)).toBe(1);
  });

  it("Alt+↑↓ moves a ＃ block past the next problem (gaps kept) and a plain line past the next line", () => {
    const text = "A)\n＃1 尿路感染症\n  CRP 改善\n\n＃2 高血圧\n  安定\nP) 継続";
    const down = nudgeLine(text, 1, 3, 1);
    expect(down.text).toBe("A)\n＃1 高血圧\n  安定\n\n＃2 尿路感染症\n  CRP 改善\nP) 継続");
    expect(down.text.slice(down.caret)).toBe("尿路感染症\n  CRP 改善\nP) 継続");
    const up = nudgeLine(down.text, 4, 0, -1);
    expect(up.text).toBe(text);
    // The first problem cannot go further up; a problem does not cross P).
    expect(nudgeLine(text, 1, 0, -1).text).toBe(text);
    expect(nudgeLine(text, 4, 0, 1).text).toBe(text);
    // A body line swaps with the line next to it.
    const line = nudgeLine(text, 2, 2, 1);
    expect(line.text).toBe("A)\n＃1 尿路感染症\n\n  CRP 改善\n＃2 高血圧\n  安定\nP) 継続");
    expect(line.text.slice(line.caret)).toBe("CRP 改善\n＃2 高血圧\n  安定\nP) 継続");
    expect(nudgeLine("S)\nO)", 0, 0, -1).text).toBe("S)\nO)");
    expect(nudgeLine("S)\nO)", 1, 0, 1).text).toBe("S)\nO)");
  });

  it("knows the heading lines: ＃, S) O) A) P), D) Act) R), the 経時記録 head and hh:mm lines", () => {
    for (const l of ["＃1 尿路感染症", "# 転倒", "# ", "S) 痛み", "p)", "D) 座り込み", "Act) 報告", "R) ", "【経時記録】", "09:30 訪室", "9:05"]) {
      expect(isHeadingLine(l), l).toBe(true);
    }
    for (const l of ["  CRP 改善", "LAD #7 90%狭窄", "#7 90%狭窄", "Sodium 140", "12:30:00 は時刻ではなく", ""]) {
      expect(isHeadingLine(l), l).toBe(false);
    }
  });
});

it("Tab makes a child, Shift+Tab restores roots, and moves renumber children", () => {
  const text = "＃1 肺炎\n＃2 培養\n＃3 高血圧";
  const child = indentBlock(text, 1, 3, 5);
  expect(child.text).toBe("＃1 肺炎\n  ＃1-1 培養\n＃2 高血圧");
  expect(child.text.slice(child.start, child.end)).toBe("培養");
  expect(indentBlock(child.text, 1, 7, 9, true).text).toBe(text);
  const nested = indentBlock("＃1 肺炎\n  ＃1-1 培養\n  ＃1-2 結果", 2, 7);
  expect(nested.text).toContain("    ＃1-1-1 結果");
  const siblings = "＃1 肺炎\n  ＃1-1 喀痰\n  ＃1-2 血培\n＃2 高血圧";
  const moved = "＃1 肺炎\n  ＃1-1 血培\n  ＃1-2 喀痰\n＃2 高血圧";
  expect(moveLines(siblings, 2, 2, 1)).toBe(moved);
  expect(nudgeLine(siblings, 2, 7, -1).text).toBe(moved);
});


it("recognizes only whole divider lines, normalizes input and moves them alone", () => {
  for (const line of ["---", "―――", "  ---  ", "\t―――"]) expect(isDividerLine(line)).toBe(true);
  for (const line of ["--", "----", "――", "――――", "文---", "--- 文", "", "ー ー ー"]) expect(isDividerLine(line)).toBe(false);
  const text = replaceLine("S)\n\nO)", 1, "―――").text;
  expect(text).toBe("S)\n---\nO)");
  expect(unitAt(text, 1)).toMatchObject({ from: 1, to: 1, problem: false });
  expect(moveLines(text, 1, 1, 3)).toBe("S)\nO)\n---");
  expect(replaceLine(text, 1, "").text).toBe("S)\n\nO)");
  expect(replaceLine("", 0, "S)\n―――\nO)").text).toBe(text);
});

it("separates section labels from problem headings and individual times", () => {
  for (const line of ["S)", " O) 所見", "A)", "P)", "D)", "Act)", "R)", "【経時記録】"]) expect(isSectionHeadingLine(line)).toBe(true);
  for (const line of ["＃1 肺炎", "# 転倒", "09:30 訪室", "---", "Sodium"]) expect(isSectionHeadingLine(line)).toBe(false);
});

describe("soapMark", () => {
  it("full-width marks from the Japanese input become S) O) A) P)", async () => {
    const { soapMark, replaceLine } = await import("./note-blocks");
    expect(soapMark("Ｓ）頭痛")).toBe("S)頭痛");
    expect(soapMark("O）")).toBe("O)");
    expect(soapMark("  Ａ) x")).toBe("  A) x");
    expect(soapMark("S と書く")).toBe("S と書く");
    expect(replaceLine("x", 0, "Ｐ）経過観察").text).toBe("P)経過観察");
  });
});

describe("check boxes", () => {
  it("[] becomes a box, Enter goes on, an empty box ends the list, a click ticks it", async () => {
    const { checkMark, splitLine, toggleCheck, replaceLine } = await import("./note-blocks");
    expect(checkMark("[] 採血")).toBe("☐ 採血");
    expect(checkMark("［］採血")).toBe("☐ 採血");
    expect(checkMark("  [x] 済")).toBe("  ☑ 済");
    expect(replaceLine("a", 0, "[]").text).toBe("☐ ");
    expect(splitLine("☐ 採血", 0, 4).text).toBe("☐ 採血\n☐ ");
    expect(splitLine("☐ ", 0, 2).text).toBe("");
    expect(toggleCheck("☐ 採血")).toBe("☑ 採血");
    expect(toggleCheck("☑ 採血")).toBe("☐ 採血");
  });
});
