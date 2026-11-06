import { displayText } from "@/lib/display-text";

// One item of the 患者基本情報 window: label, value, and who registered it (gray, right).

export function Row({ label, children, by }: { label: string; children: React.ReactNode; by?: string }) {
  return (
    <div className="grid grid-cols-[8.5rem_1fr] items-start gap-x-2 gap-y-0.5 border-b border-rule-soft py-1 last:border-b-0 sm:grid-cols-[8.5rem_1fr_auto]">
      <dt className="pt-px text-[12px] text-ink-soft">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
      {by && <dd className="nums col-start-2 text-[11px] text-ink-faint sm:col-start-3 sm:max-w-56 sm:text-right">{displayText(by)}</dd>}
    </div>
  );
}

export const none = <span className="text-ink-faint">—</span>;
export const text = (s: string | undefined | null) => (s && s.trim() ? displayText(s) : none);

export const infoInput = "w-full rounded border border-rule bg-sheet px-1.5 py-0.5 text-[13px] outline-none focus:border-ai";
export const infoLinkBtn = "inline-flex items-center gap-1 rounded border border-rule bg-sheet px-2 py-0.5 text-xs text-ink-soft hover:text-ink pointer-coarse:py-1.5";
