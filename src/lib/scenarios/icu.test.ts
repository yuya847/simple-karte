import { describe, expect, it } from "vitest";
import { SCENARIOS, generateScenarios } from ".";
import { GENERAL_FLOORS, UNITS, nurseFor } from "../ward";
import { loadMaster } from "../masters/server";
import type { At } from "../icu/types";
const abs = (a: At) => a.day * 1440 + Number(a.time.slice(0,2))*60 + Number(a.time.slice(3));
const s = SCENARIOS;
const added = s.patients.filter(p=>Number(p.id)>=99000101);
const dx = new Map(loadMaster("b").rows.map(r=>[r[0],r]));
describe("固定のICU・HCUの架空データ",()=>{
  it("12人・16床、空床と救急初療を保つ",()=>{
    expect(added).toHaveLength(12);
    expect(new Set(s.patients.map(p=>p.id)).size).toBe(112);
    expect(new Set(s.patients.map(p=>p.name)).size).toBe(112);
    expect(added.filter(p=>p.ward==="ICU")).toHaveLength(6);
    expect(added.filter(p=>p.ward==="HCU")).toHaveLength(5);
    expect(UNITS.flatMap(f=>f.rooms)).toHaveLength(16);
    for(const room of ["ICU7","ICU8","HCU6","HCU7","HCU8"]) expect(s.beds.some(b=>b.room===room)).toBe(false);
    const er=s.cases.find(c=>c.patient.id==="99000112")!;
    expect(er.stage).toBe("救急"); expect(er.patient.admittedOn).toBe(0);
    expect(s.beds.some(b=>b.patientId===er.patient.id)).toBe(false);
    expect(s.er.find(p=>p.id===er.patient.id)).toMatchObject({jtas:1,arrivedAbs:520,status:"診察中"});
    expect(s.icu.stays.some(r=>r.patientId===er.patient.id)).toBe(false);
    for(const p of added.filter(p=>p.ward!=="救急外来")) expect(nurseFor(p.room)).not.toBe("（未定）");
    expect(generateScenarios(42).patients.slice(100)).toEqual(added);
  });
  it("従来100人を一般3病棟に割り付ける",()=>{
    for(const p of s.patients.slice(0,100)) expect(GENERAL_FLOORS.some(f=>f.name===p.ward)).toBe(true);
  });
  it("全記録が入室以後、現在時刻以前で、日ごとの尿量が一致",()=>{
    for(const p of added){
      const stays=s.icu.stays.filter(r=>r.patientId===p.id);
      const start=stays[0]?.in??{day:0,time:"08:40"};
      const rows=[...s.icu.vents.filter(r=>r.patientId===p.id).map(r=>r.at),...s.icu.infusions.filter(r=>r.patientId===p.id).flatMap(r=>[r.start,...r.changes.map(c=>c.at),...(r.end?[r.end]:[])]),...s.icu.crrt.filter(r=>r.patientId===p.id).map(r=>r.at),...s.icu.lines.filter(r=>r.patientId===p.id).flatMap(r=>[r.insertedAt,...(r.removedAt?[r.removedAt]:[])]),...s.icu.hourly.filter(r=>r.patientId===p.id).map(r=>r.at),...stays.flatMap(r=>[r.in,...(r.out?[r.out]:[])]),...p.vitals,...p.labs];
      for(const a of rows){expect(abs(a),`${p.id} ${JSON.stringify(a)}`).toBeGreaterThanOrEqual(abs(start));expect(abs(a)).toBeLessThanOrEqual(600);}
      for(const d of p.daily){const hourly=s.icu.hourly.filter(r=>r.patientId===p.id&&r.at.day===d.day);expect(d.urineMl).toBe(hourly.reduce((sum,r)=>sum+(r.urineMl??0),0));if(d.day>start.day&&d.day<0)expect(hourly).toHaveLength(24);}
      for(const v of p.vitals) {expect(v.gcs).toBeDefined();expect(v.hr).toBeDefined();expect(v.o2).toBeDefined();}
      for(const d of s.diagnoses[p.id]){expect(dx.get(d.code)?.[2]).toBe(d.name);expect(dx.get(d.code)?.[8]).toBe(d.icd10);}
    }
  });
  it("終了・抜去・抜管後に記録が逆戻りしない",()=>{
    for(const inf of s.icu.infusions){expect(inf.changes.map(c=>abs(c.at))).toEqual(inf.changes.map(c=>abs(c.at)).sort((a,b)=>a-b));for(const c of inf.changes){expect(abs(c.at)).toBeGreaterThanOrEqual(abs(inf.start));if(inf.end)expect(abs(c.at)).toBeLessThanOrEqual(abs(inf.end));}}
    for(const l of s.icu.lines){if(l.removedAt){expect(abs(l.removedAt)).toBeGreaterThanOrEqual(abs(l.insertedAt));if(l.kind.includes("ドレーン"))expect(s.icu.hourly.filter(r=>r.patientId===l.patientId&&abs(r.at)>abs(l.removedAt!)&&(r.drainMl??0)>0)).toHaveLength(0);}}
    for(const p of added){let extubated=false;for(const v of s.icu.vents.filter(r=>r.patientId===p.id)){if(v.airway!=="経口挿管")extubated=true;if(extubated)expect(v.airway).not.toBe("経口挿管");if(p.ward==="HCU")expect(v.airway).not.toBe("経口挿管");}}
    const stays=s.icu.stays.filter(r=>r.patientId==="99000110");expect(stays).toHaveLength(2);expect(stays[0].out).toEqual(stays[1].in);
    expect(s.icu.lines.find(r=>r.patientId==="99000110"&&r.kind==="尿道カテーテル")).toMatchObject({insertedAt:{day:-8,time:"00:00"},removedAt:undefined});
  });
});
