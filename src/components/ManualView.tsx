"use client";

import { BookOpen, ExternalLink, Printer, Search, X } from "lucide-react";
import { useState } from "react";
import { createPortal, flushSync } from "react-dom";
import { MANUALS, MANUAL_LABEL, byChapter, revisedLabel, searchManuals, type Manual } from "@/lib/manuals";

interface Props {
  /** The manuals to show (default: the fictional hospital's). */
  manuals?: Manual[];
  /** The manual that is open, when the parent keeps it (so it stays open after switching screens). */
  openId?: string | null;
  onOpen?: (id: string) => void;
}

/** 院内マニュアル: the fictional hospital's manuals by chapter, searchable, each with its public sources. */
export function ManualView({ manuals = MANUALS, openId, onOpen }: Props) {
  const [ownId, setOwnId] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [printing, setPrinting] = useState(false);
  const hits = searchManuals(manuals, q);
  const groups = byChapter(hits);
  const currentId = (openId !== undefined ? openId : ownId) ?? manuals[0]?.id ?? null;
  const open = manuals.find((m) => m.id === currentId) ?? null;
  const matched = q.trim() ? (hits.find((h) => h.manual.id === currentId)?.steps ?? []) : [];
  const choose = (id: string) => (onOpen ? onOpen(id) : setOwnId(id));

  const print = () => {
    // Put the sheet into <body> only while printing, so other screens' print sheets are not mixed in.
    flushSync(() => setPrinting(true));
    const done = () => {
      setPrinting(false);
      window.removeEventListener("afterprint", done);
    };
    window.addEventListener("afterprint", done);
    window.print();
  };

  return (
    <section aria-label="院内マニュアル" className="flex min-h-0 flex-1 flex-col bg-paper text-[13px] print:hidden">
      <header className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-rule bg-sheet px-5 py-3">
        <h1 className="flex items-center gap-2 text-lg font-bold">
          <BookOpen size={20} className="text-ai" />
          院内マニュアル
          <span className="rounded border border-dashed border-ink-faint px-1.5 py-0.5 text-[10px] font-normal text-ink-soft">架空</span>
        </h1>
        <p className="nums text-sm text-ink-soft">
          {manuals.length}件（{byChapter(searchManuals(manuals, "")).length}章）
        </p>
        <button type="button" disabled={!open} onClick={print} className="ml-auto flex items-center gap-1.5 rounded-md bg-ai px-3 py-1.5 text-sm font-bold text-white disabled:opacity-40 pointer-coarse:py-2">
          <Printer size={15} />
          印刷
        </button>
      </header>

      <div className="flex min-h-0 flex-1">
        <nav aria-label="マニュアルの一覧" className="flex min-h-0 w-[min(340px,40%)] shrink-0 flex-col border-r border-rule bg-sheet">
          <div className="border-b border-rule-soft p-3">
            <label className="flex items-center gap-1.5 rounded-md border border-rule bg-paper px-2 focus-within:border-ai">
              <Search size={14} className="shrink-0 text-ink-faint" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="題名と手順の中を探す（ひらがなでも）" aria-label="マニュアルを探す" className="min-w-0 flex-1 bg-transparent py-1.5 outline-none pointer-coarse:py-2" />
              {q && (
                <button type="button" onClick={() => setQ("")} aria-label="検索を消す" className="text-ink-faint hover:text-ink">
                  <X size={14} />
                </button>
              )}
            </label>
            {q.trim() && <p className="nums mt-1.5 text-[11px] text-ink-soft">{hits.length ? `${hits.length}件が当てはまります` : "当てはまるマニュアルはありません"}</p>}
          </div>
          <div className="scroll-thin min-h-0 flex-1 overflow-y-auto py-2">
            {groups.map((g) => (
              <div key={g.chapter} className="mb-2">
                <h2 className="px-4 py-1 text-[11px] font-bold text-ink-soft">{g.chapter}</h2>
                <ul>
                  {g.hits.map((h) => {
                    const m = h.manual;
                    const on = m.id === currentId;
                    return (
                      <li key={m.id}>
                        <button
                          type="button"
                          onClick={() => choose(m.id)}
                          aria-current={on ? "true" : undefined}
                          className={`flex w-full flex-col gap-0.5 px-4 py-2 text-left pointer-coarse:py-3 ${on ? "bg-ai-soft font-bold" : "hover:bg-paper"}`}
                        >
                          <span className="leading-snug">{m.title}</span>
                          <span className="nums text-[11px] font-normal text-ink-faint">
                            {m.version}・{revisedLabel(m.revised)} 改訂
                          </span>
                          {h.steps.length > 0 && (
                            <span className="line-clamp-2 text-[11px] font-normal text-ink-soft">
                              手順 {h.steps.map((i) => i + 1).join("・")}：{m.steps[h.steps[0]]}
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
          <p className="hint border-t border-rule-soft px-4 py-2 text-[10px] text-ink-faint">架空の病院のマニュアルです。手順は公的な資料（各マニュアルの出典）に沿った例で、薬の量や診療の判断は書いていません（判断は医師が行います）。検索と並べ方はコードで行い、AI は使っていません。</p>
        </nav>

        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto p-5">
          {open ? (
            <div className="mx-auto max-w-3xl rounded-lg border border-rule bg-sheet p-6">
              <ManualSheet manual={open} matched={matched} />
            </div>
          ) : (
            <p className="text-ink-faint">左の一覧からマニュアルを選んでください。</p>
          )}
        </div>
      </div>

      {printing &&
        open &&
        createPortal(
          <div className="hidden bg-white text-ink print:block">
            <ManualSheet manual={open} matched={[]} printed />
          </div>,
          document.body,
        )}
    </section>
  );
}

function ManualSheet({ manual: m, matched, printed }: { manual: Manual; matched: number[]; printed?: boolean }) {
  return (
    <article className="text-[13px] leading-relaxed text-ink print:text-[11pt]">
      <p className="text-[12px] text-ink-soft">
        {m.chapter}
        <span className="mx-1.5 text-ink-faint">／</span>
        {m.dept}
      </p>
      <h2 className="mt-0.5 text-lg font-bold leading-snug">{m.title}</h2>
      <p className="nums mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-soft">
        <span>{m.version}</span>
        <span>改訂日 {revisedLabel(m.revised)}</span>
        <span className="rounded bg-yamabuki-soft px-1.5 py-0.5 text-[11px] font-bold text-yamabuki print:border print:border-ink/40 print:bg-transparent print:text-ink">{MANUAL_LABEL}</span>
      </p>

      <ol className="mt-4 space-y-2">
        {m.steps.map((s, i) => (
          <li key={i} className={`flex gap-3 rounded-md px-2 py-1.5 ${matched.includes(i) ? "bg-yamabuki-soft" : ""}`}>
            <span className="nums flex size-6 shrink-0 items-center justify-center rounded-full bg-ink text-[12px] font-bold text-white print:border print:border-ink print:bg-transparent print:text-ink">{i + 1}</span>
            <span className="pt-0.5">{s}</span>
          </li>
        ))}
      </ol>

      {m.note && <p className="mt-3 rounded-md border border-rule-soft bg-paper px-3 py-2 text-[12px] text-ink-soft print:bg-transparent">{m.note}</p>}

      <section className="mt-5 border-t border-rule pt-3">
        <h3 className="mb-1.5 text-[12px] font-bold text-ink-soft">出典（公的な資料）</h3>
        <ul className="space-y-2 text-[12px]">
          {m.sources.map((s) => (
            <li key={s.url + s.title}>
              {printed ? (
                <span className="font-bold">{s.title}</span>
              ) : (
                <a href={s.url} target="_blank" rel="noreferrer" className="inline-flex items-start gap-1 font-bold text-ai underline">
                  {s.title}
                  <ExternalLink size={11} className="mt-1 shrink-0" />
                </a>
              )}
              <span className="text-ink-soft">
                　{s.issuer}、{s.year}
              </span>
              {s.part && <div className="text-ink-soft">使った所：{s.part}</div>}
              {printed && <div className="break-all text-ink-soft">{s.url}</div>}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[11px] text-ink-faint">この手順は{MANUAL_LABEL}です。版と改訂日も架空です。実際の病院では、各院の手順に従ってください。</p>
      </section>
    </article>
  );
}
