import { describe, expect, it } from "vitest";
import { boxFrom, boxSelection, edgeScroll, hitKeys, inTimeOrder, movedFrom, overlaps, sameKeys, toggleKey } from "./record-select";

describe("囲んで選ぶ（四角とカード）", () => {
  it("押した所と今の所から四角を作る（どちらへ動かしても）", () => {
    expect(boxFrom({ x: 50, y: 80 }, { x: 10, y: 20 })).toEqual({ left: 10, top: 20, right: 50, bottom: 80 });
  });
  it("四角に重なったカードだけを、並びの順に1回ずつ選ぶ（辺が触れるだけは選ばない）", () => {
    const card = (key: string, top: number) => ({ key, box: { left: 0, top, right: 400, bottom: top + 100 } });
    const cards = [card("a", 0), card("b", 110), card("c", 220), card("b", 110)];
    expect(hitKeys({ left: 380, top: 50, right: 420, bottom: 150 }, cards)).toEqual(["a", "b"]);
    expect(hitKeys({ left: 400, top: 0, right: 450, bottom: 400 }, cards)).toEqual([]);
    expect(overlaps({ left: 0, top: 0, right: 10, bottom: 10 }, { left: 10, top: 0, right: 20, bottom: 10 })).toBe(false);
  });
  it("⌘・Shift を押して囲むと前の選択に足す。押さないと囲んだものだけ", () => {
    expect(boxSelection(["a"], ["b", "a"], true)).toEqual(["a", "b"]);
    expect(boxSelection(["a"], ["b"], false)).toEqual(["b"]);
  });
  it("⌘・Shift ＋クリックで1件ずつ足す・外す", () => {
    expect(toggleKey(["a", "b"], "c")).toEqual(["a", "b", "c"]);
    expect(toggleKey(["a", "b"], "a")).toEqual(["b"]);
    expect(sameKeys(["a"], ["a"])).toBe(true);
    expect(sameKeys(["a"], ["b"])).toBe(false);
  });
  it("少し動いてから四角になる（クリックとは分ける）", () => {
    expect(movedFrom({ x: 0, y: 0 }, { x: 3, y: 3 })).toBe(false);
    expect(movedFrom({ x: 0, y: 0 }, { x: 0, y: 6 })).toBe(true);
  });
  it("一覧の上下の端では、端に近いほど速く自動でスクロールする", () => {
    expect(edgeScroll(300, 100, 600)).toBe(0);
    expect(edgeScroll(110, 100, 600)).toBeLessThan(0);
    expect(edgeScroll(590, 100, 600)).toBeGreaterThan(0);
    expect(edgeScroll(50, 100, 600)).toBe(-18);
    expect(edgeScroll(700, 100, 600)).toBe(18);
    expect(Math.abs(edgeScroll(125, 100, 600))).toBeLessThan(Math.abs(edgeScroll(101, 100, 600)));
  });
});

describe("選んだ記録の時刻の順", () => {
  it("日、時刻の順（古い順）。同じ時刻は並びのまま", () => {
    const items = [
      { id: "今日10時", day: 0, time: "10:00" },
      { id: "昨日", day: -1, time: "23:00" },
      { id: "今日8時", day: 0, time: "08:00" },
      { id: "今日8時の2", day: 0, time: "08:00" },
    ];
    expect(inTimeOrder(items).map((x) => x.id)).toEqual(["昨日", "今日8時", "今日8時の2", "今日10時"]);
    expect(items[0].id).toBe("今日10時");
  });
});
