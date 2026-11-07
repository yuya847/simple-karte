import { describe, expect, it } from "vitest";
import { withToday } from "./daily-input";
import { abs } from "./flowsheet";
import { initialIo, ioDay, ioDayOf, ioLines, ioMissing, ioProblems, ioShiftAt, ioShifts, ioTotal, plannedIvMl, withIoUrine, withIcuUrine, type IoEntry } from "./io-balance";
import { marKey, type AdminRecord } from "./mar";
import { PATIENTS } from "./patients";
import { currentEntries } from "./record";
import type { OrderEntry } from "./types";

const ordersOf = (id: string) => currentEntries(PATIENTS.find((p) => p.id === id)!, undefined).filter((e): e is OrderEntry => e.kind === "order");
const typed = (x: Partial<IoEntry> & Pick<IoEntry, "side" | "kind" | "ml" | "at">): IoEntry => ({ id: `t-${x.side}-${x.kind}-${x.at}`, patientId: "P1", by: "看護師 高橋", recordedAt: "10:00", ...x });

describe("締めの時刻", () => {
  it("1日は 9:00〜翌9:00、日勤 9:00〜17:00、夜勤 17:00〜翌9:00", () => {
    expect(ioDay(0)).toMatchObject({ lo: 540, hi: 1980 });
    expect(ioShifts(0).map((w) => [w.label, w.lo, w.hi])).toEqual([
      ["日勤", 540, 1020],
      ["夜勤", 1020, 1980],
    ]);
  });
  it("a record at the close goes to the shift that closes then", () => {
    expect(ioDayOf(540)).toBe(-1);
    expect(ioDayOf(541)).toBe(0);
    expect(ioShiftAt(1020).label).toBe("日勤");
    expect(ioShiftAt(1021).label).toBe("夜勤");
    expect(ioShiftAt(300)).toMatchObject({ label: "夜勤", lo: abs(-1, "17:00") });
  });
});

describe("合計と IN − OUT", () => {
  const lines = ioLines({
    patientId: "P1",
    entries: [],
    typed: [
      typed({ side: "IN", kind: "経口", ml: 200, at: 600 }),
      typed({ side: "OUT", kind: "尿", ml: 350, at: 700 }),
      typed({ side: "OUT", kind: "尿", ml: 150, at: 1020 }),
      typed({ side: "OUT", kind: "ドレーン", ml: 40, at: 1100, note: "右胸腔" }),
      typed({ side: "OUT", kind: "尿", ml: 999, at: 800, voided: { by: "看護師 高橋", at: "13:30", reason: "量を間違えた" } }),
    ],
    records: {},
    sessionStart: 0,
    nowAbs: 1200,
    from: 0,
  });
  it("a record taken back is not counted", () => {
    expect(lines.map((l) => l.ml)).toEqual([200, 350, 150, 40]);
  });
  it("per shift, with the sum written out", () => {
    const day = ioTotal(lines, ioShifts(0)[0]);
    expect(day).toMatchObject({ in: 200, out: 500, balance: -300 });
    expect(day.formula).toBe("IN 200（経口 200） − OUT 500（尿 500） ＝ −300mL");
  });
  it("no balance when one side has no record", () => {
    const night = ioTotal(lines, ioShifts(0)[1]);
    expect(night).toMatchObject({ in: 0, out: 40, balance: null });
    expect(night.formula).toContain("IN 記録なし");
  });
  it("24 hours", () => {
    expect(ioTotal(lines, ioDay(0))).toMatchObject({ in: 200, out: 540, balance: -340 });
  });
});

describe("点滴は注射の記録から（打ち直さない）", () => {
  const oura = ordersOf("90010244");
  const sol = oura.find((e) => e.order.type === "injection" && e.order.items[0].drugCode === "INJ-SOL3A500")!;
  const start: AdminRecord = { key: marKey(sol.id, 720), orderId: sol.id, patientId: "90010244", at: 720, status: "実施", doneAt: "12:00", by: "看護師 高橋", checked: { patient: true, label: true }, drip: { volumeMl: 500, mlPerH: 42, minutes: 714, startAt: 720 } };
  const ended: AdminRecord = { ...start, end: { at: 1000, recordedAt: "16:40", by: "看護師 高橋", full: false, leftMl: 300, givenMl: 200, reason: "中止の指示" } };
  const at = (records: Record<string, AdminRecord>) => ioLines({ patientId: "90010244", entries: oura, typed: [], records, sessionStart: 600, nowAbs: 1010, from: 540 }).filter((l) => l.kind === "点滴");
  it("a running drip is not counted yet; at 終了 the bag − 残量 goes in, at the end time", () => {
    expect(at({ [start.key]: start }).some((l) => l.orderId === sol.id && l.at > 600)).toBe(false);
    const l = at({ [ended.key]: ended }).find((x) => x.orderId === sol.id && x.at === 1000)!;
    expect(l).toMatchObject({ ml: 200, from: "点滴の記録", formula: "500mL − 残量 300mL = 200mL" });
  });
  it("the antibiotic drips of the earlier shift (fictional) count as the whole 100mL", () => {
    const abxId = oura.find((e) => e.order.type === "injection" && e.order.items[0].drugCode === "INJ-SBTABPC3")!.id;
    const abx = ioLines({ patientId: "90010244", entries: oura, typed: [], records: {}, sessionStart: 600, nowAbs: 1010, from: 0 }).filter((x) => x.orderId === abxId);
    expect(abx.length).toBeGreaterThan(0);
    expect(abx.every((x) => x.ml === 100 && x.from === "前の勤務")).toBe(true);
  });
  it("what the orders plan for a period is an estimate, kept apart", () => {
    // 500mL × 2 a day by the hour + 100mL every 6 hours: 24 hours from 09:00.
    expect(plannedIvMl(oura, ioDay(0), 1010)).toBe(1400);
  });
});

describe("尿量は1か所で入れる", () => {
  it("typed urine is added to the calendar day; older urine without a time stays", () => {
    const daily = withToday([{ day: -1, urineMl: 450 }, { day: 0 }], { urineMl: 100 });
    const out = withIoUrine(daily, [typed({ side: "OUT", kind: "尿", ml: 300, at: -600 }), typed({ side: "OUT", kind: "尿", ml: 200, at: 60 }), typed({ side: "IN", kind: "経口", ml: 500, at: 70 })]);
    expect(out.find((d) => d.day === -1)!.urineMl).toBe(750);
    expect(out.find((d) => d.day === 0)!.urineMl).toBe(300);
  });
});

describe("記録がまだの患者（指示簿で水分出納を測る）", () => {
  it("listed when nothing is typed in the shift going on now", () => {
    const ps = [
      { id: "A", io: "水分出納（IN/OUT）を測る" },
      { id: "B", io: "水分出納（IN/OUT）を測る" },
      { id: "C", io: "尿量だけ測る" },
    ];
    const t = [typed({ patientId: "B", side: "OUT", kind: "尿", ml: 100, at: 1100 })];
    expect(ioMissing(ps, t, 1200).map((x) => x.patientId)).toEqual(["A"]);
    // In the next shift B is missing again.
    expect(ioMissing(ps, t, 2000).map((x) => x.patientId)).toEqual(["A", "B"]);
  });
});

describe("入力の確かめ", () => {
  it("mL is a whole number 1–5,000 and the time is past", () => {
    expect(ioProblems({ ml: "200", at: 500, nowAbs: 600 })).toEqual([]);
    expect(ioProblems({ ml: "0", at: 500, nowAbs: 600 })).toHaveLength(1);
    expect(ioProblems({ ml: "12.5", at: 500, nowAbs: 600 })).toHaveLength(1);
    expect(ioProblems({ ml: "200", at: null, nowAbs: 600 })).toHaveLength(1);
    expect(ioProblems({ ml: "200", at: 700, nowAbs: 600 })).toHaveLength(1);
  });
});

describe("架空のデータ：北村さん（心不全）は昨日の9時から", () => {
  it("only up to now; with the 450mL before 9:00 yesterday's urine is 1,700mL", () => {
    const io = initialIo(abs(0, "10:30"));
    expect(io.every((e) => e.at <= 630 && e.at > abs(-1, "09:00"))).toBe(true);
    const p = PATIENTS.find((x) => x.id === "90010198")!;
    expect(withIoUrine(p.daily, io).find((d) => d.day === -1)!.urineMl).toBe(1700);
    const lines = ioLines({ patientId: p.id, entries: ordersOf(p.id), typed: io, records: {}, sessionStart: 630, nowAbs: 630, from: abs(-1, "09:00") });
    const t = ioTotal(lines, ioDay(-1));
    expect(t).toMatchObject({ in: 750, out: 2050, balance: -1300 });
    expect(ioMissing([{ id: p.id, io: "水分出納（IN/OUT）を測る" }], io, 630)).toEqual([]);
  });
});

it("ICU の行を共通集計し、日尿量を時間記録で置き換える", async()=>{
 const {icuFixture,icuPatient}=await import('./icu/test-fixture');
 const r=icuFixture();r.hourly=r.hourly.slice(0,2);r.hourly[0].urineMl=230;r.hourly[1].urineMl=35;
 const lines=ioLines({patientId:icuPatient.id,entries:[],typed:[],records:{},sessionStart:0,nowAbs:120,from:-1,icu:r});
 expect(lines.some(l=>l.from==='ICU 記録'&&l.what.includes('持続'))).toBe(true);
 expect(ioTotal(lines,{lo:-1,hi:120}).out).toBe(265);
 expect(withIcuUrine([{day:0,urineMl:230}],r,icuPatient.id)[0].urineMl).toBe(265);
});
it("continuous の注射は注射の枝で重ねて数えない",()=>{
 const e=structuredClone(ordersOf('90010198').find(e=>e.order.type==='injection')!);
 expect(e).toBeDefined();
 if(e.order.type!=='injection') throw new Error('injection required');
 Object.assign(e.order,{continuous:true,route:'静注',items:[{drugCode:'',amount:10,unit:'mL'}]});
 const r={orderId:e.id,patientId:'90010198',status:'実施',doneAt:'10:00',by:'看護師'} as AdminRecord;
 const args={patientId:'90010198',entries:[e],typed:[],records:{test:r},sessionStart:0,nowAbs:660,from:0};
 expect(ioLines(args)).toEqual([]);
 Object.assign(e.order,{continuous:undefined});
 expect(ioLines(args).some(l=>l.ml===10&&l.from==='注射の記録')).toBe(true);
});

it("ICU の速さの行は日・勤務をまたいでもそれぞれの窓で数える",async()=>{
 const {icuFixture,icuPatient}=await import('./icu/test-fixture');const r=icuFixture();r.hourly=[];
 const lines=ioLines({patientId:icuPatient.id,entries:[],typed:[],records:{},sessionStart:0,nowAbs:1080,from:0,icu:r});
 expect(ioTotal(lines,{lo:540,hi:1020}).in).toBeCloseTo(4.9*8);
 expect(ioTotal(lines,{lo:1020,hi:1080}).in).toBeCloseTo(4.9);
});
