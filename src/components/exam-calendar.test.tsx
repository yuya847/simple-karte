import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { ExamCalendar } from "./ExamCalendar";
import { AddPhysioPanel } from "./panels/AddPanels";
const today = { y: 2026, m: 11, d: 5 };
it("予約済みは患者名と検査名を表示して押せない", () => {
  const html = renderToStaticMarkup(<ExamCalendar kind="CT1" today={today} value={{ day: 1, time: "09:00", priority: "予約" }} taken={[{ day: 1, time: "08:30", label: "北村 博・胸部 CT" }]} onChange={() => {}} />);
  expect(html).toMatch(/disabled=""[^>]*title="08:30 予約あり（北村 博・胸部 CT）"[^>]*>08:30 北村 博・胸部 CT/);
  expect(html).toContain("09:00 空き");
  expect(html).toContain("次の月");
  expect(html).toContain("前の月");
});
it("ポータブルは時刻の直接入力", () => {
  const html = renderToStaticMarkup(<ExamCalendar kind="PORT" today={today} value={{ day: 1, time: "09:12", priority: "予約" }} taken={[]} onChange={() => {}} />);
  expect(html).toContain('type="time"');
  expect(html).toContain("09:12");
  expect(html).toContain("枠なし");
});
it("生理検査の検査選択が出る", () => {
  const html = renderToStaticMarkup(<AddPhysioPanel today={today} onAdd={() => {}} newId={() => "p"} />);
  expect(html).toContain("心電図");
  expect(html).toContain("腹部エコー");
});
