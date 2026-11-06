"use client";

import { insuranceRecords } from "@/lib/billing/registration";
import { useState } from "react";
import type { ErPatient } from "@/lib/er";
import type { CalendarDate } from "@/lib/dates";
import type { OrderEntry } from "@/lib/types";
import { emergencyAsOpd } from "@/lib/billing/emergency-visit";
import type { IjiDesk } from "@/lib/billing/worklist";
import type { OpdSettleBook, OpdSettlement } from "@/lib/billing/opd-settle";
import { OpdBillPanel } from "./OpdBillPanel";

export interface EmergencyDeskProps {
  visits: { patient: ErPatient; entries: OrderEntry[]; drafts: number }[];
  book: OpdSettleBook;
  onSettle: (s: OpdSettlement) => void;
}
export function EmergencyDesk({ visits, book, onSettle, desk, today, nowTime, onOpen }: EmergencyDeskProps & { desk: IjiDesk; today: CalendarDate; nowTime: string; onOpen: (id: string, where: "billing" | "diagnoses") => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const [kinds, setKinds] = useState<Record<string, "初診" | "再診">>({});
  return <section aria-label="救急外来の受診" className="mb-4 space-y-1">
    <h2 className="font-bold">救急外来の受診</h2>
    {visits.filter(v => !v.patient.admittedAs && !book[`er:${v.patient.id}`]).map(({ patient: p, entries, drafts }) => {
      const key = `er:${p.id}`;
      const paid = book[key];
      const kind = paid?.visitKind ?? kinds[key] ?? "初診";
      return <div key={key} className="rounded border border-rule bg-sheet px-3 py-1.5">
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <b>{p.name}（救急外来）</b><span>{p.status}</span>
          {drafts > 0 && <span>下書き {drafts}（医師の確定待ち）</span>}
          <span>{insuranceRecords(desk.insurance, key)?.length ? "保険登録あり" : "保険の未登録"}</span>
          {!insuranceRecords(desk.insurance, key)?.length && <button type="button" className="text-ai underline" onClick={() => onOpen(key, "billing")}>保険を登録する</button>}
          {p.admittedAs ? <button type="button" className="text-ai underline" onClick={() => onOpen(p.admittedAs!, "billing")}>入院の算定へ（{p.admittedAs} に引き継ぎ・救急の会計なし）</button> : <>
            <span className={paid ? "text-wakatake" : p.status === "入院依頼" ? "text-ink-soft" : "text-yamabuki"}>{paid ? `会計済み（${paid.method}）` : p.status === "入院依頼" ? "入院へ引き継ぐ（会計なし）" : "会計がまだ"}</span>
            <button type="button" className="rounded border border-rule px-2 py-0.5 text-ai" onClick={() => setOpen(open === key ? null : key)}>{open === key ? "閉じる" : "算定・会計へ"}</button>
          </>}
        </div>
        {open === key && !p.admittedAs && <div className="mt-3">
          <label className="mb-2 block text-xs">受診の区分 <select disabled={!!paid} value={kind} onChange={(e) => setKinds((all) => ({ ...all, [key]: e.target.value as "初診" | "再診" }))} className="rounded border border-rule p-1"><option>初診</option><option>再診</option></select></label>
          <button type="button" onClick={() => onOpen(key, "billing")} className="mb-2 text-xs text-ai underline">カルテ・保険を開く</button>
          {p.status === "入院依頼" && <p className="text-xs text-yamabuki">入院依頼中は入金できません。入院先に算定を引き継ぎます。</p>}
          <OpdBillPanel key={`${key}:${kind}`} emergency={{ arrivedAbs: p.arrivedAbs }} visit={emergencyAsOpd(p, kind)} visitKey={key} entries={entries} rx={[]} records={insuranceRecords(desk.insurance, key)} today={today} nowTime={nowTime} settlement={paid} book={book} unpaid={[]} onSettle={p.status === "入院依頼" ? undefined : onSettle} />
        </div>}
      </div>;
    })}
    <details><summary className="cursor-pointer text-xs text-ink-soft">入院済み・会計済み {visits.filter(v => v.patient.admittedAs || book[`er:${v.patient.id}`]).length}人</summary>{visits.filter(v => v.patient.admittedAs || book[`er:${v.patient.id}`]).map(({patient:p}) => <div key={p.id} className="py-1 text-xs"><button className="text-ai" onClick={() => onOpen(`er:${p.id}`, "billing")}>{p.name}</button>・{p.status} {p.admittedAs && <button className="text-ai" onClick={() => onOpen(p.admittedAs!, "billing")}>入院の算定へ（保険は患者の履歴を引き継ぎ）</button>}</div>)}</details>
  </section>;
}
