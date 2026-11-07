import { describe, expect, it } from 'vitest';
import { anesthesiaIo, anesthesiaNote, emptyAnesthesia, orderedAnesthesia, upsertAnesthesiaNote } from './anesthesia';
import { initialSurgeries, surgeryAnesthesia, surgeryTimes } from './surgery';
import { ioLines, ioTotal } from './io-balance';
import type { NoteEntry } from './types';

describe('麻酔記録の連携',()=>{
  it('同じ手術の記事は1件のまま、旧本文を版として残す',()=>{
    const note: NoteEntry={kind:'note',id:'anesthesia:case1',day:0,time:'11:10',author:'青木',role:'医師',text:'旧値'};
    let notes=upsertAnesthesiaNote([],note);
    notes=upsertAnesthesiaNote(notes,{...note,time:'11:15',text:'新値'});
    notes=upsertAnesthesiaNote(notes,{...note,time:'11:20',text:'再修正'});
    expect(notes).toHaveLength(1);
    expect(notes[0].text).toBe('再修正');
    expect(notes[0].versions?.map(v=>v.text)).toEqual(['旧値','新値','再修正']);
    expect(upsertAnesthesiaNote(notes,{...note,id:'anesthesia:case2'})).toHaveLength(2);
  });
  it('再読込後も手術予定と麻酔記録が同じ時刻を読む',()=>{
    const s=initialSurgeries(600)[0];
    s.anesthesiaCase={...emptyAnesthesia(),events:{'麻酔器接続':515,'執刀':530,'手術終了':660,'麻酔器離脱':670}};
    const restored=JSON.parse(JSON.stringify(s));
    expect(surgeryTimes(restored)).toEqual({anesStart:515,opStart:530,opEnd:660,anesEnd:670});
    expect(surgeryAnesthesia(restored).events['執刀']).toBe(530);
    delete s.anesthesiaCase;
    expect(surgeryAnesthesia(s).events['執刀']).toBe(s.record?.opStart);
  });
  it('本文の時刻とバイタルを読みやすくし、再読込した行も時刻順にする',()=>{
    const c=emptyAnesthesia();
    c.vitals=[{at:550,sbp:120},{at:515,sbp:112,dbp:60,hr:72,spo2:99}];
    c.administrations=[{at:550,kind:'輸液',name:'リンゲル',dose:1000,unit:'mL'},{at:515,kind:'薬剤',name:'プロポフォール',dose:100,unit:'mg'}];
    const text=anesthesiaNote(c);
    expect(text).toContain('08:35 BP 112/60 HR 72 SpO2 99%');
    expect(text).toContain('08:35 プロポフォール 100mg');
    expect(text).not.toContain('515分');expect(text).not.toContain('{"at"');
    const ordered=orderedAnesthesia(JSON.parse(JSON.stringify(c)));
    expect(ordered.vitals.map(v=>v.at)).toEqual([515,550]);
    expect(ordered.administrations.map(v=>v.at)).toEqual([515,550]);
  });
  it('術中の出納を経過表のデータとして渡し、再保存で重複しない',()=>{
    const s={...initialSurgeries(600)[0],patientId:'p1',anesthesiaCase:emptyAnesthesia()};
    s.anesthesiaCase.administrations=[{at:600,kind:'輸液',name:'リンゲル',dose:1000,unit:'mL'},{at:610,kind:'出血',name:'',dose:150,unit:'mL'},{at:620,kind:'尿量',name:'',dose:200,unit:'mL'}];
    const typed=anesthesiaIo(s,'青木','11:10');
    const lines=ioLines({patientId:'p1',entries:[],typed,records:{},sessionStart:0,nowAbs:700,from:0});
    const totals=ioTotal(lines,{lo:0,hi:1440});
    expect(totals.in).toBe(1000);expect(totals.out).toBe(350);
    expect(anesthesiaIo(s,'青木','11:15').map(e=>e.id)).toEqual(typed.map(e=>e.id));
  });
});
