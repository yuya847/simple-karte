"use client";

import { displayText } from "@/lib/display-text";
import { CheckSquare, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { kanaMatch } from "@/lib/kana";
import { ageSex } from "@/lib/person";
import type { Patient } from "@/lib/types";
import type { Todo } from "./AppFrame";
import { PatientAvatar } from "./PatientAvatar";

interface Props {
  patients: Patient[];
  /** Charts open now (shown first). */
  openIds: string[];
  /** The tab the chart will open under (e.g. 受け持ち患者). */
  under: string;
  todos: Todo[];
  onPatient: (id: string) => void;
}

/**
 * 新しいタブ: a patient's chart to open here (search by name, kana, ID or room), or something waiting
 * in やること. Keyboard: type, ↓↑, Enter.
 */
export function NewTabPage({ patients, openIds, under, todos, onPatient }: Props) {
  const [q, setQ] = useState("");
  const [at, setAt] = useState(0);
  const box = useRef<HTMLInputElement>(null);
  useEffect(() => box.current?.focus(), []);
  const recent = [...openIds.map((id) => patients.find((p) => p.id === id)).filter((p): p is Patient => !!p), ...patients.filter((p) => !openIds.includes(p.id))];
  const hits = q.trim() ? patients.filter((p) => [p.name, p.kana, p.room, p.id, p.admissionDiagnosis].some((f) => kanaMatch(f, q))) : recent;

  return (
    <div className="scroll-thin min-h-0 flex-1 overflow-y-auto bg-paper">
      <div className="max-w-4xl space-y-3 px-3 py-3 text-sm">
        <section>
          <h2 className="mb-2 font-bold">患者のカルテを開く<span className="ml-2 text-[12px] font-normal text-ink-soft">「{under}」の下にタブで開きます（ほかの所で開いていれば、そこへ移ります）</span></h2>
          <label className="flex items-center gap-2 rounded-lg border border-rule bg-sheet px-3 py-2 focus-within:border-ai">
            <Search size={16} className="text-ink-faint" />
            <input
              ref={box}
              autoComplete="off"
            value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setAt(0);
              }}
              onKeyDown={(e) => {
                if (e.nativeEvent.isComposing) return;
                if (e.key === "ArrowDown") setAt((a) => Math.min(a + 1, Math.max(hits.length - 1, 0)));
                else if (e.key === "ArrowUp") setAt((a) => Math.max(a - 1, 0));
                else if (e.key === "Enter" && hits[at]) onPatient(hits[at].id);
                else return;
                e.preventDefault();
              }}
              placeholder="名前・ふりがな（ひらがな可）・ID・部屋・病名"
              aria-label="患者を探す"
              className="flex-1 bg-transparent text-base outline-none"
            />
            <kbd className="rounded border border-rule px-1 text-[10px] text-ink-faint">↓↑ Enter</kbd>
          </label>
          <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
            {hits.slice(0, 8).map((p, i) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => onPatient(p.id)}
                  className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left pointer-coarse:py-3 ${i === at ? "border-ai bg-ai-soft/60" : "border-rule bg-sheet hover:border-ai"}`}
                >
                  <PatientAvatar sex={p.sex} age={p.age} size={32} className="rounded-full" />
                  <span className="min-w-0 flex-1">
                    <span className="block">
                      <b>{p.name}</b> <span className="nums text-xs text-ink-faint">{p.room}</span>
                      {openIds.includes(p.id) && <span className="ml-1 text-[11px] text-ai">開いています</span>}
                    </span>
                    <span className="block truncate text-xs text-ink-soft">
                      {ageSex(p)}・{p.admissionDiagnosis}
                    </span>
                  </span>
                </button>
              </li>
            ))}
            {q.trim() && hits.length === 0 && <li className="text-ink-faint">見つかりません（カルテのある患者だけを探します）。</li>}
          </ul>
        </section>

        <section>
          <h2 className="mb-2 flex items-center gap-1.5 font-bold">
            <CheckSquare size={16} />
            やること（{todos.reduce((n, t) => n + t.count, 0)}件）
          </h2>
          {todos.length === 0 ? (
            <p className="text-ink-faint">いま待っていることはありません。</p>
          ) : (
            <ul className="grid gap-1.5 sm:grid-cols-2">
              {todos.map((t) => (
                <li key={t.key}>
                  <button type="button" onClick={t.go} className="flex w-full items-start gap-2 rounded-lg border border-rule bg-sheet px-3 py-2 text-left hover:border-ai pointer-coarse:py-3">
                    <span className={`nums rounded-full px-1.5 text-[10px] font-bold leading-4 text-white ${t.tone === "shu" ? "bg-shu" : t.tone === "ai" ? "bg-ai" : "bg-yamabuki"}`}>{t.count}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block">{t.label}</span>
                      {t.detail && <span className="block text-[11px] text-ink-faint">{displayText(t.detail)}</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
