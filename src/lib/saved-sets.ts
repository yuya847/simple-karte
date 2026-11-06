import type { Draft, InjectionDraft } from './drafts';
import { DRUGS } from './master';
export type SavedSet = { id: string; name: string; owner: string; scope: '自分だけ' | '科' | '病棟'; rows: { heading: string; note: string; label: string; draft: Draft }[] };
const KEY = 'simple-karte:draft-sets:v1';
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
export function loadSavedSets(): SavedSet[] { try { const v: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]'); return Array.isArray(v) ? v.filter((s): s is SavedSet => !!s && typeof s.id === 'string' && typeof s.name === 'string' && Array.isArray(s.rows) && s.rows.every((r: SavedSet['rows'][number]) => r && typeof r.heading === 'string' && typeof r.label === 'string' && r.draft && reusableDraft(r.draft))) : []; } catch { return []; } }
export function saveSavedSet(set: SavedSet): boolean { try { localStorage.setItem(KEY, JSON.stringify([...loadSavedSets(), set])); window.dispatchEvent(new Event('draft-sets-changed')); return true; } catch { return false; } }
export function expandSavedSet(set: SavedSet, indices: number[], newId: () => string): Draft[] { return set.rows.filter((_, i) => indices.includes(i)).map(r => setDraft(r.draft, newId())); }
function seedDrug(code: string): InjectionDraft | null {
  const drug = DRUGS.find(d => d.code === code); if (!drug) return null;
  return { id: code, kind: 'injection', origin: 'manual', sourceText: drug.name, comment: null, items: [{ drugCode: code, said: drug.name, amount: null, unit: null }], route: null, schedule: null, infusionMinutes: null, infusionScope: null, rateMlPerH: null, prefer: null, start: { day: null, time: null }, days: null, duplicate: null };
}
const seedSets: SavedSet[] = [{ id: 'seed-circulation', name: '循環管理セット', code: 'INJ-FRS20', heading: '利尿薬' }, { id: 'seed-palliative', name: '呼吸困難時（緩和）', code: 'INJ-MOR10', heading: '呼吸困難時' }].map(s => ({ id: s.id, name: s.name, owner: '', scope: '病棟', rows: [seedDrug(s.code)].flatMap(d => d ? [{ heading: s.heading, note: '', label: DRUGS.find(x => x.code === s.code)!.name, draft: d }] : []) }));

const fluid = seedDrug('INJ-NS500');
if (fluid) seedSets[0].rows.push({ heading: 'メイン輸液', note: '', label: DRUGS.find(d => d.code === 'INJ-NS500')!.name, draft: fluid });
export const INITIAL_SAVED_SETS = seedSets;
