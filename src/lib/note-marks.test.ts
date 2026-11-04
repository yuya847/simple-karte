import { describe, expect, it } from "vitest";
import { hasMarks, markLines, markParts } from "./note-marks";

describe("記事の描き方（太字・斜体・見出し）", () => {
  it("reads **bold**, *italic* and ***both*** out of a line", () => {
    expect(markParts("CRP **改善**、*軽度* の痛み")).toEqual([
      { kind: "text", text: "CRP " },
      { kind: "b", text: "改善" },
      { kind: "text", text: "、" },
      { kind: "i", text: "軽度" },
      { kind: "text", text: " の痛み" },
    ]);
    expect(markParts("***大事***")).toEqual([{ kind: "bi", text: "大事" }]);
    expect(markParts("3 * 4 = 12")).toEqual([{ kind: "text", text: "3 * 4 = 12" }]);
    expect(markParts("")).toEqual([]);
  });

  it("a '#1 …' line is a heading; other lines are not", () => {
    const lines = markLines("A)\n#1 尿路感染症\n  CRP **改善**");
    expect(lines.map((l) => l.heading)).toEqual([false, true, false]);
    expect(lines[1].parts).toEqual([{ kind: "text", text: "#1 尿路感染症" }]);
    expect(lines[2].parts[1]).toEqual({ kind: "b", text: "改善" });
  });

  it("knows when there is nothing to draw differently", () => {
    expect(hasMarks("S) 痛みなし")).toBe(false);
    expect(hasMarks("S) **痛みなし**")).toBe(true);
    expect(hasMarks("A)\n#1 心不全")).toBe(true);
  });
});
