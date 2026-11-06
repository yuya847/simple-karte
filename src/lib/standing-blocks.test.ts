import { describe, it, expect } from 'vitest';
import { endStandingBlocks, parseBasicBlock, parseCallBlock, standingFromBlocks } from './standing-blocks';
import { initialLines, linesFromFields, type StandingLine } from './standing-lines';
import { initialStanding, emptyStanding, callHits, drCallMatches } from './standing';
import { standingMeasurementPlan, vitalMeasurementTimes } from './standing-measurements';
import { worksheetPrnLines } from './standing-form';
import { admissionMissingNow } from './admission-orders';
import type { WorkPatient } from './worksheet';

const line = (text: string, extra: Partial<StandingLine> = {}): StandingLine => ({id:'x',text,cat:'その他',start:{day:0,time:'10:00'},at:{day:0,time:'09:00'},by:'医師',...extra});
describe('指示のかたまりを読む', () => {
 it('ラベルの値だけを読み、空欄は補わない', () => {
  expect(parseBasicBlock('基本指示\n安静度：病棟内歩行\nADL：自立\n食事：（食事オーダのとおり）\n清潔：シャワー浴\n排泄：トイレ\nモニター：なし\n測定：バイタル 1日3回、体重 なし、水分出納 測らない')).toEqual({rest:'病棟内歩行',adl:'自立',diet:'（食事オーダのとおり）',bath:'シャワー浴',elimination:'トイレ',monitor:'なし',vitals:'1日3回',weight:'なし',io:'測らない'});
  expect(parseBasicBlock('基本指示\n安静度：\n清潔：')).toEqual({});
 });
 it('単位と同じ項目の上下限を読み、複合条件や不明な文は数値判定に使わない', () => {
  expect(parseCallBlock('Drコール指示\nSBP 90以下・180mmHg以上\nHR 120以上・40/分以下\nSpO2 92%未満\n体温 38.5℃以上\n尿量が減ったら連絡\nSBP 80以下が2時間続くとき\n体温 37以下')).toEqual([{key:'sbpLow',value:90},{key:'sbpHigh',value:180},{key:'hrHigh',value:120},{key:'hrLow',value:40},{key:'spo2',value:92},{key:'bt',value:38.5}]);
 });
 it('有効な本文を優先し、未来・中止・期間外は項目に戻す', () => {
  const fields={...emptyStanding('医師',{day:-1,time:'09:00'}),rest:'室内' as const,vitals:'1日1回' as const,calls:[{key:'sbpLow' as const,value:80},{key:'hrHigh' as const,value:130}]};
  const l=line('基本指示\n安静度：病棟内歩行\n測定：バイタル 1日3回',{stop:{day:0,time:'11:00',by:'医師'}});
  const c=line('Drコール指示\nSBP 90以下',{id:'call'});
  expect(standingFromBlocks([l,c],fields,0,'09:59')?.rest).toBe('室内');
  const current=standingFromBlocks([l,c],fields,0,'10:00')!;
  expect(current.rest).toBe('病棟内歩行'); expect(current.calls).toContainEqual({key:'sbpLow',value:90});
  expect(current.calls).not.toContainEqual({key:'sbpLow',value:80});
  expect(standingFromBlocks([l],fields,0,'11:00')?.rest).toBe('室内');
  expect(standingFromBlocks([line(l.text,{end:{day:-1}})],fields)?.rest).toBe('室内');
  expect(callHits(current,{day:0,time:'10:00',sbp:90})).toHaveLength(1);
  expect(drCallMatches({day:0,time:'10:00',sbp:90},current)[0]).toContain('90mmHg以下');
 });
 it('初期値は全患者とも本文だけで、履歴・頓用・測定・連絡条件を残す', () => {
  const seeds=initialLines();
  for(const [pid,ls] of Object.entries(seeds)) {
   expect(initialStanding()[pid]).toEqual([]);expect(linesFromFields(initialStanding()[pid])).toEqual([]);
   expect(ls.every(l=>l.text.includes('\n') && !l.fromFields)).toBe(true);
   expect(standingFromBlocks(ls,undefined,0,'10:00')?.vitals).toBeTruthy();
   expect(standingFromBlocks(ls)?.calls.length).toBeGreaterThan(0);
   expect(worksheetPrnLines(ls,{patient:{id:pid},room:'1'} as WorkPatient,600,{},new Set()).length).toBeGreaterThan(0);
  }
  expect(standingFromBlocks(seeds['90010198'],undefined,-2)?.rest).toBe('ベッド上、頭を上げてよい');
  expect(standingFromBlocks(seeds['90010198'])?.rest).toBe('病棟内フリー（息切れが出たら休む）');
  expect(seeds['90010198'].find(l=>l.stop)?.stop?.reason).toBe('息切れが落ち着いた');
  expect(seeds['90010231'].find(l=>l.stop)?.text).toContain('転倒に注意');
  expect(standingFromBlocks(seeds['90010198'])?.conds).toHaveLength(2);
 });
 it('時刻ごとに開始・終了と頻度の変更を反映する', () => {
  expect(vitalMeasurementTimes('不明')).toEqual([]);
  expect(vitalMeasurementTimes('4時間ごと')).toHaveLength(6);
  const ls=[line('基本指示\n測定：バイタル 1日3回')];
  expect(standingMeasurementPlan(ls,undefined,0)).toEqual(['14:00','22:00']);
  expect(standingMeasurementPlan([line(ls[0].text,{stop:{day:0,time:'20:00',by:'医師'}})],undefined,0)).toEqual(['14:00']);
 });
 it('退院時は有効な本文と未来の指示を終了し、変更前の履歴は残す', () => {
  const past = line('基本指示\n安静度：ベッド上',{end:{day:-1}});
  const active = line('基本指示\n安静度：病棟内歩行',{id:'active',changed:{day:1,time:'10:00',by:'医師',toId:'future'}});
  const future = line('基本指示\n安静度：院内歩行',{id:'future',start:{day:1}});
  const ended = endStandingBlocks([past,active,future],'医師',0,'12:00');
  expect(ended[0]).toBe(past); expect(ended[1].stop?.kind).toBe('終了');
  expect(standingFromBlocks(ended,undefined,1)).toBeUndefined();
 });
 it('食事と測定を書いた基本指示を入院時チェックが読む', () => {
  expect(admissionMissingNow([], [line('基本指示\n食事：常食\n測定：バイタル 1日3回')], [], '10:00')).toEqual([]);
 });
});
