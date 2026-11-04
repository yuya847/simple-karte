"use client";

import Image from "next/image";
import { CheckSquare, ChevronDown, ChevronRight, CircleHelp, LockKeyhole, LogOut, Megaphone, Plus, ScrollText, Search, Table2, UserRound, X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Area, AreaKey } from "@/lib/nav";
import { ROLES, ROLE_LONG, STAFF, type Role } from "@/lib/roles";
import type { Sex } from "@/lib/types";
import { AREA_ICON, type Icon } from "./nav-icons";
import { PatientAvatar } from "./PatientAvatar";
import { useHints } from "@/lib/hints";

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
  /** A menu tab (新しいタブ・画面を選ぶ), drawn with a dashed edge. */
  menu?: boolean;
  title?: string;
  onSelect: () => void;
  onClose?: () => void;
  closeLabel?: string;
  /** ⌄ on the tab: switch this tab to another view of the same kind (入院患者一覧 → 病棟マップ …), in place. */
  switcher?: { options: { key: string; label: string; icon?: Icon; group?: string }[]; onPick: (key: string) => void; current?: string };
}

export interface TabRow {
  label: string;
  items: TabItem[];
  /** ＋ at the end of the row. */
  plus?: { label: string; title: string; onClick: () => void };
}

/** A person to choose inside a role (医師: 研修医・専攻医・指導医・ほかのチーム). */
export interface PersonChoice {
  name: string;
  note: string;
}

/** A step of the breadcrumb over a chart: where it was opened from (病棟 › 入院患者一覧 › 515 大浦 トメ). */
export interface Crumb {
  label: string;
  onClick?: () => void;
}

interface Props {
  role: Role;
  onRole: (r: Role) => void;
  /** The name of the person now (when the role has more than one to choose from). */
  meName?: string;
  /** The doctors to choose from inside 医師, and choosing one. */
  doctors?: PersonChoice[];
  onDoctor?: (name: string) => void;
  /** The places and tools this role uses. */
  areas: Area[];
  /** The place chosen (病棟・救急外来・外来・手術室…), from the pulldown at the start of the top row. */
  area: AreaKey;
  onArea: (k: AreaKey) => void;
  /** The top row: the screens of the place (病棟: the screens chosen from its menu; 救急外来・外来: the list). */
  screens: TabRow;
  /** The second row: every open chart, wherever it was opened from (null: none open). */
  patients: TabRow | null;
  /** Where the chart in front was opened from. */
  crumbs?: Crumb[];
  onOpenPicker: () => void;
  /** Counts on the places (shown in the pulldown). */
  areaBadges: Partial<Record<AreaKey, number>>;
  todos: Todo[];
  /** ログインの仕組み is on and someone is logged in: the menu has ログアウト・画面をロック instead of the roles. */
  session?: { onLogout: () => void; onLock: () => void };
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

/** ⌄ on a tab: the other views of the same kind; choosing one replaces the tab where it is. */
function TabSwitch({ tab }: { tab: TabItem }) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const sw = tab.switcher!;
  return (
    <>
      <button
        ref={btn}
        type="button"
        aria-label={`${tab.label}をほかの見せ方に切り替える`}
        aria-expanded={open}
        title="切り替える（病棟マップ・入院患者一覧・受け持ち患者…）"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className="rounded p-0.5 text-ink-soft hover:bg-tab hover:text-ink pointer-coarse:p-1.5"
      >
        <ChevronDown size={15} />
      </button>
      <Popover open={open} onClose={() => setOpen(false)} anchor={btn} place="below-left" width={220}>
        <ul>
          {sw.options.map((o, i) => {
            const I = o.icon;
            const heading = o.group && o.group !== sw.options[i - 1]?.group ? o.group : null;
            const on = o.key === (sw.current ?? tab.key);
            return (
              <li key={o.key}>
                {heading && <div className="mt-1 border-t border-rule-soft px-2 pb-0.5 pt-1.5 text-[11px] font-bold text-ink-faint">{heading}</div>}
                <button
                  type="button"
                  aria-current={on ? "true" : undefined}
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpen(false);
                    if (!on) sw.onPick(o.key);
                  }}
                  className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-paper pointer-coarse:py-2.5 ${on ? "font-bold text-ai" : ""}`}
                >
                  {I && <I size={15} className="shrink-0" />}
                  {o.label}
                </button>
              </li>
            );
          })}
        </ul>
      </Popover>
    </>
  );
}

/** One row of tabs: the screens (large, on the frame's color) or the charts (small, on the sheet). */
function Row({ row, small, start, end }: { row: TabRow; small: boolean; start?: React.ReactNode; end?: React.ReactNode }) {
  return (
    <div className={`flex items-end gap-1 border-b border-rule ${small ? "bg-sheet px-3 pt-1" : "bg-tab px-2 pt-1.5"}`}>
      {start}
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
              {t.switcher && <TabSwitch tab={t} />}
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

/** A button on the right of the top row (患者を開く・やること・掲示板・自分). */
const barButton = "mb-1 flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-sm text-ink-soft hover:bg-sheet hover:text-ink pointer-coarse:py-2";

/** 場所: the pulldown at the start of the top row (部署, then the hospital's shared places). */
function PlaceButton({ areas, area, onArea, badges }: { areas: Area[]; area: AreaKey; onArea: (k: AreaKey) => void; badges: Partial<Record<AreaKey, number>> }) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const places = areas.filter((a) => !a.tool || a.key === "chat");
  const depts = places.filter((a) => a.kind !== "page" || ["or", "dialysis", "pharmacy", "lab", "liaison", "receipt"].includes(a.key));
  const shared = places.filter((a) => !depts.includes(a));
  const now = AREAS_LABEL(areas, area);
  const Icon = AREA_ICON[area];
  const elsewhere = places.some((a) => a.key !== area && (badges[a.key] ?? 0) > 0);
  const item = (a: Area) => {
    const I = AREA_ICON[a.key];
    return (
      <li key={a.key}>
        <button
          type="button"
          disabled={!!a.soon}
          aria-current={a.key === area ? "page" : undefined}
          onClick={() => {
            setOpen(false);
            onArea(a.key);
          }}
          className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-paper disabled:text-ink-faint/50 pointer-coarse:py-2.5 ${a.key === area ? "font-bold text-ai" : ""}`}
        >
          <I size={15} className="shrink-0" />
          {a.label}
          {a.soon && <span className="text-[11px] text-ink-faint">（準備中）</span>}
          <span className="ml-auto">
            <Badge n={badges[a.key] ?? 0} />
          </span>
        </button>
      </li>
    );
  };
  return (
    <>
      <button ref={btn} type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="menu" title="場所を選ぶ（病棟・救急外来・外来・手術室…）" className="relative mb-1 flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-rule bg-sheet px-2.5 text-sm font-bold hover:border-ai pointer-coarse:h-10">
        <Icon size={15} className="shrink-0 text-ai" />
        {now}
        <ChevronDown size={14} className="text-ink-faint" />
        {elsewhere && <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border-2 border-tab bg-shu" title="ほかの場所に待っていることがあります" />}
      </button>
      <Popover open={open} onClose={() => setOpen(false)} anchor={btn} place="below-left" width={248}>
        <h3 className="px-2 pb-1 pt-0.5 text-xs font-bold text-ink-soft">部署</h3>
        <ul className="mb-1">{depts.map(item)}</ul>
        {shared.length > 0 && (
          <>
            <h3 className="border-t border-rule-soft px-2 pb-1 pt-1.5 text-xs font-bold text-ink-soft">そのほか</h3>
            <ul>{shared.map(item)}</ul>
          </>
        )}
      </Popover>
    </>
  );
}
const AREAS_LABEL = (areas: Area[], k: AreaKey) => areas.find((a) => a.key === k)?.label ?? "";

/** やること: what is waiting for this role, gathered from everywhere; each line goes to its place. */
function TodoButton({ todos }: { todos: Todo[] }) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const total = todos.reduce((n, t) => n + t.count, 0);
  return (
    <>
      <button ref={btn} type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} title="やること（未確認の結果・口頭指示・指示受け・期限など）" className={barButton}>
        <CheckSquare size={16} />
        <span className="hidden lg:inline">やること</span>
        <Badge n={total} />
      </button>
      <Popover open={open} onClose={() => setOpen(false)} anchor={btn} place="below-right" width={340}>
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
    </>
  );
}

/** 自分: the role (login stand-in for the demo), データ抽出 and the audit log. */
function UserButton({ role, onRole, onArea, auditOn, extractOn, meName, doctors, onDoctor, session }: { role: Role; onRole: (r: Role) => void; onArea: (k: AreaKey) => void; auditOn: boolean; extractOn: boolean; meName?: string; doctors?: PersonChoice[]; onDoctor?: (name: string) => void; session?: Props["session"] }) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={btn} type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} title="職種の切り替え（デモではログインの代わり）・データ抽出・監査ログ" className={`${barButton} border border-rule bg-sheet`}>
        <UserRound size={16} className="shrink-0 text-ink-soft" />
        <span className="max-w-48 truncate">
          {role}
          <span className="hidden lg:inline">：{meName ?? STAFF[role].name}</span>
        </span>
        <ChevronDown size={13} className="shrink-0 text-ink-faint" />
      </button>
      <Popover open={open} onClose={() => setOpen(false)} anchor={btn} place="below-right" width={288}>
        {session ? (
          <div className="mb-1">
            <h3 className="px-2 pb-1 text-xs font-bold text-ink-soft">ログイン中：{meName ?? STAFF[role].name}（{ROLE_LONG[role]}）</h3>
            <button type="button" onClick={() => (setOpen(false), session.onLock())} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-paper">
              <LockKeyhole size={14} />
              画面をロック
            </button>
            <button type="button" onClick={() => (setOpen(false), session.onLogout())} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-paper">
              <LogOut size={14} />
              ログアウト（別の人に代わる）
            </button>
          </div>
        ) : (
          <>
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
                <span className="text-xs text-ink-faint">{r === role && meName ? meName : STAFF[r].name}</span>
              </button>
              {r === "医師" && doctors && onDoctor && (
                <ul aria-label="医師を選ぶ" className="mb-1 ml-4 border-l border-rule-soft pl-1">
                  {doctors.map((d) => {
                    const on = role === "医師" && meName === d.name;
                    return (
                      <li key={d.name}>
                        <button
                          type="button"
                          aria-pressed={on}
                          onClick={() => {
                            setOpen(false);
                            onDoctor(d.name);
                          }}
                          className={`w-full rounded px-2 py-0.5 text-left text-[13px] hover:bg-paper pointer-coarse:py-1.5 ${on ? "font-bold text-ai" : ""}`}
                        >
                          {d.name}
                          <span className="block text-[11px] font-normal leading-tight text-ink-faint">{d.note}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          ))}
        </ul>
          </>
        )}
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
    </>
  );
}


/**
 * The frame: the top row (場所 pulldown, the screens of the place, then 患者を開く・やること・掲示板・自分),
 * the row of open charts (one row, wherever each was opened from), and over a chart the breadcrumb of
 * where it was opened from.
 */
export function AppFrame(p: Props) {
  const boardOn = p.areas.some((a) => a.key === "board");
  const [hints, toggleHints] = useHints();
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <Row
        row={p.screens}
        small={false}
        start={
          <div className="flex shrink-0 items-end gap-2 pr-1">
            <span className="mb-2 hidden xl:block">
              <Image src="/simple-karte-logo-small.svg" alt="SimpleKarte" width={96} height={17} priority />
            </span>
            <PlaceButton areas={p.areas} area={p.area} onArea={p.onArea} badges={p.areaBadges} />
          </div>
        }
        end={
          <div className="flex shrink-0 items-end gap-0.5 pl-1">
            <button type="button" onClick={p.onOpenPicker} title="患者を開く（⌘K）" className={barButton}>
              <Search size={16} />
              <span className="hidden xl:inline">患者を開く</span>
              <kbd className="hidden rounded border border-rule px-1 text-[10px] xl:inline">⌘K</kbd>
            </button>
            <button type="button" onClick={toggleHints} aria-pressed={hints} title={hints ? "使い方の説明を隠す" : "画面ごとの使い方の説明を出す"} className={`${barButton} ${hints ? "bg-ai-soft font-bold text-ai" : ""}`}>
              <CircleHelp size={16} />
              <span className="hidden lg:inline">使い方</span>
            </button>
            <TodoButton todos={p.todos} />
            {boardOn && (
              <button type="button" onClick={() => p.onArea("board")} title="掲示板" className={barButton}>
                <Megaphone size={16} />
                <span className="hidden lg:inline">掲示板</span>
                <Badge n={p.areaBadges.board ?? 0} />
              </button>
            )}
            <UserButton role={p.role} onRole={p.onRole} onArea={p.onArea} auditOn={p.areas.some((a) => a.key === "audit")} extractOn={p.areas.some((a) => a.key === "extract")} meName={p.meName} doctors={p.doctors} onDoctor={p.onDoctor} session={p.session} />
          </div>
        }
      />
      {p.patients && <Row row={p.patients} small />}
      {p.crumbs && p.crumbs.length > 0 && (
        <nav aria-label="このカルテを開いた場所" className="flex items-center gap-1 border-b border-rule-soft bg-sheet px-4 py-0.5 text-[12px] text-ink-soft">
          {p.crumbs.map((c, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <ChevronRight size={12} className="text-ink-faint" />}
              {c.onClick ? (
                <button type="button" onClick={c.onClick} className="hover:text-ai hover:underline">
                  {c.label}
                </button>
              ) : (
                <span className={i === p.crumbs!.length - 1 ? "font-bold text-ink" : ""}>{c.label}</span>
              )}
            </span>
          ))}
        </nav>
      )}
      {p.children}
    </div>
  );
}
