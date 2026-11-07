import type { Patient } from "../types";

/** Render fixture lab quotations only after all scenario result writers have finished.
 * Each quotation names its sampling day; intervening days quote the last available result.
 * Merge partial panels in time order, just as the header finds the latest analyte value.
 */
export function labQuotation(p: Patient, day: number): string {
  const rows = p.labs.filter(l => l.day <= day).sort((a, b) => a.day - b.day || a.time.localeCompare(b.time));
  const full = rows.filter(l => l.values.CRP !== undefined && l.values.WBC !== undefined).at(-1);
  if (!full) return "";
  const values = Object.assign({}, ...rows.filter(l => l.day === full.day).map(l => l.values));
  return `採血（入院${full.day - p.admittedOn + 1}日目）：WBC ${values.WBC}/μL、Hb ${values.Hb}g/dL、CRP ${values.CRP}mg/dL、Cre ${values.Cre}mg/dL、Na ${values.Na}、K ${values.K}mEq/L。`;
}
export function finalizeLabNotes(p: Patient) {
  for (const e of p.history) {
    if (e.kind !== "note" || !e.id?.includes("-course-")) continue;
    const replace = (s: string) => s.replace(/採血（入院\d+日目）：[^。]+。/g, () => labQuotation(p, e.day));
    if (e.text) e.text = replace(e.text);
    if (e.soap?.o) e.soap.o = replace(e.soap.o);
  }
}
