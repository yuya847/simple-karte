"use client";

import { useState } from "react";
import type { JournalLine } from "@/lib/journal";
import type { Pick } from "./WardMap";
import { PickSelect } from "./WardMap";
import { useMe } from "./RoleContext";

/** 看護日誌: the floor's day in numbers (counted by code), the day nurses, and the charge nurse's words. */
export function JournalView({ title, pick, lines, staff, saved, onSave, nowTime }: { title: string; pick: Pick; lines: JournalLine[]; staff: { nurse: string; rooms: string[] }[]; saved: { text: string; by: string; at: string }[]; onSave: (text: string) => void; nowTime: string }) {
  const me = useMe();
  const [text, setText] = useState("");
  return (
    <section aria-label="看護日誌" className="scroll-thin min-h-0 flex-1 overflow-y-auto bg-paper">
      <header className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-rule bg-sheet px-5 py-3">
        <h1 className="text-lg font-bold">
          {title}
          <span className="ml-2 rounded border border-dashed border-ink-faint px-1.5 py-0.5 align-middle text-[10px] font-normal text-ink-soft">架空</span>
        </h1>
        <PickSelect pick={pick} />
        <span className="nums text-sm text-ink-soft">{nowTime} 時点（カルテからコードで数えています）</span>
      </header>
      <div className="grid gap-4 px-5 py-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <table className="nums w-full border-collapse self-start text-[13px]">
          <tbody>
            {lines.map((l) => (
              <tr key={l.label} className="border-b border-rule-soft bg-sheet align-top">
                <th className="w-48 px-3 py-1.5 text-left font-normal text-ink-soft">{l.label}</th>
                <td className="w-12 px-2 py-1.5 text-right text-base font-bold">{l.value}</td>
                <td className="px-3 py-1.5 text-[12px] text-ink-soft">{l.who?.join("、")}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="space-y-4">
          <section className="rounded-lg border border-rule bg-sheet p-3 text-[13px]">
            <h2 className="mb-1 text-xs font-bold text-ink-soft">日勤の担当（架空）</h2>
            <ul className="nums space-y-0.5">
              {staff.map((s) => (
                <li key={s.nurse}>
                  {s.nurse}　<span className="text-ink-soft">{s.rooms.join("・")}</span>
                </li>
              ))}
            </ul>
          </section>
          <section className="rounded-lg border border-rule bg-sheet p-3 text-[13px]">
            <h2 className="mb-1 text-xs font-bold text-ink-soft">所感・申し送り（自分の言葉で）</h2>
            {saved.map((s, i) => (
              <p key={i} className="mb-1 whitespace-pre-wrap border-l-2 border-ai/40 pl-2">
                <span className="nums block text-[11px] text-ink-faint">
                  {s.at} {s.by}
                </span>
                {s.text}
              </p>
            ))}
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} placeholder="例：夜勤は転倒の危険が高い患者が3人。513号室の入院は14時の予定。" aria-label="看護日誌の所感" className="w-full rounded border border-rule bg-paper px-2 py-1" />
            <button
              type="button"
              disabled={!text.trim()}
              onClick={() => {
                onSave(text.trim());
                setText("");
              }}
              className="mt-1 rounded-md bg-ai px-4 py-1.5 font-bold text-white disabled:opacity-40"
            >
              書き残す（{me.name}）
            </button>
          </section>
        </div>
      </div>
    </section>
  );
}
