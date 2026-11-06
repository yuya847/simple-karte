"use client";

import { displayText } from "@/lib/display-text";
import { ClipboardX } from "lucide-react";
import { useState } from "react";
import { UNDONE_SOURCE, UNDONE_WINDOW, lateText, type GapRow, type UndoneRow } from "@/lib/undone";
import type { WorkKind } from "@/lib/worksheet";

const KINDS: WorkKind[] = ["注射", "内服", "処置", "採血", "検査"];
const th = "border-b border-rule px-2 py-1 text-left text-[11px] font-normal text-ink-faint";
const td = "border-b border-rule-soft px-2 py-1 align-top";

/**
 * 未実施の一覧: what the ward has not recorded past its time (実施漏れ), and the 実施・未実施 records the
 * billing calculation reads differently (算定と記録の食い違い). Gathered by code; people decide.
 */
export function UndoneView({ rows, gaps, clock, forBilling, onOpen, onSheet, onBilling }: { rows: UndoneRow[]; gaps: GapRow[]; clock: (at: number) => string; forBilling: boolean; onOpen: (pid: string) => void; onSheet?: () => void; onBilling?: (pid: string) => void }) {
  const [kind, setKind] = useState<WorkKind | "all">("all");
  const shown = rows.filter((r) => kind === "all" || r.kind === kind);
  return (
    <div className="scroll-thin min-h-0 flex-1 space-y-4 overflow-y-auto p-4 text-[13px]">
      <header className="flex flex-wrap items-center gap-2">
        <h2 className="flex items-center gap-1.5 text-base font-bold">
          <ClipboardX size={18} />
          未実施の一覧（実施漏れ・算定漏れ）
        </h2>
        <span className="text-xs text-ink-soft">受け持ちのチームの患者・この画面を開いてからの予定</span>
      </header>

      <section aria-label="実施の記録がないもの" className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-bold">実施の記録がないもの（実施漏れ）</h3>
          <span className="rounded bg-shu-soft px-1.5 text-xs font-bold text-shu">{rows.length}件</span>
          <div role="tablist" className="ml-2 flex rounded-md border border-rule p-0.5 text-xs">
            {(["all", ...KINDS] as const).map((k) => (
              <button key={k} role="tab" type="button" aria-selected={kind === k} onClick={() => setKind(k)} className={`rounded px-2 py-0.5 ${kind === k ? "bg-ink font-bold text-white" : "text-ink-soft"}`}>
                {k === "all" ? "すべて" : k}
                {k !== "all" && rows.some((r) => r.kind === k) ? ` ${rows.filter((r) => r.kind === k).length}` : ""}
              </button>
            ))}
          </div>
          {onSheet && (
            <button type="button" onClick={onSheet} className="ml-auto rounded-md border border-ai px-2 py-0.5 text-xs font-bold text-ai">
              ワークシートで記録する
            </button>
          )}
        </div>
        <p className="text-[11px] text-ink-faint">
          {UNDONE_WINDOW}。<span className="hint">実施か未実施（理由つき）をワークシートの「照合」で記録すると消えます。</span>
        </p>
        {forBilling && <p className="text-[11px] text-yamabuki">算定の計算は、時刻を過ぎた注射・処置を実施として数えます（未実施と記録された注射の回は数えません）。ここにある注射・処置は、記録のないまま算定に入っています。</p>}
        {shown.length === 0 ? (
          <p className="rounded-md border border-rule bg-paper px-3 py-2 text-wakatake">記録がないまま時刻を過ぎたものはありません。</p>
        ) : (
          <table className="w-full border-collapse rounded-md border border-rule bg-sheet">
            <thead>
              <tr>
                <th className={th}>予定</th>
                <th className={th}>患者</th>
                <th className={th}>種類</th>
                <th className={th}>内容</th>
                <th className={th}>過ぎた時間</th>
                <th className={th} />
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={`${r.orderId}|${r.at}`}>
                  <td className={`${td} nums w-24`}>{clock(r.at)}</td>
                  <td className={`${td} w-36`}>
                    {r.room}　{r.name}
                  </td>
                  <td className={`${td} w-12`}>{r.kind}</td>
                  <td className={td}>
                    <b>{r.main}</b>
                    <span className="ml-1 text-ink-soft">{displayText(r.detail)}</span>
                  </td>
                  <td className={`${td} nums w-24 font-bold text-shu`}>{displayText(lateText(r.lateMin))}</td>
                  <td className={`${td} w-24 text-right`}>
                    <button type="button" onClick={() => onOpen(r.patientId)} className="text-xs text-ai underline">
                      カルテを開く
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section aria-label="算定と記録が合わないもの" className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-bold">算定と実施の記録が合わないもの（算定漏れの候補）</h3>
          <span className="rounded bg-yamabuki-soft px-1.5 text-xs font-bold text-yamabuki">{gaps.length}件</span>
        </div>
        <p className="text-[11px] text-ink-faint">病棟の処置（創傷処置・褥瘡処置・喀痰吸引・摘便・浣腸）の実施・未実施の記録と、算定の計算が数える回をコードで比べました。直すかどうかは医事課と病棟で決めます。</p>
        {gaps.length === 0 ? (
          <p className="rounded-md border border-rule bg-paper px-3 py-2 text-wakatake">食い違いはありません。</p>
        ) : (
          <table className="w-full border-collapse rounded-md border border-rule bg-sheet">
            <thead>
              <tr>
                <th className={th}>記録の時刻</th>
                <th className={th}>患者</th>
                <th className={th}>処置</th>
                <th className={th}>食い違い</th>
                <th className={th} />
              </tr>
            </thead>
            <tbody>
              {gaps.map((g) => (
                <tr key={`${g.orderId}|${g.at}`}>
                  <td className={`${td} nums w-24`}>{clock(g.at)}</td>
                  <td className={`${td} w-36`}>
                    {g.room}　{g.name}
                  </td>
                  <td className={`${td} w-28`}>
                    <b>{g.main}</b>
                    <div className="text-[11px] text-ink-faint">記録：{displayText(g.by)}</div>
                  </td>
                  <td className={td}>
                    <b className={g.kind === "実施したが算定に入らない" ? "text-shu" : "text-yamabuki"}>{g.kind}</b>
                    <div className="text-[11px] text-ink-soft">{g.why}</div>
                  </td>
                  <td className={`${td} w-28 text-right`}>
                    {onBilling ? (
                      <button type="button" onClick={() => onBilling(g.patientId)} className="text-xs text-ai underline">
                        算定を開く
                      </button>
                    ) : (
                      <button type="button" onClick={() => onOpen(g.patientId)} className="text-xs text-ai underline">
                        カルテを開く
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      <p className="hint text-[11px] text-ink-faint">
        出典：
        <a href={UNDONE_SOURCE.url} target="_blank" rel="noreferrer" className="underline">
          {UNDONE_SOURCE.label}
        </a>
      </p>
    </div>
  );
}
