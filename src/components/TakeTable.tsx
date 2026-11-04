"use client";

import { Check, MessageCircleQuestion } from "lucide-react";
import { useState } from "react";
import { addDays, formatShort, type CalendarDate } from "@/lib/dates";
import { confirmPlan, type Confirms } from "@/lib/order-confirm";
import { momentLabel } from "@/lib/order-sheet";
import { HOLD_REASONS, TAKE_SOURCES, type TakeHold, type TakeRow } from "@/lib/order-take";
import { timeLabel, type WorkPatient } from "@/lib/worksheet";
import { ConfirmCheck, WAITING_BUTTON, Waits } from "./ConfirmCheck";
import { useMe } from "./RoleContext";
import { TakeConfirm } from "./TakeConfirm";

/** 指示確認 after 指示受け: who looked at the schedule the change makes (by row key), confirming one, and the orders to expand it from. */
export interface ConfirmProps {
  confirms: Confirms;
  onConfirm: (key: string) => void;
  people: WorkPatient[];
  nowAbs: number;
}

const td = "border-b border-rule-soft px-1.5 py-1 align-top";
const th = "border-b border-rule px-1.5 py-1 text-left font-normal text-ink-soft";
export const FLAG_STYLE = { urgent: "bg-shu text-white", highRisk: "bg-shu-soft text-shu", verbal: "bg-fuji-soft text-fuji", changed: "bg-yamabuki-soft text-yamabuki", offHours: "bg-tab text-ink" } as const;

/**
 * 指示受け: each change with what it is, flags (至急・高リスク・口頭指示・変更・時間外), a 変更 with before and
 * after, and orders related to it. Some must be taken one at a time with a check, high-risk ones with a
 * second nurse; any can be held to ask the doctor first.
 */
export function TakeTable({ rows, taken, isTaken, holds, interactive, day, today, nurses, onTake, onHold, confirm, showPatient = true, notes = true }: { rows: TakeRow[]; taken: Record<string, string>; isTaken: (r: TakeRow) => boolean; holds: Record<string, TakeHold>; interactive: boolean; day: number; today: CalendarDate; nurses: string[]; onTake: (keys: string[], second?: string) => void; onHold: (key: string, reason: TakeHold["reason"], note: string) => void; confirm?: ConfirmProps; showPatient?: boolean; notes?: boolean }) {
  const [open, setOpen] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [asking, setAsking] = useState<string | null>(null);
  const close = () => setOpen(null);
  const cols = showPatient ? 6 : 5;
  // 指示受け, then straight on to 指示確認 (the schedule the change makes opens under the row).
  const take = (r: TakeRow, second?: string) => {
    onTake(r.keys, second);
    if (confirm) setConfirming(r.key);
  };
  return (
    <>
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className={`${th} w-28`}>指示受け</th>
            <th className={`${th} w-24`}>時刻</th>
            {showPatient && <th className={`${th} w-28`}>部屋・患者</th>}
            <th className={`${th} w-14`}>種別</th>
            <th className={th}>内容</th>
            <th className={`${th} w-28`}>指示</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const ok = isTaken(r);
            const hold = holds[r.key];
            const holding = !!hold && !hold.answer && !ok;
            const flags = (Object.entries(r.flags) as [keyof typeof FLAG_STYLE, string][]).filter(([, v]) => v);
            return [
              <tr key={r.key} className={r.kind === "中止" ? "text-ink-soft" : ok ? "" : r.flags.urgent ? "bg-shu-soft/30" : ""}>
                <td className={td}>
                  {ok ? (
                    <span className="flex flex-col items-start gap-0.5">
                      <span className="flex items-start gap-0.5 text-wakatake">
                        <Check size={12} className="mt-0.5 shrink-0" />
                        {taken[r.keys.at(-1)!] ?? "受け済"}
                      </span>
                      {/* 指示確認: only for changes taken in this session (earlier ones count as confirmed by the earlier shift). */}
                      {confirm && taken[r.keys.at(-1)!] && (confirm.confirms[r.key] ? <span className="text-[10px] text-wakatake">確認 {confirm.confirms[r.key]}</span> : interactive ? (
                        <button type="button" onClick={() => setConfirming(confirming === r.key ? null : r.key)} className="rounded border border-yamabuki px-1.5 py-0.5 text-[10px] font-bold text-yamabuki hover:bg-yamabuki hover:text-white">
                          予定を確認する（まだ）
                        </button>
                      ) : (
                        <span className="text-[10px] text-yamabuki">確認がまだ □</span>
                      ))}
                    </span>
                  ) : holding ? (
                    <span className="text-[11px] font-bold text-yamabuki">
                      医師に確認中
                      <span className="block font-normal">{hold.reason}</span>
                    </span>
                  ) : interactive ? (
                    <span className="flex flex-col items-start gap-1">
                      {r.mustOne.length === 0 ? (
                        <button type="button" onClick={() => take(r)} className="rounded border border-yamabuki px-1.5 py-0.5 text-[11px] font-bold text-yamabuki hover:bg-yamabuki hover:text-white">
                          指示を受ける
                        </button>
                      ) : (
                        <button type="button" onClick={() => (open === r.key ? close() : (close(), setOpen(r.key)))} className="rounded border border-shu px-1.5 py-0.5 text-[11px] font-bold text-shu hover:bg-shu hover:text-white">
                          開いて受ける
                        </button>
                      )}
                      <button type="button" onClick={() => setAsking(asking === r.key ? null : r.key)} className="flex items-center gap-0.5 text-[10px] text-ink-soft underline hover:text-ai">
                        <MessageCircleQuestion size={11} />
                        医師に確認
                      </button>
                    </span>
                  ) : (
                    <span>□ まだ</span>
                  )}
                </td>
                <td className={td}>{r.timeKnown ? timeLabel(r.at, day, today) : `${formatShort(addDays(today, Math.floor(r.at / 1440))).replace(/（.）/, "")}（時刻なし）`}</td>
                {showPatient && (
                  <td className={td}>
                    {r.room}　{r.name}
                  </td>
                )}
                <td className={`${td} font-bold ${r.kind === "中止" ? "text-shu" : r.kind === "変更" ? "text-yamabuki" : ""}`}>{r.kind === "変更" ? "【変】" : r.kind}</td>
                <td className={td}>
                  {flags.length > 0 && (
                    <div className="mb-0.5 flex flex-wrap gap-1">
                      {flags.map(([k, v]) => (
                        <span key={k} className={`rounded px-1 text-[10px] font-bold ${FLAG_STYLE[k]}`}>
                          {v}
                        </span>
                      ))}
                    </div>
                  )}
                  <span className="mr-1 text-ink-faint">{r.type}</span>
                  {r.before && <div className="text-[11px] text-ink-faint line-through">前：{r.before.main}　{r.before.detail}</div>}
                  <span className={r.kind === "中止" ? "line-through" : "font-bold"}>{r.main}</span>
                  <div className="text-ink-soft">{r.detail}</div>
                  {r.diff && r.diff.length > 0 && (
                    <div className="mt-0.5 flex flex-wrap gap-1">
                      {r.diff.map((d) => (
                        <span key={d.label} className="rounded bg-yamabuki-soft px-1 text-[11px] text-ink">
                          {d.label}：<span className="line-through">{d.before}</span> → <b>{d.after}</b>
                        </span>
                      ))}
                    </div>
                  )}
                  {r.related.map((x) => (
                    <div key={x} className="text-[11px] font-bold text-shu">
                      {x}
                    </div>
                  ))}
                  {hold && (
                    <div className="mt-0.5 rounded bg-paper px-1 text-[11px]">
                      確認 {hold.at} {hold.by}：{hold.reason}
                      {hold.note && `（${hold.note}）`}
                      {hold.answer ? <span className="block text-ai">回答 {hold.answer.at} {hold.answer.by}：{hold.answer.text}</span> : <span className="block text-yamabuki">医師の回答待ち</span>}
                    </div>
                  )}
                </td>
                <td className={td}>{r.author}</td>
              </tr>,
              open === r.key && !ok && (
                <tr key={`${r.key}-open`}>
                  <td colSpan={cols} className="border-b border-rule-soft bg-paper px-3 py-2 text-[12px]">
                    <TakeOnePanel
                      row={r}
                      nurses={nurses}
                      today={today}
                      onTake={(second) => {
                        take(r, second);
                        close();
                      }}
                      onClose={close}
                    />
                  </td>
                </tr>
              ),
              asking === r.key && !ok && (
                <tr key={`${r.key}-ask`}>
                  <td colSpan={cols} className="border-b border-rule-soft bg-paper px-3 py-2 text-[12px]">
                    <AskDoctorPanel
                      onHold={(reason, note) => {
                        onHold(r.key, reason, note);
                        setAsking(null);
                      }}
                    />
                  </td>
                </tr>
              ),
              confirm && confirming === r.key && ok && !confirm.confirms[r.key] && (
                <tr key={`${r.key}-confirm`}>
                  <td colSpan={cols} className="border-b border-rule-soft bg-paper px-3 py-2">
                    <TakeConfirm
                      row={r}
                      plan={confirmPlan(r, confirm.people, today, confirm.nowAbs)}
                      today={today}
                      interactive={interactive}
                      onConfirm={() => {
                        confirm.onConfirm(r.key);
                        setConfirming(null);
                      }}
                      onClose={() => setConfirming(null)}
                    />
                  </td>
                </tr>
              ),
            ];
          })}
        </tbody>
      </table>
      {notes && (
      <p className="hint mt-1 text-[10px] text-ink-faint">
        【変】は同じ薬の中止と新規が同時に出たもので、変わったところだけを前後で示します（コードで比べるだけ）。至急・高リスク薬・口頭指示・変更・血糖を下げる薬が有効なときの食事の変更は、まとめて受けずに1件ずつ受けます。時間外は日勤（8:30〜17:00）以外に出た指示です。参考：{TAKE_SOURCES.map((s) => s.label).join("／")}。高リスク薬の一覧と時間外の区切りは架空の病院の取り決めです。
      </p>
      )}
    </>
  );
}

/**
 * 1件ずつ受ける: the nurse ticks that she looked at the order with her own eyes (and, for a high-risk
 * drug, names the second nurse) before taking it. Shared by the worksheet's table and the 指示受け screen.
 */
export function TakeOnePanel({ row, nurses, onTake, onClose, today }: { row: TakeRow; nurses: string[]; onTake: (second?: string) => void; onClose: () => void; /** To write the order's moment in the opened contents (left out: the time alone). */ today?: CalendarDate }) {
  const me = useMe();
  const [checked, setChecked] = useState(false);
  const [second, setSecond] = useState("");
  const m = ((row.at % 1440) + 1440) % 1440;
  const when = today ? momentLabel(row.at, today, row.timeKnown) : row.timeKnown ? `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}` : "時刻なし";
  return (
    <>
      <p className="font-bold">1件ずつ受ける理由：{row.mustOne.join("・")}</p>
      {/* The contents, opened before taking: what, how much, when, and why it stands out. The nurse reads, then takes. */}
      <dl aria-label="受ける前に見る指示の内容" className="nums mt-1 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0 rounded border border-rule bg-sheet px-2 py-1">
        <dt className="text-ink-soft">指示</dt>
        <dd>
          <span className="mr-1 text-ink-faint">{row.type}</span>
          <b className={row.kind === "中止" ? "text-shu" : row.kind === "変更" ? "text-yamabuki" : ""}>{row.kind === "変更" ? "【変】" : row.kind}</b> <span className={row.kind === "中止" ? "line-through" : "font-bold"}>{row.main}</span>
        </dd>
        <dt className="text-ink-soft">量・方法</dt>
        <dd>{row.detail || "—"}</dd>
        {row.before && (
          <>
            <dt className="text-ink-soft">前</dt>
            <dd className="line-through text-ink-faint">
              {row.before.main}　{row.before.detail}
            </dd>
          </>
        )}
        {row.diff && row.diff.length > 0 && (
          <>
            <dt className="text-ink-soft">変わった点</dt>
            <dd>{row.diff.map((d) => `${d.label}：${d.before} → ${d.after}`).join("／")}</dd>
          </>
        )}
        <dt className="text-ink-soft">指示の時刻</dt>
        <dd>{when}</dd>
        <dt className="text-ink-soft">指示した人</dt>
        <dd>{row.author}</dd>
        {row.flags.urgent && (
          <>
            <dt className="font-bold text-shu">至急</dt>
            <dd className="font-bold text-shu">{row.flags.urgent}</dd>
          </>
        )}
        {row.flags.highRisk && (
          <>
            <dt className="text-shu">高リスク薬</dt>
            <dd className="text-shu">{row.flags.highRisk}</dd>
          </>
        )}
        {row.flags.verbal && (
          <>
            <dt className="text-fuji">口頭指示</dt>
            <dd className="text-fuji">{row.flags.verbal}</dd>
          </>
        )}
        {row.related.length > 0 && (
          <>
            <dt className="text-shu">関連</dt>
            <dd className="text-shu">{row.related.join("／")}</dd>
          </>
        )}
      </dl>
      <div className="mt-1 flex flex-wrap">
        <ConfirmCheck checked={checked} onChange={setChecked}>
          指示の内容（薬・量・単位・速さ・経路・時刻{row.kind === "変更" ? "、前と後で変わったところ" : ""}）を自分の目で確かめた
        </ConfirmCheck>
      </div>
      {row.flags.highRisk && (
        <label className="mt-1 flex items-center gap-1.5">
          2人目の確認者
          <select value={second} onChange={(e) => setSecond(e.target.value)} aria-label="2人目の確認者" className="rounded border border-rule bg-sheet px-1 py-0.5">
            <option value="">選ぶ</option>
            {nurses
              .filter((n) => n !== me.name)
              .map((n) => (
                <option key={n}>{n}</option>
              ))}
          </select>
          <span className="text-ink-faint">（本人とは別の人。2人とも自分の目で指示を見る。試作では名前を選ぶだけ）</span>
        </label>
      )}
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <button type="button" disabled={!checked || (!!row.flags.highRisk && !second)} onClick={() => onTake(second || undefined)} className={WAITING_BUTTON}>
          この指示を受ける
        </button>
        <Waits on={!checked} />
        <Waits on={checked && !!row.flags.highRisk && !second} text="2人目の確認者を選ぶと受けられます" />
        <button type="button" onClick={onClose} className="text-ink-soft underline">
          やめる
        </button>
      </div>
    </>
  );
}

/** 医師に確認: the reason and a short note, sent to the doctor instead of taking the change. */
export function AskDoctorPanel({ onHold }: { onHold: (reason: TakeHold["reason"], note: string) => void }) {
  const [reason, setReason] = useState<TakeHold["reason"] | "">("");
  const [note, setNote] = useState("");
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        医師に確認する理由
        <select value={reason} onChange={(e) => setReason(e.target.value as TakeHold["reason"])} aria-label="確認の理由" className="rounded border border-rule bg-sheet px-1 py-0.5">
          <option value="">選ぶ</option>
          {HOLD_REASONS.map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="何を確かめたいか（短く）" aria-label="確認したいこと" className="min-w-48 flex-1 rounded border border-rule bg-sheet px-1.5 py-0.5" />
        <button
          type="button"
          disabled={!reason || (reason === "その他" && !note.trim())}
          onClick={() => {
            onHold(reason as TakeHold["reason"], note.trim());
            setReason("");
            setNote("");
          }}
          className="rounded bg-ai px-3 py-0.5 font-bold text-white disabled:opacity-40"
        >
          医師に送る
        </button>
      </div>
      <p className="mt-1 text-ink-faint">送ると、受けないまま「医師に確認中」になり、医師のやることとカルテに出ます。回答のあとで受けます。</p>
    </>
  );
}
