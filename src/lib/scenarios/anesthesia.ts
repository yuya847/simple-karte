import { emptyAnesthesia, preopFromChart, preopNote, postopNote } from '../anesthesia';
import type { Patient } from '../types';
import type { Surgery } from '../surgery';
export function addScenarioAnesthesia(patients:Patient[], surgeries:Surgery[]) {
  const targets = patients.filter(p => /大腿骨|腰椎圧迫骨折|大腸癌|胆|虫垂/.test(p.admissionDiagnosis)).sort((a,b)=>Number(!!a.dischargedAt)-Number(!!b.dischargedAt)).slice(0,5);
  for (const [i,p] of targets.entries()) {
    surgeries.push({ id:`${p.id}-anesthesia-plan`, patientId:p.id, name:p.name, sex:p.sex, age:p.age, ward:p.ward, department:p.department, day:p.dischargedAt?Math.min(-1,p.dischargedAt.day-1):i===2?-1:i%2, room:i%2?'手術室2':'手術室3', start:i%2?'13:00':'09:00', minutes:120, procedure:/腰椎/.test(p.admissionDiagnosis)?'経皮的椎体形成術':/骨/.test(p.admissionDiagnosis)?'人工骨頭挿入術':/大腸/.test(p.admissionDiagnosis)?'腹腔鏡下結腸切除術':/虫垂/.test(p.admissionDiagnosis)?'虫垂切除術':'腹腔鏡下胆嚢摘出術', site:/骨/.test(p.admissionDiagnosis)?'股関節':'腹部', side:'なし', position:/腰椎/.test(p.admissionDiagnosis)?'伏臥位':'仰臥位', anesthesia:'全身麻酔', laparoscopic:!/骨/.test(p.admissionDiagnosis), kind:'予定', blood:'血液型・不規則抗体', after:'病棟', anesthesiaConsult:true, infections:p.infections, allergies:p.allergies, status:i===2?'退室':'受付済', requestedAt:-1440 });
  }
  let count=0;
  for(const s of [...surgeries].sort((a,b)=>Number(b.id.endsWith("anesthesia-plan"))-Number(a.id.endsWith("anesthesia-plan")))) {
    const p=patients.find(p=>p.id===s.patientId);
    if(!p || count>=8) continue;
    const i=count++;
    s.anesthesiaConsult=true;
    const c=emptyAnesthesia();
    if(i!==1) {
      c.preop={...preopFromChart(p,p.history.filter(e=>e.kind==='order'),'麻酔科 青木'),asa:'II',method:s.anesthesia==='脊椎麻酔'?'脊髄くも膜下麻酔':'全身麻酔',savedAt:-840};
      p.history.push({kind:'note',day:-1,time:'10:00',author:'麻酔科 青木',role:'医師',text:preopNote(c.preop)});
    }
    if(i===0 && s.day===0) { c.events={'入室':510,'導入':515,'麻酔器接続':515,'挿管':520,'執刀':530};c.vitals=[{at:530,sbp:115,dbp:65,hr:72,spo2:99,etco2:35,temperature:36.4}]; }
    if(s.day<0) { c.postop={nrs:'2',ponv:'なし',nerve:'新規症状なし',epidural:'なし',breathing:'室内気',consciousness:'清明',savedAt:-600};p.history.push({kind:'note',day:-1,time:'14:00',author:'麻酔科 青木',role:'医師',text:postopNote(c.postop)}); }
    s.anesthesiaCase=c;
  }
  return surgeries;
}
