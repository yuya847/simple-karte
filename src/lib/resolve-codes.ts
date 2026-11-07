// After Claude reads a dictation, a short name that fits several products in the formulary
// ("VCM" → three vancomycin products) comes back without a code: Claude must not guess.
// The code then fills the code only where one product is the only fit by a fixed rule,
// and leaves it empty (the doctor picks from the candidates) otherwise.
//   - 中止: the one drug among this patient's active injection orders that the name fits.
//   - 注射: the one product already running for this patient; else the one product whose
//     single vial/bag holds exactly the dose said (1g → the 1g vial).
//   - 「◯回目の前」の血中濃度: the drug drafted alongside (or running) that the level test measures.
// The product chosen is shown in the draft, and the doctor can change it like any other field.

import type { Draft, DraftItem, InjectionDraft, LabDraft, StopDraft } from "./drafts";
import { DRUGS, findDrug, findLab, type DrugMaster } from "./master";
import type { OrderEntry } from "./types";

const norm = (s: string) => s.normalize("NFKC").replace(/\s/g, "").toLowerCase();

const namesOf = (d: DrugMaster) => [d.name, d.generic, ...d.aliases].filter((x): x is string => !!x).map(norm);

/** Injection products whose name, generic name or alias is exactly the word said. */
export function drugsNamed(said: string): DrugMaster[] {
  const s = norm(said);
  if (!s) return [];
  return DRUGS.filter((d) => namesOf(d).includes(s));
}

const mainCode = (o: OrderEntry) => (o.order.type === "injection" ? (o.order.items[0]?.drugCode ?? null) : null);

const runningCodes = (active: OrderEntry[]) => new Set(active.map(mainCode).filter((c): c is string => !!c));

const one = <T,>(xs: T[]): T | null => (xs.length === 1 ? xs[0] : null);

function toGrams(amount: number, unit: string): number | null {
  if (unit === "g") return amount;
  if (unit === "mg") return amount / 1000;
  return null;
}

/** The dose said is exactly one vial/bag of this product. */
function holdsDose(d: DrugMaster, amount: number | null, unit: string | null): boolean {
  if (!d.strength || amount === null || !unit) return false;
  if (d.strength.unit === unit) return d.strength.amount === amount;
  const a = toGrams(amount, unit);
  const b = toGrams(d.strength.amount, d.strength.unit);
  return a !== null && b !== null && Math.abs(a - b) < 1e-9;
}

function resolveItem(it: DraftItem, running: Set<string>): DraftItem {
  if (it.drugCode) return it;
  const named = drugsNamed(it.said);
  const pick =
    one(named) ??
    one(named.filter((d) => running.has(d.code))) ??
    one(named.filter((d) => holdsDose(d, it.amount, it.unit)));
  return pick ? { ...it, drugCode: pick.code } : it;
}

function resolveStop(d: StopDraft, running: Set<string>): StopDraft {
  if (d.drugCode || d.procCode) return d;
  const pick = one(drugsNamed(d.said).filter((x) => running.has(x.code)));
  return pick ? { ...d, drugCode: pick.code } : d;
}

/** The drug a level test measures, as the lab master writes it (LAB-VCM measures "VCM"). */
function measured(d: LabDraft): string[] {
  return d.tests.flatMap((t) => (t.code ? (findLab(t.code)?.contains ?? []) : []));
}

/** For a level drawn before the Nth dose: the code of the one drug it can be timed to. */
export function levelDrugCode(d: LabDraft, drafts: Draft[], active: OrderEntry[]): string | null {
  const bd = d.collect.beforeDose;
  if (bd?.drugCode) return bd.drugCode;
  const words = measured(d).map(norm);
  if (!words.length) return null;
  const fits = (code: string | null) => {
    const m = code ? findDrug(code) : undefined;
    return !!m && namesOf(m).some((n) => words.includes(n));
  };
  const drafted = [...new Set(drafts.flatMap((x) => (x.kind === "injection" && fits(x.items[0]?.drugCode ?? null) ? [x.items[0].drugCode!] : [])))];
  if (drafted.length) return one(drafted);
  return one([...runningCodes(active)].filter(fits));
}

/** Fill the codes Claude left empty where a fixed rule leaves only one product. */
export function resolveDraftCodes(drafts: Draft[], active: OrderEntry[]): Draft[] {
  const running = runningCodes(active);
  const first = drafts.map((d): Draft => {
    if (d.kind === "stop") return resolveStop(d, running);
    if (d.kind === "injection") return { ...d, items: d.items.map((it) => resolveItem(it, running)) } satisfies InjectionDraft;
    return d;
  });
  return first.map((d): Draft => {
    if (d.kind !== "lab" || d.collect.when !== "before_dose" || !d.collect.beforeDose || d.collect.beforeDose.drugCode) return d;
    const code = levelDrugCode(d, first, active);
    return code ? { ...d, collect: { ...d.collect, beforeDose: { ...d.collect.beforeDose, drugCode: code } } } : d;
  });
}
