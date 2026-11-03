import { describe, expect, it } from "vitest";
import {
  NIGHT_BAND,
  WARD_NURSES,
  blanks,
  ceil1,
  dayUnits,
  daysIn,
  draftMonth,
  emptyMonth,
  floor1,
  form9,
  initialRosterBook,
  monthKey,
  nextMonth,
  nightBandValid,
  nurseHours,
  rosterIssues,
  shownCode,
  type RosterMonth,
  type RosterNurse,
  type ShiftCode,
} from "./roster";

// 2026年11月: 30 days, the 1st is a Sunday.
const Y = 2026;
const M = 11;
const DAYS = 30;
/** A month of days off, with the given codes on the given days (index 0 = 10月31日). */
const row = (set: Record<number, ShiftCode> = {}): ShiftCode[] => Array.from({ length: DAYS + 1 }, (_, i) => set[i] ?? "休");
const nights = (...ds: number[]) => Object.fromEntries(ds.map((d) => [d, "夜"])) as Record<number, ShiftCode>;
const days = (...ds: number[]) => Object.fromEntries(ds.map((d) => [d, "日"])) as Record<number, ShiftCode>;
const nurse = (id: string, extra: Partial<RosterNurse> = {}): RosterNurse => ({ id, name: `看護師 ${id}`, kind: "看護師", ...extra });

describe("夜勤時間帯（別添2 第2 4 (3)ア：22時〜翌5時を含む連続16時間）", () => {
  it("この病院の 16:30〜翌8:30 は満たす", () => {
    expect(nightBandValid(NIGHT_BAND.from, NIGHT_BAND.to)).toBe(true);
    expect(nightBandValid("17:00", "09:00")).toBe(true);
  });
  it("16時間でないもの、22時〜5時を含まないものは満たさない", () => {
    expect(nightBandValid("16:00", "08:30")).toBe(false);
    expect(nightBandValid("23:00", "15:00")).toBe(false);
  });
});

describe("1人ずつの時間（様式9 4．勤務実績表：上段＝日勤帯、中段＝夜勤時間帯）", () => {
  it("夜勤 16:30〜翌9:00 は夜勤時間帯 16時間（その日 7.5・翌日 8.5）と、日勤帯 0.5時間（翌日 8:30〜9:00）", () => {
    const h = nurseHours(nurse("a"), row(nights(5)), DAYS);
    expect(h.nights).toBe(1);
    expect(h.nightHours).toBe(16);
    expect(h.dayHours).toBe(0.5);
    expect(h.byDate[4]).toEqual({ day: 5, dayHours: 0, nightHours: 7.5 });
    expect(h.byDate[5]).toEqual({ day: 6, dayHours: 0.5, nightHours: 8.5 });
  });
  it("日勤 8:30〜17:00 は日勤帯 8時間と、夜勤時間帯 0.5時間（16:30〜17:00）", () => {
    const h = nurseHours(nurse("a"), row(days(2)), DAYS);
    expect([h.dayHours, h.nightHours, h.nights]).toEqual([8, 0.5, 0]);
  });
  it("前月末日の夜勤は、この月の分（1日 0:00〜9:00）だけ数え、回数には入れない。月末の夜勤は 24時まで", () => {
    const h = nurseHours(nurse("a"), row({ 0: "夜", 30: "夜" }), DAYS);
    expect(h.nights).toBe(1);
    expect(h.nightHours).toBe(8.5 + 7.5);
    expect(h.dayHours).toBe(0.5);
  });
  it("夜勤の有無：16時間以上は「有」、未満は「無」（短時間正職員は12時間）、夜勤専従者は「夜専」（※4・別添2 第2 4 (3)カ）", () => {
    expect(nurseHours(nurse("a"), row(nights(3)), DAYS).night).toBe("有");
    const head = nurseHours(nurse("h", { head: true }), row(days(2, 3, 4, 5, 6, 9, 10, 11, 12, 13, 16, 17, 18, 19, 20, 23, 24, 25, 26, 27)), DAYS);
    expect([head.nightHours, head.night, head.counted]).toEqual([10, "無", 0]);
    expect(head.excluded).toContain("16時間未満");
    const many = days(...Array.from({ length: 24 }, (_, i) => i + 1));
    expect(nurseHours(nurse("s", { shortTime: true }), row(many), DAYS).night).toBe("有");
    expect(nurseHours(nurse("t"), row(many), DAYS).night).toBe("無");
    const only = nurseHours(nurse("n", { nightOnly: true }), row(nights(1, 5, 9)), DAYS);
    expect([only.night, only.counted]).toEqual(["夜専", 0]);
    expect(only.excluded).toContain("夜勤専従者");
  });
});

describe("様式9 3．（別紙5 の算出方法）", () => {
  it("端数：① は小数第1位までに切り上げ（12.34→12.4）、② ⑥ は小数第2位以下を切り捨て（12.34→12.3）", () => {
    expect(ceil1(12.34)).toBe(12.4);
    expect(floor1(12.34)).toBe(12.3);
    expect(ceil1(8.7)).toBe(8.7);
    expect(floor1(72)).toBe(72);
  });

  const team = [nurse("a"), nurse("b"), nurse("h", { head: true }), nurse("n", { nightOnly: true })];
  const month = (a: Record<number, ShiftCode>): RosterMonth => ({
    y: Y,
    m: M,
    shifts: { a: row(a), b: row(nights(4, 10, 16, 22)), h: row(days(2, 3, 4, 5, 6, 9, 10, 11, 12, 13, 16, 17, 18, 19, 20, 23, 24, 25, 26, 27)), n: row(nights(1, 3, 6, 8, 12, 14, 18, 20, 24, 26)) },
  });

  it("⑥ 月平均夜勤時間数 =（D − E）÷ B：夜勤専従者と16時間未満の人は B にも D − E にも入れない", () => {
    const f = form9(team, month(nights(2, 7, 13, 19, 25)), 29);
    expect(f.B).toBe(2);
    expect(f.D).toBe(80 + 64 + 10 + 160);
    expect(f.E).toBe(10 + 160);
    expect(f.avgNight).toBe(72);
    expect(f.nightOk).toBe(true);
  });
  it("72時間を超えると満たさない（日勤の 16:30〜17:00 も夜勤時間帯に入る）", () => {
    const f = form9(team, month({ ...nights(2, 7, 13, 19, 25), 28: "日" }), 29);
    expect(f.avgNight).toBe(72.2);
    expect(f.nightOk).toBe(false);
  });
  it("② 月平均1日当たり看護職員配置数 = C ÷（日数 × 8）と、必要数 =（A ÷ 10）× 3（急性期一般入院料４は 10対1）", () => {
    const f = form9(team, month(nights(2, 7, 13, 19, 25)), 29);
    expect(f.A).toBe(29);
    expect(f.required).toBe(8.7);
    // a 5夜, b 4夜, n 10夜 (16.5時間ずつ) と h の日勤20日 (8.5時間ずつ).
    expect(f.C).toBe(19 * 16.5 + 20 * 8.5);
    expect(f.M).toBe(floor1((19 * 16.5 + 20 * 8.5) / (DAYS * 8)));
    expect(f.staffOk).toBe(false);
    expect(form9(team, month(nights(2)), 28.4).required).toBe(8.6);
  });
  it("③ 看護師の比率 =（看護師の時間 ÷（日数 × 8））÷ 必要数：7割以上", () => {
    const mixed = [nurse("a"), nurse("p", { kind: "准看護師" })];
    const mo: RosterMonth = { y: Y, m: M, shifts: { a: row(days(2, 3)), p: row(days(4, 5, 6, 9, 10)) } };
    const f = form9(mixed, mo, 2);
    expect(f.required).toBe(0.6);
    expect(f.cNurse).toBe(17);
    expect(f.nurseShare).toBeCloseTo(17 / 240 / 0.6);
    expect(f.shareOk).toBe(false);
  });
});

describe("日ごとの確認", () => {
  const team = [nurse("a"), nurse("b"), nurse("c", { newcomer: true }), nurse("d", { newcomer: true }), nurse("p", { kind: "准看護師" })];
  const base = (shifts: Record<string, Record<number, ShiftCode>>): RosterMonth => ({ y: Y, m: M, shifts: Object.fromEntries(team.map((n) => [n.id, row(shifts[n.id] ?? {})])) });
  const issuesOn = (mo: RosterMonth, d: number, ng: [string, string][] = []) => rosterIssues(team, mo, ng).filter((i) => i.day === d);

  it("夜勤は看護師1人を含む2人以上（告示 第五 一 (7)）", () => {
    const mo = base({ a: nights(3), p: nights(4) });
    expect(issuesOn(mo, 3).map((i) => [i.kind, i.text])).toEqual([["基準", "夜勤が1人です（看護職員2人以上）。"]]);
    expect(issuesOn(mo, 4).map((i) => i.text)).toEqual(["夜勤が1人です（看護職員2人以上）。", "夜勤に看護師がいません（看護師1人を含む）。"]);
    expect(issuesOn(base({ a: nights(5), b: nights(5) }), 5)).toEqual([]);
  });
  it("1年目だけの夜勤と、登録した組み合わせは「架空の病院の取り決め」として出す", () => {
    const fresh = issuesOn(base({ c: nights(6), d: nights(6) }), 6);
    expect(fresh.map((i) => i.kind)).toEqual(["院内"]);
    expect(fresh[0].text).toContain("1年目だけ");
    const ng = issuesOn(base({ a: nights(7), b: nights(7) }), 7, [["a", "b"]]);
    expect(ng.map((i) => [i.kind, i.nurseIds])).toEqual([["院内", ["a", "b"]]]);
    expect(ng[0].basis).toContain("架空の病院の取り決め");
  });
  it("夜勤明けの日の日勤は時間が重なる。明けの日の夜勤は院内の取り決めで知らせる", () => {
    const mo = base({ a: { 8: "夜", 9: "日" }, b: { 8: "夜", 9: "夜" }, c: nights(9) });
    const out = issuesOn(mo, 9);
    expect(out.find((i) => i.nurseIds[0] === "a")?.kind).toBe("重なり");
    expect(out.find((i) => i.nurseIds.length === 1 && i.nurseIds[0] === "b")?.kind).toBe("院内");
  });
  it("夜勤のあとの休みは「明」と出す", () => {
    expect(shownCode(["夜", "休", "休"], 1)).toBe("明");
    expect(shownCode(["夜", "休", "休"], 2)).toBe("休");
    expect(shownCode(["日", ""], 1)).toBe("");
  });
});

describe("架空の5階東の下書き（デモのデータ）", () => {
  const book = initialRosterBook(Y, M);
  const mo = book.months[monthKey(Y, M)];
  const f = form9(book.nurses, mo, book.census[monthKey(Y, M)]);
  it("満たしている：月平均夜勤時間数 72時間以下、10対1、看護師7割以上、毎晩2人以上", () => {
    expect(f.nightOk).toBe(true);
    expect(f.staffOk).toBe(true);
    expect(f.shareOk).toBe(true);
    expect(blanks(book.nurses, mo)).toBe(0);
    expect(rosterIssues(book.nurses, mo, book.ngPairs).filter((i) => i.kind !== "院内")).toEqual([]);
  });
  it("確認の例として、1年目だけの夜勤が1回と、登録した組み合わせの夜勤が1回残っている", () => {
    const out = rosterIssues(book.nurses, mo, book.ngPairs);
    expect(out.map((i) => i.text.includes("1年目だけ") ? "fresh" : "ng").sort()).toEqual(["fresh", "ng"]);
  });
  it("看護師長は日勤だけ（夜勤時間 16時間未満で数えない）、夜勤専従者も数えない", () => {
    const head = f.rows.find((r) => r.nurse.head)!;
    const only = f.rows.find((r) => r.nurse.nightOnly)!;
    expect(head.night).toBe("無");
    expect(only.night).toBe("夜専");
    expect(f.B).toBe(WARD_NURSES.length - 2);
  });
  it("ほかの月でも施設基準の確認に引っかからない", () => {
    for (let k = 0; k < 12; k++) {
      const { y, m } = Array.from({ length: k }).reduce<{ y: number; m: number }>((a) => nextMonth(a.y, a.m), { y: Y, m: M });
      const d = draftMonth(WARD_NURSES, y, m);
      const g = form9(WARD_NURSES, d, 29);
      expect([y, m, g.nightOk, g.staffOk, g.shareOk]).toEqual([y, m, true, true, true]);
      expect(rosterIssues(WARD_NURSES, d, []).filter((i) => i.kind !== "院内")).toEqual([]);
    }
  });
  it("翌月の空の勤務表は、前月末日の勤務（その夜勤は1日の朝まで）を引き継ぐ", () => {
    const { y, m } = nextMonth(Y, M);
    const next = emptyMonth(WARD_NURSES, y, m, mo);
    for (const n of WARD_NURSES) expect(next.shifts[n.id][0]).toBe(mo.shifts[n.id][DAYS]);
    expect(next.shifts[WARD_NURSES[1].id]).toHaveLength(daysIn(y, m) + 1);
    expect(blanks(WARD_NURSES, next)).toBe(WARD_NURSES.length * daysIn(y, m));
  });
  it("日ごとの看護職員の時間 ÷ 8 は参考として出せる（基準は月平均）", () => {
    expect(dayUnits(f, 2)).toBeGreaterThan(0);
  });
});
