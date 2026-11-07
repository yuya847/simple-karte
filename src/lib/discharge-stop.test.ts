import { initialLines } from "./standing-lines";
import { standingFromBlocks } from "./standing-blocks";
import { describe, expect, it } from "vitest";
import { chosenStops, endedStanding, remainingGroup, remainingGroups, standingInForce } from "./discharge-stop";
import { PATIENTS } from "./patients";
import { ordersOf } from "./record";
import type { Order, OrderEntry } from "./types";

const at = (h: number) => h * 60;
const entry = (id: string, order: Order, over: Partial<OrderEntry> = {}): OrderEntry => ({ kind: "order", id, day: -2, time: "09:00", author: "山本（専攻医）", status: "有効", order, ...over });
const now = at(10); // today 10:00

const iv = entry("iv", { type: "injection", items: [{ drugCode: "INJ-CEZ1", amount: 1, unit: "g" }], route: "点滴静注", schedule: { kind: "per_day", count: 3 }, start: { day: -2, time: "10:00" } });
const ivDone = entry("iv-done", { type: "injection", items: [{ drugCode: "INJ-CEZ1", amount: 1, unit: "g" }], route: "点滴静注", schedule: { kind: "per_day", count: 3 }, start: { day: -5, time: "10:00" }, days: 3 });
const rx = entry("rx", { type: "prescription", category: "定期", drugCode: "ORAL-AMLO5", amount: 1, unit: "錠", timings: ["朝"], start: { day: -2 } });
const rxEnded = entry("rx-end", { type: "prescription", category: "臨時", drugCode: "ORAL-AMLO5", amount: 1, unit: "錠", timings: ["朝"], start: { day: -4 }, days: 3 });
const home = entry("home", { type: "prescription", category: "退院時", drugCode: "ORAL-AMLO5", amount: 1, unit: "錠", timings: ["朝"], start: { day: 1 }, days: 14 });
const o2 = entry("o2", { type: "procedure", code: "PROC-O2", o2: { device: "鼻カニュラ", lpm: 1 }, schedule: { kind: "continuous" }, start: { day: -2, time: "09:00" } });
const leave = entry("leave", { type: "procedure", code: "PROC-LEAVE", leave: { kind: "退院", from: { day: 0, time: "11:00" }, destination: "自宅", note: "" }, schedule: { kind: "once" }, start: { day: 0, time: "11:00" } });
const rehab = entry("rehab", { type: "procedure", code: "PROC-REHAB", rehab: { field: "廃用症候群", therapists: ["PT"], onset: -2, goal: "歩行", cautions: "" }, schedule: { kind: "per_day", count: 1 }, start: { day: -2, time: "09:00" } });
const labLater = entry("lab-later", { type: "lab", codes: ["LAB-CBC"], collect: { day: 1, time: "06:00" }, priority: "定時" });
const labPast = entry("lab-past", { type: "lab", codes: ["LAB-CBC"], collect: { day: 0, time: "06:00" }, priority: "定時" });
const stopped = entry("stopped", { ...o2.order }, { status: "中止", stoppedOn: -1, stoppedTime: "10:00" });

describe("退院時の一括中止", () => {
  it("puts each order that would still run after now in its group", () => {
    expect(remainingGroup(iv, now)).toBe("注射");
    expect(remainingGroup(rx, now)).toBe("内服");
    expect(remainingGroup(o2, now)).toBe("処置");
    expect(remainingGroup(rehab, now)).toBe("依頼・予約");
    expect(remainingGroup(labLater, now)).toBe("検査");
  });

  it("leaves out what has ended, what was stopped, what was taken already, and what belongs to the discharge", () => {
    expect(remainingGroup(ivDone, now)).toBeNull();
    expect(remainingGroup(rxEnded, now)).toBeNull();
    expect(remainingGroup(stopped, now)).toBeNull();
    expect(remainingGroup(labPast, now)).toBeNull();
    expect(remainingGroup(home, now)).toBeNull();
    expect(remainingGroup(leave, now)).toBeNull();
  });

  it("lists only the groups with something, in a fixed order, with the 指示簿 when it is in force", () => {
    const s = standingFromBlocks(initialLines()["90010231"])!;
    const groups = remainingGroups([labLater, o2, iv, rx, home, leave], now, s);
    expect(groups.map((g) => g.key)).toEqual(["注射", "内服", "処置", "検査", "指示簿"]);
    expect(groups.find((g) => g.key === "処置")!.entries.map((e) => e.id)).toEqual(["o2"]);
  });

  it("stops only the groups the doctor confirmed", () => {
    const groups = remainingGroups([iv, rx, o2], now, standingFromBlocks(initialLines()["90010231"])!);
    expect(chosenStops(groups, ["注射", "処置"])).toMatchObject({ ids: ["iv", "o2"], standing: false });
    expect(chosenStops(groups, ["指示簿"])).toMatchObject({ ids: [], standing: true });
  });

  it("ends the 指示簿 with a version that asks for nothing", () => {
    const end = endedStanding("山本（専攻医）", { day: 0, time: "10:00" });
    expect(standingInForce(end)).toBe(false);
    expect(standingInForce(standingFromBlocks(initialLines()["90010231"])!)).toBe(true);
    expect(end.other).toBe("退院のため指示簿を終了（10:00 山本（専攻医））");
    expect(remainingGroups([], now, end)).toEqual([]);
  });

  it("finds what is still running for 佐倉さん (fictional record)", () => {
    const p = PATIENTS.find((x) => x.id === "90010231")!;
    const groups = remainingGroups(ordersOf(p.history), at(12), standingFromBlocks(initialLines()[p.id])!);
    expect(groups.length).toBeGreaterThan(0);
    expect(groups.every((g) => g.key === "指示簿" || g.entries.length > 0)).toBe(true);
  });
});

it("ICUのノルアドレナリンを一括中止の注射に含める",async()=>{
 const {SCENARIOS}=await import('./scenarios');
 const p=SCENARIOS.patients.find(p=>p.id==='99000101')!;
 const entries=p.history.filter((e):e is OrderEntry=>e.kind==='order');
 const inf=SCENARIOS.icu.infusions.find(i=>i.patientId===p.id&&i.name.includes('ノルアドレナリン'))!;
 expect(remainingGroups(entries,600).find(g=>g.key==='注射')!.entries.some(e=>e.id===inf.orderId)).toBe(true);
});
