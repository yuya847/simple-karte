// 外来予約 on the screens (server render): the panel's choices and rule note, the draft card, the tool under その他,
// and the order in the record and the booking list.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { checkDraft, type CheckContext } from "@/lib/drafts";
import { newOpdBookingDraft } from "@/lib/opd-booking";
import { PATIENTS } from "@/lib/patients";
import { STAFF, type Role } from "@/lib/roles";
import type { OrderEntry } from "@/lib/types";
import { BookingList } from "./BookingList";
import { DraftCard } from "./DraftCard";
import { HistoryPane } from "./HistoryPane";
import { OpdBookingPanel } from "./panels/OpdBookingPanel";
import { MeProvider, RoleProvider } from "./RoleContext";
import { ToolRail } from "./ToolRail";

const sakura = PATIENTS.find((p) => p.id === "90010231")!;
const today = { y: 2026, m: 11, d: 4 };
const fmtDay = (d: number) => `D${d}`;
const as = (role: Role, el: React.ReactElement) =>
  renderToStaticMarkup(
    <RoleProvider value={role}>
      <MeProvider value={STAFF[role]}>{el}</MeProvider>
    </RoleProvider>,
  );
const booked: OrderEntry = { kind: "order", id: "ob1", day: 0, time: "09:30", author: "山本（専攻医）", status: "有効", order: { type: "procedure", code: "PROC-OPD", opd: { dept: "循環器内科", doctor: "循環器内科 森（架空）", day: 14, slot: "午前", purpose: "退院後の初回" }, schedule: { kind: "once" }, start: { day: 14 } } };

describe("外来予約の引き出し", () => {
  it("offers the clinics, the slots and the purposes, says the rule is the fictional hospital's, and lists the bookings made", () => {
    const html = as("医師", <OpdBookingPanel entries={[booked]} defaultDept="総合診療科" newId={() => "d1"} fmtDay={fmtDay} onAdd={() => {}} />);
    expect(html).toContain('aria-label="診療科"');
    expect(html).toContain("循環器内科");
    expect(html).toContain("午前（9:00〜12:00）");
    expect(html).toContain("時刻を指定");
    expect(html).toContain("退院後の初回");
    expect(html).toContain("検査の結果説明");
    expect(html).toContain('aria-label="日付（明日〜90日先）"');
    expect(html).toContain("D90");
    expect(html).not.toContain(">D91<");
    expect(html).not.toContain("架空の病院の取り決め");
    expect(html).toContain("この患者の外来予約");
    expect(html).toContain("D14 午前");
    expect(html).toContain("保存する");
    expect(html).toMatch(/保存する<\/button><span[^>]*>未入力：<button[^>]*>日付<\/button>/);
    expect(html).toContain('data-booking-field="日付"');
    expect(html).toContain('data-booking-field="時間枠"');
    expect(html).toContain('data-booking-field="目的"');
    // The patient's own department is chosen from the start.
    expect(html).toMatch(/aria-checked="true"[^>]*>総合診療科</);
  });
  it("a nurse sees the panel but cannot make the draft", () => {
    const html = as("看護師", <OpdBookingPanel entries={[]} newId={() => "d1"} fmtDay={fmtDay} onAdd={() => {}} />);
    expect(html).toMatch(/<button[^>]*disabled[^>]*>保存する/);
  });
});

describe("外来予約の下書きと記録", () => {
  const ctx: CheckContext = { activeOrders: [], labOrders: [], drafts: [], nowTime: "10:00", fmtDay, describe: (o) => o.id };
  it("the draft card is labelled 外来予約 and shows the clinic, the day and the purpose", () => {
    const d = newOpdBookingDraft("d1", { dept: "循環器内科", day: 14, slot: "午後", purpose: "再診", purposeNote: "", note: "採血は30分前" });
    const html = renderToStaticMarkup(<DraftCard draft={d} issues={checkDraft(d, ctx)} ctx={ctx} onApply={() => {}} onRemove={() => {}} />);
    expect(html).toContain("外来予約 循環器内科");
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain("循環器内科");
    expect(html).toContain("D14 午後");
    expect(html).toContain("再診 採血は30分前");
    expect(html).toContain("確定できます");
  });
  it("the tools' その他 tab has 外来予約", () => {
    const html = as("医師", <ToolRail open="opd-booking" onOpen={() => {}} />);
    expect(html).toContain(">外来予約<");
    expect(html).toContain("lucide-calendar-clock");
  });
  it("the record shows the order as 外来予約 with its own filter, and the booking list shows it", () => {
    const html = as("医師", <HistoryPane patient={sakura} entries={[...sakura.history, booked]} today={today} selectedDay={1} showStopped={false} onToggleStopped={() => {}} />);
    expect(html).toContain("外来予約　循環器内科");
    expect(html).toContain("11/18（水） 午前（9:00〜12:00）");
    expect(html).toContain("【外来予約】");
    const list = renderToStaticMarkup(<BookingList bookings={[{ day: 14, time: null, kind: "外来予約", label: "循環器内科　午前　退院後の初回", done: false }]} today={today} />);
    expect(list).toContain("外来予約");
    expect(list).toContain("時刻未定");
  });
});
