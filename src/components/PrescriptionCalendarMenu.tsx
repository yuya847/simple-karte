"use client";
import { useCallback, useEffect, useState } from "react";
import type { CalendarProps } from "./Calendars";
import { FlowCellMenu, type CellAction } from "./FlowCellMenu";
import { useOrderHistoryActions } from "./OrderHistoryActions";
import { prescriptionText, revisionEntries } from "@/lib/history-order";
import { orderEndDay } from "@/lib/drafts";
import { addDays, formatShort } from "@/lib/dates";
import { oralName } from "@/lib/format";
import { useLongPress } from "@/lib/use-long-press";
import type { OrderEntry } from "@/lib/types";

/** Right click on a prescription's row or day (a long press on a finger, the menu key or Shift+F10): extend, stop from that day, modify, Do, copy. */
export function PrescriptionCalendarMenu({ entry, day, options, focusable = false, children }: { entry: OrderEntry; day: number; options: CalendarProps; focusable?: boolean; children: React.ReactNode }) {
  const actions = useOrderHistoryActions();
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  const [notice, say] = useState("");
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => say(""), 2500);
    return () => clearTimeout(t);
  }, [notice]);
  const close = useCallback(() => setAt(null), []);
  const longPress = useLongPress<HTMLDivElement>(setAt);
  const o = entry.order;
  const active = entry.status === "有効";
  const related = actions ? revisionEntries(entry, actions.entries) : [entry];
  const why = actions
    ? !actions.canEdit ? "医師が操作できます" : related.some((e) => e.status === "中止") ? "中止済みです" : related.some((e) => actions.locked(e.id)) ? "監査・払出済みです" : null
    : options.onModify ? null : "医師が操作できます";
  const fmt = (d: number) => formatShort(addDays(options.today, d));
  const draft = (fn: () => void) => () => {
    fn();
    say("記事の下の処方オーダの下書きに入りました");
  };
  const sameDays = o.type === "prescription" && o.days ? [o.days] : [];
  const list: CellAction[] = [
    ...(active && options.onExtendDraft && orderEndDay(o) !== null ? [...new Set([3, 7, ...sameDays])].map((n) => ({ label: `${n}日延長`, onClick: draft(() => options.onExtendDraft!(entry, n)) })) : []),
    ...(active && options.onPrescriptionStop
      ? [{ label: "中止の下書き（今日から）", onClick: draft(() => options.onPrescriptionStop!(entry, 0)) }, ...(day > 0 ? [{ label: `中止の下書き（${fmt(day)}から）`, onClick: draft(() => options.onPrescriptionStop!(entry, day)) }] : [])]
      : []),
    { label: "修正（量・用法）", disabled: why, onClick: () => (actions ? actions.modify(entry) : options.onModify?.(entry)) },
    ...(options.onNewPrescription ? [{ label: "Do（同じ処方をもう一度）", onClick: () => options.onNewPrescription!(day, entry) }] : []),
    { label: "テキストとしてコピー", onClick: () => void navigator.clipboard.writeText(prescriptionText([entry])).then(() => say("コピーしました"), () => say("コピーできませんでした")) },
  ];
  return (
    <div
      className={`relative ${focusable ? "rounded outline-none focus-visible:ring-2 focus-visible:ring-ai/40" : ""}`}
      tabIndex={focusable ? 0 : undefined}
      {...longPress}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setAt({ x: e.clientX, y: e.clientY });
      }}
      onKeyDown={(e) => {
        if (e.key !== "ContextMenu" && !(e.shiftKey && e.key === "F10")) return;
        e.preventDefault();
        e.stopPropagation();
        const r = e.currentTarget.getBoundingClientRect();
        setAt({ x: r.left, y: r.bottom });
      }}
    >
      {children}
      {notice && <span role="status" className="text-[10px] text-ai">{notice}</span>}
      {at && <FlowCellMenu at={at} title={`${o.type === "prescription" ? oralName(o.drugCode) : "処方"}（${fmt(day)}）`} actions={list} onClose={close} />}
    </div>
  );
}
