"use client";

import { ArrowRight, Clock, FilePlus2, ShieldAlert, TriangleAlert, X } from "lucide-react";
import { useState } from "react";
import { auditLog } from "@/lib/audit";
import { addDays, formatShort, type CalendarDate } from "@/lib/dates";
import {
  DAY_CHOICES,
  FACTORS,
  KINDS,
  LEVELS,
  LEVEL_SOURCE,
  PLACES,
  PURPOSE_NOTE,
  PURPOSE_SOURCE,
  STATUSES,
  atLeast,
  countByStatus,
  emptyDraft,
  filterReports,
  levelInfo,
  levelNotes,
  missingOf,
  nextStatus,
  timeProblems,
  toReport,
  patientLabel,
  type IncidentDraft,
  type IncidentKind,
  type IncidentPatient,
  type IncidentReport,
  type IncidentStatus,
  type Level,
  type LevelNote,
  type Moment,
  type StatusChange,
} from "@/lib/incident";
import { useMe } from "./RoleContext";
import { TabChoice } from "./TabChoice";

interface Props {
  reports: IncidentReport[];
  /** Patients who can be named in a report. */
  patients: IncidentPatient[];
  today: CalendarDate;
  nowTime: string;
  onSubmit: (r: IncidentReport) => void;
  /** The status moved on; `change` says who and when (the parent can use applyStatus). */
  onStatus: (id: string, status: IncidentStatus, change: StatusChange) => void;
  /** The form being written, when the parent keeps it (so it survives switching screens). */
  draft?: IncidentDraft;
  onDraft?: (d: IncidentDraft) => void;
}

let seq = 0;
const newId = () => `inc-${Date.now()}-${++seq}`;

const input = "rounded-md border border-rule bg-sheet px-2 py-1.5 text-[13px] text-ink outline-none focus:border-ai pointer-coarse:py-2";
const STATUS_STYLE: Record<IncidentStatus, string> = {
  報告済: "bg-yamabuki-soft text-yamabuki",
  医療安全管理室で確認中: "bg-ai-soft text-ai",
  対策済: "bg-wakatake-soft text-wakatake",
};
const levelStyle = (l: Level) => (atLeast(l, "3b") ? "border-shu/50 bg-shu-soft text-shu" : atLeast(l, "2") ? "border-yamabuki/50 bg-yamabuki-soft text-yamabuki" : "border-rule bg-paper text-ink-soft");

/** インシデントレポート: write a report, see past ones, and move each through 報告済 → 確認中 → 対策済. */
export function IncidentView({ reports, patients, today, nowTime, onSubmit, onStatus, draft, onDraft }: Props) {
  const me = useMe();
  const [ownDraft, setOwnDraft] = useState<IncidentDraft>(emptyDraft);
  const d = draft ?? ownDraft;
  const setD = onDraft ?? setOwnDraft;
  const [mode, setMode] = useState<"form" | string | null>(null);
  const [kind, setKind] = useState<IncidentKind | "">("");
  const [level, setLevel] = useState<Level | "">("");
  const [status, setStatus] = useState<IncidentStatus | "all">("all");

  const counts = countByStatus(reports);
  const shown = filterReports(reports, { kind: kind || null, level: level || null, status: status === "all" ? null : status });
  const open = mode && mode !== "form" ? (reports.find((r) => r.id === mode) ?? null) : null;
  const when = (m: Moment) => `${formatShort(addDays(today, m.day))} ${m.time}`;

  const submit = () => {
    const p = patients.find((x) => x.id === d.patientId);
    const r = toReport(d, { id: newId(), reporter: { role: me.role, name: me.name }, now: { day: 0, time: nowTime }, patient: p ? { id: p.id, room: p.room, name: p.name } : undefined });
    onSubmit(r);
    auditLog({ role: me.role, actor: me.name, action: "インシデントレポートを出した", patient: p?.name, detail: `${r.kind}・レベル${r.level}・${r.place}${r.placeNote ? `（${r.placeNote}）` : ""}` });
    setD(emptyDraft());
    setMode(r.id);
  };

  const advance = (r: IncidentReport) => {
    const next = nextStatus(r.status);
    if (!next) return;
    const change: StatusChange = { status: next, by: me.name, at: { day: 0, time: nowTime } };
    onStatus(r.id, next, change);
    auditLog({ role: me.role, actor: me.name, action: "インシデントレポートの状態を変えた", patient: r.patient?.name, detail: `${r.kind}・レベル${r.level}：${r.status} → ${next}` });
  };

  return (
    <section aria-label="インシデントレポート" className="flex min-h-0 flex-1 flex-col bg-paper text-[13px]">
      <header className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-rule bg-sheet px-5 py-3">
        <h1 className="flex items-center gap-2 text-lg font-bold">
          <ShieldAlert size={20} className="text-shu" />
          インシデントレポート
          <span className="rounded border border-dashed border-ink-faint px-1.5 py-0.5 text-[10px] font-normal text-ink-soft">架空</span>
        </h1>
        <p className="nums flex flex-wrap gap-x-3 text-sm text-ink-soft">
          {STATUSES.map((s) => (
            <span key={s}>
              {s} <b className="text-ink">{counts[s]}</b>件
            </span>
          ))}
        </p>
        <button type="button" onClick={() => setMode("form")} className="ml-auto flex items-center gap-1.5 rounded-md bg-ink px-3 py-1.5 text-sm font-bold text-white hover:bg-ink/90 pointer-coarse:py-2">
          <FilePlus2 size={15} />
          報告を書く
        </button>
      </header>
      <p className="border-b border-rule-soft bg-wakatake-soft/60 px-5 py-1.5 text-[12px] text-wakatake" title={PURPOSE_SOURCE}>
        {PURPOSE_NOTE}
      </p>

      <div className="flex min-h-0 flex-1">
        <nav aria-label="報告の一覧" className="flex min-h-0 w-[min(420px,42%)] shrink-0 flex-col border-r border-rule bg-sheet">
          <div className="space-y-2 border-b border-rule-soft p-3 text-[12px] text-ink-soft">
            <div className="flex flex-wrap gap-2">
              <select value={kind} onChange={(e) => setKind(e.target.value as IncidentKind | "")} aria-label="種類で絞り込む" className="rounded-md border border-rule bg-sheet px-1.5 py-1 text-[12px] text-ink pointer-coarse:py-1.5">
                <option value="">すべての種類</option>
                {KINDS.map((k) => (
                  <option key={k}>{k}</option>
                ))}
              </select>
              <select value={level} onChange={(e) => setLevel(e.target.value as Level | "")} aria-label="影響度レベルで絞り込む" className="rounded-md border border-rule bg-sheet px-1.5 py-1 text-[12px] text-ink pointer-coarse:py-1.5">
                <option value="">すべてのレベル</option>
                {LEVELS.map((l) => (
                  <option key={l.level} value={l.level}>
                    レベル {l.level}
                  </option>
                ))}
              </select>
            </div>
            <TabChoice label="状態で絞り込む" options={[{ value: "all", label: "すべて" }, ...STATUSES.map((s) => ({ value: s, label: s }))]} value={status} onChange={(v) => setStatus(v as IncidentStatus | "all")} />
          </div>
          <ul className="scroll-thin min-h-0 flex-1 overflow-y-auto">
            {shown.length === 0 && <li className="px-4 py-6 text-ink-faint">当てはまる報告はありません。</li>}
            {shown.map((r) => (
              <li key={r.id} className="border-b border-rule-soft">
                <button
                  type="button"
                  onClick={() => setMode(r.id)}
                  aria-current={r.id === mode ? "true" : undefined}
                  className={`flex w-full flex-col gap-1 px-4 py-2.5 text-left pointer-coarse:py-3.5 ${r.id === mode ? "bg-ai-soft" : "hover:bg-paper"}`}
                >
                  <span className="flex flex-wrap items-center gap-1.5 text-[11px]">
                    <span className={`nums rounded border px-1 font-bold ${levelStyle(r.level)}`}>レベル {r.level}</span>
                    <span className="font-bold text-ink">{r.kind}</span>
                    <span className={`rounded px-1 ${STATUS_STYLE[r.status]}`}>{r.status}</span>
                    <span className="nums ml-auto text-ink-faint">発生 {when(r.occurred)}</span>
                  </span>
                  <span className="line-clamp-2 leading-snug text-ink">{r.what}</span>
                  <span className="text-[11px] text-ink-faint">
                    {r.place}
                    {r.placeNote ? `（${r.placeNote}）` : ""}
                    {r.patient ? `・${patientLabel(r.patient)}` : ""}・{r.reporter.name}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <p className="border-t border-rule-soft px-4 py-2 text-[10px] text-ink-faint">架空の病院の報告です。足りない項目と時刻の確かめ、レベルごとの次にすることはコードで出します。影響度レベルは報告する人が選びます。AI は使っていません。試作なので、報告はこのブラウザの中だけにあります。</p>
        </nav>

        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto p-5">
          {mode === "form" ? (
            <IncidentForm draft={d} setDraft={setD} patients={patients} nowTime={nowTime} reporter={`${me.role}　${me.name}`} onCancel={() => setMode(null)} onSubmit={submit} />
          ) : open ? (
            <IncidentDetail report={open} when={when} onAdvance={() => advance(open)} />
          ) : (
            <p className="text-ink-faint">左の一覧から報告を選ぶと、ここに出ます。新しく報告するときは「報告を書く」を押してください。</p>
          )}
        </div>
      </div>
    </section>
  );
}

function Notes({ notes }: { notes: LevelNote[] }) {
  return (
    <ul className="space-y-1.5">
      {notes.map((n, i) => (
        <li key={i} className={`rounded-md border px-3 py-1.5 text-[12px] ${n.urgent ? "border-shu/50 bg-shu-soft/60 font-bold text-shu" : "border-rule-soft bg-paper text-ink"}`}>
          <span className="flex items-start gap-1.5">
            {n.urgent && <TriangleAlert size={13} className="mt-0.5 shrink-0" />}
            <span>{n.text}</span>
          </span>
          <span className="mt-0.5 block text-[10px] font-normal text-ink-faint">
            {n.rule}
            {n.source ? `：${n.source}` : ""}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-1.5">
      <h3 className="text-[12px] font-bold text-ink-soft">{title}</h3>
      {children}
    </section>
  );
}

function IncidentDetail({ report: r, when, onAdvance }: { report: IncidentReport; when: (m: Moment) => string; onAdvance: () => void }) {
  const next = nextStatus(r.status);
  const info = levelInfo(r.level);
  return (
    <article className="mx-auto max-w-3xl space-y-4 rounded-lg border border-rule bg-sheet p-5">
      <div>
        <div className="flex flex-wrap items-center gap-2 text-[12px]">
          <span className={`nums rounded border px-1.5 py-0.5 font-bold ${levelStyle(r.level)}`}>レベル {r.level}</span>
          <span className={`rounded px-1.5 py-0.5 ${STATUS_STYLE[r.status]}`}>{r.status}</span>
        </div>
        <h2 className="mt-1 text-base font-bold">
          {r.kind}
          {r.kindNote ? `（${r.kindNote}）` : ""}
        </h2>
      </div>
      <dl className="nums grid grid-cols-[6rem_1fr] gap-x-3 gap-y-1 text-[12px]">
        <dt className="text-ink-soft">発生</dt>
        <dd>{when(r.occurred)}</dd>
        <dt className="text-ink-soft">発見</dt>
        <dd>{when(r.found)}</dd>
        <dt className="text-ink-soft">場所</dt>
        <dd>
          {r.place}
          {r.placeNote ? `（${r.placeNote}）` : ""}
        </dd>
        <dt className="text-ink-soft">患者</dt>
        <dd>{r.patient ? patientLabel(r.patient) : "なし・特定しない"}</dd>
        <dt className="text-ink-soft">報告した人</dt>
        <dd>
          {r.reporter.role}　{r.reporter.name}（{when(r.reportedAt)}）
        </dd>
      </dl>
      <Section title="影響度レベル">
        <p className="text-[12px]">
          <b>レベル {info.level}</b>
          <span className="ml-2 text-ink-soft">
            {info.continuity}
            {info.degree ? `・${info.degree}` : ""}
          </span>
          ：{info.text}
        </p>
      </Section>
      <Section title="何が起きたか">
        <p className="whitespace-pre-wrap leading-relaxed">{r.what}</p>
      </Section>
      <Section title="その後の対応">
        <p className="whitespace-pre-wrap leading-relaxed">{r.response}</p>
      </Section>
      <Section title="要因">
        {r.factors.length ? (
          <p className="flex flex-wrap gap-1">
            {r.factors.map((f) => (
              <span key={f} className="rounded bg-tab px-1.5 py-0.5 text-[12px]">
                {f}
              </span>
            ))}
          </p>
        ) : (
          <p className="text-ink-faint">書かれていません</p>
        )}
      </Section>
      <Section title="再発防止の案">
        <p className="whitespace-pre-wrap leading-relaxed">{r.prevention || <span className="text-ink-faint">書かれていません</span>}</p>
      </Section>
      <Section title="このレベルで次にすること">
        <Notes notes={levelNotes(r.level)} />
      </Section>
      <Section title="状態の記録">
        <ol className="space-y-0.5 text-[12px]">
          {r.log.map((c, i) => (
            <li key={i} className="nums flex items-center gap-1.5">
              <Clock size={11} className="text-ink-faint" />
              {when(c.at)}　<b>{c.status}</b>　{c.by}
            </li>
          ))}
        </ol>
        {next ? (
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button type="button" onClick={onAdvance} className="flex items-center gap-1.5 rounded-md border border-ai px-3 py-1.5 font-bold text-ai hover:bg-ai hover:text-white pointer-coarse:py-2">
              <ArrowRight size={14} />
              「{next}」にする
            </button>
            <span className="text-[11px] text-ink-faint">この試作では、医療安全管理室の担当者の代わりに、いま入っている職種で進められます。</span>
          </div>
        ) : (
          <p className="text-[12px] text-wakatake">対策まで終わっています。</p>
        )}
      </Section>
    </article>
  );
}

function DayTime({ label, day, time, onDay, onTime, extra }: { label: string; day: number | null; time: string; onDay: (d: number) => void; onTime: (t: string) => void; extra?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-16 text-[12px] text-ink-soft">{label}</span>
      <TabChoice label={`${label}の日`} options={DAY_CHOICES} value={day} onChange={onDay} />
      <input type="time" value={time} onChange={(e) => onTime(e.target.value)} aria-label={`${label}の時刻`} className={`${input} nums w-28`} />
      {extra}
    </div>
  );
}

function IncidentForm({
  draft: d,
  setDraft,
  patients,
  nowTime,
  reporter,
  onCancel,
  onSubmit,
}: {
  draft: IncidentDraft;
  setDraft: (d: IncidentDraft) => void;
  patients: IncidentPatient[];
  nowTime: string;
  reporter: string;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const set = (x: Partial<IncidentDraft>) => setDraft({ ...d, ...x });
  const missing = missingOf(d);
  const problems = timeProblems(d, nowTime);
  const small = "rounded border border-rule px-2 py-0.5 text-[11px] text-ink-soft hover:border-ai hover:text-ai pointer-coarse:py-1.5";
  return (
    <form
      className="mx-auto max-w-3xl space-y-4 rounded-lg border border-rule bg-sheet p-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!missing.length && !problems.length) onSubmit();
      }}
    >
      <div className="flex items-center justify-between">
        <h2 className="font-bold">インシデントレポートを書く</h2>
        <button type="button" onClick={onCancel} aria-label="閉じる（書いた内容は残ります）" className="rounded p-1 text-ink-faint hover:bg-paper hover:text-ink">
          <X size={16} />
        </button>
      </div>
      <p className="rounded-md bg-yamabuki-soft px-3 py-2 text-[12px] text-yamabuki">架空の病院の報告です。実在の患者・職員の情報は書かないでください。</p>
      <p className="text-[12px] text-ink-soft">
        報告する人：<b className="text-ink">{reporter}</b>（右上で選んだ職種）
      </p>

      <Section title="いつ">
        <DayTime
          label="発生"
          day={d.occurredDay}
          time={d.occurredTime}
          onDay={(v) => set({ occurredDay: v })}
          onTime={(v) => set({ occurredTime: v })}
          extra={
            <button type="button" onClick={() => set({ occurredDay: 0, occurredTime: nowTime })} className={small}>
              いま（{nowTime}）
            </button>
          }
        />
        <DayTime
          label="発見"
          day={d.foundDay}
          time={d.foundTime}
          onDay={(v) => set({ foundDay: v })}
          onTime={(v) => set({ foundTime: v })}
          extra={
            <>
              <button type="button" disabled={d.occurredDay === null} onClick={() => set({ foundDay: d.occurredDay, foundTime: d.occurredTime })} className={`${small} disabled:opacity-40`}>
                発生と同じ
              </button>
              <button type="button" onClick={() => set({ foundDay: 0, foundTime: nowTime })} className={small}>
                いま（{nowTime}）
              </button>
            </>
          }
        />
      </Section>

      <Section title="場所">
        <TabChoice label="場所" options={PLACES.map((p) => ({ value: p, label: p }))} value={d.place} onChange={(v) => set({ place: v })} />
        <input value={d.placeNote} onChange={(e) => set({ placeNote: e.target.value })} placeholder={d.place === "その他" ? "どこか（必須）" : "病棟名など（なくてもかまいません）"} aria-label="場所の詳しいこと" className={`${input} w-full`} />
      </Section>

      <Section title="患者（いるときだけ）">
        <select value={d.patientId ?? ""} onChange={(e) => set({ patientId: e.target.value || null })} aria-label="患者" className={`${input} w-full`}>
          <option value="">なし・特定しない</option>
          {patients.map((p) => (
            <option key={p.id} value={p.id}>
              {p.room} {p.name}
            </option>
          ))}
        </select>
      </Section>

      <Section title="種類">
        <TabChoice label="種類" options={KINDS.map((k) => ({ value: k, label: k }))} value={d.kind} onChange={(v) => set({ kind: v })} />
        {d.kind === "その他" && <input value={d.kindNote} onChange={(e) => set({ kindNote: e.target.value })} placeholder="どんな種類か（必須）" aria-label="種類（その他の内容）" className={`${input} w-full`} />}
      </Section>

      <Section title="影響度レベル（報告する人が選びます）">
        <fieldset className="m-0 min-w-0 space-y-1 border-0 p-0">
          <legend className="sr-only">影響度レベル</legend>
          {LEVELS.map((l) => (
            <label key={l.level} className={`flex cursor-pointer items-start gap-2 rounded-md border px-2.5 py-1.5 pointer-coarse:py-2.5 ${d.level === l.level ? "border-ai bg-ai-soft" : "border-rule-soft hover:bg-paper"}`}>
              <input type="radio" name="incident-level" value={l.level} checked={d.level === l.level} onChange={() => set({ level: l.level })} className="mt-0.5 accent-ai pointer-coarse:size-4" />
              <span className="nums w-16 shrink-0 font-bold">レベル {l.level}</span>
              <span className="w-28 shrink-0 text-[11px] text-ink-soft">
                {l.continuity}
                {l.degree ? `・${l.degree}` : ""}
              </span>
              <span className="text-[12px] leading-snug">{l.text}</span>
            </label>
          ))}
        </fieldset>
        <p className="text-[10px] text-ink-faint">出典：{LEVEL_SOURCE}</p>
        {d.level && (
          <div className="pt-1">
            <h4 className="mb-1 text-[12px] font-bold text-ink-soft">レベル {d.level} で次にすること</h4>
            <Notes notes={levelNotes(d.level)} />
          </div>
        )}
      </Section>

      <Section title="何が起きたか">
        <textarea value={d.what} onChange={(e) => set({ what: e.target.value })} rows={4} aria-label="何が起きたか" placeholder="見たこと・したことを、起きた順に書きます" className={`${input} w-full resize-y leading-relaxed`} />
      </Section>
      <Section title="その後の対応">
        <textarea value={d.response} onChange={(e) => set({ response: e.target.value })} rows={3} aria-label="その後の対応" placeholder="誰に伝えたか・何をしたか・患者の様子" className={`${input} w-full resize-y leading-relaxed`} />
      </Section>
      <Section title="要因（わかる範囲で。いくつでも）">
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          {FACTORS.map((f) => (
            <label key={f} className="flex items-center gap-1.5 text-[12px]">
              <input type="checkbox" checked={d.factors.includes(f)} onChange={(e) => set({ factors: e.target.checked ? [...d.factors, f] : d.factors.filter((x) => x !== f) })} className="accent-ai pointer-coarse:size-4" />
              {f}
            </label>
          ))}
        </div>
      </Section>
      <Section title="再発防止の案（わかる範囲で）">
        <textarea value={d.prevention} onChange={(e) => set({ prevention: e.target.value })} rows={3} aria-label="再発防止の案" placeholder="人ではなく、仕組み（手順・道具・環境）をどう変えるか" className={`${input} w-full resize-y leading-relaxed`} />
      </Section>

      <div className="flex flex-wrap items-center gap-3 border-t border-rule-soft pt-3">
        <div className="space-y-0.5 text-[12px]">
          {missing.length > 0 && <p className="text-yamabuki">まだ：{missing.join("・")}</p>}
          {problems.map((p) => (
            <p key={p} className="font-bold text-shu">
              {p}
            </p>
          ))}
        </div>
        <button type="submit" disabled={missing.length > 0 || problems.length > 0} className="ml-auto flex items-center gap-1.5 rounded-md bg-ai px-4 py-1.5 font-bold text-white disabled:opacity-40 pointer-coarse:py-2">
          <ShieldAlert size={14} />
          報告する
        </button>
      </div>
    </form>
  );
}
