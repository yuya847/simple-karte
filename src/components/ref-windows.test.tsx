// The left pane is the record only; the flow sheet and the calendars are tabs on the right that open from the
// tools (参照) in their own window (server render, no browser).
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PATIENTS } from "@/lib/patients";
import { STAFF } from "@/lib/roles";
import { HistoryPane } from "./HistoryPane";
import { RefWindow, REF_TABS, isRefTab } from "./RefWindows";
import { RightTabs, RIGHT_TABS, WINDOW_TABS } from "./RightTabs";
import { MeProvider, RoleProvider } from "./RoleContext";
import { ToolRail } from "./ToolRail";

const sakura = PATIENTS.find((p) => p.id === "90010231")!;
const today = { y: 2026, m: 11, d: 4 };
const asDoctor = (el: React.ReactElement) =>
  renderToStaticMarkup(
    <RoleProvider value="医師">
      <MeProvider value={STAFF.医師}>{el}</MeProvider>
    </RoleProvider>,
  );

describe("左の欄は経過だけ", () => {
  const html = asDoctor(<HistoryPane patient={sakura} entries={sakura.history} today={today} selectedDay={null} showStopped={false} onToggleStopped={() => {}} />);
  it("has no tab row (経過表・注射・内服 …) over the record, and keeps the filter row", () => {
    expect(html).not.toContain('aria-label="左の表示"');
    expect(html).not.toContain(">経過表<");
    expect(html).toContain('aria-label="経過"');
    expect(html).toContain("中止したオーダも表示");
    expect(html).toContain('aria-label="記載を書いた職種"');
    expect(html).toContain('aria-label="オーダの種類"');
  });
});

describe("右の欄の参照のタブ", () => {
  it("the reading tabs open in their own window first, like the injection calendar", () => {
    for (const t of REF_TABS) expect(WINDOW_TABS.has(t)).toBe(true);
    expect(WINDOW_TABS.has("injcal")).toBe(true);
    expect(WINDOW_TABS.has("note")).toBe(false);
    expect(isRefTab("flowsheet")).toBe(true);
    expect(isRefTab("injcal")).toBe(false);
  });
  it("an open reading tab is shown with its × and a ⌥ shortcut; a closed one is not", () => {
    const html = renderToStaticMarkup(<RightTabs open={["injection", "rx", "flowsheet", "bookings"]} value="note" floating={[]} onChange={() => {}} onOpen={() => {}} onClose={() => {}} onFloat={() => {}} counts={{}} canOrder />);
    expect(html).toContain("経過表");
    expect(html).toContain('aria-label="経過表のタブを閉じる"');
    expect(html).toContain("（⌥5）");
    expect(html).toContain('aria-label="予約のタブを閉じる"');
    expect(html).not.toContain("内服カレンダー");
    expect(html).not.toContain("移動・食事");
  });
  it("the tools' 参照 tab lists the reading windows after the injection calendar", () => {
    const calendars = REF_TABS.map((t) => ({ key: t, label: RIGHT_TABS[t].label, title: RIGHT_TABS[t].title, icon: RIGHT_TABS[t].icon, on: t === "bookings", open: () => {} }));
    const html = asDoctor(<ToolRail open="results" onOpen={() => {}} injectionCalendar={{ on: false, open: () => {} }} calendars={calendars} />);
    expect(html).toContain("注射カレンダー");
    expect(html).toContain("経過表");
    expect(html).toContain("指示簿カレンダー");
    expect(html).toContain("移動・食事");
    expect(html).toMatch(/aria-pressed="true"[^>]*>[^<]*<svg[^>]*lucide-calendar-check/);
    expect(html.indexOf("注射カレンダー")).toBeLessThan(html.indexOf("経過表"));
  });
});

describe("参照のウインドウの中身", () => {
  const base = { patient: sakura, entries: sakura.history, today, nowTime: "10:00", selectedDay: null, onSelectDay: () => {}, onStopDraft: () => {}, draftedStops: [] as string[] };
  it("予約: the list from the orders; 移動・食事: the calendar with the meals; 経過表: the flow sheet", () => {
    expect(asDoctor(<RefWindow tab="bookings" {...base} bookings={[{ day: 1, time: "10:30", kind: "画像", label: "CT 胸部", done: false }]} />)).toContain("CT 胸部");
    expect(asDoctor(<RefWindow tab="dietcal" {...base} diets={[]} />)).toContain("移動");
    expect(asDoctor(<RefWindow tab="flowsheet" {...base} />)).toContain("体温");
    expect(asDoctor(<RefWindow tab="standingcal" {...base} standingCal={{ lines: [] }} />)).toContain("指示");
  });
});
