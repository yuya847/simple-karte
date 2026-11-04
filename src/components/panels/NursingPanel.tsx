"use client";

import { useState } from "react";
import { minutesOf } from "@/lib/dates";
import {
  CARE_ITEMS,
  CARE_SOURCES,
  EVERY_HOURS,
  careActive,
  careSlots,
  careState,
  changeCare,
  draftFromItem,
  draftFromOrder,
  draftProblems,
  emptyCareDraft,
  hhmm,
  makeCareOrder,
  parseTimes,
  scheduleLabel,
  stopCare,
  type CareDraft,
  type CareOrder,
  type CareRecord,
} from "@/lib/care-orders";
import {
  EVAL_INTERVAL_DAYS,
  EVAL_RESULTS,
  PLAN_LISTS,
  PLAN_SOURCES,
  PLAN_TEMPLATES,
  addProblem,
  defaultEvalDue,
  evalProblems,
  evalStatus,
  evaluateProblem,
  listLabel,
  nextNo,
  ordersOf,
  planProblems,
  problemTitle,
  type EvalResult,
  type NursingProblem,
  type PlanBody,
  type PlanList,
} from "@/lib/nursing-plan";
import { DenyNote, useDeny, useMe } from "../RoleContext";

interface Props {
  /** Which part opens first. */
  start: "care" | "plan";
  /** This patient's care orders, their records, and nursing problems. */
  orders: CareOrder[];
  records: CareRecord[];
  plans: NursingProblem[];
  patientId: string;
  nowTime: string;
  sessionStart: number;
  fmtDay: (d: number) => string;
  newId: () => string;
  /** Change the ward's care orders / nursing problems (an updater over all patients), with what for the log. */
  onOrders: (f: (all: CareOrder[]) => CareOrder[], what: string) => void;
  onPlans: (f: (all: NursingProblem[]) => NursingProblem[], what: string) => void;
}

const input = "w-full rounded border border-rule bg-paper px-2 py-1";
const small = "rounded border border-rule bg-paper px-1.5 py-0.5";

/**
 * 看護ケア指示 and 看護計画 of one patient. Nurses write them; others read. The code expands the orders into
 * tasks, counts the days to the evaluation and checks what is missing — what to do is decided by the nurse.
 */
export function NursingPanel(props: Props) {
  const [tab, setTab] = useState(props.start);
  return (
    <div className="space-y-3 text-[13px]">
      <div role="tablist" aria-label="看護ケア指示と看護計画" className="flex w-fit rounded-md border border-rule p-0.5 text-[12px]">
        {(
          [
            ["care", "看護ケア指示"],
            ["plan", "看護計画"],
          ] as const
        ).map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`rounded px-3 py-0.5 ${tab === k ? "bg-ink font-bold text-white" : "text-ink-soft hover:text-ink"}`}>
            {label}
          </button>
        ))}
      </div>
      {tab === "care" ? <CarePart {...props} /> : <PlanPart {...props} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 看護ケア指示
// ---------------------------------------------------------------------------

function CarePart({ orders, records, plans, patientId, nowTime, sessionStart, fmtDay, newId, onOrders }: Props) {
  const me = useMe();
  const deny = useDeny()("nursing.plan");
  const nowAbs = minutesOf(nowTime);
  const [editing, setEditing] = useState<{ id: string | null; draft: CareDraft } | null>(null);
  const [stopping, setStopping] = useState<{ id: string; reason: string } | null>(null);
  const live = orders.filter((o) => careActive(o, nowAbs));
  const past = orders.filter((o) => !careActive(o, nowAbs));
  const open = plans.filter((p) => !p.closed);
  const now = { day: 0, time: nowTime };
  // Today's count per order: done (or recorded by the earlier shift) out of what is due so far.
  const today = (o: CareOrder) => {
    const day = Math.floor(nowAbs / 1440);
    const due = careSlots(o, day * 1440, nowAbs + 1);
    const done = due.filter((t) => ["実施", "記録済み"].includes(careState({ orderId: o.id, at: t }, records, sessionStart, nowAbs))).length;
    if (o.schedule.kind === "prn") return `今日 ${records.filter((r) => r.orderId === o.id && !r.voided && r.status === "実施" && Math.floor(r.at / 1440) === day).length}回`;
    return due.length ? `今日 済${done}/${due.length}` : "";
  };

  return (
    <>
      <p className="rounded-md bg-paper px-2 py-1.5 text-[12px] text-ink-soft">
        看護師が出すケア（して印をつける）と観察（見たことを選ぶか書く）の指示です。ワークシートに時刻ごとに出て、行ったら実施を記録します。経過表にも出ます。
      </p>

      <section>
        <h3 className="mb-1 font-bold">指示中（{live.length}件）</h3>
        {live.length === 0 && <p className="text-ink-faint">ありません。</p>}
        <ul className="space-y-1.5">
          {live.map((o) => {
            const plan = o.plan && plans.find((p) => p.id === o.plan!.problemId);
            return (
              <li key={o.id} className="rounded-md border border-rule px-2.5 py-1.5">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <KindBadge kind={o.kind} />
                  <b>{o.item}</b>
                  <span className="nums text-ink-soft">{scheduleLabel(o)}</span>
                  {plan && (
                    <span className="rounded bg-fuji-soft px-1 text-[11px] text-fuji" title={plan.problem}>
                      #{plan.no} {listLabel(o.plan!.list)}
                    </span>
                  )}
                  <span className="nums ml-auto text-[11px] text-ink-soft">{today(o)}</span>
                </div>
                {o.choices && <div className="text-[11px] text-ink-soft">選ぶ：{o.choices.join("・")}</div>}
                {o.unit && <div className="text-[11px] text-ink-soft">単位：{o.unit}</div>}
                {o.note && <div className="text-[12px]">{o.note}</div>}
                <div className="nums text-[11px] text-ink-faint">
                  {fmtDay(o.start.day)} {o.start.time}から{o.endDay !== undefined ? ` ${fmtDay(o.endDay)}まで` : ""}　指示 {fmtDay(o.at.day)} {o.at.time} {o.by}
                  {o.replaces ? "（変更）" : ""}
                </div>
                {stopping?.id === o.id ? (
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[12px]">
                    <input autoFocus value={stopping.reason} onChange={(e) => setStopping({ id: o.id, reason: e.target.value })} placeholder="中止の理由（例：自分で寝返りができるようになった）" aria-label="中止の理由" className={`${small} min-w-0 flex-1`} />
                    <button
                      type="button"
                      disabled={!stopping.reason.trim() || !!deny}
                      onClick={() => {
                        onOrders((all) => stopCare(all, o.id, me.name, now, stopping.reason.trim()), `看護ケア指示を中止：${o.item}（${stopping.reason.trim()}）`);
                        setStopping(null);
                      }}
                      className="rounded border border-shu px-2 py-0.5 font-bold text-shu disabled:opacity-40"
                    >
                      中止する（{nowTime}）
                    </button>
                    <button type="button" onClick={() => setStopping(null)} className="text-ink-faint">
                      やめる
                    </button>
                  </div>
                ) : (
                  <div className="mt-1 flex gap-2 text-[12px]">
                    <button type="button" disabled={!!deny} onClick={() => setEditing({ id: o.id, draft: draftFromOrder(o, nowTime) })} className="text-ai underline disabled:opacity-40">
                      変更
                    </button>
                    <button type="button" disabled={!!deny} onClick={() => setStopping({ id: o.id, reason: "" })} className="text-shu underline disabled:opacity-40">
                      中止
                    </button>
                  </div>
                )}
                {editing?.id === o.id && (
                  <CareEditor
                    draft={editing.draft}
                    onDraft={(draft) => setEditing({ id: o.id, draft })}
                    plans={open}
                    fmtDay={fmtDay}
                    nowTime={nowTime}
                    change
                    onCancel={() => setEditing(null)}
                    onSave={(d) => {
                      onOrders((all) => changeCare(all, o.id, d, newId(), me.name, now), `看護ケア指示を変更：${o.item} → ${d.item} ${scheduleLabel(d)}`);
                      setEditing(null);
                    }}
                  />
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {editing?.id === null ? (
        <CareEditor
          draft={editing.draft}
          onDraft={(draft) => setEditing({ id: null, draft })}
          plans={open}
          fmtDay={fmtDay}
          nowTime={nowTime}
          onCancel={() => setEditing(null)}
          onSave={(d) => {
            onOrders((all) => [...all, makeCareOrder(d, newId(), patientId, me.name, now)], `看護ケア指示を出した：${d.item} ${scheduleLabel(d)}`);
            setEditing(null);
          }}
        />
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" disabled={!!deny} onClick={() => setEditing({ id: null, draft: emptyCareDraft(nowTime) })} className="rounded-md border border-ai px-3 py-1.5 font-bold text-ai hover:bg-ai-soft disabled:opacity-40">
            ＋ ケア・観察の指示を出す
          </button>
          <DenyNote action="nursing.plan" />
        </div>
      )}

      {past.length > 0 && (
        <details className="text-[12px]">
          <summary className="cursor-pointer text-ink-soft">中止・終了した指示（{past.length}件）</summary>
          <ul className="mt-1 space-y-0.5">
            {past.map((o) => (
              <li key={o.id} className="nums text-ink-soft">
                {o.item}　{scheduleLabel(o)}　{fmtDay(o.start.day)} {o.start.time}〜{o.stopped ? `${fmtDay(o.stopped.at.day)} ${o.stopped.at.time} 中止（${o.stopped.reason}・${o.stopped.by}）` : o.endDay !== undefined ? `${fmtDay(o.endDay)} 終了` : ""}
                {(() => {
                  const n = records.filter((r) => r.orderId === o.id && !r.voided).length;
                  return n ? `　記録 ${n}件` : "";
                })()}
              </li>
            ))}
          </ul>
        </details>
      )}
      <p className="text-[11px] text-ink-faint">
        よく使う項目と既定の時刻、時刻の1時間前から記録できること・1時間過ぎて記録がないと遅れとして出すことは、架空の病院の取り決めです。記録の出典：
        <a href={CARE_SOURCES.record.url} target="_blank" rel="noreferrer" className="underline">
          {CARE_SOURCES.record.label}
        </a>
      </p>
    </>
  );
}

function KindBadge({ kind }: { kind: CareOrder["kind"] }) {
  return <span className={`rounded px-1 text-[11px] font-bold ${kind === "ケア" ? "bg-wakatake-soft text-wakatake" : "bg-ai-soft text-ai"}`}>{kind}</span>;
}

function CareEditor({ draft, onDraft, plans, fmtDay, nowTime, change, onCancel, onSave }: { draft: CareDraft; onDraft: (d: CareDraft) => void; plans: NursingProblem[]; fmtDay: (d: number) => string; nowTime: string; change?: boolean; onCancel: () => void; onSave: (d: CareDraft) => void }) {
  const deny = useDeny()("nursing.plan");
  const [timesText, setTimesText] = useState(draft.schedule.kind === "times" ? draft.schedule.times.join("、") : "");
  const [choicesText, setChoicesText] = useState(draft.choices.join("、"));
  const set = (x: Partial<CareDraft>) => onDraft({ ...draft, ...x });
  const s = draft.schedule;
  const miss = draftProblems(draft);
  // Day offsets from the day the page was opened (after midnight the clock runs on past 24:00).
  const days = Array.from({ length: 8 }, (_, i) => i);
  return (
    <section className="mt-2 space-y-2 rounded-md border border-ai/40 bg-ai-soft/20 p-3 text-[12px]">
      <h3 className="font-bold">{change ? "指示を変更する（前の指示は今止め、記録はそのまま残ります）" : "ケア・観察の指示を出す"}</h3>
      {!change && (
        <div>
          <div className="mb-1 text-ink-soft">よく使う項目（架空の病院の一覧）から選ぶか、自由に書く</div>
          <div className="flex flex-wrap gap-1">
            {CARE_ITEMS.map((it) => (
              <button
                key={it.item}
                type="button"
                onClick={() => {
                  const d = { ...draftFromItem(it.item, nowTime), plan: draft.plan, note: draft.note };
                  onDraft(d);
                  setTimesText(d.schedule.kind === "times" ? d.schedule.times.join("、") : "");
                  setChoicesText(d.choices.join("、"));
                }}
                className={`rounded border px-1.5 py-0.5 pointer-coarse:py-1.5 ${draft.item === it.item ? "border-ai bg-ai-soft font-bold" : "border-rule hover:bg-paper"}`}
              >
                {it.item}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="grid grid-cols-[5rem_1fr] items-center gap-x-2 gap-y-1.5">
        <span className="text-ink-soft">項目</span>
        <input value={draft.item} onChange={(e) => set({ item: e.target.value })} placeholder="例：右足の挙上" aria-label="項目" className={input} />
        <span className="text-ink-soft">種類</span>
        <div className="flex gap-3">
          {(["ケア", "観察"] as const).map((k) => (
            <label key={k} className="flex items-center gap-1">
              <input type="radio" checked={draft.kind === k} onChange={() => set({ kind: k })} className="accent-ai" />
              {k === "ケア" ? "ケア（して印をつける）" : "観察（見たことを記録する）"}
            </label>
          ))}
        </div>
        {draft.kind === "観察" && (
          <>
            <span className="text-ink-soft">答え方</span>
            <div className="flex flex-wrap items-center gap-1.5">
              <input
                value={choicesText}
                onChange={(e) => {
                  setChoicesText(e.target.value);
                  set({ choices: e.target.value.split(/[、,・]/).map((c) => c.trim()).filter(Boolean) });
                }}
                placeholder="選択肢を「、」で区切る（空なら言葉で書く）"
                aria-label="選択肢"
                className={`${small} min-w-0 flex-1`}
              />
              <input value={draft.unit} onChange={(e) => set({ unit: e.target.value })} placeholder="単位（kg など）" aria-label="単位" className={`${small} w-28`} />
            </div>
          </>
        )}
        <span className="text-ink-soft">いつ</span>
        <div className="space-y-1">
          <div className="flex flex-wrap gap-3">
            {(
              [
                ["times", "時刻を決める"],
                ["every", "N時間ごと"],
                ["prn", "必要時"],
              ] as const
            ).map(([k, label]) => (
              <label key={k} className="flex items-center gap-1">
                <input
                  type="radio"
                  checked={s.kind === k}
                  onChange={() => set({ schedule: k === "times" ? { kind: "times", times: parseTimes(timesText) } : k === "every" ? { kind: "every", hours: 2, from: "00:00" } : { kind: "prn" } })}
                  className="accent-ai"
                />
                {label}
              </label>
            ))}
          </div>
          {s.kind === "times" && (
            <div className="flex flex-wrap items-center gap-1.5">
              <input
                value={timesText}
                onChange={(e) => {
                  setTimesText(e.target.value);
                  set({ schedule: { kind: "times", times: parseTimes(e.target.value) } });
                }}
                placeholder="例：08:30、12:30、18:30"
                aria-label="時刻"
                className={`${small} nums w-52`}
              />
              <select value={draft.everyDays} onChange={(e) => set({ everyDays: Number(e.target.value) })} aria-label="何日ごと" className={small}>
                <option value={1}>毎日</option>
                <option value={2}>隔日</option>
                <option value={3}>3日ごと</option>
                <option value={7}>週1回</option>
              </select>
            </div>
          )}
          {s.kind === "every" && (
            <div className="flex flex-wrap items-center gap-1.5">
              <select value={s.hours} onChange={(e) => set({ schedule: { ...s, hours: Number(e.target.value) } })} aria-label="何時間ごと" className={small}>
                {EVERY_HOURS.map((h) => (
                  <option key={h} value={h}>
                    {h}時間ごと
                  </option>
                ))}
              </select>
              <select value={s.from} onChange={(e) => set({ schedule: { ...s, from: e.target.value } })} aria-label="起点の時刻" className={small}>
                {Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, "0")}:00`).map((t) => (
                  <option key={t} value={t}>
                    {Number(t.slice(0, 2))}時から
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
        <span className="text-ink-soft">期間</span>
        <div className="flex flex-wrap items-center gap-1.5">
          <select value={draft.startDay} onChange={(e) => set({ startDay: Number(e.target.value) })} aria-label="開始日" className={small}>
            {days.map((d) => (
              <option key={d} value={d}>
                {fmtDay(d)}
              </option>
            ))}
          </select>
          <input value={draft.startTime} onChange={(e) => set({ startTime: e.target.value })} aria-label="開始の時刻" className={`${small} nums w-16`} />
          から
          <select value={draft.endDay ?? ""} onChange={(e) => set({ endDay: e.target.value === "" ? undefined : Number(e.target.value) })} aria-label="終了日" className={small}>
            <option value="">終わりを決めない</option>
            {Array.from({ length: 15 }, (_, i) => i).map((d) => (
              <option key={d} value={d}>
                {fmtDay(d)}まで
              </option>
            ))}
          </select>
        </div>
        <span className="text-ink-soft">看護計画</span>
        <select
          value={draft.plan ? `${draft.plan.problemId}|${draft.plan.list}` : ""}
          onChange={(e) => {
            const [problemId, list] = e.target.value.split("|");
            set({ plan: e.target.value ? { problemId, list: list as PlanList } : undefined });
          }}
          aria-label="つなげる看護計画"
          className={small}
        >
          <option value="">つなげない</option>
          {plans.flatMap((p) =>
            PLAN_LISTS.map((l) => (
              <option key={`${p.id}|${l.key}`} value={`${p.id}|${l.key}`}>
                #{p.no} {p.problem.slice(0, 18)}… の{l.label}
              </option>
            )),
          )}
        </select>
        <span className="text-ink-soft">メモ</span>
        <input value={draft.note} onChange={(e) => set({ note: e.target.value })} placeholder="やり方や気をつけること" aria-label="メモ" className={input} />
      </div>
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button type="button" disabled={miss.length > 0 || !!deny} onClick={() => onSave(draft)} className="rounded-md bg-ai px-4 py-1.5 font-bold text-white disabled:opacity-40">
          {change ? "変更する" : "指示を出す"}（{nowTime}）
        </button>
        <button type="button" onClick={onCancel} className="rounded-md border border-rule px-3 py-1.5 text-ink-soft">
          やめる
        </button>
        {miss.length > 0 && <span className="text-yamabuki">未入力：{miss.join("・")}</span>}
        <DenyNote action="nursing.plan" />
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// 看護計画
// ---------------------------------------------------------------------------

const emptyBody = (): PlanBody => ({ problem: "", goal: "", op: [], tp: [], ep: [] });

function PlanPart({ orders, plans, patientId, nowTime, fmtDay, newId, onPlans }: Props) {
  const me = useMe();
  const deny = useDeny()("nursing.plan");
  const today = Math.floor(minutesOf(nowTime) / 1440);
  const now = { day: today, time: hhmm(minutesOf(nowTime)) };
  const open = plans.filter((p) => !p.closed).sort((a, b) => a.no - b.no);
  const closed = plans.filter((p) => p.closed).sort((a, b) => a.no - b.no);
  const [draft, setDraft] = useState<{ body: PlanBody; due: number } | null>(null);
  const [evaluating, setEvaluating] = useState<string | null>(null);
  const live = orders.filter((o) => careActive(o, minutesOf(nowTime)));

  return (
    <>
      <p className="rounded-md bg-paper px-2 py-1.5 text-[12px] text-ink-soft">
        患者ごとの看護の目標、具体的な看護の方法（観察・ケア・指導）と評価を記録します。評価予定日が今日か過ぎた問題は、看護師のやることに出ます。
      </p>
      {open.length === 0 && <p className="text-ink-faint">いま続いている看護問題はありません。</p>}
      {open.map((p) => (
        <ProblemCard key={p.id} p={p} orders={live} fmtDay={fmtDay} today={today}>
          {evaluating === p.id ? (
            <EvalForm
              p={p}
              today={today}
              fmtDay={fmtDay}
              nowTime={nowTime}
              onCancel={() => setEvaluating(null)}
              onSave={(e) => {
                onPlans((all) => evaluateProblem(all, p.id, e, me.name, now), `看護計画の評価：#${p.no} ${e.result}　${e.note}`);
                setEvaluating(null);
              }}
            />
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" disabled={!!deny} onClick={() => setEvaluating(p.id)} className="rounded border border-ai px-2.5 py-1 text-[12px] font-bold text-ai hover:bg-ai-soft disabled:opacity-40">
                評価する
              </button>
              <DenyNote action="nursing.plan" />
            </div>
          )}
        </ProblemCard>
      ))}

      {draft ? (
        <section className="space-y-2 rounded-md border border-ai/40 bg-ai-soft/20 p-3 text-[12px]">
          <h3 className="font-bold">看護問題を立案する（#{nextNo(plans, patientId)}）</h3>
          <label className="flex items-center gap-1.5">
            <span className="text-ink-soft">架空の病院の標準計画（例）から写す</span>
            <select value="" onChange={(e) => e.target.value && setDraft({ ...draft, body: structuredClone(PLAN_TEMPLATES[Number(e.target.value)].body) })} aria-label="標準計画から写す" className={small}>
              <option value="">選ばない</option>
              {PLAN_TEMPLATES.map((t, i) => (
                <option key={t.name} value={i}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <p className="text-[11px] text-ink-faint">写したあと、この患者に合わせて書き直してください。どれを使うかは看護師が決めます。</p>
          <BodyFields body={draft.body} onBody={(body) => setDraft({ ...draft, body })} />
          <DueSelect value={draft.due} today={today} fmtDay={fmtDay} onChange={(due) => setDraft({ ...draft, due })} label="評価予定日" />
          {(() => {
            const miss = planProblems(draft.body, draft.due, today);
            return (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  disabled={miss.length > 0 || !!deny}
                  onClick={() => {
                    onPlans((all) => addProblem(all, patientId, draft.body, draft.due, newId(), me.name, now), `看護計画を立案：#${nextNo(plans, patientId)} ${draft.body.problem.trim()}`);
                    setDraft(null);
                  }}
                  className="rounded-md bg-ai px-4 py-1.5 font-bold text-white disabled:opacity-40"
                >
                  立案する（{nowTime}）
                </button>
                <button type="button" onClick={() => setDraft(null)} className="rounded-md border border-rule px-3 py-1.5 text-ink-soft">
                  やめる
                </button>
                {miss.length > 0 && <span className="text-yamabuki">未入力：{miss.join("・")}</span>}
              </div>
            );
          })()}
        </section>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" disabled={!!deny} onClick={() => setDraft({ body: emptyBody(), due: defaultEvalDue(today) })} className="rounded-md border border-ai px-3 py-1.5 font-bold text-ai hover:bg-ai-soft disabled:opacity-40">
            ＋ 看護問題を立案する
          </button>
          <DenyNote action="nursing.plan" />
        </div>
      )}

      {closed.length > 0 && (
        <details className="text-[12px]">
          <summary className="cursor-pointer text-ink-soft">解決した問題（{closed.length}件）</summary>
          <div className="mt-1 space-y-1.5">
            {closed.map((p) => (
              <ProblemCard key={p.id} p={p} orders={[]} fmtDay={fmtDay} today={today} />
            ))}
          </div>
        </details>
      )}
      <p className="text-[11px] text-ink-faint">
        評価予定日の既定（立案日・前の評価日から{EVAL_INTERVAL_DAYS}日後）は架空の病院の取り決めで、看護師が変えられます。標準計画は架空の病院の例です。出典：
        <a href={PLAN_SOURCES.record.url} target="_blank" rel="noreferrer" className="underline">
          {PLAN_SOURCES.record.label}
        </a>
        ／{PLAN_SOURCES.ward.label}
      </p>
    </>
  );
}

function ProblemCard({ p, orders, fmtDay, today, children }: { p: NursingProblem; orders: CareOrder[]; fmtDay: (d: number) => string; today: number; children?: React.ReactNode }) {
  const st = evalStatus(p, today);
  return (
    <section className={`space-y-1.5 rounded-md border p-3 ${st?.late ? "border-shu/50" : st?.due ? "border-yamabuki/60" : "border-rule"}`}>
      <div className="flex flex-wrap items-baseline gap-2">
        <h3 className="font-bold">{problemTitle(p)}</h3>
        {st && <span className={`nums ml-auto text-[12px] ${st.late ? "font-bold text-shu" : st.due ? "font-bold text-yamabuki" : "text-ink-soft"}`}>{st.text}（{fmtDay(p.evalDue)}）</span>}
        {p.closed && <span className="nums ml-auto text-[12px] text-wakatake">解決 {fmtDay(p.closed.day)} {p.closed.by}</span>}
      </div>
      <dl className="grid grid-cols-[8.5rem_1fr] gap-y-1 text-[12px]">
        <dt className="text-ink-faint">目標</dt>
        <dd>{p.goal}</dd>
        {PLAN_LISTS.map((l) => {
          const items = p[l.key.toLowerCase() as "op" | "tp" | "ep"];
          const linked = ordersOf(orders, p.id, l.key);
          if (!items.length && !linked.length) return null;
          return (
            <div key={l.key} className="contents">
              <dt className="text-ink-faint">{l.long}</dt>
              <dd>
                <ul className="list-disc pl-4">
                  {items.map((x, i) => (
                    <li key={i}>{x}</li>
                  ))}
                </ul>
                {linked.length > 0 && (
                  <div className="mt-0.5 flex flex-wrap gap-1">
                    {linked.map((o) => (
                      <span key={o.id} className="nums rounded bg-fuji-soft px-1 text-[11px] text-fuji" title="この計画につながる看護ケア指示">
                        指示中：{o.item} {scheduleLabel(o)}
                      </span>
                    ))}
                  </div>
                )}
              </dd>
            </div>
          );
        })}
        <dt className="text-ink-faint">立案</dt>
        <dd className="nums">
          {fmtDay(p.plannedOn)} {p.plannedAt} {p.by}
        </dd>
      </dl>
      {p.evaluations.length > 0 && (
        <ol className="space-y-0.5 border-l-2 border-rule pl-2 text-[12px]">
          {p.evaluations.map((e, i) => (
            <li key={i} className="nums">
              {fmtDay(e.day)} {e.time} {e.by}：<b>{e.result}</b>　{e.note}
              {e.nextDue !== undefined && <span className="text-ink-faint">（次の評価 {fmtDay(e.nextDue)}）</span>}
              {e.before && <span className="block text-[11px] text-ink-faint">修正前：{e.before.goal}／{[...e.before.op, ...e.before.tp, ...e.before.ep].join("、")}</span>}
            </li>
          ))}
        </ol>
      )}
      {children}
    </section>
  );
}

function BodyFields({ body, onBody }: { body: PlanBody; onBody: (b: PlanBody) => void }) {
  const lines = (k: "op" | "tp" | "ep") => (
    <textarea value={body[k].join("\n")} onChange={(e) => onBody({ ...body, [k]: e.target.value.split("\n") })} rows={3} placeholder="1行に1つ" aria-label={PLAN_LISTS.find((l) => l.key.toLowerCase() === k)!.long} className={input} />
  );
  return (
    <div className="grid grid-cols-[8.5rem_1fr] items-start gap-x-2 gap-y-1.5">
      <span className="pt-1 text-ink-soft">看護問題</span>
      <input value={body.problem} onChange={(e) => onBody({ ...body, problem: e.target.value })} placeholder="ふつうの言葉で（例：ひとりで動こうとして転ぶおそれがある）" aria-label="看護問題" className={input} />
      <span className="pt-1 text-ink-soft">目標</span>
      <input value={body.goal} onChange={(e) => onBody({ ...body, goal: e.target.value })} placeholder="いつまでに、どうなるか" aria-label="目標" className={input} />
      {PLAN_LISTS.map((l) => (
        <div key={l.key} className="contents">
          <span className="pt-1 text-ink-soft">{l.long}</span>
          {lines(l.key.toLowerCase() as "op" | "tp" | "ep")}
        </div>
      ))}
    </div>
  );
}

function DueSelect({ value, today, fmtDay, onChange, label }: { value: number; today: number; fmtDay: (d: number) => string; onChange: (d: number) => void; label: string }) {
  return (
    <label className="flex flex-wrap items-center gap-1.5">
      <span className="text-ink-soft">{label}</span>
      <select value={value} onChange={(e) => onChange(Number(e.target.value))} aria-label={label} className={small}>
        {Array.from({ length: 14 }, (_, i) => today + 1 + i).map((d) => (
          <option key={d} value={d}>
            {fmtDay(d)}（{d - today}日後）
          </option>
        ))}
      </select>
      <span className="text-[11px] text-ink-faint">既定は{EVAL_INTERVAL_DAYS}日後（架空の病院の取り決め）</span>
    </label>
  );
}

const RESULT_HINT: Record<EvalResult, string> = { 継続: "計画を変えずに続ける", 修正: "計画を書き直して続ける", 解決: "目標に届いた・問題がなくなった" };

function EvalForm({ p, today, fmtDay, nowTime, onCancel, onSave }: { p: NursingProblem; today: number; fmtDay: (d: number) => string; nowTime: string; onCancel: () => void; onSave: (e: { result: EvalResult; note: string; nextDue?: number; revised?: PlanBody }) => void }) {
  const deny = useDeny()("nursing.plan");
  const [result, setResult] = useState<EvalResult>("継続");
  const [note, setNote] = useState("");
  const [nextDue, setNextDue] = useState(defaultEvalDue(today));
  const [revised, setRevised] = useState<PlanBody>({ problem: p.problem, goal: p.goal, op: [...p.op], tp: [...p.tp], ep: [...p.ep] });
  const e = { result, note, ...(result !== "解決" ? { nextDue } : {}), ...(result === "修正" ? { revised } : {}) };
  const miss = evalProblems(p, e, today);
  return (
    <div className="space-y-2 rounded-md border border-rule bg-paper p-2.5 text-[12px]">
      <div className="flex flex-wrap gap-3">
        {EVAL_RESULTS.map((r) => (
          <label key={r} className="flex items-center gap-1">
            <input type="radio" checked={result === r} onChange={() => setResult(r)} className="accent-ai" />
            <b>{r}</b>
            <span className="text-ink-faint">{RESULT_HINT[r]}</span>
          </label>
        ))}
      </div>
      <textarea value={note} onChange={(x) => setNote(x.target.value)} rows={2} placeholder="目標に対してどうだったか（見たこと・本人の言葉）" aria-label="評価の内容" className={input} />
      {result === "修正" && <BodyFields body={revised} onBody={setRevised} />}
      {result !== "解決" && <DueSelect value={nextDue} today={today} fmtDay={fmtDay} onChange={setNextDue} label="次の評価予定日" />}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={miss.length > 0 || !!deny} onClick={() => onSave(e)} className="rounded-md bg-ai px-3 py-1 font-bold text-white disabled:opacity-40">
          評価を記録（{nowTime}）
        </button>
        <button type="button" onClick={onCancel} className="rounded-md border border-rule px-3 py-1 text-ink-soft">
          やめる
        </button>
        {miss.length > 0 && <span className="text-yamabuki">未入力：{miss.join("・")}</span>}
      </div>
    </div>
  );
}
