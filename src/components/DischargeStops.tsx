"use client";

import { ListX } from "lucide-react";
import { useState } from "react";
import type { CalendarDate } from "@/lib/dates";
import { DISCHARGE_STOP_SOURCE, type StopGroup, type StopGroupKey } from "@/lib/discharge-stop";
import { orderLines } from "@/lib/format";

/**
 * 退院時の一括中止: the orders still in force, by group. The doctor checks each group to stop (none is
 * checked at first) and confirms; others see the list only.
 */
export function DischargeStops({ groups, today, canStop, why, onStop }: { groups: StopGroup[]; today: CalendarDate; canStop: boolean; why?: string; onStop: (keys: StopGroupKey[]) => void }) {
  const [picked, setPicked] = useState<StopGroupKey[]>([]);
  const chosen = picked.filter((k) => groups.some((g) => g.key === k));
  const n = groups.filter((g) => chosen.includes(g.key)).reduce((a, g) => a + (g.key === "指示簿" ? 1 : g.entries.length), 0);
  return (
    <section aria-label="退院時の一括中止" className="space-y-2 text-[12px]">
      <h3 className="flex items-center gap-1 font-bold">
        <ListX size={14} />
        退院のあとも残る指示
      </h3>
      <p className="hint text-[11px] text-ink-faint">カルテから有効なオーダと指示簿をコードで集めました。中止するグループを医師が1つずつ選んで確定します。退院時処方と退院のオーダは含めません。</p>
      {groups.length === 0 ? (
        <p className="text-wakatake">退院のあとも残る指示はありません。</p>
      ) : (
        <ul className="divide-y divide-rule-soft rounded-md border border-rule">
          {groups.map((g) => (
            <li key={g.key} className="px-2 py-1.5">
              <label className="flex items-center gap-1.5 font-bold">
                {canStop && <input type="checkbox" checked={chosen.includes(g.key)} onChange={() => setPicked((p) => (p.includes(g.key) ? p.filter((x) => x !== g.key) : [...p, g.key]))} className="accent-shu" />}
                {g.label}
                <span className="font-normal text-ink-faint">{g.key === "指示簿" ? "（いまの版を終了）" : `${g.entries.length}件`}</span>
              </label>
              {g.entries.length > 0 && (
                <ul className="mt-0.5 pl-6 text-ink-soft">
                  {g.entries.map((e) => {
                    const l = orderLines(e.order, today);
                    return (
                      <li key={e.id}>
                        ・{l.main}
                        <span className="ml-1 text-ink-faint">{l.detail}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
      {groups.length > 0 &&
        (canStop ? (
          <button type="button" disabled={!chosen.length} onClick={() => (onStop(chosen), setPicked([]))} className="rounded-md bg-shu px-3 py-1 font-bold text-white disabled:opacity-40">
            選んだグループを中止する{n ? `（${n}件）` : ""}
          </button>
        ) : (
          <p className="text-ink-soft">{why ?? "中止は医師が確定します。"}</p>
        ))}
      <p className="hint text-[11px] text-ink-faint">
        出典：
        <a href={DISCHARGE_STOP_SOURCE.url} target="_blank" rel="noreferrer" className="underline">
          {DISCHARGE_STOP_SOURCE.label}
        </a>
      </p>
    </section>
  );
}
