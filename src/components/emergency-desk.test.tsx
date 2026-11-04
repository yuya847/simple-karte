import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { EmergencyDesk } from "./billing/EmergencyDesk";
import { initialErPatients } from "@/lib/er";
import { INITIAL_DESK } from "@/lib/billing/worklist";

const nagai = initialErPatients(600).find((p) => p.name === "永井 茂")!;
const props = { book: {}, onSettle: () => {}, desk: INITIAL_DESK, today: { y: 2026, m: 11, d: 5 }, nowTime: "10:00", onOpen: () => {} };
it("医事課の救急の行に患者名・下書き・会計への入口を出す", () => {
  const html = renderToStaticMarkup(<EmergencyDesk {...props} visits={[{ patient: nagai, entries: [], drafts: 2 }]} />);
  expect(html).toContain("永井 茂（救急外来）");
  expect(html).toContain("下書き 2（医師の確定待ち）");
  expect(html).toContain("算定・会計へ");
  expect(html).toContain("下書きは算定に入りません");
});
it("入院済みは救急の会計を出さず入院先へ案内する", () => {
  const html = renderToStaticMarkup(<EmergencyDesk {...props} visits={[{ patient: { ...nagai, status: "入院済", admittedAs: "ward1" }, entries: [], drafts: 0 }]} />);
  expect(html).toContain("入院の算定へ");
  expect(html).not.toContain("算定・会計へ");
});
