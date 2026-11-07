"use client";
import { nutritionTools } from "@/lib/nutrition-tools";
import { calendarGroup } from "@/lib/prescription-calendar";

import { MessageSquareWarning, TrendingUp, Pill, Syringe, Activity, Bandage, UserCheck, Barcode, CalendarClock, CalendarDays, LayoutGrid, LayoutTemplate, List, Star, ClipboardCheck, ClipboardList, DoorOpen, Droplet, Droplets, FileHeart, FileSearch, FileSignature, FileStack, FileText, FlaskConical, FlaskRound, Footprints, GlassWater, GraduationCap, HeartHandshake, HeartPulse, Hotel, Layers, ListChecks, ListTodo, LockKeyhole, Luggage, MessagesSquare, Microscope, MonitorSmartphone, NotebookPen, PenTool, Radiation, ReceiptJapaneseYen, ScanLine, Share2, TestTube, Thermometer, Utensils, IdCard, ClipboardPen, Landmark, ListX, Route, UsersRound, ScanText, MessageSquareShare } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Calculator, ChartSpline, Settings2, Gauge } from "lucide-react";
import { resolveTools } from "@/lib/tool-layout";
import { ToolLayoutEditor } from "./ToolLayoutEditor";
import { useState } from "react";
import { specialistRoles } from "@/lib/specialist";
import { loadMyTemplates } from "@/lib/note-templates";
import { isTemplatePin, templateIdOf, togglePin, useRail, type RailPin, type RailGroupKey } from "@/lib/rail";
import { findRecordTemplate, shortNameOf } from "@/lib/record-templates";
import { useMe } from "./RoleContext";

export type PanelKind = "icu" | "msw-support" | "life-support" | "msw-interview" | "insulin" | "abx-renal" | "pharmacy-shido" | "pharmacy-brought" | "pharmacy-tdm" | "pharmacy-audit" | "add-surgery" | "nutrition" | "templates" | "diagnoses" | "add-injection" | "add-rx" | "add-lab" | "add-imaging" | "add-cath" | "add-physio" | "add-procedure" | "add-dialysis" | "add-transfusion" | "regimen" | "standing" | "restraint" | "summary" | "sets" | "add-rehab" | "add-consult" | "schema" | "add-leave" | "add-discharge" | "add-guide" | "guide-record" | "transfer" | "bedside" | "docs" | "labels" | "consents" | "vitals" | "directive" | "chat" | "diet" | "discharge" | "results" | "results-timeline" | "imaging" | "active-orders" | "billing" | "care-orders" | "nursing-plan" | "access-limit" | "io" | "flow-entry" | "tx-bedside" | "add-pathology" | "reports" | "profile" | "anamnesis" | "visit-request" | "visit-rx" | "national" | "discharge-stop" | "path" | "team" | "pressure" | "scans" | "rehab-progress" | "report-list" | "opd-booking" | "patient-info" | "monitor" | "take" | "opd-bill" | "cosign";

interface Tool {
  key: PanelKind;
  label: string;
  icon: LucideIcon;
  disabled?: boolean;
}

type GroupKey = RailGroupKey;

/**
 * The tools, each group with the ones used most on top. 処方 and 注射 open the right-hand tabs.
 * The calendars and the flow sheet are under 参照
 * (the `injectionCalendar` and `calendars` props): each opens in its own large window.
 */
const GROUPS: { key: GroupKey; title: string; main: Tool[]; more: Tool[] }[] = [
  {
    key: "intervention",
    title: "介入",
    main: [
      { key: "icu", label: "ICU 記録", icon: Gauge },
      { key: "add-rx", label: "処方", icon: Pill },
      { key: "add-injection", label: "注射", icon: Syringe },
      { key: "insulin", label: "インスリン", icon: ChartSpline },
      { key: "abx-renal", label: "抗菌薬の量", icon: Calculator },
      { key: "add-procedure", label: "処置", icon: Bandage },
      { key: "add-surgery", label: "手術申込", icon: ClipboardPen },
      { key: "diet", label: "食事", icon: Utensils },
      { key: "standing", label: "指示簿", icon: ClipboardList },
      { key: "sets", label: "セット", icon: Layers },
      { key: "path", label: "パス", icon: Route },
    ],
    more: [
      { key: "add-rehab", label: "リハビリ", icon: Footprints },
      { key: "add-consult", label: "コンサルト", icon: MessageSquareShare },
      { key: "add-transfusion", label: "輸血", icon: Droplet },
      { key: "add-dialysis", label: "透析", icon: Droplets },
      { key: "regimen", label: "レジメン", icon: FlaskRound },
      { key: "add-discharge", label: "退院", icon: DoorOpen },
      { key: "discharge-stop", label: "退院時の一括中止", icon: ListX },
      { key: "add-leave", label: "外泊・外出", icon: Luggage },
      { key: "add-guide", label: "指導の依頼", icon: GraduationCap },
      { key: "transfer", label: "転院・施設の調整", icon: Hotel },
    ],
  },
  {
    key: "examination",
    title: "検査",
    main: [
      { key: "add-lab", label: "検体検査", icon: TestTube },
      { key: "add-imaging", label: "画像検査", icon: Radiation },
      { key: "add-cath", label: "心カテ", icon: HeartPulse },
      { key: "add-physio", label: "生理・内視鏡", icon: HeartPulse },
      { key: "add-pathology", label: "病理", icon: Microscope },
    ],
    more: [],
  },
  {
    key: "nursing",
    title: "看護",
    main: [
      { key: "take", label: "指示受け", icon: ClipboardCheck },
      { key: "vitals", label: "バイタル", icon: Thermometer },
      { key: "care-orders", label: "ケア指示", icon: ListTodo },
      { key: "nursing-plan", label: "看護計画", icon: ClipboardCheck },
      { key: "nutrition", label: "栄養管理", icon: Utensils },
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
    key: "reference",
    title: "参照",
    main: [
      { key: "results", label: "検査結果", icon: FlaskConical },
      { key: "results-timeline", label: "検査時系列", icon: TrendingUp },
      { key: "reports", label: "病理・生理", icon: FileSearch },
      { key: "report-list", label: "レポート一覧", icon: FileText },
      { key: "rehab-progress", label: "リハビリの経過", icon: Footprints },
      { key: "imaging", label: "放射線画像", icon: ScanLine },
      { key: "active-orders", label: "有効オーダ", icon: ListChecks },
      { key: "profile", label: "プロファイル", icon: IdCard },
      { key: "monitor", label: "患者モニター", icon: Activity },
    ],
    more: [],
  },
  {
    key: "admin",
    title: "事務",
    main: [
      { key: "billing", label: "算定", icon: ReceiptJapaneseYen },
      { key: "consents", label: "同意書", icon: FileSignature },
      { key: "discharge", label: "退院サマリ", icon: FileText },
      { key: "docs", label: "書類作成", icon: FileStack },
    ],
    more: [
      { key: "scans", label: "スキャン取込", icon: ScanText },
      { key: "directive", label: "事前指示", icon: HeartHandshake },
      { key: "summary", label: "連携サマリ", icon: Share2 },
      { key: "labels", label: "ラベル", icon: Barcode },
      { key: "national", label: "国のサービス（模擬）", icon: Landmark },
    ],
  },
  {
    key: "other",
    title: "その他",
    main: [
      { key: "templates", label: "テンプレート", icon: LayoutTemplate },
      { key: "cosign", label: "研修医の記録の確認", icon: UserCheck },
      { key: "opd-booking", label: "外来予約", icon: CalendarClock },
      { key: "team", label: "チーム依頼", icon: UsersRound },
    ],
    more: [
      { key: "diagnoses", label: "病名", icon: FileHeart },
      { key: "schema", label: "シェーマ", icon: PenTool },
      { key: "access-limit", label: "閲覧制限", icon: LockKeyhole },
      { key: "chat", label: "チャット", icon: MessagesSquare },
    ],
  },
];

/**
 * Roles that get only a few tools in a ward patient's chart (架空の病院の取り決め): the technologist who opens a
 * chart from the radiology department reads the images, the reports and the monitor, and orders nothing.
 */
const ONLY: Partial<Record<string, PanelKind[]>> = { 診療放射線技師: ["imaging", "report-list", "monitor"] };

/** Tools only a doctor has (the others do not see them): 研修医の記録の確認 is done by the 指導医・上級医. */
const DOCTOR_ONLY: ReadonlySet<PanelKind> = new Set<PanelKind>(["cosign", "add-surgery"]);

/** The groups a role sees, with only its tools when the role has a short list. */
export function groupsFor(role: string): { key: GroupKey; title: string; main: Tool[]; more: Tool[] }[] {
  const only = ONLY[role];
  const forRole = (ts: Tool[]) => (role === "医師" ? ts : ts.filter((t) => !DOCTOR_ONLY.has(t.key) && !(role === "管理栄養士" && ["restraint", "discharge-stop", "path", "standing"].includes(t.key))));
  const groups = GROUPS.map((g) => ({ ...g, main: forRole(g.main), more: forRole(g.more) }));
  if (role === "MSW") {
    const first: Tool[] = [
      { key: "msw-support", label: "退院支援", icon: HeartHandshake },
      { key: "transfer", label: "転院・施設の調整", icon: Hotel },
      { key: "msw-interview", label: "面談記録", icon: NotebookPen },
      { key: "life-support", label: "生活・制度", icon: UsersRound },
    ];
    const keys = new Set(first.map(t => t.key));
    const group = groups.find(g => g.key === "intervention")!;
    for (const g of groups) { g.main = g.main.filter(t => !keys.has(t.key)); g.more = g.more.filter(t => !keys.has(t.key)); }
    group.main = [...first, ...group.main];
  }
  if (role === "療法士") {
    const reference = groups.find(g => g.key === "reference")!;
    reference.title = "リハビリ";
    reference.main = [{ key: "rehab-progress", label: "経過・実施・評価・計画書", icon: Footprints }, ...reference.main.filter(t => t.key !== "rehab-progress")];
    groups.splice(groups.indexOf(reference), 1); groups.unshift(reference);
  }
  if (role === "薬剤師") {
    const intervention = groups.find((g) => g.key === "intervention")!;
    intervention.main = [
      { key: "pharmacy-shido", label: "服薬指導", icon: Pill },
      { key: "pharmacy-brought", label: "持参薬鑑別", icon: ScanText },
      { key: "pharmacy-tdm", label: "TDM", icon: Activity },
      { key: "pharmacy-audit", label: "疑義照会", icon: MessageSquareWarning },
      ...intervention.main,
    ];
  }
  if (role === "管理栄養士") return nutritionTools(groups);
  if (!only) return groups;
  const pick = (ts: Tool[]) => ts.filter((t) => only.includes(t.key)).sort((a, b) => only.indexOf(a.key) - only.indexOf(b.key));
  return groups.map((g) => ({ ...g, main: pick(g.main), more: pick(g.more) })).filter((g) => g.main.length + g.more.length > 0);
}

/** Whether the role's rail is the short one (no calendars, no injection calendar). */
export const railIsShort = (role: string) => !!ONLY[role];

interface Props {
  onAnesthesia?: (tab: string) => void;
  open: PanelKind | null;
  /** Opens a tool; a pinned テンプレート opens the templates panel with that template's id. */
  onOpen: (p: PanelKind | null, opts?: { templateId?: string }) => void;
  /** The template whose form is open (to light its pinned tile). */
  openTemplate?: string | null;
  /** Tools this role cannot use, with the reason (shown as the tooltip). */
  blocked?: Partial<Record<PanelKind, string>>;
  /** The injection calendar opens in its own large window (it is for making and changing orders, not only reading). */
  injectionCalendar?: { on: boolean; open: () => void };
  /** The other reading windows (経過表・内服・処置・移動・食事・指示簿・予約), shown after the injection calendar under 参照. */
  calendars?: { key: string; label: string; title?: string; icon: LucideIcon; on: boolean; open: () => void }[];
  /** Counts shown as a red circle on a tool's icon (e.g. 未確認の結果 on 検査結果); urgent = a panic value among them. */
  badges?: Partial<Record<PanelKind, { n: number; urgent?: boolean }>>;
}

/** One button on the rail: a tool, or a pinned template that opens straight into its form. */
interface Tile {
  title?: string;
  pin: RailPin;
  label: string;
  icon: LucideIcon;
  active: boolean;
  why?: string;
  disabled?: boolean;
  badge?: { n: number; urgent?: boolean };
  go: () => void;
}

/**
 * The group tabs (介入・検査・看護・参照・事務・その他): tall enough to press (28px and up), 12px letters, room on
 * the sides; the chosen one black with white letters. The red dot (something unseen inside) sits on
 * the top-right corner.
 */
export const GROUP_TAB_CLASS = "relative inline-flex min-h-7 items-center justify-center rounded-md px-2.5 py-1 text-[12px] font-normal leading-none";

const toolClass = (off: boolean, active: boolean) =>
  `flex w-full flex-col items-center gap-0.5 rounded-md px-1 py-1.5 text-[10px] leading-tight ${off ? "cursor-not-allowed text-ink-faint/50" : active ? "bg-ai text-white" : "text-ink-soft hover:bg-sheet hover:text-ink"}`;

/** The red circle with a count on a tool (shu for a panic value, ai otherwise). */
const badgeClass = (urgent?: boolean) => `nums inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold leading-none text-white ${urgent ? "bg-shu" : "bg-ai"}`;

/**
 * The column of tools on the far right: tabs by kind (介入・検査・看護・参照・事務・その他), the tools of the chosen
 * tab in three columns of icons (or a list with names), and to their left an お気に入り column with the tools
 * this person pinned (★) — and the record templates pinned from the テンプレート panel, each opening straight
 * into its form. The pins and the look are kept per person in this browser (src/lib/rail.ts).
 */
export function ToolRail({ open, onOpen, openTemplate = null, blocked = {}, injectionCalendar, calendars = [], badges = {}, onAnesthesia }: Props) {
  const me = useMe();
  const defaults = groupsFor(me.role);
  const short = railIsShort(me.role);
  const [rail, put] = useRail(me.name);
  const [editing, setEditing] = useState(false);
  const windows: Tile[] = short ? [] : [
    ...(injectionCalendar ? [{ pin: "calendar:injection", label: "注射カレンダー", icon: CalendarDays, active: injectionCalendar.on, go: injectionCalendar.open }] : []),
    ...calendars.map(c => ({ pin: `calendar:${c.key}`, label: c.label, title: c.title, icon: c.icon, active: c.on, go: c.open })),
  ];
  const layout = resolveTools(defaults.map(g => ({ key: g.key, title: g.title, tools: [...g.main, ...g.more].map(t => t.key).concat(windows.filter(t => calendarGroup(t.pin.slice("calendar:".length)) === g.key).map(t => t.pin) as PanelKind[]) })), rail.layout);
  const groups = layout.groups.map(g => ({ ...g, main: defaults.flatMap(x => [...x.main, ...x.more]).filter(t => g.tools.includes(t.key)), more: [] as Tool[] }));
  const [groupRole, setGroupRole] = useState(me.role);
  const [selectedGroup, setSelectedGroup] = useState<string>(me.role === "看護師" ? "nursing" : me.role === "医事課" ? "admin" : me.role !== "MSW" && specialistRoles.includes(me.role) ? "reference" : "intervention");
  if (groupRole !== me.role) { setGroupRole(me.role); setSelectedGroup(me.role === "看護師" ? "nursing" : me.role === "医事課" ? "admin" : me.role !== "MSW" && specialistRoles.includes(me.role) ? "reference" : "intervention"); }
  const tab = groups.find((g) => g.key === selectedGroup)?.key ?? groups[0].key;
  const [editPins, setEditPins] = useState(false);
  const all = defaults.flatMap((g) => [...g.main, ...g.more]);
  // Every tile stays visible (ユーザー 2026-11-05：「すべて表示は常時オン」); the ones a role cannot use are greyed with the reason.
  const showAll = true;
  const list = rail.mode === "list";

  const toolTile = (t: Tool): Tile => ({ pin: t.key, label: t.label, icon: t.icon, active: open === t.key, why: blocked[t.key] ?? (me.role === "臨床検査技師" && ["standing", "path", "discharge-stop", "directive", "diet", "discharge"].includes(t.key) ? "医師・病棟担当者が操作します" : undefined), disabled: t.disabled, badge: badges[t.key], go: () => onOpen(open === t.key ? null : t.key) });
  // A pinned template's name comes from the hospital's list or the person's own templates (this browser).
  const mine = rail.pins.some(isTemplatePin) ? loadMyTemplates(me.name) : [];
  const templateTile = (pin: RailPin): Tile | null => {
    const id = templateIdOf(pin);
    const t = id ? findRecordTemplate(id, mine) : undefined;
    if (!id || !t) return null;
    const active = open === "templates" && openTemplate === id;
    return { pin, label: shortNameOf(t), icon: LayoutTemplate, active, why: blocked.templates, go: () => (active ? onOpen(null) : onOpen("templates", { templateId: id })) };
  };
  const pinned = rail.pins
    .map((p) => {
      if (layout.hidden.includes(p)) return null;
      if (isTemplatePin(p)) return templateTile(p);
      const w = windows.find(t => t.pin === p); if (w) return w;
      const t = all.find((x) => x.key === p);
      return t ? toolTile(t) : null;
    })
    .filter((t): t is Tile => !!t);
  // The tab of the open tool, so the highlighted one is in view.
  const openIn = groups.find((g) => [...g.main, ...g.more].some((t) => t.key === open))?.key;
  const shownTab = !editing && openIn && !pinned.some((t) => t.pin === open) ? openIn : tab;
  const group = groups.find((g) => g.key === shownTab) ?? groups[0];

  const tile = (t: Tile, where: "pins" | "tab") => {
    const Icon = t.icon;
    const active = t.active;
    const why = t.why;
    const off = t.disabled || !!why;
    if (off && !showAll) return null;
    const isPin = rail.pins.includes(t.pin);
    const badge = t.badge;
    const tileList = list && where === "tab";
    const base = tileList
      ? `flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] ${off ? "cursor-not-allowed text-ink-faint/50" : active ? "bg-ai text-white" : "text-ink-soft hover:bg-sheet hover:text-ink"}`
      : toolClass(off, active);
    return (
      <div key={`${where}-${t.pin}`} className="relative">
        <button type="button" disabled={off} title={why ?? (t.disabled ? `${t.label}（この試作では未対応）` : t.title ?? t.label)} onClick={() => !off && t.go()} aria-pressed={active} className={base}>
          <Icon size={tileList ? 15 : 18} strokeWidth={1.8} className="shrink-0" />
          <span className={tileList ? "truncate" : where === "pins" ? "w-full break-words text-center" : ""}>{t.label}{t.pin === "add-consult" && where !== "pins" && <small className="block text-[9px] font-normal">他科依頼・紹介</small>}</span>
          {tileList && badge && badge.n > 0 && <span className={`${badgeClass(badge.urgent)} ml-auto`}>{badge.n}</span>}
        </button>
        {!tileList && !editPins && badge && badge.n > 0 && (
          <span aria-label={`${t.label}：未確認 ${badge.n}件`} className={`${badgeClass(badge.urgent)} pointer-events-none absolute right-1 top-0`}>
            {badge.n}
          </span>
        )}
        {editPins && (
          <button
            type="button"
            aria-label={isPin ? `${t.label}をお気に入りから外す` : `${t.label}をお気に入りに入れる`}
            aria-pressed={isPin}
            onClick={() => put({ ...rail, pins: togglePin(rail.pins, t.pin) })}
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
    <aside aria-label="ツール" className="flex min-h-0 overflow-hidden border-l border-rule bg-paper">
      <section aria-label="お気に入り" className="scroll-thin flex w-14 shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-rule bg-yamabuki-soft/30 px-1 py-1.5">
        {pinned.length === 0 ? null : pinned.map((t) => tile(t, "pins"))}
      </section>
      <div className={`scroll-thin flex min-h-0 shrink-0 flex-col overflow-y-auto px-1 py-1.5 ${list ? "w-44" : "w-52"}`}>
        <div className="mb-1 flex items-center justify-between px-0.5">
          <span className="text-[10px] text-ink-faint">オーダと道具</span>
          <span className="flex items-center gap-0.5">
            <button type="button" title="道具の配置を編集" aria-pressed={editing} onClick={() => setEditing(!editing)} className="rounded p-1"><Settings2 size={13} /></button>
            <button type="button" onClick={() => setEditPins((v) => !v)} aria-pressed={editPins} title="お気に入りを選ぶ（★を押して出し入れ）" className={`rounded p-1 ${editPins ? "bg-yamabuki-soft text-yamabuki" : "text-ink-faint hover:bg-sheet hover:text-ink"}`}>
              <Star size={13} />
            </button>
            <button type="button" onClick={() => put({ ...rail, mode: list ? "icons" : "list" })} title={list ? "アイコンで並べる（3列）" : "名前の一覧で並べる"} className="rounded p-1 text-ink-faint hover:bg-sheet hover:text-ink">
              {list ? <LayoutGrid size={13} /> : <List size={13} />}
            </button>
          </span>
        </div>
        {me.role === "医師" && me.name.startsWith("麻酔科 ") && onAnesthesia && <div className="mb-2 flex flex-col gap-1">{["術前診察", "麻酔記録", "術後回診"].map(tab => <button key={tab} className="rounded border border-rule bg-sheet px-2 py-1 text-left text-xs" onClick={() => onAnesthesia(tab)}>{tab}</button>)}</div>}
        <div className="mb-1 flex items-start gap-1">
        <div role="tablist" aria-label="道具の種類" className="mb-1 grid grid-cols-3 flex-1 gap-1 border-b border-rule pb-1">
          {groups.map((g) => {
            const badged = [...g.main, ...g.more].some((t) => (badges[t.key]?.n ?? 0) > 0);
            return (
              <button key={g.key} type="button" role="tab" aria-selected={shownTab === g.key} onClick={() => setSelectedGroup(g.key)} data-badged={badged || undefined} className={`${GROUP_TAB_CLASS} ${shownTab === g.key ? "bg-ink text-white" : "text-ink-soft hover:bg-sheet hover:text-ink"}`}>
                {g.title}
                {badged && <span aria-hidden className="absolute -right-0.5 -top-0.5 inline-block h-2.5 w-2.5 rounded-full border border-paper bg-shu" />}
              </button>
            );
          })}
        </div>
        </div>
        {editing ? <ToolLayoutEditor layout={layout} icons={Object.fromEntries([...all.map(toolTile), ...windows].map(t => [t.pin, t.icon]))} labels={Object.fromEntries([...all.map(toolTile), ...windows].map(t => [t.pin, t.label]))} onChange={v => put({ ...rail, layout: v })} onReset={() => put({ ...rail, layout: undefined })} /> : <div className={grid}>
          {group.tools.filter(key => !layout.hidden.includes(key)).map(key => {
            const w = windows.find(t => t.pin === key);
            const t = all.find(t => t.key === key);
            return w ? tile(w, "tab") : t ? tile(toolTile(t), "tab") : null;
          })}
        </div>}

      </div>
    </aside>
  );
}

/* Help migration source (references and dynamic wording):
<p >★ をここに</p>
*/
