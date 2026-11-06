"use client";

import { Bandage } from "lucide-react";
import { useState } from "react";
import { designText, siteLabel, wardUlcerRows, type PressureUlcer } from "@/lib/pressure-course";
import { Sources } from "./panels/PressurePanel";
import { PickSelect, type Pick } from "./WardMap";

const STATE_STYLE = { 期限切れ: "bg-shu-soft text-shu", 今日まで: "bg-yamabuki-soft text-yamabuki", 期限内: "text-ink-soft", 治癒: "bg-wakatake-soft text-wakatake" } as const;

/**
 * 褥瘡のある患者（病棟）: every patient of the floor with a pressure injury, the latest DESIGN-R®2020 and its
 * change, and when the next assessment is due, from the record. Pressing a name opens the chart's 褥瘡の経過.
 */
export function UlcerBoard({ pick, ulcers, where, fmtDay, onOpen }: { pick: Pick; ulcers: PressureUlcer[]; where: (patientId: string) => { name: string; room: string } | undefined; fmtDay: (d: number) => string; onOpen: (patientId: string) => void }) {
  const [healed, setHealed] = useState(false);
  const rows = wardUlcerRows(ulcers, where, { healed });
  const open = rows.filter((r) => !r.ulcer.healed);
  const due = open.filter((r) => r.due.state !== "期限内").length;
  return (
    <section aria-label="褥瘡のある患者" className="scroll-thin min-h-0 flex-1 overflow-auto bg-paper p-5">
      <header className="mb-2 flex flex-wrap items-center gap-3">
        <h1 className="flex items-center gap-1.5 text-lg font-bold">
          <Bandage size={18} />
          褥瘡のある患者
        </h1>
        <PickSelect pick={pick} />
        <span className="nums text-sm text-ink-soft">
          {new Set(open.map((r) => r.ulcer.patientId)).size}人・{open.length}か所{due > 0 && <b className="ml-2 text-shu">評価の期限が今日まで・過ぎた {due}か所</b>}
        </span>
        <label className="flex cursor-pointer items-center gap-1 text-xs text-ink-soft">
          <input type="checkbox" checked={healed} onChange={() => setHealed(!healed)} className="accent-ai" />
          治癒したものも出す
        </label>
      </header>
      <p className="hint mb-2 text-xs text-ink-soft">各患者の「褥瘡の経過」（カルテの右端の看護）の記録から、コードで並べています。名前を押すとカルテの褥瘡の経過が開きます。</p>
      {rows.length === 0 ? (
        <p className="rounded-lg border border-rule bg-sheet p-4 text-sm text-ink-soft">この階に褥瘡のある患者はいません（記録の上で）。</p>
      ) : (
        <table className="nums w-full border-collapse rounded-lg bg-sheet text-[12px]">
          <thead>
            <tr className="border-b border-rule text-left text-ink-soft">
              <th className="px-2 py-1.5">患者</th>
              <th className="px-2">部位</th>
              <th className="px-2">発生</th>
              <th className="px-2">最新の DESIGN-R®2020</th>
              <th className="px-2 text-right">合計</th>
              <th className="px-2">前回から</th>
              <th className="px-2">写真</th>
              <th className="px-2">次の評価</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.ulcer.id} className="border-b border-rule-soft align-top">
                <td className="px-2 py-1.5">
                  <button type="button" onClick={() => onOpen(r.ulcer.patientId)} className="text-left font-bold text-ai underline-offset-2 hover:underline">
                    {r.room} {r.name}
                  </button>
                </td>
                <td className="px-2">{siteLabel(r.ulcer)}</td>
                <td className="px-2">
                  {r.ulcer.origin}
                  <div className="text-[11px] text-ink-faint">{fmtDay(r.ulcer.foundOn)}</div>
                </td>
                <td className="px-2 font-bold">{r.latest ? designText(r.latest.score) : <span className="font-normal text-yamabuki">評価がまだ</span>}</td>
                <td className="px-2 text-right font-bold">{r.total ?? "—"}</td>
                <td className="px-2">{r.change === undefined ? "—" : r.change === 0 ? "変わらず" : r.change < 0 ? <span className="text-wakatake">▼{-r.change}点</span> : <span className="text-shu">▲{r.change}点</span>}</td>
                <td className="px-2">
                  {r.latest?.photo ? (
                    // eslint-disable-next-line @next/next/no-img-element -- a data URL kept in the record
                    <img src={r.latest.photo.dataUrl} alt={r.latest.photo.sample ? "見本（図形）" : "取り込んだ写真"} width={44} height={Math.round((44 * r.latest.photo.height) / r.latest.photo.width)} className="rounded border border-rule" />
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-2">
                  <span className={`rounded px-1.5 py-0.5 font-bold ${STATE_STYLE[r.due.state]}`}>{r.due.state === "治癒" ? "治癒" : `${fmtDay(r.due.dueOn)}（${r.due.state}）`}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="mt-2 text-[11px] text-ink-faint">合計点は深さを除いた6項目の点数の和で、小さいほど軽い状態です。写真は記録に入れた縮小画像で、このデモの写真は図形で描いた見本です。</p>
      <div className="mt-2">
        <Sources />
      </div>
    </section>
  );
}
