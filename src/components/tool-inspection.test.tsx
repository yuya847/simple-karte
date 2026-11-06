import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SCENARIOS } from "@/lib/scenarios";
import { PATIENTS } from "@/lib/patients";
import { activeOrders, activeStandingLines, emptyCalendar } from "@/lib/active-orders";
import { calendarBands } from "@/lib/calendar-bands";
import type { OrderEntry } from "@/lib/types";
import type { GuidanceRecord } from "@/lib/guidance";
import { ActiveOrdersPanel } from "./panels/ActiveOrdersPanel";
import { GuideRecordPanel } from "./panels/GuideRecordPanel";
import { RefWindow } from "./RefWindows";
import { RightTabs } from "./RightTabs";
import { DietCalendar } from "./DietCalendar";
import { IsoDayInput } from "./DayInput";

const today = { y: 2026, m: 11, d: 6 };
const noop = () => {};
describe("右のツールの点検で見つかった表示", () => {
  it("試験病棟の患者の指示簿も有効オーダに出す", () => {
    const p = SCENARIOS.patients.find(p => (SCENARIOS.standingLines[p.id] ?? []).length > 0)!;
    const lines = SCENARIOS.standingLines[p.id];
    expect(activeStandingLines(lines).length).toBeGreaterThan(0);
    const html = renderToStaticMarkup(<ActiveOrdersPanel entries={p.history} lines={lines} today={today} />);
    expect(html).toContain("指示簿");
    expect(html).not.toContain("有効なオーダはありません");
  });
  it("期間終了・中止を除き、時刻を過ぎた未完了の検査は残す", () => {
    const lab: OrderEntry = { kind: "order", id: "lab", day: -1, time: "09:00", author: "医師", status: "有効", order: { type: "lab", codes: ["CBC"], collect: { day: -1, time: "10:00" }, priority: "定時" } };
    const rx: OrderEntry = { ...lab, id: "rx", order: { type: "prescription", category: "定期", drugCode: "ORAL-MET250", amount: 1, unit: "錠", timings: ["朝"], start: { day: -2 }, days: 1 } };
    expect(activeOrders([lab, rx, { ...lab, id: "stopped", status: "中止" }, { ...lab, id: "done", status: "実施済" }]).map(e => e.id)).toEqual(["lab"]);
  });
  it("医師に指導記録を新しい順に表示する", () => {
    const record: GuidanceRecord = { id: "old", patientId: "p", kind: "服薬指導", heard: "本人", minutes: 10, text: "以前の説明", by: "薬剤師", at: { day: -1, time: "10:00" }, answers: [] };
    const html = renderToStaticMarkup(<GuideRecordPanel role="医師" entries={[]} records={[record, { ...record, id: "new", kind: "栄養食事指導", text: "今回の説明", at: { day: 0, time: "10:00" } }]} today={today} onSave={noop} />);
    expect(html.indexOf("今回の説明")).toBeLessThan(html.indexOf("以前の説明"));
    expect(html).not.toContain("記録する");
  });
  it.each(["rxcal", "proccal"] as const)("%s の0件では入口を出す", tab => {
    expect(emptyCalendar(tab, [])).toBe(true);
    const html = renderToStaticMarkup(<RefWindow tab={tab} patient={PATIENTS[0]} entries={[]} today={today} nowTime="10:00" selectedDay={null} onSelectDay={noop} onStopDraft={noop} draftedStops={[]} onNewOrder={noop} />);
    expect(html).toContain(tab === "rxcal" ? "＋ 処方を出す" : "＋ 処置を出す");
    expect(html).not.toContain("<table");
  });
  it("別ウインドウの経過表を記事のタブに重ねて出さない", () => {
    const html = renderToStaticMarkup(<RightTabs open={["flowsheet"]} value="note" floating={["flowsheet"]} onChange={noop} onOpen={noop} onClose={noop} onFloat={noop} counts={{}} />);
    expect(html).not.toContain("経過表");
  });
  it("連続期間をまとめ、編集できる境界は分ける", () => {
    expect(calendarBands(["a", "a", "b", "a"], x => x).map(x => x.count)).toEqual([2, 1, 1]);
  });
  it("食事の理由はホバーに残し、短い名前を帯にする", () => {
    const p = SCENARIOS.patients.find(p => SCENARIOS.diets.some(d => d.patientId === p.id && d.kind === "絶食"))!;
    const html = renderToStaticMarkup(<DietCalendar patient={p} entries={p.history} diets={SCENARIOS.diets} today={today} nowTime="10:00" />);
    expect(html).toContain("colSpan=");
    expect(html).toContain("絶食");
    expect(html).not.toMatch(/>絶食（/);
  });
  it("ISO形式の日付も共通の札とカレンダーにする", () => {
    const html = renderToStaticMarkup(<IsoDayInput aria-label="文書の日付" value="2026-11-06" onChange={noop} />);
    expect(html).toContain("2026/11/06");
    expect(html).toContain('aria-label="文書の日付"');
    expect(html).toContain('type="date"');
  });
});
