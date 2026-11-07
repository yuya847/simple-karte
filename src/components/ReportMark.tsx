"use client";

// The mark on an order row of the record: a report is attached (FileText), with a red dot while the doctor has
// not confirmed it and gray once seen. Pressing it opens the report in a small window over the record. The
// reports come from a context WardApp provides, so HistoryPane only places the mark.

import { displayText } from "@/lib/display-text";
import { FileText, X } from "lucide-react";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { CalendarDate } from "@/lib/dates";
import { readStateOf, reportsForOrder, type Report } from "@/lib/reports";
import { partialReportLabel, type ReportedLabResult, type Ack } from "@/lib/results";
import { ReportPanel } from "./panels/ReportPanel";
import { cssPx, viewH, viewW } from "@/lib/page-zoom";

export interface ReportCtx {
  ris?: import("@/lib/ris").RisDesk;
  reports: Report[];
  labs?: { orderId: string; lab: ReportedLabResult }[];
  acks: Record<string, Ack>;
  today: CalendarDate;
  onSeen?: (keys: string[]) => void;
  onOpenImage?: (studyId: string) => void;
}

/** The open patient's reports, for the marks on the order rows (null where no chart is open). */
export const ReportContext = createContext<ReportCtx | null>(null);

const WIDTH = 480;

/** A small window at the mark, over the record. Esc or a press outside closes it. */
function Popover({ at, onClose, children, label }: { at: { x: number; y: number }; onClose: () => void; children: React.ReactNode; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const away = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && onClose();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("pointerdown", away, true);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("pointerdown", away, true);
      window.removeEventListener("keydown", esc);
    };
  }, [onClose]);
  const vw = viewW();
  const vh = viewH();
  const width = Math.min(WIDTH, vw - 16);
  const left = Math.max(8, Math.min(cssPx(at.x), vw - width - 8));
  const maxH = Math.round(vh * 0.7);
  const top = Math.max(8, Math.min(cssPx(at.y), vh - maxH - 8));
  return createPortal(
    <div ref={ref} role="dialog" aria-label={label} style={{ position: "fixed", left, top, width, maxHeight: maxH, zIndex: 1000 }} className="scroll-thin flex flex-col overflow-y-auto rounded-lg border border-rule bg-paper p-3 shadow-[0_12px_32px_-8px_rgba(38,34,28,0.4)]">
      <button type="button" onClick={onClose} aria-label="閉じる" className="absolute right-1.5 top-1.5 rounded p-0.5 text-ink-faint hover:bg-sheet hover:text-ink">
        <X size={14} />
      </button>
      {children}
    </div>,
    document.body,
  );
}

/** The marks of an order's reports (an endoscopy may carry its own and the biopsy's pathology). */
export function OrderReportMark({ orderId }: { orderId: string }) {
  const ctx = useContext(ReportContext);
  const [open, setOpen] = useState<{ key: string; x: number; y: number } | null>(null);
  if (!ctx) return null;
  const reports = reportsForOrder(ctx.reports, orderId);
  const partials = (ctx.labs ?? []).filter((r) => r.orderId === orderId).map((r) => partialReportLabel(r.lab)).filter(Boolean);
  if (reports.length === 0 && partials.length === 0) return null;
  const shown = open ? reports.find((r) => r.key === open.key) : undefined;
  return (
    <>
      {partials.map((label, i) => <span key={i} className="rounded bg-yamabuki-soft px-1 text-[11px] font-bold text-yamabuki">{label}</span>)}
      {reports.map((r) => {
        const s = readStateOf(r, ctx.acks);
        const unread = s.state === "未読";
        return (
          <button
            key={r.key}
            type="button"
            aria-label={`${r.kind}のレポート（${s.state}）を読む`}
            title={displayText(`${r.kind}のレポート：${s.state === "確認済み" ? `確認 ${s.ack.at.time} ${s.ack.by}` : s.state}。押すと読めます`)}
            data-unread={unread || undefined}
            onClick={(e) => {
              const b = e.currentTarget.getBoundingClientRect();
              setOpen({ key: r.key, x: b.left, y: b.bottom + 4 });
            }}
            className={`relative rounded px-1 py-0.5 hover:bg-sheet ${unread ? "text-ink" : "text-ink-faint hover:text-ink"}`}
          >
            <FileText size={13} />
            {unread && <span aria-hidden className="absolute right-0 top-0 h-2 w-2 rounded-full border border-paper bg-shu" />}
          </button>
        );
      })}
      {shown && (
        <Popover at={open!} onClose={() => setOpen(null)} label={`${shown.kind}のレポート：${shown.title}`}>
          <ReportPanel report={shown} acks={ctx.acks} today={ctx.today} onSeen={ctx.onSeen} onOpenImage={ctx.onOpenImage} />
        </Popover>
      )}
    </>
  );
}
