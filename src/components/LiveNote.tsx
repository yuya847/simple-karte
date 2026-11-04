"use client";

import { PencilLine } from "lucide-react";
import { mergeTyping, withCarets } from "@/lib/coedit";
import type { NoteEditor } from "@/lib/presence";

/**
 * A past note someone else is correcting now: their text as they type it (merged when several type), with a
 * caret in each person's colour. Read-only; 「一緒に直す」 opens it for this page too.
 */
export function LiveNote({ editors, base, chipOf, onJoin }: { editors: NoteEditor[]; base: string; chipOf: (role: string) => string; onJoin?: () => void }) {
  const merged = mergeTyping(base, editors);
  const byTab = Object.fromEntries(editors.map((e) => [e.tab, e]));
  return (
    <div className="space-y-1 rounded-md border border-yamabuki/50 bg-yamabuki-soft/30 p-2 text-[13px]" aria-live="polite">
      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
        <PencilLine size={11} className="text-yamabuki" aria-hidden />
        {editors.map((e) => (
          <span key={e.tab} className={`rounded px-1 font-bold leading-4 ${chipOf(e.role)}`}>
            {e.who}
          </span>
        ))}
        <span className="text-ink-soft">さんが編集中（打っている文字がそのまま見えています）</span>
        {onJoin && (
          <button type="button" onClick={onJoin} className="ml-auto rounded border border-yamabuki px-1.5 py-0.5 font-bold text-yamabuki hover:bg-sheet" title="同じ記事を一緒に直す。確定すると一つの版に二人の名前が付きます。">
            一緒に直す
          </button>
        )}
      </div>
      <div className="nums whitespace-pre-wrap rounded border border-rule bg-sheet px-2 py-1 leading-relaxed">
        {withCarets(merged, editors).map((p, i) =>
          "caret" in p ? (
            <span key={i} role="img" aria-label={`${byTab[p.caret]?.who ?? ""}のカーソル`} title={byTab[p.caret]?.who} className={`mx-px inline-block h-[1.1em] w-[2px] animate-pulse align-text-bottom ${chipOf(byTab[p.caret]?.role ?? "")}`} />
          ) : (
            <span key={i}>{p.text}</span>
          ),
        )}
      </div>
    </div>
  );
}
