import { describe, expect, it } from "vitest";
import { injectionCell, prescriptionCell, upcomingToday } from "./calendar";
import { abs, fluidInWindow, fluidByDay } from "./flowsheet";
import { occurrencesOn } from "./order-execute";
import { PATIENTS } from "./patients";
import type { OrderEntry } from "./types";

const sakura = PATIENTS[0];
const kitamura = PATIENTS.find((p) => p.id === "90010198")!;
const order = (p: typeof sakura, id: string) => p.history.find((e): e is OrderEntry => e.kind === "order" && e.id === id)!;
const now = abs(0, "09:00");

const vcm: OrderEntry = {
  kind: "order",
  id: "vcm",
  day: 0,
  time: "09:00",
  author: "",
  status: "有効",
  order: {
    type: "injection",
    items: [
      { drugCode: "INJ-VCM05", amount: 1, unit: "g" },
      { drugCode: "INJ-NS100", amount: 100, unit: "mL" },
    ],
    route: "点滴静注",
    schedule: { kind: "every_hours", hours: 12 },
    start: { day: 0, time: "18:00" },
  },
};

describe("injection calendar cells", () => {
  it("lists timed doses, done before now and planned after", () => {
    const cez = order(sakura, "sakura-cez");
    expect(injectionCell(cez, 0, now).doses).toEqual([
      { time: "07:30", state: "done" },
      { time: "15:30", state: "planned" },
      { time: "23:30", state: "planned" },
    ]);
    expect(injectionCell(vcm, 1, now).doses.map((d) => d.time)).toEqual(["06:00", "18:00"]);
  });

  it("marks the stop and drops later doses", () => {
    const stopped = { ...order(sakura, "sakura-cez"), status: "中止" as const, stoppedOn: 0 };
    const today = injectionCell(stopped, 0, now);
    expect(today.stopped).toEqual({ time: "09:00" });
    expect(today.doses.map((d) => d.time)).toEqual(["07:30"]);
    expect(injectionCell(stopped, 1, now).running).toBe(false);
  });

  it("shows a continuous fluid as the day's volume", () => {
    const veenF = order(sakura, "sakura-veenf");
    expect(injectionCell(veenF, -3, now).infusion).toEqual({ volumeMl: 380, state: "done" });
    expect(injectionCell(veenF, 0, now).infusion).toEqual({ volumeMl: 1000, state: "now" });
    expect(injectionCell(veenF, 1, now).infusion?.state).toBe("planned");
  });
});

describe("prescription calendar cells", () => {
  it("starts a home drug at its first timing", () => {
    const amlo = order(sakura, "sakura-amlo");
    expect(prescriptionCell(amlo, -3, now).slots).toEqual([{ timing: "朝", state: null }]);
    expect(prescriptionCell(amlo, -2, now).slots).toEqual([{ timing: "朝", state: "done" }]);
    expect(prescriptionCell(amlo, 1, now).slots).toEqual([{ timing: "朝", state: "planned" }]);
  });

  it("ends a fixed course after its days", () => {
    const mgo = order(kitamura, "kita-mgo"); // 7 days from day -3 evening
    expect(prescriptionCell(mgo, -3, now).slots.map((s) => s.state)).toEqual([null, "done"]);
    expect(prescriptionCell(mgo, 0, now).slots.map((s) => s.state)).toEqual(["done", "planned"]);
    expect(prescriptionCell(mgo, 4, now).slots.map((s) => s.state)).toEqual(["planned", null]);
  });

  it("shows when an as-needed drug was used", () => {
    const apap = order(sakura, "sakura-apap");
    expect(prescriptionCell(apap, -3, now).prnUses).toEqual(["20:15"]);
    expect(prescriptionCell(apap, -3, now).slots).toEqual([]);
  });
});

describe("upcoming today", () => {
  it("lists draws and timed doses still ahead, in time order", () => {
    const draw: OrderEntry = {
      kind: "order",
      id: "l",
      day: 0,
      time: "09:00",
      author: "",
      status: "有効",
      order: { type: "lab", codes: ["LAB-CBC"], collect: { day: 1, time: "06:00" }, priority: "定時" },
    };
    expect(upcomingToday([order(sakura, "sakura-cez"), vcm, draw], now)).toEqual(["15:30 CEZ", "18:00 VCM", "23:30 CEZ"]);
  });
});


describe("旧オーダの投与時刻の共有", () => {
  it("北村のラシックスも既定時刻をカレンダーと実施メニューで共有する", () => {
    const e = kitamura.history.find((e): e is OrderEntry => e.kind === "order" && e.order.type === "injection" && e.order.schedule.kind === "per_day" && e.order.schedule.count === 2 && e.order.items.some((it) => it.drugCode === "INJ-FRS20"))!;
    expect(e).toBeDefined();
    expect(injectionCell(e, 0, now).doses.map((d) => d.time)).toEqual(["10:00", "22:00"]);
    expect(occurrencesOn(kitamura, e, 0, now).timed.map((i) => i.at)).toEqual([600, 1320]);
    expect(occurrencesOn(kitamura, e, 0, now).untimed).toBeNull();
  });
});

it("250mL・125mL毎時・毎日10時2日間は各日250mL、翌々日は0", () => {
  const e: OrderEntry = { ...vcm, order: { type: "injection", items: [{ drugCode: "INJ-NS100", amount: 250, unit: "mL" }], route: "点滴静注", schedule: { kind: "per_day", count: 1 }, rateMlPerH: 125, start: { day: 0, time: "10:00" }, doseTimes: ["10:00"], days: 2 } };
  expect([0,1,2].map(day => injectionCell(e, day, now).infusion?.volumeMl ?? 0)).toEqual([250,250,0]);
  expect(fluidInWindow([e], 600, 660, now)).toBeCloseTo(125);
  expect(fluidInWindow([e], 720, 1440, now)).toBe(0);
  expect(injectionCell(e, 0, 780).infusion?.state).toBe("done");
  const crossing: OrderEntry = { ...e, order: { ...e.order as import("./types").InjectionOrder, start: { day: 0, time: "23:00" }, doseTimes: ["23:00"], days: 1 } };
  expect([0,1,2].map(day => Math.round(fluidInWindow([crossing], day*1440, (day+1)*1440, now)))).toEqual([125,125,0]);
  expect(fluidByDay([crossing], [0,1,2], now)).toEqual({0:125,1:125,2:0});
  expect(fluidInWindow([{...crossing,status:"中止",stoppedOn:1,stoppedTime:"00:30"}],1440,2880,now)).toBeCloseTo(62.5);
});

it("未来に開始する注射の中止時刻は24時未満で、投与を出さない",()=>{
  const e:OrderEntry={...vcm,status:"中止",stoppedOn:0,stoppedTime:"10:18",order:{...vcm.order as import("./types").InjectionOrder,start:{day:1,time:"10:00"},days:3}};
  expect(injectionCell(e,0,618)).toMatchObject({running:false,doses:[],stopped:{time:"10:18",beforeStart:true}});
  expect(injectionCell(e,1,618).doses).toEqual([]);
});
