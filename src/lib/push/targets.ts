// Who is told of a new result (the page works it out from the record; the server matches the names to the devices).

import { DOCTORS } from "../doctors";
import { doctorNames, involved, type PatientDoctors } from "../patient-doctors";
import type { ResultItem } from "../results";
import type { Patient } from "../types";
import { itemsFor, resultLine, whoOf, type PushItem, type PushSub } from "./push";

/** Every doctor who looks after the patient: the attending's team, 担当医 and コンサルト医 (as on 受け持ち患者). */
export const doctorsToTell = (pd: PatientDoctors): string[] => [...new Set([...DOCTORS.map((d) => d.name).filter((n) => involved(n, pd)), ...doctorNames(pd)])];

export interface PushAbout {
  patient?: Pick<Patient, "age" | "sex">;
  doctors: string[];
  nurse?: string;
}

/**
 * The new results as sent to /api/push/notify: only those someone receives (a device registered in the records), each
 * once; 「70代男性」 and the value only when the hospital puts them in the notification.
 */
export function toPushItems(fresh: ResultItem[], subs: PushSub[], detail: boolean, about: (patientId: string) => PushAbout): PushItem[] {
  const seen = new Set<string>();
  return fresh.flatMap((r): PushItem[] => {
    if (seen.has(r.key)) return [];
    seen.add(r.key);
    const a = about(r.patientId);
    const item: PushItem = { key: r.key, patientId: r.patientId, panic: r.panic.length > 0, doctors: a.doctors, ...(a.nurse ? { nurse: a.nurse } : {}) };
    if (!subs.some((s) => !s.stopped && s.sub && itemsFor(s, [item]).length)) return [];
    return [detail ? { ...item, ...(a.patient ? { who: whoOf(a.patient) } : {}), line: resultLine(r) } : item];
  });
}
