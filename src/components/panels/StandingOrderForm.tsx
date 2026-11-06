"use client";

import { displayText } from "@/lib/display-text";
import { addDays, daysFrom, isoDate, type CalendarDate } from "@/lib/dates";
import { periodText } from "@/lib/standing-calendar";
import { useState } from "react";
import { HOSPITAL_LINE_TEMPLATES, LINE_CATS, currentLines, categoryFromTitle, standingTitle, newestLines, linesFromFields, loadMyTemplates, saveMyTemplates, templateProblems, type LineCat, type LineTemplate, type StandingLine } from "@/lib/standing-lines";
import { CATEGORY_LABELS, STANDING_SOURCES } from "@/lib/standing-form";
import type { StandingOrders } from "@/lib/standing";
import { CosignMark } from "../Cosign";
import { standingLineRef } from "@/lib/standing-cosign";
import { useDeny, useMe } from "../RoleContext";

export function StandingOrderForm({ lines, versions, nowTime, fmtDay, newId, onAdd, onStop, onEditFields, fieldEditor, today, patientId, initialSelection, onEndFields }: {
  onEndFields?: (line: StandingLine) => void;
  initialSelection?: StandingLine;
  onAdmissionTemplate?: () => void;
  patientId?: string;
  lines: StandingLine[]; versions: StandingOrders[]; nowTime: string; fmtDay: (d: number) => string;
  fieldEditor?: React.ReactNode; today?: CalendarDate;
  newId: () => string; onAdd: (l: StandingLine) => void; onStop: (id: string, reason: string, day?: number, kind?: "終了") => void; onEditFields: (line?: StandingLine) => void;
}) {
  const dateValue = (d: number) => today ? isoDate(addDays(today, d)) : String(d);
  const parseDay = (v: string) => { if (!today) return Number(v); const [y, m, d] = v.split("-").map(Number); return daysFrom(today, { y, m, d }); };
  const me = useMe();
  const deny = useDeny();
  const canOrder = !deny("order");
  const [startDay, setStartDay] = useState(0);
  const [until, setUntil] = useState<number | undefined>(initialSelection?.end?.day);
  const [cat, setCat] = useState<LineCat>(initialSelection?.cat ?? "その他");
  const [text, setText] = useState(initialSelection?.text ?? "");
  const [manualCat, setManualCat] = useState(false);
  const [showCat, setShowCat] = useState(false);
  const [selected, setSelected] = useState<StandingLine | null>(initialSelection ?? null);
  const [ending, setEnding] = useState(false);
  const [endDay, setEndDay] = useState(0);
  const [reason, setReason] = useState("");
  const [templates, setTemplates] = useState(false);
  const [mine, setMine] = useState<LineTemplate[]>(() => loadMyTemplates(me.name));
  const [notice, setNotice] = useState("");
  const all = [...lines, ...linesFromFields(versions)];
  const active = selected && currentLines(lines).some((l) => l.id === selected.id);
  const reset = () => { setEnding(false); setSelected(null); setStartDay(0); setUntil(undefined); setText(""); setCat("その他"); setManualCat(false); setShowCat(false); setReason(""); setNotice(""); };
  const pick = (c: LineCat, t: string) => { setCat(c); setText(t); setManualCat(c !== categoryFromTitle(standingTitle(t))); setNotice(""); };
  const select = (l: StandingLine) => { setEnding(false); setSelected(l); setStartDay(0); setUntil(l.end?.day); pick(l.cat, l.text); setReason(""); if (l.fromFields && canOrder) onEditFields(l); };
  const save = () => {
    if ((until !== undefined && until < startDay) || !text.trim() || !canOrder || selected?.fromFields) return;
    onAdd({ id: newId(), cat, text, changedFrom: selected?.id, changeReason: reason, start: { day: startDay, ...(startDay === 0 ? { time: nowTime } : {}) }, end: until === undefined ? undefined : { day: until }, by: me.name, at: { day: 0, time: nowTime } });
    reset();
  };
  return <div className="grid items-start gap-4 text-[12px] md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
    <section className="min-w-0" aria-label="現在の指示">
      <h3 className="mb-2 font-bold">現在の指示</h3>
      {newestLines(all).map((l) => {
          const live = currentLines(all).some((x) => x.id === l.id) && !(l.end && (l.end.day < 0 || (l.end.day === 0 && !!l.end.time && l.end.time <= nowTime)));
          return <div key={l.id}><button type="button" onClick={() => select(l)} aria-pressed={selected?.id === l.id} className={`block w-full border-b border-rule-soft p-2 text-left hover:bg-ai-soft ${selected?.id === l.id ? "bg-ai-soft" : ""}`}>
            <div className={`font-bold ${live ? "" : "text-ink-faint"}`}>{displayText(standingTitle(l.text))}</div>
            <div className="text-[11px] text-ink-soft">{displayText(periodText(l, fmtDay))}</div>
            <div className="mt-1 text-[11px] text-ink-soft">{displayText(l.by)}　{fmtDay(l.at.day)} {l.at.time}　{live ? l.start.day > 0 ? "予定" : "有効" : l.changed ? "変更前" : l.stop ? l.stop.kind ?? "中止" : "終了"}</div>
            {patientId && <CosignMark refId={standingLineRef(patientId, l.id)} />}
            {patientId && l.stop && <CosignMark refId={standingLineRef(patientId, l.id, true)} />}
            {l.changed && <div className="text-ink-faint">変更前：{fmtDay(l.changed.day)} {l.changed.time} {displayText(l.changed.by)} {displayText(l.changed.reason)}</div>}{l.stop && <div className="text-[11px] text-ink-faint">{l.stop.kind ?? "中止"}：{displayText(l.stop.by)} {fmtDay(l.stop.day)} {l.stop.time} {displayText(l.stop.reason)}</div>}
          </button>{l.text.includes("\n") && <details className="px-2"><summary className="cursor-pointer text-ink-soft">本文を開く</summary><div className="whitespace-pre-wrap">{displayText(l.text.slice(l.text.indexOf("\n") + 1))}</div></details>}{live && canOrder && <div className="flex gap-3 p-1"><button type="button" disabled={l.start.day > 0} onClick={() => { setEnding(false); select(l); }}>指示を変更</button><button type="button" onClick={() => { if (l.fromFields) { onEndFields?.(l); return; } select(l); setEnding(true); setEndDay(0); }}>指示を終了</button></div>}</div>;
        })}
      {!all.length && <p className="text-ink-faint">指示はまだありません。</p>}
    </section>
    <section className="min-w-0 space-y-3 md:sticky md:top-0" aria-label="指示の入力">
      {fieldEditor ?? <>
      <div className="flex justify-between"><h3 className="font-bold">{displayText(selected ? `${ending ? "終了" : "変更"}：元の指示 ${selected.text}` : "新規指示")}</h3><button type="button" onClick={reset} className="text-ai">新規に戻る</button></div>
      <label className="block">指示（1行目は見出し、2行目以降は本文）<textarea aria-label="指示の見出しと本文" value={text} disabled={!canOrder || !!selected?.fromFields} onChange={(e) => { setText(e.target.value); if (!manualCat && !selected) setCat(categoryFromTitle(standingTitle(e.target.value))); }} rows={12} className="mt-1 block w-full rounded border border-rule bg-sheet p-2" /></label>
      <div className="text-[11px] text-ink-soft"><button type="button" aria-expanded={showCat} onClick={() => setShowCat(!showCat)}>分類：{cat}{cat === "頓用" ? "（ワークシートの頓用の欄に出ます）" : ""}</button>{showCat && <select aria-label="指示の分類" value={cat} disabled={!canOrder || !!selected} onChange={(e) => { setCat(e.target.value as LineCat); setManualCat(true); }}>{LINE_CATS.map((c) => <option key={c}>{c}</option>)}</select>}</div>
      <div className="font-bold">指示期間：開始日 〜 終了日</div>
      <label className="block"><input type="checkbox" checked={until !== undefined} disabled={!canOrder || !!selected?.fromFields} onChange={(e) => setUntil(e.target.checked ? startDay : undefined)} /> 終了日を決める（指示迄）</label>
      <div className="flex flex-wrap gap-2">
        <label>開始日<input type={today ? "date" : "number"} aria-label="指示の開始日" value={dateValue(startDay)} disabled={!canOrder || !!selected} onChange={(e) => e.target.value && setStartDay(parseDay(e.target.value))} className="block w-24 rounded border border-rule p-1" /><span>{fmtDay(startDay)}</span></label>
        <label>終了日<input type={today ? "date" : "number"} aria-label="指示の終了日" value={until === undefined ? "" : dateValue(until)} disabled={!canOrder || !!selected?.fromFields || until === undefined} onChange={(e) => setUntil(e.target.value === "" ? undefined : parseDay(e.target.value))} className="block w-24 rounded border border-rule p-1" /><span>{until === undefined ? "変えるまで続く" : fmtDay(until)}</span></label>
      </div>
      {until !== undefined && until < startDay && <p role="alert" className="text-shu">終了日を開始日以降にしてください。</p>}
      {selected?.fromFields ? <button type="button" disabled={!canOrder} onClick={() => onEditFields(selected ?? undefined)} className="rounded border border-ai px-3 py-2 text-ai">この指示を項目で修正・中止する</button> : <>
        {selected && <label className="block">変更・終了・中止の理由（任意）<input value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1 block w-full rounded border border-rule p-2" /></label>}
        <div className="flex flex-wrap gap-2"><button type="button" onClick={reset}>クリア</button>{ending && <label>終了日<input aria-label="終了する日" type={today ? "date" : "number"} value={dateValue(endDay)} onChange={(e) => e.target.value && setEndDay(parseDay(e.target.value))} /></label>}{ending && selected ? <button type="button" disabled={!canOrder || endDay < selected.start.day || (selected.end !== undefined && endDay > selected.end.day)} onClick={() => { onStop(selected.id, reason, endDay, "終了"); reset(); }}>終了を確定</button> : <button type="button" disabled={!canOrder || !text.trim() || (until !== undefined && until < startDay) || (!!selected && (selected.start.day > 0 || !currentLines(lines).some((l) => l.id === selected.id)))} onClick={save} className="rounded bg-ai px-4 py-2 font-bold text-white disabled:opacity-40">{selected ? "変更を確定" : "保存する"}</button>}
        {selected && <button type="button" disabled={!canOrder || (!active && !currentLines(lines).some((l) => l.id === selected.id))} onClick={() => { onStop(selected.id, reason); reset(); }} className="rounded border border-shu px-3 py-2 text-shu disabled:opacity-40">中止</button>}</div>
      </>}
      <p className="hint text-ink-faint">医師が直して確定します。スライディングスケールは注射オーダのスケールと合わせてください。変更前の行は変更履歴に残ります。終了日と理由を確認して確定してください。自由文の薬の量・間隔・アレルギーは自動で確認しません。Dr.call は医師への連絡です。</p>
      <button type="button" aria-expanded={templates} onClick={() => setTemplates(!templates)} className="rounded border border-rule px-3 py-2">テンプレート</button>
      {templates && <div className="space-y-2 rounded border border-rule p-2">
        <p className="hint text-ink-faint">自分のテンプレートは、利用者ごとにこの端末のみに保存されます。</p>
        <div className="max-h-72 space-y-1 overflow-y-auto">{[...mine, ...HOSPITAL_LINE_TEMPLATES].filter((t) => !selected || t.cat === selected.cat).map((t) => <button key={t.id} type="button" disabled={!canOrder || !!selected?.fromFields} onClick={() => { pick(t.cat, t.text); setTemplates(false); }} className="block w-full border-b border-rule-soft p-1 text-left hover:bg-ai-soft"><span className="text-ink-faint">{CATEGORY_LABELS[t.cat] ?? t.cat}：</span>{displayText(standingTitle(t.text))}</button>)}</div>
        {STANDING_SOURCES.map((s) => <p key={s.url} className="hint"><a href={s.url} target="_blank" rel="noreferrer" className="underline">{s.label}</a></p>)}
      </div>}
      <button type="button" disabled={!canOrder || !text} onClick={() => { const errors = templateProblems(cat, text, mine); if (errors.length) return setNotice(errors.join(" ")); const next = [...mine, { id: newId(), cat, text }]; setMine(next); setNotice(saveMyTemplates(me.name, next) ? "自分のテンプレートに保存しました。" : "端末に保存できません。ページを閉じるまで使えます。"); }} className="block text-ai disabled:opacity-40">この文を自分のテンプレートに保存</button>
      {notice && <p role="status">{notice}</p>}
      </>}
    </section>
  </div>;
}
