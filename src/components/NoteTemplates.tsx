"use client";
import { displayText } from "@/lib/display-text";
import { TimeInput } from "@/components/TimeInput";

// テンプレート: pick a template, fill in the form (choices, numbers, text; results and calculations come
// from the chart and code), and put the text into today's note. Own templates are kept per person in
// this browser.

import { Copy, PencilLine, Plus, Trash2, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
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
  templateProblems,
  templatesFor,
  tokenOf,
  unanswered,
  type FormulaKey,
  type NoteTemplate,
  type TemplateFacts,
  type TemplateField,
  type TemplateValues,
} from "@/lib/note-templates";
import type { Patient } from "@/lib/types";
import { useMe } from "./RoleContext";

type View = { kind: "list" } | { kind: "fill"; t: NoteTemplate } | { kind: "edit"; t: NoteTemplate | null; seed: string; name: string };

export function TemplatePanel({ patient, today, onInsert, onClose, onOpenRecords }: { patient: Patient; today: CalendarDate; onInsert: (text: string) => void; onClose: () => void; onOpenRecords?: () => void }) {
  const me = useMe();
  const [mine, setMine] = useState<NoteTemplate[]>(() => loadMyTemplates(me.name));
  const [saved, setSaved] = useState<boolean | null>(null);
  const [view, setView] = useState<View>({ kind: "list" });
  const offered = templatesFor(me.role, mine);
  const facts: TemplateFacts = { patient, today };
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
            <div className="mb-1 text-[11px] text-ink-faint">自分のテンプレート（{me.name}・この端末のみに保存）</div>
            <div className="flex flex-wrap gap-1.5">
              {mine.map((t) => (
                <span key={t.id} className="inline-flex items-center overflow-hidden rounded-md border border-rule bg-sheet">
                  <button type="button" onClick={() => setView({ kind: "fill", t })} className="px-2 py-1 font-bold hover:bg-paper">
                    {t.name}
                  </button>
                  <button type="button" onClick={() => setView({ kind: "edit", t, seed: t.body, name: t.name })} title="直す" aria-label={`${t.name}を直す`} className="border-l border-rule px-1.5 py-1 text-ink-faint hover:bg-paper hover:text-ink">
                    <PencilLine size={12} />
                  </button>
                  <button type="button" onClick={() => store(mine.filter((x) => x.id !== t.id))} title="消す" aria-label={`${t.name}を消す`} className="border-l border-rule px-1.5 py-1 text-ink-faint hover:bg-shu-soft hover:text-shu">
                    <Trash2 size={12} />
                  </button>
                </span>
              ))}
              <button type="button" onClick={() => setView({ kind: "edit", t: null, seed: "", name: "" })} className="inline-flex items-center gap-1 rounded-md border border-dashed border-ai/60 px-2 py-1 text-xs text-ai hover:bg-sheet">
                <Plus size={12} />
                自分のテンプレートを作る
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
          others={mine}
          onSave={(name, body) => {
            const t: NoteTemplate = view.t ? { ...view.t, name, body } : { id: crypto.randomUUID(), name, body, roles: [me.role], by: me.name };
            store(view.t ? mine.map((x) => (x.id === t.id ? t : x)) : [...mine, t]);
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
        <Row label={f.kind === "検査" ? (ANALYTES.find((a) => a.code === f.code)?.name ?? f.code) : f.kind}>
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

function TemplateForm({ t, facts, onInsert }: { t: NoteTemplate; facts: TemplateFacts; onInsert: (text: string) => void }) {
  const parsed = useMemo(() => parseTemplate(t.body), [t.body]);
  const [values, setValues] = useState<TemplateValues>(() => startValues(parsed, facts));
  const text = fillTemplate(parsed, values, facts);
  const left = unanswered(parsed, values);
  return (
    <div className="space-y-2">
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
      <div className="flex items-center gap-2">
        {left.length > 0 && <span className="text-[11px] text-yamabuki">まだ選んでいない・入れていない：{left.join("・")}（「未選択」「未入力」と入ります）</span>}
        <button type="button" onClick={() => onInsert(text)} className="ml-auto shrink-0 rounded-md bg-ai px-3 py-1 text-xs font-bold text-white hover:bg-ai/90">
          記事に入れる
        </button>
      </div>
    </div>
  );
}

const KINDS: { kind: TemplateField["kind"]; label: string }[] = [
  { kind: "選択", label: "選択肢（1つ）" },
  { kind: "複数", label: "選択肢（いくつでも）" },
  { kind: "数値", label: "数値" },
  { kind: "時刻", label: "時刻" },
  { kind: "文", label: "文" },
  { kind: "検査", label: "検査値（最新）" },
  { kind: "計算", label: "計算" },
  { kind: "バイタル", label: "バイタル（最新）" },
  { kind: "アレルギー", label: "アレルギー" },
  { kind: "感染症", label: "感染症" },
  { kind: "日付", label: "今日の日付" },
  { kind: "入院日数", label: "入院◯日目" },
];

export function TemplateEditor({ start, others, onSave }: { start: { name: string; seed: string; t: NoteTemplate | null }; others: NoteTemplate[]; onSave: (name: string, body: string) => void }) {
  const [name, setName] = useState(start.name);
  const [body, setBody] = useState(start.seed);
  const [kind, setKind] = useState<TemplateField["kind"]>("選択");
  const [label, setLabel] = useState("");
  const [options, setOptions] = useState("");
  const [unit, setUnit] = useState("");
  const [code, setCode] = useState("CRP");
  const [formula, setFormula] = useState<FormulaKey>("BMI");
  const box = useRef<HTMLTextAreaElement>(null);
  const problems = templateProblems(name, body, others, start.t?.id);
  const parsed = parseTemplate(body);

  const field: TemplateField | null = (() => {
    const opts = options.split(/[|｜、,，]/).map((s) => s.trim()).filter(Boolean);
    switch (kind) {
      case "選択":
      case "複数":
        return label.trim() && opts.length >= 2 ? { kind, label: label.trim(), options: opts } : null;
      case "数値":
        return label.trim() ? { kind, label: label.trim(), unit: unit.trim() } : null;
      case "時刻":
      case "文":
        return label.trim() ? { kind, label: label.trim() } : null;
      case "検査":
        return { kind, code };
      case "計算":
        return { kind, formula };
      default:
        return { kind } as TemplateField;
    }
  })();
  const put = () => {
    if (!field) return;
    const el = box.current;
    const s = el?.selectionStart ?? body.length;
    const e = el?.selectionEnd ?? body.length;
    const tok = tokenOf(field);
    setBody(body.slice(0, s) + tok + body.slice(e));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(s + tok.length, s + tok.length);
    });
  };
  const input = "rounded border border-rule bg-sheet px-1.5 py-0.5 outline-none focus:border-ai";

  return (
    <div className="space-y-2">
      <label className="flex items-center gap-2">
        <span className="w-14 shrink-0 text-[12px] text-ink-soft">名前</span>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="例：術後1日目" className={`${input} flex-1`} />
      </label>
      <div className="rounded-md border border-rule bg-paper/60 p-2">
        <div className="mb-1 text-[11px] text-ink-soft">差し込むもの（本文のカーソルの位置に入ります）</div>
        <div className="flex flex-wrap items-center gap-1.5">
          <select value={kind} onChange={(e) => setKind(e.target.value as TemplateField["kind"])} aria-label="差し込むもの" className={input}>
            {KINDS.map((k) => (
              <option key={k.kind} value={k.kind}>
                {k.label}
              </option>
            ))}
          </select>
          {(kind === "選択" || kind === "複数" || kind === "数値" || kind === "時刻" || kind === "文") && <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="項目の名前（例：疼痛）" aria-label="項目の名前" className={`${input} w-32`} />}
          {(kind === "選択" || kind === "複数") && <input value={options} onChange={(e) => setOptions(e.target.value)} placeholder="選択肢を「、」か「|」で区切る" aria-label="選択肢" className={`${input} min-w-40 flex-1`} />}
          {kind === "数値" && <input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="単位（例：mL）" aria-label="単位" className={`${input} w-24`} />}
          {kind === "検査" && (
            <select value={code} onChange={(e) => setCode(e.target.value)} aria-label="検査" className={input}>
              {ANALYTES.map((a) => (
                <option key={a.code} value={a.code}>
                  {a.name}
                </option>
              ))}
            </select>
          )}
          {kind === "計算" && (
            <select value={formula} onChange={(e) => setFormula(e.target.value as FormulaKey)} aria-label="計算" className={input}>
              {(Object.keys(FORMULAS) as FormulaKey[]).map((k) => (
                <option key={k} value={k}>
                  {FORMULAS[k].name}
                </option>
              ))}
            </select>
          )}
          <button type="button" disabled={!field} onClick={put} className="rounded-md border border-ai px-2 py-0.5 text-xs font-bold text-ai hover:bg-sheet disabled:opacity-40">
            差し込む
          </button>
        </div>
        {kind === "計算" && (
          <p className="mt-1 text-[11px] text-ink-soft">
            {FORMULAS[formula].name} ＝ {FORMULAS[formula].expr}。使う数値：
            {FORMULAS[formula].inputs.map((i) => `${i.label}（${i.unit}${i.chart ? "、本文に同じ名前の数値がなければカルテの値" : "、本文に「数値:" + i.label + "」が要ります"}）`).join("・")}
          </p>
        )}
      </div>
      <textarea ref={box} value={body} onChange={(e) => setBody(e.target.value)} rows={8} aria-label="テンプレートの本文" placeholder={"例：\nS) 疼痛 {{選択:疼痛:なし|軽度|中等度|高度}}\nO) {{バイタル}}\n{{検査:CRP}}"} className={`${input} nums w-full resize-y py-1 font-[inherit] leading-relaxed`} />
      {parsed.fields.length > 0 && (
        <p className="text-[11px] text-ink-soft">
          入力の欄：
          {parsed.fields.map((f) => (f.kind === "選択" || f.kind === "複数" ? `${f.label}（${f.options.join("／")}）` : f.kind === "数値" ? `${f.label}（${f.unit || "数値"}）` : f.kind === "文" || f.kind === "時刻" ? f.label : f.kind === "計算" ? FORMULAS[f.formula].name : f.kind === "検査" ? `${ANALYTES.find((a) => a.code === f.code)?.name ?? f.code}（カルテから）` : `${f.kind}（カルテから）`)).join("、")}
        </p>
      )}
      {problems.length > 0 && (
        <ul className="text-[11px] text-yamabuki">
          {problems.map((p) => (
            <li key={p}>・{p}</li>
          ))}
        </ul>
      )}
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-ink-faint">この端末のみに保存されます。どの患者の記事でも使えます。</span>
        <button type="button" disabled={problems.length > 0} onClick={() => onSave(name.trim(), body)} className="ml-auto rounded-md bg-ai px-3 py-1 text-xs font-bold text-white disabled:opacity-40">
          保存して使う
        </button>
      </div>
    </div>
  );
}

/* Help migration source (references and dynamic wording):
<p >選ぶと入力の欄が出ます。選択肢を押し、数値を入れると、検査値・バイタルはカルテから、計算はコードが式どおりに入れます。「記事に入れる」で下の記事に入ります（確定は記事の「記事を確定」で）。</p>
<p >
            根拠：
            {TEMPLATE_SOURCES.map((s) => (
              <a key={s.url} href={s.url} target="_blank" rel="noreferrer" >
                {s.name}
              </a>
            ))}
          </p>
<span >　出典：{displayText(fm.source)}</span>
*/
