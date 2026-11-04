import { describe, expect, it } from "vitest";
import { PATIENTS } from "./patients";
import { currentEntries } from "./record";
import type { OrderEntry } from "./types";
import { buildWorksheet, changeKey, orderChanges, sessionChangeKeys, shiftWindow, type WorkPatient } from "./worksheet";

const people = (changes = {}): WorkPatient[] =>
  PATIENTS.map((p, i) => ({
    patient: p,
    room: ["512", "515B", "508A", "511"][i],
    entries: currentEntries(p, (changes as Record<string, { added: OrderEntry[]; stopped: string[] }>)[p.id]).filter((e): e is OrderEntry => e.kind === "order"),
  }));

describe("勤務帯", () => {
  it("日勤 08:30–17:00, 夜勤 16:30–翌09:00, 終日 00:00–24:00", () => {
    expect(shiftWindow("day", 0)).toEqual({ lo: 510, hi: 1020 });
    expect(shiftWindow("night", 0)).toEqual({ lo: 990, hi: 1440 + 540 });
    expect(shiftWindow("all", 1)).toEqual({ lo: 1440, hi: 2880 });
  });
});

describe("ワークシート", () => {
  // now = today 07:00, day shift
  const { lo, hi } = shiftWindow("day", 0);
  const ws = buildWorksheet(people(), lo, hi, 420);

  it("timed items are in the shift and sorted by time", () => {
    expect(ws.timed.length).toBeGreaterThan(0);
    expect(ws.timed.every((i) => i.at! >= lo && i.at! < hi)).toBe(true);
    expect(ws.timed.map((i) => i.at)).toEqual([...ws.timed.map((i) => i.at)].sort((a, b) => a! - b!));
  });

  it("every-6-hours 抗菌薬 for 大浦 at 12:00 (started 11/2 12:00)", () => {
    expect(ws.timed.some((i) => i.patientId === "90010244" && i.kind === "注射" && i.at === 720 && i.main.includes("スルバシリン静注用3g"))).toBe(true);
  });

  it("running all shift: drips, oxygen, the catheter", () => {
    const names = ws.running.map((r) => r.main);
    expect(names.some((n) => n.startsWith("酸素吸入"))).toBe(true);
    expect(names.some((n) => n.startsWith("膀胱留置カテーテル"))).toBe(true);
  });

  it("as-needed items have no time", () => {
    expect(ws.untimed.some((i) => i.main === "喀痰吸引" && i.at === null)).toBe(true);
  });

  it("the night shift reaches into the next morning's 06:00 draw", () => {
    const n = shiftWindow("night", 0);
    const night = buildWorksheet(people(), n.lo, n.hi, 420);
    expect(night.timed.filter((i) => i.kind === "採血").every((i) => i.at! >= 1440)).toBe(true);
  });
});

describe("指示受け", () => {
  it("changes since yesterday; this session's changes wait for a nurse", () => {
    const sakura = PATIENTS[0];
    const added: OrderEntry = {
      kind: "order",
      id: "new1",
      day: 0,
      time: "07:00",
      author: "山本",
      status: "有効",
      order: { type: "lab", codes: ["LAB-CRP"], collect: { day: 1, time: "06:00" }, priority: "定時" },
    };
    const session = { [sakura.id]: { added: [added], stopped: ["sakura-cez"] } };
    const list = orderChanges(people(session), -1440, 430);
    const keys = sessionChangeKeys(session);
    expect(list.find((c) => c.entry.id === "new1")?.kind).toBe("新規");
    expect(list.find((c) => c.entry.id === "sakura-cez" && c.kind === "中止")).toBeTruthy();
    expect(keys.has(changeKey("new1", "新規"))).toBe(true);
    expect(keys.has(changeKey("sakura-cez", "中止"))).toBe(true);
    // fictional history from yesterday is not waiting
    expect(list.filter((c) => !keys.has(c.key)).length).toBeGreaterThan(0);
  });
});

describe("延長と食事の変更も指示受けに", () => {
  it("lists them with the time and who, inside the window", async () => {
    const { otherChanges } = await import("./worksheet");
    const { PATIENTS } = await import("./patients");
    const p = PATIENTS[0];
    const people = [{ patient: p, room: p.room, entries: p.history.filter((e): e is import("./types").OrderEntry => e.kind === "order") }];
    const orderId = people[0].entries[0].id;
    const out = otherChanges(
      people,
      [{ orderId, patientId: p.id, days: 7, at: 600, by: "山本（専攻医）", text: "セファゾリン" }],
      [{ id: "d1", patientId: p.id, at: { day: 0, time: "11:00" }, by: "山本（専攻医）", label: "全粥", from: "今日の夕食から" }, { id: "d0", patientId: p.id, at: { day: -3, time: "11:00" }, by: "x", label: "常食", from: "" }],
      -1440,
      720,
    );
    expect(out.map((c) => [c.kind, c.at, c.text.main])).toEqual([
      ["延長", 600, "セファゾリン"],
      ["食事", 660, "全粥"],
    ]);
    expect(new Set(out.map((c) => c.key)).size).toBe(2);
  });
});

it("単回処方は今すぐの時刻に1件だけ出て翌日に繰り返さない", () => {
  const entry: OrderEntry = { kind: "order", id: "once-rx", day: 0, time: "10:00", author: "医師", status: "有効", order: { type: "prescription", category: "臨時", drugCode: "ORAL-REBA100", amount: 1, unit: "錠", timings: [], start: { day: 0 }, once: { day: 0, time: "10:00" } } };
  const p = [{ patient: PATIENTS[0], room: "512", entries: [entry] }];
  expect(buildWorksheet(p, 0, 1440, 600).timed).toMatchObject([{ orderId: "once-rx", at: 600 }]);
  expect(buildWorksheet(p, 1440, 2880, 1500).timed).toEqual([]);
  expect(buildWorksheet(p, 0, 1440, 600).untimed).toEqual([]);
});
