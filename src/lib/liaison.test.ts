import { describe, expect, it } from "vitest";
import {
  EMPTY_LIAISON,
  FACILITIES,
  facilityByName,
  fromEr,
  fromLetters,
  fromOpd,
  ledgerRow,
  liaisonHistory,
  monthPeriods,
  rateCounts,
  referralRates,
  REPLY_DAYS,
  todayVisits,
  unanswered,
  type Referral,
} from "./liaison";

const ref = (x: Partial<Referral>): Referral => ({
  id: "r1",
  direction: "紹介",
  facilityId: "f01",
  patient: { name: "架空 太郎" },
  department: "総合診療科",
  doctor: "山本（専攻医）",
  letterDay: -3,
  visitDay: -2,
  firstVisit: true,
  ambulance: false,
  reason: "精査",
  source: "台帳に記録",
  ...x,
});

describe("返書の期限", () => {
  it("counts the deadline from the visit day (架空の病院の取り決め)", () => {
    const row = ledgerRow(ref({ visitDay: -2 }), EMPTY_LIAISON);
    expect(row.state).toBe("返書待ち");
    expect(row.due).toBe(-2 + REPLY_DAYS);
  });
  it("is overdue after the deadline, and done once the 返書 is recorded", () => {
    const late = ref({ id: "late", visitDay: -REPLY_DAYS - 1 });
    expect(ledgerRow(late, EMPTY_LIAISON).state).toBe("期限切れ");
    const book = { ...EMPTY_LIAISON, replies: { late: { day: 0, time: "10:00", by: "MSW", how: "FAX" as const } } };
    expect(ledgerRow(late, book).state).toBe("返書済み");
  });
  it("has no deadline before the visit", () => {
    expect(ledgerRow(ref({ visitDay: null }), EMPTY_LIAISON).state).toBe("受診待ち");
  });
  it("lists the unanswered, overdue first", () => {
    const rows = [ref({ id: "a", visitDay: -1 }), ref({ id: "b", visitDay: -20 }), ref({ id: "c", visitDay: null })].map((r) => ledgerRow(r, EMPTY_LIAISON));
    expect(unanswered(rows).map((r) => r.ref.id)).toEqual(["b", "a"]);
  });
  it("waits for the other side's 返書 on a 逆紹介", () => {
    const row = ledgerRow(ref({ direction: "逆紹介", visitDay: -5 }), EMPTY_LIAISON);
    expect(row.state).toBe("先方の返書待ち");
    expect(row.days).toBe(5);
  });
});

describe("紹介割合・逆紹介割合（A000 (7)）", () => {
  it("uses the 通知's formula", () => {
    // (40 + 10) / 100 × 100 = 50% ; 30 / (100 + 500) × 1000 = 50‰
    expect(referralRates({ first: 100, revisit: 500, referred: 40, ambulance: 10, reverse: 30 })).toEqual({ shokai: 50, gyaku: 50 });
    expect(referralRates({ first: 0, revisit: 0, referred: 0, ambulance: 0, reverse: 0 })).toEqual({ shokai: null, gyaku: null });
  });
  it("leaves out what the 通知 leaves out, and says why", () => {
    const p = { label: "t", from: -10, to: 0 };
    const related = FACILITIES.find((f) => f.related)!;
    const ledger = [
      ref({ id: "ok" }),
      ref({ id: "re", firstVisit: false }),
      ref({ id: "tel", onlineOnly: true }),
      ref({ id: "rel", facilityId: related.id }),
      ref({ id: "none", facilityId: null }),
      ref({ id: "old", visitDay: -30 }),
      ref({ id: "amb", ambulance: true }),
      ref({ id: "back", direction: "逆紹介", visitDay: -1 }),
      ref({ id: "back2", direction: "逆紹介", visitDay: -1, facilityId: related.id }),
    ].map((r) => ({ ref: r, facility: FACILITIES.find((f) => f.id === r.facilityId) }));
    const c = rateCounts(p, [{ day: -1, department: "総合診療科", first: 10, revisit: 40, ambulance: 2 }], ledger);
    expect(c.referred).toBe(2);
    expect(c.both).toBe(1);
    expect(c.reverse).toBe(1);
    expect(c.first).toBe(10);
    expect(c.ambulance).toBe(2);
    expect(c.left.map((x) => x.why).sort()).toEqual(["逆紹介：開設者と直接関係のある機関へ", "紹介：初診ではない", "紹介：情報通信機器を用いた診療のみ", "紹介：特別の関係にある医療機関から", "紹介：紹介元がマスタで選ばれていない"].sort());
  });
  it("counts today's outpatients: 救急車 as 救急患者, not as 初診", () => {
    const v = todayVisits(
      [
        { department: "総合診療科", kind: "初診", arrived: "09:00" },
        { department: "総合診療科", kind: "再診", arrived: "09:10" },
        { department: "総合診療科", kind: "再診" },
      ],
      [
        { arrival: "救急車", status: "診察中" },
        { arrival: "独歩", status: "待合" },
        { arrival: "救急車", status: "搬送中" },
      ],
    );
    const sum = (k: "first" | "revisit" | "ambulance") => v.reduce((n, x) => n + x[k], 0);
    expect([sum("first"), sum("revisit"), sum("ambulance")]).toEqual([2, 1, 1]);
  });
});

describe("periods", () => {
  it("gives calendar months, this one up to today", () => {
    const [now, last] = monthPeriods({ y: 2026, m: 11, d: 4 }, 1);
    expect(now).toMatchObject({ from: -3, to: 0 });
    expect(last).toMatchObject({ label: "2026年10月", from: -34, to: -4 });
  });
});

describe("entries from the other records", () => {
  it("makes a 紹介 of an outpatient with a letter, seen once arrived", () => {
    const [r] = fromOpd([{ id: "opd-4", name: "坂本 ヨシ", kana: "サカモト ヨシ", department: "総合診療科", doctor: "山本", kind: "初診", referral: "〇〇内科クリニック（架空）より。…", reason: "紹介" }]);
    expect(r.facilityId).toBe("f01");
    expect(r.visitDay).toBeNull();
    expect(fromOpd([{ id: "x", name: "a", kana: "a", department: "d", doctor: "x", kind: "初診", arrived: "09:00", referral: "どこか医院より", reason: "" }])[0]).toMatchObject({ visitDay: 0, facilityId: null, facilityText: "どこか医院" });
  });
  it("makes a 逆紹介 of a letter issued from the discharge summary", () => {
    const [r] = fromLetters([{ patientId: "p", name: "a", kana: "a", department: "総合診療科", doctor: "山本", to: "さくら坂病院", purpose: "療養の継続", issuedDay: 0 }]);
    expect(r).toMatchObject({ direction: "逆紹介", facilityId: "f11", visitDay: 0 });
    expect(facilityByName("")).toBeUndefined();
  });
  it("takes a 紹介 from the ED (the clinic is chosen later)", () => {
    expect(fromEr([{ id: "e1", name: "a", kana: "a", arrival: "紹介", status: "診察中", complaint: "胸痛" }], "当直医")).toHaveLength(1);
    expect(fromEr([{ id: "e1", name: "a", kana: "a", arrival: "紹介", status: "搬送中", complaint: "" }], "当直医")).toHaveLength(0);
  });
});

describe("the fictional record", () => {
  const today = { y: 2026, m: 11, d: 4 };
  it("is the same for the same day", () => {
    expect(liaisonHistory(today, 30)).toEqual(liaisonHistory(today, 30));
  });
  it("has no outpatient clinic on Saturdays and Sundays, and never more 紹介 than 初診", () => {
    const h = liaisonHistory(today, 60);
    // 2026-11-01 is a Sunday (day -3)
    expect(h.visits.filter((v) => v.day === -3).map((v) => v.department)).toEqual(["救急外来"]);
    for (const v of h.visits.filter((x) => x.department !== "救急外来")) {
      const n = h.ledger.filter((r) => r.direction === "紹介" && r.visitDay === v.day && r.department === v.department).length;
      expect(n).toBeLessThanOrEqual(v.first);
    }
    expect(Object.values(h.replies).every((r) => r.day < 0)).toBe(true);
  });
});
