import { SCENARIOS } from "../scenarios";
import { describe, expect, it } from "vitest";
import { admitExistingPatient, admissionIcuRecords, INITIAL_REQUESTS } from "../admission";
import { buildWorksheet } from "../worksheet";
import { handoffFacts } from "../handoff";
import { dischargeChecks } from "../discharge";
import { orderLines } from "../format";
import { icuFixture, icuPatient, norad } from "./test-fixture";
import { emptyIcuRecords } from "./types";
import { hourlyBalance } from "./balance";
import { hourlyObservations, hourlyObservationText } from "./hourly-observations";
import { currentOxygen, currentVital } from "./current-oxygen";
import { infusionOrderEntry } from "./infusion-orders";
import { mlPerHFromGamma } from "./gamma";
const today = { y: 2026, m: 11, d: 7 };

describe("ICU点検の回帰", () => {
  it("救急の記事の所属とIDを残し、ICU/HCU入室からの累積を作る", () => {
    const p = { ...icuPatient, id: "99000112", ward: "救急外来", department: "救急科", history: [{ kind: "note" as const, day: 0, time: "08:40", role: "医師" as const, author: "救急医", text: "救急の記事" }] };
    for (const room of ["ICU7", "HCU7"]) {
      const { patient } = admitExistingPatient(p, INITIAL_REQUESTS[0], {room, bed:""}, "12:00");
      expect(patient.history[0]).toMatchObject({recordedDepartment:"救急科",recordedPlace:"救急外来",time:"08:40"});
      let r = admissionIcuRecords(emptyIcuRecords(), patient.id, INITIAL_REQUESTS[0], room, "12:00");
      r = { ...r, hourly: [{id:"u",patientId:p.id,at:{day:0,time:"13:00"},by:"看護師",urineMl:30}] };
      expect(r.stays[0]).toMatchObject({patientId:p.id,in:{day:0,time:"12:00"},from:"救急外来"});
      expect(hourlyBalance(patient,r,0,840)[13].sinceAdmissionMl).toBe(-30);
      const justArrived = admissionIcuRecords(emptyIcuRecords(), patient.id, INITIAL_REQUESTS[0], room, "12:17");
      expect(hourlyBalance(patient, justArrived, 0, 737)[12].sinceAdmissionMl).toBe(0);
      expect(admissionIcuRecords(r,p.id,INITIAL_REQUESTS[0],room,"12:00").stays).toHaveLength(1);
    }
    expect(p.history[0]).not.toHaveProperty("recordedPlace");
  });
  it("入室前・記録済・他患者を除き、現在までの未実施と未来の予定を既存行に渡す", () => {
    const r=icuFixture(); r.stays=[{...r.stays[0],in:{day:0,time:"12:30"}}];
    r.hourly=[{id:"h",patientId:icuPatient.id,at:{day:0,time:"15:00"},by:"看護師",urineMl:0}];
    expect(hourlyObservations(icuPatient,r,720,1020,900)).toEqual([{at:780,missing:true},{at:840,missing:true},{at:960,missing:false}]);
    const row=buildWorksheet([{patient:icuPatient,room:"ICU1",entries:[],icu:r}],720,1020,900).running[0];
    expect(row.main).toBe("毎時の観察");expect(row.detail).toBe("13時・14時が未　16時予定");
    expect(hourlyObservations({...icuPatient,ward:"5階東"},r,720,1020,900)).toEqual([]);
  });
  it("現在の酸素だけを最新設定にし、採血時P/Fと保存済バイタルを保つ", () => {
    const r=icuFixture();r.vents.push({...r.vents[0],id:"new",at:{day:0,time:"09:00"},fio2:.35});
    const oxygen=currentOxygen(r,icuPatient.id,600);
    expect(oxygen).toContain("FiO2 0.35");
    const v={...icuPatient.vitals[0],o2:"FiO2 0.4"};expect(currentVital(v,{currentOxygen:oxygen}).o2).toContain("0.35");expect(v.o2).toBe("FiO2 0.4");
    const facts=handoffFacts({patient:{...icuPatient,currentOxygen:oxygen},room:"ICU1",entries:[],icu:r},600,today).join("\n");
    for(const text of ["持続投与：","mL/時","FiO2 0.35","P/F 400","RASS","SOFA（今日）","24時間の出納","CVC","3日目"]) expect(facts).toContain(text);
  });
  it("0.08γの精度は保存し、記事の速さと退院点検を事実の文にする", () => {
    const rate=mlPerHFromGamma(.08,.1,68)!;
    const order=infusionOrderEntry({...norad,drugCode:SCENARIOS.icu.infusions[0].drugCode,changes:[{...norad.changes[0],rateMlPerH:rate}]},"医師");
    expect(order.order.type === "injection" && order.order.rateMlPerH).toBe(rate);
    expect(orderLines(order.order,today).detail).not.toContain("3.264");
    expect(JSON.stringify(orderLines(order.order,today))).toContain("3.3mL/時");
    const text=dischargeChecks(icuPatient,[order],[]).join("\n");
    expect(text).toContain("退院の時点で有効な注射：");expect(text).not.toMatch(/中止する|内服に変える|決める/);
  });
});

it("夜勤の観察予定は翌日を区別して短い行にする", () => {
  expect(hourlyObservationText([{at:780,missing:true},{at:840,missing:true},{at:1380,missing:false},{at:1440,missing:false},{at:1500,missing:false},{at:1560,missing:false}],0)).toBe("13時・14時が未　23時・翌0〜2時予定");
});
it("申し送りは終了CRRT・抜去ライン・未来値を含めない", async () => {
  const { icuHandoffFacts } = await import("./handoff");
  const r=icuFixture();
  r.crrt=[{id:"c",patientId:icuPatient.id,at:{day:0,time:"08:00"},by:"技士",mode:"CHDF",qb:100,qd:500,qf:300,removalMlPerH:50,anticoag:{drug:"なし",ratePerH:0,unit:"mg/h"},access:"右大腿",end:{day:0,time:"11:00"}}];
  r.hourly.push({id:"rass",patientId:icuPatient.id,at:{day:0,time:"09:00"},rass:-1,by:"看護師"},{id:"future",patientId:icuPatient.id,at:{day:0,time:"11:00"},rass:4,by:"看護師"});
  r.lines[0].removedAt={day:0,time:"11:00"};
  const before=icuHandoffFacts(icuPatient,r,600).join("\n");
  expect(before).toContain("QD 500.0mL/時・QF 300.0mL/時");expect(before).toContain("RASS -1");expect(before).toContain("CVC");
  const after=icuHandoffFacts(icuPatient,r,660).join("\n");
  expect(after).not.toContain("CRRT：");expect(after).not.toContain("CVC");
});
