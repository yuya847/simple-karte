"use client";

import { Bandage, Barcode, CalendarDays, LayoutGrid, List, Star, ClipboardCheck, ClipboardList, DoorOpen, Droplet, Droplets, FileHeart, FileSearch, FileSignature, FileStack, FileText, FlaskConical, FlaskRound, Footprints, GlassWater, GraduationCap, Hand, HeartHandshake, HeartPulse, Hotel, Layers, ListChecks, ListTodo, LockKeyhole, Luggage, MessagesSquare, Microscope, MonitorSmartphone, NotebookPen, PenTool, Radiation, ReceiptJapaneseYen, ScanLine, Send, Share2, TestTube, Thermometer, Utensils, IdCard, ClipboardPen, Landmark, ListX, Route, UsersRound, ScanText } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useState } from "react";
import { useMe } from "./RoleContext";

export type PanelKind = "diagnoses" | "add-injection" | "add-rx" | "add-lab" | "add-imaging" | "add-physio" | "add-procedure" | "add-dialysis" | "add-transfusion" | "regimen" | "standing" | "restraint" | "summary" | "sets" | "add-rehab" | "add-consult" | "schema" | "add-leave" | "add-discharge" | "add-guide" | "guide-record" | "transfer" | "bedside" | "docs" | "labels" | "consents" | "vitals" | "directive" | "chat" | "diet" | "discharge" | "results" | "imaging" | "active-orders" | "billing" | "care-orders" | "nursing-plan" | "access-limit" | "io" | "flow-entry" | "tx-bedside" | "add-pathology" | "reports" | "profile" | "anamnesis" | "visit-request" | "visit-rx" | "visit-revisit" | "national" | "discharge-stop" | "path" | "team" | "pressure" | "scans" | "rehab-progress" | "report-list";

interface Tool {
  key: PanelKind;
  label: string;
  icon: LucideIcon;
  disabled?: boolean;
}

type GroupKey = "order" | "nurse" | "docs" | "ref" | "billing";

/**
 * The tools, each group with the ones used most on top and the rest under 「その他」. 注射 and 内服 are not
 * here: they are the tabs on the right (記事作成・注射・内服). The calendars and the flow sheet are under 参照
 * (the `injectionCalendar` and `calendars` props): each opens in its own large window.
 */
const GROUPS: { key: GroupKey; title: string; main: Tool[]; more: Tool[] }[] = [
  {
    key: "order",
    title: "オーダ",
    main: [
      { key: "add-lab", label: "検体検査", icon: TestTube },
      { key: "add-imaging", label: "画像検査", icon: Radiation },
      { key: "add-physio", label: "生理・内視鏡", icon: HeartPulse },
      { key: "add-procedure", label: "処置", icon: Bandage },
      { key: "diet", label: "食事", icon: Utensils },
      { key: "diagnoses", label: "病名", icon: FileHeart },
      { key: "standing", label: "指示簿", icon: ClipboardList },
      { key: "sets", label: "セット", icon: Layers },
      { key: "path", label: "パス", icon: Route },
    ],
    more: [
      { key: "add-rehab", label: "リハビリ", icon: Footprints },
      { key: "add-consult", label: "他科依頼", icon: Send },
      { key: "team", label: "チーム依頼", icon: UsersRound },
      { key: "add-transfusion", label: "輸血", icon: Droplet },
      { key: "add-pathology", label: "病理", icon: Microscope },
      { key: "add-dialysis", label: "透析", icon: Droplets },
      { key: "regimen", label: "レジメン", icon: FlaskRound },
      { key: "restraint", label: "身体的拘束", icon: Hand },
      { key: "add-discharge", label: "退院", icon: DoorOpen },
      { key: "discharge-stop", label: "退院時の一括中止", icon: ListX },
      { key: "add-leave", label: "外泊・外出", icon: Luggage },
      { key: "add-guide", label: "指導の依頼", icon: GraduationCap },
    ],
  },
  {
    key: "nurse",
    title: "看護",
    main: [
      { key: "vitals", label: "バイタル", icon: Thermometer },
      { key: "care-orders", label: "ケア指示", icon: ListTodo },
      { key: "nursing-plan", label: "看護計画", icon: ClipboardCheck },
      { key: "io", label: "水分出納", icon: GlassWater },
      { key: "anamnesis", label: "情報収集", icon: ClipboardPen },
    ],
    more: [
      { key: "guide-record", label: "指導の記録", icon: NotebookPen },
      { key: "pressure", label: "褥瘡の経過", icon: Bandage },
      { key: "tx-bedside", label: "輸血の実施", icon: Droplet },
      { key: "bedside", label: "ベッドサイド表示", icon: MonitorSmartphone },
    ],
  },
  {
    key: "docs",
    title: "文書",
    main: [
      { key: "consents", label: "同意書", icon: FileSignature },
      { key: "discharge", label: "退院サマリ", icon: FileText },
      { key: "docs", label: "書類作成", icon: FileStack },
    ],
    more: [
      { key: "scans", label: "スキャン取込", icon: ScanText },
      { key: "directive", label: "事前指示", icon: HeartHandshake },
      { key: "summary", label: "連携サマリ", icon: Share2 },
      { key: "transfer", label: "転院・施設の調整", icon: Hotel },
      { key: "labels", label: "ラベル", icon: Barcode },
      { key: "schema", label: "シェーマ", icon: PenTool },
      { key: "access-limit", label: "閲覧制限", icon: LockKeyhole },
      { key: "chat", label: "チャット", icon: MessagesSquare },
      { key: "national", label: "国のサービス（模擬）", icon: Landmark },
    ],
  },
  {
    key: "ref",
    title: "参照",
    main: [
      { key: "results", label: "検査結果", icon: FlaskConical },
      { key: "reports", label: "病理・生理", icon: FileSearch },
      { key: "report-list", label: "レポート一覧", icon: FileText },
      { key: "rehab-progress", label: "リハビリの経過", icon: Footprints },
      { key: "imaging", label: "放射線画像", icon: ScanLine },
      { key: "active-orders", label: "有効オーダ", icon: ListChecks },
      { key: "profile", label: "プロファイル", icon: IdCard },
    ],
    more: [],
  },
  { key: "billing", title: "医事", main: [{ key: "billing", label: "算定", icon: ReceiptJapaneseYen }], more: [] },
];

/** Nurses see 看護 first; everyone else オーダ first. */
const orderFor = (role: string): GroupKey[] => (role === "看護師" ? ["nurse", "order", "docs", "ref", "billing"] : ["order", "nurse", "docs", "ref", "billing"]);

interface Props {
  open: PanelKind | null;
  onOpen: (p: PanelKind | null) => void;
  /** Tools this role cannot use, with the reason (shown as the tooltip). */
  blocked?: Partial<Record<PanelKind, string>>;
  /** The injection calendar opens in its own large window (it is for making and changing orders, not only reading). */
  injectionCalendar?: { on: boolean; open: () => void };
  /** The other reading windows (経過表・内服・処置・移動・食事・指示簿・予約), shown after the injection calendar under 参照. */
  calendars?: { key: string; label: string; title?: string; icon: LucideIcon; on: boolean; open: () => void }[];
  /** Counts shown as a red circle on a tool's icon (e.g. 未確認の結果 on 検査結果); urgent = a panic value among them. */
  badges?: Partial<Record<PanelKind, { n: number; urgent?: boolean }>>;
}

const toolClass = (off: boolean, active: boolean) =>
  `flex w-full flex-col items-center gap-0.5 rounded-md px-1 py-1.5 text-[10px] leading-tight ${off ? "cursor-not-allowed text-ink-faint/50" : active ? "bg-ai text-white" : "text-ink-soft hover:bg-sheet hover:text-ink"}`;

/** The red circle with a count on a tool (shu for a panic value, ai otherwise). */
const badgeClass = (urgent?: boolean) => `nums inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold leading-none text-white ${urgent ? "bg-shu" : "bg-ai"}`;

type RailMode = "icons" | "list";
const RAIL_KEY = "simple-karte:tool-rail";

/** How the rail is shown and which tools are pinned, per person in this browser (a convenience only). */
function loadRail(person: string): { mode: RailMode; pins: PanelKind[] } {
  try {
    const o = JSON.parse(window.localStorage.getItem(`${RAIL_KEY}:${person}`) ?? "null") as { mode?: RailMode; pins?: PanelKind[] } | null;
    return { mode: o?.mode === "list" ? "list" : "icons", pins: Array.isArray(o?.pins) ? o!.pins! : [] };
  } catch {
    return { mode: "icons", pins: [] };
  }
}
function saveRail(person: string, v: { mode: RailMode; pins: PanelKind[] }) {
  try {
    window.localStorage.setItem(`${RAIL_KEY}:${person}`, JSON.stringify(v));
  } catch {
    // Storage blocked: the choice lasts until the page is closed.
  }
}

/**
 * The column of tools on the far right: tabs by kind (オーダ・看護・文書・参照・医事), the tools of the chosen
 * tab in three columns of icons (or a list with names), and above them an お気に入り bar with the tools
 * this person pinned (★). The pins and the look are kept per person in this browser.
 */
export function ToolRail({ open, onOpen, blocked = {}, injectionCalendar, calendars = [], badges = {} }: Props) {
  const me = useMe();
  const groups = orderFor(me.role).map((k) => GROUPS.find((g) => g.key === k)!);
  const [tab, setTab] = useState<GroupKey>(groups[0].key);
  const [rail, setRail] = useState<{ mode: RailMode; pins: PanelKind[] }>(() => (typeof window === "undefined" ? { mode: "icons", pins: [] } : loadRail(me.name)));
  const [editPins, setEditPins] = useState(false);
  const put = (v: { mode: RailMode; pins: PanelKind[] }) => {
    setRail(v);
    saveRail(me.name, v);
  };
  const all = groups.flatMap((g) => [...g.main, ...g.more]);
  const pinned = rail.pins.map((k) => all.find((t) => t.key === k)).filter((t): t is Tool => !!t);
  // The tab of the open tool, so the highlighted one is in view.
  const openIn = groups.find((g) => [...g.main, ...g.more].some((t) => t.key === open))?.key;
  const shownTab = openIn && !pinned.some((t) => t.key === open) ? openIn : tab;
  const group = groups.find((g) => g.key === shownTab)!;
  const list = rail.mode === "list";

  const tile = (t: Tool, where: "pins" | "tab") => {
    const Icon = t.icon;
    const active = open === t.key;
    const why = blocked[t.key];
    const off = t.disabled || !!why;
    const isPin = rail.pins.includes(t.key);
    const badge = badges[t.key];
    const base = list
      ? `flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] ${off ? "cursor-not-allowed text-ink-faint/50" : active ? "bg-ai text-white" : "text-ink-soft hover:bg-sheet hover:text-ink"}`
      : toolClass(off, active);
    return (
      <div key={`${where}-${t.key}`} className="relative">
        <button type="button" disabled={off} title={why ?? (t.disabled ? `${t.label}（この試作では未対応）` : t.label)} onClick={() => !off && onOpen(active ? null : t.key)} aria-pressed={active} className={base}>
          <Icon size={list ? 15 : 18} strokeWidth={1.8} className="shrink-0" />
          <span className={list ? "truncate" : ""}>{t.label}</span>
          {list && badge && badge.n > 0 && <span className={`${badgeClass(badge.urgent)} ml-auto`}>{badge.n}</span>}
        </button>
        {!list && !editPins && badge && badge.n > 0 && (
          <span aria-label={`${t.label}：未確認 ${badge.n}件`} className={`${badgeClass(badge.urgent)} pointer-events-none absolute right-1 top-0`}>
            {badge.n}
          </span>
        )}
        {editPins && (
          <button
            type="button"
            aria-label={isPin ? `${t.label}をお気に入りから外す` : `${t.label}をお気に入りに入れる`}
            aria-pressed={isPin}
            onClick={() => put({ ...rail, pins: isPin ? rail.pins.filter((k) => k !== t.key) : [...rail.pins, t.key] })}
            className={`absolute -right-0.5 -top-0.5 rounded-full border bg-sheet p-0.5 ${isPin ? "border-yamabuki text-yamabuki" : "border-rule text-ink-faint hover:text-yamabuki"}`}
          >
            <Star size={11} fill={isPin ? "currentColor" : "none"} />
          </button>
        )}
      </div>
    );
  };
  const grid = list ? "flex flex-col gap-0.5" : "grid grid-cols-3 gap-0.5";

  return (
    <aside aria-label="ツール" className={`scroll-thin flex min-h-0 flex-col overflow-y-auto border-l border-rule bg-paper px-1 py-1.5 ${list ? "w-44" : "w-52"}`}>
      <div className="mb-1 flex items-center justify-between px-0.5">
        <span className="text-[10px] text-ink-faint">オーダと道具</span>
        <span className="flex items-center gap-0.5">
          <button type="button" onClick={() => setEditPins((v) => !v)} aria-pressed={editPins} title="お気に入りを選ぶ（★を押して出し入れ）" className={`rounded p-1 ${editPins ? "bg-yamabuki-soft text-yamabuki" : "text-ink-faint hover:bg-sheet hover:text-ink"}`}>
            <Star size={13} />
          </button>
          <button type="button" onClick={() => put({ ...rail, mode: list ? "icons" : "list" })} title={list ? "アイコンで並べる（3列）" : "名前の一覧で並べる"} className="rounded p-1 text-ink-faint hover:bg-sheet hover:text-ink">
            {list ? <LayoutGrid size={13} /> : <List size={13} />}
          </button>
        </span>
      </div>
      <section aria-label="お気に入り" className="mb-1.5 rounded-md border border-dashed border-yamabuki/50 bg-yamabuki-soft/30 p-1">
        <div className="mb-0.5 flex items-center gap-1 px-0.5 text-[10px] text-yamabuki">
          <Star size={10} fill="currentColor" />
          お気に入り
        </div>
        {pinned.length === 0 ? <p className="px-0.5 pb-0.5 text-[10px] text-ink-faint">★ でよく使う道具をここに</p> : <div className={grid}>{pinned.map((t) => tile(t, "pins"))}</div>}
      </section>
      <div role="tablist" aria-label="道具の種類" className="mb-1 flex flex-wrap gap-0.5 border-b border-rule pb-1">
        {groups.map((g) => (
          <button key={g.key} type="button" role="tab" aria-selected={shownTab === g.key} onClick={() => setTab(g.key)} data-badged={[...g.main, ...g.more].some((t) => (badges[t.key]?.n ?? 0) > 0) || undefined} className={`rounded px-1.5 py-0.5 text-[11px] ${shownTab === g.key ? "bg-ink font-bold text-white" : "text-ink-soft hover:bg-sheet hover:text-ink"}`}>
            {g.title}
            {[...g.main, ...g.more].some((t) => (badges[t.key]?.n ?? 0) > 0) && <span aria-hidden className="ml-0.5 inline-block h-1.5 w-1.5 rounded-full bg-shu align-middle" />}
          </button>
        ))}
      </div>
      <div className={grid}>
        {group.key === "ref" && injectionCalendar && (
          <button type="button" title="注射カレンダー（大きな別ウインドウで開きます。新規・延長・修正もここで。「右の欄に戻す」で右のタブにできます）" onClick={injectionCalendar.open} aria-pressed={injectionCalendar.on} className={list ? `flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] ${injectionCalendar.on ? "bg-ai text-white" : "text-ink-soft hover:bg-sheet hover:text-ink"}` : toolClass(false, injectionCalendar.on)}>
            <CalendarDays size={list ? 15 : 18} strokeWidth={1.8} className="shrink-0" />
            注射カレンダー
          </button>
        )}
        {group.key === "ref" &&
          calendars.map((c) => {
            const Icon = c.icon;
            return (
              <button key={c.key} type="button" title={`${c.title ?? c.label}（大きな別ウインドウで開きます。「右の欄に戻す」で右のタブにできます）`} onClick={c.open} aria-pressed={c.on} className={list ? `flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] ${c.on ? "bg-ai text-white" : "text-ink-soft hover:bg-sheet hover:text-ink"}` : toolClass(false, c.on)}>
                <Icon size={list ? 15 : 18} strokeWidth={1.8} className="shrink-0" />
                <span className={list ? "truncate" : ""}>{c.label}</span>
              </button>
            );
          })}
        {[...group.main, ...group.more].map((t) => tile(t, "tab"))}
      </div>
    </aside>
  );
}
