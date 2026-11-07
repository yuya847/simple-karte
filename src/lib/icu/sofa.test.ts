import {describe,it,expect} from 'vitest';
import {sofaScore,sofaFacts,type SofaFacts} from './sofa';
import {icuFixture,icuPatient} from './test-fixture';
const base=():SofaFacts=>({respiratory:[{pf:400,support:true,basis:''}],platelets:[15],bilirubin:[1],maps:[70],drugs:[],gcs:[{value:15,basis:''}],creatinine:[1],urineMl:720,urineHours:24});
const score=(f:SofaFacts,k:string)=>sofaScore(f).items.find(i=>i.key===k)!.score;
describe('SOFA 境界は依頼の不等号で評価',()=>{
 it.each([[400,0],[399,1],[300,1],[299,2],[200,2],[199,3],[100,3],[99,4]])('P/F %s → %s',(pf,s)=>expect(score({...base(),respiratory:[{pf,support:true,basis:''}]},'respiratory')).toBe(s));
 it('呼吸補助なしは2まで',()=>expect(score({...base(),respiratory:[{pf:50,support:false,basis:''}]},'respiratory')).toBe(2));
 it.each([[15,0],[14.9,1],[10,1],[9.9,2],[5,2],[4.9,3],[2,3],[1.9,4]])('Plt %s → %s',(p,s)=>expect(score({...base(),platelets:[p]},'coagulation')).toBe(s));
 it.each([[1.19,0],[1.2,1],[2,2],[6,3],[12,4]])('Bil %s → %s',(b,s)=>expect(score({...base(),bilirubin:[b]},'liver')).toBe(s));
 it('MAP 70・ノルアド0.1ちょうど・各薬剤',()=>{expect(score(base(),'cardiovascular')).toBe(0);expect(score({...base(),maps:[69]},'cardiovascular')).toBe(1);for(const [name,gamma,s] of [['ノルアドレナリン',.1,3],['ノルアドレナリン',.10001,4],['アドレナリン',.1,3],['アドレナリン',.11,4],['ドパミン',5,2],['ドパミン',5.1,3],['ドパミン',15,3],['ドパミン',15.1,4],['ドブタミン',20,2]] as const)expect(score({...base(),drugs:[{name,gamma}]},'cardiovascular')).toBe(s);});
 it.each([[15,0],[13,1],[10,2],[6,3],[5,4]])('GCS %s → %s',(g,s)=>expect(score({...base(),gcs:[{value:g,basis:''}]},'cns')).toBe(s));
 it.each([[1.19,0],[1.2,1],[2,2],[3.5,3],[5,4]])('Cre %s → %s',(c,s)=>expect(score({...base(),creatinine:[c]},'renal')).toBe(s));
 it.each([[500,0],[499,3],[200,3],[199,4]])('尿量 %s → %s',(u,s)=>expect(score({...base(),urineMl:u},'renal')).toBe(s));
 it('欠測は合計不明・不完全な尿量を使わない',()=>{const f={...base(),creatinine:[],urineMl:0,urineHours:23};const result=sofaScore(f);expect(result.total).toBeNull();expect(result.missing).toEqual(['腎']);expect(result.items[5].basis).toContain('尿量 23 時間分のみ');});
 it('その日の最悪値・前日開始の薬・挿管V=1・鎮静・HFNC',()=>{const r=icuFixture();const p=structuredClone(icuPatient);p.labs.push({day:0,time:'10:00',values:{Plt:1,'T-Bil':12,Cre:5,PaO2:20}});p.vitals.push({day:0,time:'10:00',gcs:{e:2,m:3}});r.infusions.push({...r.infusions[0],id:'sed',name:'プロポフォール'});r.vents.push({...r.vents[0],id:'hf',at:{day:0,time:'09:00'},mode:'HFNC'});const f=sofaFacts(p,r,0),result=sofaScore(f);expect(score(f,'coagulation')).toBe(4);expect(score(f,'cardiovascular')).toBe(4);expect(f.gcs[1].basis).toContain('V は挿管のため 1 と置いた');expect(f.gcs[1].basis).toContain('鎮静中');expect(f.respiratory[1].basis).toContain('HFNC は呼吸補助に数えない');expect(result.total).toBe(21);});
 it('24件が同じ時間に重複しても24時間としない',()=>{const r=icuFixture();r.hourly=r.hourly.map(h=>({...h,at:{day:0,time:'01:00'}}));expect(sofaFacts(icuPatient,r,0).urineHours).toBe(1);});
});
