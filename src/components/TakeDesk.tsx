"use client";

import { Check, ExternalLink, MessageCircleQuestion, Printer } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { CalendarDate } from "@/lib/dates";
import { abs } from "@/lib/flowsheet";
import type { AdminRecord } from "@/lib/mar";
import { TAKE_SOURCES } from "@/lib/order-take";
import { CONFIRM_SOURCES, TAKE_SORTS, confirmPlan, elapsedLabel, groupByPatient, slipLines, sortTakeList, takeLate, unconfirmed, type Confirms, type TakeSort } from "@/lib/order-confirm";
import { DONE_BAND_MS, EMPTY_STAMP, SHEET_CATEGORIES, TAKE_DAYS, categoryOfTake, doneBandText, doneStampOf, entryOfRow, momentLabel, sheetTitle, splitStamp, startLabel, takeFields, takeRowOnDay, type SheetCategory, type Stamp } from "@/lib/order-sheet";
import type { TakeHold, TakeRow } from "@/lib/order-take";
import { WARD_NAME } from "@/lib/ward";
import type { WorkPatient } from "@/lib/worksheet";
import { Sources, usePrintSheet } from "./DeskParts";
import { OrderSlipPrint } from "./OrderSlipPrint";
import { PatientBand, SheetBand, SheetBlock, SheetNotes } from "./OrderSheet";
import { useMe } from "./RoleContext";
import { TakeConfirm } from "./TakeConfirm";
import { AskDoctorPanel, FLAG_STYLE, TakeOnePanel } from "./TakeTable";

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
  /** 実施入力 (the screen next to this one). */
  onExecute?: () => void;
  /** 与薬・実施の記録, to fill 実施日時／実施者 of each order. */
  records?: Record<string, AdminRecord>;
}

const KIND_TAG: Record<TakeRow["kind"], { text: string; tone: "ai" | "shu" | "yamabuki" | "wakatake" | "ink" }> = {
  新規: { text: "新規", tone: "ai" },
  中止: { text: "中止", tone: "shu" },
  変更: { text: "【変】", tone: "yamabuki" },
  延長: { text: "延長", tone: "ink" },
  食事: { text: "食事", tone: "ink" },
  指示簿: { text: "指示簿", tone: "ink" },
};

/**
 * 指示受け, the ward screen in the catalog's form: a date to move through (yesterday … tomorrow), the kinds
 * to show, 全チェック・全チェック解除・一括受け, a band per patient, and each change as a block with its
 * heading, the three 「日時／者」 pairs and 「項目名：値」 lines. The rules are the worksheet's: 至急・高リスク薬・
 * 口頭指示・変更 one at a time (a second nurse for a high-risk drug), 医師に確認 to hold; after taking, the
 * schedule the change makes opens for 指示確認. The day's 指示票 of a patient prints on A4.
 */
export function TakeDesk({ people, rows, taken, isTaken, holds, confirms, nurses, today, nowTime, onTake, onHold, onConfirm, isMine, onOpen, onSheet, onExecute, records = {} }: Props) {
  const me = useMe();
  const [day, setDay] = useState(0);
  const [showTaken, setShowTaken] = useState(false);
  const [cats, setCats] = useState<SheetCategory[]>(SHEET_CATEGORIES);
  const [sort, setSort] = useState<TakeSort>("time");
  const [mineOnly, setMineOnly] = useState(false);
  const [checked, setChecked] = useState<Set<string>>(() => new Set());
  const [open, setOpen] = useState<{ key: string; what: "one" | "ask" | "confirm" } | null>(null);
  // 手応え: the row just taken or confirmed keeps a green band 「受けました／確認しました（hh:mm 誰）」 for a few
  // seconds (a confirmed row stays in the list that long, then folds away into 指示受け済み).
  const [done, setDone] = useState<Record<string, string>>({});
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const mark = (keys: string[], what: "take" | "confirm") => {
    const text = doneBandText(what, nowTime, me.name);
    setDone((d) => ({ ...d, ...Object.fromEntries(keys.map((k) => [k, text])) }));
    timers.current.push(
      setTimeout(() => {
        setDone((d) => {
          const n = { ...d };
          for (const k of keys) delete n[k];
          return n;
        });
      }, DONE_BAND_MS),
    );
  };
  const [print, printSheet] = usePrintSheet();
  const nowAbs = abs(0, nowTime);
  const ctx = { taken, isTaken, holds, confirms };
  const entryOf = (r: TakeRow) => entryOfRow(r, people);
  const holding = (r: TakeRow) => !!holds[r.key] && !holds[r.key].answer && !isTaken(r);
  const takenHere = (r: TakeRow) => r.keys.every((k) => !!taken[k]);

  // The rows of the day shown (given or starting that day), of my patients, of the kinds ticked.
  const onDay = rows.filter((r) => takeRowOnDay(r, day, entryOf(r)));
  const shown = onDay.filter((r) => (!mineOnly || isMine(r.room)) && cats.includes(categoryOfTake(r, entryOf(r))));
  const waiting = sortTakeList(shown.filter((r) => !isTaken(r)), sort);
  const takenShown = shown.filter((r) => isTaken(r));
  const notConfirmed = unconfirmed(shown, ctx);
  // Taken in this session but the schedule not looked at yet stays in the list until confirmed; a row confirmed
  // a moment ago stays while its band shows.
  const justDone = shown.filter((r) => done[r.key] && isTaken(r) && !!confirms[r.key]);
  const list = [...sortTakeList(showTaken ? shown : [...waiting, ...notConfirmed, ...justDone], sort)].sort((a, b) => Number(isTaken(a)) - Number(isTaken(b)));
  const held = waiting.filter(holding);
  const late = waiting.filter((r) => takeLate(r, nowAbs) && !holding(r));
  const otherDays = rows.filter((r) => !isTaken(r) && !takeRowOnDay(r, day, entryOf(r))).length;
  // 一括受け: the ticked rows that may be taken in bulk (not one-at-a-time ones, not held).
  const bulkable = waiting.filter((r) => r.mustOne.length === 0 && !holding(r));
  const bulk = bulkable.filter((r) => checked.has(r.key));
  const take = (r: TakeRow, second?: string) => {
    onTake(r.keys, second);
    mark([r.key], "take");
    setChecked((s) => {
      const n = new Set(s);
      n.delete(r.key);
      return n;
    });
    setOpen({ key: r.key, what: "confirm" });
  };
  const takeBulk = () => {
    onTake(bulk.flatMap((r) => r.keys));
    mark(bulk.map((r) => r.key), "take");
    setChecked(new Set());
    setOpen(null);
  };
  const printSlip = (g: { patientId: string; room: string; name: string }) => print(<OrderSlipPrint ward={WARD_NAME} patient={{ id: g.patientId, name: g.name, room: g.room }} day={0} today={today} nowTime={nowTime} by={me.name} lines={slipLines(rows, g.patientId, 0, ctx)} />, { portrait: true });

  const stampsOf = (r: TakeRow): { start: Stamp; done: Stamp; take: Stamp } => {
    const e = entryOf(r);
    const hold = holds[r.key];
    return {
      start: e ? { at: startLabel(e.order, today), by: e.author } : { at: "", by: r.author },
      done: e ? doneStampOf(e.id, records) : EMPTY_STAMP,
      take: isTaken(r) ? (takenHere(r) ? splitStamp(taken[r.keys.at(-1)!]) : { at: "", by: "前の勤務帯（架空）" }) : hold && !hold.answer ? { at: hold.at, by: `医師に確認中（${hold.by}）` } : EMPTY_STAMP,
    };
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <SheetBand
        day={day}
        range={TAKE_DAYS}
        onDay={(d) => {
          setDay(d);
          setChecked(new Set());
          setOpen(null);
        }}
        today={today}
        also={{ label: "指示受け済みも表示する", checked: showTaken, count: takenShown.length - notConfirmed.length, onChange: setShowTaken }}
        cats={cats}
        onCats={setCats}
        check={{
          all: () => setChecked(new Set(bulkable.map((r) => r.key))),
          none: () => setChecked(new Set()),
          bulk: { label: "一括受け", count: bulk.length, onClick: takeBulk, title: "チェックした指示をまとめて受けます。至急・高リスク薬・口頭指示・変更などはチェックできず、1件ずつ受けます" },
        }}
      >
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
        {otherDays > 0 && <span className="text-xs text-yamabuki">ほかの日に {otherDays}件</span>}
        {late.length > 0 && <span className="rounded bg-shu px-2 py-0.5 text-xs font-bold text-white">遅れ {late.length}件</span>}
        {held.length > 0 && <span className="rounded bg-tab px-2 py-0.5 text-xs font-bold text-ink">医師に確認中 {held.length}件</span>}
        {notConfirmed.length > 0 && <span className="rounded bg-yamabuki-soft px-2 py-0.5 text-xs font-bold text-yamabuki">受けたが予定の確認がまだ {notConfirmed.length}件</span>}
        <span className="ml-auto flex items-center gap-3">
          {onExecute && (
            <button type="button" onClick={onExecute} className="flex items-center gap-1 text-xs text-ai underline">
              <ExternalLink size={12} />
              実施入力へ
            </button>
          )}
          <button type="button" onClick={onSheet} className="flex items-center gap-1 text-xs text-ai underline">
            <ExternalLink size={12} />
            ワークシートへ
          </button>
        </span>
      </SheetBand>
      <div className="scroll-thin min-h-0 flex-1 overflow-auto bg-paper p-5">
        <div className="mx-auto max-w-[1100px] space-y-5">
          <p className="hint text-[11px] text-ink-soft">
            新しい指示・変更・中止は、まずここで「指示を受ける」（誰が・いつ）。左の○にチェックして「一括受け」でまとめて受けられます（「全チェック」で受けられるものを全部）。受けると、その指示が今日と明日に作る予定（時刻・回数・量）が下に開くので、見てから「予定を確認した」を押します。それから実施入力に進みます。至急・高リスク薬・口頭指示・変更は1件ずつ、まとめて受けられません：「開いて受ける」で中身（薬・量・時刻・至急の理由）を広げて見てから「この指示を受ける」を押します。受けた・確認したときは、その行に緑の帯が数秒出ます。気になるときは「医師に確認」で受けないまま医師に送れます。◀ ▶ で前後の日の指示（その日に出た指示と、その日から始まる指示）を見られます。
          </p>

          {list.length === 0 ? (
            <p className="rounded-lg border border-rule bg-sheet px-4 py-3 text-[12px] text-ink-faint">{waiting.length === 0 && takenShown.length > 0 ? "この日の指示はすべて受けています。「指示受け済みも表示する」で見られます。" : "この日に受ける指示はありません。"}</p>
          ) : (
            groupByPatient(list).map((g) => {
              const person = people.find((x) => x.patient.id === g.patientId);
              const w = g.rows.filter((r) => !isTaken(r));
              const oldest = w.length ? Math.min(...w.map((r) => r.at)) : null;
              const gLate = w.some((r) => takeLate(r, nowAbs) && !holding(r));
              return (
                <section key={g.patientId} className="rounded-lg border border-rule bg-sheet">
                  {person ? (
                    <PatientBand patient={person.patient} room={g.room}>
                      {isMine(g.room) && <span className="rounded bg-ai-soft px-1 text-[10px] font-bold text-ai">受け持ち</span>}
                      <span className="text-ink-soft">
                        {w.length ? `未指示受け ${w.length}件` : "受け済み"}
                        {g.rows.length - w.length > 0 ? `・受け済み ${g.rows.length - w.length}件` : ""}
                      </span>
                      {oldest !== null && (
                        <span className={`nums ${gLate ? "font-bold text-shu" : "text-ink-soft"}`}>
                          いちばん古い指示から {elapsedLabel(nowAbs - oldest)}
                          {gLate ? "（遅れ）" : ""}
                        </span>
                      )}
                      {w.some((r) => r.flags.urgent) && <span className="rounded bg-shu px-1 text-[10px] font-bold text-white">至急あり</span>}
                      <button type="button" onClick={() => onOpen(g.patientId)} className="ml-auto text-[11px] text-ai underline">
                        カルテを開く
                      </button>
                      <button type="button" onClick={() => printSlip(g)} className="flex items-center gap-1 rounded border border-ai/50 px-2 py-0.5 text-[11px] font-bold text-ai hover:bg-ai-soft">
                        <Printer size={12} />
                        指示票（今日・A4）
                      </button>
                    </PatientBand>
                  ) : (
                    <div className="border-b border-rule-soft bg-paper px-2 py-1 text-[12px] font-bold">
                      {g.room}　{g.name}
                    </div>
                  )}
                  <div className="px-2 pb-1">
                    {g.rows.map((r) => {
                      const ok = isTaken(r);
                      const hold = holds[r.key];
                      const isHeld = holding(r);
                      const flags = (Object.entries(r.flags) as [keyof typeof FLAG_STYLE, string][]).filter(([, v]) => v).map(([k, v]) => ({ text: v, className: FLAG_STYLE[k] }));
                      const mine = open?.key === r.key ? open.what : null;
                      return (
                        <SheetBlock
                          key={r.key}
                          check={
                            ok
                              ? null
                              : {
                                  checked: checked.has(r.key),
                                  disabled: isHeld || r.mustOne.length > 0,
                                  title: isHeld ? "医師に確認中" : r.mustOne.length ? `1件ずつ受けます：${r.mustOne.join("・")}` : "一括受けの対象にする",
                                  label: `${r.name} ${sheetTitle(r)} をチェック`,
                                  onChange: (v) =>
                                    setChecked((s) => {
                                      const n = new Set(s);
                                      if (v) n.add(r.key);
                                      else n.delete(r.key);
                                      return n;
                                    }),
                                }
                          }
                          title={sheetTitle(r)}
                          tag={KIND_TAG[r.kind]}
                          when={momentLabel(r.at, today, r.timeKnown)}
                          flags={flags}
                          stamps={stampsOf(r)}
                          fields={takeFields(r, entryOf(r), today, WARD_NAME)}
                          struck={r.kind === "中止"}
                          status={
                            ok && takenHere(r) ? (
                              confirms[r.key] ? (
                                <span className="text-[10px] text-wakatake">確認 {confirms[r.key]}</span>
                              ) : (
                                <button type="button" onClick={() => setOpen(mine === "confirm" ? null : { key: r.key, what: "confirm" })} className="rounded border border-yamabuki px-1.5 py-0.5 text-[10px] font-bold text-yamabuki hover:bg-yamabuki hover:text-white">
                                  予定を確認する（まだ）
                                </button>
                              )
                            ) : isHeld ? (
                              <span className="text-[11px] font-bold text-yamabuki">医師に確認中</span>
                            ) : null
                          }
                        >
                          {done[r.key] && (
                            <div role="status" className="mt-1 ml-3 flex items-center gap-1 rounded bg-wakatake-soft px-2 py-1 text-[11px] font-bold text-wakatake">
                              <Check size={12} />
                              {done[r.key]}
                              {confirms[r.key] && <span className="font-normal text-ink-soft">　「指示受け済みも表示する」に移ります</span>}
                            </div>
                          )}
                          {r.before && <div className="pl-3 text-[11px] text-ink-faint line-through">前：{r.before.main}　{r.before.detail}</div>}
                          {r.diff && r.diff.length > 0 && (
                            <div className="mt-0.5 flex flex-wrap gap-1 pl-3">
                              {r.diff.map((d) => (
                                <span key={d.label} className="rounded bg-yamabuki-soft px-1 text-[11px] text-ink">
                                  {d.label}：<span className="line-through">{d.before}</span> → <b>{d.after}</b>
                                </span>
                              ))}
                            </div>
                          )}
                          {r.related.map((x) => (
                            <div key={x} className="pl-3 text-[11px] font-bold text-shu">
                              {x}
                            </div>
                          ))}
                          {hold && (
                            <div className="mt-0.5 ml-3 rounded bg-paper px-1 text-[11px]">
                              確認 {hold.at} {hold.by}：{hold.reason}
                              {hold.note && `（${hold.note}）`}
                              {hold.answer ? <span className="block text-ai">回答 {hold.answer.at} {hold.answer.by}：{hold.answer.text}</span> : <span className="block text-yamabuki">医師の回答待ち</span>}
                            </div>
                          )}
                          {!ok && !isHeld && (
                            <div className="mt-1 flex flex-wrap items-center gap-2 pl-3">
                              {r.mustOne.length === 0 ? (
                                <button type="button" onClick={() => take(r)} className="rounded border border-yamabuki px-1.5 py-0.5 text-[11px] font-bold text-yamabuki hover:bg-yamabuki hover:text-white">
                                  指示を受ける
                                </button>
                              ) : (
                                <button type="button" onClick={() => setOpen(mine === "one" ? null : { key: r.key, what: "one" })} className="rounded border border-shu px-1.5 py-0.5 text-[11px] font-bold text-shu hover:bg-shu hover:text-white">
                                  開いて受ける
                                </button>
                              )}
                              <button type="button" onClick={() => setOpen(mine === "ask" ? null : { key: r.key, what: "ask" })} className="flex items-center gap-0.5 text-[10px] text-ink-soft underline hover:text-ai">
                                <MessageCircleQuestion size={11} />
                                医師に確認
                              </button>
                            </div>
                          )}
                          {mine === "one" && !ok && (
                            <div className="mt-1 ml-3 rounded bg-paper px-3 py-2">
                              <TakeOnePanel row={r} nurses={nurses} today={today} onTake={(second) => take(r, second)} onClose={() => setOpen(null)} />
                            </div>
                          )}
                          {mine === "ask" && !ok && (
                            <div className="mt-1 ml-3 rounded bg-paper px-3 py-2">
                              <AskDoctorPanel
                                onHold={(reason, note) => {
                                  onHold(r.key, reason, note);
                                  setOpen(null);
                                }}
                              />
                            </div>
                          )}
                          {mine === "confirm" && ok && !confirms[r.key] && (
                            <div className="mt-1 ml-3">
                              <TakeConfirm
                                row={r}
                                plan={confirmPlan(r, people, today, nowAbs)}
                                today={today}
                                interactive
                                onConfirm={() => {
                                  onConfirm(r.key);
                                  mark([r.key], "confirm");
                                  setOpen(null);
                                }}
                                onClose={() => setOpen(null)}
                              />
                            </div>
                          )}
                        </SheetBlock>
                      );
                    })}
                  </div>
                </section>
              );
            })
          )}

          <SheetNotes>
            <p>
              【変】は同じ薬の中止と新規が同時に出たもので、変わったところだけを前後で示します（コードで比べるだけ）。至急・高リスク薬・口頭指示・変更・血糖を下げる薬が有効なときの食事の変更は、まとめて受けずに1件ずつ受けます。時間外は日勤（8:30〜17:00）以外に出た指示です。参考：{TAKE_SOURCES.map((s) => s.label).join("／")}。高リスク薬の一覧と時間外の区切りは架空の病院の取り決めです。
            </p>
            <p>
              指示受け → 指示確認 → 実施入力の流れと、未指示受けの一覧・患者ごとのまとめ・並べ替え・指示票は、公開されている電子カルテのカタログと病院の調達仕様の要件に合わせています。遅れの目安（至急 15分・ほかは 60分）、「自分の受け持ち」の決め方（その勤務帯の業務分担、なければ病棟の固定チーム）、今日と明日の予定を見ること、この画面を開く前の指示を前の勤務帯が受けたものとして扱うことは架空の病院の取り決めです。
            </p>
            <Sources items={CONFIRM_SOURCES.slice(1)} />
          </SheetNotes>
        </div>
      </div>
      {printSheet}
    </div>
  );
}
