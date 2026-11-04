import { describe, expect, it } from "vitest";
import { validInsurerNumber } from "./insurance";
import { decodeSjis, fromGyymm, mockHenrei, mockName, mockZogen, parseHenrei, parseZogen, returnKind, toGyymm, zogenSummary } from "./returns";
import { encodeSjis } from "./sjis";

const o = { claimMonth: "2026-10", processMonth: "2026-11", hospitalCode: "9900010", hospitalName: "架空総合病院" };

describe("年号区分（別表9）", () => {
  it("reads and writes GYYMM", () => {
    expect(fromGyymm("50810")).toBe("2026-10");
    expect(fromGyymm("42204")).toBe("2010-04");
    expect(fromGyymm("x")).toBeNull();
    expect(toGyymm("2026-11")).toBe("50811");
  });
  it("names the files as the layout does", () => {
    expect(mockName("zogn", "9900010", "14", "2026-11")).toBe("RIzogn1141990001050811.csv");
  });
});

describe("増減点連絡書", () => {
  it("reads the 模擬 file: header, each receipt, 箇所・増減点・事由・請求内容→補正・査定後内容, and the 合計", () => {
    const text = mockZogen(o);
    expect(returnKind(text)).toBe("増減点連絡書");
    const f = parseZogen(text);
    expect(f.problems).toEqual([]);
    expect(f.header).toMatchObject({ month: "2026-10", hospitalCode: "9900010", payer: "医療情報基盤・診療報酬審査支払機構" });
    expect(f.receipts).toHaveLength(3);
    const [a] = f.receipts;
    expect(a).toMatchObject({ receiptNo: "000001", karte: "1000101", kubun: "本外", month: "2026-10" });
    expect(validInsurerNumber(a.insurer)).toBe(true);
    expect(a.items).toEqual([{ kasho: "60", points: -49, jiyu: "B", before: "ＨｂＡ１ｃ　４９×１", after: "" }]);
    expect(a.total).toEqual({ change: -49, claimed: 980, decided: 931 });
  });
  it("carries the receipt over lines that leave items 2–19 out, and joins the lines that go on with an item", () => {
    const text = [
      "1,50810,1,医科,9900010,架空総合病院,,,医療情報基盤・診療報酬審査支払機構",
      "2,診療年月,レセプト番号,受付番号,…",
      "3,,000007,0811-00000007,,,,06149990,,,,,,本入,,,,架空　一郎,90019999,33,,06,-120,BK,1,点滴注射　１２０×１,,,,",
      "3,,,,,,,,,,,,,,,,,,,33,,06,,,1,算定日　０３日,,,,",
      "4,,,,,,,,,,,,,,,,,,,60,,06,+10,G,1,検査　１０×１,,検査　２０×１,,",
      "5,,,,,,,,,,,,,,,,,,,,合計,06,-110,,,１０００,,８９０,,",
      "6,,,,,,,,,,,,,,,,,,,,集計,,,,,,,,,",
    ].join("\r\n");
    const f = parseZogen(text);
    expect(f.receipts).toHaveLength(1);
    expect(f.receipts[0].items).toEqual([
      { kasho: "33", points: -120, jiyu: "BK", before: "点滴注射　１２０×１／算定日　０３日", after: "" },
      { kasho: "60", points: 10, jiyu: "G", before: "検査　１０×１", after: "検査　２０×１" },
    ]);
    const s = zogenSummary([f]);
    expect(s.total).toBe(-110);
    expect(s.byJiyu.map((x) => x.code).sort()).toEqual(["B", "G", "K"]);
    expect(s.byKasho.find((x) => x.code === "33")).toEqual({ code: "33", count: 1, points: -120 });
  });
  it("reads it from Shift_JIS bytes", () => {
    const text = mockZogen(o);
    expect(parseZogen(decodeSjis(encodeSjis(text))).receipts[1].items[0].after).toContain("マッサージ");
  });
});

describe("返戻内訳書", () => {
  it("reads the 模擬 file: 受付番号・請求点数・事由コード・事由", () => {
    const text = mockHenrei(o);
    expect(returnKind(text)).toBe("返戻内訳書");
    const f = parseHenrei(text);
    expect(f.problems).toEqual([]);
    expect(f.receipts[0]).toMatchObject({ uketsuke: "0811-00000201", karte: "1000108", points: 1234, days: 1, code: "L5106", reason: "給付割合の不備です。", month: "2026-10" });
  });
  it("puts the 公費 lines under their receipt", () => {
    const f = parseHenrei(["1,50810,1,医科,9900010,架空,,,機構", "3,,0811-00000001,06149990,本外,,架空　一郎,1,500,,,,,,,L5106,給付割合の不備です。,1,2,", "4,,,21149999,,,,1,500,,,,500,,,,,,,"].join("\r\n"));
    expect(f.receipts[0].kouhi).toEqual(["21149999"]);
  });
});
