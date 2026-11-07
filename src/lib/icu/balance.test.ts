import {it,expect} from 'vitest';
import {hourlyBalance,urineMlPerKgPerH,infusionVolume} from './balance';
import {icuFixture,icuPatient,norad} from './test-fixture';
it('開始・途中変更・終了を分単位で積算',()=>{const i={...norad,start:{day:0,time:'00:15'},end:{day:0,time:'00:45'},changes:[{at:{day:0,time:'00:15'},rateMlPerH:60,by:''},{at:{day:0,time:'00:30'},rateMlPerH:120,by:''}]};expect(infusionVolume(i,0,60)).toBe(45);expect(infusionVolume(i,60,120)).toBe(0);});
it('24時間・日内と入室からの累積・IN/OUT',()=>{const r=icuFixture();r.hourly[0]={...r.hourly[0],enteralMl:10,otherInMl:20,drainMl:3,gastricMl:2,stoolMl:1,bloodLossMl:4};const rows=hourlyBalance(icuPatient,r,0);expect(rows).toHaveLength(24);expect(rows[0].inMl).toBeCloseTo(34.9);expect(rows[0].outMl).toBe(40);expect(rows[0].netMl).toBeCloseTo(-5.1);expect(rows[23].cumulativeMl).toBeCloseTo(24*(4.9-30)+20);expect(rows[0].sinceAdmissionMl).toBeCloseTo(48*4.9-5.1);expect(urineMlPerKgPerH(30,60)).toBe(.5);expect(urineMlPerKgPerH(30,0)).toBeNull();});
