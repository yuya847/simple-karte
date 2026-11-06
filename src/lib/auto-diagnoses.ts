import { diagnosisLabel, type Diagnosis, type Modifier } from "./diagnoses";
import type { DiseaseHit } from "./masters/byomei";
import { problemBlocks } from "./note-problems";

// Frequently used official master modifiers; the API also resolves the full master.
const KNOWN_MODIFIERS: (Modifier & { position: "prefix" | "suffix" })[] = [
  { code: "2056", name: "右", position: "prefix" },
  { code: "2049", name: "左", position: "prefix" },
  { code: "2058", name: "両側", position: "prefix" },
  { code: "4012", name: "急性", position: "prefix" },
  { code: "4043", name: "慢性", position: "prefix" },
];

// 名前を変換・推測せず、既知の修飾語だけを外して照合する。
export function diagnosisNameParts(text: string, modifiers: (Modifier & { position: "prefix" | "suffix" })[] = []) {
  let name = text.trim();
  const prefixes: Modifier[] = [], suffixes: Modifier[] = [];
  if (/(?:の)?疑い$/.test(name)) {
    name = name.replace(/(?:の)?疑い$/, "").trim();
    suffixes.push({ code: "8002", name: "の疑い" });
  }
  const ordered = [...modifiers].filter(m => m.name && m.code !== "8002").sort((a, b) => b.name.length - a.name.length);
  for (let i = 0; i < 4; i++) {
    const m = ordered.find(m => m.position === "prefix" ? name.startsWith(m.name) : name.endsWith(m.name));
    if (!m) break;
    if (m.position === "prefix") { prefixes.push(m); name = name.slice(m.name.length); }
    else { suffixes.unshift(m); name = name.slice(0, -m.name.length); }
  }
  return { name: name.trim(), prefixes, suffixes };
}

export function autoDiagnoses(problems: string[], admissionDiagnosis: string | null, existing: Diagnosis[], lookup: (name: string) => DiseaseHit | null): { add: Diagnosis[]; unmatched: string[] } {
  const add: Diagnosis[] = [], unmatched: string[] = [];
  for (const [text, from] of [...problems.map(p => [p, "記事"] as const), ...(admissionDiagnosis ? [[admissionDiagnosis, "入院申込"] as const] : [])]) {
    if (!text.trim()) continue;
    let parts = diagnosisNameParts(text);
    if ([...existing, ...add].some(d => diagnosisLabel(d) === text.trim() || d.name === parts.name)) continue;
    let resolved = lookup(parts.name) as (DiseaseHit & { prefixes?: Modifier[]; suffixes?: Modifier[] }) | null;
    // Try the intact disease first, so names such as 急性腎盂腎炎 remain intact.
    if (!resolved) {
      let candidates = [parts];
      for (let depth = 0; depth < 4 && !resolved; depth++) {
        const next: typeof candidates = [];
        search: for (const candidate of candidates) for (const m of KNOWN_MODIFIERS) {
          if (!candidate.name.startsWith(m.name)) continue;
          const stripped = { ...candidate, name: candidate.name.slice(m.name.length), prefixes: [...candidate.prefixes, { code: m.code, name: m.name }] };
          const found = lookup(stripped.name);
          if (found && found.name === stripped.name) { parts = stripped; resolved = found; break search; }
          next.push(stripped);
        }
        candidates = next;
      }
    }
    const hit = resolved;
    const prefix = resolved?.prefixes ?? parts.prefixes;
    const suffix = [...(resolved?.suffixes ?? []), ...parts.suffixes];
    if (!hit || diagnosisLabel({ name: hit.name, prefixes: resolved?.prefixes ?? [], suffixes: resolved?.suffixes ?? [] }) !== parts.name || hit.noStandalone) { if (!unmatched.includes(text)) unmatched.push(text); continue; }
    if ([...existing, ...add].some(d => d.code === hit.code)) continue;
    add.push({ id: `auto-${from}-${hit.code}`, code: hit.code, name: hit.name, icd10: hit.icd10, prefixes: prefix, suffixes: suffix, main: false, start: 0, outcome: "継続", notClaimable: hit.notClaimable, auto: { from, at: "" } });
  }
  return { add, unmatched };
}

/** Fetch first; commit as one batch only when every master query succeeded. */
export async function resolveNoteDiagnoses(text: string, admission: string | null, existing: Diagnosis[], context: { day: number; noteId?: string; at: string }) {
  const problems = problemBlocks(text).map(p => p.title);
  const names = [...new Set([...problems, ...(admission ? [admission] : [])].map(n => diagnosisNameParts(n).name).filter(Boolean))];
  const hits = await Promise.all(names.map(async name => {
    const r = await fetch(`/api/byomei?exact=${encodeURIComponent(name)}`);
    if (!r.ok) throw new Error("病名の自動登録ができませんでした");
    const data: { disease: DiseaseHit | null; prefixes?: Modifier[]; suffixes?: Modifier[] } = await r.json();
    return [name, data] as const;
  }));
  const byName = new Map(hits);
  const result = autoDiagnoses(problems, admission, existing, name => {
    const data = byName.get(name);
    return data?.disease ? { ...data.disease, prefixes: data.prefixes, suffixes: data.suffixes } : null;
  });
  return { ...result, add: result.add.map(d => ({ ...d, id: `${context.noteId}-${d.id}`, start: context.day, auto: { ...d.auto!, noteId: context.noteId, at: context.at } })) };
}
