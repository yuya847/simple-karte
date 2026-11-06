import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
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
  expect(html).toContain('type="text"');
  expect(html).toContain("09:12");
  expect(html).toContain("枠なし");
});
it("生理検査の検査選択が出る", () => {
  const html = renderToStaticMarkup(<AddPhysioPanel today={today} onAdd={() => {}} newId={() => "p"} />);
  expect(html).toContain("心電図");
  expect(html).toContain("腹部エコー");
});

describe("画像検査の至急と予約", () => {
  const props = { kind: "PORT" as const, today: { y: 2026, m: 11, d: 6 }, taken: [], onChange: () => {} };
  it("至急ならカレンダーと枠なし時刻入力を表示しない", () => {
    const html = renderToStaticMarkup(<ExamCalendar {...props} value={{ day: 0, priority: "至急" }} />);
    expect(html).toContain("今すぐ（至急）");
    expect(html).not.toContain("前の月");
    expect(html).not.toContain("時刻（枠なし）");
  });
  it("日付の指定がなければ今日を初めに表示する", () => {
    const html = renderToStaticMarkup(<ExamCalendar {...props} value={{ day: null, priority: "予約" }} />);
    expect(html).toContain("11/6");
    expect(html).toContain("時刻（枠なし）");
    expect(html).toMatch(/aria-label="11\/6[^>]*aria-pressed="true"/);
  });
});
