import type { Patient, VitalSign } from './types';
import type { Surgery } from './surgery';
import { anesthesiaClock } from './anesthesia';

/** A read projection; the surgical record remains the sole stored source. */
export function withAnesthesiaVitals(patient: Patient, surgeries: Surgery[]): Patient {
  const points: VitalSign[] = surgeries.filter(s => s.patientId === patient.id).flatMap(s => (s.anesthesiaCase?.vitals ?? []).map(v => ({day:Math.floor(v.at/1440), time:anesthesiaClock(v.at), sbp:v.sbp, dbp:v.dbp, hr:v.hr, spo2:v.spo2, bt:v.temperature, by:'麻酔記録'})));
  return {...patient, vitals:[...patient.vitals, ...points].sort((a,b)=>a.day-b.day || a.time.localeCompare(b.time))};
}
