import { emptyStanding } from './standing';
import { effectiveFields } from './standing-field-end';
import { describe, expect, it } from 'vitest';
import { SCENARIOS } from './scenarios';
import { withAnesthesiaVitals } from './anesthesia-flow';
import { podCell } from './flow-days';
import { anesthesiaIo, emptyAnesthesia } from './anesthesia';
import { anesthesiaPostopOrders, postopRestConflicts, replacePostopRest } from './anesthesia-orders';
import { standingFromBlocks } from './standing-blocks';
import { changeLine, type StandingLine } from './standing-lines';

const patient=SCENARIOS.patients.find(p=>p.id==='99000018')!;
const surgery=SCENARIOS.surgeries.find(s=>s.patientId===patient.id)!;
describe('麻酔点検の回帰',()=>{
 it('岩瀬さんは今日の手術が一件で、術前の経過だけがある',()=>{
  expect(SCENARIOS.surgeries.filter(s=>s.patientId===patient.id)).toHaveLength(1);
  expect(surgery.day).toBe(0);
  expect(surgery.procedure).toBe('人工骨頭挿入術');
  const text=JSON.stringify(patient.history);
  expect(text).not.toMatch(/術後創部|術後経過良好|左人工骨頭置換術を施行|急性期治療を終え/);
 });
 it('時刻を保持して読み取り、再読込や修正で二重計上しない',()=>{
  const c={...emptyAnesthesia(),vitals:[{at:530,sbp:123,dbp:61},{at:540,hr:80},{at:1450,spo2:98}]};
  const source={...surgery,anesthesiaCase:c};
  const result=withAnesthesiaVitals(patient,[source]);
  expect(result.vitals.filter(v=>v.by==='麻酔記録').map(v=>[v.day,v.time])).toEqual([[0,'08:50'],[0,'09:00'],[1,'00:10']]);
  expect(withAnesthesiaVitals(patient,[source]).vitals).toEqual(result.vitals);
  expect(patient.vitals.some(v=>v.by==='麻酔記録')).toBe(false);
 });
 it('手術終了時刻から手術日と翌日のPODを出す',()=>{
  const s={...surgery,status:'受付済' as const,anesthesiaCase:{...emptyAnesthesia(),events:{手術終了:650}}};
  expect(podCell([s],0)?.text).toBe('手術日');
  expect(podCell([s],1)?.text).toBe('術後1日');
 });
 it('輸液の製剤名と量を出納の元データに渡す',()=>{
  const s={...surgery,anesthesiaCase:{...emptyAnesthesia(),administrations:[{at:540,name:'乳酸リンゲル',dose:500,unit:'mL',kind:'輸液' as const}]}};
  expect(anesthesiaIo(s,'青木','12:00')[0]).toMatchObject({at:540,ml:500,note:'麻酔記録 乳酸リンゲル'});
 });
 it('安静度の競合を検出し、基本指示の他の項目と変更前の履歴を残す',()=>{
  const old:StandingLine={id:'old',cat:'その他',text:'基本指示\n安静度：室内\n清潔：清拭',start:{day:-1,time:'09:00'},at:{day:-1,time:'09:00'},by:'医師'};
  expect(postopRestConflicts([old],'安静','帰室後ベッド上安静','12:00')).toEqual([old]);
  const draft={...old,id:'new',text:replacePostopRest(old,'帰室後ベッド上安静'),start:{day:0,time:'12:00'},at:{day:0,time:'12:00'},changedFrom:old.id};
  const changed=changeLine([old],old.id,draft,'青木',draft.at).lines;
  expect(standingFromBlocks(changed,undefined,0,'12:01')).toMatchObject({rest:'帰室後ベッド上安静',bath:'清拭'});
  expect(standingFromBlocks(changed,undefined,0,'11:59')?.rest).toBe('室内');
 });
});

it('項目形式の安静度も医師の選択後に終了し、元の履歴を残す',()=>{
 let fields={p:[{...emptyStanding('医師',{day:-1,time:'09:00'}),rest:'室内' as const}]};
 const added:StandingLine[]=[];
 const orders=anesthesiaPostopOrders({},fields,update=>{fields=(typeof update==='function' ? update(fields) : update) as typeof fields;},(_,l)=>added.push(l),'青木','12:00',()=> 'new');
 const conflicts=postopRestConflicts(orders.lines.p,'安静','帰室後ベッド上安静','12:00');
 expect(conflicts).toHaveLength(1);
 expect(fields.p).toHaveLength(1);
 orders.onAdd('p',replacePostopRest(conflicts[0],'帰室後ベッド上安静'),'安静',conflicts[0].id);
 expect(fields.p).toHaveLength(2);
 expect(effectiveFields(fields.p[0],0,'12:01').rest).toBe('室内');
 expect(effectiveFields(fields.p[1],0,'12:01').rest).toBeNull();
 expect(standingFromBlocks(added,effectiveFields(fields.p[1],0,'12:01'),0,'12:01')?.rest).toBe('帰室後ベッド上安静');
});
