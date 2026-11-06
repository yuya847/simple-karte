import { expect, it } from "vitest";
import { injectionItemText, injectionLines, oralName } from "./format";
import { buildWorksheet } from "./worksheet";
import { PATIENTS } from "./patients";
import type { OrderEntry } from "./types";

it("VCM1gは0.5g/V × 2Vとして表示する", () => {
  expect(injectionItemText({ drugCode: "INJ-VCM05", amount: 1, unit: "g" })).toContain("0.5g/V × 2V");
  expect(injectionItemText({ drugCode: "INJ-VCM05", amount: 1000, unit: "mg" })).toContain("× 2V");
});
it("名前に含まれる規格を二重にしない", () => {
  expect(oralName("ORAL-OXC5")).toBe("オキシコンチンTR錠5mg");
});
it("1回の注射に継続と書かず、最初の輸液は開始と表示する", () => {
  const e: OrderEntry = { kind: "order", id: "fluid", status: "有効", author: "医師", day: 0, time: "08:00", order: { type: "injection", items: [{ drugCode: "INJ-NS500", amount: 500, unit: "mL" }], route: "点滴静注", schedule: { kind: "once" }, start: { day: 0, time: "10:00" } } };
  const line = injectionLines(e.order as Extract<OrderEntry["order"], { type: "injection" }>, { y: 2026, m: 11, d: 6 });
  expect(line.detail).not.toContain("継続");
  const fluid: OrderEntry = { ...e, order: { ...e.order as Extract<OrderEntry["order"], { type: "injection" }>, schedule: { kind: "per_day", count: 2 } } };
  const doses = buildWorksheet([{ patient: PATIENTS[0], room: "501", entries: [fluid] }], 0, 1440, 600).timed;
  expect(doses[0].detail).toBe("開始");
  expect(doses[1].detail).toBe("つなぎ替え");
  const tomorrow = buildWorksheet([{ patient: PATIENTS[0], room: "501", entries: [fluid] }], 1440, 2880, 600).timed;
  expect(tomorrow[0].main).toContain("3本目");
  expect(tomorrow[0].detail).toBe("つなぎ替え");
});
