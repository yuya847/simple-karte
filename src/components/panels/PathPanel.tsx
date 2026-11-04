"use client";

import { Check, Minus, Route, X } from "lucide-react";
import { useState } from "react";
import { auditLog } from "@/lib/audit";
import { addDays, formatShort, type CalendarDate } from "@/lib/dates";
import type { Draft } from "@/lib/drafts";
import {
  PATHWAYS,
  PATH_RULES,
  PATH_SOURCES,
  VARIANCE_CATEGORIES,
  VARIANCE_HINTS,
  activePath,
  dueOutcomes,
  evalDeny,
  evalLine,
  evalOf,
  expandPath,
  findPath,
  itemConfirmed,
  itemKey,
  keysFrom,
  orderKindLabel,
  orderLabel,
  pathDayOf,
  type PathApplication,
  type PathBook,
  type PathOutcome,
  type Pathway,
  type Variance,
  type VarianceCategory,
} from "@/lib/pathway";
import type { OrderEntry, Patient } from "@/lib/types";
import { DenyNote, useDeny, useMe } from "../RoleContext";

interface Props {
  patient: Patient;
  book: PathBook;
  onBook: (f: (b: PathBook) => PathBook) => void;
  entries: OrderEntry[];
  today: CalendarDate;
  nowTime: string;
  newId: () => string;
  /** Put drafts under the note (the doctor confirms them there), with a message. */
  onDrafts: (ds: Draft[], flash: string) => void;
  /** A line into the chart, written by the person (a confirmed note). */
  onNote: (line: string) => void;
}

const btn = "rounded-md border border-rule px-2 py-0.5 pointer-coarse:py-1.5";

/** クリティカルパス in the chart: apply one (doctor), the overview by day, today's outcomes, variances, and leaving or ending it. */
export function PathPanel({ patient, book, onBook, entries, today, nowTime, newId, onDrafts, onNote }: Props) {
  const me = useMe();
  const deny = useDeny();
  const app = activePath(book, patient.id);
  const ended = book.apps.filter((a) => a.patientId === patient.id && a.end);
  const fmt = (d: number) => formatShort(addDays(today, d));
  const at = { day: 0, time: nowTime };
  return (
    <div className="space-y-3 text-[13px]">
      <p className="text-[11px] text-ink-faint">
        {PATH_RULES.content}
        {PATH_RULES.drugs}
      </p>
      {app ? (
        <Active app={app} path={findPath(app.code)!} book={book} onBook={onBook} entries={entries} fmt={fmt} at={at} newId={newId} onDrafts={onDrafts} onNote={onNote} patientName={patient.name} />
      ) : deny("order") ? (
        <section className="space-y-1">
          <p className="text-ink-soft">この患者に使っているパスはありません。</p>
          <DenyNote action="order" />
        </section>
      ) : (
        <Apply patient={patient} fmt={fmt} onApply={(path, startDay, keys) => {
          const a: PathApplication = { id: newId(), patientId: patient.id, code: path.code, startDay, by: me.name, at, expanded: keys };
          onBook((b) => ({ ...b, apps: [...b.apps, a] }));
          const ds = expandPath(path, startDay, keys, newId);
          auditLog({ role: me.role, actor: me.name, action: "確定（クリティカルパスの適用）", patient: patient.name, detail: `${path.name}　1日目 ${fmt(startDay)}　オーダの下書き ${ds.length}件` });
          onNote(`・クリティカルパス「${path.name}」を適用（1日目：${fmt(startDay)}、標準 ${path.length}日）`);
          onDrafts(ds, `パス「${path.name}」を適用し、${ds.length}件を下書きにしました。記事の下でそれぞれ確かめて確定してください。`);
        }} />
      )}
      {ended.length > 0 && (
        <section className="text-[12px] text-ink-soft">
          <h3 className="font-bold">終わったパス</h3>
          {ended.map((a) => (
            <p key={a.id}>
              {findPath(a.code)?.name}（1日目 {fmt(a.startDay)}）：{a.end!.kind} {fmt(a.end!.at.day)} {a.end!.at.time} {a.end!.by}
              {a.end!.reason ? `「${a.end!.reason}」` : ""}
            </p>
          ))}
        </section>
      )}
      <p className="text-[11px] text-ink-faint">
        出典（機能）：
        <a href={PATH_SOURCES.spec.url} target="_blank" rel="noreferrer" className="underline">
          {PATH_SOURCES.spec.label}
        </a>
      </p>
    </div>
  );
}

/** The doctor chooses a path, the 1日目, and which orders to put in as drafts (from today's path day on, at first). */
function Apply({ patient, fmt, onApply }: { patient: Patient; fmt: (d: number) => string; onApply: (p: Pathway, startDay: number, keys: string[]) => void }) {
  const [code, setCode] = useState<string | null>(null);
  const [start, setStart] = useState(patient.admittedOn);
  const [keys, setKeys] = useState<string[]>([]);
  const path = code ? findPath(code) : undefined;
  const pick = (p: Pathway, s: number) => {
    setCode(p.code);
    setStart(s);
    setKeys(keysFrom(p, 1 - s));
  };
  return (
    <section className="space-y-2">
      <h3 className="flex items-center gap-1 font-bold">
        <Route size={14} />
        パスを選ぶ（使うかどうかは医師が決めます）
      </h3>
      <ul className="space-y-1.5">
        {PATHWAYS.map((p) => (
          <li key={p.code}>
            <button type="button" onClick={() => pick(p, start)} className={`w-full rounded-md border px-3 py-2 text-left pointer-coarse:py-3 ${code === p.code ? "border-ai bg-ai-soft" : "border-rule bg-sheet hover:border-ai"}`}>
              <b>{p.name}</b>
              <span className="ml-2 text-[12px] text-ink-soft">標準 {p.length}日</span>
              <span className="block text-[11px] text-ink-faint">
                対象：{p.target}。{p.exclusions}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {path && (
        <section className="space-y-2 rounded-md border border-rule bg-paper p-2">
          <div className="flex flex-wrap items-center gap-2 text-[12px]">
            <span className="font-bold">1日目</span>
            {[
              { d: patient.admittedOn, label: `入院日（${fmt(patient.admittedOn)}）` },
              ...(patient.admittedOn !== 0 ? [{ d: 0, label: `今日（${fmt(0)}）` }] : []),
            ].map((x) => (
              <label key={x.d} className="flex items-center gap-1">
                <input type="radio" name="path-start" checked={start === x.d} onChange={() => pick(path, x.d)} className="accent-ai" />
                {x.label}
              </label>
            ))}
            <span className="text-ink-faint">今日は {pathDayOf({ startDay: start }, 0)}日目</span>
          </div>
          <p className="hint text-[11px] text-ink-faint">今日より前の日のオーダは、はじめはチェックを外しています。要らないものはチェックを外してから下書きにします。採る時刻・撮り方などは、下書きの確かめで選びます。</p>
          <ul className="space-y-1">
            {path.days
              .filter((d) => d.orders.length)
              .map((d) => (
                <li key={d.day}>
                  <div className="text-[11px] font-bold text-ink-soft">
                    {d.day}日目（{fmt(start + d.day - 1)}）
                  </div>
                  {d.orders.map((it, i) => {
                    const k = itemKey(d.day, i);
                    return (
                      <label key={k} className="flex items-center gap-2 pl-2 pointer-coarse:py-1">
                        <input type="checkbox" checked={keys.includes(k)} onChange={() => setKeys((ks) => (ks.includes(k) ? ks.filter((x) => x !== k) : [...ks, k]))} className="accent-ai" />
                        <span className="w-14 text-[11px] text-ink-faint">{orderKindLabel(it)}</span>
                        {orderLabel(it)}
                      </label>
                    );
                  })}
                </li>
              ))}
          </ul>
          <button type="button" onClick={() => onApply(path, start, keys)} className="w-full rounded-md bg-ai px-3 py-2 font-bold text-white">
            パスを適用し、選んだ {keys.length}件を下書きにする
          </button>
        </section>
      )}
    </section>
  );
}

type Mark = "達成" | "未達成" | "未評価" | "予定";

function Active({ app, path, book, onBook, entries, fmt, at, newId, onDrafts, onNote, patientName }: { app: PathApplication; path: Pathway; book: PathBook; onBook: Props["onBook"]; entries: OrderEntry[]; fmt: (d: number) => string; at: { day: number; time: string }; newId: () => string; onDrafts: Props["onDrafts"]; onNote: Props["onNote"]; patientName: string }) {
  const me = useMe();
  const deny = useDeny();
  const now = pathDayOf(app, 0);
  const mine = book.variances.filter((v) => v.appId === app.id);
  const due = dueOutcomes(book, app, now);
  const [failing, setFailing] = useState<string | null>(null);
  const [vCat, setVCat] = useState<VarianceCategory | "">("");
  const [vText, setVText] = useState("");
  const [free, setFree] = useState<{ sign: Variance["sign"]; category: VarianceCategory | ""; detail: string } | null>(null);
  const [left, setLeft] = useState<string[]>([]);
  const [ending, setEnding] = useState<{ kind: "完了" | "離脱"; reason: string; category: VarianceCategory | "" } | null>(null);
  const mark = (d: number, o: PathOutcome): Mark => evalOf(book, app.id, o.key)?.result ?? (d <= now ? "未評価" : "予定");
  const notExpanded = path.days.flatMap((d) => d.orders.map((it, i) => ({ d: d.day, it, k: itemKey(d.day, i) }))).filter((x) => !app.expanded.includes(x.k) && x.d >= now);

  const record = (d: number, o: PathOutcome, result: "達成" | "未達成", v?: { category: VarianceCategory; detail: string }) => {
    const variance: Variance | null = v ? { id: newId(), appId: app.id, day: d, outcomeKey: o.key, sign: "負", category: v.category, detail: v.detail, by: me.name, at } : null;
    onBook((b) => ({ ...b, evals: [...b.evals, { id: newId(), appId: app.id, day: d, key: o.key, result, by: me.name, role: me.role, at }], variances: variance ? [...b.variances, variance] : b.variances }));
    auditLog({ role: me.role, actor: me.name, action: "確定（パスのアウトカム評価）", patient: patientName, detail: `${path.name} ${d}日目「${o.text}」：${result}${v ? `　バリアンス：${v.category}「${v.detail}」` : ""}` });
    onNote(evalLine(path, d, o, result, v));
    setFailing(null);
    setVCat("");
    setVText("");
  };

  return (
    <>
      <header className="flex flex-wrap items-center gap-2 rounded-md border border-ai/40 bg-ai-soft/40 px-3 py-2">
        <Route size={16} className="text-ai" />
        <b>{path.name}</b>
        <span className="nums text-[12px] text-ink-soft">
          1日目 {fmt(app.startDay)}・標準 {path.length}日・今日は <b className="text-ink">{now}日目</b>
        </span>
        {now > path.length && <span className="rounded bg-yamabuki-soft px-1.5 text-[11px] font-bold text-yamabuki">標準の日数を {now - path.length}日 過ぎています</span>}
        <span className="ml-auto text-[11px] text-ink-faint">
          適用：{app.by} {fmt(app.at.day)} {app.at.time}
        </span>
      </header>

      <section aria-label="パスの全日程" className="scroll-thin overflow-x-auto">
        <table className="min-w-full border-collapse text-[11px]">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 w-20 border-b border-rule bg-sheet px-1 py-1 text-left font-normal text-ink-faint" />
              {path.days.map((d) => (
                <th key={d.day} className={`min-w-28 border-b border-l border-rule px-1 py-1 text-left font-normal ${d.day === now ? "bg-ai-soft font-bold text-ink" : "text-ink-soft"}`}>
                  {d.day}日目
                  <span className="nums ml-1 text-ink-faint">{fmt(app.startDay + d.day - 1)}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(
              [
                ["オーダ", (d: Pathway["days"][number]) => d.orders.map((it, i) => {
                  const k = itemKey(d.day, i);
                  const done = itemConfirmed(path, entries, d.day, it);
                  return (
                    <div key={k} className={done ? "text-ink" : app.expanded.includes(k) ? "text-ai" : "text-ink-faint"}>
                      {orderLabel(it)}
                      <span className="ml-0.5 text-[10px]">{done ? "（確定）" : app.expanded.includes(k) ? "（下書き）" : ""}</span>
                    </div>
                  );
                })],
                ["観察・ケア", (d: Pathway["days"][number]) => d.care.map((c) => <div key={c}>{c}</div>)],
                ["アウトカム", (d: Pathway["days"][number]) => d.outcomes.map((o) => {
                  const m = mark(d.day, o);
                  return (
                    <div key={o.key} className={m === "未達成" ? "text-shu" : m === "未評価" ? "text-yamabuki" : m === "達成" ? "text-wakatake" : "text-ink-soft"}>
                      {m === "達成" ? <Check size={11} className="inline" /> : m === "未達成" ? <X size={11} className="inline" /> : m === "未評価" ? <Minus size={11} className="inline" /> : null}
                      {o.text}
                      <span className="ml-0.5 text-[10px] text-ink-faint">（{o.who}）</span>
                    </div>
                  );
                })],
                ["バリアンス", (d: Pathway["days"][number]) => {
                  const n = mine.filter((v) => v.day === d.day).length;
                  return n ? <b className="text-shu">{n}件</b> : null;
                }],
              ] as const
            ).map(([label, cell]) => (
              <tr key={label} className="align-top">
                <th className="sticky left-0 z-10 border-b border-rule bg-sheet px-1 py-1 text-left font-bold text-ink-soft">{label}</th>
                {path.days.map((d) => (
                  <td key={d.day} className={`space-y-0.5 border-b border-l border-rule px-1 py-1 ${d.day === now ? "bg-ai-soft/50" : ""}`}>
                    {cell(d)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section aria-label="今日のアウトカム" className="space-y-1.5 rounded-md border border-rule p-2">
        <h3 className="font-bold">今日（{now}日目）までのアウトカムで、評価がまだのもの</h3>
        {due.length === 0 ? (
          <p className="text-wakatake">評価がまだのものはありません。</p>
        ) : (
          due.map(({ day: d, outcome: o }) => {
            const why = evalDeny(o, me.role);
            return (
              <div key={o.key} className="rounded border border-rule-soft bg-sheet px-2 py-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="nums text-[11px] text-ink-faint">{d}日目</span>
                  <span className="flex-1">{o.text}</span>
                  {why ? (
                    <span className="text-[11px] text-ink-faint">{why}</span>
                  ) : (
                    <>
                      <button type="button" onClick={() => record(d, o, "達成")} className="rounded-md bg-wakatake px-2 py-0.5 font-bold text-white">
                        達成
                      </button>
                      <button type="button" onClick={() => setFailing(failing === o.key ? null : o.key)} className="rounded-md border border-shu px-2 py-0.5 font-bold text-shu">
                        未達成
                      </button>
                    </>
                  )}
                </div>
                {failing === o.key && (
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[12px]">
                    <span className="text-shu">バリアンスの理由：</span>
                    <select value={vCat} onChange={(e) => setVCat(e.target.value as VarianceCategory)} aria-label="バリアンスの分類" className="rounded border border-rule bg-paper px-1 py-0.5">
                      <option value="">分類を選ぶ</option>
                      {VARIANCE_CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {c}（{VARIANCE_HINTS[c]}）
                        </option>
                      ))}
                    </select>
                    <input value={vText} onChange={(e) => setVText(e.target.value)} placeholder="何があったか（例：38.2℃の発熱が続く）" aria-label="バリアンスの内容" className="min-w-48 flex-1 rounded border border-rule bg-paper px-1 py-0.5" />
                    <button type="button" disabled={!vCat || !vText.trim()} onClick={() => vCat && record(d, o, "未達成", { category: vCat, detail: vText.trim() })} className="rounded-md bg-shu px-2 py-0.5 font-bold text-white disabled:opacity-40">
                      未達成として記録
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </section>

      <section aria-label="バリアンス" className="space-y-1.5 rounded-md border border-rule p-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-bold">バリアンス（{mine.length}件）</h3>
          {(me.role === "医師" || me.role === "看護師") && !free && (
            <button type="button" onClick={() => setFree({ sign: "負", category: "", detail: "" })} className={`${btn} text-xs`}>
              ＋ バリアンスを記録（アウトカムのほか：予定の変更・早まりなど）
            </button>
          )}
        </div>
        <p className="text-[11px] text-ink-faint">{PATH_RULES.variance}</p>
        {free && (
          <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
            <select value={free.sign} onChange={(e) => setFree({ ...free, sign: e.target.value as Variance["sign"] })} aria-label="バリアンスの向き" className="rounded border border-rule bg-paper px-1 py-0.5">
              <option value="負">負（遅れ・外れ）</option>
              <option value="正">正（予定より早い）</option>
            </select>
            <select value={free.category} onChange={(e) => setFree({ ...free, category: e.target.value as VarianceCategory })} aria-label="バリアンスの分類" className="rounded border border-rule bg-paper px-1 py-0.5">
              <option value="">分類を選ぶ</option>
              {VARIANCE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <input value={free.detail} onChange={(e) => setFree({ ...free, detail: e.target.value })} placeholder="何があったか" aria-label="バリアンスの内容" className="min-w-48 flex-1 rounded border border-rule bg-paper px-1 py-0.5" />
            <button
              type="button"
              disabled={!free.category || !free.detail.trim()}
              onClick={() => {
                const v: Variance = { id: newId(), appId: app.id, day: now, sign: free.sign, category: free.category as VarianceCategory, detail: free.detail.trim(), by: me.name, at };
                onBook((b) => ({ ...b, variances: [...b.variances, v] }));
                auditLog({ role: me.role, actor: me.name, action: "確定（パスのバリアンス）", patient: patientName, detail: `${path.name} ${now}日目 ${v.sign}：${v.category}「${v.detail}」` });
                onNote(`・パス（${path.name} ${now}日目）バリアンス（${v.sign}）：${v.category}「${v.detail}」`);
                setFree(null);
              }}
              className="rounded-md bg-ai px-2 py-0.5 font-bold text-white disabled:opacity-40"
            >
              記録する
            </button>
            <button type="button" onClick={() => setFree(null)} className={`${btn} text-xs`}>
              やめる
            </button>
          </div>
        )}
        {mine.length > 0 && (
          <table className="w-full border-collapse text-[12px]">
            <tbody>
              {mine.map((v) => (
                <tr key={v.id} className="border-t border-rule-soft align-top">
                  <td className="nums w-14 py-0.5 text-ink-faint">{v.day}日目</td>
                  <td className={`w-8 py-0.5 font-bold ${v.sign === "負" ? "text-shu" : "text-wakatake"}`}>{v.sign}</td>
                  <td className="w-32 py-0.5">{v.category}</td>
                  <td className="py-0.5">
                    {v.detail}
                    {v.outcomeKey && <span className="ml-1 text-[11px] text-ink-faint">（アウトカム未達成）</span>}
                  </td>
                  <td className="nums w-36 py-0.5 text-right text-[11px] text-ink-faint">
                    {v.by} {fmt(v.at.day)} {v.at.time}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {!deny("order") && notExpanded.length > 0 && (
        <section aria-label="まだ下書きにしていないオーダ" className="space-y-1 rounded-md border border-rule p-2">
          <h3 className="font-bold">まだ下書きにしていないオーダ（今日から先）</h3>
          {notExpanded.map((x) => (
            <label key={x.k} className="flex items-center gap-2 pointer-coarse:py-1">
              <input type="checkbox" checked={left.includes(x.k)} onChange={() => setLeft((l) => (l.includes(x.k) ? l.filter((y) => y !== x.k) : [...l, x.k]))} className="accent-ai" />
              <span className="nums w-24 text-[11px] text-ink-faint">
                {x.d}日目（{fmt(app.startDay + x.d - 1)}）
              </span>
              {orderLabel(x.it)}
            </label>
          ))}
          <button
            type="button"
            disabled={!left.length}
            onClick={() => {
              const ds = expandPath(path, app.startDay, left, newId);
              onBook((b) => ({ ...b, apps: b.apps.map((a) => (a.id === app.id ? { ...a, expanded: [...a.expanded, ...left] } : a)) }));
              onDrafts(ds, `パスから ${ds.length}件を下書きにしました。確かめて確定してください。`);
              setLeft([]);
            }}
            className="rounded-md bg-ai px-3 py-1 font-bold text-white disabled:opacity-40"
          >
            選んだ {left.length}件を下書きにする
          </button>
        </section>
      )}

      <section aria-label="パスを終える" className="space-y-1.5 rounded-md border border-rule p-2">
        {deny("order") ? (
          <p className="text-[12px] text-ink-soft">パスを終える・パスから外れるのは医師が決めます。</p>
        ) : !ending ? (
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setEnding({ kind: "完了", reason: "", category: "" })} className={`${btn} border-wakatake text-wakatake`}>
              パスを終える（完了・退院）
            </button>
            <button type="button" onClick={() => setEnding({ kind: "離脱", reason: "", category: "" })} className={`${btn} border-shu text-shu`}>
              パスから外れる（離脱）
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
            <b className={ending.kind === "離脱" ? "text-shu" : "text-wakatake"}>{ending.kind === "離脱" ? "離脱の理由" : "完了のメモ（任意）"}</b>
            {ending.kind === "離脱" && (
              <select value={ending.category} onChange={(e) => setEnding({ ...ending, category: e.target.value as VarianceCategory })} aria-label="離脱の分類" className="rounded border border-rule bg-paper px-1 py-0.5">
                <option value="">分類を選ぶ</option>
                {VARIANCE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            )}
            <input value={ending.reason} onChange={(e) => setEnding({ ...ending, reason: e.target.value })} placeholder={ending.kind === "離脱" ? "例：心不全を合併し治療を変えた" : "例：予定どおり退院"} aria-label="理由" className="min-w-48 flex-1 rounded border border-rule bg-paper px-1 py-0.5" />
            <button
              type="button"
              disabled={ending.kind === "離脱" && (!ending.category || !ending.reason.trim())}
              onClick={() => {
                const end = { kind: ending.kind, by: me.name, at, reason: ending.reason.trim() };
                const v: Variance | null = ending.kind === "離脱" ? { id: newId(), appId: app.id, day: now, sign: "負", category: ending.category as VarianceCategory, detail: `パスから離脱：${ending.reason.trim()}`, by: me.name, at } : null;
                onBook((b) => ({ ...b, apps: b.apps.map((a) => (a.id === app.id ? { ...a, end } : a)), variances: v ? [...b.variances, v] : b.variances }));
                auditLog({ role: me.role, actor: me.name, action: ending.kind === "離脱" ? "確定（パスから離脱）" : "確定（パスを完了）", patient: patientName, detail: `${path.name} ${now}日目${end.reason ? `　${end.reason}` : ""}` });
                onNote(`・クリティカルパス「${path.name}」を${ending.kind === "離脱" ? "離脱" : "完了"}（${now}日目）${end.reason ? `：${end.reason}` : ""}`);
                setEnding(null);
              }}
              className={`rounded-md px-2 py-0.5 font-bold text-white disabled:opacity-40 ${ending.kind === "離脱" ? "bg-shu" : "bg-wakatake"}`}
            >
              {ending.kind === "離脱" ? "離脱を確定" : "完了を確定"}
            </button>
            <button type="button" onClick={() => setEnding(null)} className={`${btn} text-xs`}>
              やめる
            </button>
          </div>
        )}
      </section>
    </>
  );
}
