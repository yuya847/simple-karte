// What every simulated national service (模擬) shows: the public spec it followed (name, version, URL) and
// the fields of that spec this prototype cannot fill.

export interface SpecRef {
  name: string;
  version?: string;
  url: string;
  /** What was taken from it (one line). */
  note?: string;
}

export interface Unfilled {
  /** The element or item of the spec (FHIR path or the item's name). */
  field: string;
  /** Why the app cannot fill it. */
  why: string;
}
