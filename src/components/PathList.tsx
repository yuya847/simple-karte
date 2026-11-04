"use client";

import { Route } from "lucide-react";
import { useState } from "react";
import { PATH_RULES, PATH_SOURCES, VARIANCE_CATEGORIES, dueOutcomes, findPath, pathDayOf, varianceCounts, type PathBook, type VarianceCategory } from "@/lib/pathway";

/**
 * クリティカルパスの一覧: the team's patients on a path (today's day, outcomes not evaluated yet, variances),
 * and every variance with its category, counted by category (code counts; people read the reasons).
 */
export function PathList({ book, patientOf, fmt, onOpen }: { book: PathBook; patientOf: (id: string) => { name: string; room: string } | undefined; fmt: (d: number) => string; onOpen: (pid: string) => void }) {
  const [cat, setCat] = useState<VarianceCategory | "all">("all");
  const apps = book.apps.filter((a) => patientOf(a.patientId));
  const ids = new Set(apps.map((a) => a.id));
  const vs = book.variances.filter((v) => ids.has(v.appId));
  const shown = vs.filter((v) => cat === "all" || v.category === cat);
  const appOf = (id: string) => apps.find((a) => a.id === id)!;
  return (
    <div className="scroll-thin min-h-0 flex-1 space-y-4 overflow-y-auto p-4 text-[13px]">
      <header className="flex flex-wrap items-center gap-2">
        <h2 className="flex items-center gap-1.5 text-base font-bold">
          <Route size={18} />
          クリティカルパスの一覧
        </h2>
        <span className="text-xs text-ink-soft">受け持ちのチームの患者（架空の患者）</span>
      </header>
      <p className="text-[11px] text-ink-faint">{PATH_RULES.content}</p>

      <section aria-label="パスを使っている患者">
        {apps.length === 0 ? (
          <p className="rounded-md border border-rule bg-paper px-3 py-2 text-ink-soft">パスを使っている患者はいません。カルテの右のツール「パス」から医師が適用します。</p>
        ) : (
          <table className="w-full border-collapse rounded-md border border-rule bg-sheet">
            <thead>
              <tr className="text-left text-[11px] text-ink-faint">
                {["患者", "パス", "日目", "評価がまだのアウトカム", "バリアンス", "状態", ""].map((h) => (
                  <th key={h} className="border-b border-rule px-2 py-1 font-normal">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {apps.map((a) => {
                const path = findPath(a.code);
                const p = patientOf(a.patientId)!;
                const day = pathDayOf(a, 0);
                const due = dueOutcomes(book, a, day).length;
                const n = vs.filter((v) => v.appId === a.id).length;
                return (
                  <tr key={a.id} className="align-top">
                    <td className="border-b border-rule-soft px-2 py-1">
                      {p.room}　{p.name}
                    </td>
                    <td className="border-b border-rule-soft px-2 py-1">
                      {path?.name}
                      <div className="nums text-[11px] text-ink-faint">1日目 {fmt(a.startDay)}</div>
                    </td>
                    <td className="nums border-b border-rule-soft px-2 py-1">
                      {a.end ? "—" : `${day}日目 / ${path?.length}日`}
                      {!a.end && path && day > path.length && <div className="text-[11px] font-bold text-yamabuki">標準を {day - path.length}日 超過</div>}
                    </td>
                    <td className={`nums border-b border-rule-soft px-2 py-1 ${due ? "font-bold text-yamabuki" : "text-ink-faint"}`}>{a.end ? "—" : `${due}件`}</td>
                    <td className={`nums border-b border-rule-soft px-2 py-1 ${n ? "font-bold text-shu" : "text-ink-faint"}`}>{n}件</td>
                    <td className="border-b border-rule-soft px-2 py-1 text-[12px]">{a.end ? `${a.end.kind}（${fmt(a.end.at.day)}）` : "使用中"}</td>
                    <td className="border-b border-rule-soft px-2 py-1 text-right">
                      <button type="button" onClick={() => onOpen(a.patientId)} className="text-xs text-ai underline">
                        パスを開く
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <section aria-label="バリアンスの一覧" className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-bold">バリアンスの一覧（{vs.length}件）</h3>
          <div role="tablist" className="flex flex-wrap rounded-md border border-rule p-0.5 text-xs">
            {(["all", ...VARIANCE_CATEGORIES] as const).map((k) => (
              <button key={k} role="tab" type="button" aria-selected={cat === k} onClick={() => setCat(k)} className={`rounded px-2 py-0.5 ${cat === k ? "bg-ink font-bold text-white" : "text-ink-soft"}`}>
                {k === "all" ? "すべて" : k} {k === "all" ? vs.length : vs.filter((v) => v.category === k).length}
              </button>
            ))}
          </div>
        </div>
        {varianceCounts(vs).length > 0 && <p className="text-[12px] text-ink-soft">分類ごとの件数（多い順）：{varianceCounts(vs).map((x) => `${x.category} ${x.n}件`).join("・")}</p>}
        {shown.length === 0 ? (
          <p className="rounded-md border border-rule bg-paper px-3 py-2 text-ink-soft">ありません。</p>
        ) : (
          <table className="w-full border-collapse rounded-md border border-rule bg-sheet text-[12px]">
            <tbody>
              {shown.map((v) => {
                const a = appOf(v.appId);
                return (
                  <tr key={v.id} className="border-b border-rule-soft align-top">
                    <td className="w-36 px-2 py-1">{patientOf(a.patientId)!.name}</td>
                    <td className="w-40 px-2 py-1 text-ink-soft">
                      {findPath(a.code)?.name} {v.day}日目
                    </td>
                    <td className={`w-8 px-2 py-1 font-bold ${v.sign === "負" ? "text-shu" : "text-wakatake"}`}>{v.sign}</td>
                    <td className="w-32 px-2 py-1">{v.category}</td>
                    <td className="px-2 py-1">{v.detail}</td>
                    <td className="nums w-40 px-2 py-1 text-right text-[11px] text-ink-faint">
                      {v.by} {fmt(v.at.day)} {v.at.time}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <p className="text-[11px] text-ink-faint">{PATH_RULES.variance}</p>
      </section>
      <p className="text-[11px] text-ink-faint">
        出典（機能）：
        <a href={PATH_SOURCES.spec.url} target="_blank" rel="noreferrer" className="underline">
          {PATH_SOURCES.spec.label}
        </a>
      </p>
    </div>
  );
}
