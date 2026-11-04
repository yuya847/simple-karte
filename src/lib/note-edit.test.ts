import { describe, expect, it } from "vitest";
import { indentLines, toggleMark } from "./note-edit";
import { parseNote } from "./notes";

describe("Tab で字下げ", () => {
  it("puts two spaces at the start of the caret's line and moves the caret with it", () => {
    expect(indentLines("A)\nCRP 改善", 5, 5)).toEqual({ text: "A)\n  CRP 改善", start: 7, end: 7 });
  });

  it("indents every selected line and takes the spaces away again with Shift+Tab", () => {
    const r = indentLines("a\nb\nc", 0, 3);
    expect(r).toEqual({ text: "  a\n  b\nc", start: 2, end: 7 });
    expect(indentLines(r.text, r.start, r.end, true)).toEqual({ text: "a\nb\nc", start: 0, end: 3 });
    // A selection that ends right after a line break leaves the next line alone.
    expect(indentLines("a\nb", 0, 2).text).toBe("  a\nb");
    // Outdent takes a 全角 space or a single space too, and does not go past the line start.
    expect(indentLines("　a\n b", 0, 4, true)).toEqual({ text: "a\nb", start: 0, end: 2 });
  });

  it("indented lines stay in their SOAP section and are not marks", () => {
    const n = parseNote("A)\n  #1 ではない\n  D) ではない\nP) 継続");
    expect(n.soap?.a).toBe("#1 ではない\n  D) ではない");
    expect(n.focus).toBeUndefined();
  });
});

describe("⌘B で太字", () => {
  it("wraps the selection in ** and keeps the inner text selected", () => {
    expect(toggleMark("CRP 改善", 0, 3, "**")).toEqual({ text: "**CRP** 改善", start: 2, end: 5 });
    expect(toggleMark("CRP 改善", 0, 3, "*")).toEqual({ text: "*CRP* 改善", start: 1, end: 4 });
  });

  it("takes the marks off when they are selected or just around the selection", () => {
    expect(toggleMark("**CRP** 改善", 0, 7, "**")).toEqual({ text: "CRP 改善", start: 0, end: 3 });
    expect(toggleMark("**CRP** 改善", 2, 5, "**")).toEqual({ text: "CRP 改善", start: 0, end: 3 });
    // Italic inside bold adds, it does not strip the bold.
    expect(toggleMark("**CRP**", 2, 5, "*").text).toBe("***CRP***");
  });

  it("with nothing selected puts a pair in, and steps over a closing mark", () => {
    expect(toggleMark("改善", 2, 2, "**")).toEqual({ text: "改善****", start: 4, end: 4 });
    expect(toggleMark("**CRP**", 5, 5, "**")).toEqual({ text: "**CRP**", start: 7, end: 7 });
  });
});
