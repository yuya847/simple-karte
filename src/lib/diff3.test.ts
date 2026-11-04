import { describe, expect, it } from "vitest";
import { diff3Regions, mapCursor, merge3Text } from "./diff3";

const base = "S) 熱はない\nO) 体温 36.8\nA) 肺炎 改善\nP) 抗菌薬 続行";

describe("記事の三方向マージ（diff3）", () => {
  it("keeps both changes when they are on different lines", () => {
    const a = base.replace("熱はない", "熱はない。咳が少し");
    const b = base.replace("抗菌薬 続行", "抗菌薬 続行、明日採血");
    const r = merge3Text(base, a, b);
    expect(r.text).toBe("S) 熱はない。咳が少し\nO) 体温 36.8\nA) 肺炎 改善\nP) 抗菌薬 続行、明日採血");
    expect(r.conflicts).toBe(0);
    expect(merge3Text(base, b, a).text).toBe(r.text);
  });

  it("merges by character inside a line both changed at different places", () => {
    const a = base.replace("O) 体温 36.8", "O) 体温 36.8 SpO2 97%");
    const b = base.replace("O) 体温 36.8", "O) 血圧 128/76 体温 36.8");
    const r = merge3Text(base, a, b);
    expect(r.text.split("\n")[1]).toBe("O) 血圧 128/76 体温 36.8 SpO2 97%");
    expect(r.conflicts).toBe(0);
  });

  it("puts a's version first and b's after when both changed the same characters, and says so", () => {
    const a = base.replace("36.8", "37.2");
    const b = base.replace("36.8", "36.5");
    const r = merge3Text(base, a, b);
    expect(r.text.split("\n")[1]).toBe("O) 体温 37.25");
    expect(r.conflicts).toBe(1);
  });

  it("takes the one side that changed, the same change on both once, and nothing when nothing changed", () => {
    const a = `${base}\n追記`;
    expect(merge3Text(base, a, base)).toEqual({ text: a, conflicts: 0, changed: true });
    expect(merge3Text(base, base, a)).toEqual({ text: a, conflicts: 0, changed: true });
    expect(merge3Text(base, a, a)).toEqual({ text: a, conflicts: 0, changed: true });
    expect(merge3Text(base, base, base)).toEqual({ text: base, conflicts: 0, changed: false });
  });

  it("handles added and removed lines together", () => {
    const a = "S) 熱はない\nO) 体温 36.8\nP) 抗菌薬 続行"; // A) removed
    const b = `${base}\n（看護師より）夜間良眠`; // a line added at the end
    expect(merge3Text(base, a, b).text).toBe("S) 熱はない\nO) 体温 36.8\nP) 抗菌薬 続行\n（看護師より）夜間良眠");
  });

  it("converges: once one side took the merge in, merging again with the other's text adds nothing twice", () => {
    const a = base.replace("熱はない", "熱はない。咳が少し");
    const b = base.replace("抗菌薬 続行", "抗菌薬 続行、明日採血");
    const merged = merge3Text(base, a, b).text;
    expect(merge3Text(base, merged, b).text).toBe(merged);
    expect(merge3Text(base, a, merged).text).toBe(merged);
    const again = merge3Text(base, merged, `${b}\nもう一行`).text;
    expect(again).toBe(`${merged}\nもう一行`);
  });

  it("names the regions", () => {
    const r = diff3Regions(["x", "y", "z"], ["x", "Y", "z"], ["x", "y", "z", "w"]);
    expect(r.map((x) => x.kind)).toEqual(["stable", "a", "stable", "b"]);
    expect(diff3Regions(["x"], ["x", "p"], ["x", "p"]).map((x) => x.kind)).toEqual(["stable", "both"]);
  });

  it("moves the caret with the text", () => {
    expect(mapCursor("abc def", "abc XYZ def", 2)).toBe(2);
    expect(mapCursor("abc def", "abc XYZ def", 7)).toBe(11);
    expect(mapCursor("abc def", "abc XYZ def", 5)).toBe(9);
    expect(mapCursor("abc OLD def", "abc NEW def", 6)).toBe(7);
    expect(mapCursor("abc def", "ab", 6)).toBe(2);
    expect(mapCursor("same", "same", 9)).toBe(4);
  });
});
