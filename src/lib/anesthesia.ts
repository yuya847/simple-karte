import { addDays, type CalendarDate } from "./dates";
import { oralName } from "./format";
import type { Patient, OrderEntry, NoteEntry } from './types';
import type { Surgery } from './surgery';

export const ANESTHESIA_METHODS = ['全身麻酔', '脊髄くも膜下麻酔', '硬膜外麻酔', '伝達麻酔', '鎮静'] as const;
export const ANESTHESIA_EVENTS = ['入室', '導入', '麻酔器接続', '挿管', '執刀', '手術終了', '抜管', '麻酔器離脱', '退室'] as const;
export type AnesthesiaEvent = typeof ANESTHESIA_EVENTS[number];
export interface PreopAssessment {
  asa: string; doctor: string; method: string; history: string; medications: string;
  allergies: string; mallampati: string; mouth: string; neck: string; teeth: string;
  height: string; weight: string; tests: string; food: string; water: string;
  airwayPlan?: string; inductionPlan?: string; maintenancePlan?: string; analgesiaPlan?: string;
  premedication: string; blood: string; explanation: string; savedAt?: number;
}
export interface AnesthesiaPoint {
  at: number; sbp?: number; dbp?: number; hr?: number; spo2?: number; etco2?: number; temperature?: number;
}
export interface AnesthesiaAdministration { at: number; name: string; dose: number; unit: string; kind: '薬剤' | '輸液' | '輸血' | '出血' | '尿量' }
export interface PostopAssessment { nrs: string; ponv: string; nerve: string; epidural: string; breathing: string; consciousness: string; savedAt?: number }
export interface AnesthesiaCase {
  preop?: PreopAssessment; events: Partial<Record<AnesthesiaEvent, number>>; vitals: AnesthesiaPoint[];
  administrations: AnesthesiaAdministration[]; postop?: PostopAssessment; completedAt?: number;
  billingCategory?: '1' | '2' | '3' | '4' | '5'; management?: 'I' | 'II'; difficult?: boolean;
}
export const emptyAnesthesia = (): AnesthesiaCase => ({ events: {}, vitals: [], administrations: [] });
export function preopFromChart(patient: Patient | undefined, orders: OrderEntry[], doctor: string, today?: CalendarDate): PreopAssessment {
  return { asa: '', doctor, method: '', history: preopChartHistory(patient).join('、'),
    medications: orders.filter(e => e.status === '有効' && e.order.type === 'prescription').map(e => e.order.type === 'prescription' ? `${oralName(e.order.drugCode)} ${e.order.amount}${e.order.unit} ${e.order.timings.join('・')} 休薬：未確認` : '').join('\n'),
    allergies: patient?.allergies.join('、') ?? '', mallampati: '', mouth: '', neck: '', teeth: '',
    height: patient ? String(patient.heightCm) : '', weight: patient ? String(patient.weightKg) : '',
    tests: patient ? [...patient.labs].sort((a,b) => b.day-a.day || b.time.localeCompare(a.time)).map(l => `${anesthesiaDate(l.day, today)} ${l.time} ${Object.entries(l.values).filter(([k]) => ['Hb','Plt','PT-INR','INR','APTT','Cre','Cr','K','Glu','GLU','BS'].includes(k)).map(([k,v]) => `${k} ${v}`).join(' / ')}`).join('\n') + '\n' + patient.imaging.filter(x => x.modality === 'X線' && /胸/.test(x.region) && !x.pending).map(x => `${anesthesiaDate(x.day, today)} 胸部X線 ${x.report}`).join('\n') : '',
    food: '', water: '', premedication: '', blood: '', explanation: '' };
}
export function bmi(height: string, weight: string): string {
  const h = Number(height), w = Number(weight);
  return h > 0 && w > 0 ? (w / (h / 100) ** 2).toFixed(1) : '—';
}
export function anesthesiaSummary(c: AnesthesiaCase) {
  const duration = (a: AnesthesiaEvent,b: AnesthesiaEvent) => c.events[a] !== undefined && c.events[b] !== undefined && c.events[b]! >= c.events[a]! ? c.events[b]! - c.events[a]! : null;
  const total = (kind: AnesthesiaAdministration['kind']) => c.administrations.filter(x => x.kind === kind).reduce((n,x) => n+x.dose,0);
  return { anesthesiaMinutes: duration('麻酔器接続','麻酔器離脱'), surgeryMinutes: duration('執刀','手術終了'), fluid: total('輸液'), blood: total('輸血'), bleeding: total('出血'), urine: total('尿量') };
}
export function preopNote(p: PreopAssessment): string {
  return `【麻酔科術前診察】\n担当 ${p.doctor} ASA-PS ${p.asa} 麻酔法 ${p.method}\n既往 ${p.history}\n内服・休薬（有無・日付） ${p.medications}\nアレルギー ${p.allergies}\n気道 Mallampati ${p.mallampati} 開口 ${p.mouth} 頸部可動 ${p.neck} 歯牙 ${p.teeth}\n身長 ${p.height}cm 体重 ${p.weight}kg BMI ${bmi(p.height,p.weight)}\n検査 ${p.tests}\n最終食事 ${p.food} 最終清澄水 ${p.water}\n麻酔計画 気道確保 ${p.airwayPlan ?? ""} / 導入 ${p.inductionPlan ?? ""} / 維持 ${p.maintenancePlan ?? ""} / 術後鎮痛 ${p.analgesiaPlan ?? ""}\n前投薬 ${p.premedication}\n輸血準備 ${p.blood}\n説明 ${p.explanation}`;
}
export const anesthesiaClock = (at: number) => `${String(Math.floor(((at % 1440) + 1440) % 1440 / 60)).padStart(2,'0')}:${String(((at % 60) + 60) % 60).padStart(2,'0')}`;
export function orderedAnesthesia(c: AnesthesiaCase): AnesthesiaCase {
  return {...c, vitals: [...c.vitals].sort((a,b)=>a.at-b.at), administrations: [...c.administrations].sort((a,b)=>a.at-b.at)};
}
export function anesthesiaNote(c: AnesthesiaCase): string {
  const s = anesthesiaSummary(c), ordered = orderedAnesthesia(c);
  return [`【麻酔記録】`, `麻酔時間 ${s.anesthesiaMinutes ?? '未確定'}分 手術時間 ${s.surgeryMinutes ?? '未確定'}分`,
    `総輸液 ${s.fluid}mL 輸血 ${s.blood}mL 出血 ${s.bleeding}mL 尿量 ${s.urine}mL`,
    ...Object.entries(c.events).sort((a,b)=>a[1]!-b[1]!).map(([k,v])=>`${anesthesiaClock(v!)} ${k}`),
    ...ordered.administrations.map(x=>`${anesthesiaClock(x.at)} ${x.kind==='薬剤' ? '' : x.kind+' '}${x.kind==='出血'||x.kind==='尿量' ? '' : x.name+' '}${x.dose}${x.unit}`),
    ...ordered.vitals.map(v=>[anesthesiaClock(v.at), v.sbp!==undefined || v.dbp!==undefined ? `BP ${v.sbp??'—'}/${v.dbp??'—'}` : '', v.hr!==undefined ? `HR ${v.hr}` : '', v.spo2!==undefined ? `SpO2 ${v.spo2}%` : '', v.etco2!==undefined ? `EtCO2 ${v.etco2}` : '', v.temperature!==undefined ? `体温 ${v.temperature}℃` : ''].filter(Boolean).join(' '))].join('\n');
}
export function upsertAnesthesiaNote(notes: NoteEntry[], note: NoteEntry): NoteEntry[] {
  const old = notes.find(n=>n.id===note.id);
  if (!old) return [...notes,note];
  const versions = [...(old.versions ?? [{day:old.day,time:old.time,author:old.author,text:old.text}]), {day:note.day,time:note.time,author:note.author,text:note.text,reason:'麻酔記録の修正'}];
  return notes.map(n=>n.id===note.id ? {...note, day:old.day,time:old.time,writtenAt:old.writtenAt,versions} : n);
}
/** Replace this surgery's derived balance entries; never accumulate totals on resave. */
export function anesthesiaIo(s: Surgery, by: string, recordedAt: string): import('./io-balance').IoEntry[] {
  if (!s.patientId) return [];
  return (s.anesthesiaCase?.administrations ?? []).flatMap((x,i)=> x.kind==='薬剤' ? [] : [{id:`anesthesia:${s.id}:${i}`,patientId:s.patientId!,side:x.kind==='出血'||x.kind==='尿量' ? 'OUT' as const : 'IN' as const,kind:x.kind==='輸液' ? '点滴' as const : x.kind==='尿量' ? '尿' as const : x.kind,ml:x.dose,at:x.at,by,recordedAt,note:`麻酔記録 ${x.kind==='出血'||x.kind==='尿量' ? '' : x.name}`}]);
}
export function postopNote(p: PostopAssessment): string { return `【麻酔科術後回診】\nNRS ${p.nrs} PONV ${p.ponv}\n神経障害 ${p.nerve}\n硬膜外カテーテル ${p.epidural}\n呼吸 ${p.breathing}\n意識 ${p.consciousness}`; }
/** Only explicitly confirmed categories are mapped. Special cases remain for human selection. */
export function anesthesiaBillingCodes(s: Surgery): string[] {
  const c = s.anesthesiaCase;
  if (c?.completedAt === undefined || !c.preop) return [];
  const codes: string[] = [];
  if (c.preop.method === '全身麻酔' && c.billingCategory && c.difficult !== undefined && s.age >= 15) {
    const pairs = { '1': ['150332610','150332510'], '2': ['150332810','150332710'], '3': ['150333010','150332910'], '4': ['150333210','150333110'], '5': ['150233410','150328210'] };
    codes.push(pairs[c.billingCategory][c.difficult ? 1 : 0]);
  }
  const method = c.preop.method;
  if (c.management && ['全身麻酔','脊髄くも膜下麻酔','硬膜外麻酔'].includes(method)) {
    const map = c.management === 'I' ? ['150279110','150279010','150282210'] : ['150342710','150342610','150342510'];
    codes.push(map[['全身麻酔','脊髄くも膜下麻酔','硬膜外麻酔'].indexOf(method)]);
  }
  return codes;
}

/** Special techniques must be excluded by the doctor before applying this limited rule. */
export function routineAnesthesiaCategory(s: Surgery): '3' | '4' | '5' {
  return s.position === '伏臥位' ? '3' : s.laparoscopic || s.position === '側臥位' ? '4' : '5';
}
export function anesthesiaTimeUnits(minutes: number | null): number | null {
  return minutes === null || minutes < 0 ? null : Math.max(0, Math.ceil((minutes-120)/30));
}

export function anesthesiaDate(day: number, today?: CalendarDate): string {
  if (!today) return `${day}日`;
  const d = addDays(today, day);
  return `${d.m}/${d.d}${day === 0 ? '（今日）' : ''}`;
}
/** Validate only recorded events; missing events may be entered later. */
export function anesthesiaEventError(events: AnesthesiaCase['events']): string {
  let previous: AnesthesiaEvent | undefined;
  for (const event of ANESTHESIA_EVENTS) {
    if (events[event] === undefined) continue;
    if (previous && events[event]! < events[previous]!) return `${event.replace('麻酔器','')}は${previous.replace('麻酔器','')}より後に`;
    previous = event;
  }
  return '';
}
export function anesthesiaSaveReason(c: AnesthesiaCase, patientId?: string): string {
  if (!patientId) return '患者を確認してください';
  return anesthesiaEventError(c.events) || (anesthesiaSummary(c).anesthesiaMinutes === null ? '接続・離脱の時刻を登録してください' : anesthesiaSummary(c).surgeryMinutes === null ? '執刀・手術終了の時刻を登録してください' : '');
}

export function preopHasChanges(value: PreopAssessment, saved: PreopAssessment | undefined, today: CalendarDate): boolean {
  const normalize = (p: PreopAssessment | undefined) => p && {...p, tests:p.tests.replace(/(-?\d+)日(?= )/g,(_,d)=>anesthesiaDate(Number(d),today))};
  return JSON.stringify(normalize(value)) !== JSON.stringify(normalize(saved));
}
export function pendingAnesthesiaPreop(entries: Record<string,unknown>, surgeries: Surgery[], today: CalendarDate): boolean {
  return Object.entries(entries).some(([key,value])=>{
    const [scope,field] = JSON.parse(key) as string[];
    if(field !== 'anesthesia-preop' || !value) return false;
    const saved = surgeries.find(s => (s.patientId ?? s.id) === scope)?.anesthesiaCase?.preop;
    return preopHasChanges(value as PreopAssessment,saved,today);
  });
}

/** Copy explicitly labelled history verbatim; do not infer diagnoses from narrative. */
export function preopChartHistory(patient: Patient | undefined, diagnoses: string[] = []): string[] {
  const history = patient?.history.flatMap(e => e.kind === 'note' ? [...(e.text ?? '').matchAll(/既往歴[：:]([^。\n]+)/g)].map(m=>`記事の既往：${m[1].trim()}`) : []) ?? [];
  return [...new Set([...(diagnoses.length ? diagnoses : patient ? [patient.admissionDiagnosis] : []), ...history])];
}
