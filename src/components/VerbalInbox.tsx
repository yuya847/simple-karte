"use client";

import { displayText } from "@/lib/display-text";
import { useContext } from "react";
import { VerbalReview, VerbalReviewContext } from "./VerbalControls";
import { canReviewVerbal } from "@/lib/verbal";
import { useMe } from "./RoleContext";
import { addDays, formatShort, type CalendarDate } from "@/lib/dates";
import { orderLines } from "@/lib/format";
import { verbalDeadline, verbalOverdue, verbalUnsigned } from "@/lib/verbal";
import type { OrderEntry } from "@/lib/types";
import { DenyNote, useDeny } from "./RoleContext";

interface Props {
  entries: OrderEntry[];
  today: CalendarDate;
  nowAbs: number;
  onSign?: (ids: string[]) => void;
}

const clock = (m: number) => `${String(Math.floor((((m % 1440) + 1440) % 1440) / 60)).padStart(2, "0")}:${String(((m % 60) + 60) % 60).padStart(2, "0")}`;

/** 口頭指示 waiting for the doctor's signature (shown in the chart). */
export function VerbalInbox({ entries, today, nowAbs, onSign }: Props) {
  const me = useMe();
  const review = useContext(VerbalReviewContext);
  const sign = onSign ?? review;
  const list = verbalUnsigned(entries);
  const allowed = list.filter((e) => canReviewVerbal(e, me));
  const locked = !!useDeny()("order.sign");
  if (list.length === 0) return null;
  return (
    <section className="border-b border-rule bg-yamabuki-soft/60 px-4 py-2 text-[12px]">
      <fieldset disabled={locked} className="m-0 min-w-0 border-0 p-0 [&_button:disabled]:opacity-40">
      <div className="flex items-center gap-2">
        <b className="text-yamabuki">口頭指示の承認待ち {list.length}件</b>
        <span className="text-ink-soft">看護師が代わりに入力したオーダです。内容を確かめて承認してください。</span>
        <button type="button" disabled={!allowed.length} onClick={() => sign(allowed.map((e) => e.id))} className="ml-auto rounded bg-yamabuki px-2 py-0.5 text-xs font-bold text-white">
          すべて承認（署名）
        </button>
      </div>
      <ul className="mt-1 space-y-0.5">
        {list.map((e) => {
          const due = verbalDeadline(e);
          const late = verbalOverdue(e, nowAbs);
          return (
            <li key={e.id} className="flex flex-wrap items-baseline gap-2">
              <span>{orderLines(e.order, today).main}</span>
              <span className="text-ink-soft">
                {e.verbal!.at.time} {displayText(e.verbal!.doctor)} → 受け {e.verbal!.takenBy}
              </span>
              <span className={late ? "font-bold text-shu" : "text-ink-faint"}>
                {late ? "承認の期限を過ぎています" : `期限 ${formatShort(addDays(today, Math.floor(due / 1440)))} ${clock(due)}`}
              </span>
              <VerbalReview entry={e} />
            </li>
          );
        })}
      </ul>
      </fieldset>
      <DenyNote action="order.sign" className="mt-1" />
    </section>
  );
}
