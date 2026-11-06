import { expect, it } from "vitest";
import { entryDayFor } from "./history-days";
import { daySections } from "./opd-history";
import { labCardText } from "./format";
import type { OrderEntry } from "./types";

const lab: OrderEntry = { kind: "order", id: "lab", day: 0, time: "12:00", author: "医師", status: "有効", order: { type: "lab", codes: ["SET-ROUTINE"], collect: { day: 1, time: "06:00" }, priority: "定時" } };
it("採血は予定日の本体になり、依頼日への切り替えでも元データを保つ", () => {
  expect(entryDayFor(lab, "予定日")).toBe(1);
  expect(entryDayFor(lab, "依頼日")).toBe(0);
  expect(entryDayFor({ ...lab, status: "中止" }, "予定日")).toBe(1);
  const sections = daySections(-3, [lab], [], [], false, () => true, "予定日");
  expect(sections.find((s) => s.day === 1)).toMatchObject({ future: true, entries: [lab] });
  expect(sections.find((s) => s.day === 0)?.entries).toEqual([]);
  expect(lab.day).toBe(0);
});
it("複数日の内服と注射は開始日に置く", () => {
  for (const order of [
    { type: "prescription", category: "定期", drugCode: "ORAL-AMLO5", amount: 1, unit: "錠", timings: ["朝"], start: { day: 2 }, days: 7 },
    { type: "injection", items: [], route: "静脈内", start: { day: 2, time: "09:00" }, schedule: { kind: "once" }, days: 3 },
  ] as OrderEntry["order"][]) expect(entryDayFor({ ...lab, order }, "予定日")).toBe(2);
});
it("セット名に全内訳を横並びで添え、下書きでは8項目で省略する", () => {
  const text = labCardText({ codes: ["SET-ROUTINE"] });
  expect(text).toContain("定期採血セット（WBC・RBC・Hb・Ht・Plt");
  expect(text).toContain("CRP）");
  expect(text).not.toContain("ほか");
  expect(labCardText({ codes: ["SET-ROUTINE"] }, 8)).toContain("ほか");
});
