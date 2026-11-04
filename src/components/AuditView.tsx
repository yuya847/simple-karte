"use client";

import { useState } from "react";
import { aiSummary, useAudit, type AuditRole } from "@/lib/audit";
import { AccessLog } from "./AccessLog";

const ROLE_STYLE: Record<AuditRole, string> = {
  AI: "bg-ai-soft text-ai",
  医師: "bg-wakatake-soft text-wakatake",
  看護師: "bg-wakatake-soft text-wakatake",
  薬剤師: "bg-wakatake-soft text-wakatake",
  臨床検査技師: "bg-wakatake-soft text-wakatake",
  管理栄養士: "bg-wakatake-soft text-wakatake",
  MSW: "bg-wakatake-soft text-wakatake",
  臨床工学技士: "bg-wakatake-soft text-wakatake",
  医事課: "bg-paper text-ink-soft",
  事務: "bg-paper text-ink-soft",
};

/** The audit log of this session: what Claude copied and what people decided, in order. */
export function AuditView() {
  const events = useAudit();
  const [only, setOnly] = useState<"all" | "AI" | "people">("all");
  // すべての操作, or カルテを開いた記録 (the access log: by patient, person and day, as CSV).
  const [view, setView] = useState<"all" | "access">("all");
  const s = aiSummary(events);
  const shown = events.filter((e) => (only === "all" ? true : only === "AI" ? e.role === "AI" : e.role !== "AI")).toReversed();
  return (
    <main className="mx-auto max-w-5xl px-6 py-5 text-[13px]">
      <header className="mb-3 flex flex-wrap items-baseline gap-3">
        <h1 className="text-lg font-bold">監査ログ</h1>
        <div className="flex rounded-md border border-rule p-0.5 text-xs" role="tablist" aria-label="監査ログの表示">
          {(
            [
              ["all", "すべての操作"],
              ["access", "カルテを開いた記録"],
            ] as const
          ).map(([k, l]) => (
            <button key={k} type="button" role="tab" aria-selected={view === k} onClick={() => setView(k)} className={`rounded px-2 py-0.5 ${view === k ? "bg-ink font-bold text-white" : "text-ink-soft hover:text-ink"}`}>
              {l}
            </button>
          ))}
        </div>
        <span className="text-ink-soft">
          AI が写した {s.drafted}件　人が確定した {s.confirmed}件　下書きを消した {s.removed}件
        </span>
        <div className={`ml-auto gap-1 ${view === "all" ? "flex" : "hidden"}`} role="radiogroup" aria-label="絞り込み">
          {(
            [
              ["all", "すべて"],
              ["AI", "AI だけ"],
              ["people", "人だけ"],
            ] as const
          ).map(([k, l]) => (
            <button key={k} type="button" role="radio" aria-checked={only === k} onClick={() => setOnly(k)} className={`rounded border px-2 py-0.5 text-xs ${only === k ? "border-ai bg-ai text-white" : "border-rule bg-sheet"}`}>
              {l}
            </button>
          ))}
        </div>
      </header>
      <p className="mb-3 text-[11px] text-ink-faint">
        この画面を開いてからの操作を、起きた順に追記だけで残しています（直したり消したりはできません）。「AI」は Claude が言葉を項目に写したこと、それ以外は人が決めたことです。試作なのでこのブラウザのメモリにだけあり、再読み込みで消えます。
      </p>
      {view === "access" ? (
        <AccessLog />
      ) : shown.length === 0 ? (
        <p className="text-ink-faint">まだ記録はありません。カルテを開いて話すか打つと、ここに残ります。</p>
      ) : (
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-rule text-left text-[11px] text-ink-faint">
              <th className="py-1 pr-2 font-normal">番号</th>
              <th className="py-1 pr-2 font-normal">時刻</th>
              <th className="py-1 pr-2 font-normal">誰が</th>
              <th className="py-1 pr-2 font-normal">何を</th>
              <th className="py-1 pr-2 font-normal">患者</th>
              <th className="py-1 font-normal">内容</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((e) => (
              <tr key={e.seq} className="border-b border-rule-soft align-top">
                <td className="nums py-1 pr-2 text-ink-faint">{e.seq}</td>
                <td className="nums py-1 pr-2">{e.at}</td>
                <td className="py-1 pr-2 whitespace-nowrap">
                  <span className={`rounded px-1 text-[11px] font-bold ${ROLE_STYLE[e.role]}`}>{e.role}</span> {e.actor}
                </td>
                <td className="py-1 pr-2 whitespace-nowrap">{e.action}</td>
                <td className="py-1 pr-2 whitespace-nowrap">{e.patient ?? ""}</td>
                <td className="py-1 text-ink-soft">{e.detail ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
