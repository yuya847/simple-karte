// 救急外来・外来の検体: the laboratory takes in and results the samples of today's ED and outpatient
// visits the same way as the ward's. A visit has no ward chart, so code makes a small one for the
// laboratory (the visit's id "er:◯" / "opd:◯", like the visit tabs) from what the visit knows. All
// patients and orders here are fictional.

import type { ErPatient } from "./er";
import { deskLabs, withRedraws, type LabDesk } from "./lab-desk";
import type { OpdPatient } from "./opd";
import { STAFF } from "./roles";
import type { DayOffset, LabOrder, OrderEntry, Patient } from "./types";
import type { WorkPatient } from "./worksheet";

/** The id the laboratory files a visit's samples and results under (the same key as the visit tab). */
export const visitPatientId = (kind: "er" | "opd", id: string) => `${kind}:${id}`;

const hhmm = (min: number) => {
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

/**
 * The fictional events of this demo: the doctor of 救急外来 ordered blood and cultures for 宮本さん
 * (発熱・尿の混濁) and blood for 永井さん (息苦しい) soon after they arrived, and the outpatient doctor
 * ordered BNP and electrolytes for 石田さん (心不全で体重が増えた). All were drawn just before this
 * session began. Times are minutes before now, like the ED board.
 */
export function visitLabOrders(nowAbs: number): Record<string, OrderEntry[]> {
  const ago = (min: number) => Math.max(0, nowAbs - min);
  const entry = (id: string, orderedAgo: number, drawnAgo: number, author: string, order: Omit<LabOrder, "type" | "collect">): OrderEntry => {
    const o = ago(orderedAgo);
    const d = ago(drawnAgo);
    return { kind: "order", id, day: Math.floor(o / 1440) as DayOffset, time: hhmm(o), author, status: "有効", order: { type: "lab", collect: { day: Math.floor(d / 1440), time: hhmm(d) }, ...order } };
  };
  const er = STAFF.医師.name;
  return {
    "er:er-1": [
      entry("o-er1-blood", 85, 80, er, { codes: ["SET-ROUTINE"], priority: "至急" }),
      entry("o-er1-bcx", 85, 80, er, { codes: ["LAB-BCX"], priority: "至急", comment: "血液培養 2セット" }),
      entry("o-er1-ucx", 85, 75, er, { codes: ["LAB-UCX"], priority: "至急", comment: "導尿" }),
    ],
    "er:er-3": [entry("o-er3-blood", 35, 30, er, { codes: ["SET-ROUTINE", "LAB-BNP"], priority: "至急" })],
    "opd:opd-1": [entry("o-opd1-blood", 20, 15, "山本（専攻医）", { codes: ["SET-LYTES", "LAB-BUN", "LAB-CRE", "LAB-BNP"], priority: "至急" })],
  };
}

/** A small chart for the laboratory: who the visit is, its lab orders and the results confirmed so far. */
export function visitPerson(kind: "er" | "opd", v: ErPatient | OpdPatient, orders: OrderEntry[], desk: LabDesk): WorkPatient {
  const id = visitPatientId(kind, v.id);
  const er = kind === "er" ? (v as ErPatient) : null;
  const op = kind === "opd" ? (v as OpdPatient) : null;
  const room = er ? "救急" : "外来";
  const patient: Patient = {
    id,
    name: v.name,
    kana: v.kana,
    sex: v.sex,
    age: v.age,
    ...(v.ageMonths !== undefined ? { ageMonths: v.ageMonths } : {}),
    ward: er ? "救急外来" : "外来",
    room,
    department: op ? op.department : "救急外来",
    attending: op ? op.doctor : (orders[0]?.author ?? STAFF.医師.name),
    admittedOn: 0,
    admissionDiagnosis: er ? er.complaint : op!.reason,
    heightCm: v.heightCm ?? 0,
    weightKg: v.weightKg ?? 0,
    allergies: v.allergies,
    infections: [],
    cautions: [],
    history: orders,
    labs: deskLabs(desk, id),
    cultures: [],
    imaging: [],
    vitals: [],
    daily: [],
  };
  return { patient, room, entries: withRedraws(orders, desk, id) };
}

/** The visits of today that have lab orders, ED first. */
export function visitPeople(er: ErPatient[], opd: OpdPatient[], orders: Record<string, OrderEntry[]>, desk: LabDesk): WorkPatient[] {
  const of = (kind: "er" | "opd", v: ErPatient | OpdPatient) => {
    const o = orders[visitPatientId(kind, v.id)] ?? [];
    return o.length ? [visitPerson(kind, v, o, desk)] : [];
  };
  return [...er.flatMap((v) => of("er", v)), ...opd.flatMap((v) => of("opd", v))];
}
