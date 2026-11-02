import { describe, expect, it } from "vitest";
import { allowedKasan, haihan, hokatsuChild, hokatsuGroups, kaisuLimits, nyuinGroup } from "./tables";

// Codes and expected relations checked against the 医科電子点数表 (令和8年度版).
const 急性期一般入院料４ = "190199910";

describe("入院基本料テーブル", () => {
  it("急性期一般入院料４ is group 124", () => {
    expect(nyuinGroup(急性期一般入院料４)).toBe("124");
  });

  it("allows the 加算 of the reference hospital and keeps alternatives exclusive", () => {
    const k = allowedKasan(急性期一般入院料４);
    expect(k.has("190147310")).toBe(true); // 感染対策向上加算２
    expect(k.has("190120510")).toBe(true); // 医療安全対策加算１
    expect(k.has("190218510")).toBe(true); // せん妄ハイリスク患者ケア加算
    // 診療録管理体制加算１ and ２ share a 加算識別: only one of them
    expect(k.get("190832110")).toBe(k.get("190832210"));
  });
});

describe("算定回数テーブル", () => {
  it("one 入院料 a day", () => {
    expect(kaisuLimits(急性期一般入院料４)).toEqual([{ unit: "121", limit: 1, tokurei: false }]);
  });

  it("感染対策向上加算２ on the first day only", () => {
    expect(kaisuLimits("190147310")).toEqual([{ unit: "132", limit: 1, tokurei: false }]);
  });

  it("判断料 once a month", () => {
    expect(kaisuLimits("160061810")).toContainEqual({ unit: "131", limit: 1, tokurei: false });
  });
});

describe("背反テーブル", () => {
  it("認知症ケア加算 wins over せん妄ハイリスク患者ケア加算 on the same day", () => {
    const r = haihan("day", "190218510", "190193110");
    expect(r?.kubun).toBe(2);
  });

  it("点滴注射 and 静脈内注射 on the same day: one of them, chosen by a person", () => {
    expect(haihan("day", "130003810", "130003510")?.kubun).toBe(3);
  });
});

describe("包括テーブル", () => {
  it("急性期一般入院料４ absorbs nothing", () => {
    expect(hokatsuGroups(急性期一般入院料４)).toEqual([]);
  });

  it("an インキュベーター day absorbs 酸素吸入 (the guide's own example)", () => {
    const g = hokatsuGroups("140028410");
    expect(g).toContainEqual({ unit: "1", group: "J028001" });
    expect(hokatsuChild("J028001", "140005610")).toEqual({ tokurei: false });
  });
});
