// Client-safe, pure assembly of this visit's confirmed prescriptions. Future bookings are not visits.
import type { OrderEntry } from "../types";
import type { RxLine } from "../national/rx-lines";
import { joinLines } from "../national/rx-lines";

export type OpdPrescription = { dispensing: "院内" | "院外"; items: RxLine[] };
export function visitPrescriptions(entries: OrderEntry[], legacy: { items?: RxLine[] }[] = []): OpdPrescription[] {
  const groups = new Map<string, OpdPrescription>();
  for (const e of entries) {
    if (e.status === "中止" || (e.verbal && (!e.verbal.signedBy || e.verbal.cancelled)) || e.day !== 0 || e.order.type !== "prescription" || e.order.category === "持参薬") continue;
    const o = e.order;
    const key = `${o.dispensing ?? "院内"}:${o.rp ?? e.id}`;
    const group = groups.get(key) ?? { dispensing: o.dispensing ?? "院内", items: [] };
    group.items.push({ rp: 1, drug: o.drugCode, perDose: o.amount, unit: o.unit, timings: o.timings, prn: o.prn ?? null, maxPerDay: o.maxPerDay ?? null, days: o.days ?? null });
    groups.set(key, group);
  }
  return [...groups.values(), ...legacy.filter((r) => r.items?.length).map((r): OpdPrescription => ({ dispensing: "院外", items: r.items! }))];
}
export function outsidePrescriptionLines(entries: OrderEntry[], legacy: { items?: RxLine[] }[] = []): RxLine[] {
  return joinLines(visitPrescriptions(entries, legacy).filter((r) => r.dispensing === "院外").map((r) => r.items));
}

export const OPD_CODES = {
  調剤料外来: "120000710",
  処方料その他: "120001210",
  処方料7種類以上: "120002610",
  特定疾患院内: "120005610",
  特定疾患院外: "120005710",
  初診料: "111000110",
  再診料: "112007410",
  外来管理加算: "112011010",
  処方箋料その他: "120002910",
  処方箋料7種類以上: "120002710",
  血液採取静脈: "160095710",
  検体検査管理加算1: "160170170",
  皮内皮下筋肉内注射: "130000510",
  静脈内注射: "130003510",
  点滴注射入院外500未満: "130009310",
  点滴注射500以上: "130003810",
} as const;

/** Pure visit fee plan. Master lookup and drug-price arithmetic stay on the server. */
export function buildOpdVisit(input: { kind: "初診" | "再診"; entries: OrderEntry[]; legacy?: { items?: RxLine[] }[]; managementExcluded: boolean; outpatientManagement?: boolean }) {
  const prescriptions = visitPrescriptions(input.entries, input.legacy);
  const basicCodes: string[] = input.kind === "初診" ? [OPD_CODES.初診料] : [OPD_CODES.再診料];
  if (input.kind === "再診" && !input.managementExcluded && input.outpatientManagement) basicCodes.push(OPD_CODES.外来管理加算);
  return { basicCodes, prescriptions, outside: prescriptions.filter((r) => r.dispensing === "院外"), inside: prescriptions.filter((r) => r.dispensing === "院内"), longPrescription: prescriptions.some((r) => r.items.some((i) => i.timings.length > 0 && (i.days ?? 0) >= 28)) };
}
