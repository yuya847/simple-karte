import { describe, expect, it } from "vitest";
import {
  EMPTY_BANK,
  bagsFor,
  bedsideCheck,
  bloodOf,
  bloodState,
  candidates,
  computerConditions,
  initialBank,
  issueBlocks,
  keepUntil,
  obsPlan,
  reactionCounts,
  returnOutcome,
  stillNeeded,
  txRequests,
  typingProblems,
  unitState,
  usageRecords,
  vitalSymptoms,
  type BloodBank,
  type BloodUnit,
  type TxAdmin,
  type TxRequest,
  type Typing,
} from "./blood-bank";
import type { OrderEntry } from "./types";

const typing = (over: Partial<Typing>): Typing => ({
  id: "t1",
  patientId: "p1",
  sample: { day: 0, time: "06:00" },
  abo: "O",
  rh: "+",
  frontBackMatch: true,
  antibody: "陰性",
  by: "技師 A",
  checkedBy: "技師 B",
  at: { day: 0, time: "08:00" },
  ...over,
});

const order = (id: string, product: "RBC" | "FFP" | "PC", units: number, day = 0, time = "14:00"): OrderEntry => ({
  kind: "order",
  id,
  day: 0,
  time: "09:00",
  author: "医師",
  status: "有効",
  order: { type: "procedure", code: "PROC-TX", schedule: { kind: "once" }, start: { day, time }, tx: { product, units, abo: "A", rh: "+", reason: "Hb 6.5" } },
});

const req = (product: "RBC" | "FFP" | "PC" = "RBC", units = 2): TxRequest => txRequests([{ patient: { id: "p1", name: "架空 太郎" }, room: "512A", entries: [order("o1", product, units)] }])[0];

const unit = (over: Partial<BloodUnit> = {}): BloodUnit => ({
  lot: "SK-1",
  product: "RBC",
  units: 2,
  abo: "A",
  rh: "+",
  expires: { day: 10, time: "23:59" },
  irradiated: true,
  received: { day: 0, time: "07:00", by: "技師 A" },
  ...over,
});

const confirmedA = bloodState({ abo: "A", rh: "+", checks: 2, antibody: "陰性" }, []);

describe("blood type: two samples, two technologists", () => {
  it("counts the record's checks and a new sample at another time", () => {
    const s = bloodState({ abo: "O", rh: "+", checks: 1 }, [typing({})]);
    expect(s.samples).toBe(2);
    expect(s.confirmed).toBe(true);
    expect(s.antibody).toBe("陰性");
    expect(bloodOf({ abo: "O", rh: "+", checks: 1 }, [typing({})])).toEqual({ abo: "O", rh: "+", checks: 2, antibody: "陰性" });
  });
  it("does not count the same sample twice", () => {
    const s = bloodState(undefined, [typing({ id: "a" }), typing({ id: "b" })]);
    expect(s.samples).toBe(1);
    expect(s.confirmed).toBe(false);
    expect(bloodState(undefined, [typing({ id: "a" }), typing({ id: "b", sample: { day: -1, time: "10:00" } })]).confirmed).toBe(true);
  });
  it("a typing that disagrees, or front and back that do not match, stops the type", () => {
    const s = bloodState({ abo: "O", rh: "+", checks: 1 }, [typing({ abo: "A" })]);
    expect(s.confirmed).toBe(false);
    expect(s.conflict).toContain("一致しません");
    expect(bloodOf({ abo: "O", rh: "+", checks: 1 }, [typing({ abo: "A" })])).toEqual({ abo: "O", rh: "+", checks: 1 });
    expect(bloodState(undefined, [typing({ frontBackMatch: false })]).conflict).toContain("オモテ検査とウラ検査");
  });
  it("keeps an antibody found before even when a later screen is negative", () => {
    const s = bloodState(undefined, [typing({ antibody: "陽性", antibodyName: "抗E", sample: { day: -2, time: "06:00" } }), typing({ id: "t2" })]);
    expect(s.antibody).toBe("陰性");
    expect(s.antibodies).toEqual(["抗E"]);
  });
  it("needs a second, different technologist and a sample time not in the future", () => {
    expect(typingProblems({ by: "A", checkedBy: "", sample: { day: 0, time: "06:00" } }, 600)).toHaveLength(1);
    expect(typingProblems({ by: "A", checkedBy: "A", sample: { day: 0, time: "06:00" } }, 600)[0]).toContain("別の技師");
    expect(typingProblems({ by: "A", checkedBy: "B", sample: { day: 0, time: "12:00" } }, 600)[0]).toContain("今より後");
    expect(typingProblems({ by: "A", checkedBy: "B", sample: { day: 0, time: "06:00" } }, 600)).toEqual([]);
  });
});

describe("orders, bags and assignment", () => {
  it("reads PROC-TX orders and leaves stopped ones out", () => {
    const stopped = { ...order("o2", "FFP", 2), status: "中止" as const };
    const r = txRequests([{ patient: { id: "p1", name: "架空 太郎" }, room: "512A", entries: [order("o1", "RBC", 2), stopped] }]);
    expect(r.map((x) => x.entry.id)).toEqual(["o1"]);
    expect(r[0].at).toBe(14 * 60);
  });
  it("splits 4 units of red cells and 6 of plasma into bags", () => {
    expect(bagsFor("RBC", 4)).toEqual([2, 2]);
    expect(bagsFor("FFP", 6)).toEqual([2, 4]);
    expect(bagsFor("PC", 10)).toEqual([10]);
    expect(stillNeeded(req("RBC", 4), [unit({ units: 2 })])).toEqual([2]);
  });
  it("offers bags of the patient's type, good until the start, the nearest expiry first", () => {
    const bank: BloodBank = { ...EMPTY_BANK, units: [unit({ lot: "late", expires: { day: 20, time: "23:59" } }), unit({ lot: "soon", expires: { day: 3, time: "23:59" } }), unit({ lot: "O", abo: "O" }), unit({ lot: "old", expires: { day: 0, time: "10:00" } }), unit({ lot: "FFP", product: "FFP", irradiated: false })] };
    expect(candidates(bank, req(), confirmedA, 9 * 60).map((u) => u.lot)).toEqual(["soon", "late"]);
  });
  it("tells the state of a bag", () => {
    const admins: Record<string, TxAdmin> = {};
    expect(unitState(unit(), admins, 0)).toBe("在庫");
    expect(unitState(unit({ expires: { day: -1, time: "23:59" } }), admins, 0)).toBe("期限切れ");
    expect(unitState(unit({ assigned: { day: 0, time: "09:00", orderId: "o1", patientId: "p1", by: "A" } }), admins, 0)).toBe("割付済み");
    expect(unitState(unit({ discarded: { day: 0, time: "09:00", by: "A", reason: "破損" } }), admins, 0)).toBe("廃棄");
  });
});

describe("crossmatch and issue", () => {
  const cm = { method: "間接抗グロブリン試験" as const, sample: { day: 0, time: "06:00" }, major: "適合" as const, by: "A", at: { day: 0, time: "08:00" } };
  it("red cells need a compatible crossmatch on a sample from the last 3 days", () => {
    expect(issueBlocks(unit(), req(), confirmedA, 600)).toContain("交差適合試験の結果がありません。");
    expect(issueBlocks(unit({ crossmatch: cm }), req(), confirmedA, 600)).toEqual([]);
    expect(issueBlocks(unit({ crossmatch: { ...cm, major: "不適合" } }), req(), confirmedA, 600).join()).toContain("不適合");
    expect(issueBlocks(unit({ crossmatch: { ...cm, sample: { day: -3, time: "06:00" } } }), req(), confirmedA, 600).join()).toContain("3日以内ではありません");
  });
  it("plasma and platelets need no crossmatch; another type or an expired bag stops", () => {
    expect(issueBlocks(unit({ product: "FFP", irradiated: false }), req("FFP", 2), confirmedA, 600)).toEqual([]);
    expect(issueBlocks(unit({ product: "FFP", abo: "B", irradiated: false }), req("FFP", 2), confirmedA, 600).join()).toContain("同じ型ではありません");
    expect(issueBlocks(unit({ product: "PC", units: 10, expires: { day: 0, time: "08:00" } }), req("PC", 10), confirmedA, 600).join()).toContain("有効期限");
  });
  it("one check of the blood type is not enough", () => {
    const once = bloodState({ abo: "A", rh: "+", checks: 1, antibody: "陰性" }, []);
    expect(issueBlocks(unit({ crossmatch: cm }), req(), once, 600).join()).toContain("確認が1回");
  });
  it("lists the conditions of a computer crossmatch", () => {
    const fresh = bloodState({ abo: "A", rh: "+", checks: 1 }, [typing({ abo: "A" })]);
    const conds = computerConditions(fresh, unit(), { day: 0, time: "06:00" }, 14 * 60);
    expect(conds.map((c) => c.ok)).toEqual([true, true, true, false, true]);
    const ok = computerConditions(fresh, unit({ aboChecked: { day: 0, time: "07:30", by: "A" } }), { day: 0, time: "06:00" }, 14 * 60);
    expect(ok.every((c) => c.ok)).toBe(true);
  });
  it("a patient with an antibody needs an antigen-negative bag", () => {
    const ab = bloodState({ abo: "A", rh: "+", checks: 2 }, [typing({ abo: "A", antibody: "陽性", antibodyName: "抗E" })]);
    expect(issueBlocks(unit({ crossmatch: cm }), req(), ab, 600).join()).toContain("抗E");
    expect(issueBlocks(unit({ crossmatch: { ...cm, antigenNegative: true } }), req(), ab, 600)).toEqual([]);
  });
});

describe("at the bedside", () => {
  const issued = unit({ assigned: { day: 0, time: "09:00", orderId: "o1", patientId: "p1", by: "A" }, crossmatch: { method: "間接抗グロブリン試験", sample: { day: 0, time: "06:00" }, major: "適合", by: "A", at: { day: 0, time: "08:00" } }, issued: { day: 0, time: "13:50", by: "A", to: "看護師 B" } });
  const bank: BloodBank = { ...EMPTY_BANK, units: [issued] };
  const base = { req: req(), blood: confirmedA, bank, by: "看護師 佐藤", second: "看護師 田中", appearanceOk: true, nowAbs: 14 * 60 };
  it("passes with the right wristband, the bag of this order and two people", () => {
    const r = bedsideCheck({ ...base, wristband: "p1", bag: "SK-1" });
    expect(r.ok).toBe(true);
    expect(r.lines.map((l) => l.text).join("\n")).toContain("払出から 10分");
  });
  it("stops another patient's wristband, an unknown bag and a single person", () => {
    expect(bedsideCheck({ ...base, wristband: "p2", bag: "SK-1" }).lines[0].text).toContain("リストバンドが違います");
    expect(bedsideCheck({ ...base, wristband: "p1", bag: "SK-9" }).lines.some((l) => l.text.includes("記録にありません"))).toBe(true);
    expect(bedsideCheck({ ...base, wristband: "p1", bag: "SK-1", second: "看護師 佐藤" }).ok).toBe(false);
    expect(bedsideCheck({ ...base, wristband: "p1", bag: "SK-1", appearanceOk: false }).ok).toBe(false);
  });
  it("plans observation at 5 and 15 minutes after the start", () => {
    const a: TxAdmin = { lot: "SK-1", orderId: "o1", patientId: "p1", check: { day: 0, time: "14:00", by: "A", second: "B", wristband: "p1", bag: "SK-1", appearanceOk: true }, start: { day: 0, time: "14:02", by: "A" }, obs: [{ point: "開始前", day: 0, time: "13:58", by: "A", symptoms: [] }] };
    const plan = obsPlan(a, 14 * 60 + 10);
    expect(plan.map((p) => [p.point, p.due, p.state])).toEqual([
      ["開始前", null, "済み"],
      ["開始5分", 847, "時刻を過ぎた"],
      ["開始15分", 857, "これから"],
      ["終了時", null, "これから"],
    ]);
  });
  it("reads symptoms off the vital signs by the society's definitions", () => {
    expect(vitalSymptoms({ bt: 36.8, sbp: 128, hr: 80 }, { bt: 38.2, sbp: 96, hr: 112 }, true).map((x) => x.symptom)).toEqual(["発熱", "血圧低下", "動悸・頻脈"]);
    expect(vitalSymptoms({ bt: 38.4 }, { bt: 38.9 }, true)).toEqual([]);
    expect(vitalSymptoms({ bt: 38.4 }, { bt: 39.4 }, true)[0].why).toContain("1℃以上の上昇");
    expect(vitalSymptoms(undefined, { hr: 120 }, false)).toEqual([]);
  });
});

describe("returns, disposal and records", () => {
  const out = unit({ issued: { day: 0, time: "10:00", by: "A", to: "B" } });
  it("red cells back within 60 minutes go back to stock; otherwise they are discarded", () => {
    expect(returnOutcome(out, 10 * 60 + 45, true).outcome).toBe("在庫に戻した");
    expect(returnOutcome(out, 11 * 60 + 5, true)).toMatchObject({ outcome: "廃棄", minutesOut: 65 });
    expect(returnOutcome(out, 10 * 60 + 20, false).outcome).toBe("廃棄");
    expect(returnOutcome({ ...out, product: "FFP" }, 10 * 60 + 10, true).outcome).toBe("廃棄");
  });
  it("keeps the record for 20 years from the day of use", () => {
    expect(keepUntil({ y: 2026, m: 11, d: 4 })).toEqual({ y: 2046, m: 11, d: 4 });
    expect(keepUntil({ y: 2028, m: 2, d: 29 })).toEqual({ y: 2048, m: 2, d: 28 });
  });
  it("makes one record per bag transfused and says what is missing", () => {
    const bank: BloodBank = {
      ...EMPTY_BANK,
      units: [unit()],
      admins: { "SK-1": { lot: "SK-1", orderId: "o1", patientId: "p1", check: { day: 0, time: "14:00", by: "A", second: "B", wristband: "p1", bag: "SK-1", appearanceOk: true }, start: { day: 0, time: "14:02", by: "A" }, obs: [], reaction: { day: 0, time: "14:20", symptoms: ["発熱", "発疹・蕁麻疹"], onsetMin: 18, action: "中止", by: "A", bagKept: true } } },
    };
    const r = usageRecords(bank, () => ({ name: "架空 太郎" }), { y: 2026, m: 11, d: 4 });
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ lot: "SK-1", name: "架空 太郎", missing: ["住所"], reaction: true, keep: { y: 2046, m: 11, d: 4 } });
    const counts = reactionCounts(bank);
    expect(counts[0]).toMatchObject({ product: "RBC", bags: 1, reactions: 1, symptoms: { 発熱: 1, "発疹・蕁麻疹": 1 } });
  });
  it("starts with fictional stock, one bag already past its expiry", () => {
    const b = initialBank(9 * 60);
    expect(b.units.length).toBeGreaterThan(10);
    expect(b.units.filter((u) => unitState(u, b.admins, 9 * 60) === "期限切れ").map((u) => u.lot)).toEqual(["SK2610-0098"]);
    expect(b.units.every((u) => u.lot.startsWith("SK"))).toBe(true);
  });
});
