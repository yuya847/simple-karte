import { describe, expect, it } from "vitest";
import {
  EMPTY_DESK,
  addTry,
  changeLine,
  checkCorrection,
  checkEntry,
  confirmReport,
  containersOf,
  correctReport,
  correctionReason,
  demoLabOrders,
  deskLabs,
  deskWindow,
  drawRows,
  entryPlan,
  flagOf,
  normalizeCode,
  parseValue,
  rangeText,
  receive,
  remainingAnalytes,
  reportAddition,
  redrawChangeKeys,
  redrawCode,
  rejectBlock,
  rejectSpecimen,
  rejectText,
  scanSpecimen,
  statusCounts,
  testCodes,
  toEnter,
  versionOf,
  versionsOf,
  whenText,
  withRedraws,
} from "./lab-desk";
import { buildWorksheet, changeKey, orderChanges } from "./worksheet";
import { latestValue } from "./clinical";
import { ANALYTES } from "./master";
import { PANIC_LIMITS, labKey, resultsOf, uncalled, unseen } from "./results";
import { labelFor, marKey, type AdminRecord } from "./mar";
import { PATIENTS } from "./patients";
import { currentEntries } from "./record";
import type { LabOrder, OrderEntry } from "./types";
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
    expect(labs).toEqual([{ day: 0, time: "20:00", values: { VCM: 12 }, id: row.code, reportedBy: "検査技師 中村", reportedAt: { day: 0, time: "20:40" }, progress: { expected: ["VCM"], sequence: 1 } }]);
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

describe("確定した結果が最新値になる", () => {
  it("a result confirmed later today is the latest value (header, dose checks)", () => {
    const p = { ...sakura, labs: [...sakura.labs, { day: 0, time: "20:00", values: { Cre: 1.9 }, id: "X-1200" }] };
    expect(latestValue(p, "Cre")).toEqual({ value: 1.9, day: 0 });
  });
});

describe("デモの架空の採血", () => {
  it("北村さんの至急の電解質は少し前に採取済み（前の勤務）、森さんは明日の朝の定期採血", () => {
    const now = 600;
    const demo = demoLabOrders(now);
    const ward: WorkPatient[] = PATIENTS.filter((p) => demo[p.id]).map((p) => ({ patient: p, room: p.id === "90010198" ? "508A" : "511", entries: demo[p.id] }));
    const rows = drawRows(ward, {}, EMPTY_DESK, now, now);
    expect(rows.map((r) => `${r.name} ${whenText(r.at)} ${r.status}${r.urgent ? " 至急" : ""}`)).toEqual(["北村 博 09:35 採取済み 至急", "森 久美子 明日 06:00 未採取"]);
    expect(rows[0].collectedAt).toBe("前の勤務");
    expect(entryPlan(rows[0].codes).analytes.map((a) => a.code)).toEqual(["Na", "K", "Cl", "BUN", "Cre"]);
    expect(scanSpecimen(rows[0].code, rows, ward, now)).toMatchObject({ ok: true, tone: "ok" });
    expect(scanSpecimen(rows[1].code, rows, ward, now)).toMatchObject({ ok: false, tone: "stop" });
  });

  it("an order with some items 至急 is taken in first, and the desk reads the items, the place and the purpose in one line", () => {
    const now = 600;
    const demo = demoLabOrders(now);
    const mori = demo["90010260"].map((e) => ({ ...e, order: { ...(e.order as LabOrder), codes: ["LAB-CBC", "LAB-K"], urgentCodes: ["LAB-K"], site: "病棟採血" as const, purpose: "低K の経過", comment: "ヘパリンロックから採取" } }));
    const ward: WorkPatient[] = PATIENTS.filter((p) => p.id === "90010260").map((p) => ({ patient: p, room: "511", entries: mori }));
    const row = drawRows(ward, {}, EMPTY_DESK, now, now)[0];
    expect(row.urgent).toBe(true);
    expect(row.urgentItems).toEqual(["K"]);
    expect(row.site).toBe("病棟採血");
    expect(row.purpose).toBe("低K の経過");
    expect(row.comment).toBe("至急：K　病棟採血　目的：低K の経過　ヘパリンロックから採取");
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

describe("再採血", () => {
  const recs = { [marKey("ord-t2", T20)]: record("ord-t2", T20) };
  const row = drawRows(people, recs, EMPTY_DESK, 9 * 60, T20).find((r) => r.orderId === "ord-t2")!;
  const got = receive(EMPTY_DESK, row, "検査技師 中村", T20 + 10);
  const received = drawRows(people, recs, got, 9 * 60, T20 + 10).find((r) => r.orderId === "ord-t2")!;
  const sent = rejectSpecimen(got, received, "溶血", "", "検査技師 中村", T20 + 15);
  const withNew = (d: typeof sent): WorkPatient[] => people.map((x) => ({ ...x, entries: withRedraws(x.entries, d, x.patient.id) }));

  it("only a sample taken in and not reported; その他 needs words", () => {
    expect(rejectBlock(row)).toContain("受け付けた検体だけ");
    expect(rejectBlock(received)).toBeNull();
    expect(rejectSpecimen(got, row, "溶血", "", "x", T20 + 15)).toBe(got);
    expect(rejectSpecimen(got, received, "その他", " ", "x", T20 + 15)).toBe(got);
    expect(rejectSpecimen(got, received, null, "", "x", T20 + 15)).toBe(got);
    expect(sent.rejected[row.code]).toMatchObject({ reason: "溶血", by: "検査技師 中村", day: 0, time: "20:15", redrawId: "ord-t2-re1" });
    expect(rejectText({ reason: "その他", note: "容器違い" })).toBe("容器違い");
    expect(rejectText({ reason: "量不足", note: "2mL" })).toBe("量不足（2mL）");
  });

  it("goes back to the ward as a new draw from now, with the reason, waiting for 指示受け", () => {
    const entries = withNew(sent)[0].entries;
    const redraw = entries.find((e) => e.id === "ord-t2-re1")!;
    expect(redraw).toMatchObject({ day: 0, time: "20:15", status: "有効", author: "検査技師 中村（再採血の依頼）", order: { type: "lab", codes: ["LAB-VCM"], collect: { day: 0, time: "20:15" }, comment: "再採血：溶血（検査技師 中村 20:15）" } });
    const item = buildWorksheet(withNew(sent), 0, 1440, T20 + 15).timed.find((i) => i.orderId === "ord-t2-re1")!;
    expect(item).toMatchObject({ kind: "採血", at: T20 + 15 });
    expect(item.detail).toContain("再採血：溶血");
    expect(orderChanges(withNew(sent), -1440, T20 + 15).map((c) => c.key)).toContain(changeKey("ord-t2-re1", "新規"));
    expect(redrawChangeKeys(sent)).toEqual([changeKey("ord-t2-re1", "新規")]);
    expect(withRedraws(people[0].entries, EMPTY_DESK, sakura.id)).toBe(people[0].entries);
  });

  it("the old label is not taken in again; the new draw has its own label", () => {
    const rows = drawRows(withNew(sent), recs, sent, 9 * 60, T20 + 15);
    const old = rows.find((r) => r.code === row.code)!;
    expect(old).toMatchObject({ status: "再採血", rejection: { reason: "溶血" } });
    const fresh = rows.find((r) => r.orderId === "ord-t2-re1")!;
    expect(fresh.code).toBe(redrawCode(sent.rejected[row.code]));
    expect(fresh.code).not.toBe(row.code);
    expect(fresh).toMatchObject({ status: "未採取", redrawOf: { code: row.code } });
    const again = scanSpecimen(row.code, rows, withNew(sent), T20 + 20)!;
    expect(again).toMatchObject({ ok: false, tone: "stop" });
    expect(again.message).toContain(fresh.code);
    expect(statusCounts(rows).再採血).toBe(1);
    const drawn = { ...recs, [marKey("ord-t2-re1", T20 + 15)]: { ...record("ord-t2-re1", T20 + 15), doneAt: "20:25" } };
    const rows2 = drawRows(withNew(sent), drawn, sent, 9 * 60, T20 + 30);
    expect(rows2.find((r) => r.code === fresh.code)).toMatchObject({ status: "採取済み", collectedAt: "20:25" });
    expect(scanSpecimen(fresh.code, rows2, withNew(sent), T20 + 30)!.message).toContain("（再採血）");
  });

  it("a new draw sent back again gets another new draw; a stopped order stops its new draws", () => {
    const rows = drawRows(withNew(sent), recs, sent, 9 * 60, T20 + 15);
    const fresh = rows.find((r) => r.orderId === "ord-t2-re1")!;
    const d2 = rejectSpecimen(receive(sent, fresh, "x", T20 + 40), { ...fresh, status: "受付済み" }, "凝固", "", "検査技師 中村", T20 + 45);
    expect(d2.rejected[fresh.code].redrawId).toBe("ord-t2-re2");
    expect(withNew(d2)[0].entries.filter((e) => e.id.startsWith("ord-t2-re")).map((e) => e.id)).toEqual(["ord-t2-re1", "ord-t2-re2"]);
    const stopped = people.map((x) => ({ ...x, entries: x.entries.map((e) => (e.id === "ord-t2" ? { ...e, status: "中止" as const, stoppedOn: 0, stoppedTime: "20:30" } : e)) }));
    const redraws = withRedraws(stopped[0].entries, sent, sakura.id).filter((e) => e.id === "ord-t2-re1");
    expect(redraws[0]).toMatchObject({ status: "中止", stoppedTime: "20:30" });
  });
});

describe("結果の訂正", () => {
  const recs = { [marKey("ord-t1", T6)]: { ...record("ord-t1", T6), doneAt: "06:02" } };
  const row = drawRows(people, recs, EMPTY_DESK, 9 * 60, T6 + 30).find((r) => r.orderId === "ord-t1")!;
  const lytes = entryPlan(["SET-LYTES"]);
  const reported = confirmReport(receive(EMPTY_DESK, row, "検査技師 中村", T6 + 30), row, { Na: 139, K: 7.4, Cl: 104 }, "検査技師 中村", T6 + 60);
  const at = (d: typeof reported) => ({ ...sakura, labs: [...sakura.labs, ...deskLabs(d, sakura.id)] });

  it("needs a changed value, every value valid, and a reason", () => {
    const r = reported.reports[row.code];
    const same = checkEntry(lytes, { Na: "139", K: "7.4", Cl: "104" }, sakura, PANIC_LIMITS, T6);
    expect(checkCorrection(r, same, "入力の誤り", PANIC_LIMITS)).toMatchObject({ ready: false, missing: ["変えた値"] });
    const fixed = checkEntry(lytes, { Na: "139", K: "4.7", Cl: "104" }, sakura, PANIC_LIMITS, T6);
    expect(checkCorrection(r, fixed, "", PANIC_LIMITS)).toMatchObject({ ready: false, missing: ["訂正の理由"] });
    const ok = checkCorrection(r, fixed, "入力の誤り", PANIC_LIMITS);
    expect(ok.ready).toBe(true);
    expect(changeLine(ok.changes)).toBe("K 7.4→4.7");
    expect(ok.panicBefore.map((h) => h.code)).toEqual(["K"]);
    expect(ok.panicAfter).toEqual([]);
    const bad = checkEntry(lytes, { Na: "139", K: "x", Cl: "104" }, sakura, PANIC_LIMITS, T6);
    expect(checkCorrection(r, bad, "入力の誤り", PANIC_LIMITS).missing).toContain("数でない値");
    expect(correctionReason("入力の誤り", " 転記 ")).toBe("入力の誤り（転記）");
    expect(correctionReason("その他", "")).toBe("");
    expect(correctionReason(null, "x")).toBe("");
  });

  it("keeps the version it replaced (who, when, why) and does nothing without a reason or a change", () => {
    expect(correctReport(reported, row.code, { Na: 139, K: 4.7, Cl: 104 }, " ", "検査技師 佐々木", T6 + 90)).toBe(reported);
    expect(correctReport(reported, row.code, { Na: 139, K: 7.4, Cl: 104 }, "入力の誤り", "検査技師 佐々木", T6 + 90)).toBe(reported);
    expect(correctReport(reported, "NOPE", { K: 1 }, "入力の誤り", "x", T6 + 90)).toBe(reported);
    const fixed = correctReport(reported, row.code, { Na: 139, K: 4.7, Cl: 104 }, "入力の誤り", "検査技師 佐々木", T6 + 90);
    const r = fixed.reports[row.code];
    expect(r).toMatchObject({ values: { K: 4.7 }, by: "検査技師 佐々木", reported: { day: 1, time: "07:30" }, reason: "入力の誤り" });
    expect(versionOf(r)).toBe(2);
    expect(versionsOf(r).map((v) => `${v.reported.time} ${v.by} K${v.values.K}${v.reason ? ` ${v.reason}` : ""}`)).toEqual(["07:00 検査技師 中村 K7.4", "07:30 検査技師 佐々木 K4.7 入力の誤り"]);
    const again = correctReport(fixed, row.code, { Na: 141, K: 4.7, Cl: 104 }, "再測定の結果", "検査技師 中村", T6 + 120);
    expect(versionOf(again.reports[row.code])).toBe(3);
    expect(again.reports[row.code].earlier!.map((v) => v.values.Na)).toEqual([139, 139]);
  });

  it("the doctor sees a corrected result again as not seen, marked 訂正 with what changed", () => {
    const before = resultsOf(at(reported), PANIC_LIMITS).find((i) => i.key.includes(row.code))!;
    const acks = { [before.key]: { by: "山本（専攻医）", at: { day: 1, time: "07:10" } } };
    const fixed = correctReport(reported, row.code, { Na: 139, K: 4.7, Cl: 104 }, "入力の誤り", "検査技師 佐々木", T6 + 90);
    const after = resultsOf(at(fixed), PANIC_LIMITS).filter((i) => i.key.includes(row.code));
    expect(after).toHaveLength(1);
    expect(after[0].key).toBe(`${before.key}|v2`);
    expect(unseen(after, acks)).toHaveLength(1);
    expect(after[0].title).toContain("訂正");
    expect(after[0].corrected).toBe("訂正（第2版）：K 7.4→4.7（訂正前のKはパニック値）　理由：入力の誤り（07:30 検査技師 佐々木）");
    expect(deskLabs(fixed, sakura.id)[0].corrected).toMatchObject({ version: 2, before: { K: 7.4 }, by: "検査技師 佐々木" });
  });

  it("the panic flow follows the version in force: one that stops being a panic value drops out, one that becomes one is phoned in", () => {
    expect(uncalled(resultsOf(at(reported), PANIC_LIMITS), {}).map((i) => i.panic.map((h) => h.code))).toEqual([["K"]]);
    const notPanic = correctReport(reported, row.code, { Na: 139, K: 4.7, Cl: 104 }, "入力の誤り", "x", T6 + 90);
    expect(uncalled(resultsOf(at(notPanic), PANIC_LIMITS), {})).toEqual([]);
    const becomes = correctReport(notPanic, row.code, { Na: 112, K: 4.7, Cl: 104 }, "再測定の結果", "x", T6 + 100);
    const waiting = uncalled(resultsOf(at(becomes), PANIC_LIMITS), {});
    expect(waiting.map((i) => i.panic.map((h) => h.code))).toEqual([["Na"]]);
    expect(waiting[0].key.endsWith("|v3")).toBe(true);
  });
});


describe("部分報告", () => {
  it("adds only ordered, finite, nonnegative values and never overwrites a report", () => {
    const plan = entryPlan(["SET-LYTES"]);
    expect(reportAddition(plan, { K: 7.2 }, { K: 4, Na: 140, Cl: Infinity, unknown: 1 })).toEqual({ Na: 140 });
    expect(remainingAnalytes(plan, { K: 7.2 }).map((a) => a.code)).toEqual(["Na", "Cl"]);
    expect(reportAddition(plan, {}, { Na: -1, K: NaN, Cl: 0 })).toEqual({ Cl: 0 });
  });
  it("keeps partial samples available and preserves each addition separately from corrections", () => {
    const row = drawRows(people, {}, EMPTY_DESK, 9 * 60, T6).find((r) => r.orderId === "ord-t1")!;
    const received = receive(EMPTY_DESK, row, "受付", T6);
    expect(confirmReport(received, row, {}, "技師", T6)).toBe(received);
    const first = confirmReport(received, row, { K: 7.4 }, "技師1", T6 + 5);
    const partial = drawRows(people, {}, first, 9 * 60, T6 + 5).find((r) => r.code === row.code)!;
    expect(toEnter([partial])).toHaveLength(1);
    expect(rejectBlock(partial)).toContain("訂正");
    const fixed = correctReport(first, row.code, { K: 7.3 }, "入力の誤り", "技師2", T6 + 6);
    const rest = Object.fromEntries(entryPlan(row.codes).analytes.map((a) => [a.code, 1]));
    const final = confirmReport(fixed, row, rest, "技師3", T6 + 10);
    expect(final.reports[row.code].values.K).toBe(7.3);
    expect(final.reports[row.code].additions).toHaveLength(2);
    expect(versionOf(final.reports[row.code])).toBe(2);
    expect(deskLabs(final, row.patientId)[0].corrected).toMatchObject({ by: "技師2", at: { time: "06:06" } });
    expect(drawRows(people, {}, final, 9 * 60, T6 + 10).find((r) => r.code === row.code)?.status).toBe("報告済み");
    expect(confirmReport(final, row, rest, "技師", T6 + 11)).toBe(final);
  });
});
