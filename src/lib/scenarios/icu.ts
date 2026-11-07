// 医師が設定した架空の値。臨床判断・治療推奨には使用しない。
import type { Patient, Sex, Order, OrderEntry } from "../types";
import type { Diagnosis } from "../diagnoses";
import type { DietOrder } from "../diet";
import type { InsuranceBook, InsuranceForm } from "../billing/registration";
import { toInsurance } from "../billing/registration";
import { emptyIcuRecords, unitOf, type At, type IcuRecords, type VentSetting, type Infusion, type LineDevice } from "../icu/types";
import { DRUGS } from "../master";
import { doctorFor, nurseFor } from "../ward";
import { STAFF } from "../roles";
import { scenarioName } from "./names";
import { emptyCath } from "../cardiac-cath";
import type { StandingOrders } from "../standing";
import type { Stage } from ".";

interface IcuCase { patient: Patient; bed: string; diagnoses: Diagnosis[]; diets: DietOrder[]; stage: Stage; destination: string; planned: boolean; restraints: import("../restraint").Restraint[]; surgeries: import("../surgery").Surgery[]; directives: import("../directives").AdvanceDirective[] }
const at = (day: number, time = "00:00"): At => ({ day, time });
const abs = (a: At) => a.day * 1440 + Number(a.time.slice(0, 2)) * 60 + Number(a.time.slice(3));
const dxs = [
  ["7855015", "敗血症性ショック", "A419"], ["8844160", "急性呼吸窮迫症候群", "J80"],
  ["4275002", "心停止", "I469"], ["8839303", "脾損傷", "S360"], ["5770019", "急性膵炎", "K859"],
  ["4560003", "食道静脈瘤破裂", "I850"], ["8832376", "急性心筋梗塞", "I219"],
  ["2501005", "糖尿病性ケトアシドーシス", "E141"], ["8838708", "脳梗塞", "I639"],
  ["7855015", "敗血症性ショック", "A419"], ["4289005", "急性心不全", "I509"], ["7991001", "急性呼吸不全", "J9609"],
];
const stories = [
  "尿路由来、ESBL産生大腸菌による敗血症性ショック。乏尿性AKI。血液培養2セット陽性。",
  "重症肺炎によるARDS。day −4・−3に腹臥位療法。P/F 95→140→180。",
  "院外VF、ROSCまで18分。緊急PCIでLADにステント留置。体温管理36℃。瞳孔3/3、対光反射+/+。GCS E1VTM1から本日M4。",
  "交通外傷。脾損傷に脾摘、骨盤骨折、多発肋骨骨折、右血胸。RBC12単位・FFP12単位・PC20単位輸血。day −1抜管。",
  "重症急性膵炎。造影CTで膵周囲の炎症と液体貯留、呼吸不全・循環不全・腎機能低下を認める。酢酸リンゲル150mL/h（採用マスターに合わせた架空の処方）。",
  "肝硬変、食道静脈瘤破裂。気道保護の挿管後に内視鏡的静脈瘤結紮術。RBC6単位・FFP4単位。本日自発呼吸トライアルを行い抜管を検討。",
  "前壁STEMIにPCI、LADステント。心エコーEF42%。ヘパリン持続終了、動脈ライン抜去済。尿道カテーテル抜去予定。明日一般病棟へ。",
  "糖尿病性ケトアシドーシス。インスリン0.1単位/kg/hから2単位/hへ。本日経口開始、皮下注へ切替予定。K補正後4.1。",
  "脳梗塞rt-PA後。NIHSS12→8。嚥下評価まで絶食。瞳孔・意識を1時間ごとに確認。",
  "肺炎による敗血症性ショック。day −8 ICU入室、day −3昇圧薬終了・抜管。day −2 HCU転棟、CVC抜去。尿道カテーテルは入室時から継続。明日5階東へ。",
  "急性心不全。NPPV IPAP10/EPAP5から本日09:00鼻カニュラ2L。利尿を認める。",
  "08:40救急車、JTAS1、重症肺炎による急性呼吸不全。救急外来でNPPV開始。集中治療室への入室申込は未実施。",
];

export function standingDefaults(p: Patient): Pick<StandingOrders, "rest" | "vitals" | "other"> & Partial<Pick<StandingOrders, "io">> {
  if (unitOf(p.ward)) return { rest: "ベッド上", vitals: "1時間ごと", io: "水分出納（IN/OUT）を測る", other: p.id === "99000109" ? "医師指示：収縮期血圧140〜180mmHgを目標に持続投与を調整。嚥下評価まで絶食。" : p.id === "99000103" ? "医師指示：体温管理36℃。呼吸器設定は記録の指示値。RASS −4、平均血圧65mmHg以上を目標。" : "医師指示：呼吸器設定は最新記録の指示値。SpO2 92〜96%、RASS −1〜0（心停止後は別記）、CPOT 2以下、平均血圧65mmHg以上を目標。変更時は医師へ連絡。" };
  return { rest: p.id === "99000013" ? "ベッド上" : /骨折|脳梗塞/.test(p.admissionDiagnosis) ? "室内" : "病棟内", vitals: p.id === "99000013" ? "4時間ごと" : "1日3回", other: p.id === "99000013" ? "人工呼吸器装着中。抜管後は酸素指示を確認。" : "" };
}

export function addIcuCases(cases: IcuCase[], insuranceForm: (i: number, age: number) => InsuranceForm | null, insurance: InsuranceBook): IcuRecords {
  const records = emptyIcuRecords();
  for (let k = 0; k < 12; k++) {
    const id = String(99000101 + k), day = [-3,-5,-1,-2,-2,-1,-1,-1,-1,-8,-1,0][k];
    const start = at(day, k === 2 ? "02:30" : k === 11 ? "08:40" : "00:00");
    const ward = k < 6 ? "ICU" : k < 11 ? "HCU" : "救急外来";
    const room = k < 6 ? `ICU${k+1}` : k < 11 ? `HCU${k-5}` : "";
    const department = k < 6 ? "集中治療科" : k === 7 || k === 9 ? "総合診療科" : k === 8 ? "脳神経内科" : k === 11 ? "救急科" : "循環器内科";
    const by = department === "総合診療科" ? STAFF.医師.name : doctorFor(department);
    const sex: Sex = [1,7,8,9].includes(k) ? "女" : "男";
    const p: Patient = { id, ...scenarioName(100+k, sex), sex, age: [72,58,64,35,49,61,66,24,77,81,79,70][k], weightKg: [68,55,75,70,82,60,72,52,50,45,70,80][k], heightCm: k === 1 ? 160 : sex === "女" ? 155 : 170, ward, room, department, attending: by, admittedOn: day, admissionDiagnosis: dxs[k][1], allergies: [], infections: k === 0 ? ["ESBL産生大腸菌（接触予防策）"] : [], cautions: [], blood: { abo: "A", rh: "+", checks: 2, antibody: "陰性" }, history: [], labs: [], cultures: [], imaging: [], vitals: [], daily: [] };
    const uid = (tag: string) => `${id}-${tag}`;
    const note = (a: At, text: string, nursing = false) => p.history.push({ kind: "note", id: uid(`note-${p.history.length}`), ...a, author: nursing ? nurseFor(room) : by, role: nursing ? "看護師" : "医師", text, ...(nursing ? { timeline: [{ time: a.time, text }] } : {}) });
    const order = (a: At, value: Order, status: OrderEntry["status"] = "有効") => p.history.push({ kind: "order", id: uid(`order-${p.history.length}`), ...a, author: by, status, order: value });
    if (k < 11) records.stays.push({ id: uid("stay"), patientId: id, unit: k === 9 || k < 6 ? "ICU" : "HCU", in: start, from: "救急外来", reason: stories[k], ...(k === 9 ? { out: at(-2, "12:00"), to: "HCU" } : {}) });
    if (k === 9) records.stays.push({ id: uid("hcu-stay"), patientId: id, unit: "HCU", in: at(-2, "12:00"), from: "ICU", reason: "呼吸・循環が安定し転棟" });
    const vent = (a: At, mode: VentSetting["mode"], airway: VentSetting["airway"], fio2: number, extra: Partial<VentSetting> = {}) => records.vents.push({ id: uid(`vent-${records.vents.length}`), patientId: id, at: a, by, mode, airway, fio2, ...extra });
    if ([0,1,2,3,5].includes(k)) {
      vent(start, k === 0 ? "A/C-PC" : "A/C-VC", "経口挿管", k === 1 ? .9 : .6, { peep: k === 1 ? 12 : 8, ...(k === 0 ? { pc: 14 } : { vt: k === 1 ? 320 : 420 }), rr: 18, tubeCm: k === 1 ? 21 : 22 });
      if (k === 0 || k === 1) { vent(at(day+1), k === 0 ? "A/C-PC" : "A/C-VC", "経口挿管", k === 0 ? .5 : .6, { peep: k === 0 ? 8 : 12, ...(k === 0 ? { pc: 12 } : { vt: 320 }), rr: 18, tubeCm: k === 0 ? 22 : 21 }); vent(at(0), k === 0 ? "A/C-PC" : "A/C-VC", "経口挿管", k === 0 ? .4 : .5, { peep: k === 0 ? 8 : 10, ...(k === 0 ? { pc: 10 } : { vt: 320 }), rr: 16, tubeCm: k === 0 ? 22 : 21 }); }
      if (k === 3) vent(at(-1, "10:00"), "HFNC", "鼻カニュラ", .35, { flow: 40 });
    } else if (k === 4) vent(start, "HFNC", "鼻カニュラ", .4, { flow: 40 });
    else if (k === 9) { vent(at(-3), "HFNC", "鼻カニュラ", .4, { flow: 40 }); vent(at(-2, "12:00"), "なし", "鼻カニュラ", .28, { flow: 2 }); }
    else if (k === 10 || k === 11) { vent(start, "NPPV", "マスク", k === 10 ? .4 : .6, { ps: 5, peep: 5 }); if (k === 10) vent(at(0,"09:00"), "なし", "鼻カニュラ", .28, { flow: 2 }); }
    const infusion = (search: string, amountMg: number, doseUnit: Infusion["doseUnit"], changes: [At, number][], end?: At) => {
      const drug = DRUGS.find(d => `${d.name} ${d.generic ?? ""}`.normalize("NFKC").includes(search.normalize("NFKC")));
      if (!drug) throw new Error(`ICU種に必要な薬がない：${search}`);
      records.infusions.push({ id: uid(`inf-${records.infusions.length}`), patientId: id, drugCode: drug.code, name: drug.name, amountMg, volumeMl: 50, doseUnit, weightKg: p.weightKg, start: changes[0][0], end, by, changes: changes.map(([a,rateMlPerH])=>({ at:a, rateMlPerH, by })) });
    };
    // 速度は医師が決めた固定値（5mg/50mL、体重別の処方値）。
    if ([0,2,3,4,5,9].includes(k)) {
      const rates = k === 0 ? [[start,12.24],[at(-2),8.16],[at(0,"06:00"),4.896]] : k === 2 ? [[start,3.6]] : k === 3 ? [[start,2.1]] : k === 4 ? [[start,2.952]] : k === 5 ? [[start,3.6],[at(0,"06:00"),1.44]] : [[start,4.05]];
      infusion("ノルアドレナリン",5,"γ",rates as [At,number][],k === 3 ? at(-1,"08:00") : k === 9 ? at(-3) : undefined);
    }
    if (k === 0) infusion("バソプレシン",20,"単位/h",[[start,3]],at(-1));
    if (k === 0 || k === 1) { infusion("プロポフォール１％静注５０",500,k === 1 ? "mg/kg/h" : "mg/h", k === 1 ? [[start,11]] : [[start,6],[at(0,"06:00"),3]]); infusion("フェンタニル注射",.5,"μg/h",[[start,2.5]]); }
    if (k === 3) infusion("フェンタニル注射",.5,"μg/h",[[start,5]]);
    if (k === 7) infusion("ヒューマリンＲ",50,"単位/h",[[start,5.2],[at(0,"04:00"),2]]);
    if (k === 8) infusion("ニカルジピン塩酸塩注射液１０",10,"mg/h",[[start,10],[at(0,"06:00"),5]]);
    if (k === 10) infusion("フロセミド注",200,"mg/h",[[start,2.5],[at(0,"06:00"),1.25]]);
    if (k === 6) infusion("ヘパリンＮａ透析",5000,"単位/h",[[start,5]],at(0,"06:00"));
    const line = (kind: LineDevice["kind"], site: string, insertedAt = start, removedAt?: At, spec?: string) => records.lines.push({ id: uid(`line-${records.lines.length}`), patientId: id, kind, site, insertedAt, removedAt, spec, by });
    if (k < 6 || k === 9) { line("CVC","右内頸",start,k === 9 ? at(-2,"12:00") : undefined); line("動脈ライン","左橈骨",start,k === 9 ? at(-3,"08:00") : undefined); line("胃管","経鼻",start,k === 9 ? at(-3,"08:00") : undefined); }
    if (k < 11) line("尿道カテーテル","尿道");
    if ([0,1,2,3,5].includes(k)) line("気管チューブ","口角",start,k === 3 ? at(-1,"10:00") : undefined,k === 1 ? "21cm" : "22cm");
    if (k === 6) line("動脈ライン","右橈骨",start,at(0,"06:00"));
    if (k === 2) line("その他","右大腿動脈シース",start,at(-1,"08:00"));
    if (k === 9 || k === 7 || k === 8) line("末梢静脈","左前腕",k === 9 ? at(-2,"12:00") : start);
    if (k === 3) line("胸腔ドレーン","右胸腔");
    if (k === 0) { line("透析用カテーテル","右大腿",at(-2)); records.crrt.push({ id:uid("crrt"),patientId:id,at:at(-2),by,mode:"CHDF",qb:100,qd:500,qf:300,removalMlPerH:50,anticoag:{drug:"ナファモスタット",ratePerH:20,unit:"mg/h"},access:"右大腿" }); }
    note(start, `${ward === "救急外来" ? "救急初療記録" : "ICU 入室時の記録（入院時記録）"}\n入室経路：救急外来。主病名：${p.admissionDiagnosis}。${stories[k]}\n呼吸・循環・意識・腎機能を評価し、装置と持続投与の記録のとおり医師が指示。家族へ病状説明。`);
    for (let d=day; d<=0; d++) {
      if (k < 11 && abs(at(d,"08:00")) >= abs(start)) note(at(d,"08:00"), `朝の回診：${stories[k]}\n呼吸器・循環、尿量と検査結果を確認。持続投与は記録の速度。`);
      for (let h=0; h<24 && (d<0 || h<=9); h++) {
        const a=at(d,`${String(h).padStart(2,"0")}:00`); if(abs(a)<abs(start)) continue;
        const v=records.vents.filter(v=>v.patientId===id && abs(v.at)<=abs(a)).at(-1);
        const historicalVent = k === 9 && d < -3;
        const sedated=v?.airway === "経口挿管" || historicalVent;
        p.vitals.push({...a,bt:k===2?36:37.2+(h%3)*.1,hr:80+h%8,sbp:110+h%7,dbp:60+h%5,rr:v?.rr??20,spo2:96,o2:historicalVent ? "人工呼吸 FiO2 0.5" : v ? v.mode === "なし" ? "鼻カニュラ 2L" : `${v.mode === "HFNC" || v.mode === "NPPV" ? v.mode : "人工呼吸"} FiO2 ${v.fio2}` : "室内気",gcs:{e:sedated?1:4,...(sedated?{}:{v:5 as const}),m:k===2 ? d===0?4:1 : sedated?4:6},by:nurseFor(room)});
        records.hourly.push({id:uid(`hour-${d}-${h}`),patientId:id,at:a,by:nurseFor(room),map:77,arterialLine:records.lines.some(l=>l.patientId===id&&l.kind==="動脈ライン"&&abs(l.insertedAt)<=abs(a)&&(!l.removedAt||abs(a)<abs(l.removedAt))),rass:k===2?-4:sedated?(d===0?-1:-3):0,cpot:h%3,camIcu:sedated&&d<0?"評価不能":"陰性",pupils:{right:3,left:3,reactRight:"+",reactLeft:"+"},urineMl:k===0?10+(h%4)*10:k===10?150+(h%4)*50:40+(h%4)*10,...(k===3?{drainMl:20+(h%3)*20}:{}),...(k===1?{enteralMl:d<=-3?20:40}:{}),...(k===7?{glucose:d===-1?[486,312,245,198,176][Math.min(h,4)]:160+h}: {})});
      }
      p.daily.push({day:d,urineMl:records.hourly.filter(r=>r.patientId===id&&r.at.day===d).reduce((s,r)=>s+(r.urineMl??0),0),meals:k===8||k<6?"絶食":[10,10,10],weightKg:p.weightKg});
      if (abs(at(d,"09:00"))>=abs(start)) note(at(d,"09:00"),"経時記録：呼吸状態、持続投与の速度、ライン固定、尿量を確認。",true);
    }
    const lab = (a:At,values:Record<string,number>)=>p.labs.push({...a,values});
    lab(start,{WBC:18000,CRP:24,BUN:k===0?58:24,Na:k===7?130:138,Hb:k===3?6.1:k===5?5.9:11,Cre:k===0?2.8:k===4?1.9:1.1,Plt:k===0?9:18,Lac:k===0?6.2:k===4?3.8:2, pH:k===7?7.12:k===11?7.30:7.28,PaO2:k===1?85.5:k===11?58:78,PaCO2:k===11?55:38,HCO3:17,K:k===7?3.4:4.1,...(k===10?{BNP:1250}: {})});
    if(k!==11) { lab(at(0,"06:00"),{WBC:12000,CRP:12,Hb:k===3?9.8:k===5?8.4:11,Cre:k===0?2.6:k===4?1.9:1,Plt:k===0?4.8:18,Lac:k===0?1.4:k===4?1.9:1.2,pH:k===7?7.31:7.38,PaO2:k===1?90:95,PaCO2:40,HCO3:23,K:4.1,...(k===0?{"T-Bil":1.8}:{})}); }
    if(k===0) { lab(at(-1,"06:00"),{Lac:2.1,Cre:3.1,Plt:6}); p.cultures.push({id:uid("culture"),collectedOn:day,specimen:"血液",sets:"2セット",status:"最終報告",reportedOn:-1,reportedTime:"09:00",organism:"ESBL産生大腸菌",gram:"グラム陰性桿菌",susceptibility:[{drug:"メロペネム",mic:"≤0.25",result:"S"},{drug:"セフトリアキソン",mic:">32",result:"R"}]}); }
    if(k===1) lab(at(-3,"06:00"),{pH:7.34,PaO2:84,PaCO2:42,HCO3:22});
    if(k===0) { const drug=DRUGS.find(d=>d.name.normalize("NFKC").includes("メロペネム点滴静注用1g"))!; order(start,{type:"injection",items:[{drugCode:drug.code,amount:1,unit:drug.units[0]}],route:"点滴静注",schedule:{kind:"per_day",count:3},start,minutesPerDose:60,comment:"医師の固定の試験指示"}); }
    if(k===4 || k===7) { const drug=DRUGS.find(d=>d.name.includes("乳酸リンゲル")) ?? DRUGS.find(d=>d.generic?.includes("乳酸リンゲル")); const fluid = drug ?? DRUGS.find(d=>d.generic?.includes("酢酸リンゲル"))!; order(start,{type:"injection",items:[{drugCode:fluid.code,amount:500,unit:"mL"},...(k===7?[{drugCode:"INJ-KCL20",amount:20,unit:"mEq"}]:[])],route:"点滴静注",schedule:{kind:"per_day",count:1},start,rateMlPerH:k===4?150:100,comment:k===7?"医師指示：カリウム補正を併用、採血で確認":"医師指示の持続速度"}); }
    if(k===2||k===6) order(start,{type:"physio",test:"PHY-CATH",cath:{...emptyCath(),studies:["冠動脈造影 CAG"],pci:true,approach:"橈骨",side:"右",renalChecked:true,allergyChecked:true,metformin:"内服なし",preparation:"医師確認済み"},purpose:"LADステント留置",when:{...start,priority:"至急"},place:"検査室",transport:"ストレッチャー"},"実施済");
    if(k===3||k===5) for(const [product,units] of (k===3?[["RBC",12],["FFP",12],["PC",20]]:[["RBC",6],["FFP",4]]) as ["RBC"|"FFP"|"PC",number][]) order(start,{type:"procedure",code:"PROC-TX",start,schedule:{kind:"once"},tx:{product,units,abo:"A",rh:"+",reason:stories[k]}},"実施済");
    if(k===6||k===9) { if(k===9) order(at(-2,"12:00"),{type:"procedure",code:"PROC-MOVE",start:at(-2,"12:00"),schedule:{kind:"once"},move:{kind:"転棟",to:{room:"HCU4",bed:""},reason:"循環・呼吸が安定"}},"実施済"); order(at(0,"09:00"),{type:"procedure",code:"PROC-MOVE",start:at(1,"10:00"),schedule:{kind:"once"},move:{kind:"転棟",to:{room:k===9?"502":"511",bed:""},reason:"明日5階東へ転出予定"}}); }
    p.labs.sort((a,b)=>abs(a)-abs(b)); p.history.sort((a,b)=>abs(a)-abs(b));
    const diets: DietOrder[] = k === 8 ? [{ id: uid("npo"), patientId: id, from: { day, meal: "朝" }, kind: "絶食", npoReason: "嚥下評価まで", by, at: start }] : [];
    const [code,name,icd10]=dxs[k];
    cases.push({patient:p,bed:"",diagnoses:[{id:uid("dx"),code,name,icd10,prefixes:[],suffixes:[],main:true,start:day,outcome:"継続"}],diets,stage:k===11?"救急":"入院",destination:"自宅",planned:false,restraints:[],surgeries:[],directives:[]});
    const form=insuranceForm(100+k,p.age); if(form) insurance[id]=[{form,insurance:toInsurance(form),action:"登録",by:"医事課",at:start}];
  }
  return records;
}

/** 実施済のPCIを検査室側でも実施済みにする（新しい検査は生成しない）。 */
export function addIcuCathResults(patients: Patient[], desk: import("../physio-desk").PhysioDesk) {
  for (const p of patients) for (const e of p.history) {
    if (e.kind !== "order" || e.status !== "実施済" || e.order.type !== "physio" || e.order.test !== "PHY-CATH") continue;
    const a = { day: e.order.when.day, time: e.order.when.time ?? e.time, by: p.attending };
    desk[e.id] = { orderId: e.id, patientId: p.id, test: "PHY-CATH", arrived: a, done: a };
  }
}
