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
    expect(ws.timed.some((i) => i.patientId === "90010244" && i.kind === "注射" && i.at === 720 && i.main.includes("スルバクタム"))).toBe(true);
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
