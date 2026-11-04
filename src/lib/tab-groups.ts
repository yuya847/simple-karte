import { patientPlace } from "./patient-place";

// The second row (every open chart) grouped by where the patient is: 病棟 (an inpatient's chart), 救急外来
// and 外来 (a visit, keyed "er:…" / "opd:…"). An ED patient admitted to the ward has a ward chart of its
// own (a new id), so that chart is 病棟's while the visit's tab, if still open, stays under 救急外来.

export type Place = "ward" | "er" | "opd";

/** The groups in the order they are shown. */
export const PLACES: Place[] = ["ward", "er", "opd"];

export const PLACE_LABEL: Record<Place, string> = { ward: "病棟", er: "救急外来", opd: "外来" };

/** Where a chart's patient is, from its tab key: a visit key names its place; anything else is an inpatient. */
export function placeOf(key: string): Place {
  return patientPlace(key);
}

export interface PlaceGroup<T> {
  key: Place;
  label: string;
  items: T[];
}

/** The open charts in groups by place, in PLACES' order, each keeping the charts' own order; empty groups are left out. */
export function groupByPlace<T>(items: readonly T[], place: (item: T) => Place): PlaceGroup<T>[] {
  return PLACES.map((key) => ({ key, label: PLACE_LABEL[key], items: items.filter((t) => place(t) === key) })).filter((g) => g.items.length > 0);
}
