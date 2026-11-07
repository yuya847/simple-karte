import { describe, expect, it } from "vitest";
import { insertIntoO, vitalLine, vitalsIn } from "./vitals-text";
import type { VitalSign } from "./types";

const today = { y: 2026, m: 11, d: 3 };
const v = (day: number, time: string, bt: number): VitalSign => ({ day, time, bt, hr: 88, sbp: 122, dbp: 70, rr: 16, spo2: 97, o2: "室内気" });

describe("vitals as text", () => {
  it("writes one line per measurement", () => {
    expect(vitalLine(v(0, "07:00", 37.6), today)).toBe("11/3 07:00 BT 37.6℃ HR 88 BP 122/70 RR 16 SpO2 97%（室内気）");
    expect(vitalLine({ day: 0, time: "08:00", hr: 100, avpu: "C" }, today)).toBe("11/3 08:00 HR 100 意識 新たな混乱");
  });

  it("picks the range", () => {
    const vs = [v(-1, "06:00", 38), v(-1, "18:00", 37.9), v(0, "07:00", 37.6)];
    const now = 10 * 60;
    expect(vitalsIn(vs, "latest", now, null).map((x) => x.time)).toEqual(["07:00"]);
    expect(vitalsIn(vs, "today", now, null)).toHaveLength(1);
    expect(vitalsIn(vs, "24h", now, null).map((x) => x.time)).toEqual(["18:00", "07:00"]);
    expect(vitalsIn(vs, "day", now, -1)).toHaveLength(2);
    expect(vitalsIn(vs, "day", now, null)).toEqual([]);
  });

  it("puts the lines into O)", () => {
    expect(insertIntoO("S)\nO)\nA)\nP)\n", "11/3 07:00 BT 37.6℃")).toBe("S)\nO) 11/3 07:00 BT 37.6℃\nA)\nP)\n");
    expect(insertIntoO("S) 痛い\nO) 創部きれい\nA)\nP)\n", "a\nb")).toBe("S) 痛い\nO) 創部きれい\na\nb\nA)\nP)\n");
    expect(insertIntoO("夜間良眠", "a")).toBe("夜間良眠\na\n");
  });
});

it("最新に未来の測定を出さない",()=>{
  const vs=[{day:0,time:"10:18",bt:37},{day:0,time:"18:00",bt:39}];
  expect(vitalsIn(vs,"latest",618,null)).toEqual([vs[0]]);
});
