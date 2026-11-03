// 予約の一覧: everything booked for one patient, by day — exams (画像・生理・内視鏡), blood draws,
// dialysis, transfusion, rehabilitation, consults and operations — taken from the orders by code.

import { examAt, type ImagingOrder, type PhysioOrder } from "./exams";
import { abs } from "./flowsheet";
import { orderLines } from "./format";
import type { CalendarDate } from "./dates";
import type { OrderEntry } from "./types";

export interface Booking {
  day: number;
  /** "HH:MM", or null when not fixed. */
  time: string | null;
  kind: string;
  label: string;
  done: boolean;
}

const hhmm = (min: number) => `${String(Math.floor((((min % 1440) + 1440) % 1440) / 60)).padStart(2, "0")}:${String((((min % 1440) + 1440) % 1440) % 60).padStart(2, "0")}`;

export function bookingsOf(entries: OrderEntry[], surgeries: { day: number; start: string | null; procedure: string; status?: string }[], today: CalendarDate, nowAbs: number): Booking[] {
  const out: Booking[] = [];
  for (const e of entries) {
    if (e.status === "中止") continue;
    const o = e.order;
    if (o.type === "imaging" || o.type === "physio") {
      const at = examAt(o as ImagingOrder | PhysioOrder, abs(e.day, e.time));
      out.push({ day: Math.floor(at / 1440), time: o.when.time || o.when.priority === "至急" ? hhmm(at) : null, kind: o.type === "imaging" ? "画像" : "生理・内視鏡", label: orderLines(o, today).main, done: at <= nowAbs });
    } else if (o.type === "lab") {
      const at = abs(o.collect.day, o.collect.time);
      out.push({ day: o.collect.day, time: o.collect.time, kind: "採血・検体", label: orderLines(o, today).main, done: at <= nowAbs });
    } else if (o.type === "procedure" && (o.hd || o.tx || o.consult || o.rehab)) {
      const kind = o.hd ? "透析" : o.tx ? "輸血" : o.consult ? "他科依頼" : "リハビリ";
      const time = o.start.time ?? null;
      out.push({ day: o.start.day, time, kind, label: orderLines(o, today).main, done: time ? abs(o.start.day, time) <= nowAbs : o.start.day < 0 });
    }
  }
  for (const s of surgeries) out.push({ day: s.day, time: s.start, kind: "手術", label: s.procedure, done: s.status === "終了" || s.day < 0 });
  return out.sort((a, b) => a.day - b.day || (a.time ?? "99").localeCompare(b.time ?? "99"));
}
