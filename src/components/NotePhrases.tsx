"use client";

// 定型文・単語登録: the person's own sentences, put into the note at the cursor. Kept per person in this
// browser; the list starts with fictional examples until the person registers their own.

import { Plus, Search, Trash2, X } from "lucide-react";
import { useState } from "react";
import { PHRASE_SOURCES, findPhrases, phraseProblems, savePhrases, type Phrase } from "@/lib/phrases";
import { useMe } from "./RoleContext";

export function PhrasePanel({ phrases, onPhrases, selected, onInsert, onClose }: { phrases: Phrase[]; onPhrases: (list: Phrase[]) => void; selected: string; onInsert: (text: string) => void; onClose: () => void }) {
  const me = useMe();
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const [key, setKey] = useState("");
  const [text, setText] = useState("");
  const [saved, setSaved] = useState<boolean | null>(null);
  const shown = findPhrases(phrases, q);
  const problems = phraseProblems(key, text, phrases);
  const store = (list: Phrase[]) => {
    onPhrases(list);
    setSaved(savePhrases(me.name, list));
  };
  const input = "rounded border border-rule bg-sheet px-1.5 py-0.5 text-[12px] outline-none focus:border-ai";

  return (
    <div className="rounded-lg border border-wakatake/40 bg-wakatake-soft/30 p-3 text-[13px]">
      <div className="mb-2 flex items-center gap-2">
        <h3 className="text-sm font-bold text-wakatake">定型文</h3>
        <span className="text-[11px] text-ink-faint">{me.name}・この端末のみに保存</span>
        <button type="button" onClick={onClose} aria-label="定型文を閉じる" className="ml-auto rounded p-0.5 text-ink-faint hover:bg-sheet hover:text-ink">
          <X size={15} />
        </button>
      </div>
      <p className="hint mb-2 text-[11px] text-ink-soft">押すと記事のカーソルの位置に入ります。記事の中で「;読み」と打って Tab を押しても入ります（例：;ふくぶ → Tab）。</p>
      <label className="mb-2 flex items-center gap-1.5 rounded-md border border-rule bg-sheet px-2 py-1 focus-within:border-ai">
        <Search size={13} className="shrink-0 text-ink-faint" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="読み・文で探す（ひらがな可）" aria-label="定型文を探す" className="min-w-0 flex-1 bg-transparent text-[12px] outline-none" />
      </label>
      <ul className="max-h-48 space-y-1 overflow-y-auto">
        {shown.map((p) => (
          <li key={p.id} className="flex items-start gap-1.5">
            <button type="button" onClick={() => onInsert(p.text)} className="flex min-w-0 flex-1 items-baseline gap-2 rounded-md border border-rule bg-sheet px-2 py-1 text-left hover:border-wakatake pointer-coarse:py-2">
              <b className="shrink-0 text-[11px] text-wakatake">;{p.key}</b>
              <span className="min-w-0">{p.text}</span>
            </button>
            <button type="button" onClick={() => store(phrases.filter((x) => x.id !== p.id))} aria-label={`「${p.key}」を消す`} title="消す" className="mt-1 rounded p-1 text-ink-faint hover:bg-shu-soft hover:text-shu">
              <Trash2 size={12} />
            </button>
          </li>
        ))}
        {shown.length === 0 && <li className="text-xs text-ink-faint">{phrases.length ? "当てはまる定型文はありません。" : "まだ登録がありません。"}</li>}
      </ul>
      {adding ? (
        <div className="mt-2 space-y-1.5 rounded-md border border-rule bg-paper/60 p-2">
          <div className="flex items-center gap-1.5">
            <input value={key} onChange={(e) => setKey(e.target.value)} placeholder="読み（例：ふくぶ）" aria-label="読み" className={`${input} w-32`} />
            <span className="text-[11px] text-ink-faint">記事で「;{key || "読み"}」→ Tab</span>
          </div>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder="文（例：腹部平坦・軟、圧痛なし。）" aria-label="定型文" className={`${input} w-full resize-y`} />
          {(key || text) && problems.length > 0 && <p className="text-[11px] text-yamabuki">{problems.join(" ")}</p>}
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setAdding(false)} className="ml-auto rounded border border-rule px-2 py-0.5 text-[11px]">
              やめる
            </button>
            <button
              type="button"
              disabled={problems.length > 0}
              onClick={() => {
                store([...phrases, { id: crypto.randomUUID(), key: key.trim(), text: text.trim() }]);
                setKey("");
                setText("");
                setAdding(false);
              }}
              className="rounded bg-wakatake px-2 py-0.5 text-[11px] font-bold text-white disabled:opacity-40"
            >
              登録する
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-2 flex flex-wrap gap-1.5">
          <button type="button" onClick={() => setAdding(true)} className="inline-flex items-center gap-1 rounded-md border border-dashed border-wakatake/60 px-2 py-1 text-xs text-wakatake hover:bg-sheet">
            <Plus size={12} />
            定型文を登録
          </button>
          {selected.trim() && (
            <button
              type="button"
              onClick={() => {
                setText(selected.trim());
                setAdding(true);
              }}
              className="inline-flex items-center gap-1 rounded-md border border-dashed border-wakatake/60 px-2 py-1 text-xs text-wakatake hover:bg-sheet"
              title={selected.trim()}
            >
              <Plus size={12} />
              記事で選んだ文を登録
            </button>
          )}
        </div>
      )}
      {saved === false && <p className="mt-1 text-[11px] text-yamabuki">この端末に保存できませんでした（ブラウザの設定）。ページを閉じるまでは使えます。</p>}
      <p className="mt-2 text-[10px] text-ink-faint">
        根拠：
        {PHRASE_SOURCES.map((s) => (
          <a key={s.url} href={s.url} target="_blank" rel="noreferrer" className="underline">
            {s.name}
          </a>
        ))}
      </p>
    </div>
  );
}
