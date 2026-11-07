import { describe, expect, it } from "vitest";
import { boardRows } from "./board";
import { icuPatient, icuFixture } from "./test-fixture";
import type { OrderEntry } from "../types";

describe("ICU・HCU のベッド一覧", () => {
  it("2人と空床6、ベッド順・入室日数・欠測・ラインの印・明日の転出", () => {
    const p = structuredClone(icuPatient), other = { ...p, id: "other", room: "ICU2", labs: [], vitals: [] };
    const records = icuFixture();
    records.stays[0].in.day = -4;
    records.lines[0].insertedAt.day = -6;
    const move: OrderEntry = { kind:"order", id:"move",day:0,time:"09:00",author:"架空医師",status:"有効",order:{type:"procedure",code:"PROC-MOVE",start:{day:1,time:"10:00"},move:{kind:"転棟",to:{room:"501",bed:""},reason:"架空"},schedule:{kind:"once"}} };
    const rows = boardRows("ICU",[other,p],[{room:"ICU2",bed:"",patientId:other.id},{room:"ICU1",bed:"",patientId:p.id}],records,0,600,{[p.id]:[move]});
    expect(rows).toHaveLength(8);
    expect(rows.map(r => r.bed)).toEqual(Array.from({length:8},(_,i)=>`ICU${i+1}`));
    expect(rows.filter(r => !r.patient)).toHaveLength(6);
    expect(rows[0].days).toBe("ICU 5日目");
    expect(rows[1].days).toBe("3日目");
    expect(rows[0].sofaToday).toBe(4);
    expect(rows[1].sofaToday).toBeNull();
    expect(rows[0].sofaYesterday).toBeNull();
    expect(rows[0].lines[0]).toMatchObject({days:"7日",flag:true});
    expect(rows[0].planned).toMatchObject({to:"5階東",day:1,time:"10:00"});
    expect(rows[0].infusions).toEqual(["ノルアドレナリン 0.12γ"]);
    expect(rows[0].drips).toEqual([{ name: "ノルアドレナリン", dose: "0.12γ", mlh: 4.9 }]);
    // 330 mL of urine in 11 hours could still make the renal score 3; yesterday has no total.
    expect(rows[0].sofaAssumed).toEqual({ today: true, yesterday: false });
    expect(rows[1].drips).toEqual([]);
    // Today so far, (前日 23:00, 10:00]: the 11 hourly records 00:00–10:00 and 11 hours of the infusion.
    expect(rows[0].balance24h?.outMl).toBe(330);
    expect(rows[0].balance24h?.inMl).toBeCloseTo(4.9*11);
  });
  it("未来の設定・終了した投与とライン・中止予約は出さない", () => {
    const records=icuFixture(); records.infusions[0].end={day:0,time:"10:00"}; records.lines[0].removedAt={day:0,time:"10:00"};
    records.vents.push({...records.vents[0],id:"future",at:{day:1,time:"00:00"},mode:"HFNC"});
    const row=boardRows("ICU",[icuPatient],[{room:"ICU1",bed:"",patientId:icuPatient.id}],records,0,600)[0];
    expect(row.infusions).toEqual([]); expect(row.lines).toEqual([]); expect(row.vent).toBe("A/C-PC FiO2 0.4 PEEP 8");
  });
});

describe("入ってくる予約", () => {
  it("ICU・HCU の床へ移る予約を、その床に「← 氏名（いまの病棟）」で出す", () => {
    const p = structuredClone(icuPatient), er = { ...p, id: "er", name: "架空 救急", ward: "救急外来", room: "", labs: [], vitals: [] };
    const into: OrderEntry = { kind:"order", id:"in",day:0,time:"09:00",author:"架空医師",status:"有効",order:{type:"procedure",code:"PROC-MOVE",start:{day:1,time:"10:00"},move:{kind:"転棟",to:{room:"ICU7",bed:""},reason:"架空"},schedule:{kind:"once"}} };
    const rows = boardRows("ICU",[p,er],[{room:"ICU1",bed:"",patientId:p.id}],icuFixture(),0,600,{[er.id]:[into]});
    expect(rows[6].patient).toBeNull();
    expect(rows[6].incoming).toEqual({ id:"er", name:"架空 救急", from:"救急外来", day:1, time:"10:00" });
    expect(rows.filter(r => r.incoming)).toHaveLength(1);
  });
});
