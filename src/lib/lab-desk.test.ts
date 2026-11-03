import { describe, expect, it } from "vitest";
import { EMPTY_DESK, addTry, checkEntry, confirmReport, containersOf, deskLabs, deskWindow, drawRows, entryPlan, flagOf, normalizeCode, parseValue, rangeText, receive, scanSpecimen, statusCounts, testCodes, toEnter, whenText } from "./lab-desk";
import { ANALYTES } from "./master";
import { PANIC_LIMITS, labKey, resultsOf, uncalled } from "./results";
import { labelFor, marKey, type AdminRecord } from "./mar";
import { PATIENTS } from "./patients";
import { currentEntries } from "./record";
import type { OrderEntry } from "./types";
import type { WorkPatient } from "./worksheet";

// Fictional orders added for the test: tomorrow's routine draw, a level today 20:00, a stopped draw.
const sakura = PATIENTS[0];
const lab = (id: string, codes: string[], day: number, time: string, status: OrderEntry["status"] = "有効"): OrderEntry => ({
  kind: "order",
  id,
  day: 0,
  time: "09:00",
  author: "山本（専攻医）",
  status,
  order: { type: "lab", codes, collect: { day, time }, priority: "定時" },
});
const added = [lab("ord-t1", ["SET-ROUTINE"], 1, "06:00"), lab("ord-t2", ["LAB-VCM"], 0, "20:00"), lab("ord-t3", ["LAB-K"], 0, "15:00", "中止")];
const people: WorkPatient[] = [
  { patient: sakura, room: "512", entries: [...currentEntries(sakura, undefined).filter((e): e is OrderEntry => e.kind === "order"), ...added] },
];
const record = (orderId: string, at: number, status: AdminRecord["status"] = "実施"): AdminRecord => ({
  key: marKey(orderId, at),
  orderId,
  patientId: sakura.id,
  at,
  status,
  doneAt: "19:55",
  by: "看護師 佐藤",
  checked: { patient: true, label: true },
  ...(status === "未実施" ? { reason: "患者が拒否" as const } : {}),
});
const T20 = 20 * 60;
const T6 = 1440 + 6 * 60;

describe("検体の受付：一覧", () => {
  it("today and tomorrow morning, to the end of the night shift (09:00)", () => {
    expect(deskWindow()).toEqual({ lo: 0, hi: 1440 + 540 });
    const rows = drawRows(people, {}, EMPTY_DESK, 9 * 60, 10 * 60);
    expect(rows.map((r) => r.orderId)).toEqual(expect.arrayContaining(["ord-t1", "ord-t2"]));
    expect(rows.some((r) => r.orderId === "ord-t3")).toBe(false);
    expect(rows.every((r) => r.at >= 0 && r.at < 1440 + 540)).toBe(true);
  });

  it("each draw carries the code printed on its label, and its containers", () => {
    const rows = drawRows(people, {}, EMPTY_DESK, 9 * 60, 10 * 60);
    const t1 = rows.find((r) => r.orderId === "ord-t1")!;
    expect(t1.code).toBe(labelFor("ord-t1", T6));
    expect(testCodes(["SET-ROUTINE"])).toEqual(["LAB-CBC", "LAB-CHEM", "LAB-CRP"]);
    expect(t1.container).toBe(containersOf(["SET-ROUTINE"]));
    expect(t1.container).toBe("PK2・S09");
  });

  it("a draw already in the fictional record counts as reported", () => {
    const rows = drawRows(people, {}, EMPTY_DESK, 9 * 60, 10 * 60);
    const morning = rows.find((r) => r.at === 360);
    expect(morning).toMatchObject({ status: "報告済み", fromRecord: true });
  });

  it("未採取 → 採取済み (the ward recorded it) → 受付済み (the label was read)", () => {
    let rows = drawRows(people, {}, EMPTY_DESK, 9 * 60, T20);
    expect(rows.find((r) => r.orderId === "ord-t2")!.status).toBe("未採取");
    const recs = { [marKey("ord-t2", T20)]: record("ord-t2", T20) };
    rows = drawRows(people, recs, EMPTY_DESK, 9 * 60, T20);
    const row = rows.find((r) => r.orderId === "ord-t2")!;
    expect(row).toMatchObject({ status: "採取済み", collectedAt: "19:55", collectedBy: "看護師 佐藤" });
    const desk = receive(EMPTY_DESK, row, "検査技師 中村", T20 + 10);
    expect(desk.received[row.code]).toMatchObject({ by: "検査技師 中村", time: "20:10", day: 0, collected: true });
    expect(drawRows(people, recs, desk, 9 * 60, T20 + 10).find((r) => r.orderId === "ord-t2")!.status).toBe("受付済み");
  });

  it("a draw the ward marked 未実施 shows the reason", () => {
    const recs = { [marKey("ord-t2", T20)]: record("ord-t2", T20, "未実施") };
    expect(drawRows(people, recs, EMPTY_DESK, 9 * 60, T20).find((r) => r.orderId === "ord-t2")).toMatchObject({ status: "採取しなかった", notDoneReason: "患者が拒否" });
  });

  it("counts each state", () => {
    const c = statusCounts(drawRows(people, {}, EMPTY_DESK, 9 * 60, 10 * 60));
    expect(c.未採取).toBe(2);
    expect(c.報告済み).toBeGreaterThan(0);
  });
});

describe("検体の受付：ラベルを読む", () => {
  const recs = { [marKey("ord-t2", T20)]: record("ord-t2", T20) };
  const rows = drawRows(people, recs, EMPTY_DESK, 9 * 60, T20);

  it("a barcode reader's full-width or lower-case input is the same code", () => {
    expect(normalizeCode(" ｏｒｄｔ２-1200 ")).toBe("ORDT2-1200");
  });

  it("a collected sample → taken in", () => {
    const s = scanSpecimen(labelFor("ord-t2", T20).toLowerCase(), rows, people, T20 + 5)!;
    expect(s).toMatchObject({ ok: true, tone: "ok" });
    expect(s.message).toContain("受け付けました");
  });

  it("an unknown code → stop, in red", () => {
    expect(scanSpecimen("XYZ-1", rows, people, T20)).toMatchObject({ ok: false, tone: "stop" });
    expect(scanSpecimen("XYZ-1", rows, people, T20)!.message).toContain("一覧にありません");
    expect(scanSpecimen("  ", rows, people, T20)).toBeNull();
  });

  it("the label of a stopped order → stop", () => {
    const s = scanSpecimen(labelFor("ord-t3", 900), rows, people, T20)!;
    expect(s.ok).toBe(false);
    expect(s.message).toContain("中止");
  });

  it("already received → says when and by whom", () => {
    const row = rows.find((r) => r.orderId === "ord-t2")!;
    const desk = receive(EMPTY_DESK, row, "検査技師 中村", T20 + 10);
    const again = scanSpecimen(row.code, drawRows(people, recs, desk, 9 * 60, T20 + 10), people, T20 + 11)!;
    expect(again).toMatchObject({ ok: false, tone: "warn" });
    expect(again.message).toContain("20:10 検査技師 中村");
  });

  it("not recorded by the ward: taken in once its time has come (with a note), stopped before", () => {
    const fresh = drawRows(people, {}, EMPTY_DESK, 9 * 60, T20);
    const now = scanSpecimen(labelFor("ord-t2", T20), fresh, people, T20)!;
    expect(now).toMatchObject({ ok: true, tone: "warn" });
    expect(now.message).toContain("採取の記録がまだ");
    const early = scanSpecimen(labelFor("ord-t1", T6), fresh, people, T20)!;
    expect(early).toMatchObject({ ok: false, tone: "stop" });
    expect(early.message).toContain("明日 06:00");
  });

  it("a draw the ward marked 未実施 → stop", () => {
    const nd = drawRows(people, { [marKey("ord-t2", T20)]: record("ord-t2", T20, "未実施") }, EMPTY_DESK, 9 * 60, T20);
    expect(scanSpecimen(labelFor("ord-t2", T20), nd, people, T20)).toMatchObject({ ok: false, tone: "stop" });
  });

  it("says the day in words", () => {
    expect(whenText(360)).toBe("06:00");
    expect(whenText(T6)).toBe("明日 06:00");
    expect(whenText(-1080)).toBe("昨日 06:00");
  });
});

describe("結果の入力", () => {
  const a = (code: string) => ANALYTES.find((x) => x.code === code)!;

  it("the analytes of the order, sets opened up; parts without a value field are listed apart", () => {
    const plan = entryPlan(["SET-ROUTINE"]);
    expect(plan.analytes.map((x) => x.code)).toEqual(["WBC", "Hb", "Plt", "TP", "Alb", "AST", "ALT", "LDH", "ALP", "T-Bil", "BUN", "Cre", "Na", "K", "Cl", "Glu", "CRP"]);
    expect(plan.other).toEqual([
      { name: "RBC", why: "結果の表に欄がない" },
      { name: "Ht", why: "結果の表に欄がない" },
    ]);
    expect(entryPlan(["LAB-BCX"])).toEqual({ analytes: [], other: [{ name: "血液培養", why: "細菌検査で報告" }] });
    expect(entryPlan(["LAB-NA", "LAB-NA"]).analytes).toHaveLength(1);
  });

  it("H/L against the reference range, by sex", () => {
    expect(flagOf(a("Hb"), "男", 13.0)).toBe("L");
    expect(flagOf(a("Hb"), "女", 13.0)).toBe("");
    expect(flagOf(a("CRP"), "男", 0.5)).toBe("H");
    expect(flagOf(a("CRP"), "男", 0.14)).toBe("");
    expect(rangeText(a("CRP"), "男")).toBe("0.14以下");
    expect(rangeText(a("Na"), "女")).toBe("138〜145");
  });

  it("reads typed values; full-width digits and commas are fine, words are not", () => {
    expect(parseValue("１２．５")).toEqual({ value: 12.5 });
    expect(parseValue("12,100")).toEqual({ value: 12100 });
    expect(parseValue("")).toEqual({ value: null });
    expect(parseValue("溶血")).toMatchObject({ value: null, error: "数で入れてください" });
    expect(parseValue("-1")).toMatchObject({ value: null });
  });

  it("checks every value: missing, errors, flags, panic values, and the previous value", () => {
    const plan = entryPlan(["SET-LYTES"]);
    const c = checkEntry(plan, { Na: "140", K: "7.2", Cl: "x" }, sakura, PANIC_LIMITS, T6);
    expect(c.ready).toBe(false);
    expect(c.errors).toBe(1);
    expect(c.rows.find((r) => r.analyte.code === "K")).toMatchObject({ flag: "H", panic: { code: "K", side: "高" } });
    expect(c.panic.map((h) => h.code)).toEqual(["K"]);
    expect(c.rows.find((r) => r.analyte.code === "Na")!.prev).toEqual({ value: sakura.labs.find((l) => l.day === 0)!.values.Na, when: "06:00" });
    const ok = checkEntry(plan, { Na: "140", K: "4.0", Cl: "104" }, sakura, PANIC_LIMITS, T6);
    expect(ok).toMatchObject({ ready: true, missing: 0, errors: 0, panic: [], values: { Na: 140, K: 4, Cl: 104 } });
    expect(checkEntry(entryPlan(["LAB-BCX"]), {}, sakura, PANIC_LIMITS, T6).ready).toBe(false);
  });

  it("確定 keeps who and when, once; the result goes to the patient's results with its own key", () => {
    const recs = { [marKey("ord-t2", T20)]: record("ord-t2", T20) };
    const row = drawRows(people, recs, EMPTY_DESK, 9 * 60, T20).find((r) => r.orderId === "ord-t2")!;
    expect(confirmReport(EMPTY_DESK, row, { VCM: 12 }, "検査技師 中村", T20 + 30)).toBe(EMPTY_DESK);
    const got = receive(EMPTY_DESK, row, "検査技師 中村", T20 + 10);
    expect(toEnter(drawRows(people, recs, got, 9 * 60, T20 + 10)).map((r) => r.orderId)).toEqual(["ord-t2"]);
    const done = confirmReport(got, row, { VCM: 12 }, "検査技師 中村", T20 + 40);
    expect(done.reports[row.code]).toMatchObject({ by: "検査技師 中村", reported: { day: 0, time: "20:40" } });
    expect(confirmReport(done, row, { VCM: 99 }, "x", T20 + 50)).toBe(done);
    expect(drawRows(people, recs, done, 9 * 60, T20 + 40).find((r) => r.orderId === "ord-t2")!.status).toBe("報告済み");
    const labs = deskLabs(done, sakura.id);
    expect(labs).toEqual([{ day: 0, time: "20:00", values: { VCM: 12 }, id: row.code, reportedBy: "検査技師 中村", reportedAt: { day: 0, time: "20:40" } }]);
    expect(labKey(sakura.id, labs[0])).toBe(`lab|${sakura.id}|0|20:00|${row.code}`);
    expect(labKey(sakura.id, { day: 0, time: "06:00", values: {} })).toBe(`lab|${sakura.id}|0|06:00`);
  });

  it("a confirmed panic value enters the panic-call list (tomorrow's draw too)", () => {
    const recs = { [marKey("ord-t1", T6)]: { ...record("ord-t1", T6), doneAt: "06:02" } };
    const row = drawRows(people, recs, EMPTY_DESK, 9 * 60, T6 + 30).find((r) => r.orderId === "ord-t1")!;
    const desk = confirmReport(receive(EMPTY_DESK, row, "検査技師 中村", T6 + 30), row, { K: 7.4, Na: 139 }, "検査技師 中村", T6 + 60);
    const p = { ...sakura, labs: [...sakura.labs, ...deskLabs(desk, sakura.id)] };
    const waiting = uncalled(resultsOf(p, PANIC_LIMITS), {});
    expect(waiting).toHaveLength(1);
    expect(waiting[0]).toMatchObject({ day: 1, time: "06:00" });
    expect(waiting[0].panic.map((h) => h.code)).toEqual(["K"]);
  });
});

describe("パニック値の連絡：つながらなかった回", () => {
  it("each try is kept, oldest first, per result", () => {
    const t = (time: string) => ({ at: { day: 0, time }, by: "検査技師 中村", to: "主治医", means: "電話" as const, result: "つながらない（不在・話し中）" as const });
    const d = addTry(addTry(EMPTY_DESK, "k1", t("10:00")), "k1", t("10:05"));
    expect(d.tries.k1.map((x) => x.at.time)).toEqual(["10:00", "10:05"]);
    expect(EMPTY_DESK.tries).toEqual({});
  });
});
