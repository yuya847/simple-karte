import { describe, expect, it } from "vitest";
import { mergeTyping, withCarets } from "./coedit";

const base = "S) 熱はない\nO) 体温 36.8\nP) 抗菌薬 続行";

describe("記事の同時編集", () => {
  it("merges what everyone typed in the same order on every page", () => {
    const a = { tab: "tab-b", text: base.replace("熱はない", "熱はない。咳が少し") };
    const b = { tab: "tab-a", text: base.replace("続行", "続行、明日採血") };
    const c = { tab: "tab-c", text: base.replace("36.8", "36.8 SpO2 97%") };
    const merged = mergeTyping(base, [a, b, c]);
    expect(merged).toBe("S) 熱はない。咳が少し\nO) 体温 36.8 SpO2 97%\nP) 抗菌薬 続行、明日採血");
    expect(mergeTyping(base, [c, a, b])).toBe(merged);
    expect(mergeTyping(base, [a])).toBe(a.text);
    expect(mergeTyping(base, [])).toBe(base);
  });

  it("puts each caret where that person's text landed in the merged text", () => {
    const a = { tab: "tab-a", text: "abc XYZ def", cursor: 7 };
    const b = { tab: "tab-b", text: "abc def ghi", cursor: 11 };
    const merged = mergeTyping("abc def", [a, b]);
    expect(merged).toBe("abc XYZ def ghi");
    expect(withCarets(merged, [a, b])).toEqual([{ text: "abc XYZ" }, { caret: "tab-a" }, { text: " def ghi" }, { caret: "tab-b" }]);
    expect(withCarets("xy", [{ tab: "t", text: "xy", cursor: 0 }])).toEqual([{ caret: "t" }, { text: "xy" }]);
    expect(withCarets("xy", [{ tab: "t", text: "xy" }])).toEqual([{ text: "xy" }]);
  });
});
