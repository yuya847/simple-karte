import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { calendarGroup, prescriptionCalendarSeed, resizedPrescriptionDays } from "./prescription-calendar";
import { PrescriptionCalendar } from "@/components/Calendars";
import { AddRxPanel } from "@/components/panels/AddPanels";
import { PATIENTS } from "./patients";
import { currentEntries } from "./record";
import { expiryExtension } from "./rx-expiry-workflow";
import { historyOrderHandlers } from "./history-order";
import type { OrderEntry } from "./types";

const patient = PATIENTS[0];
const entry = patient.history.find((e): e is OrderEntry => e.kind === "order" && e.order.type === "prescription")!;
describe("内服カレンダー", () => {
  it("内服は介入、ほかの参照窓は参照に置く", () => {
    expect(calendarGroup("rxcal")).toBe("intervention");
    expect(calendarGroup("flowsheet")).toBe("reference");
  });
  it("処方がなくても日付と新規処方を表示する", () => {
    const html = renderToStaticMarkup(<PrescriptionCalendar patient={patient} entries={[]} today={{ y: 2026, m: 11, d: 6 }} nowTime="10:00" selectedDay={null} onSelectDay={() => {}} onStopDraft={() => {}} draftedStops={[]} onNewPrescription={() => {}} />);
    expect(html).toContain("＋ 処方");
    expect(html).toContain("新規処方");
    expect(html).not.toContain('disabled=""');
  });
  it("Do は量・用法を保ち、選んだ日を開始日にする", () => {
    const seed = prescriptionCalendarSeed("copy", 3, patient.id, entry);
    expect(seed.day).toBe(3);
    expect(seed.pattern?.rows[0].drugCode).toBe(entry.order.type === "prescription" ? entry.order.drugCode : "");
  });
  it("入力にカレンダーの開始日が入る", () => {
    const html = renderToStaticMarkup(<AddRxPanel newId={() => "d"} onAdd={() => {}} seed={{ key: "calendar", day: 3 }} />);
    expect(html).toContain('data-start-day="3"');
  });
  it("右へのドラッグは延長、左は短縮し最低1日を守る", () => {
    expect(resizedPrescriptionDays(7, 184, 92)).toBe(2);
    expect(resizedPrescriptionDays(7, -184, 92)).toBe(-2);
    expect(resizedPrescriptionDays(2, -184, 92)).toBeNull();
    expect(expiryExtension(entry, 7, "d")).toMatchObject({ kind: "extend", targetOrderId: entry.id, addDays: 7 });
  });
  it("隔日の帯は暦日から投与日分に換算する", () => {
    if (entry.order.type !== "prescription") throw new Error("prescription required");
    const order = { ...entry.order, start: { day: 0 }, days: 3, dayPattern: { kind: "every" as const, n: 2 } };
    expect(resizedPrescriptionDays(3, 184, 92, order)).toBe(1);
    expect(resizedPrescriptionDays(3, -184, 92, order)).toBe(-1);
  });
  it("選んだ中止日を保存後の記録に反映する", () => {
    const result = currentEntries(patient, { added: [], stopped: [entry.id], stopDays: { [entry.id]: 3 } });
    expect(result.find(e => e.id === entry.id)).toMatchObject({ status: "中止", stoppedOn: 3, stoppedTime: "00:00" });
  });
  it("監査済みの変更は経過と同じく禁止する", () => {
    let changed = false;
    historyOrderHandlers({ entries: [entry], locked: () => true, canEdit: true, modifyInjection: () => {}, stopDraft: () => { changed = true; }, load: () => { changed = true; } }).modify(entry);
    expect(changed).toBe(false);
  });
});
