import { describe, expect, it } from "vitest";
import {
  INITIAL_CARE_ORDERS,
  careFlowRows,
  careKey,
  careLate,
  careOpen,
  careSlots,
  careState,
  careTasks,
  careWindow,
  changeCare,
  draftFromItem,
  draftProblems,
  emptyCareDraft,
  initialCareRecords,
  lateCare,
  makeCareOrder,
  parseTimes,
  recordOf,
  recordProblems,
  scheduleLabel,
  shortSchedule,
  stopCare,
  type CareOrder,
  type CareRecord,
} from "./care-orders";

const at = (day: number, time: string) => day * 1440 + Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
const order = (o: Partial<CareOrder>): CareOrder => ({
  id: "c1",
  patientId: "p1",
  item: "口腔ケア",
  kind: "ケア",
  schedule: { kind: "times", times: ["08:30", "18:30"] },
  everyDays: 1,
  start: { day: 0, time: "00:00" },
  note: "",
  by: "看護師 佐藤",
  at: { day: 0, time: "00:00" },
  ...o,
});
const rec = (orderId: string, t: number, r: Partial<CareRecord> = {}): CareRecord => ({ key: careKey(orderId, t), orderId, patientId: "p1", at: t, status: "実施", doneAt: "10:00", writtenAt: "10:00", by: "看護師 佐藤", ...r });

describe("看護ケア指示：時刻の展開", () => {
  it("expands clock times day by day, from the start moment", () => {
    const o = order({ start: { day: 0, time: "09:00" } });
    expect(careSlots(o, 0, 2 * 1440)).toEqual([at(0, "18:30"), at(1, "08:30"), at(1, "18:30")]);
  });

  it("every N hours runs on the clock from its anchor, across midnight (night shift past 24:00)", () => {
    const o = order({ schedule: { kind: "every", hours: 2, from: "00:00" }, start: { day: 0, time: "13:00" } });
    // 夜勤 16:30〜翌9:00 = 990〜1980.
    const slots = careSlots(o, 990, 1980);
    expect(slots[0]).toBe(at(0, "18:00"));
    expect(slots.at(-1)).toBe(1440 + 8 * 60);
    expect(slots).toHaveLength(8);
    // The first slot is on or after the start (13:00 → 14:00).
    expect(careSlots(o, 0, 1440)[0]).toBe(at(0, "14:00"));
  });

  it("隔日 and 週1回 count from the start day", () => {
    const o = order({ schedule: { kind: "times", times: ["14:00"] }, everyDays: 2, start: { day: -3, time: "00:00" } });
    const days = careSlots(o, -3 * 1440, 4 * 1440).map((t) => Math.floor(t / 1440));
    expect(days).toEqual([-3, -1, 1, 3]);
    const w = order({ schedule: { kind: "times", times: ["10:00"] }, everyDays: 7, start: { day: -5, time: "00:00" } });
    expect(careSlots(w, -5 * 1440, 10 * 1440).map((t) => Math.floor(t / 1440))).toEqual([-5, 2, 9]);
  });

  it("stops at the stop time and after the last day", () => {
    const o = order({ endDay: 0 });
    expect(careSlots(o, 0, 3 * 1440)).toEqual([at(0, "08:30"), at(0, "18:30")]);
    const s = stopCare([order({})], "c1", "看護師 佐藤", { day: 0, time: "12:00" }, "不要になった")[0];
    expect(careWindow(s).to).toBe(at(0, "12:00"));
    expect(careSlots(s, 0, 3 * 1440)).toEqual([at(0, "08:30")]);
  });

  it("splits a shift into timed tasks and 必要時", () => {
    const os = [order({}), order({ id: "c2", item: "吸引", schedule: { kind: "prn" } })];
    const t = careTasks(os, at(0, "08:30"), at(0, "17:00"));
    expect(t.timed.map((x) => x.at)).toEqual([at(0, "08:30")]);
    expect(t.prn.map((x) => x.orderId)).toEqual(["c2"]);
  });

  it("labels the schedule in plain words", () => {
    expect(scheduleLabel(order({}))).toBe("1日2回 08:30・18:30");
    expect(scheduleLabel(order({ schedule: { kind: "every", hours: 2, from: "00:00" } }))).toBe("2時間ごと（0時から）");
    expect(scheduleLabel(order({ schedule: { kind: "times", times: ["14:00"] }, everyDays: 2 }))).toBe("隔日 14:00");
    expect(shortSchedule(order({ schedule: { kind: "times", times: ["10:00"] }, everyDays: 7 }))).toBe("週1回 10:00");
    expect(shortSchedule(order({ schedule: { kind: "prn" } }))).toBe("必要時");
  });
});

describe("看護ケア指示：実施の記録", () => {
  const o = order({});
  it("before the session counts as recorded by the earlier shift; after, it waits for a nurse", () => {
    const t = { orderId: "c1", at: at(0, "08:30") };
    expect(careState(t, [], at(0, "09:00"), at(0, "10:00"))).toBe("記録済み");
    expect(careState(t, [], at(0, "08:00"), at(0, "10:00"))).toBe("未入力");
    expect(careLate(t, [], at(0, "08:00"), at(0, "10:00"))).toBe(true);
    expect(careLate(t, [], at(0, "08:00"), at(0, "09:00"))).toBe(false);
    expect(careState({ orderId: "c1", at: at(0, "18:30") }, [], at(0, "08:00"), at(0, "10:00"))).toBe("予定");
    expect(careState(t, [rec("c1", t.at, { status: "未実施", reason: "患者が拒否" })], 0, at(0, "10:00"))).toBe("未実施");
  });

  it("a record taken back no longer counts, but stays", () => {
    const k = careKey("c1", at(0, "08:30"));
    const rs = [rec("c1", at(0, "08:30"), { voided: { by: "看護師 佐藤", at: "10:05", reason: "時刻を間違えた" } })];
    expect(recordOf(rs, k)).toBeUndefined();
    expect(recordOf([...rs, rec("c1", at(0, "08:30"), { doneAt: "08:40" })], k)?.doneAt).toBe("08:40");
  });

  it("an observation needs what was seen; 未実施 needs a reason; the time done cannot be later than now", () => {
    expect(recordProblems({ kind: "観察" }, { status: "実施", value: "", doneAt: "10:00" }, "10:05")).toEqual(["観察した内容"]);
    expect(recordProblems(o, { status: "未実施", doneAt: "10:00" }, "10:05")).toEqual(["未実施の理由"]);
    expect(recordProblems(o, { status: "実施", doneAt: "10:30" }, "10:05")).toEqual(["実施した時刻が今より後です"]);
    // After midnight the clock runs on (24:30).
    expect(recordProblems(o, { status: "実施", doneAt: "24:20" }, "24:30")).toEqual([]);
  });

  it("can be recorded up to an hour early", () => {
    expect(careOpen(at(0, "10:00"), at(0, "09:00"))).toBe(true);
    expect(careOpen(at(0, "10:00"), at(0, "08:59"))).toBe(false);
    expect(careOpen(null, 0)).toBe(true);
  });

  it("lists late tasks of the ward for the to-dos", () => {
    const late = lateCare([o, order({ id: "c9", patientId: "other" })], [], ["p1"], at(0, "08:00"), at(0, "10:00"));
    expect(late.map((t) => t.orderId)).toEqual(["c1"]);
    expect(lateCare([o], [rec("c1", at(0, "08:30"))], ["p1"], at(0, "08:00"), at(0, "10:00"))).toEqual([]);
  });
});

describe("看護ケア指示：出す・変える", () => {
  it("checks the draft", () => {
    const d = emptyCareDraft("10:00");
    expect(draftProblems(d)).toEqual(["項目", "時刻"]);
    expect(draftProblems({ ...d, item: "清拭", schedule: { kind: "times", times: ["25:00"] } })).toEqual(["時刻（00:00〜23:59 で）"]);
    expect(draftProblems({ ...draftFromItem("体位変換", "10:00") })).toEqual([]);
    expect(draftProblems({ ...draftFromItem("清拭", "10:00"), startDay: 2, endDay: 1 })).toEqual(["終了日が開始日より前です"]);
  });

  it("reads times written in several ways", () => {
    expect(parseTimes("8:30、12:30 18")).toEqual(["08:30", "12:30", "18:00"]);
  });

  it("never starts before it was given, and keeps the choices of an observation", () => {
    const d = { ...draftFromItem("口腔内の乾燥", "10:00"), startDay: 0, startTime: "06:00" };
    const o = makeCareOrder(d, "n1", "p1", "看護師 佐藤", { day: 0, time: "10:00" });
    expect(o.start).toEqual({ day: 0, time: "10:00" });
    expect(o.choices).toEqual(["湿潤", "乾燥", "強い乾燥"]);
  });

  it("a change stops the old order now and gives a new one; records of the old one stay under it", () => {
    const old = order({});
    const d = { ...draftFromItem("口腔ケア", "12:00"), schedule: { kind: "times" as const, times: ["12:30", "20:00"] } };
    const all = changeCare([old], "c1", d, "c1b", "看護師 佐藤", { day: 0, time: "12:00" });
    expect(all[0].stopped?.reason).toBe("変更");
    expect(all[1].replaces).toBe("c1");
    expect(careSlots(all[0], 0, 1440)).toEqual([at(0, "08:30")]);
    expect(careSlots(all[1], 0, 1440)).toEqual([at(0, "12:30"), at(0, "20:00")]);
  });
});

describe("看護ケア指示：経過表の行", () => {
  it("past days show 済 or what was seen; later days a dot with the count", () => {
    const obs = order({ id: "o1", item: "口腔内の乾燥", kind: "観察", choices: ["湿潤", "乾燥"], schedule: { kind: "times", times: ["10:00"] }, start: { day: -2, time: "00:00" } });
    const care = order({ id: "c1", start: { day: -2, time: "00:00" } });
    const rs = [rec("o1", at(-2, "10:00"), { value: "乾燥" }), rec("c1", at(-1, "08:30"), { status: "未実施", reason: "患者が拒否" })];
    const rows = careFlowRows([obs, care], rs, [-2, -1, 0, 1], at(0, "12:00"), at(-1, "12:00"));
    const o = rows.find((r) => r.label === "口腔内の乾燥")!;
    expect(o.sub).toBe("10:00");
    expect(o.cells[-2].text).toBe("乾燥");
    expect(o.cells[1].text).toBe("・");
    const c = rows.find((r) => r.label === "口腔ケア")!;
    expect(c.cells[-2].text).toBe("済");
    // -1: 08:30 未実施, 18:30 after the session began and not recorded.
    expect(c.cells[-1]).toMatchObject({ text: "不可", tone: "not" });
    // 0: 08:30 is past and not recorded yet; 18:30 is ahead.
    expect(c.cells[0]).toMatchObject({ text: "未", tone: "late" });
    expect(c.cells[0].title).toContain("18:30 予定");
    expect(c.cells[1].text).toBe("・2回");
    // 必要時 shows how many times it was done that day.
    const prn = order({ id: "s1", item: "吸引", schedule: { kind: "prn" }, start: { day: -2, time: "00:00" } });
    const p = careFlowRows([prn], [rec("s1", at(-1, "23:10"), { doneAt: "23:10" })], [-1, 0], at(0, "12:00"), at(0, "08:00"))[0];
    expect(p.cells[-1].text).toBe("1回");
    expect(p.cells[0]).toBeUndefined();
  });
});

describe("看護ケア指示：架空のデータ", () => {
  it("the 誤嚥性肺炎 patient has 口腔ケア and 体位変換; seeded records match a scheduled time", () => {
    const items = INITIAL_CARE_ORDERS.filter((o) => o.patientId === "90010244").map((o) => o.item);
    expect(items).toEqual(expect.arrayContaining(["口腔ケア", "体位変換"]));
    for (const r of initialCareRecords()) {
      const o = INITIAL_CARE_ORDERS.find((x) => x.id === r.orderId)!;
      expect(r.at).toBeLessThan(0);
      if (o.schedule.kind !== "prn") expect(careSlots(o, r.at, r.at + 1)).toEqual([r.at]);
      expect(draftProblems({ ...emptyCareDraft("00:00"), item: o.item, kind: o.kind, choices: o.choices ?? [], schedule: o.schedule, everyDays: o.everyDays })).toEqual([]);
    }
  });
});
