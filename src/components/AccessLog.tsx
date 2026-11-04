"use client";

import { Download, LockKeyhole } from "lucide-react";
import { useState } from "react";
import { LIMIT_SOURCES } from "@/lib/access-limit";
import { accessChoices, accessCsv, accessRows, emptyAccessQuery, isBreakGlass, isRestricted, type AccessQuery } from "@/lib/access-log";
import { auditLog, useAudit } from "@/lib/audit";
import { useMe } from "./RoleContext";

/** 監査ログ > カルテを開いた記録: who opened which chart and when, narrowed, and saved as CSV. */
export function AccessLog() {
  const events = useAudit();
  const me = useMe();
  const [q, setQ] = useState<AccessQuery>(emptyAccessQuery);
  const set = (x: Partial<AccessQuery>) => setQ((c) => ({ ...c, ...x }));
  const rows = accessRows(events, q);
  const choices = accessChoices(events);
  const glass = rows.filter(isBreakGlass).length;
  const select = "rounded border border-rule bg-sheet px-1.5 py-0.5";
  const save = () => {
    const blob = new Blob([accessCsv(rows)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `カルテを開いた記録_${q.date || "すべての日"}_${rows.length}件.csv`;
    a.click();
    URL.revokeObjectURL(url);
    const cond = [q.patient && `患者 ${q.patient}`, q.actor && `誰が ${q.actor}`, q.date && `日付 ${q.date}`, q.onlyRestricted && "閲覧制限だけ"].filter(Boolean).join("・");
    auditLog({ role: me.role, actor: me.name, action: "カルテを開いた記録を CSV で書き出した", detail: `${rows.length}件${cond ? `（${cond}）` : ""}` });
  };
  return (
    <section aria-label="カルテを開いた記録">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-[12px]">
        <label className="flex items-center gap-1">
          患者
          <select value={q.patient} onChange={(e) => set({ patient: e.target.value })} className={select}>
            <option value="">すべて</option>
            {choices.patients.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1">
          誰が
          <select value={q.actor} onChange={(e) => set({ actor: e.target.value })} className={select}>
            <option value="">すべて</option>
            {choices.actors.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1">
          日付
          <select value={q.date} onChange={(e) => set({ date: e.target.value })} className={select}>
            <option value="">すべて</option>
            {choices.dates.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
        <label className="flex cursor-pointer items-center gap-1">
          <input type="checkbox" checked={q.onlyRestricted} onChange={(e) => set({ onlyRestricted: e.target.checked })} className="accent-fuji" />
          閲覧制限の患者だけ
        </label>
        <span className="text-ink-soft">
          {rows.length}件{glass ? <b className="ml-1 text-fuji">（理由を残して開いた {glass}件）</b> : ""}
        </span>
        <button type="button" disabled={!rows.length} onClick={save} className="ml-auto flex items-center gap-1 rounded border border-ai px-2 py-0.5 text-xs font-bold text-ai hover:bg-ai-soft disabled:opacity-40">
          <Download size={13} />
          CSV（comma-separated values、カンマ区切りの表）で書き出す
        </button>
      </div>
      <p className="mb-2 text-[11px] text-ink-faint">
        カルテと受診の画面を開いた記録だけを並べます。閲覧制限の患者は薄い紫、担当チームのほかの人が理由を残して開いたものは太字です。書き出したことも監査ログに残ります。根拠：
        <a href={LIMIT_SOURCES.log.url} target="_blank" rel="noreferrer" className="text-ai underline-offset-2 hover:underline">
          {LIMIT_SOURCES.log.label}
        </a>
      </p>
      {rows.length === 0 ? (
        <p className="text-ink-faint">当てはまる記録はありません。患者のカルテを開くと、ここに残ります。</p>
      ) : (
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-rule text-left text-[11px] text-ink-faint">
              <th className="py-1 pr-2 font-normal">番号</th>
              <th className="py-1 pr-2 font-normal">日付</th>
              <th className="py-1 pr-2 font-normal">時刻</th>
              <th className="py-1 pr-2 font-normal">誰が</th>
              <th className="py-1 pr-2 font-normal">患者</th>
              <th className="py-1 pr-2 font-normal">何を</th>
              <th className="py-1 font-normal">内容</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => {
              const lim = isRestricted(e);
              const bg = isBreakGlass(e);
              return (
                <tr key={e.seq} className={`border-b border-rule-soft align-top ${lim ? "bg-fuji-soft/70" : ""} ${bg ? "font-bold" : ""}`}>
                  <td className="nums py-1 pr-2 text-ink-faint">{e.seq}</td>
                  <td className="nums whitespace-nowrap py-1 pr-2">{e.date ?? ""}</td>
                  <td className="nums py-1 pr-2">{e.at}</td>
                  <td className="whitespace-nowrap py-1 pr-2">
                    <span className="text-[11px] text-ink-faint">{e.role}</span> {e.actor}
                  </td>
                  <td className="whitespace-nowrap py-1 pr-2">
                    {lim && <LockKeyhole size={11} className="mr-0.5 inline text-fuji" aria-label="閲覧制限" />}
                    {e.patient ?? ""}
                  </td>
                  <td className={`py-1 pr-2 ${lim ? "text-fuji" : ""}`}>{e.action}</td>
                  <td className="py-1 font-normal text-ink-soft">{e.detail ?? ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
