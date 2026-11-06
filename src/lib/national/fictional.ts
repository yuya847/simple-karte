// Small helpers for the FICTIONAL answers of the simulated national services (模擬): the same patient
// always gets the same answer, so a demo and a test see the same thing. Nothing here is real data.

import { isoDate, type CalendarDate } from "../dates";
import { birthDateOf as patientBirthDate } from "../patient-contacts";
import { INSURANCE } from "../billing/insurance";

/** FNV-1a (32 bit) of a text: a stable number to pick fictional values with. */
export function seedOf(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** A value picked from a list by the seed (and a salt, for several picks from one seed). */
export const pick = <T,>(list: readonly T[], seed: number, salt = 0): T => list[(seed + salt * 7919) % list.length];

/**
 * The birth date of a patient: the demo patients' cards (billing/insurance.ts) when they have one, else a
 * fictional day that gives the age in the chart today.
 */
export function birthDateOf(p: { id: string; age: number }, today: CalendarDate): string {
  const known = INSURANCE[p.id]?.birthDate;
  if (known) return known;
  return isoDate(patientBirthDate(p, today));
}

/** "2026-11-04" + "10:30" → "2026-11-04T10:30:00+09:00" (the chart works in Japan time). */
export const jstDateTime = (dateIso: string, time = "00:00") => `${dateIso}T${time.length === 5 ? `${time}:00` : time}+09:00`;

/** A UUID-shaped id made from a text (stable, not random): for fullUrl "urn:uuid:…" in the FHIR Bundles. */
export function uuidOf(text: string): string {
  const h = [seedOf(text), seedOf(`${text}#1`), seedOf(`${text}#2`), seedOf(`${text}#3`)].map((n) => n.toString(16).padStart(8, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${((parseInt(h[16], 16) & 0x3) | 0x8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
