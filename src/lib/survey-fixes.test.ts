import { expect, it } from "vitest";
import { latestWeight, estimatedCcr } from "./clinical";
import { can, ROLES } from "./roles";
import { canRoundTeam, teamOf } from "./teams";
import { infectionFlags } from "./specialist";
import { specialistTileBlocks } from "./specialist-tools";
import { scheduleTextFor } from "./format";
import { ORAL_DRUGS } from "./master";
import { toPrescriptionOrders } from "./rx";
import type { PrescriptionDraft } from "./rx";
import { icuPatient, icuFixture } from "./icu/test-fixture";
import { hourlyBalance } from "./icu/balance";

it("ICT・歯科衛生士の受付は担当チームに限り、依頼・医師の採否権限を増やさない", () => {
  for (const role of ROLES) {
    expect(can(role, "team.round")).toBe(["医師", "看護師", "薬剤師", "臨床検査技師", "管理栄養士", "MSW", "ICT", "歯科衛生士", "デバッグ"].includes(role));
    if (role === "ICT" || role === "歯科衛生士") {
      expect(can(role, "team.round")).toBe(true);
      expect(can(role, "team.request")).toBe(false);
      expect(can(role, "team.decide")).toBe(false);
      expect(specialistTileBlocks(role).team).toBeUndefined();
    }
  }
  expect(canRoundTeam("ICT", "ict")).toBe(true);
  expect(canRoundTeam("ICT", "oral")).toBe(false);
  expect(canRoundTeam("歯科衛生士", "oral")).toBe(true);
  expect(canRoundTeam("歯科衛生士", "nst")).toBe(false);
  expect(teamOf("oral").addon).toBeUndefined();
});
it("カルテのCDの印も感染対策の対象とし、陰性培養から耐性を作らない", () => {
  const p = {...icuPatient, infections:["CD"], cultures:[{specimen:"便",organism:"CD トキシン陰性",collectedOn:0,status:"最終報告" as const}]};
  expect(infectionFlags(p)).toEqual([{text:"CD",specimen:"",precaution:""}]);
});
it("経過表の最新体重だけを使い、未来・未測定は除き、CCrも一致する", () => {
  const p = {...icuPatient, weightKg:61, daily:[{day:-1,weightKg:59},{day:0,weightKg:58.2},{day:1,weightKg:60}]};
  const w = latestWeight(p);
  expect(w).toEqual({weightKg:58.2,day:0});
  expect(estimatedCcr({...p,...w},1)).toBeCloseTo((140-p.age)*58.2/72);
  expect(latestWeight({...p,daily:[]})).toEqual({weightKg:61});
});
it("150mL/時の継続輸液は1日1本と表示しない", () => {
  expect(scheduleTextFor({type:"injection",items:[],route:"点滴静注",start:{day:0,time:"00:00"},schedule:{kind:"per_day",count:1},rateMlPerH:150})).toBe("速度指定");
});
it("定期で入力した頓用の1日分・上限3回・指定開始日を確定後も残す", () => {
  const drug = ORAL_DRUGS.find(d => d.name === "カロナール細粒50%")!;
  expect(drug).toBeDefined();
  const d: PrescriptionDraft = {id:"test",origin:"manual",sourceText:"",comment:null,kind:"prescription",category:"定期",items:[{drugCode:drug.code,said:"",daily:null,perDose:0.36}],timings:[],prn:"発熱時",maxPerDay:3,days:1,start:{day:0,timing:null},acks:[]};
  expect(JSON.parse(JSON.stringify(toPrescriptionOrders(d,"18:30","rp")[0]))).toMatchObject({category:"定期",amount:0.36,timings:[],maxPerDay:3,days:1,start:{day:0}});
  expect(toPrescriptionOrders({...d,start:{day:2,timing:null}},"18:30","rp")[0].start.day).toBe(2);
});
it("18時の両累積は18時までで揃え、18時30分の量を片方だけ加えない", () => {
  const r = icuFixture();
  r.stays[0].in={day:-1,time:"23:00"};
  r.hourly=[];
  const rows=hourlyBalance(icuPatient,r,0,18*60+30);
  expect(rows[18].sinceAdmissionMl).toBeCloseTo(rows[18].cumulativeMl!);
  expect(rows[18].sinceAdmissionMl).toBeCloseTo(19*4.9);
  expect(rows[19].sinceAdmissionMl).toBeCloseTo(rows[19].cumulativeMl!);
});
