"use client";

import { displayText } from "@/lib/display-text";
import { BedDouble } from "lucide-react";
import { useState } from "react";
import { CHART_WARDS, type AdmissionRequest } from "@/lib/admission";
import { bedsFor, floorCounts, NEEDS_PRIVATE, type PlannedMove } from "@/lib/bed-control";
import { ageSex } from "@/lib/person";
import type { Sex } from "@/lib/types";
import type { BedAssignment, Floor } from "@/lib/ward";
import { useDeny } from "./RoleContext";

export interface MoveLine {
  day: number;
  time: string | null;
  who: string;
  what: string;
}

/**
 * ベッドコントロール: all floors' beds, today's and tomorrow's admissions and discharges, and the waiting
 * 入院申込 with the empty beds that fit each (sex, 個室, 感染対策). Code counts and filters; a person chooses.
 */
export function BedControlView({ floors, beds, patient, plans, requests, moves, fmtDay, onAccept }: { floors: Floor[]; beds: BedAssignment[]; patient: (id: string) => { sex: Sex } | undefined; plans: PlannedMove[]; requests: AdmissionRequest[]; moves: MoveLine[]; fmtDay: (d: number) => string; onAccept: (r: AdmissionRequest, bed: { room: string; bed: string }) => void }) {
  const deny = useDeny()("bed.assign");
  const [open, setOpen] = useState<string | null>(null);
  const counts = floorCounts(floors, beds, patient, plans);
  const allEmpty = counts.flatMap((c) => c.empty);
  const waiting = requests.filter((r) => r.status === "申込").sort((a, b) => (a.urgency === b.urgency ? a.when.day - b.when.day : a.urgency === "緊急" ? -1 : 1));
  const th = "px-2 py-1 text-left font-normal text-ink-soft";
  return (
    <section aria-label="ベッドコントロール" className="scroll-thin min-h-0 flex-1 overflow-auto bg-paper p-5 text-[13px]">
      <h1 className="mb-1 flex items-center gap-1.5 text-lg font-bold">
        <BedDouble size={18} />
        ベッドコントロール
      </h1>
      <p className="mb-3 text-xs text-ink-soft">全病棟のベッド。空床と、今日・明日の入院と退院の予定から、明日の朝の空床の見込みをコードで数えます。入院申込には、合うベッド（性別・個室の希望・感染対策）を理由つきで並べます。決めるのは人です。</p>

      <table className="nums mb-4 w-full rounded-lg bg-sheet">
        <thead>
          <tr className="border-b border-rule">
            <th className={th}>病棟</th>
            <th className={th}>定床</th>
            <th className={th}>在院</th>
            <th className={th}>空床（個室・男性の部屋・女性の部屋・空室）</th>
            <th className={th}>今日 入院／退院</th>
            <th className={th}>明日 入院／退院</th>
            <th className={th}>明日の朝の空床（見込み）</th>
          </tr>
        </thead>
        <tbody>
          {counts.map((c) => {
            const priv = c.empty.filter((e) => e.room.kind === "個室").length;
            const m = c.empty.filter((e) => e.room.kind === "4床室" && e.roomSex === "男").length;
            const w = c.empty.filter((e) => e.room.kind === "4床室" && e.roomSex === "女").length;
            const free = c.empty.filter((e) => e.room.kind === "4床室" && !e.roomSex).length;
            return (
              <tr key={c.floor} className="border-b border-rule-soft">
                <td className="px-2 py-1.5 font-bold">{c.floor}</td>
                <td className="px-2">{c.beds}</td>
                <td className="px-2">{c.occupied}</td>
                <td className="px-2">
                  <b className="text-base">{c.empty.length}</b>
                  <span className="ml-2 text-xs text-ink-soft">
                    個室 {priv}・男 {m}・女 {w}・空室 {free}
                  </span>
                </td>
                <td className="px-2">
                  {c.admit[0]}／{c.discharge[0]}
                </td>
                <td className="px-2">
                  {c.admit[1]}／{c.discharge[1]}
                </td>
                <td className={`px-2 font-bold ${c.tomorrowEmpty <= 1 ? "text-shu" : ""}`}>{c.tomorrowEmpty}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="-mt-3 mb-4 text-[11px] text-ink-faint">明日の朝の空床 ＝ いまの空床 ＋ 今日の退院 − 今日の入院（申込・予定のうちまだベッドに入っていないもの）。</p>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="space-y-2">
          <h2 className="font-bold">入院申込（ベッド待ち {waiting.length}件）</h2>
          {waiting.length === 0 && <p className="text-ink-faint">待っている入院申込はありません。</p>}
          {waiting.map((r) => {
            const fits = bedsFor(r, allEmpty);
            const canChart = CHART_WARDS.includes(r.ward);
            return (
              <article key={r.id} className="rounded-md border border-rule bg-sheet p-2">
                <div className="nums flex flex-wrap items-baseline gap-x-3">
                  <span className={`rounded px-1.5 font-bold ${r.urgency === "緊急" ? "bg-shu-soft text-shu" : "bg-paper text-ink-soft"}`}>{r.urgency}</span>
                  <b>{r.name}</b>
                  <span>{ageSex(r)}</span>
                  <span>
                    {fmtDay(r.when.day)} {r.when.time ?? ""}
                  </span>
                  <span>希望：{r.ward}・{r.roomWish}</span>
                  <span className={r.isolation === "なし" ? "text-ink-soft" : "font-bold text-shu"}>{r.isolation === "なし" ? "感染対策なし" : r.isolation}</span>
                </div>
                <div className="text-xs text-ink-soft">
                  {r.diagnosis}（{r.department}・{r.attending}）
                  {NEEDS_PRIVATE.includes(r.isolation) && (
                    <>
                      　→ 個室が要る
                    </>
                  )}
                </div>
                <button type="button" onClick={() => setOpen(open === r.id ? null : r.id)} className="mt-1 rounded border border-ai px-2 py-0.5 text-xs text-ai">
                  合うベッド（{fits.length}）を見る
                </button>
                {open === r.id && (
                  <ul className="mt-1 max-h-56 space-y-0.5 overflow-auto text-xs">
                    {fits.length === 0 && <li className="font-bold text-shu">合う空床がありません（個室の空き・性別の部屋を確かめる、転床で空ける、など）。</li>}
                    {fits.map((f) => {
                      const here = f.bed.floor === r.ward && canChart;
                      return (
                        <li key={`${f.bed.room.no}${f.bed.bed}`} className="flex flex-wrap items-center gap-2 border-b border-rule-soft py-0.5">
                          <b className="nums w-28">
                            {f.bed.floor.replace("病棟", "")} {displayText(f.bed.room.no)}
                            {f.bed.bed}
                          </b>
                          <span>{f.why}</span>
                          {f.note && <span className="text-yamabuki">{displayText(f.note)}</span>}
                          {here ? (
                            <button type="button" disabled={!!deny} onClick={() => onAccept(r, { room: f.bed.room.no, bed: f.bed.bed })} className="ml-auto rounded bg-ai px-2 py-0.5 font-bold text-white disabled:opacity-40">
                              このベッドで入院にする
                            </button>
                          ) : (
                            <span className="ml-auto text-ink-faint">{f.bed.floor === r.ward ? "カルテのない病棟" : "希望の病棟と違う（病棟の希望を変えてから）"}</span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </article>
            );
          })}
        </div>
        <div className="space-y-2">
          <h2 className="font-bold">今日と明日の入退院・移動</h2>
          {moves.length === 0 ? (
            <p className="text-ink-faint">予定はありません。</p>
          ) : (
            <ul className="space-y-0.5 text-xs">
              {moves.map((m, i) => (
                <li key={i} className="nums border-b border-rule-soft py-0.5">
                  <b>
                    {fmtDay(m.day)} {m.time ?? ""}
                  </b>
                  　{m.who}　{m.what}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
