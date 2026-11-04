"use client";

// DPC の入院期間 of the listed patients, from /api/dpc (the same calculation as the 算定 tab), fetched only
// while a list is shown and again only when a patient's record changes. Kept in memory for this page.

import { useEffect, useRef, useState } from "react";
import { FICTIONAL_COEFFICIENT } from "./billing/dpc";
import type { DpcMonthView } from "./billing/dpc-claim";
import { isoDate, type CalendarDate } from "./dates";
import { briefOf, type DpcBrief } from "./dpc-brief";

export type DpcBriefs = Record<string, DpcBrief | "loading">;

export function useDpcBriefs(ids: string[], payloadOf: (id: string) => object | null, today: CalendarDate | null, nowTime: string | null, enabled: boolean): DpcBriefs {
  const [briefs, setBriefs] = useState<DpcBriefs>({});
  // The record each brief was made from (without the clock), so a patient is fetched again only when it changes.
  const made = useRef<Record<string, string>>({});
  const wanted = enabled && today && nowTime ? ids.map((id) => ({ id, payload: payloadOf(id) })).filter((x): x is { id: string; payload: object } => !!x.payload) : [];
  const key = JSON.stringify(wanted.map((w) => [w.id, w.payload]));

  useEffect(() => {
    if (!wanted.length || !today || !nowTime) return;
    const month = isoDate(today).slice(0, 7);
    const todo = wanted.filter((w) => made.current[w.id] !== JSON.stringify(w.payload));
    if (!todo.length) return;
    const ctl = new AbortController();
    const open = new Set(todo.map((w) => w.id));
    const done = made.current;
    for (const w of todo) {
      done[w.id] = JSON.stringify(w.payload);
      setBriefs((b) => ({ ...b, [w.id]: "loading" }));
      fetch("/api/dpc", {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: ctl.signal,
        body: JSON.stringify({ today: isoDate(today), nowTime, month, ...w.payload, dpc: { coefficient: FICTIONAL_COEFFICIENT, transfer: null } }),
      })
        .then(async (res) => {
          const json = await res.json();
          open.delete(w.id);
          setBriefs((b) => ({ ...b, [w.id]: res.ok ? briefOf(json as DpcMonthView) : { ok: false, reason: json.error ?? "計算できませんでした" } }));
        })
        .catch(() => {
          if (ctl.signal.aborted) return;
          open.delete(w.id);
          setBriefs((b) => ({ ...b, [w.id]: { ok: false, reason: "計算できませんでした" } }));
        });
    }
    return () => {
      // Not answered yet: fetch these again on the next run.
      for (const id of open) delete done[id];
      ctl.abort();
    };
    // `key` stands for `wanted` (the ids and their records); the clock alone does not refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return briefs;
}
