import { describe, expect, it } from "vitest";
import { PATIENTS } from "./patients";
import { collectFacts, createDischargeDraft, dischargeChecks, labTrend } from "./discharge";
import type { OrderEntry } from "./types";

const today = { y: 2026, m: 11, d: 3 };
const sakura = PATIENTS.find((p) => p.id === "90010231")!;
const entries = sakura.history.filter((e): e is OrderEntry => e.kind === "order");

describe("退院時サマリーの事実はカルテからコードで集める", () => {
  it("dates, days, cultures and the lab trend come from the chart", () => {
    const f = collectFacts(sakura, sakura.history.filter((e): e is OrderEntry => e.kind === "order"), [], today, 4);
    expect(f.admitted).toBe("10/31（土）");
    expect(f.days).toBe(8); // -3 … +4
    expect(f.cultures.some((c) => c.includes("MRSA") || c.includes("黄色ブドウ球菌"))).toBe(true);
    expect(labTrend(sakura).find((l) => l.code === "CRP")?.first.day).toBe(-3);
  });
  it("lists what to settle before discharge", () => {
    const c = dischargeChecks(sakura, entries, ["造影CT"]);
    expect(c.at(-1)).toBe("説明前の同意書：造影CT");
  });
});

it("記事の原文、申込、退院先・日付、退院処方をコピーし、入力を変えない", async () => {
  const { newProcedureDraft } = await import("./drafts");
  const history = [
    { kind: "note" as const, day: 0, time: "09:00", author: "医師", role: "医師" as const, soap: { s: "息苦しい", o: "浮腫あり", a: "入院時評価", p: "入院時方針" } },
    { kind: "note" as const, day: 1, time: "15:00", author: "医師", role: "医師" as const, soap: { a: "浮腫は軽減", p: "外来で再診" } },
  ];
  const drafts = [{ ...newProcedureDraft("PROC-LEAVE", "leave"), leave: { kind: "退院" as const, from: { day: 3, time: "10:00" }, destination: "自宅（長女と同居）", note: "介護タクシー" } }];
  const prescription: OrderEntry = { kind: "order", id: "rx", day: 1, time: "10:00", author: "医師", status: "有効", order: { type: "prescription", category: "退院時", drugCode: "ORAL-REBA100", amount: 1, unit: "錠", timings: ["朝"], start: { day: 3, timing: "朝" }, days: 7 } };
  const before = JSON.stringify({ history, drafts });
  const d = createDischargeDraft(sakura, [...history, prescription], drafts, today, { diagnosis: "心不全", purpose: "利尿薬で治療" });
  expect(d.sections.complaint).toBe("息苦しい");
  expect(d.sections.present).toBe("息苦しい\n浮腫あり");
  expect(d.sections.reason).toBe("心不全\n利尿薬で治療");
  expect(d.sections.status).toBe("浮腫は軽減");
  expect(d.sections.plan).toContain("外来で再診");
  expect(d.sections.plan).toContain("レバミピド");
  expect(d.sections.plan).toContain("7日分");
  expect(d.destination).toBe("自宅（長女と同居）");
  expect(d.dischargeDay).toBe(3);
  expect(d.sources?.status).toContain("11/4（水） 15:00");
  expect(d.sections.course).toBe("");
  expect(JSON.stringify({ history, drafts })).toBe(before);
  d.sections.present = "編集";
  expect(history[0].soap.s).toBe("息苦しい");
});

it("記事のない患者の内容を推測しない", () => {
  const d = createDischargeDraft(sakura, [], [], today);
  expect(d.sections.complaint).toBe("");
  expect(d.sections.status).toBe("");
  expect(d.destination).toBe("");
});

it("日数・明示終了・中止を退院日と比較して終了表示する", () => {
  const base: OrderEntry = { kind:"order",id:"iv",day:-3,time:"10:00",author:"医師",status:"有効",order:{type:"injection",items:[{drugCode:"INJ-NS100",amount:100,unit:"mL"}],route:"点滴静注",schedule:{kind:"per_day",count:1},start:{day:-3,time:"10:00"},days:2} };
  expect(collectFacts(sakura,[base],[],today,0).injections[0]).toContain("終了（11/2");
  expect(collectFacts(sakura,[{...base,status:"終了",stoppedOn:-2,order:{...base.order as import("./types").InjectionOrder,days:undefined}}],[],today,0).injections[0]).toContain("終了（11/1");
  expect(collectFacts(sakura,[{...base,order:{...base.order as import("./types").InjectionOrder,end:{day:-1,time:"00:00"}}}],[],today,0).injections[0]).toContain("終了（11/2");
  expect(collectFacts(sakura,[{...base,status:"中止",stoppedOn:0,stoppedTime:"12:00"}],[],today,0).injections[0]).toContain("終了（11/2");
  expect(collectFacts(sakura,[base],[],today,-2).injections[0]).toContain("継続中");
  const oxygen: OrderEntry = {...base,order:{type:"procedure",code:"PROC-O2",schedule:{kind:"continuous"},start:{day:-3,time:"10:00"},days:1}};
  expect(collectFacts(sakura,[oxygen],[],today,0).procedures[0]).toContain("終了（11/1");
  expect(collectFacts(sakura,[{...base,status:"中止",stoppedOn:-2,stoppedTime:"12:00"}],[],today,0).injections[0]).toContain("終了（11/1");
});

it("退院時処方と退院日に続く内服を分け、未来の開始・終了済みを除く", () => {
  const rx = (id:string, start:number, category:"定期"|"退院時"="定期",days=7):OrderEntry=>({kind:"order",id,day:0,time:"10:00",author:"医師",status:"有効",order:{type:"prescription",category,drugCode:"ORAL-REBA100",amount:1,unit:"錠",timings:["朝"],start:{day:start,timing:"朝"},days}});
  const f=collectFacts(sakura,[rx("future",3),rx("current",0),rx("home",1,"退院時"),rx("past",-10)],[],today,1);
  expect(f.prescriptions).toHaveLength(1);
  expect(f.continuingPrescriptions).toHaveLength(1);
  expect(f.continuingPrescriptions[0]).toContain("7日分");
  expect(f.continuingPrescriptions[0]).toContain("11/3");
});
it("入院日の入院時テンプレートを最初の転記に優先する", () => {
  const note=(day:number,time:string,s:string,templateName?:string)=>({kind:"note" as const,day,time,author:"医師",role:"医師" as const,soap:{s,o:"所見"},templateName});
  const d=createDischargeDraft({...sakura,admittedOn:-11},[note(-10,"08:00","入院2日目"),note(-11,"12:00","入院時の主訴","入院時"),note(-11,"07:00","経過")],[],today);
  expect(d.sections.complaint).toBe("入院時の主訴");
  expect(d.sources?.present).toContain("12:00");
});
it("開始前中止の注射に逆転した期間を出さない",()=>{
  const iv:OrderEntry={kind:"order",id:"future",day:0,time:"10:00",author:"医師",status:"中止",stoppedOn:0,stoppedTime:"10:20",order:{type:"injection",items:[{drugCode:"INJ-NS100",amount:250,unit:"mL"}],route:"点滴静注",schedule:{kind:"per_day",count:1},start:{day:1,time:"10:00"},days:3}};
  expect(collectFacts(sakura,[iv],[],today,1).injections[0]).toContain("開始前に中止");
});

it("SOAPでない入院時記録の主訴・現病歴を原文から転記する",()=>{
  const history=[{kind:"note" as const,day:-11,time:"10:00",author:"医師",role:"医師" as const,text:"入院時記録\n主訴：発熱。現病歴：昨日から悪寒。既往歴：高血圧。\n身体所見：圧痛。"},{kind:"note" as const,day:-10,time:"09:00",author:"医師",role:"医師" as const,soap:{s:"入院2日目"}}];
  const d=createDischargeDraft({...sakura,admittedOn:-11},history,[],today);
  expect(d.sections.complaint).toBe("発熱。");expect(d.sections.present).toBe("昨日から悪寒。");expect(d.sources?.complaint).toContain("10/23");
});
