import { DOCTORS } from './doctors';
import { describe, it, expect } from 'vitest';
import { routineAnesthesiaCategory, anesthesiaTimeUnits, anesthesiaBillingCodes, anesthesiaNote, anesthesiaSummary, emptyAnesthesia, preopFromChart, preopNote, bmi } from './anesthesia';
import { initialSurgeries } from './surgery';
import { addScenarioAnesthesia } from './scenarios/anesthesia';
import { SCENARIOS } from './scenarios';
describe('麻酔科',()=>{
  it('切替可能な麻酔科医が3人いる',()=>{ expect(DOCTORS.filter(d=>d.team==='麻酔科')).toHaveLength(3); });
  it('術前診察を保存した内容をカルテ経過の本文に残す',()=>{
    const p={...preopFromChart(undefined,[],'麻酔科 青木'),asa:'III',method:'全身麻酔',medications:'抗凝固薬 休薬なし（11/6確認）',savedAt:600};
    const c={...emptyAnesthesia(),preop:p};
    const restored=JSON.parse(JSON.stringify(c));
    expect(preopNote(restored.preop)).toContain('【麻酔科術前診察】');
    expect(preopNote(restored.preop)).toContain('抗凝固薬 休薬なし');
    expect(preopNote(restored.preop)).toContain('ASA-PS III');
    expect(bmi('160','64')).toBe('25.0');
  });
  it('日をまたぐ麻酔・手術と出納を集計する',()=>{
    const c=emptyAnesthesia();c.events={'麻酔器接続':1400,'麻酔器離脱':1501,'執刀':1410,'手術終了':1480};
    c.administrations=[{at:1400,name:'晶質液',kind:'輸液',dose:500,unit:'mL'},{at:1440,name:'晶質液',kind:'輸液',dose:250,unit:'mL'},{at:1450,name:'出血',kind:'出血',dose:100,unit:'mL'}];
    expect(anesthesiaSummary(c)).toEqual({anesthesiaMinutes:101,surgeryMinutes:70,fluid:750,blood:0,bleeding:100,urine:0});
    expect(anesthesiaNote(c)).toContain('総輸液 750mL');
    c.events['麻酔器離脱']=1300;expect(anesthesiaSummary(c).anesthesiaMinutes).toBeNull();
  });
  it('未選択・未終了は算定せず、確認済み区分と困難な患者をコードへ写す',()=>{
    const s=initialSurgeries(600)[0];s.anesthesiaCase={...emptyAnesthesia(),preop:{...preopFromChart(undefined,[],'麻酔科 青木'),method:'全身麻酔'}};
    expect(anesthesiaBillingCodes(s)).toEqual([]);
    s.anesthesiaCase.completedAt=700;s.anesthesiaCase.billingCategory='4';s.anesthesiaCase.difficult=true;s.anesthesiaCase.management='I';
    expect(anesthesiaBillingCodes(s)).toEqual(['150333110','150279110']);
    s.anesthesiaCase.difficult=undefined;expect(anesthesiaBillingCodes(s)).toEqual(['150279110']);
    s.age=10;s.anesthesiaCase.difficult=false;expect(anesthesiaBillingCodes(s)).toEqual(['150279110']);
  });
  it('通常区分と時間の境界をコードで判定する',()=>{
    const s=initialSurgeries(600)[0];expect(routineAnesthesiaCategory(s)).toBe('4');s.laparoscopic=false;expect(routineAnesthesiaCategory(s)).toBe('5');s.position='伏臥位';expect(routineAnesthesiaCategory(s)).toBe('3');expect(anesthesiaTimeUnits(120)).toBe(0);expect(anesthesiaTimeUnits(121)).toBe(1);expect(anesthesiaTimeUnits(151)).toBe(2);expect(anesthesiaTimeUnits(null)).toBeNull();
  });
  it('100人に今日・明日の評価済・未評価と記録途中を用意する',()=>{
    const surgeries=addScenarioAnesthesia(structuredClone(SCENARIOS.patients),[]);
    expect(surgeries.some(s=>s.day===0)).toBe(true);expect(surgeries.some(s=>s.day===1)).toBe(true);expect(surgeries.some(s=>s.day===-1 && s.anesthesiaCase?.postop)).toBe(true);
    expect(surgeries.some(s=>s.anesthesiaCase?.preop)).toBe(true);
    expect(surgeries.some(s=>!s.anesthesiaCase?.preop)).toBe(true);
    expect(surgeries.some(s=>s.anesthesiaCase?.events['執刀']!==undefined)).toBe(true);
  });
});
