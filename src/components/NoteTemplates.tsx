"use client";
import { displayText } from "@/lib/display-text";
import { TimeInput } from "@/components/TimeInput";

// テンプレート: pick a template, fill in the form (choices, numbers, text; results and calculations come
// from the chart and code), and put the text into today's note. Own templates are kept per person in
// this browser.

import { Copy, PencilLine, Plus, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CalendarDate } from "@/lib/dates";
import { ANALYTES } from "@/lib/master";
import {
  FORMULAS,
  calcFormula,
  fieldKey,
  fieldText,
  fillTemplate,
  loadMyTemplates,
  parseTemplate,
  saveMyTemplates,
  startValues,
  templatesFor,
  unanswered,
  type NoteTemplate,
  type TemplateFacts,
  type TemplateField,
  type TemplateValues,
} from "@/lib/note-templates";
import { TemplateMarkupInput } from "./TemplateMarkupInput";
import { TemplateEditor } from "./TemplateEditor";
export { TemplateEditor } from "./TemplateEditor";
import type { Patient } from "@/lib/types";
import { useMe } from "./RoleContext";

type View = { kind: "list" } | { kind: "fill"; t: NoteTemplate } | { kind: "edit"; t: NoteTemplate | null; seed: string; name: string };

export function TemplatePanel({ patient, today, onInsert, onClose, onOpenRecords, shared = [], onShared, extraFacts }: { patient: Patient; today: CalendarDate; onInsert: (text: string) => void; onClose: () => void; onOpenRecords?: () => void; shared?: NoteTemplate[]; onShared?: (list: NoteTemplate[]) => void; extraFacts?: Partial<TemplateFacts> }) {
  const me = useMe();
  const [mine, setMine] = useState<NoteTemplate[]>(() => loadMyTemplates(me.name));
  const [saved, setSaved] = useState<boolean | null>(null);
  const [view, setView] = useState<View>({ kind: "list" });
  const offered = templatesFor(me.role, mine);
  const facts: TemplateFacts = { ...extraFacts, patient, today, author: me.name, role: me.role };
  const visible = [...mine, ...shared.filter(t => !t.deleted && (t.scope === "ward" ? t.ward === patient.ward : t.roles.includes(me.role)))];
  const store = (list: NoteTemplate[]) => {
    setMine(list);
    setSaved(saveMyTemplates(me.name, list));
  };

  return (
    <div className="rounded-lg border border-ai/40 bg-ai-soft/30 p-3 text-[13px]">
      <div className="mb-2 flex items-center gap-2">
        <h3 className="text-sm font-bold text-ai">テンプレート</h3>
        {view.kind !== "list" && (
          <button type="button" onClick={() => setView({ kind: "list" })} className="text-xs text-ink-soft underline">
            一覧に戻る
          </button>
        )}
        <button type="button" onClick={onClose} aria-label="テンプレートを閉じる" className="ml-auto rounded p-0.5 text-ink-faint hover:bg-sheet hover:text-ink">
          <X size={15} />
        </button>
      </div>

      {view.kind === "list" && (
        <div className="space-y-2">

          {onOpenRecords && (
            <div className="rounded-md border border-rule bg-paper px-2 py-1.5 text-xs">
              <button type="button" onClick={onOpenRecords} className="font-bold text-ai underline">型のある記録（IC・救急医療管理加算の根拠・ICU 入室時・急変時・転倒 …）</button>
              <span className="ml-1 text-ink-soft">選択肢と数値で書き、左の絞り込みの「テンプレート」で引けます。</span>
            </div>
          )}
          <div>
            <div className="mb-1 text-[11px] text-ink-faint">ひな形</div>
            {offered.builtIn.length === 0 ? (
              <p className="text-xs text-ink-faint">この職種のひな形はありません。</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {offered.builtIn.map((t) => (
                  <span key={t.id} className="inline-flex items-center overflow-hidden rounded-md border border-rule bg-sheet">
                    <button type="button" onClick={() => setView({ kind: "fill", t })} className="px-2 py-1 font-bold hover:bg-paper">
                      {t.name}
                    </button>
                    <button type="button" onClick={() => setView({ kind: "edit", t: null, seed: t.body, name: `${t.name}（自分用）` })} title="複製して自分用に直す" aria-label={`${t.name}を複製して自分用に直す`} className="border-l border-rule px-1.5 py-1 text-ink-faint hover:bg-paper hover:text-ink">
                      <Copy size={12} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
          <div>
            <div className="mb-1 text-[11px] text-ink-faint">登録したテンプレート（{me.name}・共有分を含む）</div>
            <div className="flex flex-wrap gap-1.5">
              {visible.map((t) => (
                <span key={t.id} className="inline-flex items-center overflow-hidden rounded-md border border-rule bg-sheet">
                  <button type="button" onClick={() => setView({ kind: "fill", t })} className="px-2 py-1 font-bold hover:bg-paper">
                    {t.name}
                  </button>
                  <button type="button" onClick={() => setView({ kind: "edit", t: null, seed: t.body, name: `${t.name}（複製）` })} aria-label={`${t.name}を複製して作る`} className="border-l border-rule px-1.5 py-1"><Copy size={12} /></button>
                  <button type="button" onClick={() => setView({ kind: "edit", t, seed: t.body, name: t.name })} disabled={!!t.by && t.by !== me.name} title="直す" aria-label={`${t.name}を直す`} className="border-l border-rule px-1.5 py-1 text-ink-faint hover:bg-paper hover:text-ink">
                    <PencilLine size={12} />
                  </button>
                  <button type="button" disabled={!!t.by && t.by !== me.name} onClick={() => t.scope && t.scope !== "private" ? onShared?.(shared.map(x => x.id === t.id ? { ...x, deleted: true } : x)) : store(mine.filter((x) => x.id !== t.id))} title="消す" aria-label={`${t.name}を消す`} className="border-l border-rule px-1.5 py-1 text-ink-faint hover:bg-shu-soft hover:text-shu">
                    <Trash2 size={12} />
                  </button>
                </span>
              ))}
              <button type="button" onClick={() => setView({ kind: "edit", t: null, seed: "", name: "" })} className="inline-flex items-center gap-1 rounded-md border border-dashed border-ai/60 px-2 py-1 text-xs text-ai hover:bg-sheet">
                <Plus size={12} />
                新しく作る
              </button>
            </div>
            {saved === false && <p className="mt-1 text-[11px] text-yamabuki">この端末に保存できませんでした（ブラウザの設定）。ページを閉じるまでは使えます。</p>}
          </div>

        </div>
      )}

      {view.kind === "fill" && <TemplateForm key={view.t.id} t={view.t} facts={facts} onInsert={(text) => (onInsert(text), setView({ kind: "list" }))} />}

      {view.kind === "edit" && (
        <TemplateEditor
          key={view.t?.id ?? `new-${view.name}`}
          start={view}
          others={visible}
          facts={facts}
          onSave={(name, body, scope) => {
            const t: NoteTemplate = { id: view.t?.id ?? crypto.randomUUID(), name, body, scope, ward: patient.ward, roles: [me.role], by: me.name };
            store([...mine.filter(x => x.id !== t.id), ...(scope === "private" ? [t] : [])]);
            onShared?.([...shared.filter(x => x.id !== t.id), ...(scope !== "private" ? [t] : shared.filter(x => x.id === t.id).map(x => ({ ...x, deleted: true })))]);
            setView({ kind: "fill", t });
          }}
        />
      )}
    </div>
  );
}

/** One field of the form. */
export function FieldInput({ f, values, set, facts, fields }: { f: TemplateField; values: TemplateValues; set: (k: string, v: string | string[]) => void; facts: TemplateFacts; fields: TemplateField[] }) {
  const k = fieldKey(f);
  const v = values[k];
  const chip = (on: boolean) => `rounded-md border px-2 py-0.5 text-[12px] pointer-coarse:py-1.5 ${on ? "border-ai bg-ai font-bold text-white" : "border-rule bg-sheet text-ink-soft hover:text-ink"}`;
  switch (f.kind) {
    case "部品": return <TemplateMarkupInput field={f} value={v} onChange={value => set(k, value)} />;
    case "選択":
      return (
        <Row label={f.label}>
          <div role="radiogroup" aria-label={f.label} className="flex flex-wrap gap-1">
            {f.options.map((o) => (
              <button key={o} type="button" role="radio" aria-checked={v === o} onClick={() => set(k, v === o ? "" : o)} className={chip(v === o)}>
                {o}
              </button>
            ))}
          </div>
        </Row>
      );
    case "複数": {
      const list = Array.isArray(v) ? v : [];
      return (
        <Row label={f.label}>
          <div role="group" aria-label={f.label} className="flex flex-wrap gap-1">
            {f.options.map((o) => (
              <button key={o} type="button" aria-pressed={list.includes(o)} onClick={() => set(k, list.includes(o) ? list.filter((x) => x !== o) : [...list, o])} className={chip(list.includes(o))}>
                {o}
              </button>
            ))}
          </div>
        </Row>
      );
    }
    case "数値":
      return (
        <Row label={f.label}>
          <span className="flex items-center gap-1">
            <input value={typeof v === "string" ? v : ""} onChange={(e) => set(k, e.target.value)} inputMode="decimal" aria-label={f.label} className="nums w-24 rounded border border-rule bg-sheet px-1.5 py-0.5 text-right outline-none focus:border-ai" />
            <span className="text-ink-soft">{f.unit}</span>
          </span>
        </Row>
      );
    case "時刻":
      return (
        <Row label={f.label}>
          <TimeInput value={typeof v === "string" ? v : ""} onChange={(e) => set(k, e.target.value)} aria-label={f.label} className="nums w-28 rounded border border-rule bg-sheet px-1.5 py-0.5 outline-none focus:border-ai" />
        </Row>
      );
    case "文":
      return (
        <Row label={f.label}>
          <textarea value={typeof v === "string" ? v : ""} onChange={(e) => set(k, e.target.value)} rows={1} aria-label={f.label} className="w-full resize-y rounded border border-rule bg-sheet px-1.5 py-0.5 outline-none focus:border-ai" />
        </Row>
      );
    case "計算": {
      const r = calcFormula(f.formula, values, facts, fields);
      const fm = FORMULAS[f.formula];
      return (
        <Row label={fm.name}>
          <div>
            <b className="nums">{r.value === null ? "—" : `${r.value}${fm.unit}`}</b>
            <span className="ml-2 text-[11px] text-ink-soft">
              計算：{fm.expr}
              {r.used.length > 0 && `（${r.used.map((u) => `${u.label} ${u.value}${u.unit}${u.from === "カルテ" ? "＝カルテ" : ""}`).join("、")}）`}

            </span>
            {r.missing.length > 0 && <div className="text-[11px] text-yamabuki">{r.missing.join("・")}がありません</div>}
          </div>
        </Row>
      );
    }
    default:
      return (
        <Row label={f.kind === "検査" ? (ANALYTES.find((a) => a.code === f.code)?.name ?? f.code) : f.kind === "予約語" ? f.name : f.kind}>
          <span className="nums text-ink-soft">
            {displayText(fieldText(f, values, facts, fields))}
            <span className="ml-1 text-[10px] text-ink-faint">（カルテから）</span>
          </span>
        </Row>
      );
  }
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[6.5rem_1fr] items-start gap-2 py-0.5">
      <span className="pt-0.5 text-[12px] text-ink-soft">{label}</span>
      {children}
    </div>
  );
}

export function TemplateForm({ t, facts, onInsert, preview = false }: { t: NoteTemplate; facts: TemplateFacts; onInsert: (text: string) => void; preview?: boolean }) {
  const form = useRef<HTMLDivElement>(null);
  useEffect(() => { if (!preview) form.current?.querySelector<HTMLElement>("input,select,textarea,button[role=radio]")?.focus(); }, [preview]);
  const parsed = useMemo(() => parseTemplate(t.body), [t.body]);
  const [values, setValues] = useState<TemplateValues>(() => startValues(parsed, facts));
  const text = fillTemplate(parsed, values, facts);
  const left = unanswered(parsed, values);
  return (
    <div ref={form} className="space-y-2">
      <div className="flex items-baseline gap-2">
        <b>{t.name}</b>
        <span className="text-[11px] text-ink-faint">{displayText(t.by ? `自分のテンプレート（${t.by}）` : "院内のひな形")}</span>
      </div>
      <div className="divide-y divide-rule-soft rounded-md border border-rule bg-paper/60 px-2 py-1">
        {parsed.fields.map((f) => (
          <FieldInput key={fieldKey(f)} f={f} values={values} set={(k, v) => setValues((s) => ({ ...s, [k]: v }))} facts={facts} fields={parsed.fields} />
        ))}
        {parsed.fields.length === 0 && <p className="py-1 text-xs text-ink-faint">入力の欄はありません（本文がそのまま入ります）。</p>}
      </div>
      <details open className="rounded-md border border-rule-soft bg-sheet px-2 py-1">
        <summary className="cursor-pointer text-[11px] text-ink-soft">記事に入る文（見本）</summary>
        <pre className="nums mt-1 whitespace-pre-wrap font-[inherit] text-[12px] leading-relaxed">{displayText(text)}</pre>
      </details>
      {parsed.errors.length > 0 && <ul className="text-xs text-yamabuki">{parsed.errors.map((error, i) => <li key={i}>{error}</li>)}</ul>}
      <div className="flex items-center gap-2">
        {left.length > 0 && <span className="text-[11px] text-yamabuki">まだ選んでいない・入れていない：{left.join("・")}</span>}
        {!preview && <button type="button" disabled={parsed.errors.some(e => !e.includes("不明な予約語")) || parsed.fields.some(f => f.kind === "部品" && f.required && left.includes(f.label))} onClick={() => onInsert(text)} className="ml-auto shrink-0 rounded-md bg-ai px-3 py-1 text-xs font-bold text-white hover:bg-ai/90">
          記事に入れる
        </button>}
      </div>
    </div>
  );
}
