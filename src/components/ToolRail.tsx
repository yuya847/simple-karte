"use client";

import { Bandage, Barcode, CalendarDays, ChevronDown, ChevronUp, ClipboardCheck, ClipboardList, DoorOpen, Droplet, Droplets, FileHeart, FileSearch, FileSignature, FileStack, FileText, FlaskConical, FlaskRound, Footprints, GlassWater, GraduationCap, Hand, HeartHandshake, HeartPulse, Hotel, Layers, ListChecks, ListTodo, LockKeyhole, Luggage, MessagesSquare, Microscope, MonitorSmartphone, NotebookPen, PenTool, Radiation, ReceiptJapaneseYen, ScanLine, Send, Share2, TestTube, Thermometer, Utensils, IdCard } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useState } from "react";
import { useMe } from "./RoleContext";

export type PanelKind = "diagnoses" | "add-injection" | "add-rx" | "add-lab" | "add-imaging" | "add-physio" | "add-procedure" | "add-dialysis" | "add-transfusion" | "regimen" | "standing" | "restraint" | "summary" | "sets" | "add-rehab" | "add-consult" | "schema" | "add-leave" | "add-discharge" | "add-guide" | "guide-record" | "transfer" | "bedside" | "docs" | "labels" | "consents" | "vitals" | "directive" | "chat" | "diet" | "discharge" | "results" | "imaging" | "active-orders" | "billing" | "care-orders" | "nursing-plan" | "access-limit" | "io" | "flow-entry" | "tx-bedside" | "add-pathology" | "reports" | "profile";

interface Tool {
  key: PanelKind;
  label: string;
  icon: LucideIcon;
  disabled?: boolean;
}

type GroupKey = "order" | "nurse" | "docs" | "ref" | "billing";

/**
 * The tools, each group with the ones used most on top and the rest under 「その他」. 注射 and 内服 are not
 * here: they are the tabs on the right (記事作成・注射・内服). The calendars and the flow sheet are the tabs
 * over the left pane.
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
    ],
    more: [
      { key: "add-rehab", label: "リハビリ", icon: Footprints },
      { key: "add-consult", label: "他科依頼", icon: Send },
      { key: "add-transfusion", label: "輸血", icon: Droplet },
      { key: "add-pathology", label: "病理", icon: Microscope },
      { key: "add-dialysis", label: "透析", icon: Droplets },
      { key: "regimen", label: "レジメン", icon: FlaskRound },
      { key: "restraint", label: "身体的拘束", icon: Hand },
      { key: "add-discharge", label: "退院", icon: DoorOpen },
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
    ],
    more: [
      { key: "guide-record", label: "指導の記録", icon: NotebookPen },
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
      { key: "directive", label: "事前指示", icon: HeartHandshake },
      { key: "summary", label: "連携サマリ", icon: Share2 },
      { key: "transfer", label: "転院・施設の調整", icon: Hotel },
      { key: "labels", label: "ラベル", icon: Barcode },
      { key: "schema", label: "シェーマ", icon: PenTool },
      { key: "access-limit", label: "閲覧制限", icon: LockKeyhole },
      { key: "chat", label: "チャット", icon: MessagesSquare },
    ],
  },
  {
    key: "ref",
    title: "参照",
    main: [
      { key: "results", label: "検査結果", icon: FlaskConical },
      { key: "reports", label: "病理・生理", icon: FileSearch },
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
  /** The injection calendar opens as a tab on the right (it is for changing orders, not only reading). */
  injectionCalendar?: { on: boolean; open: () => void };
}

const toolClass = (off: boolean, active: boolean) =>
  `flex w-full flex-col items-center gap-0.5 rounded-md px-1 py-1.5 text-[10px] leading-tight ${off ? "cursor-not-allowed text-ink-faint/50" : active ? "bg-ai text-white" : "text-ink-soft hover:bg-sheet hover:text-ink"}`;

/** Fixed column of tools on the far right: order types, nursing, documents, then things to look at. */
export function ToolRail({ open, onOpen, blocked = {}, injectionCalendar }: Props) {
  const me = useMe();
  const [shown, setShown] = useState<Partial<Record<GroupKey, boolean>>>({});
  const groups = orderFor(me.role).map((k) => GROUPS.find((g) => g.key === k)!);
  const button = (t: Tool) => {
    const Icon = t.icon;
    const active = open === t.key;
    const why = blocked[t.key];
    const off = t.disabled || !!why;
    return (
      <button key={t.key} type="button" disabled={off} title={why ?? (t.disabled ? `${t.label}（この試作では未対応）` : t.label)} onClick={() => !off && onOpen(active ? null : t.key)} aria-pressed={active} className={toolClass(off, active)}>
        <Icon size={18} strokeWidth={1.8} />
        {t.label}
      </button>
    );
  };
  return (
    <aside aria-label="ツール" className="scroll-thin flex min-h-0 flex-col items-stretch gap-1 overflow-y-auto border-l border-rule bg-paper px-1 py-2">
      {groups.map((g, gi) => {
        // A tool open from 「その他」 keeps the group open, so the highlighted one is in view.
        const more = shown[g.key] || g.more.some((t) => t.key === open);
        return (
          <div key={g.key} className={gi > 0 ? "mt-2 border-t border-rule pt-2" : ""}>
            <div className="mb-1 text-center text-[10px] text-ink-faint">{g.title}</div>
            {g.key === "ref" && injectionCalendar && (
              <button type="button" title="注射カレンダー（右の欄のタブで開きます。延長・修正もここで）" onClick={injectionCalendar.open} aria-pressed={injectionCalendar.on} className={toolClass(false, injectionCalendar.on)}>
                <CalendarDays size={18} strokeWidth={1.8} />
                注射カレンダー
              </button>
            )}
            {g.main.map(button)}
            {more && g.more.map(button)}
            {g.more.length > 0 && (
              <button type="button" onClick={() => setShown((s) => ({ ...s, [g.key]: !more }))} aria-expanded={more} className="flex w-full flex-col items-center rounded-md px-1 py-1 text-[10px] leading-tight text-ink-faint hover:bg-sheet hover:text-ink">
                {more ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                {more ? "たたむ" : `その他 ${g.more.length}`}
              </button>
            )}
          </div>
        );
      })}
    </aside>
  );
}
