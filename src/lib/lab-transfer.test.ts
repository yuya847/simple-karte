import { describe, expect, it } from "vitest";
import { LAB_RESULT_MIME, hasLabTable, labTransfer, readLabTransfer, selectLabSet } from "./lab-transfer";
import type { LabResult } from "./types";
const patient = { id: "fiction", sex: "男" as const };
const today = { y: 2026, m: 11, d: 6 };
const labs: LabResult[] = [
  { day: 0, time: "08:00", values: { WBC: 6110, Hb: 12, CRP: 4 } },
  { day: -4, time: "09:00", values: { WBC: 10900, Hb: 12.4 } },
];
describe("検査結果を記事に写す", () => {
  it("選んだ項目だけを単位と基準範囲の印つきで写す", () => {
    const p = labTransfer(patient, [labs[0]], ["WBC", "Hb"], today);
    expect(p.text).toBe("11/6 08:00 WBC 6,110 /μL、Hb 12 g/dL↓");
    expect(p.table).toContain("12.0L");
    expect(hasLabTable(p.table)).toBe(true);
    expect(hasLabTable(p.text)).toBe(false);
    expect(p.table).toContain("/μL");
    expect(p.text + p.table).not.toContain("CRP");
  });
  it("複数日付は古い順で、テキストは1回1行、表は日付が列", () => {
    const p = labTransfer(patient, labs, ["WBC", "CRP"], today);
    expect(p.text.split("\n")).toEqual(["11/2 09:00 WBC 10,900 /μL↑", "11/6 08:00 WBC 6,110 /μL、CRP 4 mg/dL↑"]);
    expect(hasLabTable(p.table)).toBe(true);
    const lines = p.table.split("\n");
    expect(lines).toHaveLength(3);
    expect(lines[0].indexOf("11/2")).toBeLessThan(lines[0].indexOf("11/6"));
    expect(lines[1]).toContain("10,900H");
    expect(lines[2]).toContain("—");
  });
  it("全解除や結果なしでは貼らない", () => {
    expect(labTransfer(patient, labs, [], today).text).toBe("");
    expect(labTransfer(patient, [], ["WBC"], today).table).toBe("");
  });
  it("札は実際に表示される項目との共通部分だけを選ぶ", () => {
    expect(selectLabSet(["WBC", "Hb", "CRP"], "血算")).toEqual(["WBC", "Hb"]);
    expect(selectLabSet(["Na", "K", "Cre"], "電解質")).toEqual(["Na", "K"]);
    expect(selectLabSet(["AST", "CRP"], "肝機能")).toEqual(["AST"]);
    expect(selectLabSet(["Cre", "CRP"], "腎機能")).toEqual(["Cre"]);
    expect(selectLabSet(["Cre", "CRP"], "炎症")).toEqual(["CRP"]);
  });
  it("Do のオーダや記事と結果を取り違えない", () => {
    expect(LAB_RESULT_MIME).not.toBe("application/x-simple-karte-do");
    expect(readLabTransfer(JSON.stringify({ kind: "order", entryId: "lab1" }))).toBeNull();
    expect(readLabTransfer(JSON.stringify({ kind: "note", text: "WBC 6110" }))).toBeNull();
    expect(readLabTransfer("invalid")).toBeNull();
    const p = labTransfer(patient, labs, ["WBC"], today);
    expect(readLabTransfer(JSON.stringify(p))).toEqual(p);
  });
});
