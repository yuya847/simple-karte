// What goes on the 検体 and 薬剤 labels: one per draw and per dose (today and tomorrow), with the code
// the ward's 照合 reads for that dose (labelFor), so a printed label matches at the bedside.

import type { CalendarDate } from "./dates";
import { drugCodesOf } from "./drug-class";
import { labelFor } from "./mar";
import { labInfo } from "./master";
import type { OrderEntry } from "./types";
import { buildWorksheet, timeLabel, type WorkPatient } from "./worksheet";

export interface SpecimenLabelData {
  code: string;
  when: string;
  tests: string;
  container: string;
}
export interface DrugLabelData {
  code: string;
  when: string;
  main: string;
  detail: string;
  /** The drugs in it (for the 麻・毒・劇 marks on the label). */
  drugs?: string[];
}

export function labelItems(person: WorkPatient, today: CalendarDate, nowAbs: number, days = 2): { specimens: SpecimenLabelData[]; drugs: DrugLabelData[] } {
  const timed = buildWorksheet([person], 0, days * 1440, nowAbs).timed.filter((i) => i.at !== null);
  const orderOf = (id: string) => person.entries.find((e: OrderEntry) => e.id === id)?.order;
  return {
    specimens: timed
      .filter((i) => i.kind === "採血")
      .map((i) => {
        const o = orderOf(i.orderId);
        const containers = o && o.type === "lab" ? [...new Set(o.codes.map((c) => labInfo(c).container))].join("・") : "";
        return { code: labelFor(i.orderId, i.at!), when: timeLabel(i.at!, -99, today), tests: i.main, container: containers };
      }),
    drugs: timed.filter((i) => i.kind === "注射").map((i) => ({ code: labelFor(i.orderId, i.at!), when: timeLabel(i.at!, -99, today), main: i.main, detail: i.detail, drugs: drugCodesOf(orderOf(i.orderId)) })),
  };
}
