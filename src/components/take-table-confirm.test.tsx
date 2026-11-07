import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { TakeTable } from "./TakeTable";
import { takeBadge } from "@/lib/order-confirm";
import { takeRows } from "@/lib/order-take";
import { orderChanges } from "@/lib/worksheet";
import { SCENARIOS } from "@/lib/scenarios";

it("受け済みの予定確認ボタンは確認の保存につながり、誰・時刻を表示する", () => {
  const patient = SCENARIOS.patients.find(p => p.id === "99000002")!;
  const people = [{ patient, room: patient.room, entries: patient.history.filter(e => e.kind === "order") }];
  const row = takeRows(orderChanges(people, -1440, 840), people, { y: 2026, m: 11, d: 7 })[0];
  expect(row).toBeDefined();
  const taken = Object.fromEntries(row.keys.map(k => [k, "13:55 看護師 佐藤"]));
  const props = { rows: [row], taken, isTaken: () => true, holds: {}, interactive: true, day: 0, today: { y: 2026, m: 11, d: 7 }, nurses: [], onTake: () => {}, onHold: () => {}, confirm: { people, nowAbs: 840, confirms: {}, onConfirm: () => {} } };
  expect(renderToStaticMarkup(<TakeTable {...props} />)).toContain("予定を確認する（まだ）");
  const html = renderToStaticMarkup(<TakeTable {...props} confirm={{ ...props.confirm, confirms: { [row.key]: "14:00 看護師 佐藤" } }} />);
  expect(html).toContain("確認 14:00 看護師 佐藤");
  expect(html).not.toContain("予定を確認する（まだ）");
  expect(takeBadge(row, { taken, isTaken: () => true, holds: {}, confirms: { [row.key]: "14:00 看護師 佐藤" } }).text).toBe("確認済み 14:00 看護師 佐藤");
});
