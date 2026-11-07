import {it,expect} from 'vitest';
import {hourlyBalance,urineMlPerKgPerH,infusionVolume} from './balance';
import {icuFixture,icuPatient,norad} from './test-fixture';
it('開始・途中変更・終了を分単位で積算',()=>{const i={...norad,start:{day:0,time:'00:15'},end:{day:0,time:'00:45'},changes:[{at:{day:0,time:'00:15'},rateMlPerH:60,by:''},{at:{day:0,time:'00:30'},rateMlPerH:120,by:''}]};expect(infusionVolume(i,0,60)).toBe(45);expect(infusionVolume(i,60,120)).toBe(0);});
it('24時間・日内と入室からの累積・IN/OUT',()=>{const r=icuFixture();r.hourly=r.hourly.map(h=>({...h,at:{...h.at,time:h.at.time.replace(":00",":30")}}));r.hourly[0]={...r.hourly[0],enteralMl:10,otherInMl:20,drainMl:3,gastricMl:2,stoolMl:1,bloodLossMl:4};const rows=hourlyBalance(icuPatient,r,0);expect(rows).toHaveLength(24);// 00:30 belongs to the column 1時 (00:00–01:00); a day is (前日 23:00, 23:00], so 23:30 is the next day's.
expect(rows[0].inMl).toBeCloseTo(4.9);expect(rows[0].outMl).toBe(0);expect(rows[1].inMl).toBeCloseTo(34.9);expect(rows[1].outMl).toBe(40);expect(rows[1].netMl).toBeCloseTo(-5.1);expect(rows[23].cumulativeMl).toBeCloseTo(24*4.9-23*30+20);expect(rows[1].sinceAdmissionMl).toBeCloseTo(48*4.9-5.1);expect(urineMlPerKgPerH(30,60)).toBe(.5);expect(urineMlPerKgPerH(30,0)).toBeNull();});

it('現在までの速さだけ数え、未来の累積は空にする',()=>{
 const r=icuFixture();r.hourly=[];
 const rows=hourlyBalance(icuPatient,r,0,630);
 expect(rows[10].infusionMl).toBeCloseTo(4.9);
 expect(rows[11].infusionMl).toBeCloseTo(2.45);
 expect(rows.slice(12).every(h=>h.inMl===0&&h.outMl===0&&!h.recorded&&h.cumulativeMl===null&&h.sinceAdmissionMl===null)).toBe(true);
 r.hourly.push({id:'new',patientId:icuPatient.id,at:{day:0,time:'10:30'},by:'看護師',urineMl:35});
 expect(hourlyBalance(icuPatient,r,0,630)[11].cumulativeMl).toBeCloseTo(rows[11].cumulativeMl!-35);
 r.crrt=[{id:'c',patientId:icuPatient.id,at:{day:0,time:'10:00'},by:'技士',mode:'CHDF',qb:100,qd:500,qf:500,removalMlPerH:50,anticoag:{drug:'なし',ratePerH:0,unit:'mg/h'},access:'架空'}];
 expect(hourlyBalance(icuPatient,r,0,630)[11]).toMatchObject({crrtMl:25,otherOutMl:25,outMl:60});
});
