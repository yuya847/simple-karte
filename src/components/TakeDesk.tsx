"use client";

import { ExternalLink, Printer } from "lucide-react";
import { useState } from "react";
import type { CalendarDate } from "@/lib/dates";
import { abs } from "@/lib/flowsheet";
import { CONFIRM_SOURCES, TAKE_SORTS, elapsedLabel, groupByPatient, slipLines, sortTakeList, takeLate, takenInSession, unconfirmed, type Confirms, type TakeSort } from "@/lib/order-confirm";
import type { TakeHold, TakeRow } from "@/lib/order-take";
import { WARD_NAME } from "@/lib/ward";
import type { WorkPatient } from "@/lib/worksheet";
import { Sources, usePrintSheet } from "./DeskParts";
import { OrderSlipPrint } from "./OrderSlipPrint";
import { useMe } from "./RoleContext";
import { TakeTable } from "./TakeTable";

interface Props {
  people: WorkPatient[];
  /** All 指示受け rows of the ward (the same rows the worksheet shows). */
  rows: TakeRow[];
  taken: Record<string, string>;
  isTaken: (r: TakeRow) => boolean;
  holds: Record<string, TakeHold>;
  confirms: Confirms;
  nurses: string[];
  today: CalendarDate;
  nowTime: string;
  onTake: (keys: string[], second?: string) => void;
  onHold: (key: string, reason: TakeHold["reason"], note: string) => void;
  onConfirm: (key: string) => void;
  /** Whether a room (bed) is this nurse's in the shift's 業務分担 (or the ward's fixed teams when none is set). */
  isMine: (room: string) => boolean;
  onOpen: (patientId: string) => void;
  onSheet: () => void;
}

/**
 * 指示受け, the ward screen: every change not yet taken (new, changed, stopped orders, 指示簿 and meal changes)
 * of the ward's patients, grouped by patient and sorted by time or urgency, taken with the same rules as the
 * worksheet (one at a time for 至急・高リスク薬・口頭指示・変更, a second nurse for high-risk drugs, 医師に確認 to
 * hold); after taking, the schedule the change makes opens for 指示確認. What was taken today is listed with
 * who and when; the day's 指示票 of a patient prints on A4.
 */
export function TakeDesk({ people, rows, taken, isTaken, holds, confirms, nurses, today, nowTime, onTake, onHold, onConfirm, isMine, onOpen, onSheet }: Props) {
  const me = useMe();
  const [sort, setSort] = useState<TakeSort>("time");
  const [mineOnly, setMineOnly] = useState(false);
  const [print, printSheet] = usePrintSheet();
  const nowAbs = abs(0, nowTime);
  const ctx = { taken, isTaken, holds, confirms };
  const shown = mineOnly ? rows.filter((r) => isMine(r.room)) : rows;
  const waiting = sortTakeList(
    shown.filter((r) => !isTaken(r)),
    sort,
  );
  const held = waiting.filter((r) => holds[r.key] && !holds[r.key].answer);
  const late = waiting.filter((r) => takeLate(r, nowAbs) && !(holds[r.key] && !holds[r.key].answer));
  const bulk = waiting.filter((r) => r.mustOne.length === 0 && !(holds[r.key] && !holds[r.key].answer));
  const done = takenInSession(shown, taken);
  const notConfirmed = unconfirmed(shown, ctx);
  const confirm = { confirms, onConfirm, people, nowAbs };
  const printSlip = (g: { patientId: string; room: string; name: string }) => print(<OrderSlipPrint ward={WARD_NAME} patient={{ id: g.patientId, name: g.name, room: g.room }} day={0} today={today} nowTime={nowTime} by={me.name} lines={slipLines(rows, g.patientId, 0, ctx)} />, { portrait: true });
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-rule bg-sheet px-5 py-2 text-sm">
        <h1 className="text-base font-bold">指示受け</h1>
        <div role="radiogroup" aria-label="並べ方" className="flex rounded-md border border-rule p-0.5">
          {TAKE_SORTS.map((s) => (
            <button key={s.key} type="button" role="radio" aria-checked={sort === s.key} onClick={() => setSort(s.key)} className={`whitespace-nowrap rounded px-2.5 py-0.5 text-xs ${sort === s.key ? "bg-ink font-bold text-white" : "text-ink-soft hover:text-ink"}`}>
              {s.label}
            </button>
          ))}
        </div>
        <label className="flex cursor-pointer items-center gap-1 text-xs">
          <input type="checkbox" className="accent-ai" checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} />
          自分の受け持ちだけ
        </label>
        <span className={`rounded px-2 py-0.5 text-xs font-bold ${waiting.length ? "bg-yamabuki-soft text-yamabuki" : "bg-wakatake-soft text-wakatake"}`}>未指示受け {waiting.length}件</span>
        {late.length > 0 && <span className="rounded bg-shu px-2 py-0.5 text-xs font-bold text-white">遅れ {late.length}件</span>}
        {held.length > 0 && <span className="rounded bg-tab px-2 py-0.5 text-xs font-bold text-ink">医師に確認中 {held.length}件</span>}
        {notConfirmed.length > 0 && <span className="rounded bg-yamabuki-soft px-2 py-0.5 text-xs font-bold text-yamabuki">受けたが予定の確認がまだ {notConfirmed.length}件</span>}
        {waiting.length > 0 && (
          <button type="button" disabled={!bulk.length} onClick={() => onTake(bulk.flatMap((r) => r.keys))} title="至急・高リスク薬・口頭指示・変更などは除いて、1件ずつ受けます" className="rounded border border-yamabuki px-2 py-0.5 text-xs font-bold text-yamabuki hover:bg-yamabuki hover:text-white disabled:opacity-40">
            まとめて受ける（{bulk.length}件{waiting.length - bulk.length > 0 ? `・1件ずつのもの ${waiting.length - bulk.length}件は除く` : ""}）
          </button>
        )}
        <button type="button" onClick={onSheet} className="ml-auto flex items-center gap-1 text-xs text-ai underline">
          <ExternalLink size={12} />
          ワークシートへ（実施入力）
        </button>
      </div>
      <div className="scroll-thin min-h-0 flex-1 overflow-auto bg-paper p-5">
        <div className="mx-auto max-w-[1100px] space-y-5">
          <p className="hint text-[11px] text-ink-soft">
            新しい指示・変更・中止は、まずここで「指示を受ける」（誰が・いつ）。受けると、その指示が今日と明日に作る予定（時刻・回数・量）が下に開くので、見てから「予定を確認した」を押します。それから実施入力（ワークシート・経過表）に進みます。至急・高リスク薬・口頭指示・変更は1件ずつ、まとめて受けられません。気になるときは「医師に確認」で受けないまま医師に送れます。
          </p>

          <section className="rounded-lg border border-rule bg-sheet p-4">
            <h2 className="mb-2 border-l-4 border-yamabuki pl-2 text-[13px] font-bold">
              未指示受け（まだ受けていない指示）　{waiting.length}件{mineOnly ? "　自分の受け持ちだけ" : ""}
            </h2>
            {waiting.length === 0 ? (
              <p className="px-1.5 py-1 text-[12px] text-ink-faint">まだ受けていない指示はありません。</p>
            ) : (
              <div className="space-y-4">
                {groupByPatient(waiting).map((g) => {
                  const oldest = Math.min(...g.rows.map((r) => r.at));
                  const gLate = g.rows.some((r) => takeLate(r, nowAbs) && !(holds[r.key] && !holds[r.key].answer));
                  return (
                    <div key={g.patientId} className="rounded-md border border-rule-soft">
                      <div className="flex flex-wrap items-center gap-2 border-b border-rule-soft bg-paper px-2 py-1 text-[12px]">
                        <b className="text-[13px]">
                          {g.room}　{g.name}
                        </b>
                        {isMine(g.room) && <span className="rounded bg-ai-soft px-1 text-[10px] font-bold text-ai">受け持ち</span>}
                        <span className="text-ink-soft">{g.rows.length}件</span>
                        <span className={`nums ${gLate ? "font-bold text-shu" : "text-ink-soft"}`}>
                          いちばん古い指示から {elapsedLabel(nowAbs - oldest)}
                          {gLate ? "（遅れ）" : ""}
                        </span>
                        {g.rows.some((r) => r.flags.urgent) && <span className="rounded bg-shu px-1 text-[10px] font-bold text-white">至急あり</span>}
                        <button type="button" onClick={() => onOpen(g.patientId)} className="ml-auto text-[11px] text-ai underline">
                          カルテを開く
                        </button>
                        <button type="button" onClick={() => printSlip(g)} className="flex items-center gap-1 rounded border border-ai/50 px-2 py-0.5 text-[11px] font-bold text-ai hover:bg-ai-soft">
                          <Printer size={12} />
                          指示票（今日・A4）
                        </button>
                      </div>
                      <div className="px-2 pb-1 text-[12px]">
                        <TakeTable rows={g.rows} taken={taken} isTaken={isTaken} holds={holds} interactive day={0} today={today} nurses={nurses} onTake={onTake} onHold={onHold} confirm={confirm} showPatient={false} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section className="rounded-lg border border-rule bg-sheet p-4">
            <h2 className="mb-2 border-l-4 border-wakatake pl-2 text-[13px] font-bold">
              今日の指示受け済み　{done.length}件{notConfirmed.length ? `（予定の確認がまだ ${notConfirmed.length}件）` : ""}
            </h2>
            {done.length === 0 ? (
              <p className="px-1.5 py-1 text-[12px] text-ink-faint">この端末で今日受けた指示はまだありません。この画面を開く前の指示は、前の勤務帯が受けたものとして扱います（架空）。</p>
            ) : (
              <div className="space-y-4">
                {groupByPatient(done).map((g) => (
                  <div key={g.patientId} className="rounded-md border border-rule-soft">
                    <div className="flex flex-wrap items-center gap-2 border-b border-rule-soft bg-paper px-2 py-1 text-[12px]">
                      <b className="text-[13px]">
                        {g.room}　{g.name}
                      </b>
                      <span className="text-ink-soft">{g.rows.length}件</span>
                      <button type="button" onClick={() => onOpen(g.patientId)} className="ml-auto text-[11px] text-ai underline">
                        カルテを開く
                      </button>
                      <button type="button" onClick={() => printSlip(g)} className="flex items-center gap-1 rounded border border-ai/50 px-2 py-0.5 text-[11px] font-bold text-ai hover:bg-ai-soft">
                        <Printer size={12} />
                        指示票（今日・A4）
                      </button>
                    </div>
                    <div className="px-2 pb-1 text-[12px]">
                      <TakeTable rows={g.rows} taken={taken} isTaken={isTaken} holds={holds} interactive day={0} today={today} nurses={nurses} onTake={onTake} onHold={onHold} confirm={confirm} showPatient={false} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <div className="space-y-1 text-[11px] text-ink-faint">
            <p>
              指示受け → 指示確認 → 実施入力の流れと、未指示受けの一覧・患者ごとのまとめ・並べ替え・指示票は、公開されている電子カルテのカタログと病院の調達仕様の要件に合わせています。遅れの目安（至急 15分・ほかは 60分）、「自分の受け持ち」の決め方（その勤務帯の業務分担、なければ病棟の固定チーム）、今日と明日の予定を見ることは架空の病院の取り決めです。オーダからコードで集めています（AI は使っていません）。
            </p>
            <Sources items={CONFIRM_SOURCES} />
          </div>
        </div>
      </div>
      {printSheet}
    </div>
  );
}
