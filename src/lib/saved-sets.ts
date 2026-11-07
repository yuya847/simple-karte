import type { Draft, InjectionDraft } from './drafts';
import { DRUGS } from './master';
import { ROLE_DEPT } from './board';
import { doctorOf, DOCTORS } from './doctors';
import { NURSES } from './nurses';
import { STAFF, type Role } from './roles';
import { WARD_NAME } from './ward';

/** Who sees a set: 院内共通 = everyone, 科 = the same 診療科, 部署 = the same 部署 (a ward, 薬剤部 …), 個人 = the one who saved it. */
export type SetScope = '院内共通' | '科' | '部署' | '個人';
/** From the widest to the narrowest. A new set is 個人 until another is chosen. */
export const SET_SCOPES: SetScope[] = ['院内共通', '科', '部署', '個人'];
/** `dept`・`unit`: the 科 and 部署 of the one who saved it, at that time (absent in sets saved before the four scopes). */
export type SavedSet = { id: string; name: string; owner: string; scope: SetScope; dept?: string; unit?: string; rows: { heading: string; note: string; label: string; draft: Draft }[] };
const KEY = 'simple-karte:draft-sets:v1';

/** A scope as saved, read as one of the four (the earlier 自分だけ・科・病棟 become 個人・科・部署); null when unknown. */
export function scopeOf(v: unknown): SetScope | null {
  if (v === '自分だけ') return '個人';
  if (v === '病棟') return '部署';
  return SET_SCOPES.includes(v as SetScope) ? (v as SetScope) : null;
}

/** The role of a person of this demo by name (医師・看護師 and the staff of each role); null when not known. */
export function roleOfName(name: string): Role | null {
  if (DOCTORS.some((d) => d.name === name)) return '医師';
  if (NURSES.some((n) => n.name === name)) return '看護師';
  return (Object.values(STAFF).find((s) => s.name === name)?.role) ?? null;
}

/**
 * 科 and 部署 of a person, from the role and the ward (the demo keeps no 所属 for staff): a doctor's 科 is the
 * department of the team and the 部署 is 医局; a nurse's 部署 is the ward of the rooms looked after (ICU・HCU, else the
 * ward); the others are in the 部署 of their role (薬剤部・検査部 …). Without a 診療科, 科 is the 部署.
 */
export function staffPlace(person: { role: Role; name: string }): { dept: string; unit: string } {
  if (person.role === '医師') return { dept: doctorOf(person.name)?.team.split(' ')[0] ?? person.name, unit: ROLE_DEPT.医師 };
  if (person.role === '看護師') {
    const room = NURSES.find((n) => n.name === person.name)?.rooms[0] ?? '';
    const unit = room.startsWith('ICU') ? 'ICU' : room.startsWith('HCU') ? 'HCU' : WARD_NAME;
    return { dept: unit, unit };
  }
  const unit = ROLE_DEPT[person.role];
  return { dept: unit, unit };
}

/** The 科・部署 a set belongs to: as saved, or (an earlier set) from the one who saved it. */
function placeOfSet(set: SavedSet): { dept: string; unit: string } {
  if (set.dept !== undefined && set.unit !== undefined) return { dept: set.dept, unit: set.unit };
  const role = roleOfName(set.owner);
  const p = role ? staffPlace({ role, name: set.owner }) : { dept: '', unit: '' };
  return { dept: set.dept ?? p.dept, unit: set.unit ?? p.unit };
}

/** Whether this person sees the set (the one who saved it always does). */
export function setVisible(set: SavedSet, me: { role: Role; name: string }): boolean {
  if (set.scope === '院内共通' || set.owner === me.name) return true;
  if (set.scope === '個人') return false;
  const mine = staffPlace(me);
  const its = placeOfSet(set);
  return set.scope === '科' ? !!its.dept && its.dept === mine.dept : !!its.unit && its.unit === mine.unit;
}
export const reusableDraft = (d: Draft) => !['stop', 'extend', 'unclear', 'opd-booking'].includes(d.kind);
export function setDraft(draft: Draft, id: string): Draft {
  const d = structuredClone(draft);
  d.id = id; d.origin = 'manual'; d.sourceText = ''; d.comment = null;
  if (d.kind === 'injection') { d.start = { day: null, time: null }; delete d.end; delete d.startNow; d.duplicate = null; delete d.interactionReasons; }
  if (d.kind === 'prescription') { d.start = { day: null, timing: null }; d.acks = []; delete d.reportId; delete d.alreadyDone; delete d.interactionReasons; }
  if (d.kind === 'imaging' || d.kind === 'physio') { d.when = { day: null, time: null, priority: null }; d.duplicateOk = false; }
  if (d.kind === 'procedure') { d.start = { day: null, time: null }; d.duplicate = null; d.flowOk = false; d.hdOk = false; }
  if (d.kind === 'lab') { d.collect = { day: null, time: null, when: null, beforeDose: null }; d.duplicateOk = false; }
  return d;
}
/** The sets saved in this browser, the earlier scopes read as the four. */
export function loadSavedSets(): SavedSet[] { try { const v: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]'); return Array.isArray(v) ? v.filter((s): s is SavedSet => !!s && typeof s.id === 'string' && typeof s.name === 'string' && scopeOf(s.scope) !== null && Array.isArray(s.rows) && s.rows.every((r: SavedSet['rows'][number]) => r && typeof r.heading === 'string' && typeof r.label === 'string' && r.draft && reusableDraft(r.draft))).map((s) => ({ ...s, scope: scopeOf(s.scope)! })) : []; } catch { return []; } }
export function saveSavedSet(set: SavedSet): boolean { try { localStorage.setItem(KEY, JSON.stringify([...loadSavedSets(), set])); window.dispatchEvent(new Event('draft-sets-changed')); return true; } catch { return false; } }
export function expandSavedSet(set: SavedSet, indices: number[], newId: () => string): Draft[] { return set.rows.filter((_, i) => indices.includes(i)).map(r => setDraft(r.draft, newId())); }
function seedDrug(code: string): InjectionDraft | null {
  const drug = DRUGS.find(d => d.code === code); if (!drug) return null;
  return { id: code, kind: 'injection', origin: 'manual', sourceText: drug.name, comment: null, items: [{ drugCode: code, said: drug.name, amount: null, unit: null }], route: null, schedule: null, infusionMinutes: null, infusionScope: null, rateMlPerH: null, prefer: null, start: { day: null, time: null }, days: null, duplicate: null };
}
const seedSets: SavedSet[] = [{ id: 'seed-circulation', name: '循環管理セット', code: 'INJ-FRS20', heading: '利尿薬' }, { id: 'seed-palliative', name: '呼吸困難時（緩和）', code: 'INJ-MOR10', heading: '呼吸困難時' }].map(s => ({ id: s.id, name: s.name, owner: '', scope: '院内共通', rows: [seedDrug(s.code)].flatMap(d => d ? [{ heading: s.heading, note: '', label: DRUGS.find(x => x.code === s.code)!.name, draft: d }] : []) }));

const fluid = seedDrug('INJ-NS500');
if (fluid) seedSets[0].rows.push({ heading: 'メイン輸液', note: '', label: DRUGS.find(d => d.code === 'INJ-NS500')!.name, draft: fluid });
export const INITIAL_SAVED_SETS = seedSets;
