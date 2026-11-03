"use client";

import Image from "next/image";
import { CheckSquare, ChevronDown, MessagesSquare, PanelLeftClose, PanelLeftOpen, Plus, ScrollText, Search, Table2, UserRound, X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Area, AreaKey } from "@/lib/nav";
import { ROLES, ROLE_LONG, STAFF, type Role } from "@/lib/roles";
import type { Sex } from "@/lib/types";
import { AREA_ICON, type Icon } from "./nav-icons";
import { PatientAvatar } from "./PatientAvatar";

export interface Todo {
  key: string;
  label: string;
  detail?: string;
  count: number;
  tone: "shu" | "yamabuki" | "ai";
  go: () => void;
}

/** A tab in one of the rows on top: a screen (② or the list of ③) or a patient's chart. */
export interface TabItem {
  key: string;
  label: string;
  icon?: Icon;
  /** A patient's chart: the face, the room and an infection mark. */
  patient?: { sex: Sex; age: number; room?: string; infections?: string[] };
  active: boolean;
  /** Something waiting (red). */
  badge?: number;
  /** How many charts are open under this tab (②). */
  charts?: number;
  /** A menu tab (新しいタブ・画面を選ぶ), drawn with a dashed edge. */
  menu?: boolean;
  title?: string;
  onSelect: () => void;
  onClose?: () => void;
  closeLabel?: string;
}

export interface TabRow {
  label: string;
  items: TabItem[];
  /** ＋ at the end of the row. */
  plus?: { label: string; title: string; onClick: () => void };
}

interface Props {
  role: Role;
  onRole: (r: Role) => void;
  /** The places and tools this role uses. */
  areas: Area[];
  /** ① the place chosen in the left menu. */
  area: AreaKey;
  onArea: (k: AreaKey) => void;
  /** ② and, inside 病棟, ③. */
  rows: TabRow[];
  /** A chart is shown (the left menu folds to icons by itself to give it room). */
  chartShown: boolean;
  onOpenPicker: () => void;
  /** Counts on the places of the left menu. */
  areaBadges: Partial<Record<AreaKey, number>>;
  todos: Todo[];
  children: React.ReactNode;
}

function Badge({ n, tone = "shu" }: { n: number; tone?: "shu" | "ai" | "yamabuki" }) {
  if (!n) return null;
  const bg = tone === "shu" ? "bg-shu" : tone === "ai" ? "bg-ai" : "bg-yamabuki";
  return <span className={`nums rounded-full ${bg} px-1.5 text-[10px] font-bold leading-4 text-white`}>{n}</span>;
}

type Place = "below-right" | "below-left" | "beside";

/**
 * A small menu drawn on top of the whole screen (not clipped by the menu it comes from), next to the
 * button that opened it. Closes on Esc or a press outside.
 */
function Popover({ open, onClose, anchor, place, width, children }: { open: boolean; onClose: () => void; anchor: React.RefObject<HTMLElement | null>; place: Place; width: number; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<React.CSSProperties>({ visibility: "hidden" });
  useLayoutEffect(() => {
    if (!open) return;
    const put = () => {
      const a = anchor.current?.getBoundingClientRect();
      if (!a) return;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const left = place === "beside" ? a.right + 6 : place === "below-left" ? a.left : a.right - width;
      const x = Math.max(8, Math.min(left, vw - width - 8));
      setPos(place === "beside" ? { left: x, bottom: Math.max(8, vh - a.bottom), maxHeight: vh - 16 } : { left: x, top: a.bottom + 4, maxHeight: vh - a.bottom - 12 });
    };
    put();
    window.addEventListener("resize", put);
    return () => window.removeEventListener("resize", put);
  }, [open, anchor, place, width]);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || anchor.current?.contains(t)) return;
      onClose();
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("pointerdown", away, true);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("pointerdown", away, true);
      window.removeEventListener("keydown", esc);
    };
  }, [open, onClose, anchor]);
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div ref={ref} style={{ position: "fixed", zIndex: 1000, width, ...pos }} className="scroll-thin overflow-y-auto rounded-lg border border-rule bg-sheet p-1.5 text-sm shadow-[0_12px_32px_-8px_rgba(38,34,28,0.4)]">
      {children}
    </div>,
    document.body,
  );
}

const tabShape = (active: boolean, small: boolean, menu?: boolean) =>
  `group relative flex shrink-0 cursor-pointer items-center gap-1.5 border border-b-0 ${small ? "h-8 rounded-t-md px-2.5 text-[13px] pointer-coarse:h-10" : "h-9 rounded-t-lg px-3 text-sm pointer-coarse:h-11"} ${
    active ? `z-10 -mb-px border-rule ${small ? "bg-paper" : "bg-sheet"} font-bold text-ink` : `${menu ? "border-dashed border-rule" : "border-transparent"} text-ink-soft ${small ? "hover:bg-paper/60" : "hover:bg-sheet/60"}`
  } ${menu && active ? "border-dashed" : ""}`;

function CloseX({ label, onClose }: { label: string; onClose: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
      className="ml-auto rounded p-0.5 text-ink-faint opacity-60 hover:bg-tab hover:text-ink group-hover:opacity-100 pointer-coarse:p-1.5 pointer-coarse:opacity-100"
    >
      <X size={14} />
    </button>
  );
}

/** One row of tabs: ② (large, on the frame's color) or ③ (small, on the sheet). */
function Row({ row, small, end }: { row: TabRow; small: boolean; end?: React.ReactNode }) {
  return (
    <div className={`flex items-end gap-1 border-b border-rule ${small ? "bg-sheet px-3 pt-1" : "bg-tab px-2 pt-1.5"}`}>
      <div role="tablist" aria-label={row.label} className="scroll-thin flex min-w-0 flex-1 items-end gap-1 overflow-x-auto">
        {row.items.map((t) => {
          const Icon = t.icon;
          return (
            <div
              key={t.key}
              role="tab"
              aria-selected={t.active}
              tabIndex={0}
              title={t.title}
              onClick={t.onSelect}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && t.onSelect()}
              onAuxClick={(e) => e.button === 1 && t.onClose?.()}
              className={`${tabShape(t.active, small, t.menu)} ${t.patient ? "min-w-36 max-w-60" : ""}`}
            >
              {t.patient ? (
                <>
                  {!!t.patient.infections?.length && <span className="h-2 w-2 shrink-0 rounded-full bg-fuji" title={`感染症：${t.patient.infections.join("、")}`} />}
                  <PatientAvatar sex={t.patient.sex} age={t.patient.age} size={small ? 18 : 20} className="rounded-full" />
                  <span className="truncate font-bold">{t.label}</span>
                  {t.patient.room && <span className="nums shrink-0 text-xs font-normal text-ink-faint">{t.patient.room}</span>}
                </>
              ) : (
                <>
                  {Icon && <Icon size={small ? 14 : 15} className="shrink-0" />}
                  <span className="whitespace-nowrap">{t.label}</span>
                </>
              )}
              <Badge n={t.badge ?? 0} />
              {!!t.charts && (
                <span title={`この下で開いているカルテ ${t.charts}件`} className="nums rounded-full border border-rule px-1.5 text-[10px] font-normal leading-4 text-ink-soft">
                  {t.charts}
                </span>
              )}
              {t.onClose && <CloseX label={t.closeLabel ?? `${t.label}のタブを閉じる`} onClose={t.onClose} />}
            </div>
          );
        })}
        {row.plus && (
          <button
            type="button"
            onClick={row.plus.onClick}
            aria-label={row.plus.label}
            title={row.plus.title}
            className={`mb-1 flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-ink-soft hover:text-ink pointer-coarse:py-2 ${small ? "text-xs hover:bg-paper" : "hover:bg-sheet/70"}`}
          >
            <Plus size={small ? 14 : 16} />
            {small && <span>{row.plus.label}</span>}
          </button>
        )}
      </div>
      {end}
    </div>
  );
}

/** やること: what is waiting for this role, gathered from everywhere; each line goes to its place. */
function TodoButton({ todos, narrow }: { todos: Todo[]; narrow?: boolean }) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const total = todos.reduce((n, t) => n + t.count, 0);
  return (
    <div className="relative">
      <button ref={btn} type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} title="やること（未確認の結果・口頭指示・指示受け・期限など）" className={navItem(false, narrow)}>
        <span className="relative">
          <CheckSquare size={16} />
          {total > 0 && (
            <span className={`absolute -right-2.5 -top-2 ${narrow ? "" : "lg:hidden"}`}>
              <Badge n={total} />
            </span>
          )}
        </span>
        <NavLabel full="やること" short="やること" narrow={narrow} />
        {!narrow && (
          <span className="ml-auto hidden lg:inline">
            <Badge n={total} />
          </span>
        )}
      </button>
      <Popover open={open} onClose={() => setOpen(false)} anchor={btn} place="beside" width={320}>
        <h3 className="px-2 pb-1 pt-0.5 text-xs font-bold text-ink-soft">やること（{total}件）</h3>
        {todos.length === 0 ? (
          <p className="px-2 py-2 text-xs text-ink-faint">いま待っていることはありません。</p>
        ) : (
          <ul>
            {todos.map((t) => (
              <li key={t.key}>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    t.go();
                  }}
                  className="flex w-full items-start gap-2 rounded px-2 py-1.5 text-left hover:bg-paper pointer-coarse:py-2.5"
                >
                  <Badge n={t.count} tone={t.tone} />
                  <span className="min-w-0 flex-1">
                    <span className="block">{t.label}</span>
                    {t.detail && <span className="block text-[11px] text-ink-faint">{t.detail}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Popover>
    </div>
  );
}

/** 自分: the role (login stand-in for the demo) and the audit log. */
function UserButton({ role, onRole, onArea, auditOn, extractOn, narrow }: { role: Role; onRole: (r: Role) => void; onArea: (k: AreaKey) => void; auditOn: boolean; extractOn: boolean; narrow?: boolean }) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  return (
    <div className="relative">
      <button ref={btn} type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} title="職種の切り替え（デモではログインの代わり）・監査ログ" className={`${navItem(false, narrow)} border border-rule bg-sheet`}>
        <UserRound size={16} className="shrink-0 text-ink-soft" />
        <NavLabel full={`${role}：${STAFF[role].name}`} short={role} narrow={narrow} />
        <ChevronDown size={13} className={`shrink-0 text-ink-faint ${narrow ? "hidden" : "hidden lg:inline"}`} />
      </button>
      <Popover open={open} onClose={() => setOpen(false)} anchor={btn} place="beside" width={288}>
        <h3 className="px-2 pb-1 text-xs font-bold text-ink-soft">職種（デモではログインの代わり）</h3>
        <ul className="mb-1">
          {ROLES.map((r) => (
            <li key={r}>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onRole(r);
                }}
                className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left hover:bg-paper pointer-coarse:py-2 ${r === role ? "font-bold text-ai" : ""}`}
              >
                {ROLE_LONG[r]}
                <span className="text-xs text-ink-faint">{STAFF[r].name}</span>
              </button>
            </li>
          ))}
        </ul>
        {extractOn && (
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onArea("extract");
            }}
            className="flex w-full items-center gap-2 rounded border-t border-rule-soft px-2 py-1.5 text-left hover:bg-paper"
          >
            <Table2 size={14} />
            データ抽出（CSV）
          </button>
        )}
        {auditOn && (
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onArea("audit");
            }}
            className="flex w-full items-center gap-2 rounded border-t border-rule-soft px-2 py-1.5 text-left hover:bg-paper"
          >
            <ScrollText size={14} />
            監査ログ
          </button>
        )}
      </Popover>
    </div>
  );
}

/**
 * An item of the left menu: a row with the full name when the menu is wide (on screens 1024px and
 * up), or the icon over a small name when it is narrow (like the tools on the right of the chart).
 */
function navItem(on: boolean, narrow?: boolean) {
  const shape = narrow
    ? "flex-col justify-center gap-0.5 px-0.5 py-1.5 text-center"
    : "flex-col justify-center gap-0.5 px-0.5 py-1.5 text-center lg:flex-row lg:justify-start lg:gap-2 lg:px-2 lg:text-left";
  return `relative flex w-full items-center rounded-md text-sm pointer-coarse:py-2 ${shape} ${on ? "bg-ink font-bold text-white" : "text-ink-soft hover:bg-sheet hover:text-ink"}`;
}

function NavLabel({ full, short, narrow }: { full: string; short: string; narrow?: boolean }) {
  return (
    <>
      <span className={narrow ? "hidden" : "hidden truncate lg:inline"}>{full}</span>
      <span className={`text-[10px] leading-tight ${narrow ? "" : "lg:hidden"}`}>{short}</span>
    </>
  );
}

/** A count on a menu item: at the end of the row when wide, a dot on the icon when narrow. */
function NavCount({ n, narrow }: { n: number; narrow?: boolean }) {
  if (!n) return null;
  return (
    <>
      {!narrow && (
        <span className="ml-auto hidden lg:inline">
          <Badge n={n} />
        </span>
      )}
      <span className={`absolute right-1.5 top-1 h-2 w-2 rounded-full bg-shu ${narrow ? "" : "lg:hidden"}`} />
    </>
  );
}

/**
 * The frame (①>②>③): the places down the left (病棟・救急外来・外来・手術室…, then チャット・やること・自分);
 * on top the tabs of the place chosen (②) and, inside 病棟, the charts opened under the ② tab (③).
 */
export function AppFrame(p: Props) {
  // null = automatic: narrow while a chart is shown (it needs the width), wide elsewhere.
  const [collapsed, setCollapsed] = useState<boolean | null>(null);
  const narrow = collapsed === null ? p.chartShown : collapsed;
  const places = p.areas.filter((a) => !a.tool);
  const chat = p.areas.find((a) => a.key === "chat");
  const [second, third] = p.rows;
  return (
    <div className="flex min-h-0 flex-1">
      <nav aria-label="メニュー" className={`scroll-thin flex shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-rule bg-tab px-1 py-2 ${narrow ? "w-16" : "w-16 lg:w-48 lg:px-1.5"}`}>
        <div className="mb-1 flex items-center gap-1 px-1">
          <span className={narrow ? "hidden" : "hidden lg:block"}>
            <Image src="/simple-karte-logo-small.svg" alt="SimpleKarte" width={104} height={18} priority />
          </span>
          <button
            type="button"
            onClick={() => setCollapsed(!narrow)}
            aria-label={narrow ? "メニューを広げる" : "メニューをたたむ"}
            title={narrow ? "広げる" : "たたむ（カルテを開いている間は自動でたたみます）"}
            className={`rounded p-1 text-ink-faint hover:bg-sheet hover:text-ink ${narrow ? "mx-auto" : "mx-auto lg:ml-auto lg:mr-0"}`}
          >
            {narrow ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          </button>
        </div>
        {places.map((a) => {
          const Icon = AREA_ICON[a.key];
          return (
            <button key={a.key} type="button" disabled={!!a.soon} aria-current={p.area === a.key ? "page" : undefined} title={a.soon ? `${a.label}（${a.soon}）` : a.label} onClick={() => p.onArea(a.key)} className={`${navItem(p.area === a.key, narrow)} disabled:text-ink-faint/50`}>
              <Icon size={17} className="shrink-0" />
              <NavLabel full={`${a.label}${a.soon ? "（準備中）" : ""}`} short={a.short} narrow={narrow} />
              <NavCount n={p.areaBadges[a.key] ?? 0} narrow={narrow} />
            </button>
          );
        })}
        <div className="mt-auto space-y-0.5 border-t border-rule pt-2">
          {chat && (
            <button type="button" onClick={() => p.onArea("chat")} title="チャット" aria-current={p.area === "chat" ? "page" : undefined} className={navItem(p.area === "chat", narrow)}>
              <MessagesSquare size={16} className="shrink-0" />
              <NavLabel full="チャット" short="チャット" narrow={narrow} />
            </button>
          )}
          <TodoButton todos={p.todos} narrow={narrow} />
          <UserButton role={p.role} onRole={p.onRole} onArea={p.onArea} auditOn={p.areas.some((a) => a.key === "audit")} extractOn={p.areas.some((a) => a.key === "extract")} narrow={narrow} />
        </div>
      </nav>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {second && (
          <Row
            row={second}
            small={false}
            end={
              <button type="button" onClick={p.onOpenPicker} title="患者を開く（⌘K）" className="mb-1 flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-sm text-ink-soft hover:bg-sheet hover:text-ink pointer-coarse:py-2">
                <Search size={16} />
                <span className="hidden xl:inline">患者を開く</span>
                <kbd className="hidden rounded border border-rule px-1 text-[10px] xl:inline">⌘K</kbd>
              </button>
            }
          />
        )}
        {third && <Row row={third} small />}
        {p.children}
      </div>
    </div>
  );
}
