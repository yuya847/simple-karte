import {describe,it,expect} from "vitest";
import {concentrationMgPerMl,rateAt,gammaFromMlPerH,mlPerHFromGamma,doseFromMlPerH,mlPerHFromDose,doseText} from "./gamma";
import {norad} from "./test-fixture";
describe('持続投与',()=>{
 it('ノルアドの濃度・γ・逆算・式',()=>{expect(concentrationMgPerMl(norad)).toBe(.1);expect(gammaFromMlPerH(4.9,.1,68)).toBeCloseTo(.120098);expect(mlPerHFromGamma(.12,.1,68)).toBeCloseTo(4.896);expect(doseText(norad,0)).toContain('0.12γ（4.9mL/h：5mg/50mL＝0.1mg/mL、68kg');});
 it('インスリン・プロポフォールと各単位の往復',()=>{expect(doseFromMlPerH(5.2,1,68,'単位/h')).toBe(5.2);expect(doseFromMlPerH(11,10,55,'mg/kg/h')).toBe(2);for(const unit of ['γ','mg/h','μg/h','mL/h','単位/h','mg/kg/h'] as const){const d=doseFromMlPerH(11,10,55,unit)!;expect(mlPerHFromDose(d,10,55,unit)).toBeCloseTo(11);}});
 it('最新変更・開始前・終了以後',()=>{const i={...norad,start:{day:0,time:'01:00'},end:{day:0,time:'03:00'},changes:[{at:{day:0,time:'02:00'},rateMlPerH:6,by:''},{at:{day:0,time:'01:00'},rateMlPerH:4.9,by:''}]};expect(rateAt(i,59)).toBeNull();expect(rateAt(i,60)).toBe(4.9);expect(rateAt(i,120)).toBe(6);expect(rateAt(i,180)).toBeNull();expect(rateAt(i,181)).toBeNull();});
 it('非数・ゼロ除算を出さない',()=>{expect(gammaFromMlPerH(1,1,0)).toBeNull();expect(mlPerHFromGamma(1,0,60)).toBeNull();expect(concentrationMgPerMl({...norad,volumeMl:0})).toBeNull();});
});
