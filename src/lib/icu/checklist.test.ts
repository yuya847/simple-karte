import {it,expect} from 'vitest';
import {FAST_HUG,checkedToday} from './checklist';
it('FAST HUG 7項目・患者と日付で最新の確認だけ',()=>{expect(FAST_HUG).toHaveLength(7);expect(checkedToday([], 'p',0)).toBeNull();const r={id:'r',patientId:'p',day:0,time:'10:00',by:'n',items:{feeding:'確認' as const}};expect(checkedToday([{...r,id:'old',time:'09:00'},r,{...r,id:'other',patientId:'q',time:'12:00'}],'p',0)?.id).toBe('r');expect(checkedToday([r],'p',-1)).toBeNull();});
