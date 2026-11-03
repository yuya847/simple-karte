"use client";

import Image from "next/image";
import {
  Ambulance,
  ArrowRightLeft,
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
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { DEPTS, VIEW_LABEL, deptOf, deptsFor, hasTool, type Dept, type Layout } from "@/lib/nav";
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

interface Props {
  layout: Layout;
  onLayout: (l: Layout) => void;
  role: Role;
  onRole: (r: Role) => void;
  /** The screen shown: a department's view, or a patient's chart. */
  screen: PinnedTab | "chart";
  onScreen: (t: PinnedTab) => void;
  patients: Patient[];
  activeId: string | null;
  onSelectPatient: (id: string) => void;
  onClosePatient: (id: string) => void;
  onOpenPicker: () => void;
  badges: Partial<Record<PinnedTab, number>>;
  todos: Todo[];
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
const DEPT_ICON: Record<string, typeof Home> = { ward: LayoutGrid, er: Ambulance, or: Scissors, dialysis: Droplets, pharmacy: Pill, lab: FlaskConical, opd: Stethoscope };

const count = (badges: Props["badges"], views: PinnedTab[]) => views.reduce((n, v) => n + (badges[v] ?? 0), 0);

function Badge({ n, tone = "shu" }: { n: number; tone?: "shu" | "ai" | "yamabuki" }) {
  if (!n) return null;
  const bg = tone === "shu" ? "bg-shu" : tone === "ai" ? "bg-ai" : "bg-yamabuki";
  return <span className={`nums rounded-full ${bg} px-1.5 text-[10px] font-bold leading-4 text-white`}>{n}</span>;
}

/** A small menu that closes on Esc or a press outside. */
function Popover({ open, onClose, children, className = "" }: { open: boolean; onClose: () => void; children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("pointerdown", away, true);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("pointerdown", away, true);
      window.removeEventListener("keydown", esc);
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div ref={ref} className={`absolute z-50 mt-1 rounded-lg border border-rule bg-sheet p-1.5 text-sm shadow-[0_12px_32px_-8px_rgba(38,34,28,0.4)] ${className}`}>
      {children}
    </div>
  );
}

/** Open patient charts as browser-style tabs. */
function PatientStrip({ patients, activeId, onSelect, onClose, onOpenPicker }: { patients: Patient[]; activeId: string | null; onSelect: (id: string) => void; onClose: (id: string) => void; onOpenPicker: () => void }) {
  return (
    <div role="tablist" aria-label="開いている患者" className="scroll-thin flex min-w-0 flex-1 items-end gap-1 overflow-x-auto">
      {patients.map((p) => {
        const active = p.id === activeId;
        return (
          <div
            key={p.id}
            role="tab"
            aria-selected={active}
            tabIndex={0}
            onClick={() => onSelect(p.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") onSelect(p.id);
            }}
            onAuxClick={(e) => {
              if (e.button === 1) onClose(p.id);
            }}
            className={`group relative flex h-9 min-w-36 max-w-60 shrink-0 cursor-pointer items-center gap-2 rounded-t-lg border border-b-0 px-3 text-sm pointer-coarse:h-11 ${
              active ? "z-10 -mb-px border-rule bg-sheet text-ink" : "border-transparent text-ink-soft hover:bg-sheet/60"
            }`}
          >
            {p.infections.length > 0 && <span className="h-2 w-2 shrink-0 rounded-full bg-fuji" title={`感染症：${p.infections.join("、")}`} />}
            <PatientAvatar sex={p.sex} age={p.age} size={20} className="rounded-full" />
            <span className="truncate font-bold">{p.name}</span>
            <span className="nums shrink-0 text-xs text-ink-faint">{p.room}</span>
            <button
              type="button"
              aria-label={`${p.name} のカルテを閉じる`}
              onClick={(e) => {
                e.stopPropagation();
                onClose(p.id);
              }}
              className="ml-auto rounded p-0.5 text-ink-faint opacity-60 hover:bg-tab hover:text-ink group-hover:opacity-100 pointer-coarse:p-1.5 pointer-coarse:opacity-100"
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
      <button type="button" onClick={onOpenPicker} aria-label="患者を開く" title="患者を開く（⌘K）" className="mb-1 shrink-0 rounded-md p-1.5 text-ink-soft hover:bg-sheet/70 hover:text-ink">
        <Plus size={16} />
      </button>
    </div>
  );
}

/** やること: what is waiting for this role, gathered from everywhere; each line goes to its place. */
function TodoButton({ todos, compact }: { todos: Todo[]; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const total = todos.reduce((n, t) => n + t.count, 0);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        title="やること（未確認の結果・口頭指示・指示受け・期限など）"
        className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-ink-soft hover:bg-sheet hover:text-ink pointer-coarse:py-2 ${compact ? "w-full" : ""}`}
      >
        <CheckSquare size={16} />
        <span className={compact ? "hidden lg:inline" : "hidden xl:inline"}>やること</span>
        <Badge n={total} />
      </button>
      <Popover open={open} onClose={() => setOpen(false)} className={compact ? "bottom-full left-0 mb-1 w-80" : "right-0 w-80"}>
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

/** 自分: the role (login stand-in for the demo), the audit log, and which layout to use. */
function UserButton({ role, onRole, onScreen, layout, onLayout, compact }: { role: Role; onRole: (r: Role) => void; onScreen: (t: PinnedTab) => void; layout: Layout; onLayout: (l: Layout) => void; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        title="職種の切り替え（デモではログインの代わり）・監査ログ・画面の並び"
        className={`flex items-center gap-1.5 rounded-md border border-rule bg-sheet px-2 py-1 text-xs pointer-coarse:py-2 ${compact ? "w-full" : ""}`}
      >
        <UserRound size={14} className="shrink-0 text-ink-soft" />
        <b className={`truncate ${compact ? "hidden lg:inline" : ""}`}>
          {role}：{STAFF[role].name}
        </b>
        <ChevronDown size={13} className={`shrink-0 text-ink-faint ${compact ? "hidden lg:inline" : ""}`} />
      </button>
      <Popover open={open} onClose={() => setOpen(false)} className={compact ? "bottom-full left-0 mb-1 w-72" : "right-0 w-72"}>
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
        {hasTool(role, "audit") && (
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onScreen("audit");
            }}
            className="flex w-full items-center gap-2 rounded border-t border-rule-soft px-2 py-1.5 text-left hover:bg-paper"
          >
            <ScrollText size={14} />
            監査ログ
          </button>
        )}
        <div className="border-t border-rule-soft px-2 pt-1.5">
          <div className="mb-1 text-xs font-bold text-ink-soft">画面の並び（見比べ用）</div>
          <LayoutSwitch layout={layout} onLayout={onLayout} />
        </div>
      </Popover>
    </div>
  );
}

function LayoutSwitch({ layout, onLayout }: { layout: Layout; onLayout: (l: Layout) => void }) {
  return (
    <div role="radiogroup" aria-label="画面の並び" className="inline-flex rounded-md border border-rule bg-paper p-0.5 text-xs">
      {(
        [
          ["A", "A 上にホーム"],
          ["B", "B 左にメニュー"],
        ] as const
      ).map(([v, l]) => (
        <button key={v} type="button" role="radio" aria-checked={layout === v} onClick={() => onLayout(v)} className={`whitespace-nowrap rounded px-2 py-0.5 pointer-coarse:py-1.5 ${layout === v ? "bg-ink font-bold text-white" : "text-ink-soft"}`}>
          {l}
        </button>
      ))}
    </div>
  );
}

const iconBtn = "flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-ink-soft hover:bg-sheet hover:text-ink pointer-coarse:py-2";

export function AppFrame(p: Props) {
  const depts = deptsFor(p.role);
  // The department last shown, and the view last shown in each, so 「ホーム」 returns to where you were.
  const [lastView, setLastView] = useState<Record<string, PinnedTab>>({});
  const [deptKey, setDeptKey] = useState<string | null>(null);
  const shownDept = p.screen !== "chart" ? deptOf(p.screen) : undefined;
  const dept: Dept | undefined = shownDept ?? depts.find((d) => d.key === deptKey) ?? depts.find((d) => d.views.length);
  useEffect(() => {
    if (p.screen === "chart") return;
    const d = deptOf(p.screen);
    if (!d) return;
    setDeptKey(d.key);
    setLastView((v) => (v[d.key] === p.screen ? v : { ...v, [d.key]: p.screen as PinnedTab }));
  }, [p.screen]);
  const goDept = (d: Dept) => d.views.length && p.onScreen(lastView[d.key] && d.views.includes(lastView[d.key]) ? lastView[d.key] : d.views[0]);
  const views = depts.find((d) => d.key === dept?.key)?.views ?? [];
  const chatOn = p.screen === "chat";

  if (p.layout === "A") {
    return (
      <>
        <div className="flex items-end gap-1 border-b border-rule bg-tab px-2 pt-1.5">
          <div className="flex items-center pb-2 pl-1 pr-2">
            <Image src="/simple-karte-logo-small.svg" alt="SimpleKarte" width={114} height={20} priority />
          </div>
          <HomeTab dept={dept} depts={depts} active={p.screen !== "chart" && !!shownDept} badge={count(p.badges, views)} onHome={() => dept && goDept(dept)} onDept={goDept} badges={p.badges} />
          <PatientStrip patients={p.patients} activeId={p.screen === "chart" ? p.activeId : null} onSelect={p.onSelectPatient} onClose={p.onClosePatient} onOpenPicker={p.onOpenPicker} />
          <div className="mb-1 flex shrink-0 items-center gap-0.5">
            <button type="button" onClick={p.onOpenPicker} title="患者を開く（⌘K）" className={iconBtn}>
              <Search size={16} />
              <kbd className="hidden rounded border border-rule px-1 text-[10px] xl:inline">⌘K</kbd>
            </button>
            {hasTool(p.role, "chat") && (
              <button type="button" onClick={() => p.onScreen("chat")} title="チャット" aria-pressed={chatOn} className={`${iconBtn} ${chatOn ? "bg-sheet text-ink" : ""}`}>
                <MessagesSquare size={16} />
              </button>
            )}
            <TodoButton todos={p.todos} />
            <UserButton role={p.role} onRole={p.onRole} onScreen={p.onScreen} layout={p.layout} onLayout={p.onLayout} />
          </div>
        </div>
        {p.screen !== "chart" && shownDept && views.length > 1 && (
          <div role="tablist" aria-label={`${shownDept.label}の画面`} className="scroll-thin flex shrink-0 items-center gap-1 overflow-x-auto border-b border-rule bg-sheet px-3 py-1">
            {views.map((v) => {
              const Icon = VIEW_ICON[v];
              const on = p.screen === v;
              return (
                <button
                  key={v}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  onClick={() => p.onScreen(v)}
                  className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1 text-sm pointer-coarse:py-2 ${on ? "bg-ink font-bold text-white" : "text-ink-soft hover:bg-paper hover:text-ink"}`}
                >
                  <Icon size={14} />
                  {VIEW_LABEL[v]}
                  <Badge n={p.badges[v] ?? 0} />
                </button>
              );
            })}
          </div>
        )}
        {p.children}
      </>
    );
  }

  return <LayoutB {...p} depts={depts} goDept={goDept} />;
}

/** A: the home tab — the department you are in (switch it with ▾) and back to its screens. */
function HomeTab({ dept, depts, active, badge, badges, onHome, onDept }: { dept?: Dept; depts: Dept[]; active: boolean; badge: number; badges: Props["badges"]; onHome: () => void; onDept: (d: Dept) => void }) {
  const [open, setOpen] = useState(false);
  const Icon = dept ? (DEPT_ICON[dept.key] ?? Home) : Home;
  return (
    <div className="relative shrink-0">
      <div
        className={`flex h-9 items-center rounded-t-lg border border-b-0 text-sm pointer-coarse:h-11 ${active ? "z-10 -mb-px border-rule bg-sheet font-bold text-ink" : "border-transparent text-ink-soft hover:bg-sheet/60"}`}
      >
        <button type="button" onClick={onHome} title="ホーム（いまの部署の画面）" className="flex h-full items-center gap-1.5 pl-3 pr-1.5">
          <Icon size={15} />
          <span className="whitespace-nowrap">{dept?.label ?? "ホーム"}</span>
          <Badge n={badge} />
        </button>
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label="部署を切り替える" title="部署を切り替える" className="flex h-full items-center pl-0.5 pr-2 text-ink-faint hover:text-ink">
          <ChevronDown size={14} />
        </button>
      </div>
      <Popover open={open} onClose={() => setOpen(false)} className="left-0 w-60">
        <h3 className="px-2 pb-1 text-xs font-bold text-ink-soft">部署</h3>
        <ul>
          {depts.map((d) => {
            const DIcon = DEPT_ICON[d.key] ?? Home;
            return (
              <li key={d.key}>
                <button
                  type="button"
                  disabled={!d.views.length}
                  title={d.soon}
                  onClick={() => {
                    setOpen(false);
                    onDept(d);
                  }}
                  className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-paper disabled:text-ink-faint/60 pointer-coarse:py-2.5 ${d.key === dept?.key ? "font-bold text-ai" : ""}`}
                >
                  <DIcon size={15} />
                  {d.label}
                  {d.soon && <span className="text-[11px]">（準備中）</span>}
                  <span className="ml-auto">
                    <Badge n={count(badges, d.views)} />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </Popover>
    </div>
  );
}

/** B: a menu down the left (departments and their screens, chat, やること, 自分); patient tabs on top. */
function LayoutB(p: Props & { depts: Dept[]; goDept: (d: Dept) => void }) {
  // null = automatic: icons only while a chart is open (it needs the width), names elsewhere.
  const [collapsed, setCollapsed] = useState<boolean | null>(null);
  const wide = collapsed === null ? p.screen !== "chart" : !collapsed;
  const item = (on: boolean) =>
    `flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm pointer-coarse:py-2.5 ${on ? "bg-ink font-bold text-white" : "text-ink-soft hover:bg-sheet hover:text-ink"}`;
  const label = wide ? "hidden lg:inline truncate" : "hidden";
  return (
    <div className="flex min-h-0 flex-1">
      <nav aria-label="メニュー" className={`scroll-thin flex shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-rule bg-tab px-1.5 py-2 ${wide ? "w-14 lg:w-52" : "w-14"}`}>
        <div className="mb-2 flex items-center gap-1 px-1">
          <span className={wide ? "hidden lg:block" : "hidden"}>
            <Image src="/simple-karte-logo-small.svg" alt="SimpleKarte" width={104} height={18} priority />
          </span>
          <button
            type="button"
            onClick={() => setCollapsed(wide)}
            aria-label={wide ? "メニューをたたむ" : "メニューを広げる"}
            title={wide ? "たたむ（カルテを開いている間は自動でたたみます）" : "広げる"}
            className="ml-auto rounded p-1 text-ink-faint hover:bg-sheet hover:text-ink"
          >
            {wide ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
          </button>
        </div>
        {p.depts.map((d) => {
          const DIcon = DEPT_ICON[d.key] ?? Home;
          if (d.views.length <= 1) {
            const v = d.views[0];
            const on = !!v && p.screen === v;
            return (
              <button key={d.key} type="button" disabled={!v} title={d.soon ?? d.label} onClick={() => p.goDept(d)} className={`${item(on)} disabled:text-ink-faint/50`}>
                <DIcon size={16} className="shrink-0" />
                <span className={label}>
                  {d.label}
                  {d.soon ? "（準備中）" : ""}
                </span>
                {v && <span className={`ml-auto ${wide ? "" : "absolute"}`}><Badge n={p.badges[v] ?? 0} /></span>}
              </button>
            );
          }
          return (
            <div key={d.key} className="mb-1">
              <div className={`flex items-center gap-2 px-2 pb-0.5 pt-1.5 text-[11px] font-bold text-ink-faint ${wide ? "" : "justify-center"}`} title={d.label}>
                <DIcon size={13} className={wide ? "lg:hidden" : ""} />
                <span className={label}>{d.label}</span>
              </div>
              {d.views.map((v) => {
                const Icon = VIEW_ICON[v];
                const on = p.screen === v;
                return (
                  <button key={v} type="button" onClick={() => p.onScreen(v)} title={VIEW_LABEL[v]} className={`relative ${item(on)}`}>
                    <Icon size={16} className="shrink-0" />
                    <span className={label}>{VIEW_LABEL[v]}</span>
                    <span className={wide ? "ml-auto hidden lg:inline" : "hidden"}>
                      <Badge n={p.badges[v] ?? 0} />
                    </span>
                    {!!p.badges[v] && <span className={`absolute right-1 top-1 h-2 w-2 rounded-full bg-shu ${wide ? "lg:hidden" : ""}`} />}
                  </button>
                );
              })}
            </div>
          );
        })}
        <div className="mt-auto space-y-0.5 border-t border-rule pt-2">
          {hasTool(p.role, "chat") && (
            <button type="button" onClick={() => p.onScreen("chat")} title="チャット" className={item(p.screen === "chat")}>
              <MessagesSquare size={16} className="shrink-0" />
              <span className={label}>チャット</span>
            </button>
          )}
          <TodoButton todos={p.todos} compact />
          <UserButton role={p.role} onRole={p.onRole} onScreen={p.onScreen} layout={p.layout} onLayout={p.onLayout} compact />
        </div>
      </nav>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex items-end gap-1 border-b border-rule bg-tab px-2 pt-1.5">
          <PatientStrip patients={p.patients} activeId={p.screen === "chart" ? p.activeId : null} onSelect={p.onSelectPatient} onClose={p.onClosePatient} onOpenPicker={p.onOpenPicker} />
          <button type="button" onClick={p.onOpenPicker} title="患者を開く（⌘K）" className={`${iconBtn} mb-1 shrink-0`}>
            <Search size={16} />
            <span className="hidden xl:inline">患者を開く</span>
            <kbd className="hidden rounded border border-rule px-1 text-[10px] xl:inline">⌘K</kbd>
          </button>
        </div>
        {p.children}
      </div>
    </div>
  );
}

export { DEPTS };
