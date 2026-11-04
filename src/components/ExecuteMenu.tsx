"use client";

// 実施・未実施 from an order: the menu that opens on an order row of the record (right click, ⋯, or a long
// press on an iPad) and on a dose cell of the calendars. The person picks the occurrence (when the day has
// more than one), then 実施した（いま）, 実施した（時刻を選ぶ）, 未実施（理由を選ぶ）, or takes a record back.
// The record is the same 与薬・実施の記録 the worksheet writes; the wristband and label are not read here.

import { Ban, Check, ChevronLeft, Clock, Undo2, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { abs } from "@/lib/flowsheet";
import { NOT_DONE_REASONS, VOID_REASONS, type AdminRecord, type NotDoneReason, type VoidReason } from "@/lib/mar";
import { MENU_NOTE, actionsFor, executeDeny, menuRecord, occurrenceAt, occurrenceStates, recordText, type ExecItem, type Occurrence } from "@/lib/order-execute";
import { parseHHMM } from "@/lib/order-sheet";
import type { OrderEntry, Patient } from "@/lib/types";
import { useLongPress } from "@/lib/use-long-press";
import { useMe } from "./RoleContext";

/** What the chart hands the order rows and the calendars so that they can record 実施・未実施. */
export interface ExecuteProps {
  /** 与薬・実施の記録 (the same records the worksheet writes). */
  records: Record<string, AdminRecord>;
  /** Items due before this time count as recorded by the (fictional) earlier shift. */
  sessionStart: number;
  nowTime: string;
  onRecord: (r: AdminRecord) => void;
  onVoid: (r: AdminRecord, reason: VoidReason) => void;
}

/** Another item at the top of the menu (右へ写す（Do） on the order row). */
export interface MenuExtra {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  disabled?: string;
}

type Step = { kind: "root" } | { kind: "occ"; i: number } | { kind: "time"; i: number } | { kind: "reason"; i: number } | { kind: "void"; i: number };

const ITEM = "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-paper disabled:text-ink-faint/70 disabled:hover:bg-transparent pointer-coarse:py-2.5";

function Item({ icon: Icon, label, onClick, disabled, sub }: { icon?: LucideIcon; label: string; onClick?: () => void; disabled?: string | null; sub?: string }) {
  return (
    <button type="button" role="menuitem" disabled={!!disabled} title={disabled ?? undefined} onClick={onClick} className={ITEM}>
      {Icon && <Icon size={14} className="shrink-0" />}
      <span className="min-w-0 flex-1">
        {label}
        {(disabled || sub) && <span className="block text-[10px] text-ink-faint">{disabled ?? sub}</span>}
      </span>
    </button>
  );
}

const stateText = (o: Occurrence) => (o.record ? recordText(o.record) : o.state === "記録済み" ? "実施（前の勤務帯）" : o.state);
const STATE_TONE: Record<Occurrence["state"], string> = { 実施: "text-wakatake", 未実施: "text-shu", 記録済み: "text-ink-faint", 未入力: "text-yamabuki", 予定: "text-ink-soft" };

/**
 * The menu's content (no window of its own, so it can be rendered on the server in tests). `day` is the day
 * of the occurrences (0 = today); `untimed` is the order's 必要時 item, recorded at the time it is given.
 */
export function ExecuteMenuBody({ title, occurrences, untimed, day, execute, extra = [], onDone }: { title: string; occurrences: Occurrence[]; untimed?: ExecItem | null; day: number; execute?: ExecuteProps; extra?: MenuExtra[]; onDone: () => void }) {
  const me = useMe();
  const [step, setStep] = useState<Step>({ kind: "root" });
  const [time, setTime] = useState<string | null>(null);
  const deny = executeDeny(me.role);
  const dayLabel = day === 0 ? "今日" : day === -1 ? "昨日" : day === 1 ? "明日" : `${Math.abs(day)}日${day < 0 ? "前" : "後"}`;

  const write = (item: ExecItem, x: { status: "実施" | "未実施"; time: string; reason?: NotDoneReason }) => {
    const r = menuRecord(item, { ...x, day, by: me.name });
    if (!r || !execute) return;
    execute.onRecord(r);
    onDone();
  };
  const back = <Item icon={ChevronLeft} label="戻る" onClick={() => setStep({ kind: "root" })} />;
  const occLine = (o: Occurrence) => (
    <div className="px-2 pb-0.5 pt-1 text-[11px] text-ink-soft">
      {dayLabel} <span className="nums font-bold text-ink">{o.time}</span> の回　<span className={STATE_TONE[o.state]}>{stateText(o)}</span>
    </div>
  );
  const actions = (o: Occurrence, i: number) => {
    const a = actionsFor(o);
    if (a.kind === "locked") return <Item icon={Ban} label="実施・未実施を記録" disabled={a.why} />;
    if (a.kind === "void") return <Item icon={Undo2} label="この記録を取り消す…" sub={`${a.record.by} の記録。理由を選びます`} onClick={() => setStep({ kind: "void", i })} />;
    return (
      <>
        <Item icon={Check} label={`実施した（いま ${execute?.nowTime ?? ""}）`} sub={`${me.name} が実施したとして記録`} onClick={() => write(o.item, { status: "実施", time: execute?.nowTime ?? "" })} />
        <Item icon={Clock} label="実施した（時刻を選ぶ）…" onClick={() => setStep({ kind: "time", i })} />
        <Item icon={Ban} label="未実施（理由を選ぶ）…" onClick={() => setStep({ kind: "reason", i })} />
      </>
    );
  };

  let body: React.ReactNode = null;
  if (execute && deny) body = <Item icon={Ban} label="実施・未実施を記録" disabled={deny} />;
  else if (execute && step.kind === "root") {
    if (!occurrences.length && !untimed) body = <Item icon={Ban} label="実施・未実施を記録" disabled={`${dayLabel}の回はありません。`} />;
    else if (occurrences.length === 1 && !untimed)
      body = (
        <>
          {occLine(occurrences[0])}
          {actions(occurrences[0], 0)}
        </>
      );
    else
      body = (
        <>
          {occurrences.length > 0 && <div className="px-2 pb-0.5 pt-1 text-[11px] text-ink-soft">{dayLabel}の回を選ぶ</div>}
          {occurrences.map((o, i) => (
            <button key={o.time} type="button" role="menuitem" onClick={() => setStep({ kind: "occ", i })} className={`${ITEM} nums`}>
              <span className="w-12 shrink-0 font-bold">{o.time}</span>
              <span className={`min-w-0 flex-1 truncate text-[11px] ${STATE_TONE[o.state]}`}>{stateText(o)}</span>
              <span className="text-ink-faint">›</span>
            </button>
          ))}
          {untimed && day === 0 && <Item icon={Check} label={`必要時：実施した（いま ${execute.nowTime}）`} sub={`${me.name} が実施したとして記録`} onClick={() => write(untimed, { status: "実施", time: execute.nowTime })} />}
        </>
      );
  } else if (execute && step.kind === "occ") {
    const o = occurrences[step.i];
    body = (
      <>
        {back}
        {occLine(o)}
        {actions(o, step.i)}
      </>
    );
  } else if (execute && step.kind === "time") {
    const o = occurrences[step.i];
    const value = time ?? (day === 0 ? execute.nowTime : o.time);
    const ok = parseHHMM(value) !== null;
    body = (
      <>
        {back}
        {occLine(o)}
        <div className="flex items-center gap-2 px-2 py-1">
          <label className="flex items-center gap-1 text-[12px]">
            実施した時刻
            <input value={value} onChange={(e) => setTime(e.target.value)} aria-label="実施した時刻" placeholder="HH:MM" className="nums w-16 rounded border border-rule bg-sheet px-1 py-0.5" />
          </label>
          <button type="button" disabled={!ok} onClick={() => write(o.item, { status: "実施", time: value })} className="rounded bg-ai px-3 py-0.5 text-[12px] font-bold text-white disabled:opacity-40">
            記録する
          </button>
        </div>
        <p className="px-2 pb-1 text-[10px] text-ink-faint">{me.name} が実施したとして記録します。予定の時刻と60分より離れていると、ずれを記録に残します。</p>
      </>
    );
  } else if (execute && step.kind === "reason") {
    const o = occurrences[step.i];
    body = (
      <>
        {back}
        {occLine(o)}
        <div className="px-2 pb-0.5 pt-1 text-[11px] text-ink-soft">未実施の理由</div>
        {NOT_DONE_REASONS.map((r) => (
          <Item key={r} icon={Ban} label={r} onClick={() => write(o.item, { status: "未実施", time: execute.nowTime, reason: r })} />
        ))}
      </>
    );
  } else if (execute && step.kind === "void") {
    const o = occurrences[step.i];
    body = (
      <>
        {back}
        {occLine(o)}
        <div className="px-2 pb-0.5 pt-1 text-[11px] text-ink-soft">取り消す理由（記録は履歴に残ります）</div>
        {VOID_REASONS.map((r) => (
          <Item
            key={r}
            icon={Undo2}
            label={r}
            onClick={() => {
              if (o.record) execute.onVoid(o.record, r);
              onDone();
            }}
          />
        ))}
      </>
    );
  }

  return (
    <>
      <div className="truncate px-2 py-1 text-[11px] font-bold text-ink-soft" title={title}>
        {title}
      </div>
      {step.kind === "root" &&
        extra.map((it) => (
          <Item
            key={it.label}
            icon={it.icon}
            label={it.label}
            disabled={it.disabled}
            onClick={() => {
              onDone();
              it.onClick();
            }}
          />
        ))}
      {step.kind === "root" && extra.length > 0 && execute && <div className="my-1 border-t border-rule-soft" />}
      {body}
      {execute && !deny && <p className="hint px-2 pb-1 pt-1 text-[10px] text-ink-faint">{MENU_NOTE}。ワークシート・経過表・実施入力と同じ与薬・実施の記録に書きます。</p>}
    </>
  );
}

/** The menu in its own small window at the pointer (right click, long press) or under the ⋯ button. Esc or a press outside closes it. */
export function ExecuteMenu({ at, onClose, ...body }: { at: { x: number; y: number }; onClose: () => void } & Omit<Parameters<typeof ExecuteMenuBody>[0], "onDone">) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const away = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && onClose();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("pointerdown", away, true);
    window.addEventListener("keydown", esc);
    ref.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    return () => {
      window.removeEventListener("pointerdown", away, true);
      window.removeEventListener("keydown", esc);
    };
  }, [onClose]);
  const left = Math.min(at.x, (typeof window === "undefined" ? 1200 : window.innerWidth) - 290);
  const top = Math.min(at.y, (typeof window === "undefined" ? 800 : window.innerHeight) - 320);
  return createPortal(
    <div ref={ref} role="menu" aria-label={`${body.title} の実施・未実施`} style={{ position: "fixed", left, top, zIndex: 1000 }} className="w-72 rounded-lg border border-rule bg-sheet p-1 text-[13px] shadow-[0_12px_32px_-8px_rgba(38,34,28,0.4)]" onClick={(e) => e.stopPropagation()}>
      <ExecuteMenuBody {...body} onDone={onClose} />
    </div>,
    document.body,
  );
}

/**
 * Wraps one dose (a chip on a calendar) so that a right click or a long press opens the menu for that
 * occurrence. Without `execute` it only renders its children.
 */
export function ExecuteTarget({ execute, patient, entry, at, title, className = "", children }: { execute?: ExecuteProps; patient: Patient; entry: OrderEntry; at: number; title: string; className?: string; children: React.ReactNode }) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const press = useLongPress<HTMLSpanElement>(execute ? setMenu : undefined);
  if (!execute) return <span className={className}>{children}</span>;
  const nowAbs = abs(0, execute.nowTime);
  const item = menu ? occurrenceAt(patient, entry, at, nowAbs) : null;
  return (
    <span
      {...press}
      data-exec-at={at}
      title="右クリック（iPad は長押し）で実施・未実施を記録"
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setMenu({ x: e.clientX, y: e.clientY });
      }}
      onClick={(e) => menu && e.stopPropagation()}
      className={`cursor-context-menu ${className}`}
    >
      {children}
      {menu && <ExecuteMenu at={menu} onClose={() => setMenu(null)} title={title} occurrences={item ? occurrenceStates([item], execute.records, execute.sessionStart, nowAbs) : []} untimed={null} day={Math.floor(at / 1440)} execute={execute} />}
    </span>
  );
}
