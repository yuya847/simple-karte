import { describe, expect, it } from "vitest";
import { INITIAL_CARE_ORDERS, initialCareRecords } from "./care-orders";
import { glucoseDayCell, glucosePoints, insulinDoses, insulinOrders, isGlucoseCare, medCell, oralSlots, timedOral, timingsOf } from "./flow-meds";
import { abs } from "./flowsheet";
import type { AdminRecord } from "./mar";
import { PATIENTS } from "./patients";
import type { OrderEntry } from "./types";

const ordersOf = (id: string) => PATIENTS.find((p) => p.id === id)!.history.filter((e): e is OrderEntry => e.kind === "order");
const kita = ordersOf("90010198");
const now = abs(0, "10:00");
const start = abs(0, "09:00");

describe("経過表の内服", () => {
  it("timed oral orders only (not 頓用, not 退院時処方), by timing", () => {
    expect(timedOral(kita).every((e) => e.order.type === "prescription" && e.order.category !== "退院時")).toBe(true);
    expect(timingsOf(kita)).toEqual(["朝", "夕"]);
    expect(timingsOf(ordersOf("90010231"))).toEqual(["朝"]);
  });

  it("済 before this session (the earlier shifts), then what the nurses record", () => {
    const yesterday = oralSlots(kita, -1, "朝", {}, start, now);
    expect(yesterday.slots.length).toBe(4);
    expect(medCell(yesterday.slots, yesterday.stopped)?.text).toBe("済");
    const at = abs(0, "08:00");
    const rec = (orderId: string, status: AdminRecord["status"]): AdminRecord => ({ key: `${orderId}|${at}`, orderId, patientId: "90010198", at, status, doneAt: "09:40", by: "看護師 佐藤", checked: { patient: true, label: true }, ...(status === "未実施" ? { reason: "患者が拒否" as const } : {}) });
    // This session began 07:00: today's 朝 (08:00) waits for a record.
    const early = abs(0, "07:00");
    expect(medCell(oralSlots(kita, 0, "朝", {}, early, now).slots, [])?.text).toBe("未");
    const some = { [`kita-ena|${at}`]: rec("kita-ena", "実施") };
    expect(medCell(oralSlots(kita, 0, "朝", some, early, now).slots, [])?.text).toBe("未3");
    const refused = { ...some, [`kita-biso|${at}`]: rec("kita-biso", "未実施") };
    const c = medCell(oralSlots(kita, 0, "朝", refused, early, now).slots, [])!;
    expect(c.text).toBe("不可");
    expect(c.title).toContain("患者が拒否");
    // Tonight's 夕 is ahead.
    expect(medCell(oralSlots(kita, 0, "夕", {}, early, now).slots, [])).toMatchObject({ text: "・", tone: "plan" });
  });

  it("中止 on the day an order was stopped", () => {
    const oura = ordersOf("90010244");
    const s = oralSlots(oura, -1, "朝", {}, start, now);
    expect(s.slots).toEqual([]);
    expect(medCell(s.slots, s.stopped)).toMatchObject({ text: "中止", tone: "stop" });
    expect(s.stopped[0]).toContain("絶食のため休薬");
    expect(medCell(oralSlots(oura, 0, "朝", {}, start, now).slots, [])).toBeNull();
  });
});

describe("経過表の血糖・インスリン", () => {
  it("glucose from the 血糖測定 observations and the laboratory's Glu", () => {
    const pts = glucosePoints(INITIAL_CARE_ORDERS, initialCareRecords(), [{ day: 0, time: "06:00", values: { Glu: 132 } }]);
    expect(INITIAL_CARE_ORDERS.filter(isGlucoseCare).map((o) => o.patientId)).toEqual(["90010231"]);
    expect(glucoseDayCell(pts, -2)?.text).toBe("186/214/198");
    expect(glucoseDayCell(pts, 0)?.title).toContain("検体検査 Glu 132");
    expect(glucoseDayCell(pts, -3)).toBeNull();
  });

  it("a taken-back record and words are left out", () => {
    const o = INITIAL_CARE_ORDERS.find((x) => x.id === "co-231-bg")!;
    const base = { orderId: o.id, patientId: o.patientId, status: "実施" as const, doneAt: "07:30", writtenAt: "07:31", by: "看護師" };
    const pts = glucosePoints([o], [{ ...base, key: "a", at: 450, value: "測れず" }, { ...base, key: "b", at: 690, value: "203", voided: { by: "x", at: "12:00", reason: "r" } }, { ...base, key: "c", at: 1050, value: "176" }], []);
    expect(pts.map((p) => p.value)).toEqual([176]);
  });

  it("no insulin in the fictional master: no insulin rows", () => {
    expect(PATIENTS.flatMap((p) => insulinOrders(p.history.filter((e): e is OrderEntry => e.kind === "order")))).toEqual([]);
  });
});

it("品名にインスリンを含まないヒューマリンもMARから2単位を経過表へ出す", async () => {
  const { DRUGS } = await import("./master");
  const drug = DRUGS.find(d => d.name.includes("ヒューマリン") && d.category === "インスリン")!;
  expect(drug).toBeDefined();
  const e: OrderEntry = {kind:"order",id:"insulin",day:0,time:"08:00",author:"医師",status:"有効",order:{type:"injection",items:[{drugCode:drug.code,amount:2,unit:"単位"}],route:"皮下注",schedule:{kind:"once"},start:{day:0,time:"08:00"}}};
  const record: AdminRecord = {checked: {patient:true,label:true},key:"insulin|600",orderId:e.id,patientId:"p",at:600,status:"実施",doneAt:"10:00",by:"看護師",insulin:{glucose:180,units:2}};
  expect(insulinOrders([e])).toEqual([e]);
  expect(insulinDoses(e,0,1440,{[record.key]:record},540,660).find(d => d.at === 600)?.record?.insulin?.units).toBe(2);
});

it("同じ時刻・値・記録者の血糖をまとめ、近い患者の観察だけを再利用する",async()=>{
  const {recentGlucose}=await import("./flow-meds");
  const o=INITIAL_CARE_ORDERS.find(isGlucoseCare)!;
  const r={key:"obs",orderId:o.id,patientId:o.patientId,at:618,measuredAt:618,status:"実施" as const,value:"180",doneAt:"10:18",writtenAt:"10:18",by:"看護師 佐藤"};
  const mar:AdminRecord={key:"ins|618",orderId:"ins",patientId:o.patientId,at:618,status:"実施",doneAt:"10:18",by:r.by,checked:{patient:true,label:true},insulin:{glucose:180,units:2,measuredAt:618}};
  expect(glucosePoints([o],[r],[],[mar])).toHaveLength(1);
  expect(recentGlucose([o],[r],o.patientId,648)).toBe(r);
  expect(recentGlucose([o],[r],o.patientId,649)).toBeUndefined();
  expect(recentGlucose([o],[r],"other",618)).toBeUndefined();
  expect(glucosePoints([o],[r,{...r,key:"different",value:"200"}],[],[{...mar,insulin:{...mar.insulin!,glucoseKey:r.key}}]).map(p=>p.id)).toEqual(["obs","different"]);
});
