"use client";

import { useState } from "react";
import { addDays, formatShort, hospitalDay, minutesOf, type CalendarDate } from "@/lib/dates";
import { LINE_RULES, barCell, calendarRows, lineCalendarDays, whenText, type StandingLine } from "@/lib/standing-lines";
import type { Patient } from "@/lib/types";
import { CatChip } from "./panels/StandingLines";
import { DenyNote, useDeny, useMe } from "./RoleContext";

const HEAD_W = 250;
const COL_W = 84;

/**
 * 指示簿カレンダー: one row per line of the 指示簿 (grouped by category), one column per day from admission to
 * three days ahead. A bar runs from the start to the end; an open-ended line continues past the last column;
 * a stopped line ends where it was stopped. Press a bar for the full text, who and when; a doctor can stop
 * the line here (with a confirmation). Lines derived from the 項目で選ぶ fields are shown but stopped there.
 */
export function StandingCalendar({ patient, lines, today, nowTime, onStop, onOpenPanel }: { patient: Patient; lines: StandingLine[]; today: CalendarDate; nowTime: string; onStop?: (id: string, reason: string) => void; onOpenPanel?: () => void }) {
  const me = useMe();
  const deny = useDeny();
  const days = lineCalendarDays(patient.admittedOn);
  const last = days[days.length - 1];
  const groups = calendarRows(lines);
  const [openId, setOpenId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [confirming, setConfirming] = useState(false);
  const open = lines.find((l) => l.id === openId) ?? null;
  const fmtDay = (d: number) => formatShort(addDays(today, d));
  const nowPct = Math.min(100, Math.max(0, (minutesOf(nowTime) / 1440) * 100));
  const choose = (id: string) => {
    setOpenId(id === openId ? null : id);
    setConfirming(false);
    setReason("");
  };
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="scroll-thin min-h-0 flex-1 overflow-auto pb-4">
        <table className="nums border-separate border-spacing-0 text-[12px]" style={{ width: HEAD_W + days.length * COL_W }}>
          <colgroup>
            <col style={{ width: HEAD_W }} />
            {days.map((d) => (
              <col key={d} style={{ width: COL_W }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th className="sticky left-0 top-0 z-20 border-b border-rule bg-sheet px-3 py-1 text-left font-normal text-[11px] text-ink-faint">指示簿カレンダー</th>
              {days.map((d) => (
                <th key={d} className={`sticky top-0 z-10 border-b border-l border-rule bg-sheet px-1 py-1 font-normal ${d === 0 ? "bg-ai-soft" : ""}`}>
                  <div className="flex flex-col items-center">
                    <b className={d === 0 ? "text-ai" : d > 0 ? "text-ink-faint" : ""}>{fmtDay(d)}</b>
                    <span className={`text-[10px] ${d === 0 ? "text-ai" : "text-ink-faint"}`}>{d === 0 ? `今日 ${nowTime}` : d > 0 ? "予定" : `${hospitalDay(patient.admittedOn, d)}日目`}</span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.length === 0 && (
              <tr>
                <td colSpan={days.length + 1} className="px-3 py-6 text-center text-ink-faint">
                  この患者の指示簿はまだありません。
                </td>
              </tr>
            )}
            {groups.map((g) => (
              <GroupRows key={g.cat} cat={g.cat} lines={g.lines} days={days} last={last} openId={openId} onChoose={choose} nowPct={nowPct} />
            ))}
          </tbody>
        </table>
        <p className="mt-2 px-3 text-[10px] text-ink-faint">
          {LINE_RULES.cats}
          <span className="hint"> 色の帯が指示の続く期間です。右端で切れずに続く帯は終了日なし（変えるまで）。「中止」と書かれた所で止まった帯は中止した行（履歴として残ります）。帯を押すと全文・書いた人・時刻が下に出ます。薄い帯は「項目で選ぶ」指示簿の版から出した行で、変えるときはその指示簿を変えます。今日の列の赤い線がいまの時刻。</span>
        </p>
      </div>
      {open && (
        <div role="region" aria-label="選んだ指示" className="border-t border-rule bg-paper px-4 py-2 text-[12px]">
          <div className="flex flex-wrap items-start gap-x-2 gap-y-1">
            <CatChip cat={open.cat} />
            <div className="min-w-0 flex-1">
              <div className={`whitespace-pre-wrap ${open.stop ? "line-through text-ink-soft" : ""}`}>{open.text}</div>
              <div className="nums text-[11px] text-ink-soft">
                {whenText(open.start, fmtDay)}から{open.end ? ` ${whenText(open.end, fmtDay)}まで` : "（変えるまで）"}　書いた人 {open.by}（{fmtDay(open.at.day)} {open.at.time}）
                {open.fromFields && "　項目で選ぶ指示簿から"}
              </div>
              {open.stop && (
                <div className="nums text-[11px] font-bold text-shu">
                  中止 {fmtDay(open.stop.day)} {open.stop.time}　{open.stop.by}
                  {open.stop.reason ? `　理由：${open.stop.reason}` : ""}
                </div>
              )}
            </div>
            <button type="button" onClick={() => choose(open.id)} className="rounded border border-rule px-2 py-0.5 text-[11px] text-ink-soft">
              閉じる
            </button>
          </div>
          {!open.stop && !open.fromFields && onStop && (
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              {confirming ? (
                <>
                  <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="中止の理由（任意）" aria-label="中止の理由" className="min-w-48 flex-1 rounded border border-rule bg-sheet px-1.5 py-0.5" />
                  <button
                    type="button"
                    disabled={!!deny("order")}
                    onClick={() => {
                      onStop(open.id, reason);
                      choose(open.id);
                    }}
                    className="rounded bg-shu px-2 py-0.5 font-bold text-white disabled:opacity-40"
                  >
                    この行を中止する（{me.name} {nowTime}）
                  </button>
                  <button type="button" onClick={() => setConfirming(false)} className="rounded border border-rule px-2 py-0.5 text-ink-soft">
                    やめる
                  </button>
                </>
              ) : (
                <button type="button" disabled={!!deny("order")} onClick={() => setConfirming(true)} className="rounded border border-rule px-2 py-0.5 text-ink-soft hover:border-shu hover:text-shu disabled:opacity-40 pointer-coarse:py-1.5">
                  中止…
                </button>
              )}
              <DenyNote action="order" />
            </div>
          )}
          {open.fromFields && onOpenPanel && (
            <button type="button" onClick={onOpenPanel} className="mt-1.5 rounded border border-ai/50 px-2 py-0.5 text-[11px] font-bold text-ai hover:bg-ai-soft">
              指示簿を開いて変える
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function GroupRows({ cat, lines, days, last, openId, onChoose, nowPct }: { cat: StandingLine["cat"]; lines: StandingLine[]; days: number[]; last: number; openId: string | null; onChoose: (id: string) => void; nowPct: number }) {
  return (
    <>
      <tr>
        <td colSpan={days.length + 1} className="sticky left-0 border-b border-rule bg-paper px-3 pb-0.5 pt-2 text-[11px] font-bold text-ink-soft">
          <CatChip cat={cat} small /> {cat}
        </td>
      </tr>
      {lines.map((l) => {
        const chosen = openId === l.id;
        const tone = l.stop ? "bg-shu-soft/70 text-shu" : l.fromFields ? "bg-tab text-ink-soft" : l.start.day > 0 ? "border border-dashed border-ai/60 bg-sheet text-ai" : "bg-ai-soft text-ai";
        return (
          <tr key={l.id} className={chosen ? "bg-yamabuki-soft/30" : ""}>
            <th scope="row" className="sticky left-0 z-[5] border-b border-rule-soft bg-sheet px-3 py-1 text-left align-top font-normal">
              <button type="button" onClick={() => onChoose(l.id)} aria-expanded={chosen} className={`block w-full truncate text-left hover:text-ai ${l.stop ? "text-ink-faint line-through" : ""}`} title={l.text}>
                {l.text}
              </button>
              <div className="text-[10px] text-ink-faint">
                {l.by}
                {l.stop ? "　中止" : l.end ? "　終了日あり" : ""}
              </div>
            </th>
            {days.map((d) => {
              const c = barCell(l, d, last);
              return (
                <td key={d} className={`relative border-b border-l border-rule-soft p-0 align-middle ${d === 0 ? "bg-ai-soft/30" : d > 0 ? "bg-paper/50" : ""}`}>
                  {c.on && (
                    <button
                      type="button"
                      onClick={() => onChoose(l.id)}
                      aria-label={`${l.text}　${c.label || (c.first ? "開始" : c.continues ? "続く" : "")}`}
                      className={`my-1.5 block h-5 w-full truncate px-1 text-left text-[10px] leading-5 ${tone} ${c.first ? "rounded-l" : ""} ${c.last ? "rounded-r" : ""}`}
                    >
                      {c.label}
                      {c.continues && !c.label ? "→" : ""}
                    </button>
                  )}
                  {d === 0 && <span aria-hidden className="pointer-events-none absolute inset-y-0 w-px bg-shu" style={{ left: `${nowPct}%` }} />}
                </td>
              );
            })}
          </tr>
        );
      })}
    </>
  );
}
