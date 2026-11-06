import { STAFF, ROLES, type Role, type Staff } from "./roles";
import { DEFAULT_DOCTOR, doctorOf } from "./doctors";
import { allowedWardTabs, areasFor, homeScreen, wardTabOf, type AreaKey, type Owner, type PatientTab, type WardTab } from "./nav";

export const PERSON_KEY = "simple-karte:display-person-v1";
export const displayKey = (role: Role) => `simple-karte:display-v1:${role}`;
const parse = (raw: string | null): unknown => { try { return raw ? JSON.parse(raw) : null; } catch { return null; } };
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** Only the demo's registered staff and selectable doctors may be restored. */
export function readPerson(raw: string | null): Staff {
  const v = parse(raw);
  if (!object(v) || !ROLES.includes(v.role as Role)) return STAFF.医師;
  const role = v.role as Role;
  if (role === "医師") return { role, name: typeof v.name === "string" && doctorOf(v.name) ? v.name : DEFAULT_DOCTOR };
  return v.name === STAFF[role].name ? STAFF[role] : STAFF.医師;
}
export interface DisplayState {
  area: AreaKey;
  wardTabs: WardTab[];
  wardTab: WardTab | "menu";
  patientTabs: PatientTab[];
  front: Partial<Record<Owner, string>>;
}
export function readDisplay(raw: string | null, role: Role, ids: ReadonlySet<string>, defaults: readonly string[] = []): DisplayState {
  const v = parse(raw);
  const saved = object(v) ? v : {};
  const home = homeScreen(role);
  const wardTabs = allowedWardTabs(role, Array.isArray(saved.wardTabs) ? saved.wardTabs.filter((x): x is string => typeof x === "string") : [...(home.wardTab ? [home.wardTab] : []), ...defaults]);
  const validOwner = (o: unknown): o is Owner => typeof o === "string" && ((o === "er" || o === "opd") ? areasFor(role).some((a) => a.key === o) : o.startsWith("ward:") && wardTabs.includes(wardTabOf(o as Owner)!));
  const patientTabs: PatientTab[] = [];
  if (Array.isArray(saved.patientTabs)) for (const t of saved.patientTabs) {
    if (object(t) && typeof t.id === "string" && ids.has(t.id) && validOwner(t.owner) && !patientTabs.some((p) => p.id === t.id)) patientTabs.push({ id: t.id, owner: t.owner });
  }
  const front: DisplayState["front"] = {};
  if (object(saved.front)) for (const [o, id] of Object.entries(saved.front)) {
    if (validOwner(o) && typeof id === "string" && (id === "__new__" || patientTabs.some((t) => t.id === id && t.owner === o))) front[o] = id;
  }
  return { area: role === "臨床検査技師" ? home.area : areasFor(role).some((a) => a.key === saved.area && !a.soon) ? saved.area as AreaKey : home.area, wardTabs, wardTab: saved.wardTab === "menu" || wardTabs.includes(saved.wardTab as WardTab) ? saved.wardTab as WardTab | "menu" : wardTabs[0] ?? "menu", patientTabs, front };
}
