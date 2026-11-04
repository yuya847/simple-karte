import { describe, expect, it } from "vitest";
import {
  INITIAL_BOOK,
  accidentText,
  accountRows,
  balance,
  countStock,
  disposeLeftover,
  disposeReturned,
  dispenseOral,
  doseOf,
  fileAccident,
  fileNotice,
  mlPerAmpoule,
  oralBlock,
  oralQty,
  receiveSlip,
  receiveStock,
  recordAccident,
  recordBrought,
  returnFromWard,
  slipProblems,
  slipsDue,
  witnessProblem,
  type NarcoticBook,
  type UseSlip,
} from "./narcotic-book";
import type { OrderEntry } from "./types";

let n = 0;
const id = () => `t${++n}`;
const NOW = { day: 0, time: "11:00" };
const MGR = "薬剤師 小林";

const morEntry: OrderEntry = {
  kind: "order",
  id: "o-mor",
  day: 0,
  time: "09:00",
  author: "山本（専攻医）",
  status: "有効",
  order: { type: "injection", items: [{ drugCode: "INJ-MOR10", amount: 5, unit: "mg" }], route: "皮下注", schedule: { kind: "once" }, start: { day: 0, time: "10:00" } },
};
const oxyEntry: OrderEntry = {
  kind: "order",
  id: "o-oxy",
  day: 0,
  time: "09:00",
  author: "山本（専攻医）",
  status: "有効",
  order: { type: "prescription", category: "定期", drugCode: "ORAL-OXC5", amount: 1, unit: "錠", timings: ["朝", "夕"], start: { day: 0, timing: "夕" }, days: 7 },
};

describe("受払簿（残高はコードで数える）", () => {
  it("starts from the 繰越 and the 受入; a 照合 line does not change it", () => {
    expect(balance(INITIAL_BOOK.ledger, "INJ-MOR10")).toBe(15);
    expect(balance(INITIAL_BOOK.ledger, "ORAL-OXC5")).toBe(40);
    const rows = accountRows(INITIAL_BOOK.ledger, "INJ-MOR10");
    expect(rows.map((r) => r.rest)).toEqual([5, 15, 15]);
  });
  it("受入 from the wholesaler needs the product number", () => {
    expect(receiveStock(INITIAL_BOOK, "INJ-MOR10", 10, "", MGR, NOW, id)).toBe(INITIAL_BOOK);
    expect(balance(receiveStock(INITIAL_BOOK, "INJ-MOR10", 10, "M999", MGR, NOW, id).ledger, "INJ-MOR10")).toBe(25);
  });
  it("照合 writes the count and the difference", () => {
    const b = countStock(INITIAL_BOOK, "INJ-MOR10", 14, MGR, NOW, id);
    expect(b.ledger.at(-1)?.note).toContain("差 -1A");
    expect(balance(b.ledger, "INJ-MOR10")).toBe(15);
  });
});

describe("施用票（注射）", () => {
  it("ampoules and mL from the order: 5mg of 10mg/1mL = 1A, 0.5mL", () => {
    expect(mlPerAmpoule("INJ-MOR10")).toBe(1);
    expect(doseOf({ drugCode: "INJ-MOR10", amount: 5, unit: "mg" })).toEqual({ ampoules: 1, ml: 0.5 });
    expect(doseOf({ drugCode: "INJ-MOR10", amount: 15, unit: "mg" })).toEqual({ ampoules: 2, ml: 1.5 });
    expect(doseOf({ drugCode: "INJ-MOR10", amount: 1, unit: "A" })).toEqual({ ampoules: 1, ml: 1 });
  });
  it("施用量＋残量 must equal what was opened", () => {
    const s = { code: "INJ-MOR10", issuedA: 1, usedMl: 0.5, leftMl: 0.5, unusedA: 0 };
    expect(slipProblems(s)).toEqual([]);
    expect(slipProblems({ ...s, leftMl: 0.3 })[0]).toContain("合いません");
    expect(slipProblems({ ...s, issuedA: 2, unusedA: 1 })).toEqual([]);
  });

  const slip: UseSlip = { id: "s1", orderId: "o-mor", patientId: "p1", code: "INJ-MOR10", marKey: "o-mor|600", usedAt: { day: 0, time: "10:05" }, issuedA: 1, usedMl: 0.5, leftMl: 0.5, unusedA: 0, prescriber: "山本（専攻医）", by: "看護師 佐藤", returnedAt: { day: 0, time: "10:20" } };
  const withSlip: NarcoticBook = { ...INITIAL_BOOK, slips: [slip] };

  it("the 払出 is written on the 施用 day, in A, when the pharmacy receives the slip", () => {
    const b = receiveSlip(withSlip, "s1", MGR, NOW, "佐倉 修（90010231）", id);
    const out = b.ledger.at(-1)!;
    expect(out).toMatchObject({ kind: "払出", qty: -1, at: { day: 0, time: "10:05" }, slipId: "s1" });
    expect(out.note).toContain("施用残 0.5mL");
    expect(balance(b.ledger, "INJ-MOR10")).toBe(14);
    expect(receiveSlip(b, "s1", MGR, NOW, "x", id)).toBe(b);
  });
  it("施用残液 is destroyed with a witness other than the 麻薬管理者", () => {
    const b = receiveSlip(withSlip, "s1", MGR, NOW, "佐倉 修", id);
    const outId = b.ledger.at(-1)!.id;
    expect(witnessProblem(MGR, "")).toContain("立会者");
    expect(witnessProblem(MGR, MGR)).toContain("別の職員");
    expect(disposeLeftover(b, outId, MGR, MGR, "放流", NOW)).toBe(b);
    const d = disposeLeftover(b, outId, MGR, "薬剤師 吉田", "放流", NOW);
    expect(d.ledger.at(-1)?.disposal).toMatchObject({ amount: "0.5mL", witness: "薬剤師 吉田" });
  });
  it("lists the 麻薬 doses given that have no slip yet", () => {
    const people = [{ patient: { id: "p1" }, entries: [morEntry, oxyEntry] }];
    const recs = { "o-mor|600": { key: "o-mor|600", orderId: "o-mor", patientId: "p1", status: "実施", at: 600, doneAt: "10:05", by: "看護師 佐藤" } };
    expect(slipsDue(people, recs, INITIAL_BOOK).map((x) => x.key)).toEqual(["o-mor|600"]);
    expect(slipsDue(people, recs, withSlip)).toEqual([]);
  });
});

describe("内服（麻薬処方箋で調剤）", () => {
  it("the amount is 1回量 × 回数 × 日数", () => {
    expect(oralQty(oxyEntry.order as never)?.qty).toBe(14);
  });
  it("is dispensed once, after the 署名 is checked", () => {
    expect(oralBlock(INITIAL_BOOK, oxyEntry, true)).toContain("署名");
    const signed = { ...INITIAL_BOOK, signed: { "o-oxy": { by: MGR, at: NOW } } };
    expect(oralBlock(signed, oxyEntry, false)).toContain("記載事項");
    expect(oralBlock(signed, oxyEntry, true)).toBeNull();
    const b = dispenseOral(signed, oxyEntry, "p1", MGR, NOW, "佐倉 修", id);
    expect(balance(b.ledger, "ORAL-OXC5")).toBe(26);
    expect(oralBlock(b, oxyEntry, true)).toContain("もう払い出しています");
  });
  it("a ward's return goes in （ ） and not into the 残高; its 廃棄 starts the 30-day 廃棄届", () => {
    const b = returnFromWard(INITIAL_BOOK, "ORAL-OXC5", 4, "看護師 佐藤", NOW, "佐倉 修", "o-oxy", id);
    const r = b.ledger.at(-1)!;
    expect(r).toMatchObject({ kind: "返納", qty: 0, paren: 4 });
    expect(balance(b.ledger, "ORAL-OXC5")).toBe(40);
    const d = disposeReturned(b, r.id, MGR, "薬剤師 吉田", "粉砕", NOW);
    expect(d.ledger.at(-1)?.notice).toEqual({ dueDay: 30 });
    expect(fileNotice(d, r.id, 2).ledger.at(-1)?.notice?.filedOn).toBe(2);
  });
});

describe("持参した麻薬（転入院時）", () => {
  it("is written in （ ）, not added to the 残高, once per report", () => {
    const b = recordBrought(INITIAL_BOOK, "ORAL-OXC5", 6, MGR, NOW, "佐倉 修", "rep-1", id);
    expect(b.ledger.at(-1)).toMatchObject({ kind: "持参", qty: 0, paren: 6 });
    expect(balance(b.ledger, "ORAL-OXC5")).toBe(40);
    expect(recordBrought(b, "ORAL-OXC5", 6, MGR, NOW, "佐倉 修", "rep-1", id)).toBe(b);
  });
});

describe("事故届（模擬）", () => {
  it("takes the lost units out at once and notes the 届 in the book", () => {
    const b = recordAccident(INITIAL_BOOK, { code: "INJ-MOR10", qty: 1, kind: "破損・流失", text: "アンプルを落として破損、全量流失", at: NOW, by: MGR }, id);
    expect(balance(b.ledger, "INJ-MOR10")).toBe(14);
    expect(b.ledger.at(-1)?.note).toContain("未提出");
    const f = fileAccident(b, b.accidents[0].id, { day: 0, time: "11:30" });
    expect(f.ledger.at(-1)?.note).toContain("提出 11:30");
  });
  it("the text names the drug, amount and what happened; 盗取 adds the police", () => {
    const t = accidentText({ id: "a", ledgerId: "l", code: "ORAL-OXC5", qty: 2, kind: "盗取", text: "保管庫の数が合わない", at: NOW, by: MGR }, "オキシコンチンTR錠5mg", MGR, "第 2-00316 号", "2026年11月4日");
    expect(t).toContain("数量：2錠");
    expect(t).toContain("警察署");
  });
});
