"use client";

import { Mic, Plus, Square } from "lucide-react";
import { useRef, useState } from "react";
import { displayText } from "@/lib/display-text";
import { KISAI_SOURCES } from "@/lib/billing/kisai-sources";
import { factChips, saveShoki, SHOKI_CATEGORIES, shokiSeriesOf, type FactChip, type ShokiSeriesView } from "@/lib/billing/kisai-view";
import type { KisaiWorkspace } from "@/lib/billing/kisai-workspace";
import type { collectShokiFacts, ShokiCategory, ShokiRequirement, ShokiTarget } from "@/lib/billing/shoki";
import { unencodable } from "@/lib/billing/sjis";
import { useSpeech } from "@/lib/use-speech";
import { DenyNote, useDeny, useMe } from "../RoleContext";

interface Draft {
  series?: string;
  targets: ShokiTarget[];
  category: ShokiCategory | "";
  body: string;
}

const md = (iso: string) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`;
const GROUPS: FactChip["group"][] = ["病名", "検査", "経過", "薬"];

/** 症状詳記：要る項目をコードが挙げ、カルテの事実を並べ、医師が文を書く。確定した版はレセプト（SJ）に載る。 */
export function ShokiPanel({ required, facts, saved, patientId, month, at, newId, onSave }: {
  required: ShokiRequirement[];
  facts: ReturnType<typeof collectShokiFacts>;
  saved: KisaiWorkspace;
  patientId: string;
  month: string;
  /** 保存する時刻（ISO・+09:00）。 */
  at: string;
  newId: () => string;
  onSave?: (next: KisaiWorkspace, what: string) => void;
}) {
  const me = useMe();
  const locked = useDeny()("shoki");
  const all = shokiSeriesOf(saved.shoki, patientId, month);
  const [edit, setEdit] = useState<Draft | null>(null);
  const forCode = (code: string) => all.find((v) => v.targets.some((t) => t.code === code));
  const optional = all.filter((v) => !v.targets.some((t) => required.some((r) => r.target.code === t.code)));
  const start = (v: ShokiSeriesView | undefined, targets: ShokiTarget[]) => {
    const cur = v?.draft ?? v?.versions.at(-1);
    setEdit({ series: v?.series, targets, category: cur?.category ?? "", body: cur?.body ?? "" });
  };
  const editing = edit ? all.find((v) => v.series === edit.series) : undefined;

  return (
    <section aria-label="症状詳記" className="space-y-2 text-xs">
      {required.length === 0 && <p className="text-ink-soft">この月はありません</p>}
      <ul className="space-y-1">
        {required.map((r) => {
          const v = forCode(r.target.code);
          const src = KISAI_SOURCES[r.basis.source];
          return <SeriesRow key={r.target.code} title={`${r.target.name}（${r.target.kubun}）`} hint={`${src.title} ${r.basis.section}：${r.basis.text}`} v={v} onEdit={locked ? undefined : () => start(v, [r.target])} />;
        })}
        {optional.map((v) => <SeriesRow key={v.series} title="詳記" v={v} onEdit={locked ? undefined : () => start(v, v.targets)} />)}
      </ul>
      {!edit && !locked && (
        <button type="button" onClick={() => start(undefined, [])} className="inline-flex items-center gap-1 rounded border border-rule bg-sheet px-2 py-1 hover:bg-tab">
          <Plus size={12} />
          詳記を書く
        </button>
      )}
      <DenyNote action="shoki" />
      {edit && !locked && (
        <ShokiEditor
          key={edit.series ?? "new"}
          draft={edit}
          facts={factChips(facts)}
          versions={editing?.versions ?? []}
          onClose={() => setEdit(null)}
          onSave={(d, status) => {
            if (!d.category) return;
            onSave?.(saveShoki(saved, { series: d.series, patientId, month, targets: d.targets, category: d.category, body: d.body, by: me.name, at, newId }, status), status === "確定" ? "確定（症状詳記）" : "症状詳記の下書きを保存");
            if (status === "確定") setEdit(null);
          }}
        />
      )}
    </section>
  );
}

function SeriesRow({ title, hint, v, onEdit }: { title: string; hint?: string; v?: ShokiSeriesView; onEdit?: () => void }) {
  const last = v?.versions.at(-1);
  return (
    <li className="rounded-md border border-rule bg-paper px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-bold" title={hint}>{title}</span>
        {last && <span className="nums text-wakatake">確定 第{last.version}版 {md(last.at)} {displayText(last.by)}</span>}
        {v?.draft && <span className="text-yamabuki">下書き</span>}
        {!v && <span className="text-ink-faint">まだ</span>}
        {onEdit && (
          <button type="button" onClick={onEdit} className="ml-auto rounded border border-rule bg-sheet px-2 py-0.5 hover:bg-tab">
            {v ? "直す" : "書く"}
          </button>
        )}
      </div>
      {(v?.draft ?? last) && <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-ink-soft">{(v?.draft ?? last)!.body}</p>}
    </li>
  );
}

function ShokiEditor({ draft, facts, versions, onClose, onSave }: { draft: Draft; facts: FactChip[]; versions: { version: number; at: string; by: string; body: string }[]; onClose: () => void; onSave: (d: Draft, status: "下書き" | "確定") => void }) {
  const [d, setD] = useState(draft);
  const ref = useRef<HTMLTextAreaElement>(null);
  const speech = useSpeech((t) => setD((x) => ({ ...x, body: `${x.body}${t}` })));
  const bad = unencodable(d.body.replace(/\r?\n|\r/g, ""));
  const insert = (text: string) => {
    const el = ref.current;
    const from = el ? el.selectionStart : d.body.length;
    const to = el ? el.selectionEnd : from;
    setD((x) => ({ ...x, body: x.body.slice(0, from) + text + x.body.slice(to) }));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(from + text.length, from + text.length);
    });
  };
  const ok = !!d.category && !!d.body.trim() && bad.length === 0;
  return (
    <div className="space-y-2 rounded-md border border-ai/40 bg-paper p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-bold">{d.targets.map((t) => t.name).join("・") || "詳記"}</span>
        <select aria-label="症状詳記区分" value={d.category} onChange={(e) => setD({ ...d, category: e.target.value as ShokiCategory })} className="rounded border border-rule bg-sheet px-1 py-0.5">
          <option value="">区分を選ぶ</option>
          {SHOKI_CATEGORIES.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
        </select>
      </div>
      {facts.length > 0 && (
        <div aria-label="カルテの事実" className="space-y-1">
          {GROUPS.map((g) => {
            const chips = facts.filter((f) => f.group === g);
            if (!chips.length) return null;
            return (
              <div key={g} className="flex flex-wrap items-baseline gap-1">
                <span className="w-8 shrink-0 text-[10px] text-ink-faint">{g}</span>
                {chips.map((f) => (
                  <button key={f.id} type="button" title={f.text} onClick={() => insert(f.text)} className="nums max-w-full truncate rounded border border-rule bg-sheet px-1.5 py-0.5 text-[11px] hover:border-ai hover:text-ai">
                    {f.label}
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      )}
      <div className="flex gap-1.5">
        <textarea ref={ref} aria-label="症状詳記の本文" value={d.body} onChange={(e) => setD({ ...d, body: e.target.value })} rows={7} className="flex-1 rounded border border-rule bg-sheet px-2 py-1 leading-relaxed outline-none focus:border-ai" />
        {speech.supported && (
          <button type="button" onClick={speech.listening ? speech.stop : speech.start} className="self-start rounded border border-rule px-2 py-1" title="話して入力">
            {speech.listening ? <Square size={14} /> : <Mic size={14} />}
          </button>
        )}
      </div>
      {speech.interim && <p className="text-ink-faint">{speech.interim}</p>}
      {speech.error && <p className="text-shu">{speech.error}</p>}
      {bad.length > 0 && <p className="text-shu">レセプトに使えない文字：{bad.join(" ")}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={!d.category || !d.body.trim()} onClick={() => onSave(d, "下書き")} className="rounded border border-rule bg-sheet px-3 py-1 hover:bg-tab disabled:opacity-40">下書きを保存</button>
        <button type="button" disabled={!ok} onClick={() => onSave(d, "確定")} className="rounded bg-ai px-3 py-1 font-bold text-white disabled:opacity-40">確定</button>
        <button type="button" onClick={onClose} className="rounded px-2 py-1 text-ink-soft hover:text-ink">閉じる</button>
      </div>
      {versions.length > 0 && (
        <details className="text-ink-soft">
          <summary className="cursor-pointer select-none">確定した版（{versions.length}）</summary>
          <ol className="mt-1 space-y-1">
            {[...versions].reverse().map((v) => (
              <li key={v.version} className="rounded border border-rule-soft bg-sheet px-2 py-1">
                <span className="nums text-[10px] text-ink-faint">第{v.version}版 {md(v.at)} {v.at.slice(11, 16)} {displayText(v.by)}</span>
                <p className="whitespace-pre-wrap">{v.body}</p>
              </li>
            ))}
          </ol>
        </details>
      )}
    </div>
  );
}
