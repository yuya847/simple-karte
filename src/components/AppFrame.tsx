"use client";

import Image from "next/image";
import {
  Ambulance,
  ArrowRightLeft,
  BedDouble,
  CheckSquare,
  ChevronDown,
  ClipboardCheck,
  ClipboardList,
  Droplets,
  FlaskConical,
  Home,
  LayoutGrid,
  List,
  MessagesSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Pill,
  Plus,
  Printer,
  Scissors,
  ScrollText,
  Search,
  Stethoscope,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { VIEW_LABEL, areaOf, type Area, type AreaKey, type Scope } from "@/lib/nav";
import { ROLES, ROLE_LONG, STAFF, type PinnedTab, type Role } from "@/lib/roles";
import type { Patient } from "@/lib/types";
import { PatientAvatar } from "./PatientAvatar";

export interface Todo {
  key: string;
  label: string;
  detail?: string;
  count: number;
  tone: "shu" | "yamabuki" | "ai";
  go: () => void;
}

export interface WardBar {
  /** The tabs open inside 病棟 (a ward, 受け持ち, a department). */
  scopes: Scope[];
  active: string;
  /** Everything that can be opened as a tab there. */
  options: Scope[];
  onScope: (key: string) => void;
  onAdd: (key: string) => void;
  onClose: (key: string) => void;
  /** The views of the active tab (マップ・一覧・ワークシート…). */
  views: PinnedTab[];
}

interface Props {
  role: Role;
  onRole: (r: Role) => void;
  /** The places and tools this role uses. */
  areas: Area[];
  /** Places open as tabs on top. */
  openAreas: AreaKey[];
  screen: PinnedTab | "chart";
  onArea: (k: AreaKey) => void;
  onCloseArea: (k: AreaKey) => void;
  onView: (v: PinnedTab) => void;
  patients: Patient[];
  activeId: string | null;
  onSelectPatient: (id: string) => void;
  onClosePatient: (id: string) => void;
  onOpenPicker: () => void;
  badges: Partial<Record<PinnedTab, number>>;
  todos: Todo[];
  ward: WardBar;
  children: React.ReactNode;
}

const VIEW_ICON: Record<PinnedTab, typeof Home> = {
  map: LayoutGrid,
  list: List,
  sheet: Printer,
  handoff: ArrowRightLeft,
  admit: ClipboardList,
  acuity: ClipboardCheck,
  er: Ambulance,
  or: Scissors,
  dialysis: Droplets,
  pharmacy: Pill,
  lab: FlaskConical,
  chat: MessagesSquare,
  audit: ScrollText,
};
const AREA_ICON: Record<AreaKey, typeof Home> = {
  ward: BedDouble,
  opd: Stethoscope,
  er: Ambulance,
  or: Scissors,
  dialysis: Droplets,
  pharmacy: Pill,
  lab: FlaskConical,
  chat: MessagesSquare,
  audit: ScrollText,
};

const sum = (badges: Props["badges"], views: PinnedTab[]) => views.reduce((n, v) => n + (badges[v] ?? 0), 0);

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

const tabShape = (active: boolean) =>
  `group relative flex h-9 shrink-0 cursor-pointer items-center gap-2 rounded-t-lg border border-b-0 px-3 text-sm pointer-coarse:h-11 ${
    active ? "z-10 -mb-px border-rule bg-sheet text-ink" : "border-transparent text-ink-soft hover:bg-sheet/60"
  }`;

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

/** The tab bar on top: the places opened from the left menu, then patients' charts. */
function TopTabs(p: Props) {
  const current = p.screen === "chart" ? null : areaOf(p.screen);
  const open = p.openAreas.map((k) => p.areas.find((a) => a.key === k)).filter((a): a is Area => !!a);
  return (
    <div className="flex items-end gap-1 border-b border-rule bg-tab px-2 pt-1.5">
      <div role="tablist" aria-label="開いている画面とカルテ" className="scroll-thin flex min-w-0 flex-1 items-end gap-1 overflow-x-auto">
        {open.map((a) => {
          const Icon = AREA_ICON[a.key];
          const on = current === a.key;
          return (
            <div key={a.key} role="tab" aria-selected={on} tabIndex={0} onClick={() => p.onArea(a.key)} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && p.onArea(a.key)} className={`${tabShape(on)} ${on ? "font-bold" : ""}`}>
              <Icon size={15} />
              <span className="whitespace-nowrap">{a.label}</span>
              <Badge n={sum(p.badges, a.views)} />
              <CloseX label={`${a.label}のタブを閉じる`} onClose={() => p.onCloseArea(a.key)} />
            </div>
          );
        })}
        {open.length > 0 && p.patients.length > 0 && <span aria-hidden className="mx-0.5 mb-2 h-5 w-px shrink-0 bg-rule" />}
        {p.patients.map((pt) => {
          const on = p.screen === "chart" && pt.id === p.activeId;
          return (
            <div
              key={pt.id}
              role="tab"
              aria-selected={on}
              tabIndex={0}
              onClick={() => p.onSelectPatient(pt.id)}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && p.onSelectPatient(pt.id)}
              onAuxClick={(e) => e.button === 1 && p.onClosePatient(pt.id)}
              className={`${tabShape(on)} min-w-36 max-w-60`}
            >
              {pt.infections.length > 0 && <span className="h-2 w-2 shrink-0 rounded-full bg-fuji" title={`感染症：${pt.infections.join("、")}`} />}
              <PatientAvatar sex={pt.sex} age={pt.age} size={20} className="rounded-full" />
              <span className="truncate font-bold">{pt.name}</span>
              <span className="nums shrink-0 text-xs text-ink-faint">{pt.room}</span>
              <CloseX label={`${pt.name} のカルテを閉じる`} onClose={() => p.onClosePatient(pt.id)} />
            </div>
          );
        })}
        <button type="button" onClick={p.onOpenPicker} aria-label="患者を開く" title="患者を開く（⌘K）" className="mb-1 shrink-0 rounded-md p-1.5 text-ink-soft hover:bg-sheet/70 hover:text-ink">
          <Plus size={16} />
        </button>
      </div>
      <button type="button" onClick={p.onOpenPicker} title="患者を開く（⌘K）" className="mb-1 flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-sm text-ink-soft hover:bg-sheet hover:text-ink pointer-coarse:py-2">
        <Search size={16} />
        <span className="hidden xl:inline">患者を開く</span>
        <kbd className="hidden rounded border border-rule px-1 text-[10px] xl:inline">⌘K</kbd>
      </button>
    </div>
  );
}

/** Inside 病棟: tabs of which patients (a ward, 受け持ち, a department; open more with ＋), then the views. */
function WardBarView({ ward, screen, badges, onView }: { ward: WardBar; screen: PinnedTab; badges: Props["badges"]; onView: (v: PinnedTab) => void }) {
  const [adding, setAdding] = useState(false);
  const plus = useRef<HTMLButtonElement>(null);
  const groups: { title: string; kind: Scope["kind"] }[] = [
    { title: "病棟", kind: "ward" },
    { title: "受け持ち", kind: "mine" },
    { title: "診療科", kind: "dept" },
  ];
  return (
    <div className="shrink-0 border-b border-rule bg-sheet">
      <div role="tablist" aria-label="病棟の中のタブ" className="scroll-thin flex items-end gap-1 overflow-x-auto border-b border-rule-soft px-3 pt-1.5">
        {ward.scopes.map((s) => {
          const on = s.key === ward.active;
          const Icon = s.kind === "mine" ? UserRound : s.kind === "dept" ? Users : BedDouble;
          return (
            <div
              key={s.key}
              role="tab"
              aria-selected={on}
              tabIndex={0}
              onClick={() => ward.onScope(s.key)}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && ward.onScope(s.key)}
              className={`group flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-t-md border border-b-0 px-2.5 text-[13px] pointer-coarse:h-10 ${on ? "-mb-px border-rule bg-paper font-bold text-ink" : "border-transparent text-ink-soft hover:bg-paper/60"}`}
            >
              <Icon size={14} />
              <span className="whitespace-nowrap">{s.label}</span>
              {ward.scopes.length > 1 && <CloseX label={`${s.label}のタブを閉じる`} onClose={() => ward.onClose(s.key)} />}
            </div>
          );
        })}
        <button ref={plus} type="button" onClick={() => setAdding((a) => !a)} aria-expanded={adding} title="病棟・受け持ち・診療科のタブを開く" className="mb-1 flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs text-ink-soft hover:bg-paper hover:text-ink pointer-coarse:py-2">
          <Plus size={14} />
          タブを開く
        </button>
        <Popover open={adding} onClose={() => setAdding(false)} anchor={plus} place="below-left" width={260}>
          {groups.map((g) => (
            <div key={g.kind} className="mb-1">
              <h3 className="px-2 pb-0.5 pt-1 text-[11px] font-bold text-ink-faint">{g.title}</h3>
              {ward.options
                .filter((o) => o.kind === g.kind)
                .map((o) => {
                  const isOpen = ward.scopes.some((s) => s.key === o.key);
                  return (
                    <button
                      key={o.key}
                      type="button"
                      disabled={!!o.soon}
                      title={o.soon}
                      onClick={() => {
                        setAdding(false);
                        ward.onAdd(o.key);
                      }}
                      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-paper disabled:text-ink-faint/60 pointer-coarse:py-2.5"
                    >
                      {o.label}
                      {o.soon && <span className="text-[11px]">（準備中）</span>}
                      {isOpen && <span className="ml-auto text-[11px] text-ink-faint">開いています</span>}
                    </button>
                  );
                })}
            </div>
          ))}
        </Popover>
      </div>
      <div role="tablist" aria-label="画面" className="scroll-thin flex items-center gap-1 overflow-x-auto bg-paper px-3 py-1">
        {ward.views.map((v) => {
          const Icon = VIEW_ICON[v];
          const on = screen === v;
          return (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => onView(v)}
              className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1 text-sm pointer-coarse:py-2 ${on ? "bg-ink font-bold text-white" : "text-ink-soft hover:bg-sheet hover:text-ink"}`}
            >
              <Icon size={14} />
              {VIEW_LABEL[v]}
              <Badge n={badges[v] ?? 0} />
            </button>
          );
        })}
      </div>
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
function UserButton({ role, onRole, onArea, auditOn, narrow }: { role: Role; onRole: (r: Role) => void; onArea: (k: AreaKey) => void; auditOn: boolean; narrow?: boolean }) {
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
 * The frame: the places down the left (病棟・外来・救急外来・手術室…, then チャット・やること・自分), and on
 * top the tabs of the places opened from it and of patients' charts. 病棟 has its own tabs inside.
 */
export function AppFrame(p: Props) {
  // null = automatic: narrow while a chart is open (it needs the width), wide elsewhere.
  const [collapsed, setCollapsed] = useState<boolean | null>(null);
  const narrow = collapsed === null ? p.screen === "chart" : collapsed;
  const current = p.screen === "chart" ? null : areaOf(p.screen);
  const places = p.areas.filter((a) => !a.tool);
  const chat = p.areas.find((a) => a.key === "chat");
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
            <button key={a.key} type="button" disabled={!a.views.length} title={a.soon ?? a.label} onClick={() => p.onArea(a.key)} className={`${navItem(current === a.key, narrow)} disabled:text-ink-faint/50`}>
              <Icon size={17} className="shrink-0" />
              <NavLabel full={`${a.label}${a.soon ? "（準備中）" : ""}`} short={a.short} narrow={narrow} />
              <NavCount n={sum(p.badges, a.views)} narrow={narrow} />
            </button>
          );
        })}
        <div className="mt-auto space-y-0.5 border-t border-rule pt-2">
          {chat && (
            <button type="button" onClick={() => p.onArea("chat")} title="チャット" className={navItem(current === "chat", narrow)}>
              <MessagesSquare size={16} className="shrink-0" />
              <NavLabel full="チャット" short="チャット" narrow={narrow} />
            </button>
          )}
          <TodoButton todos={p.todos} narrow={narrow} />
          <UserButton role={p.role} onRole={p.onRole} onArea={p.onArea} auditOn={p.areas.some((a) => a.key === "audit")} narrow={narrow} />
        </div>
      </nav>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <TopTabs {...p} />
        {current === "ward" && p.screen !== "chart" && <WardBarView ward={p.ward} screen={p.screen} badges={p.badges} onView={p.onView} />}
        {p.children}
      </div>
    </div>
  );
}
