"use client";

/** 「受け持ちを目立たせる」 on the patient list and the ward map (kept per viewer, see use-emphasis.ts). */
export function EmphasisToggle({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-1.5 text-xs text-ink-soft" title="外すと、受け持ち以外の患者も受け持ちと同じ形（印・バイタル・DPC・今日の予定）で出します。この端末のみに適用されます">
      <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} className="accent-ai" />
      受け持ちを目立たせる
      <span className="hint text-[11px] text-ink-faint">外すと全員を同じ形で出します（この端末のみに適用されます）</span>
    </label>
  );
}
