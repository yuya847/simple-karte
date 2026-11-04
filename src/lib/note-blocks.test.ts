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
  it("Enter splits the line and keeps the indent; under a ＃ line the new line is indented one step", () => {
    const r = splitLine("A)\n＃1 尿路感染症", 1, 9);
    expect(r.text).toBe("A)\n＃1 尿路感染症\n  ");
    expect(r.text.slice(r.caret)).toBe("");
    const mid = splitLine("  CRP 改善 継続", 0, 8);
    expect(mid.text).toBe("  CRP 改善\n  継続");
    expect(mid.text.slice(mid.caret)).toBe("継続");
    // An indent-only line loses its indent (stepping back out of the body).
    expect(splitLine("＃1 a\n  ", 1, 2).text).toBe("＃1 a\n\n");
    // Enter in the middle of the text of a ＃ line: the rest goes down as the body.
    const head = splitLine("＃1 尿路感染症 CRP", 0, 8);
    expect(head.text).toBe("＃1 尿路感染症\n  CRP");
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
