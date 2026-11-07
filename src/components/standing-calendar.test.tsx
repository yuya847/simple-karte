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
    expect(html).toContain('aria-label="その他を全選択"');
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
    expect(html).toContain("日付を選ぶ"); // 変えるまで続く: no end day yet
    expect(html).toContain("2026-11-05");
    expect(html).toContain('aria-label="指示の見出しと本文"');
    // The days are chosen with 札 (今日・明日・3日後・7日後・変えるまで続く) or the calendar; no check box.
    expect(html).toMatch(/aria-pressed="true"[^>]*>変えるまで続く</);
    expect(html).toMatch(/aria-pressed="true"[^>]*>今日</);
    expect(html).toContain(">3日後<");
    expect(html).toContain(">7日後<");
    expect(html).not.toContain("終了日を決める（指示迄）");
    expect(html).not.toContain(">指示を変更<"); // each line's buttons are on the right click and the double-click
    expect(html).toContain("保存する");
    expect(html).not.toContain("指示の選択肢");
    expect(html).not.toContain("セット（まとめて出す）");
  });
});

it("変更のフォームに元の文を入れ、行の右クリックで変更・終了を出し、カレンダーに矢印を示す", () => {
  const original = { ...lines[1], text: "ベッド上\n移動は介助", cat: "安静" as const };
  const html = renderToStaticMarkup(<RoleProvider value="医師"><StandingOrderForm initialSelection={original} today={today} lines={[original]} versions={[]} nowTime="13:20" fmtDay={(d) => `11/${5 + d}`} newId={() => "new"} onAdd={noop} onStop={noop} onEditFields={noop} /></RoleProvider>);
  expect(html).toContain("変更：元の指示 ベッド上");
  expect(html).not.toContain(">指示を変更<");
  expect(html).not.toContain(">指示を終了<");
  expect(html).toContain('data-line-id="'); // a right click (or a long press) on the line opens 指示を変更・終了・…
  expect(html).toContain("移動は介助");
  expect(html).toContain("変更を確定");
  const cal = renderToStaticMarkup(<RoleProvider value="医師"><StandingCalendar patient={patient} lines={[original, { ...original, id: "dated", end: { day: 3 } }]} today={today} nowTime="13:20" /></RoleProvider>);
  expect(cal).toContain('aria-label="右へ続く"');
  expect(cal).toContain("〜11/8");
});

it("終了日つまみは医師の編集可能な帯だけに出す", () => {
  const active = { ...lines[1], id: "active", end: { day: 2 }, stop: undefined, changed: undefined };
  const rows = [active, { ...active, id: "field", fromFields: true as const }, { ...active, id: "stopped", stop: { day: 1, time: "10:00", by: "医師" } }, { ...active, id: "changed", changed: { day: 0, time: "10:00", by: "医師", toId: "next" } }];
  const render = (role: "医師" | "看護師") => renderToStaticMarkup(<RoleProvider value={role}><StandingCalendar patient={patient} lines={rows} today={today} nowTime="10:00" onAdd={noop} /></RoleProvider>);
  expect(render("医師").match(/の終了日をドラッグ/g)).toHaveLength(1);
  expect(render("看護師")).not.toContain("の終了日をドラッグ");
});
