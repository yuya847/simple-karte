"use client";
import { useRef, useState } from "react";
import { parseTemplate, templateProblems, type NoteTemplate, type TemplateFacts } from "@/lib/note-templates";
import { RESERVED_WORDS } from "@/lib/template-syntax";
import { TemplateForm } from "./NoteTemplates";

export const COMPONENT_EXAMPLES = [
  ["コンボ", '<combo label="疼痛" default="なし">なし|軽度|中等度|高度</combo>'],
  ["リスト", '<list label="部位">頭部|胸部|腹部</list>'],
  ["複数リスト", '<list multiple label="症状">発熱|咳|痰</list>'],
  ["ラジオ", '<radio label="意識">清明|JCS I|JCS II|JCS III</radio>'],
  ["チェック", '<check label="説明した">'],
  ["数値", '<number label="尿量" unit="mL"/>'], ["時刻", '<time label="発見"/>'],
  ["日付", '<date label="発症日"/>'], ["文", '<text label="訴え"/>'],
];
export function SyntaxChips({ insert }: { insert: (text: string) => void }) {
  return <div className="flex flex-wrap gap-1">{COMPONENT_EXAMPLES.map(([label, example]) => <button key={label} type="button" className="rounded border border-rule bg-sheet px-2 py-1 text-xs" onClick={() => insert(example)}>{label}</button>)}
    <select aria-label="予約語を差し込む" value="" onChange={e => { if (e.target.value) insert(`{${e.target.value}}`); }} className="rounded border border-rule bg-sheet text-xs"><option value="">予約語</option>{RESERVED_WORDS.map(word => <option key={word}>{word}</option>)}</select>
  </div>;
}
export type TemplateScope = "private" | "role" | "ward";
export function TemplateEditor({ start, others, facts, onSave }: { start: { name: string; seed: string; t: NoteTemplate | null }; others: NoteTemplate[]; facts?: TemplateFacts; onSave: (name: string, body: string, scope: TemplateScope) => void }) {
  const [name, setName] = useState(start.name);
  const [body, setBody] = useState(start.seed);
  const [scope, setScope] = useState<TemplateScope>(start.t?.scope ?? "private");
  const box = useRef<HTMLTextAreaElement>(null);
  const problems = templateProblems(name, body, others, start.t?.id).filter(p => !p.includes("不明な予約語"));
  const parsed = parseTemplate(body);
  const insert = (text: string) => {
    const el = box.current;
    const s = el?.selectionStart ?? body.length, e = el?.selectionEnd ?? body.length;
    setBody(body.slice(0, s) + text + body.slice(e));
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(s + text.length, s + text.length); });
  };
  return <div className="space-y-2">
    <div className="flex flex-wrap gap-2"><input aria-label="テンプレートの名前" placeholder="名前" value={name} onChange={e => setName(e.target.value)} className="rounded border border-rule bg-sheet p-1" />
      <select aria-label="公開範囲" value={scope} onChange={e => setScope(e.target.value as TemplateScope)} className="rounded border border-rule bg-sheet"><option value="private">自分だけ</option><option value="role">同じ職種</option><option value="ward">この病棟で共有</option></select></div>
    <SyntaxChips insert={insert} />
    <p className="text-xs text-ink-faint">例：疼痛 &lt;combo label=&quot;疼痛&quot;&gt;なし|あり&lt;/combo&gt;　{'{患者ID}'}</p>
    <div className="grid gap-3 lg:grid-cols-2"><div><textarea ref={box} aria-label="テンプレートの本文" value={body} onChange={e => setBody(e.target.value)} rows={14} className="w-full rounded border border-rule bg-sheet p-2 font-mono text-xs" />
      <ul className="text-xs text-shu">{parsed.errors.map((p, i) => <li key={i}>{p}</li>)}</ul></div>
      {facts && <div aria-label="使うときのプレビュー"><TemplateForm preview key={body} t={{ id: "preview", name: name || "プレビュー", body, roles: [] }} facts={facts} onInsert={() => {}} /></div>}</div>
    <ul className="text-xs text-shu">{problems.filter(p => !parsed.errors.includes(p)).map(p => <li key={p}>{p}</li>)}</ul>
    <button type="button" disabled={problems.length > 0} onClick={() => onSave(name.trim(), body, scope)} className="rounded bg-ai px-3 py-1 text-xs text-white disabled:opacity-40">保存して使う</button>
  </div>;
}
