import {it,expect} from 'vitest';
import {abgRows,fio2At,pfRatio} from './abg';
import {icuPatient,icuFixture} from './test-fixture';
it('採血以前のFiO2のみとP/F',()=>{const r=icuFixture();r.vents.push({...r.vents[0],id:'later',at:{day:0,time:'09:00'},fio2:.8});expect(fio2At(r.vents,icuPatient.id,480)).toBe(.4);expect(abgRows(icuPatient,r.vents)[0].pf).toBe(400);expect(pfRatio(101,.4)).toBe(253);expect(fio2At([],icuPatient.id,0)).toBeNull();r.vents[0].mode='なし';expect(fio2At(r.vents,icuPatient.id,480)).toBeNull();});
it('血液ガスだけを時刻順に・欠測は不明',()=>{const p:typeof icuPatient={...icuPatient,labs:[{day:0,time:'09:00',values:{pH:7.4}},{day:0,time:'07:00',values:{Lac:10}},{day:0,time:'06:00',values:{Cre:1}}]};expect(abgRows(p,[]).map(r=>r.time)).toEqual(['07:00','09:00']);expect(abgRows(p,[]).every(r=>r.pf===null)).toBe(true);});
