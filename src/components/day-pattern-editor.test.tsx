import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DayPatternEditor } from "./DayPatternEditor";
import { rpLine } from "@/lib/rp";
import type { PrescriptionDraft } from "@/lib/rx";

describe("投与日の札", () => {
  it("毎日・隔日・週1回・月水金・火木土・任意曜日の札", () => {
    const html = renderToStaticMarkup(<DayPatternEditor onChange={() => {}} />);
    for (const label of ["毎日", "隔日", "週1回（曜日）", "月水金", "火木土", "曜日を選ぶ"]) expect(html).toContain(label);
    expect(html).toMatch(/aria-checked="true"[^>]*>毎日/);
  });
  it("週1回は水曜1つ、複数曜日は選んだ曜日をチェックする", () => {
    const weekly = renderToStaticMarkup(<DayPatternEditor value={{ kind: "weekdays", days: [3] }} onChange={() => {}} />);
    expect(weekly.match(/checked=""/g)).toHaveLength(1);
    expect(weekly).toMatch(/checked=""\/>水/);
    const custom = renderToStaticMarkup(<DayPatternEditor value={{ kind: "weekdays", days: [1, 2] }} onChange={() => {}} />);
    expect(custom.match(/checked=""/g)).toHaveLength(2);
  });
  it("確定した1行にも曜日と投与日数を残す", () => {
    const d: PrescriptionDraft = { kind: "prescription", id: "rx", origin: "manual", sourceText: "", comment: null, category: "臨時", items: [{ drugCode: "ORAL-AMLO5", said: "", daily: null, perDose: 1 }], timings: ["朝"], prn: null, maxPerDay: null, days: 6, start: { day: 0, timing: "朝" }, acks: [], dayPattern: { kind: "weekdays", days: [1, 3, 5] } };
    expect(rpLine(d)).toContain("月水金");
    expect(rpLine(d)).toContain("6投与日分");
    expect(rpLine({ ...d, dayPattern: { kind: "weekdays", days: [3] } })).toContain("週1回 水");
  });
});

it("経過の記事と内服カレンダーにも月水金・投与日数・実際の期間を表示する", async () => {
  const { HistoryPane } = await import("./HistoryPane");
  const { PrescriptionCalendar, InjectionCalendar } = await import("./Calendars");
  const { PATIENTS } = await import("@/lib/patients");
  const patient = { ...PATIENTS[0], admittedOn: -2 };
  const today = { y: 2026, m: 11, d: 6 };
  const dayPattern = { kind: "weekdays" as const, days: [1, 3, 5] };
  const oral: import("@/lib/types").OrderEntry = { kind: "order", id: "pattern-rx", day: 0, time: "10:00", author: "医師", status: "有効", order: { type: "prescription", category: "臨時", drugCode: "ORAL-AMLO5", amount: 1, unit: "錠", timings: ["朝"], start: { day: 1, timing: "朝" }, days: 6, dayPattern } };
  const injection: import("@/lib/types").OrderEntry = { ...oral, id: "pattern-inj", order: { type: "injection", items: [{ drugCode: "INJ-CEZ1", amount: 1, unit: "g" }], route: "静注", schedule: { kind: "per_day", count: 1 }, start: { day: 1, time: "10:00" }, days: 14, dayPattern } };
  const history = renderToStaticMarkup(<HistoryPane patient={patient} entries={[oral, injection]} today={today} selectedDay={1} showStopped={false} onToggleStopped={() => {}} />);
  expect(history).toContain("月水金・6投与日分（11/9〜11/20）");
  expect(history).toContain("月水金・14日間（11/7〜11/20）");
  const props = { patient, today, nowTime: "10:00", selectedDay: null, onSelectDay: () => {}, onStopDraft: () => {}, draftedStops: [] };
  expect(renderToStaticMarkup(<PrescriptionCalendar {...props} entries={[oral]} />)).toContain("月水金・6投与日分（11/9〜11/20）");
  expect(renderToStaticMarkup(<InjectionCalendar {...props} entries={[injection]} />)).toContain("月水金・14日間（11/7〜11/20）");
});
