"use client";

// DPC の入院期間 of the listed patients, from /api/dpc/batch (the same calculation as the 算定 tab), fetched only
// while a list is shown and again only when a patient's record changes. The patients that need it go in a few
// requests of up to DPC_BATCH (not one per patient). Kept in memory for this page.

import { useEffect, useMemo, useRef, useState } from "react";
import { FICTIONAL_COEFFICIENT } from "./billing/dpc";
import { isoDate, type CalendarDate } from "./dates";
import type { DpcBrief } from "./dpc-brief";

export type DpcBriefs = Record<string, DpcBrief | "loading">;

/** Patients per request (the server takes up to 40). */
const DPC_BATCH = 20;

export function useDpcBriefs(ids: string[], payloadOf: (id: string) => object | null, today: CalendarDate | null, nowTime: string | null, enabled: boolean): DpcBriefs {
  const [briefs, setBriefs] = useState<DpcBriefs>({});
  // The record each brief was made from (without the clock), so a patient is fetched again only when it changes.
  const made = useRef<Record<string, string>>({});
  const idsKey = ids.join(",");
  const ready = enabled && !!today && !!nowTime;
  // Made again when the list's patients or their records change, not on every keystroke in the list.
  const wanted = useMemo(
    () => (ready ? ids.flatMap((id) => { const payload = payloadOf(id); return payload ? [{ id, payload, json: JSON.stringify(payload) }] : []; }) : []),
    // `idsKey` stands for `ids`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [idsKey, payloadOf, ready],
  );
  const key = useMemo(() => wanted.map((w) => `${w.id}:${w.json}`).join("|"), [wanted]);

  useEffect(() => {
    if (!wanted.length || !today || !nowTime) return;
    const month = isoDate(today).slice(0, 7);
    const todo = wanted.filter((w) => made.current[w.id] !== w.json);
    if (!todo.length) return;
    const ctl = new AbortController();
    const open = new Set(todo.map((w) => w.id));
    const done = made.current;
    for (const w of todo) done[w.id] = w.json;
    setBriefs((b) => ({ ...b, ...Object.fromEntries(todo.map((w) => [w.id, "loading" as const])) }));
    const fail = (part: typeof todo, reason: string) => {
      for (const w of part) open.delete(w.id);
      setBriefs((b) => ({ ...b, ...Object.fromEntries(part.map((w) => [w.id, { ok: false as const, reason }])) }));
    };
    for (let i = 0; i < todo.length; i += DPC_BATCH) {
      const part = todo.slice(i, i + DPC_BATCH);
      fetch("/api/dpc/batch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: ctl.signal,
        body: JSON.stringify({ today: isoDate(today), nowTime, month, dpc: { coefficient: FICTIONAL_COEFFICIENT, transfer: null }, patients: part.map((w) => w.payload) }),
      })
        .then(async (res) => {
          const json = await res.json();
          if (!res.ok) return fail(part, json.error ?? "計算できませんでした");
          const got = json.briefs as Record<string, DpcBrief>;
          for (const w of part) open.delete(w.id);
          setBriefs((b) => ({ ...b, ...Object.fromEntries(part.map((w) => [w.id, got[w.id] ?? { ok: false, reason: "計算できませんでした" }])) }));
        })
        .catch(() => {
          if (!ctl.signal.aborted) fail(part, "計算できませんでした");
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
