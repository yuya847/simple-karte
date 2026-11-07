import { readTeamSnapshot } from './use-team-persistence';
import { expect, it } from 'vitest';
import { preopChartHistory, pendingAnesthesiaPreop, preopFromChart, preopNote, anesthesiaDate, anesthesiaEventError, anesthesiaSaveReason, emptyAnesthesia } from './anesthesia';
import { wardMeals } from './ward-meals';
import { nutritionWork } from './nutrition-work';
import { initialTeams } from './teams';
import { initialSurgeries } from './surgery';
import { PATIENTS } from './patients';
import type { DietOrder } from './diet';
it('麻酔イベントの逆転を止め、訂正と日跨ぎを認める',()=>{
 expect(anesthesiaEventError({'麻酔器接続':780,'麻酔器離脱':720})).toBe('離脱は接続より後に');
 expect(anesthesiaEventError({'麻酔器接続':780,'執刀':790,'手術終了':800,'麻酔器離脱':810})).toBe('');
 expect(anesthesiaEventError({'麻酔器接続':1430,'麻酔器離脱':1450})).toBe('');
 expect(anesthesiaEventError({'執刀':800,'手術終了':790})).toBeTruthy();
 expect(anesthesiaSaveReason(emptyAnesthesia(),'p')).toContain('接続・離脱');
 expect(anesthesiaDate(0,{y:2026,m:11,d:7})).toBe('11/7（今日）');
 expect(anesthesiaDate(-6,{y:2026,m:11,d:7})).toBe('11/1');
});
it('病棟の食事も今の指示の禁止食品を表示する',()=>{
 const p=PATIENTS[0];const diet:DietOrder={id:'d',patientId:p.id,kind:'常食',prohibited:'納豆',from:{day:-1,meal:'朝'},at:{day:-1,time:'09:00'},by:'医師'};
 const meals=wardMeals([{patient:p,room:'507C',entries:[]}],[diet],[0,1],600,()=>0);
 expect(meals.rows[0].notes).toContain('禁止：納豆');expect(meals.slots.map(s=>s.total)).toEqual([1,1,1,1,1,1]);
});
it('今日のNST回診済みは待ちにせず、翌日の予約は残す',()=>{
 const desk=initialTeams();const p={...PATIENTS[0],id:desk.requests[0].patientId};
 desk.rounds[0]={...desk.rounds[0],at:{day:0,time:'10:00'}};
 expect(nutritionWork([{patient:p,room:'507C',entries:[]}],{},desk,[]).filter(j=>j.kind==='NST 回診')).toHaveLength(0);
 desk.requests[0].nextRound={day:1,time:'11:00'};
 expect(nutritionWork([{patient:p,room:'507C',entries:[]}],{},desk,[]).find(j=>j.kind==='NST 回診')?.day).toBe(1);
});

it('術前診察の入れかけと確定を区別し、計画を記事に残す',()=>{
 const p={...preopFromChart(undefined,[],'青木'),mouth:'3横指',airwayPlan:'気管挿管'};
 const entries={'["p","anesthesia-preop"]':p};
 expect(pendingAnesthesiaPreop(entries,[],{y:2026,m:11,d:7})).toBe(true);
 const surgeries=[{...initialSurgeries(600)[0],patientId:'p',anesthesiaCase:{...emptyAnesthesia(),preop:p}}];
 expect(pendingAnesthesiaPreop(entries,surgeries,{y:2026,m:11,d:7})).toBe(false);
 expect(pendingAnesthesiaPreop({...entries,'["p","anesthesia-preop"]':{...p,mouth:'4横指'}},surgeries,{y:2026,m:11,d:7})).toBe(true);
 expect(preopNote(p)).toContain('気道確保 気管挿管');
});

it('登録された全病名と、記事に明記された既往を表示する',()=>{
 const p={...PATIENTS[0],history:[{kind:'note' as const,day:0,time:'10:00',author:'医師',role:'医師' as const,text:'入院時記録\n既往歴：骨粗鬆症。内服：なし。'}]};
 expect(preopChartHistory(p,['骨折','便秘症'])).toEqual(['骨折','便秘症','記事の既往：骨粗鬆症']);
 expect(preopFromChart(p,[],'青木').history).toContain('骨粗鬆症');
});

it('端末内の回診を同じ日だけ復元し、済みの判定に使う',()=>{
 const desk=initialTeams();desk.rounds[0].at.day=0;
 const raw=JSON.stringify({day:'2026-11-07',desk});
 const restored=readTeamSnapshot(raw,'2026-11-07')!;
 const p={...PATIENTS[0],id:restored.requests[0].patientId};
 expect(nutritionWork([{patient:p,room:'507C',entries:[]}],{},restored,[]).filter(j=>j.kind==='NST 回診')).toHaveLength(0);
 expect(readTeamSnapshot(raw,'2026-11-08')).toBeNull();
 expect(readTeamSnapshot('{','2026-11-07')).toBeNull();
});
