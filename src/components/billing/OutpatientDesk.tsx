"use client";

import { useState } from "react";
import type { OpdPatient } from "@/lib/opd";
import type { OrderEntry } from "@/lib/types";
import type { RxLine } from "@/lib/national/rx-lines";
import type { IjiDesk } from "@/lib/billing/worklist";
import type { CalendarDate } from "@/lib/dates";
import { awaitingPayment } from "@/lib/billing/opd-settle";
import type { OpdSettleBook, OpdSettlement } from "@/lib/billing/opd-settle";
import { OpdBillPanel } from "./OpdBillPanel";

export interface OutpatientDeskProps {
  visits: { patient: OpdPatient; entries: OrderEntry[]; rx: { items?: RxLine[] }[]; drafts: number }[];
  book: OpdSettleBook;
  onSettle: (s: OpdSettlement) => void;
}
export function OutpatientDesk({ visits, book, onSettle, desk, today, nowTime, onOpen }: OutpatientDeskProps & { desk: IjiDesk; today: CalendarDate; nowTime: string; onOpen: (id: string, where: "billing" | "diagnoses") => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const waiting = visits.filter(({ patient: p }) => awaitingPayment(p) && !book[`opd:${p.id}`]);
  return <section aria-label="外来の受診" className="mb-4 space-y-1">
    <h2 className="font-bold">外来の受診</h2>
    {!waiting.length && <p className="text-xs text-ink-soft">会計待ち・会計がまだの受診はありません。</p>}
    {waiting.map(({ patient: p, entries, rx, drafts }) => {
      const key = `opd:${p.id}`;
      return <div key={key} className="rounded border border-rule bg-sheet px-3 py-1.5">
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <b>{p.name}（{p.department}・{p.kind}）</b><span>{p.status}</span>
          {drafts > 0 && <span>下書き {drafts}（医師の確定待ち）</span>}
          <span>{desk.insurance[key]?.length ? "保険登録あり" : "保険の未登録"}</span>
          <span className="text-yamabuki">会計がまだ</span>
          <button type="button" className="rounded border border-rule px-2 py-0.5 text-ai" onClick={() => setOpen(open === key ? null : key)}>{open === key ? "閉じる" : "算定・会計へ"}</button>
          <button type="button" className="text-ai underline" onClick={() => onOpen(key, "billing")}>カルテ・保険を開く</button>
        </div>
        {open === key && <div className="mt-3"><OpdBillPanel visit={p} visitKey={key} entries={entries} rx={rx} records={desk.insurance[key]} today={today} nowTime={nowTime} book={book} unpaid={[]} onSettle={onSettle} onOpenInsurance={() => onOpen(key, "billing")} /></div>}
      </div>;
    })}
  </section>;
}
