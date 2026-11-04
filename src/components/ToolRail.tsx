"use client";

import { Activity, GlassWater, LockKeyhole, Bandage, ClipboardCheck, ListTodo, Barcode, Hotel, MonitorSmartphone, NotebookPen, CalendarCheck, CalendarClock, DoorOpen, FileStack, GraduationCap, Luggage, Droplet, Droplets, FlaskRound, Footprints, Hand, Layers, PenTool, Send, Share2, CalendarDays, CalendarRange, ClipboardList, FileHeart, FlaskConical, ListChecks, Pill, ReceiptJapaneseYen, ScanLine, Syringe, TestTube, FileSignature, FileText, HeartHandshake, HeartPulse, MessagesSquare, Radiation, Thermometer, Utensils } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { LeftView } from "./HistoryPane";

export type PanelKind = "diagnoses" | "add-injection" | "add-rx" | "add-lab" | "add-imaging" | "add-physio" | "add-procedure" | "add-dialysis" | "add-transfusion" | "regimen" | "standing" | "restraint" | "summary" | "sets" | "add-rehab" | "add-consult" | "schema" | "add-leave" | "add-discharge" | "add-guide" | "guide-record" | "transfer" | "bedside" | "docs" | "labels" | "consents" | "vitals" | "directive" | "chat" | "diet" | "discharge" | "results" | "imaging" | "active-orders" | "billing" | "care-orders" | "nursing-plan" | "access-limit" | "io";

interface Tool {
  key: PanelKind;
  label: string;
  icon: LucideIcon;
  disabled?: boolean;
}

const GROUPS: { title: string; tools: Tool[] }[] = [
  {
    title: "オーダ",
    tools: [
      { key: "diagnoses", label: "病名", icon: FileHeart },
      { key: "standing", label: "指示簿", icon: ClipboardList },
      { key: "sets", label: "セット", icon: Layers },
      { key: "restraint", label: "身体的拘束", icon: Hand },
      { key: "add-injection", label: "注射", icon: Syringe },
      { key: "add-lab", label: "検体検査", icon: TestTube },
      { key: "add-imaging", label: "画像検査", icon: Radiation },
      { key: "add-physio", label: "生理・内視鏡", icon: HeartPulse },
      { key: "add-rx", label: "内服", icon: Pill },
      { key: "add-procedure", label: "処置", icon: Bandage },
      { key: "add-rehab", label: "リハビリ", icon: Footprints },
      { key: "add-consult", label: "他科依頼", icon: Send },
      { key: "add-discharge", label: "退院", icon: DoorOpen },
      { key: "add-leave", label: "外泊・外出", icon: Luggage },
      { key: "add-guide", label: "指導の依頼", icon: GraduationCap },
      { key: "add-dialysis", label: "透析", icon: Droplets },
      { key: "add-transfusion", label: "輸血", icon: Droplet },
      { key: "regimen", label: "レジメン", icon: FlaskRound },
      { key: "diet", label: "食事", icon: Utensils },
    ],
  },
  {
    title: "看護",
    tools: [
      { key: "vitals", label: "バイタル", icon: Thermometer },
      { key: "care-orders", label: "ケア指示", icon: ListTodo },
      { key: "nursing-plan", label: "看護計画", icon: ClipboardCheck },
      { key: "io", label: "水分出納", icon: GlassWater },
      { key: "guide-record", label: "指導の記録", icon: NotebookPen },
      { key: "bedside", label: "ベッドサイド表示", icon: MonitorSmartphone },
    ],
  },
  {
    title: "文書",
    tools: [
      { key: "consents", label: "同意書", icon: FileSignature },
      { key: "directive", label: "事前指示", icon: HeartHandshake },
      { key: "discharge", label: "退院サマリ", icon: FileText },
      { key: "docs", label: "書類作成", icon: FileStack },
      { key: "labels", label: "ラベル", icon: Barcode },
      { key: "summary", label: "連携サマリ", icon: Share2 },
      { key: "transfer", label: "転院・施設の調整", icon: Hotel },
      { key: "schema", label: "シェーマ", icon: PenTool },
      { key: "chat", label: "チャット", icon: MessagesSquare },
      { key: "access-limit", label: "閲覧制限", icon: LockKeyhole },
    ],
  },
  {
    title: "参照",
    tools: [
      { key: "results", label: "検査結果", icon: FlaskConical },
      { key: "imaging", label: "放射線画像", icon: ScanLine },
      { key: "active-orders", label: "有効オーダ", icon: ListChecks },
    ],
  },
  {
    title: "医事",
    tools: [{ key: "billing", label: "算定", icon: ReceiptJapaneseYen }],
  },
];

interface Props {
  open: PanelKind | null;
  onOpen: (p: PanelKind | null) => void;
  /** These replace the past record in the left pane, so they are switches, not panels. */
  leftView: LeftView;
  onLeftView: (v: LeftView) => void;
  /** Tools this role cannot use, with the reason (shown as the tooltip). */
  blocked?: Partial<Record<PanelKind, string>>;
  /** The injection calendar opens as a tab on the right (it is for changing orders, not only reading). */
  injectionCalendar?: { on: boolean; open: () => void };
}

const LEFT_TOOLS: { key: LeftView; label: string; icon: LucideIcon }[] = [
  { key: "flowsheet", label: "経過表", icon: Activity },
  { key: "injection-cal", label: "注射カレンダー", icon: CalendarDays },
  { key: "rx-cal", label: "処方カレンダー", icon: CalendarRange },
  { key: "proc-cal", label: "処置カレンダー", icon: CalendarCheck },
  { key: "diet-cal", label: "移動・食事", icon: Utensils },
  { key: "bookings", label: "予約の一覧", icon: CalendarClock },
];

/** Fixed column of tools on the far right: order types, then things to look at. */
export function ToolRail({ open, onOpen, leftView, onLeftView, blocked = {}, injectionCalendar }: Props) {
  return (
    <aside aria-label="ツール" className="scroll-thin flex min-h-0 flex-col items-stretch gap-1 overflow-y-auto border-l border-rule bg-paper px-1 py-2">
      {GROUPS.map((g, gi) => (
        <div key={g.title} className={gi > 0 ? "mt-2 border-t border-rule pt-2" : ""}>
          <div className="mb-1 text-center text-[10px] text-ink-faint">{g.title}</div>
          {g.title === "参照" &&
            LEFT_TOOLS.map((t) => {
              const Icon = t.icon;
              const right = t.key === "injection-cal" && injectionCalendar;
              const on = right ? injectionCalendar.on : leftView === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  title={right ? `${t.label}（右の欄のタブで開きます。延長・修正もここで）` : `${t.label}（左の欄に出します）`}
                  onClick={() => (right ? injectionCalendar.open() : onLeftView(on ? "record" : t.key))}
                  aria-pressed={on}
                  className={`flex w-full flex-col items-center gap-0.5 rounded-md px-1 py-1.5 text-[10px] leading-tight ${
                    on ? "bg-ai text-white" : "text-ink-soft hover:bg-sheet hover:text-ink"
                  }`}
                >
                  <Icon size={18} strokeWidth={1.8} />
                  {t.label}
                </button>
              );
            })}
          {g.tools.map((t) => {
            const Icon = t.icon;
            const active = open === t.key;
            const why = blocked[t.key];
            const off = t.disabled || !!why;
            return (
              <button
                key={t.key}
                type="button"
                disabled={off}
                title={why ?? (t.disabled ? `${t.label}（この試作では未対応）` : t.label)}
                onClick={() => !off && onOpen(active ? null : (t.key as PanelKind))}
                aria-pressed={active}
                className={`flex w-full flex-col items-center gap-0.5 rounded-md px-1 py-1.5 text-[10px] leading-tight ${
                  off
                    ? "cursor-not-allowed text-ink-faint/50"
                    : active
                      ? "bg-ai text-white"
                      : "text-ink-soft hover:bg-sheet hover:text-ink"
                }`}
              >
                <Icon size={18} strokeWidth={1.8} />
                {t.label}
              </button>
            );
          })}
        </div>
      ))}
      <div className="mt-auto flex flex-col items-center text-ink-faint" title="キー操作：⌘K 患者を開く／Esc 小窓を閉じる">
        <ClipboardList size={14} />
      </div>
    </aside>
  );
}
