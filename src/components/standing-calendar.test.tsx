import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PATIENTS } from "@/lib/patients";
import { initialLines } from "@/lib/standing-lines";
import { RoleProvider } from "./RoleContext";
import { StandingCalendar } from "./StandingCalendar";
import { StandingOrderForm } from "./panels/StandingOrderForm";

const patient = PATIENTS.find((p) => p.id === "90010198")!;
const lines = initialLines()[patient.id];
const today = { y: 2026, m: 11, d: 5 };
const noop = () => {};
describe("指示カレンダーの操作と期間表示", () => {
  it("医師は全体・カテゴリ・行を選べ、中止済みの行は選べない", () => {
    const html = renderToStaticMarkup(<RoleProvider value="医師"><StandingCalendar patient={patient} lines={lines} today={today} nowTime="10:00" onBulkStop={noop} /></RoleProvider>);
    expect(html).toContain('aria-label="指示を全選択"');
    expect(html).toContain('aria-label="安静を全選択"');
    expect(html).toContain('aria-label="一括中止の日"');
    expect(html).toContain("選んだ指示を中止");
    expect(html).not.toContain(`aria-label="${lines[0].text}を選択"`);
    expect(html).toContain(`aria-label="${lines[1].text}を選択"`);
  });
  it("看護師に一括中止の入力を出さない", () => {
    const html = renderToStaticMarkup(<RoleProvider value="看護師"><StandingCalendar patient={patient} lines={lines} today={today} nowTime="10:00" onBulkStop={noop} /></RoleProvider>);
    expect(html).not.toContain('aria-label="指示を全選択"');
    expect(html).not.toContain('aria-label="一括中止の日"');
  });
  it("一覧に有効期間と暦日による開始・終了の入力を出す", () => {
    const html = renderToStaticMarkup(<RoleProvider value="医師"><StandingOrderForm today={today} lines={lines} versions={[]} nowTime="10:00" fmtDay={(d) => `11/${5 + d}`} newId={() => "new"} onAdd={noop} onStop={noop} onEditFields={noop} /></RoleProvider>);
    expect(html).toContain("有効：11/4 〜 変えるまで続く");
    expect(html).toMatch(/type="date" aria-label="指示の終了日"/);
    expect(html).toContain("2026-11-05");
  });
});
