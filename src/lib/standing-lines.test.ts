import { describe, expect, it } from "vitest";
import { emptyStanding, type StandingOrders } from "./standing";
import {
  HOSPITAL_LINE_TEMPLATES,
  INITIAL_LINE_IDS,
  LINE_CATS,
  barCell,
  calendarRows,
  currentLines,
  initialLines,
  lineCalendarDays,
  lineChanges,
  lineEndDay,
  lineLabel,
  lineOn,
  lineProblems,
  linesFromFields,
  pastLines,
  stopLine,
  templateProblems,
  type StandingLine,
} from "./standing-lines";
import type { Patient } from "./types";

const doc = "山本（専攻医）";
const line = (over: Partial<StandingLine> = {}): StandingLine => ({ id: "l1", cat: "安静", text: "病棟内フリー", start: { day: -2, time: "10:00" }, by: doc, at: { day: -2, time: "10:00" }, ...over });
const fmt = (d: number) => `11/${4 + d}`;

describe("指示簿の行", () => {
  it("writes the line with its category, unless the text already starts with it", () => {
    expect(lineLabel(line())).toBe("安静：病棟内フリー");
    expect(lineLabel(line({ text: "安静度：病棟内フリー" }))).toBe("安静度：病棟内フリー");
  });

  it("holds from its start to its end, its stop, or on without end", () => {
    const open = line();
    expect(lineEndDay(open)).toBeNull();
    expect(lineOn(open, -3)).toBe(false);
    expect(lineOn(open, -2)).toBe(true);
    expect(lineOn(open, 30)).toBe(true);
    const ended = line({ end: { day: 0 } });
    expect(lineOn(ended, 0)).toBe(true);
    expect(lineOn(ended, 1)).toBe(false);
    const stopped = line({ end: { day: 3 }, stop: { day: -1, time: "15:00", by: doc } });
    expect(lineEndDay(stopped)).toBe(-1);
    expect(lineOn(stopped, 0)).toBe(false);
  });

  it("separates the lines in force from the history", () => {
    const ls = [line({ id: "a" }), line({ id: "b", end: { day: -1 } }), line({ id: "c", stop: { day: -1, time: "15:00", by: doc } }), line({ id: "d", start: { day: 2 } })];
    expect(currentLines(ls).map((l) => l.id)).toEqual(["a", "d"]);
    expect(pastLines(ls).map((l) => l.id)).toEqual(["b", "c"]);
  });

  it("refuses an empty text and an end before the start", () => {
    expect(lineProblems({ text: " ", start: { day: 0 } })).toEqual(["指示の文を入れてください。"]);
    expect(lineProblems({ text: "x", start: { day: 0, time: "10:00" }, end: { day: 0, time: "09:00" } })).toEqual(["終了が開始より前になっています。"]);
    expect(lineProblems({ text: "x", start: { day: 0 }, end: { day: 2 } })).toEqual([]);
  });

  it("stops a line and keeps it; a stopped or field-derived line is left alone", () => {
    const ls = [line({ id: "a" }), line({ id: "f", fromFields: true })];
    const after = stopLine(ls, "a", { day: 0, time: "11:00", by: "佐藤（医師）", reason: "  " });
    expect(after[0].stop).toEqual({ day: 0, time: "11:00", by: "佐藤（医師）", reason: undefined });
    expect(after).toHaveLength(2);
    expect(stopLine(after, "a", { day: 0, time: "12:00", by: doc })[0].stop!.time).toBe("11:00");
    expect(stopLine(ls, "f", { day: 0, time: "12:00", by: doc })[1].stop).toBeUndefined();
  });
});

describe("指示簿カレンダー", () => {
  it("runs from admission (14 days at most) to three days ahead", () => {
    expect(lineCalendarDays(-3)).toEqual([-3, -2, -1, 0, 1, 2, 3]);
    expect(lineCalendarDays(-30)[0]).toBe(-14);
  });

  it("groups the lines by category in the hospital's order, earliest start first", () => {
    const rows = calendarRows([line({ id: "o", cat: "その他" }), line({ id: "v2", cat: "バイタル", start: { day: 0, time: "09:00" } }), line({ id: "v1", cat: "バイタル", start: { day: -3, time: "09:00" } }), line({ id: "r", cat: "安静" })]);
    expect(rows.map((g) => g.cat)).toEqual(["安静", "バイタル", "その他"]);
    expect(rows[1].lines.map((l) => l.id)).toEqual(["v1", "v2"]);
    expect(LINE_CATS).toEqual(["安静", "ADL", "食事", "清潔", "排泄", "観察", "バイタル", "呼出基準", "処置", "検査", "頓用", "その他"]);
  });

  it("draws the bar: the start time on the first day, the stop on the last, continuing past the last column", () => {
    const stopped = line({ stop: { day: 0, time: "11:00", by: doc } });
    expect(barCell(stopped, -2, 3)).toMatchObject({ on: true, first: true, last: false, label: "10:00" });
    expect(barCell(stopped, 0, 3)).toMatchObject({ on: true, last: true, label: "中止 11:00", continues: false });
    expect(barCell(stopped, 1, 3).on).toBe(false);
    expect(barCell(line(), 3, 3)).toMatchObject({ on: true, continues: true, label: "" });
    expect(barCell(line({ end: { day: 3, time: "12:00" } }), 3, 3)).toMatchObject({ last: true, continues: false, label: "〜12:00" });
    expect(barCell(line({ start: { day: 0, time: "10:00" }, stop: { day: 0, time: "11:00", by: doc } }), 0, 3).label).toBe("10:00 中止 11:00");
  });
});

describe("項目で選ぶ指示簿を行にする", () => {
  const v1: StandingOrders = { ...emptyStanding(doc, { day: -3, time: "10:00" }), rest: "ベッド上安静", bath: "清拭", calls: [{ key: "spo2", value: 92 }], callConscious: true };
  const v2: StandingOrders = { ...v1, rest: "病棟内歩行", bath: null, by: "佐藤（医師）", at: { day: -1, time: "09:00" } };

  it("opens a line per field and closes it when a later version changes or drops the field", () => {
    const ls = linesFromFields([v1, v2]);
    const rest = ls.filter((l) => l.cat === "安静");
    expect(rest.map((l) => [l.text, l.start.day, l.end?.day ?? null, l.by])).toEqual([
      ["安静度：ベッド上安静", -3, -1, doc],
      ["安静度：病棟内歩行", -1, null, "佐藤（医師）"],
    ]);
    const bath = ls.find((l) => l.cat === "清潔")!;
    expect(bath.end).toEqual({ day: -1, time: "09:00" });
    const calls = ls.filter((l) => l.cat === "呼出基準");
    expect(calls).toHaveLength(1);
    expect(calls[0].text).toBe("医師を呼ぶ：SpO2 92%未満、意識レベルの低下");
    expect(calls[0].end).toBeUndefined();
    expect(ls.every((l) => l.fromFields)).toBe(true);
  });

  it("gives the fictional patients their lines, with a stopped one as history", () => {
    const all = initialLines();
    expect(Object.keys(all)).toHaveLength(4);
    expect(all["90010198"].filter((l) => l.stop)).toHaveLength(1);
    expect(INITIAL_LINE_IDS.has("sl-198-1")).toBe(true);
  });
});

describe("指示受け", () => {
  const patient = { id: "p1", name: "架空 花子", admittedOn: -3 } as unknown as Patient;
  const people = [{ patient, room: "501A", entries: [] }];

  it("makes a change for a new line of this session and for a stop, not for the fictional record", () => {
    const lines = {
      p1: [line({ id: "old", at: { day: -3, time: "10:00" } }), line({ id: "new", cat: "観察", text: "尿量を測る", start: { day: 0 }, at: { day: 0, time: "10:00" } }), line({ id: "stp", stop: { day: 0, time: "10:30", by: "佐藤（医師）", reason: "歩けるようになった" } })],
    };
    const ch = lineChanges(people, lines, new Set(["old", "stp"]), -1440, 11 * 60, fmt);
    expect(ch.map((c) => [c.key, c.text.main, c.text.detail, c.text.author])).toEqual([
      ["new|新規", "観察：尿量を測る", "11/4から（変えるまで）", doc],
      ["stp|中止", "中止：安静：病棟内フリー", "11/4 10:30 中止　理由：歩けるようになった", "佐藤（医師）"],
    ]);
    expect(ch.every((c) => c.kind === "指示簿" && c.patientId === "p1" && c.room === "501A")).toBe(true);
    // A line written after now (the clock has not reached it) waits.
    expect(lineChanges(people, lines, new Set(["old", "stp"]), -1440, 9 * 60, fmt)).toHaveLength(0);
  });
});

describe("テンプレート", () => {
  it("has block templates with valid categories and unique ids", () => {
    for (const t of HOSPITAL_LINE_TEMPLATES) expect(LINE_CATS).toContain(t.cat);
    expect(new Set(HOSPITAL_LINE_TEMPLATES.map((t) => t.id)).size).toBe(HOSPITAL_LINE_TEMPLATES.length);
  });

  it("refuses an empty or duplicate template of one's own", () => {
    const mine = [{ id: "m1", cat: "安静" as const, text: "安静度：病棟内フリー" }];
    expect(templateProblems("安静", "", mine)).toEqual(["文を入れてください。"]);
    expect(templateProblems("安静", "安静度：病棟内フリー ", mine)).toEqual(["同じ文のテンプレートがあります。"]);
    expect(templateProblems("食事", "安静度：病棟内フリー", mine)).toEqual([]);
  });
});
