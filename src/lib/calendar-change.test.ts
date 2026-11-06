import { expect, it } from "vitest";
import { calendarChange } from "./calendar-change";
import type { OrderEntry } from "./types";
it("処置変更は条件をコピーし、元のオーダを変えず今日からの下書きにする", () => {
  const e = { id: "old", kind: "order", status: "有効", order: { type: "procedure", code: "PROC-O2", site: "鼻", o2: { device: "鼻カニュラ", lpm: 2 }, schedule: { kind: "continuous" }, start: { day: -2, time: "10:00" }, days: 5, comment: "観察" } } as OrderEntry;
  const change = calendarChange(e, "p1", "new");
  expect(change?.kind).toBe("procedure");
  if (change?.kind !== "procedure") throw new Error("処置の下書きがない");
  expect(change.draft).toMatchObject({ id: "new", kind: "procedure", site: "鼻", o2: e.order.type === "procedure" ? e.order.o2 : {}, days: 5, start: { day: 0, time: "10:00" }, comment: "観察" });
  if (e.order.type === "procedure") expect(e.order.start.day).toBe(-2);
});
