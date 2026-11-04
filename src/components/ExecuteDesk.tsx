"use client";

import { ExternalLink } from "lucide-react";
import { useMemo, useState } from "react";
import type { CalendarDate } from "@/lib/dates";
import { abs } from "@/lib/flowsheet";
import { NOT_DONE_REASONS, marKey, type AdminRecord, type NotDoneReason } from "@/lib/mar";
import { EMPTY_STAMP, EXECUTE_DAYS, EXECUTE_NOTE, canExecuteOn, categoryOfWork, dayWindow, executeRecord, executeState, momentLabel, orderFields, SHEET_CATEGORIES, startLabel, takeStampOf, timeOfAbs, workTitle, type SheetCategory, type SheetField, type Stamp } from "@/lib/order-sheet";
import { WARD_NAME } from "@/lib/ward";
import { buildWorksheet, type WorkItem, type WorkKind, type WorkPatient } from "@/lib/worksheet";
import { PatientBand, SheetBand, SheetBlock, SheetNotes } from "./OrderSheet";
import { useMe } from "./RoleContext";

interface Props {
  people: WorkPatient[];
  today: CalendarDate;
  nowTime: string;
  /** 与薬・実施の記録 (the same records the worksheet writes). */
  records: Record<string, AdminRecord>;
  /** Items due before this time count as recorded by the (fictional) earlier shift. */
  sessionStart: number;
  onRecord: (r: AdminRecord) => void;
  /** 指示受け: change key → "HH:MM 看護師 ◯◯", and the keys of this session's changes. */
  taken: Record<string, string>;
  sessionKeys: Set<string>;
  nurses: string[];
  onOpen: (patientId: string) => void;
  onSheet: () => void;
  onTakeDesk: () => void;
}

const KIND_TONE: Record<WorkKind, "ai" | "shu" | "yamabuki" | "wakatake" | "ink"> = { 注射: "ai", 内服: "wakatake", 処置: "ink", 採血: "yamabuki", 検査: "ink" };

/**
 * 実施入力 in the catalog's form: the day's scheduled items (what the worksheet lists by the clock), a band
 * per patient, and each item as a block with the order's 「項目名：値」 lines and the three 「日時／者」 pairs.
 * 「実施した」 takes the time (now, or typed) and who did it, and writes the same 与薬・実施の記録 the
 * worksheet writes (there with the wristband and label read; here without, and the record says so).
 */
export function ExecuteDesk({ people, today, nowTime, records, sessionStart, onRecord, taken, sessionKeys, nurses, onOpen, onSheet, onTakeDesk }: Props) {
  const me = useMe();
  const [day, setDay] = useState(0);
  const [showDone, setShowDone] = useState(false);
  const [cats, setCats] = useState<SheetCategory[]>(SHEET_CATEGORIES);
  const [checked, setChecked] = useState<Set<string>>(() => new Set());
  const [open, setOpen] = useState<string | null>(null);
  const [form, setForm] = useState<{ time: string; by: string; status: "実施" | "未実施"; reason: NotDoneReason | "" }>({ time: nowTime, by: me.name, status: "実施", reason: "" });
  const nowAbs = abs(0, nowTime);
  const { lo, hi } = dayWindow(day);
  const sheet = useMemo(() => buildWorksheet(people, lo, hi, nowAbs), [people, lo, hi, nowAbs]);
  const keyOf = (i: WorkItem) => marKey(i.orderId, i.at!);
  const stateOf = (i: WorkItem) => executeState(i, records, sessionStart);
  const recorded = (i: WorkItem) => stateOf(i) !== "未入力" && stateOf(i) !== "予定";
  const items = sheet.timed.filter((i) => i.at !== null && cats.includes(categoryOfWork(i.kind)));
  const todo = items.filter((i) => !recorded(i));
  const list = showDone ? items : todo;
  const canType = canExecuteOn(day);
  const bulkable = day === 0 ? todo : [];
  const bulk = bulkable.filter((i) => checked.has(keyOf(i)));
  const entryOf = (i: WorkItem) => people.find((x) => x.patient.id === i.patientId)?.entries.find((e) => e.id === i.orderId);
  const names = [...new Set([me.name, ...nurses])];

  const save = (i: WorkItem, x: { time: string; by: string; status: "実施" | "未実施"; reason?: NotDoneReason }) => {
    const r = executeRecord(i, { day, ...x });
    if (!r) return;
    onRecord(r);
    setChecked((s) => {
      const n = new Set(s);
      n.delete(keyOf(i));
      return n;
    });
    setOpen(null);
  };
  const saveBulk = () => {
    for (const i of bulk) save(i, { time: nowTime, by: me.name, status: "実施" });
    setChecked(new Set());
  };
  const openFor = (i: WorkItem) => {
    setForm({ time: day === 0 ? nowTime : timeOfAbs(i.at!), by: me.name, status: "実施", reason: "" });
    setOpen(keyOf(i));
  };

  const stampsOf = (i: WorkItem): { start: Stamp; done: Stamp; take: Stamp } => {
    const e = entryOf(i);
    const r = records[keyOf(i)];
    const st = stateOf(i);
    return {
      start: e ? { at: startLabel(e.order, today), by: e.author } : EMPTY_STAMP,
      done: r ? { at: `${r.doneAt}${r.status === "未実施" ? "（未実施）" : ""}`, by: r.by } : st === "記録済み" ? { at: "", by: "前の勤務帯（架空）" } : EMPTY_STAMP,
      take: takeStampOf(i.orderId, taken, sessionKeys),
    };
  };
  const fieldsOf = (i: WorkItem): SheetField[] => {
    const e = entryOf(i);
    return [{ label: "この回", value: `${i.main}　${i.detail}` }, ...(e ? orderFields(e.order, today, WARD_NAME) : [])];
  };
  const statusOf = (i: WorkItem) => {
    const r = records[keyOf(i)];
    const st = stateOf(i);
    if (r)
      return (
        <span className={`text-[11px] font-bold ${r.status === "実施" ? "text-wakatake" : "text-shu"}`}>
          {r.status} {r.doneAt}
          {r.reason ? `（${r.reason}）` : ""}
          {r.offBy !== undefined && <span className="ml-1 font-normal text-yamabuki">予定より{Math.abs(r.offBy)}分{r.offBy > 0 ? "遅れ" : "早め"}</span>}
        </span>
      );
    if (st === "記録済み") return <span className="text-[11px] text-ink-faint">実施（前の勤務帯）</span>;
    if (st === "未入力") return <span className="text-[11px] font-bold text-yamabuki">未入力</span>;
    return <span className="text-[11px] text-ink-soft">予定</span>;
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <SheetBand
        day={day}
        range={EXECUTE_DAYS}
        onDay={(d) => {
          setDay(d);
          setChecked(new Set());
          setOpen(null);
        }}
        today={today}
        also={{ label: "実施済みも表示する", checked: showDone, count: items.length - todo.length, onChange: setShowDone }}
        cats={cats}
        onCats={setCats}
        check={{
          all: () => setChecked(new Set(bulkable.map(keyOf))),
          none: () => setChecked(new Set()),
          bulk: { label: "一括実施", count: bulk.length, onClick: saveBulk, disabled: day !== 0, title: day === 0 ? `チェックした予定を、いま（${nowTime}）${me.name}が実施したとして記録します（照合なし）` : "一括実施は今日の分だけです" },
        }}
      >
        <span className={`rounded px-2 py-0.5 text-xs font-bold ${todo.length ? "bg-yamabuki-soft text-yamabuki" : "bg-wakatake-soft text-wakatake"}`}>実施がまだ {todo.length}件</span>
        <span className="ml-auto flex items-center gap-3">
          <button type="button" onClick={onTakeDesk} className="flex items-center gap-1 text-xs text-ai underline">
            <ExternalLink size={12} />
            指示受けへ
          </button>
          <button type="button" onClick={onSheet} className="flex items-center gap-1 text-xs text-ai underline">
            <ExternalLink size={12} />
            ワークシートへ（照合して実施）
          </button>
        </span>
      </SheetBand>
      <div className="scroll-thin min-h-0 flex-1 overflow-auto bg-paper p-5">
        <div className="mx-auto max-w-[1100px] space-y-5">
          <p className="hint text-[11px] text-ink-soft">
            その日の予定（注射・内服・処置・採血・検査）を患者ごとに、時刻の順に出します。実施したら「実施した」を押し、時刻（最初はいま。打ち直せます）と実施者を入れて記録します。左の○にチェックして「一括実施」で、いまの時刻でまとめて記録できます（今日の分だけ）。この画面ではリストバンドとラベルを読みません。読んで実施するときはワークシートの「照合」を使います。◀ ▶ で前後の日に動けます（実施を入れられるのは今日と昨日、明日は見るだけ）。
          </p>

          {list.length === 0 ? (
            <p className="rounded-lg border border-rule bg-sheet px-4 py-3 text-[12px] text-ink-faint">{items.length ? "この日の予定はすべて記録しています。「実施済みも表示する」で見られます。" : "この日に時刻の決まった予定はありません。"}</p>
          ) : (
            groupBy(list).map((g) => {
              const person = people.find((x) => x.patient.id === g.patientId);
              const left = g.items.filter((i) => !recorded(i)).length;
              return (
                <section key={g.patientId} className="rounded-lg border border-rule bg-sheet">
                  {person && (
                    <PatientBand patient={person.patient} room={g.room}>
                      <span className="text-ink-soft">{left ? `実施がまだ ${left}件` : "すべて記録済み"}</span>
                      <button type="button" onClick={() => onOpen(g.patientId)} className="ml-auto text-[11px] text-ai underline">
                        カルテを開く
                      </button>
                    </PatientBand>
                  )}
                  <div className="px-2 pb-1">
                    {g.items.map((i) => {
                      const k = keyOf(i);
                      const done = recorded(i);
                      return (
                        <SheetBlock
                          key={k}
                          check={done || !canType ? null : { checked: checked.has(k), disabled: day !== 0, title: day === 0 ? "一括実施の対象にする" : "一括実施は今日の分だけ", label: `${i.name} ${workTitle(i.kind)} ${momentLabel(i.at!, today)} をチェック`, onChange: (v) => setChecked((s) => { const n = new Set(s); if (v) n.add(k); else n.delete(k); return n; }) }}
                          title={workTitle(i.kind)}
                          tag={{ text: i.kind, tone: KIND_TONE[i.kind] }}
                          when={`予定 ${momentLabel(i.at!, today)}`}
                          flags={i.urgent ? [{ text: "至急", className: "bg-shu text-white" }] : []}
                          stamps={stampsOf(i)}
                          fields={fieldsOf(i)}
                          status={statusOf(i)}
                        >
                          {!done && canType && (
                            <div className="mt-1 pl-3">
                              {open === k ? (
                                <div className="flex flex-wrap items-center gap-2 rounded bg-paper px-3 py-2">
                                  <label className="flex items-center gap-1">
                                    実施日時
                                    <span className="nums text-ink-soft">{momentLabel(day * 1440, today).split(" ")[0]}</span>
                                    <input value={form.time} onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))} aria-label="実施した時刻" placeholder="HH:MM" className="nums w-16 rounded border border-rule bg-sheet px-1 py-0.5" />
                                  </label>
                                  <label className="flex items-center gap-1">
                                    実施者
                                    <select value={form.by} onChange={(e) => setForm((f) => ({ ...f, by: e.target.value }))} aria-label="実施者" className="rounded border border-rule bg-sheet px-1 py-0.5">
                                      {names.map((n) => (
                                        <option key={n}>{n}</option>
                                      ))}
                                    </select>
                                  </label>
                                  <label className="flex items-center gap-1">
                                    <input type="radio" name={`st-${k}`} className="accent-ai" checked={form.status === "実施"} onChange={() => setForm((f) => ({ ...f, status: "実施" }))} />
                                    実施
                                  </label>
                                  <label className="flex items-center gap-1">
                                    <input type="radio" name={`st-${k}`} className="accent-ai" checked={form.status === "未実施"} onChange={() => setForm((f) => ({ ...f, status: "未実施" }))} />
                                    未実施
                                  </label>
                                  {form.status === "未実施" && (
                                    <select value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value as NotDoneReason }))} aria-label="未実施の理由" className="rounded border border-rule bg-sheet px-1 py-0.5">
                                      <option value="">理由を選ぶ</option>
                                      {NOT_DONE_REASONS.map((x) => (
                                        <option key={x}>{x}</option>
                                      ))}
                                    </select>
                                  )}
                                  <button type="button" disabled={!executeRecord(i, { day, time: form.time, by: form.by, status: form.status, reason: form.reason || undefined })} onClick={() => save(i, { time: form.time, by: form.by, status: form.status, reason: form.reason || undefined })} className="rounded bg-ai px-3 py-0.5 font-bold text-white disabled:opacity-40">
                                    記録する
                                  </button>
                                  <button type="button" onClick={() => setOpen(null)} className="text-ink-soft underline">
                                    やめる
                                  </button>
                                  <span className="w-full text-[10px] text-ink-faint">{EXECUTE_NOTE}。予定の時刻と60分より離れていると、ずれを記録に残します（病棟の取り決め）。</span>
                                </div>
                              ) : (
                                <button type="button" onClick={() => openFor(i)} className="rounded border border-ai px-2 py-0.5 text-[11px] font-bold text-ai hover:bg-ai hover:text-white">
                                  実施した
                                </button>
                              )}
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
            <p>実施の記録はワークシート・経過表と同じもの（与薬・実施の記録）に書きます。この画面から入れた記録には「{EXECUTE_NOTE}」と残り、監査ログにはリストバンド・ラベルの一致が「—」と出ます。点滴は開始として記録し、終了（残量）はワークシートで入れます。実施を入れられるのは今日と昨日の分だけで、この画面を開く前の時刻の予定は前の勤務帯が記録したものとして扱います（架空の病院の取り決め）。</p>
          </SheetNotes>
        </div>
      </div>
    </div>
  );
}

function groupBy(items: WorkItem[]): { patientId: string; room: string; name: string; items: WorkItem[] }[] {
  const out: { patientId: string; room: string; name: string; items: WorkItem[] }[] = [];
  for (const i of items) {
    const g = out.find((x) => x.patientId === i.patientId);
    if (g) g.items.push(i);
    else out.push({ patientId: i.patientId, room: i.room, name: i.name, items: [i] });
  }
  return out.sort((a, b) => a.room.localeCompare(b.room));
}
