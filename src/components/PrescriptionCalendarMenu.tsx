"use client";
import { DayInput } from "./DayInput";
import { useEffect, useRef, useState } from "react";
import type { CalendarProps } from "./Calendars";
import { useOrderHistoryActions } from "./OrderHistoryActions";
import { prescriptionText, revisionEntries } from "@/lib/history-order";
import { orderEndDay } from "@/lib/drafts";
import type { OrderEntry } from "@/lib/types";

export function PrescriptionCalendarMenu({ entry, day, options, children }: { entry: OrderEntry; day: number; options: CalendarProps; children: React.ReactNode }) {
  const actions = useOrderHistoryActions();
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState(7);
  const [stopDay, setStopDay] = useState(day);
  const [notice, setNotice] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const cancel = () => { if (timer.current) clearTimeout(timer.current); };
  const active = entry.status === "有効";
  const modify = actions?.canEdit && revisionEntries(entry, actions.entries).every(e => e.status !== "中止" && !actions.locked(e.id));
  const run = (fn: () => void) => { fn(); setOpen(false); setNotice("記事の下の処方オーダの下書きに入りました"); };
  return <div className="relative" onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setOpen(true); }} onPointerDown={e => { if (e.pointerType === "touch") timer.current = setTimeout(() => setOpen(true), 550); }} onPointerUp={cancel} onPointerCancel={cancel} onPointerMove={cancel}>
    {children}
    {notice && <span role="status" className="text-[10px] text-ai">{notice}</span>}
    {open && <div role="menu" aria-label="処方の操作" className="absolute left-0 top-full z-50 min-w-56 space-y-2 rounded border border-rule bg-sheet p-2 text-xs shadow-lg" onClick={e => e.stopPropagation()}>
      {active && options.onExtendDraft && orderEndDay(entry.order) !== null && <><button role="menuitem" onClick={() => run(() => options.onExtendDraft!(entry, (entry.order as { days?: number }).days ?? 7))}>同じ日数で延長</button><div><input aria-label="延長日数" type="number" min={1} value={days} onChange={e => setDays(Number(e.target.value))} className="w-14 border border-rule" /><button disabled={!Number.isInteger(days) || days < 1} onClick={() => run(() => options.onExtendDraft!(entry, days))}>日延長</button></div></>}
      {active && options.onPrescriptionStop && <><button role="menuitem" onClick={() => run(() => options.onPrescriptionStop!(entry, 0))}>今日から中止</button><div><DayInput label="中止日" value={stopDay} onChange={d => { if (d !== null) setStopDay(d); }} /><button disabled={!Number.isInteger(stopDay)} onClick={() => run(() => options.onPrescriptionStop!(entry, stopDay))}>選んだ日から中止</button></div></>}
      <button role="menuitem" disabled={!modify} onClick={() => { actions?.modify(entry); setOpen(false); }}>変更（量・用法）</button>
      {options.onNewPrescription && <button role="menuitem" onClick={() => { options.onNewPrescription!(day, entry); setOpen(false); }}>Do（同じ処方をもう一度）</button>}
      <button role="menuitem" onClick={async () => { try { await navigator.clipboard.writeText(prescriptionText([entry])); setOpen(false); } catch { setNotice("コピーできませんでした"); } }}>テキストとしてコピー</button>
      <button onClick={() => setOpen(false)}>閉じる</button>
    </div>}
  </div>;
}
