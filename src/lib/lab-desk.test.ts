import { describe, expect, it } from "vitest";
import { EMPTY_DESK, containersOf, deskWindow, drawRows, normalizeCode, receive, scanSpecimen, statusCounts, testCodes, whenText } from "./lab-desk";
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
