"use client";

import { rememberDocument } from "@/lib/document-memory";
import { DocumentBrowser } from "../DocumentBrowser";
import { DOCUMENT_CATALOG, type DocumentSuggestion } from "@/lib/document-catalog";
import type { ConsentCode, ConsentRecord } from "@/lib/consent";
import { findConsent } from "@/lib/consent";
import { displayText } from "@/lib/display-text";
import { nutritionPlanProblems } from "@/lib/nutrition-plan";
import { Printer } from "lucide-react";
import { useState } from "react";
import { createPortal, flushSync } from "react-dom";
import { DOC_DEFS, docMissing, type DocKind, type DocRecord } from "@/lib/documents";
import type { Patient } from "@/lib/types";
import { ageSex } from "@/lib/person";
import { DenyNote, useDeny, useMe } from "../RoleContext";

/**
 * 書類作成: choose a form; what the chart says is filled in (カルテから), the doctor writes the rest,
 * confirms (kept in the record) and prints. 紹介状 is written in the 退院サマリ panel.
 */
export function DocsPanel({ patient, auto, saved, today, onSave, onOpenReferral, initial, initialKind, onOpenConsent, consents = [], suggestions = [] }: { onOpenConsent?: (code?: ConsentCode, recordId?: string) => void; consents?: ConsentRecord[]; suggestions?: DocumentSuggestion[]; initialKind?: DocKind; patient: Patient; auto: (k: DocKind) => Record<string, string>; saved: DocRecord[]; today: string; onSave: (kind: DocKind, values: Record<string, string>) => void; onOpenReferral: () => void; initial?: (k: DocKind) => Record<string, string> }) {
  const me = useMe();
  const deny = useDeny();
  const [created, setCreated] = useState(false);
  const [kind, setKind] = useState<DocKind | null>(initialKind ?? null);
  const [values, setValues] = useState<Record<string, string>>(() => initialKind ? initial?.(initialKind) ?? {} : {});
  const draftKey = `karte-document-drafts:${me.name}:${patient.id}`;
  const [draftKinds, setDraftKinds] = useState<DocKind[]>(() => { try { return Object.keys(JSON.parse(localStorage.getItem(draftKey) ?? "{}")) as DocKind[]; } catch { return []; } });
  const loadDraft = (k: DocKind): Record<string, string> | undefined => { try { return JSON.parse(localStorage.getItem(draftKey) ?? "{}")[k]; } catch { return undefined; } };
  const saveDraft = (k: DocKind, v?: Record<string, string>) => { try { const all = JSON.parse(localStorage.getItem(draftKey) ?? "{}"); if (v) all[k] = v; else delete all[k]; localStorage.setItem(draftKey, JSON.stringify(all)); setDraftKinds(Object.keys(all) as DocKind[]); } catch { /* Storage may be unavailable. */ } };
  const [printing, setPrinting] = useState<DocRecord | null>(null);
  // 退院支援計画書 is written by the discharge support staff (MSW・看護師), 褥瘡対策の計画書 by the team's doctor and nurse; the others by doctors.
  const action = (k: DocKind) => (k === "看護計画" ? "nursing.plan" : k === "栄養管理計画書" ? "assess.nutrition" : k === "入院診療計画書" ? "plan" : k === "退院支援計画書" ? "assess.discharge" : k === "褥瘡対策に関する診療計画書" ? "pressure" : "discharge") as "nursing.plan" | "assess.nutrition" | "plan" | "discharge" | "assess.discharge" | "pressure";
  const sheet = (k: DocKind, v: Record<string, string>, by: string, at: string) => (
    <article className="space-y-1.5 text-[12px] leading-relaxed print:text-[10.5pt]">
      <h2 className="border-b border-rule pb-1 text-base font-bold">{k}</h2>
      <p className="nums text-ink-soft">
        {patient.name}（{patient.kana}）　{ageSex(patient)}　ID {patient.id}　架空総合病院
      </p>
      <dl className="grid grid-cols-[10rem_1fr] gap-y-1">
        {DOC_DEFS[k].fields.map((f) => (
          <div key={f.key} className="contents">
            <dt className="text-ink-faint">{f.label}</dt>
            <dd className="whitespace-pre-wrap">{v[f.key] || "—"}</dd>
          </div>
        ))}
      </dl>
      <p className="nums pt-2 text-right">
        {at}　{displayText(by)}
      </p>
    </article>
  );
  const print = (r: DocRecord) => {
    flushSync(() => setPrinting(r));
    const done = () => {
      setPrinting(null);
      window.removeEventListener("afterprint", done);
    };
    window.addEventListener("afterprint", done);
    window.print();
  };
  const merged = kind ? { ...auto(kind), ...values } : {};
  const missing = kind ? [...docMissing(kind, merged), ...(kind === "栄養管理計画書" ? nutritionPlanProblems(merged) : [])] : [];
  return (
    <div className="space-y-3 text-[13px]">
      {created && initialKind && <p role="status">{initialKind}を作成しました。</p>}
      {!initialKind && <DocumentBrowser key={me.name} actor={me.name} items={DOCUMENT_CATALOG} canCreate={id => id.startsWith("CONSENT-") ? !!onOpenConsent && !deny("consent") : id === "referral" ? !deny("discharge") : !deny(action(id as DocKind))} suggestions={suggestions.filter(s => !saved.some(r => r.kind === s.id) && !consents.some(c => c.code === s.id && (c.status === "説明前" || c.status === "同意")))} onCreate={id => {
        if (id === "referral") return onOpenReferral();
        if (id.startsWith("CONSENT-")) return onOpenConsent?.(id as ConsentCode);
        const k = id as DocKind;
        setKind(k); setValues(loadDraft(k) ?? initial?.(k) ?? {});
      }} />}
      {!initialKind && draftKinds.length > 0 && <section><h3 className="font-bold">この患者の下書き</h3>{draftKinds.map(k => <button key={k} type="button" className="mr-2 text-ai" onClick={() => { setKind(k); setValues(loadDraft(k) ?? {}); }}>{k}</button>)}</section>}
      {!initialKind && consents.length > 0 && <section><h3 className="font-bold">この患者の同意書</h3>{consents.map(c => <div key={c.id} className="flex gap-2 border-b border-rule-soft py-1"><span>{findConsent(c.code).short}</span><span>{c.status === "説明前" ? "下書き" : c.status}</span><button type="button" className="ml-auto text-ai" onClick={() => onOpenConsent?.(undefined, c.id)}>開く</button></div>)}</section>}
      {kind && (
        <section className="space-y-2 rounded-md border border-rule bg-paper p-3 text-[12px]">
          <p className="text-ink-soft">{DOC_DEFS[kind].purpose}</p>
          {DOC_DEFS[kind].fields.map((f) =>
            f.auto ? (
              <div key={f.key} className="flex gap-2">
                <span className="w-40 shrink-0 text-ink-faint">{f.label}</span>
                <span className="whitespace-pre-wrap">
                  {merged[f.key] || "—"}
                  <span className="ml-1 rounded bg-sheet px-1 text-[10px] text-ink-faint">カルテから</span>
                </span>
              </div>
            ) : f.choices ? (
              <div key={f.key} className="flex flex-wrap items-center gap-1.5">
                <span className="w-40 shrink-0 text-ink-soft">{f.label}{!f.optional && <span className="text-shu"> *</span>}</span>
                {f.choices.map((c) => (
                  <button key={c} type="button" aria-pressed={values[f.key] === c} onClick={() => setValues((v) => ({ ...v, [f.key]: c }))} className={`rounded border px-2 py-0.5 ${values[f.key] === c ? "border-ink bg-ink text-white" : "border-rule"}`}>
                    {c}
                  </button>
                ))}
              </div>
            ) : (
              <label key={f.key} className="flex gap-2">
                <span className="w-40 shrink-0 pt-1 text-ink-soft">
                  {f.label}
                  {!f.optional && <span className="text-[10px] text-shu"> *</span>}
                </span>
                {f.long ? (
                  <textarea value={values[f.key] ?? ""} onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))} rows={2} className="flex-1 rounded border border-rule bg-sheet px-2 py-1" />
                ) : (
                  <input value={values[f.key] ?? ""} onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))} className="flex-1 rounded border border-rule bg-sheet px-2 py-1" />
                )}
              </label>
            ),
          )}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button type="button" disabled={!!deny(action(kind))} onClick={() => saveDraft(kind, values)} className="rounded border border-rule px-3 py-1">下書きを保存</button>
            <button
              type="button"
              disabled={missing.length > 0 || !!deny(action(kind))}
              onClick={() => {
                onSave(kind, merged);
                setCreated(true);
                rememberDocument(me.name, kind);
                saveDraft(kind);
                setKind(null);
                setValues({});
              }}
              className="rounded-md bg-ai px-4 py-1.5 font-bold text-white disabled:opacity-40"
            >
              {kind}を作成（{me.name}）
            </button>
            {missing.length > 0 && <span className="text-yamabuki">未入力：{missing.join("・")}</span>}
            <DenyNote action={action(kind)} />
          </div>
        </section>
      )}
      {!initialKind && saved.length > 0 && (
        <section>
          <h3 className="mb-1 text-[12px] font-bold text-ink-soft">この患者の作成済み</h3>
          <ul className="space-y-1 text-[12px]">
            {saved.map((r) => (
              <li key={r.id} className="nums flex items-center gap-2 rounded border border-rule-soft bg-sheet px-2 py-1">
                <b>{r.kind}</b>
                <span className="text-ink-faint">
                  {r.at.time} {displayText(r.by)}
                </span>
                <button type="button" onClick={() => print(r)} className="ml-auto flex items-center gap-1 rounded border border-rule px-2 py-0.5 hover:border-ai hover:text-ai">
                  <Printer size={13} />
                  印刷
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {printing && typeof document !== "undefined" && createPortal(<div className="hidden bg-white p-6 text-ink print:block">{sheet(printing.kind, printing.values, printing.by, `${today} ${printing.at.time}`)}</div>, document.body)}
    </div>
  );
}

/* Help migration source (references and dynamic wording):
<p >厚生労働省 保医発0305第7号 別添6 別紙23に準じた模擬様式。項目を補って表示します。GLIM（国際的な低栄養診断基準）による評価を行っていない場合は「非対応」と記入します。<a href={NUTRITION_PLAN_SOURCE} target="_blank" rel="noreferrer">出典</a>。空欄は記録がありません。確認して入力してください。</p>
*/
