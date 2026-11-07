"use client";

import { InsulinWindow, type InsulinEdit } from "./InsulinWindow";
import { emptyCalendar } from "@/lib/active-orders";
import type { CalendarDate } from "@/lib/dates";
import type { DayOffset, HistoryEntry, OrderEntry, Patient } from "@/lib/types";
import type { Booking } from "@/lib/bookings";
import type { DietOrder } from "@/lib/diet";
import type { StandingLine } from "@/lib/standing-lines";
import { PrescriptionCalendar, ProcedureCalendar, type CalendarProps } from "./Calendars";
import { FlowSheet, type FlowSheetProps } from "./FlowSheet";
import type { FlowIo } from "./IoFlowRows";
import type { FlowDays } from "./FlowDayRows";
import { DietCalendar, type BookWhat, type MoveEvent } from "./DietCalendar";
import { BookingList } from "./BookingList";
import { StandingCalendar } from "./StandingCalendar";
import type { RefTab } from "./RightTabs";

export { REF_TABS, isRefTab, type RefTab } from "./RightTabs";

/** Flow sheet props that the chart passes through as they are. */
export type FlowExtra = Partial<Omit<FlowSheetProps, "patient" | "entries" | "today" | "nowTime" | "selectedDay" | "onSelectDay" | "onInsertVitals" | "care" | "io" | "diets" | "moves" | "dayInfo">>;

export interface RefWindowProps {
  onToggleDose?: CalendarProps["onToggleDose"];
  onNewPrescription?: CalendarProps["onNewPrescription"];
  onPrescriptionStop?: CalendarProps["onPrescriptionStop"];
  insulinEdit?: InsulinEdit;
  onNewOrder?: (tab: "rxcal" | "proccal") => void;
  onAdjustInsulin?: CalendarProps["onAdjustInsulin"];
  patient: Patient;
  entries: HistoryEntry[];
  today: CalendarDate;
  nowTime: string;
  selectedDay: DayOffset | null;
  onSelectDay: (d: DayOffset) => void;
  onStopDraft: (entry: OrderEntry, time?: string) => void;
  draftedStops: string[];
  pendingStopTimes?: Record<string, string>;
  /** 延長 (add days) and 修正 (stop and copy into the 注射 tab) from a calendar. */
  onExtendDraft?: (entry: OrderEntry, days: number) => void;
  onModify?: (entry: OrderEntry, change?: import("@/lib/injection-change").InjectionChange) => void;
  pendingExtends?: Record<string, number>;
  marOf?: CalendarProps["marOf"];
  /** 実施・未実施 of a dose from a calendar cell (right click, long press). */
  execute?: CalendarProps["execute"];
  /** Put vital-sign lines copied from the flow sheet into O) of today's note. */
  onInsertVitals?: (text: string) => void;
  /** Diet orders, for the 食事 calendar and the flow sheet; pressing a meal opens the diet panel. */
  diets?: DietOrder[];
  onOpenDiet?: () => void;
  dietEdit?: Parameters<typeof DietCalendar>[0]["dietEdit"];
  /** The patient's bookings (予約の一覧). */
  bookings?: Booking[];
  /** 移動 row of the 移動・食事 calendar, booking from a date, and carrying out a booked move. */
  moves?: MoveEvent[];
  onBook?: (day: number, what: BookWhat) => void;
  onDoMove?: (entryId: string) => void;
  /** 看護ケア指示 and their records, for the flow sheet. */
  care?: FlowSheetProps["care"];
  /** 水分出納 rows of the flow sheet. */
  io?: FlowIo;
  /** 術後日数 and the counted days on the flow sheet's dates. */
  flowDays?: FlowDays;
  /** The rest of what the flow sheet shows and does (lab draws waiting, entries from its cells …). */
  flow?: FlowExtra;
  /** 指示簿カレンダー: the lines (free text and from the fields), stopping one, and opening the 指示簿 panel. */
  standingCal?: { lines: StandingLine[]; onAdd?: (line: StandingLine) => void; onStop?: (id: string, reason: string, day?: number, kind?: "終了") => void; onEdit?: (l: StandingLine) => void; onEndField?: (l: StandingLine) => void; onOpenPanel?: () => void };
}

/**
 * What a reading tab on the right shows (経過表・内服カレンダー・処置カレンダー・移動・食事・指示簿・予約). Each opens
 * from the tools on the far right in its own large window, like the injection calendar, and can be docked back.
 */
export function RefWindow({ tab, insulinEdit, onNewPrescription, onPrescriptionStop, onNewOrder, patient, entries, today, nowTime, selectedDay, onSelectDay, onAdjustInsulin, onStopDraft, draftedStops, onExtendDraft, onModify, pendingExtends, marOf, execute, onInsertVitals, diets, onOpenDiet, dietEdit, bookings, moves, onBook, onDoMove, care, io, flowDays, flow, standingCal }: RefWindowProps & { tab: RefTab }) {
  const calendarProps: CalendarProps = { onNewPrescription, onPrescriptionStop, patient, entries, today, nowTime, selectedDay, onSelectDay, onAdjustInsulin, onStopDraft, draftedStops, onExtendDraft, onModify, pendingExtends, marOf, execute };
  if ((tab === "proccal" || (tab === "rxcal" && !onNewPrescription)) && emptyCalendar(tab, entries)) return <div className="space-y-4 p-4 text-sm">
    <p>{tab === "rxcal" ? "処方" : "処置"}はまだありません。</p>
    {onNewOrder && <button type="button" className="rounded border border-rule px-3 py-2 text-ai" onClick={() => onNewOrder(tab)}>＋ {tab === "rxcal" ? "処方" : "処置"}を出す</button>}
  </div>;
  switch (tab) {
    case "insulin": return <InsulinWindow {...{patient, entries, today, nowTime, selectedDay, onSelectDay, onStopDraft, draftedStops, care, io, diets, execute, insulinEdit}} />;
    case "flowsheet":
      return <FlowSheet key={patient.id} patient={patient} entries={entries} today={today} nowTime={nowTime} selectedDay={selectedDay} onSelectDay={onSelectDay} onInsertVitals={onInsertVitals} care={care} io={io} diets={diets} moves={moves} dayInfo={flowDays} {...flow} />;
    case "rxcal":
      return <PrescriptionCalendar {...calendarProps} />;
    case "proccal":
      return <><button type="button" className="text-xs text-ai" onClick={() => onNewOrder?.("proccal")} disabled={!onNewOrder}>＋ 処置</button><ProcedureCalendar {...calendarProps} /></>;
    case "dietcal":
      return <DietCalendar patient={patient} entries={entries} diets={diets ?? []} today={today} nowTime={nowTime} onOpenDiet={onOpenDiet} dietEdit={dietEdit} moves={moves} onBook={onBook} onDoMove={onDoMove} />;
    case "standingcal":
      return <StandingCalendar patient={patient} lines={standingCal?.lines ?? []} today={today} nowTime={nowTime} onAdd={standingCal?.onAdd} onEndField={standingCal?.onEndField} onEdit={standingCal?.onEdit} onStop={standingCal?.onStop} onOpenPanel={standingCal?.onOpenPanel} />;
    case "bookings":
      return <BookingList bookings={bookings ?? []} today={today} />;
  }
}
