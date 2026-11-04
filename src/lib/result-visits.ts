import { ANALYTES, LAB_TESTS } from "./master";
import { flagOf } from "./lab-desk";
import { cultureKeyOf, labKey, resultsOf, type PanicLimit, type ResultItem } from "./results";
import type { LabResult, Patient } from "./types";

export interface ResultVisit {
  key: string;
  day: number;
  time: string;
  kind: string;
  summary: string;
  unseen: boolean;
  item: ResultItem;
  lab?: LabResult;
}

/** Keep each source result (including separate labels at the same time) as one examination. */
export function resultVisits(patient: Patient, limits: PanicLimit[], extra: ResultItem[] = [], unseenKeys: readonly string[] = []): ResultVisit[] {
  const items = new Map([...resultsOf(patient, limits), ...extra.filter((i) => i.patientId === patient.id)].map((i) => [i.key, i]));
  return [...items.values()].map((item): ResultVisit => {
    const lab = patient.labs.find((l) => labKey(patient.id, l) === item.key);
    const culture = patient.cultures.find((c) => cultureKeyOf(patient.id, c) === item.key);
    const tests = lab ? LAB_TESTS.filter((t) => t.contains?.some((code) => code in lab.values)) : [];
    const specimens = [...new Set(tests.map((t) => t.group === "血液ガス" ? "血液ガス" : t.specimen))];
    const abnormal = lab ? Object.entries(lab.values).filter(([code, value]) => {
      const a = ANALYTES.find((a) => a.code === code);
      return a && flagOf(a, patient.sex, value) !== "";
    }).length : 0;
    return { key: item.key, day: item.day, time: item.time, kind: lab ? specimens.join("・") || "検体（種類記録なし）" : culture ? `培養（${culture.specimen}）` : item.kind,
      summary: lab ? `${Object.keys(lab.values).slice(0, 3).map((code) => ANALYTES.find((a) => a.code === code)?.name ?? code).join("・")} ${Object.keys(lab.values).length}項目・異常 ${abnormal}${item.panic.length ? "・パニック値" : ""}` : `${item.title}${item.panic.length ? "・パニック値" : ""}`,
      unseen: unseenKeys.includes(item.key), item, lab };
  }).sort((a, b) => b.day - a.day || b.time.localeCompare(a.time) || a.key.localeCompare(b.key));
}

/** Most recent earlier value of the same item; simultaneous draws are not previous values. */
export function previousResult(labs: LabResult[], current: LabResult, code: string): number | undefined {
  return labs.filter((l) => (l.day < current.day || (l.day === current.day && l.time < current.time)) && l.values[code] !== undefined)
    .sort((a, b) => b.day - a.day || b.time.localeCompare(a.time))[0]?.values[code];
}
