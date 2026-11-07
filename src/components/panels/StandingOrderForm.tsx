"use client";

import { StandingTemplateSet } from "../StandingTemplateSet";
import { DayInput } from "../DayInput";
import { FlowCellMenu, type CellAction } from "../FlowCellMenu";
import { useEscFirst } from "@/lib/use-esc-first";
import { displayText } from "@/lib/display-text";
import { type CalendarDate } from "@/lib/dates";
import { periodText } from "@/lib/standing-calendar";
import { STANDING_MENU, standingMenuEnabled } from "@/lib/standing-menu";
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { HOSPITAL_LINE_TEMPLATES, LINE_CATS, currentLines, categoryFromTitle, standingTitle, newestLines, linesFromFields, loadMyTemplates, saveMyTemplates, templateProblems, type LineCat, type LineTemplate, type StandingLine } from "@/lib/standing-lines";
import type { StandingOrders } from "@/lib/standing";
import { CosignMark } from "../Cosign";
import { standingLineRef } from "@/lib/standing-cosign";
import { useDeny, useMe } from "../RoleContext";

export function StandingOrderForm({ lines, versions, nowTime, fmtDay, newId, onAdd, onStop, onEditFields, fieldEditor, today, patientId, initialCategory, initialSelection, onEndFields }: {
  onEndFields?: (line: StandingLine) => void;
  initialCategory?: LineCat;
  initialSelection?: StandingLine;
  onAdmissionTemplate?: () => void;
  patientId?: string;
  lines: StandingLine[]; versions: StandingOrders[]; nowTime: string; fmtDay: (d: number) => string;
  fieldEditor?: React.ReactNode; today?: CalendarDate;
  newId: () => string; onAdd: (l: StandingLine) => void; onStop: (id: string, reason: string, day?: number, kind?: "終了") => void; onEditFields: (line?: StandingLine) => void;
}) {
  const me = useMe();
  const deny = useDeny();
  const canOrder = !deny("order");
  const [startDay, setStartDay] = useState(0);
  const [until, setUntil] = useState<number | undefined>(initialSelection?.end?.day);
  const [cat, setCat] = useState<LineCat>(initialSelection?.cat ?? initialCategory ?? "その他");
  const [text, setText] = useState(initialSelection?.text ?? "");
  const [manualCat, setManualCat] = useState(!!initialCategory);
  const [showCat, setShowCat] = useState(false);
  const [selected, setSelected] = useState<StandingLine | null>(initialSelection ?? null);
  const [ending, setEnding] = useState(false);
  const [endDay, setEndDay] = useState(0);
  const [reason, setReason] = useState("");
  const [templates, setTemplates] = useState(false);
  const [mine, setMine] = useState<LineTemplate[]>(() => loadMyTemplates(me.name));
  const [notice, setNotice] = useState("");
  // この指示の下に追加: the new line goes right under this one.
  const [after, setAfter] = useState<string | null>(null);
  // The menu of a line (right click, a long press, or the ContextMenu key / Shift+F10).
  const [menu, setMenu] = useState<{ line: StandingLine; live: boolean; at: { x: number; y: number } } | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);
  useEscFirst(!!menu, closeMenu);
  const press = useRef<{ timer: ReturnType<typeof setTimeout> | null; x: number; y: number }>({ timer: null, x: 0, y: 0 });
  const cancelPress = () => { if (press.current.timer) clearTimeout(press.current.timer); press.current.timer = null; };
  // 変更・追加 from the menu or a double-click puts the cursor in the text.
  const textArea = useRef<HTMLTextAreaElement>(null);
  const [typeTick, setTypeTick] = useState(0);
  useEffect(() => { if (typeTick) textArea.current?.focus(); }, [typeTick]);
  const toText = () => setTypeTick((n) => n + 1);
  const all = [...lines, ...linesFromFields(versions)];
  const isLive = (l: StandingLine) => currentLines(all).some((x) => x.id === l.id) && !(l.end && (l.end.day < 0 || (l.end.day === 0 && !!l.end.time && l.end.time <= nowTime)));
  const active = selected && currentLines(lines).some((l) => l.id === selected.id);
  const reset = () => { setEnding(false); setSelected(null); setStartDay(0); setUntil(undefined); setText(""); setCat("その他"); setManualCat(false); setShowCat(false); setReason(""); setNotice(""); setAfter(null); };
  const pick = (c: LineCat, t: string) => { setCat(c); setText(t); setManualCat(c !== categoryFromTitle(standingTitle(t))); setNotice(""); };
  const select = (l: StandingLine) => { setEnding(false); setSelected(l); setStartDay(0); setUntil(l.end?.day); pick(l.cat, l.text); setReason(""); if (l.fromFields && canOrder) onEditFields(l); };
  const save = () => {
    if ((until !== undefined && until < startDay) || !text.trim() || !canOrder || selected?.fromFields) return;
    onAdd({ id: newId(), cat, text, changedFrom: selected?.id, changeReason: reason, ...(after && !selected ? { insertAfter: after } : {}), start: { day: startDay, ...(startDay === 0 ? { time: nowTime } : {}) }, end: until === undefined ? undefined : { day: until }, by: me.name, at: { day: 0, time: nowTime } });
    reset();
  };
  // The same choices as the 指示簿カレンダー's menu.
  const change = (l: StandingLine) => { setEnding(false); select(l); toText(); };
  const end = (l: StandingLine) => { if (l.fromFields) { onEndFields?.(l); return; } select(l); setEnding(true); setEndDay(Math.max(0, l.start.day)); };
  const menuActions = (l: StandingLine, live: boolean): CellAction[] => {
    const on = standingMenuEnabled(l, canOrder);
    const no = deny("order");
    const why = (i: number) => (on[i] && (i > 1 || live) ? null : no ?? (i === 0 && l.start.day > 0 ? "まだ始まっていない指示です" : "終わった指示です"));
    const run = [() => change(l), () => end(l), () => { reset(); setCat(l.cat); setManualCat(true); setAfter(l.id); toText(); }, () => { reset(); toText(); }, () => void navigator.clipboard?.writeText(displayText(l.text))];
    return STANDING_MENU.map((label, i) => ({ label, onClick: run[i], disabled: why(i) }));
  };
  const dayChips = (days: [string, number | undefined][], value: number | undefined, set: (d: number | undefined) => void, disabled: boolean, label: string) => (
    <span role="group" aria-label={label} className="inline-flex flex-wrap gap-1">
      {days.map(([t, d]) => <button key={t} type="button" disabled={disabled} aria-pressed={value === d} onClick={() => set(d)} className={`rounded border px-2 py-0.5 text-[11px] disabled:opacity-40 ${value === d ? "border-ai bg-ai font-bold text-white" : "border-rule text-ink-soft hover:border-ai hover:text-ai"}`}>{t}</button>)}
    </span>
  );
  const AHEAD: [string, number][] = [["今日", 0], ["明日", 1], ["3日後", 3], ["7日後", 7]];
  return <div className="grid items-start gap-4 text-[12px] md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
    <section className="min-w-0" aria-label="現在の指示"
      onPointerDown={(e: ReactPointerEvent) => {
        if (e.pointerType === "mouse") return;
        const id = (e.target as Element).closest("[data-line-id]")?.getAttribute("data-line-id");
        const l = id ? newestLines(all).find((x) => x.id === id) : undefined;
        if (!l) return;
        cancelPress();
        const at = { x: e.clientX, y: e.clientY };
        press.current = { x: at.x, y: at.y, timer: setTimeout(() => { press.current.timer = null; setMenu({ line: l, live: isLive(l), at }); }, 500) };
      }}
      onPointerMove={(e: ReactPointerEvent) => { if (Math.hypot(e.clientX - press.current.x, e.clientY - press.current.y) > 10) cancelPress(); }}
      onPointerUp={cancelPress} onPointerCancel={cancelPress}>
      <h3 className="mb-2 font-bold">現在の指示</h3>
      {newestLines(all).map((l) => {
          const live = isLive(l);
          return <div key={l.id}><button type="button" data-line-id={l.id} onClick={() => select(l)} onDoubleClick={() => { if (live && canOrder && l.start.day <= 0) change(l); }}
            onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setMenu({ line: l, live, at: { x: e.clientX, y: e.clientY } }); }}
            onKeyDown={(e) => { if (e.key === "ContextMenu" || (e.shiftKey && e.key === "F10")) { e.preventDefault(); const r = e.currentTarget.getBoundingClientRect(); setMenu({ line: l, live, at: { x: r.left + 24, y: r.bottom } }); } }}
            aria-pressed={selected?.id === l.id} className={`block w-full border-b border-rule-soft p-2 text-left hover:bg-ai-soft ${selected?.id === l.id ? "bg-ai-soft" : ""}`}>
            <div className={`font-bold ${live ? "" : "text-ink-faint"}`}>{displayText(standingTitle(l.text))}</div>
            <div className="text-[11px] text-ink-soft">{displayText(periodText(l, fmtDay))}</div>
            <div className="mt-1 text-[11px] text-ink-soft">{displayText(l.by)}　{fmtDay(l.at.day)} {l.at.time}　{live ? l.start.day > 0 ? "予定" : "有効" : l.changed ? "変更前" : l.stop ? l.stop.kind ?? "中止" : "終了"}</div>
            {patientId && <CosignMark refId={standingLineRef(patientId, l.id)} />}
            {patientId && l.stop && <CosignMark refId={standingLineRef(patientId, l.id, true)} />}
            {l.changed && <div className="text-ink-faint">変更前：{fmtDay(l.changed.day)} {l.changed.time} {displayText(l.changed.by)} {displayText(l.changed.reason)}</div>}{l.stop && <div className="text-[11px] text-ink-faint">{l.stop.kind ?? "中止"}：{displayText(l.stop.by)} {fmtDay(l.stop.day)} {l.stop.time} {displayText(l.stop.reason)}</div>}
          </button>{l.text.includes("\n") && <details className="px-2"><summary className="cursor-pointer text-ink-soft">本文を開く</summary><div className="whitespace-pre-wrap">{displayText(l.text.slice(l.text.indexOf("\n") + 1))}</div></details>}</div>;
        })}
      {!all.length && <p className="text-ink-faint">指示はまだありません。</p>}
      {menu && <FlowCellMenu at={menu.at} title={displayText(standingTitle(menu.line.text))} actions={menuActions(menu.line, menu.live)} onClose={closeMenu} />}
    </section>
    <section className="min-w-0 space-y-3 md:sticky md:top-0" aria-label="指示の入力">
      {fieldEditor ?? <>
      <div className="flex justify-between"><h3 className="font-bold">{displayText(selected ? `${ending ? "終了" : "変更"}：元の指示 ${selected.text}` : "新規指示")}</h3><button type="button" onClick={reset} className="text-ai">新規に戻る</button></div>
      <label className="block">指示（1行目は見出し、2行目以降は本文）<textarea ref={textArea} aria-label="指示の見出しと本文" value={text} disabled={!canOrder || !!selected?.fromFields} onChange={(e) => { setText(e.target.value); if (!manualCat && !selected) setCat(categoryFromTitle(standingTitle(e.target.value))); }} rows={12} className="mt-1 block w-full rounded border border-rule bg-sheet p-2" /></label>
      <div className="text-[11px] text-ink-soft"><button type="button" aria-expanded={showCat} onClick={() => setShowCat(!showCat)}>分類：{cat}{cat === "頓用" ? "（ワークシートの頓用の欄に出ます）" : ""}</button>{showCat && <select aria-label="指示の分類" value={cat} disabled={!canOrder || !!selected} onChange={(e) => { setCat(e.target.value as LineCat); setManualCat(true); }}>{LINE_CATS.map((c) => <option key={c}>{c}</option>)}</select>}</div>
      <div className="font-bold">指示期間：開始日 〜 終了日</div>
      <div className="grid grid-cols-[auto_1fr] items-center gap-x-2 gap-y-1.5">
        <span>開始日</span>
        <span className="flex flex-wrap items-center gap-1.5">{dayChips(AHEAD.slice(0, 2), startDay, (d) => setStartDay(d ?? 0), !canOrder || !!selected, "開始日を選ぶ")}<DayInput label="指示の開始日" value={startDay} onChange={setStartDay} today={today} disabled={!canOrder || !!selected} /></span>
        <span>終了日</span>
        <span className="flex flex-wrap items-center gap-1.5">{dayChips([...AHEAD, ["変えるまで続く", undefined]], until, setUntil, !canOrder || !!selected?.fromFields, "終了日を選ぶ")}<DayInput label="指示の終了日" value={until ?? null} onChange={setUntil} today={today} disabled={!canOrder || !!selected?.fromFields} /></span>
      </div>
      {until !== undefined && until < startDay && <p role="alert" className="text-shu">終了日を開始日以降にしてください。</p>}
      {selected?.fromFields ? <button type="button" disabled={!canOrder} onClick={() => onEditFields(selected ?? undefined)} className="rounded border border-ai px-3 py-2 text-ai">この指示を項目で修正・中止する</button> : <>
        {selected && <label className="block">変更・終了・中止の理由（任意）<input value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1 block w-full rounded border border-rule p-2" /></label>}
        <div className="flex flex-wrap gap-2"><button type="button" onClick={reset}>クリア</button>{ending && <span className="flex w-full flex-wrap items-center gap-1.5">終了する日{dayChips(AHEAD, endDay, (d) => setEndDay(d ?? 0), false, "終了する日を選ぶ")}<DayInput label="終了する日" value={endDay} onChange={setEndDay} today={today} /></span>}{ending && selected ? <button type="button" disabled={!canOrder || endDay < selected.start.day || (selected.end !== undefined && endDay > selected.end.day)} onClick={() => { onStop(selected.id, reason, endDay, "終了"); reset(); }}>終了を確定</button> : <button type="button" disabled={!canOrder || !text.trim() || (until !== undefined && until < startDay) || (!!selected && (selected.start.day > 0 || !currentLines(lines).some((l) => l.id === selected.id)))} onClick={save} className="rounded bg-ai px-4 py-2 font-bold text-white disabled:opacity-40">{selected ? "変更を確定" : "保存する"}</button>}
        {selected && <button type="button" disabled={!canOrder || (!active && !currentLines(lines).some((l) => l.id === selected.id))} onClick={() => { onStop(selected.id, reason); reset(); }} className="rounded border border-shu px-3 py-2 text-shu disabled:opacity-40">中止</button>}</div>
      </>}

      <button type="button" aria-expanded={templates} onClick={() => setTemplates(!templates)} className="rounded border border-rule px-3 py-2">テンプレート</button>
      {templates && <div className="space-y-2 rounded border border-rule p-2">

        <StandingTemplateSet templates={[...mine, ...HOSPITAL_LINE_TEMPLATES].filter(t => !selected || t.cat === selected.cat)} disabled={!canOrder || !!selected?.fromFields} onPick={(cat, text) => { pick(cat, text); setTemplates(false); }} />

      </div>}
      <button type="button" disabled={!canOrder || !text} onClick={() => { const errors = templateProblems(cat, text, mine); if (errors.length) return setNotice(errors.join(" ")); const next = [...mine, { id: newId(), cat, text }]; setMine(next); setNotice(saveMyTemplates(me.name, next) ? "自分のテンプレートに保存しました。" : "端末に保存できません。ページを閉じるまで使えます。"); }} className="block text-ai disabled:opacity-40">この文を自分のテンプレートに保存</button>
      {notice && <p role="status">{notice}</p>}
      </>}
    </section>
  </div>;
}

/* Help migration source (references and dynamic wording):
<p >医師が直して確定します。スライディングスケールは注射オーダのスケールと合わせてください。変更前の行は変更履歴に残ります。終了日と理由を確認して確定してください。自由文の薬の量・間隔・アレルギーは自動で確認しません。Dr.call は医師への連絡です。</p>
<p >自分のテンプレートは、利用者ごとにこの端末のみに保存されます。</p>
<p key={s.url} ><a href={s.url} target="_blank" rel="noreferrer" >{s.label}</a></p>
*/
