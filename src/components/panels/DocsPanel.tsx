"use client";

import { displayText } from "@/lib/display-text";
import { NUTRITION_PLAN_SOURCE, nutritionPlanProblems } from "@/lib/nutrition-plan";
import { Printer } from "lucide-react";
import { useState } from "react";
import { createPortal, flushSync } from "react-dom";
import { DOC_DEFS, DOC_KINDS, docMissing, type DocKind, type DocRecord } from "@/lib/documents";
import type { Patient } from "@/lib/types";
import { ageSex } from "@/lib/person";
import { DenyNote, useDeny, useMe } from "../RoleContext";

/**
 * 書類作成: choose a form; what the chart says is filled in (カルテから), the doctor writes the rest,
 * confirms (kept in the record) and prints. 紹介状 is written in the 退院サマリ panel.
 */
export function DocsPanel({ patient, auto, saved, today, onSave, onOpenReferral, initial, initialKind }: { initialKind?: DocKind; patient: Patient; auto: (k: DocKind) => Record<string, string>; saved: DocRecord[]; today: string; onSave: (kind: DocKind, values: Record<string, string>) => void; onOpenReferral: () => void; initial?: (k: DocKind) => Record<string, string> }) {
  const me = useMe();
  const deny = useDeny();
  const [kind, setKind] = useState<DocKind | null>(initialKind ?? null);
  const [values, setValues] = useState<Record<string, string>>(() => initialKind ? initial?.(initialKind) ?? {} : {});
  const [printing, setPrinting] = useState<DocRecord | null>(null);
  // 退院支援計画書 is written by the discharge support staff (MSW・看護師), 褥瘡対策の計画書 by the team's doctor and nurse; the others by doctors.
  const action = (k: DocKind) => (k === "栄養管理計画書" ? "assess.nutrition" : k === "入院診療計画書" ? "plan" : k === "退院支援計画書" ? "assess.discharge" : k === "褥瘡対策に関する診療計画書" ? "pressure" : "discharge") as "assess.nutrition" | "plan" | "discharge" | "assess.discharge" | "pressure";
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
      <div className="flex flex-wrap gap-1.5">
        {DOC_KINDS.map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={kind === k}
            onClick={() => {
              setKind(k);
              setValues(initial?.(k) ?? {});
            }}
            className={`rounded-md border px-3 py-1.5 pointer-coarse:py-2.5 ${kind === k ? "border-ink bg-ink font-bold text-white" : "border-rule bg-sheet hover:border-ai"}`}
          >
            {k}
          </button>
        ))}
        <button type="button" onClick={onOpenReferral} className="rounded-md border border-dashed border-rule px-3 py-1.5 text-ink-soft hover:border-ai hover:text-ai">
          紹介状（退院サマリの欄へ）
        </button>
      </div>
      {kind && (
        <section className="space-y-2 rounded-md border border-rule bg-paper p-3 text-[12px]">
          <p className="text-ink-soft">{DOC_DEFS[kind].purpose}</p>{kind === "栄養管理計画書" && <p className="hint">厚生労働省 保医発0305第7号 別添6 別紙23に準じた模擬様式。項目を補って表示します。GLIM（国際的な低栄養診断基準）による評価を行っていない場合は「非対応」と記入します。<a href={NUTRITION_PLAN_SOURCE} target="_blank" rel="noreferrer">出典</a>。空欄は記録がありません。確認して入力してください。</p>}
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
                <span className="w-40 shrink-0 text-ink-soft">{f.label}</span>
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
                  {f.optional && <span className="text-[10px] text-ink-faint">（任意）</span>}
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
            <button
              type="button"
              disabled={missing.length > 0 || !!deny(action(kind))}
              onClick={() => {
                onSave(kind, merged);
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
      {saved.length > 0 && (
        <section>
          <h3 className="mb-1 text-[12px] font-bold text-ink-soft">作った書類</h3>
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
