import { describe, expect, it } from "vitest";
import { awayOn, eventChoices, hospitalDayText, podCell, sinceCell } from "./flow-days";
import { PATIENTS } from "./patients";
import type { OrderEntry } from "./types";

describe("経過表の日付の欄", () => {
  it("病日: the admission day is 1日目", () => {
    expect(hospitalDayText(-3, -3)).toBe("1日目");
    expect(hospitalDayText(-3, 0)).toBe("4日目");
    expect(hospitalDayText(-3, -4)).toBe("");
  });

  it("術後日数: 手術日 = 0, then 術後1日 …; a booked operation is 手術予定", () => {
    const done = [{ day: -2, procedure: "切開排膿", status: "退室" as const, start: "13:30" }];
    expect(podCell(done, -3)).toBeNull();
    expect(podCell(done, -2)?.text).toBe("手術日");
    expect(podCell(done, 0)?.text).toBe("術後2日");
    const booked = [{ day: 1, procedure: "デブリードマン", status: "申込" as const, start: null }];
    expect(podCell(booked, 1)?.text).toBe("手術予定");
    expect(podCell(booked, 0)).toBeNull();
    // A second operation restarts the count.
    expect(podCell([...done, { day: 0, procedure: "再手術", status: "退室" as const, start: "09:00" }], 1)?.text).toBe("術後1日");
  });

  it("外泊中 on the days between going out and coming back", () => {
    const leave: OrderEntry = {
      kind: "order",
      id: "lv",
      day: -1,
      time: "10:00",
      author: "医師",
      status: "有効",
      order: { type: "procedure", code: "PROC-LEAVE", schedule: { kind: "once" }, start: { day: 0 }, leave: { kind: "外泊", from: { day: 0, time: "10:00" }, back: { day: 3, time: "15:00" }, destination: "自宅", note: "" } },
    };
    expect(awayOn([leave], 0)).toBeNull();
    expect(awayOn([leave], 1)?.text).toBe("外泊中");
    expect(awayOn([leave], 2)?.text).toBe("外泊中");
    expect(awayOn([leave], 3)).toBeNull();
    expect(awayOn([{ ...leave, status: "中止" }], 1)).toBeNull();
  });

  it("days since a chosen day: 当日, +1日 …", () => {
    const ev = { day: -2, label: "CEZ 開始" };
    expect(sinceCell(ev, -3)).toBeNull();
    expect(sinceCell(ev, -2)?.text).toBe("当日");
    expect(sinceCell(ev, 0)?.text).toBe("+2日");
  });

  it("choices: the start of each injection and procedure of the stay", () => {
    const sakura = PATIENTS.find((p) => p.id === "90010231")!;
    const orders = sakura.history.filter((e): e is OrderEntry => e.kind === "order");
    const choices = eventChoices(orders, [{ day: 1, procedure: "切開排膿" }], sakura.admittedOn);
    expect(choices.length).toBeGreaterThan(0);
    expect(choices.every((c) => c.day >= sakura.admittedOn && c.day <= 1)).toBe(true);
    expect(choices.some((c) => c.label === "切開排膿" && c.day === 1)).toBe(true);
    expect(choices.some((c) => c.label.endsWith("開始"))).toBe(true);
  });
});
