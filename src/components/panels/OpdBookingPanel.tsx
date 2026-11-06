"use client";
import { displayText } from "@/lib/display-text";
import { TimeInput } from "@/components/TimeInput";

import { MonthPicker } from "../MonthPicker";
import type { CalendarDate } from "@/lib/dates";
import { useRef, useState } from "react";
import { type Draft } from "@/lib/drafts";
import { OPD_BOOKING_RULES, OPD_CLINICS, OPD_PURPOSES, OPD_SLOTS, bookableDays, newOpdBookingDraft, opdBookingText, opdBookingsOf, opdDoctorsOf, type OpdSlot } from "@/lib/opd-booking";
import type { OrderEntry } from "@/lib/types";
import { DenyNote, useDeny } from "../RoleContext";
import { TabChoice } from "../TabChoice";

/**
 * 外来予約: the doctor chooses the clinic, the doctor (optional), the day (tomorrow to 90 days ahead, with the
 * weekday), the slot (午前・午後 or a clock time), what the visit is for, and a note; 「保存する」 puts it with
 * the other drafts under the note, where it is checked and confirmed. Used for the first visit after discharge
 * of an inpatient and for the next visit of an outpatient (the strip's 再診予約 opens this panel).
 */
export function OpdBookingPanel({ entries, defaultDept, newId, fmtDay, onAdd, today }: { today?: CalendarDate; entries: OrderEntry[]; defaultDept?: string; newId: () => string; fmtDay: (d: number) => string; onAdd: (d: Draft) => void }) {
  const fields = useRef<HTMLDivElement>(null);
  const focusMissing = (name: string) => { const target = name === "目的" && purpose === "その他" ? "目的の補足" : name; const row = fields.current?.querySelector<HTMLElement>(`[data-booking-field="${target}"]`); row?.scrollIntoView({ block: "nearest" }); (row?.matches("input") ? row : row?.querySelector<HTMLElement>("input, select, button"))?.focus(); };
  const deny = useDeny()("order");
  const [dept, setDept] = useState<string | null>(() => (defaultDept && OPD_CLINICS.some((c) => c.name === defaultDept) ? defaultDept : null));
  const [doctor, setDoctor] = useState<string>("");
  const [day, setDay] = useState<number | null>(null);
  const [slot, setSlot] = useState<OpdSlot | null>(null);
  const [time, setTime] = useState("");
  const [purpose, setPurpose] = useState<string | null>(null);
  const [purposeNote, setPurposeNote] = useState("");
  const [note, setNote] = useState("");
  const booked = opdBookingsOf(entries);
  const missing = [!dept && "診療科", day === null && "日付", !slot && "時間枠", slot === "時刻" && !time && "時刻", !(purpose && (purpose !== "その他" || purposeNote.trim())) && "目的"].filter((x): x is string => !!x);
  const submit = () => {
    if (missing.length) return;
    onAdd(newOpdBookingDraft(newId(), { dept, doctor: doctor || null, day, slot, time: slot === "時刻" ? time : null, purpose, purposeNote, note }));
    setDay(null);
    setSlot(null);
    setTime("");
    setPurpose(null);
    setPurposeNote("");
    setNote("");
  };
  const input = "w-full rounded border border-rule bg-paper px-2 py-1";
  const row = "flex flex-wrap items-center gap-2";
  const label = "w-16 shrink-0 text-ink-soft";
  return (
    <div ref={fields} className="space-y-3 text-[12px]">
      {booked.length > 0 && (
        <section className="space-y-1">
          <h3 className="font-bold text-ink-soft">この患者の外来予約</h3>
          <ul className="space-y-1">
            {booked.map((e) => (
              <li key={e.id} className="nums rounded-md border border-rule bg-sheet px-2 py-1">
                <div className="text-[11px] text-ink-faint">
                  {fmtDay(e.day)} {e.time}　{displayText(e.author)}
                </div>
                {displayText(opdBookingText(e.order.opd, fmtDay))}
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="hint text-[11px] text-ink-faint">科・日付・時間枠・目的を選んで「保存する」。記事の下の下書きで確かめて確定すると、左の経過にオーダとして残り、「予約」のウインドウに出ます。決めるのは医師で、AI は使いません。</p>
      <div data-booking-field="診療科" className={row}>
        <span className={label}>診療科</span>
        <TabChoice label="診療科" options={OPD_CLINICS.map((c) => ({ value: c.name, label: c.name }))} value={dept} onChange={(v) => (setDept(v), setDoctor(""))} />
      </div>
      <div className={row}>
        <span className={label}>医師</span>
        <select value={doctor} onChange={(e) => setDoctor(e.target.value)} aria-label="医師（任意）" disabled={!dept} className="rounded border border-rule bg-paper px-1.5 py-0.5">
          <option value="">指定しない</option>
          {(dept ? opdDoctorsOf(dept) : []).map((d) => (
            <option key={d} value={d}>
              {displayText(d)}
            </option>
          ))}
        </select>
        <span className="text-[11px] text-ink-faint">任意</span>
      </div>
      <div data-booking-field="日付" className={row}>
        <span className={label}>日付</span>
        <TabChoice
          label="日付の早い選び方"
          options={[7, 14, 28, 56].map((n) => ({ value: n, label: `${n / 7}週間後` }))}
          value={day !== null && [7, 14, 28, 56].includes(day) ? day : null}
          onChange={setDay}
        />
        {today && (
          <MonthPicker
            today={today}
            value={day}
            min={OPD_BOOKING_RULES.minDays}
            max={OPD_BOOKING_RULES.maxDays}
            onChange={setDay}
            marks={Object.fromEntries(Object.entries(entries.reduce<Record<number, number>>((acc, e) => { if (e.order.type === "procedure" && e.order.opd && e.status !== "中止") acc[e.order.opd.day] = (acc[e.order.opd.day] ?? 0) + 1; return acc; }, {})).map(([d, n]) => [d, `予約${n}`]))}
            label="日付をカレンダーで選ぶ"
          />
        )}
        <select value={day ?? ""} onChange={(e) => setDay(e.target.value === "" ? null : Number(e.target.value))} aria-label="日付（明日〜90日先）" className="nums rounded border border-rule bg-paper px-1.5 py-0.5">
          <option value="">日を選ぶ</option>
          {bookableDays().map((d) => (
            <option key={d} value={d}>
              {fmtDay(d)}
              {d === 1 ? "（明日）" : ""}
            </option>
          ))}
        </select>
      </div>
      <div data-booking-field="時間枠" className={row}>
        <span className={label}>時間枠</span>
        <TabChoice label="時間枠" options={OPD_SLOTS.map((s) => ({ value: s, label: s === "時刻" ? "時刻を指定" : `${s}（${OPD_BOOKING_RULES.slots[s]}）` }))} value={slot} onChange={setSlot} />
        {slot === "時刻" && <TimeInput data-booking-field="時刻" value={time} onChange={(e) => setTime(e.target.value)} aria-label="予約の時刻" className="rounded border border-rule bg-paper px-1 py-0.5" />}
      </div>
      <div data-booking-field="目的" className={row}>
        <span className={label}>目的</span>
        <TabChoice label="目的" options={OPD_PURPOSES.map((p) => ({ value: p, label: p }))} value={purpose} onChange={setPurpose} />
      </div>
      <input data-booking-field="目的の補足" value={purposeNote} onChange={(e) => setPurposeNote(e.target.value)} placeholder={purpose === "その他" ? "何のため（必ず書く）" : "目的の補足（例：採血の結果と体重を確かめる）"} aria-label="目的の補足" className={input} />
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="備考（例：採血は受診の30分前に）" aria-label="備考" className={input} />
      <DenyNote action="order" />
      <div className="flex flex-wrap items-center gap-2">
      <button type="button" disabled={missing.length > 0 || !!deny} onClick={submit} className="rounded-md bg-ai px-3 py-2 text-sm font-bold text-white disabled:opacity-40">
        保存する
      </button>
      {missing.length > 0 && <span className="text-yamabuki">未入力：{missing.map((name) => <button key={name} type="button" onClick={() => focusMissing(name)} className="mx-1 underline">{displayText(name)}</button>)}</span>}
      </div>
      <p className="text-[11px] text-ink-faint">{displayText(OPD_BOOKING_RULES.note)}</p>
    </div>
  );
}
