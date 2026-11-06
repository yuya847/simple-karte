import { oralName } from "./format";
import type { Patient, OrderEntry } from './types';
import type { Surgery } from './surgery';

export const ANESTHESIA_METHODS = ['全身麻酔', '脊髄くも膜下麻酔', '硬膜外麻酔', '伝達麻酔', '鎮静'] as const;
export const ANESTHESIA_EVENTS = ['入室', '導入', '麻酔器接続', '挿管', '執刀', '手術終了', '抜管', '麻酔器離脱', '退室'] as const;
export type AnesthesiaEvent = typeof ANESTHESIA_EVENTS[number];
export interface PreopAssessment {
  asa: string; doctor: string; method: string; history: string; medications: string;
  allergies: string; mallampati: string; mouth: string; neck: string; teeth: string;
  height: string; weight: string; tests: string; food: string; water: string;
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
export function preopFromChart(patient: Patient | undefined, orders: OrderEntry[], doctor: string): PreopAssessment {
  return { asa: '', doctor, method: '', history: patient?.admissionDiagnosis ?? '',
    medications: orders.filter(e => e.status === '有効' && e.order.type === 'prescription').map(e => e.order.type === 'prescription' ? `${oralName(e.order.drugCode)} ${e.order.amount}${e.order.unit} ${e.order.timings.join('・')} 休薬：未確認` : '').join('\n'),
    allergies: patient?.allergies.join('、') ?? '', mallampati: '', mouth: '', neck: '', teeth: '',
    height: patient ? String(patient.heightCm) : '', weight: patient ? String(patient.weightKg) : '',
    tests: patient ? [...patient.labs].sort((a,b) => b.day-a.day || b.time.localeCompare(a.time)).map(l => `${l.day}日 ${l.time} ${Object.entries(l.values).filter(([k]) => ['Hb','Plt','PT-INR','INR','APTT','Cre','Cr','K','Glu','GLU','BS'].includes(k)).map(([k,v]) => `${k} ${v}`).join(' / ')}`).join('\n') + '\n' + patient.imaging.filter(x => x.modality === 'X線' && /胸/.test(x.region) && !x.pending).map(x => `${x.day}日 胸部X線 ${x.report}`).join('\n') : '',
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
  return `【麻酔科術前診察】\n担当 ${p.doctor} ASA-PS ${p.asa} 麻酔法 ${p.method}\n既往 ${p.history}\n内服・休薬（有無・日付） ${p.medications}\nアレルギー ${p.allergies}\n気道 Mallampati ${p.mallampati} 開口 ${p.mouth} 頸部可動 ${p.neck} 歯牙 ${p.teeth}\n身長 ${p.height}cm 体重 ${p.weight}kg BMI ${bmi(p.height,p.weight)}\n検査 ${p.tests}\n最終食事 ${p.food} 最終清澄水 ${p.water}\n前投薬 ${p.premedication}\n輸血準備 ${p.blood}\n説明 ${p.explanation}`;
}
export function anesthesiaNote(c: AnesthesiaCase): string {
  const s = anesthesiaSummary(c);
  return `【麻酔記録】\n麻酔時間 ${s.anesthesiaMinutes ?? '未確定'}分 手術時間 ${s.surgeryMinutes ?? '未確定'}分\n総輸液 ${s.fluid}mL 輸血 ${s.blood}mL 出血 ${s.bleeding}mL 尿量 ${s.urine}mL\n${Object.entries(c.events).map(([k,v])=>`${k} ${Math.floor(v!/60)}:${String(v!%60).padStart(2,'0')}`).join('\n')}\n${c.administrations.map(x=>`${x.at}分 ${x.kind} ${x.name} ${x.dose}${x.unit}`).join('\n')}\nバイタル ${JSON.stringify(c.vitals)}`;
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
