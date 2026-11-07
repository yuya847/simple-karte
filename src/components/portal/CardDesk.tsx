"use client";

// 外来の受付 › 診察券: the registered cards with today's visit, and the QR of each patient's page.

import type { InsuranceBook } from "@/lib/billing/registration";
import type { CalendarDate } from "@/lib/dates";
import { visitPatientId } from "@/lib/lab-visits";
import type { OpdPatient } from "@/lib/opd";
import { cardOf, ticketLabel, tickets, type Card } from "@/lib/opd-desk";
import { formatBirth } from "@/lib/patient-contacts";
import { birthOf } from "@/lib/portal/view";
import { PortalQr } from "./PortalQr";

export function CardDesk({ cards, patients, ws, book, today }: { cards: Card[]; patients: OpdPatient[]; ws: string | null; book: InsuranceBook; today: CalendarDate }) {
  const t = tickets(patients);
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
      <table className="w-full max-w-4xl border-collapse text-sm">
        <thead>
          <tr className="border-b border-rule text-left text-xs text-ink-faint">
            <th className="py-1.5 font-normal">診察券番号</th>
            <th className="py-1.5 font-normal">氏名</th>
            <th className="py-1.5 font-normal">今日の受診</th>
            <th className="py-1.5" />
          </tr>
        </thead>
        <tbody>
          {cards.map((c) => {
            const visits = patients.filter((p) => cardOf(p) === c.cardNo);
            const id = visits[0] ? visitPatientId("opd", visits[0].id) : `card:${c.cardNo}`;
            return (
              <tr key={c.cardNo} className="border-b border-rule-soft align-middle">
                <td className="nums py-2 pr-3">{c.cardNo}</td>
                <td className="py-2 pr-3">
                  <span className="block text-[11px] text-ink-faint">{c.kana}</span>
                  <b>{c.name}</b>
                  <span className="ml-2 text-xs text-ink-soft">
                    {c.age}歳{c.sex}性
                  </span>
                </td>
                <td className="py-2 pr-3 text-xs text-ink-soft">{visits.map((v) => `${t.get(v.id) ? ticketLabel(t.get(v.id)) : "—"}　${v.department}　${v.status}`).join("／") || "—"}</td>
                <td className="py-2 text-right">
                  <PortalQr ws={ws} subject={`card:${c.cardNo}`} name={c.name} kana={c.kana} label={`診察券 ${c.cardNo}`} birth={formatBirth(birthOf(id, c.age, book, today))} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
