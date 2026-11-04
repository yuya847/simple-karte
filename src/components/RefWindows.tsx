"use client";

import type { CalendarDate } from "@/lib/dates";
import type { DayOffset, HistoryEntry, OrderEntry, Patient } from "@/lib/types";
import type { Booking } from "@/lib/bookings";
import type { DietOrder } from "@/lib/diet";
import type { CareOrder, CareRecord } from "@/lib/care-orders";
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
  patient: Patient;
  entries: HistoryEntry[];
  today: CalendarDate;
  nowTime: string;
  selectedDay: DayOffset | null;
  onSelectDay: (d: DayOffset) => void;
  onStopDraft: (entry: OrderEntry) => void;
  draftedStops: string[];
  /** 延長 (add days) and 修正 (stop and copy into the 注射 tab) from a calendar. */
  onExtendDraft?: (entry: OrderEntry, days: number) => void;
  onModify?: (entry: OrderEntry) => void;
  pendingExtends?: Record<string, number>;
  marOf?: CalendarProps["marOf"];
  /** Put vital-sign lines copied from the flow sheet into O) of today's note. */
  onInsertVitals?: (text: string) => void;
  /** Diet orders, for the 食事 calendar and the flow sheet; pressing a meal opens the diet panel. */
  diets?: DietOrder[];
  onOpenDiet?: () => void;
  /** The patient's bookings (予約の一覧). */
  bookings?: Booking[];
  /** 移動 row of the 移動・食事 calendar, booking from a date, and carrying out a booked move. */
  moves?: MoveEvent[];
  onBook?: (day: number, what: BookWhat) => void;
  onDoMove?: (entryId: string) => void;
  /** 看護ケア指示 and their records, for the flow sheet. */
  care?: { orders: CareOrder[]; records: CareRecord[]; sessionStart: number };
  /** 水分出納 rows of the flow sheet. */
  io?: FlowIo;
  /** 術後日数 and the counted days on the flow sheet's dates. */
  flowDays?: FlowDays;
  /** The rest of what the flow sheet shows and does (lab draws waiting, entries from its cells …). */
  flow?: FlowExtra;
  /** 指示簿カレンダー: the lines (free text and from the fields), stopping one, and opening the 指示簿 panel. */
  standingCal?: { lines: StandingLine[]; onStop?: (id: string, reason: string) => void; onOpenPanel?: () => void };
}

/**
 * What a reading tab on the right shows (経過表・内服カレンダー・処置カレンダー・移動・食事・指示簿・予約). Each opens
 * from the tools on the far right in its own large window, like the injection calendar, and can be docked back.
 */
export function RefWindow({ tab, patient, entries, today, nowTime, selectedDay, onSelectDay, onStopDraft, draftedStops, onExtendDraft, onModify, pendingExtends, marOf, onInsertVitals, diets, onOpenDiet, bookings, moves, onBook, onDoMove, care, io, flowDays, flow, standingCal }: RefWindowProps & { tab: RefTab }) {
  const calendarProps: CalendarProps = { patient, entries, today, nowTime, selectedDay, onSelectDay, onStopDraft, draftedStops, onExtendDraft, onModify, pendingExtends, marOf };
  switch (tab) {
    case "flowsheet":
      return <FlowSheet patient={patient} entries={entries} today={today} nowTime={nowTime} selectedDay={selectedDay} onSelectDay={onSelectDay} onInsertVitals={onInsertVitals} care={care} io={io} diets={diets} moves={moves} dayInfo={flowDays} {...flow} />;
    case "rxcal":
      return <PrescriptionCalendar {...calendarProps} />;
    case "proccal":
      return <ProcedureCalendar {...calendarProps} />;
    case "dietcal":
      return <DietCalendar patient={patient} entries={entries} diets={diets ?? []} today={today} nowTime={nowTime} onOpenDiet={onOpenDiet} moves={moves} onBook={onBook} onDoMove={onDoMove} />;
    case "standingcal":
      return <StandingCalendar patient={patient} lines={standingCal?.lines ?? []} today={today} nowTime={nowTime} onStop={standingCal?.onStop} onOpenPanel={standingCal?.onOpenPanel} />;
    case "bookings":
      return <BookingList bookings={bookings ?? []} today={today} />;
  }
}
