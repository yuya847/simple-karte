import { expect, it } from "vitest";
import { icuIoLines, withIcuUrine } from "./io-lines";
import { icuFixture, icuPatient, norad } from "./test-fixture";
const pid = icuPatient.id;
it("時間尿量を窓の終了時刻まで含め、患者と開始境界を除く", () => {
  const r=icuFixture(); r.infusions=[]; r.hourly=[{id:"u",patientId:pid,at:{day:0,time:"01:00"},by:"看護師",urineMl:35}];
  expect(icuIoLines(r,pid,0,60)).toEqual([expect.objectContaining({ml:35,kind:"尿",at:60,by:"看護師",measured:true,from:"ICU 記録"})]);
  expect(icuIoLines(r,pid,60,120)).toEqual([]);
  expect(icuIoLines(r,"other",0,60)).toEqual([]);
});
it("持続投与は丸めず、変更・終了で分割する", () => {
  const r=icuFixture();r.hourly=[];
  r.infusions=[{...norad,changes:[{at:{day:0,time:"00:00"},rateMlPerH:4.896,by:""}]}];
  expect(icuIoLines(r,pid,0,60)[0].ml).toBeCloseTo(4.896,10);
  r.infusions=[{...norad,end:{day:0,time:"07:00"},changes:[{at:{day:0,time:"00:00"},rateMlPerH:60,by:""},{at:{day:0,time:"06:00"},rateMlPerH:120,by:""}]}];
  expect(icuIoLines(r,pid,330,390)[0].ml).toBe(90);
  expect(icuIoLines(r,pid,420,480)).toEqual([]);
});
export const crrt = {id:"c",patientId:pid,at:{day:0,time:"00:00"},end:{day:0,time:"02:00"},by:"技士",mode:"CHDF" as const,qb:100,qd:500,qf:500,removalMlPerH:50,anticoag:{drug:"なし" as const,ratePerH:0,unit:"mg/h" as const},access:"架空"};
it("CRRT は有効な時間だけ除水を数える",()=>{
 const r=icuFixture();r.hourly=[];r.infusions=[];r.crrt=[crrt];
 expect(icuIoLines(r,pid,0,60)[0]).toMatchObject({ml:50,side:"OUT",what:"CRRT 除水"});
 expect(icuIoLines(r,pid,90,150)[0].ml).toBe(25);
 expect(icuIoLines(r,pid,120,180)).toEqual([]);
});
it("時間尿量のある日を置き換え、ない日は保持する",()=>{
 const r=icuFixture();r.hourly=r.hourly.slice(0,1);r.hourly[0].urineMl=265;
 expect(withIcuUrine([{day:0,urineMl:230},{day:-1,urineMl:100}],r,pid)).toEqual([{day:-1,urineMl:100},{day:0,urineMl:265}]);
});
