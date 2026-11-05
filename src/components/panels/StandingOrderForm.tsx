"use client";

import { addDays, daysFrom, isoDate, type CalendarDate } from "@/lib/dates";
import { periodText } from "@/lib/standing-calendar";
import { useState } from "react";
import { HOSPITAL_LINE_TEMPLATES, LINE_CATS, currentLines, calendarRows, linesFromFields, loadMyTemplates, saveMyTemplates, templateProblems, type LineCat, type LineTemplate, type StandingLine } from "@/lib/standing-lines";
import { ADMISSION_TEMPLATE, CATEGORY_LABELS, STANDING_CHOICES, STANDING_SOURCES, composeStandingText, splitStandingText } from "@/lib/standing-form";
import type { StandingOrders } from "@/lib/standing";
import { CosignMark } from "../Cosign";
import { standingLineRef } from "@/lib/standing-cosign";
import { useDeny, useMe } from "../RoleContext";

export function StandingOrderForm({ lines, versions, nowTime, fmtDay, newId, onAdd, onStop, onEditFields, fieldEditor, today, patientId, onAdmissionTemplate }: {
  onAdmissionTemplate?: () => void;
  patientId?: string;
  lines: StandingLine[]; versions: StandingOrders[]; nowTime: string; fmtDay: (d: number) => string;
  fieldEditor?: React.ReactNode; today?: CalendarDate;
  newId: () => string; onAdd: (l: StandingLine) => void; onStop: (id: string, reason: string) => void; onEditFields: () => void;
}) {
  const dateValue = (d: number) => today ? isoDate(addDays(today, d)) : String(d);
  const parseDay = (v: string) => { if (!today) return Number(v); const [y, m, d] = v.split("-").map(Number); return daysFrom(today, { y, m, d }); };
  const me = useMe();
  const deny = useDeny();
  const canOrder = !deny("order");
  const [startDay, setStartDay] = useState(0);
  const [until, setUntil] = useState<number | undefined>();
  const [cat, setCat] = useState<LineCat>("安静");
  const [choice, setChoice] = useState("");
  const [comment, setComment] = useState("");
  const [selected, setSelected] = useState<StandingLine | null>(null);
  const [reason, setReason] = useState("");
  const [templates, setTemplates] = useState(false);
  const [mine, setMine] = useState<LineTemplate[]>(() => loadMyTemplates(me.name));
  const [notice, setNotice] = useState("");
  const all = [...lines, ...linesFromFields(versions)];
  const text = composeStandingText(choice, comment);
  const active = selected && !selected.stop && !selected.end;
  const reset = () => { setSelected(null); setStartDay(0); setUntil(undefined); setChoice(""); setComment(""); setReason(""); setNotice(""); };
  const pick = (c: LineCat, t: string) => { setCat(c); const v = splitStandingText(c, t); setChoice(v.choice); setComment(v.comment); setNotice(""); };
  const select = (l: StandingLine) => { setSelected(l); setStartDay(0); setUntil(l.end?.day); pick(l.cat, l.text); setReason(""); if (l.fromFields && canOrder) onEditFields(); };
  const save = () => {
    if ((until !== undefined && until < startDay) || !text || !canOrder || selected?.fromFields) return;
    if (selected && currentLines(lines).some((l) => l.id === selected.id)) onStop(selected.id, reason || "指示を修正");
    onAdd({ id: newId(), cat, text, start: { day: startDay, ...(startDay === 0 ? { time: nowTime } : {}) }, end: until === undefined ? undefined : { day: until }, by: me.name, at: { day: 0, time: nowTime } });
    reset();
  };
  return <div className="grid items-start gap-4 text-[12px] md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
    <section className="min-w-0" aria-label="現在の指示">
      <h3 className="mb-2 font-bold">現在の指示</h3>
      {calendarRows(all).map(({ cat: c, lines: rows }) => <section key={c} className="mb-3">
        <h4 className="border-b border-rule bg-paper px-2 py-1 font-bold">{CATEGORY_LABELS[c] ?? c}</h4>
        {rows.map((l) => {
          const live = currentLines(all).some((x) => x.id === l.id) && !(l.end && (l.end.day < 0 || (l.end.day === 0 && !!l.end.time && l.end.time <= nowTime)));
          return <button key={l.id} type="button" onClick={() => select(l)} aria-pressed={selected?.id === l.id} className={`block w-full border-b border-rule-soft p-2 text-left hover:bg-ai-soft ${selected?.id === l.id ? "bg-ai-soft" : ""}`}>
            <div className={`whitespace-pre-wrap ${live ? "" : "text-ink-faint line-through"}`}>{l.text}</div>
            <div className="text-[11px] text-ink-soft">{periodText(l, fmtDay)}</div>
            <div className="mt-1 text-[11px] text-ink-soft">{l.by}　{fmtDay(l.at.day)} {l.at.time}　{live ? l.start.day > 0 ? "予定" : "有効" : l.stop ? "中止" : "終了"}</div>
            {patientId && <CosignMark refId={standingLineRef(patientId, l.id)} />}
            {patientId && l.stop && <CosignMark refId={standingLineRef(patientId, l.id, true)} />}
            {l.stop && <div className="text-[11px] text-ink-faint">中止：{l.stop.by} {fmtDay(l.stop.day)} {l.stop.time} {l.stop.reason}</div>}
          </button>;
        })}
      </section>)}
      {!all.length && <p className="text-ink-faint">指示はまだありません。</p>}
    </section>
    <section className="min-w-0 space-y-3 md:sticky md:top-0" aria-label="指示の入力">
      {fieldEditor ?? <>
      <div className="flex justify-between"><h3 className="font-bold">{selected ? "指示を修正・中止" : "新規指示"}</h3><button type="button" onClick={reset} className="text-ai">新規に戻る</button></div>
      <label className="block">カテゴリ<select aria-label="指示のカテゴリ" value={cat} disabled={!canOrder || !!selected?.fromFields} onChange={(e) => { setCat(e.target.value as LineCat); setChoice(""); }} className="mt-1 block w-full rounded border border-rule bg-sheet p-2">{LINE_CATS.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c] ?? c}</option>)}</select></label>
      {!!STANDING_CHOICES[cat] && <label className="block">選択肢<select aria-label="指示の選択肢" value={choice} disabled={!canOrder || !!selected?.fromFields} onChange={(e) => setChoice(e.target.value)} className="mt-1 block w-full rounded border border-rule bg-sheet p-2"><option value="">選択してください（自由入力もできます）</option>{STANDING_CHOICES[cat]!.map((c) => <option key={c}>{c}</option>)}</select></label>}
      <label className="block">フリーコメント<textarea aria-label="指示のフリーコメント" value={comment} disabled={!canOrder || !!selected?.fromFields} onChange={(e) => setComment(e.target.value)} rows={6} className="mt-1 block w-full rounded border border-rule bg-sheet p-2" /></label>
      <div className="flex flex-wrap gap-2">
        <label>開始日<input type={today ? "date" : "number"} aria-label="指示の開始日" value={dateValue(startDay)} disabled={!canOrder || !!selected} onChange={(e) => e.target.value && setStartDay(parseDay(e.target.value))} className="block w-24 rounded border border-rule p-1" /><span>{fmtDay(startDay)}</span></label>
        <label>終了日（空欄は変えるまで）<input type={today ? "date" : "number"} aria-label="指示の終了日" value={until === undefined ? "" : dateValue(until)} disabled={!canOrder || !!selected?.fromFields} onChange={(e) => setUntil(e.target.value === "" ? undefined : parseDay(e.target.value))} className="block w-24 rounded border border-rule p-1" /><span>{until === undefined ? "変えるまで続く" : fmtDay(until)}</span></label>
      </div>
      {until !== undefined && until < startDay && <p role="alert" className="text-shu">終了日を開始日以降にしてください。</p>}
      {selected?.fromFields ? <button type="button" disabled={!canOrder} onClick={onEditFields} className="rounded border border-ai px-3 py-2 text-ai">この指示を項目で修正・中止する</button> : <>
        {selected && <label className="block">修正・中止の理由（任意）<input value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1 block w-full rounded border border-rule p-2" /></label>}
        <div className="flex flex-wrap gap-2"><button type="button" disabled={!canOrder || !text || (until !== undefined && until < startDay) || (!!selected && !currentLines(lines).some((l) => l.id === selected.id))} onClick={save} className="rounded bg-ai px-4 py-2 font-bold text-white disabled:opacity-40">{selected ? "修正を確定" : "指示を追加"}</button>
        {selected && <button type="button" disabled={!canOrder || (!active && !currentLines(lines).some((l) => l.id === selected.id))} onClick={() => { onStop(selected.id, reason); reset(); }} className="rounded border border-shu px-3 py-2 text-shu disabled:opacity-40">中止</button>}</div>
      </>}
      <p className="hint text-ink-faint">カテゴリ・選択肢・条件の例は架空の病院の取り決めです。医師が患者の状態に合わせて直し、確定します。修正前の行は中止履歴に残ります。自由文の薬の量・間隔・アレルギーは自動で確認しません。Dr.call は医師への連絡です。</p>
      <button type="button" aria-expanded={templates} onClick={() => setTemplates(!templates)} className="rounded border border-rule px-3 py-2">テンプレート</button>
      {templates && <div className="space-y-2 rounded border border-rule p-2">
        <p className="hint text-ink-faint">架空の病院の取り決め。自分のテンプレートは記事と同じく、利用者ごとにこの端末のみに保存されます。</p>
        <button type="button" disabled={!canOrder} onClick={onAdmissionTemplate} className="block p-1 text-ai">{ADMISSION_TEMPLATE.label}</button>
        <p className="hint text-ink-faint">{ADMISSION_TEMPLATE.hint}</p>
        <div className="max-h-72 space-y-1 overflow-y-auto">{[...mine, ...HOSPITAL_LINE_TEMPLATES].map((t) => <button key={t.id} type="button" disabled={!canOrder || !!selected?.fromFields} onClick={() => { pick(t.cat, t.text); setTemplates(false); }} className="block w-full border-b border-rule-soft p-1 text-left hover:bg-ai-soft"><span className="text-ink-faint">{CATEGORY_LABELS[t.cat] ?? t.cat}：</span>{t.text}</button>)}</div>
        {STANDING_SOURCES.map((s) => <p key={s.url} className="hint"><a href={s.url} target="_blank" rel="noreferrer" className="underline">{s.label}</a></p>)}
      </div>}
      <button type="button" disabled={!canOrder || !text} onClick={() => { const errors = templateProblems(cat, text, mine); if (errors.length) return setNotice(errors.join(" ")); const next = [...mine, { id: newId(), cat, text }]; setMine(next); setNotice(saveMyTemplates(me.name, next) ? "自分のテンプレートに保存しました。" : "端末に保存できません。ページを閉じるまで使えます。"); }} className="block text-ai disabled:opacity-40">この文を自分のテンプレートに保存</button>
      {notice && <p role="status">{notice}</p>}
      </>}
    </section>
  </div>;
}
