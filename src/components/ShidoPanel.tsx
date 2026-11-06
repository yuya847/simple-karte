"use client";

import { displayText } from "@/lib/display-text";
import { useState } from "react";
import { addDays, formatShort, type CalendarDate } from "@/lib/dates";
import { b008Check } from "@/lib/pharmacy";
import { EMPTY_FORM, SHIDO_SOURCE, kindNotes, shidoFacts, shidoProblems, shidoText, type ShidoForm } from "@/lib/shido";
import type { DayOffset } from "@/lib/types";
import type { WorkPatient } from "@/lib/worksheet";
import { DrugMarks } from "./DrugMarks";

export interface ShidoEntry {
  day: DayOffset;
  kind: "1" | "2";
  text: string;
  at: string;
  /** 麻薬管理指導加算 was given with it. */
  mayaku?: boolean;
}

const area = "w-full rounded border border-rule bg-paper px-2 py-1.5 text-[13px] outline-none focus:border-ai";

/** 服薬指導（薬剤管理指導記録）: the items of the notice, what the chart has, and the 回数 (週1回・月4回) by code. */
export function ShidoPanel({ people, today, records, onRecord }: { people: WorkPatient[]; today: CalendarDate; records: Record<string, ShidoEntry[]>; onRecord: (patientId: string, rec: Omit<ShidoEntry, "at" | "day">) => void }) {
  const [patientId, setPatientId] = useState(people[0]?.patient.id ?? "");
  const [form, setForm] = useState<ShidoForm>(EMPTY_FORM);
  const set = (x: Partial<ShidoForm>) => setForm((f) => ({ ...f, ...x }));
  const person = people.find((x) => x.patient.id === patientId);
  const recs = records[patientId] ?? [];
  const fmtDay = (d: DayOffset) => formatShort(addDays(today, d));
  // 週は日曜〜土曜。dow/month from the calendar of today.
  const dow = (d: DayOffset) => new Date(Date.UTC(today.y, today.m - 1, today.d + d)).getUTCDay();
  const month = (d: DayOffset) => {
    const t = new Date(Date.UTC(today.y, today.m - 1, today.d + d));
    return `${t.getUTCFullYear()}-${t.getUTCMonth() + 1}`;
  };
  const warn = b008Check(recs.map((r) => r.day), 0, dow, month);
  const facts = person ? shidoFacts(person.patient, person.entries) : null;
  const notes = facts ? kindNotes(form, facts) : [];
  const problems = shidoProblems(form);
  return (
    <section className="space-y-3 rounded-lg border border-rule bg-sheet p-4 text-[13px]">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2">
          患者
          <select
            value={patientId}
            onChange={(e) => {
              setPatientId(e.target.value);
              setForm(EMPTY_FORM);
            }}
            className="rounded border border-rule bg-paper px-2 py-1"
          >
            {people.map((x) => (
              <option key={x.patient.id} value={x.patient.id}>
                {x.room}　{x.patient.name}
              </option>
            ))}
          </select>
        </label>
        <div role="radiogroup" aria-label="区分" className="flex rounded-md border border-rule p-0.5 text-xs">
          {(
            [
              ["1", "1：特に安全管理が必要な医薬品"],
              ["2", "2：それ以外"],
            ] as const
          ).map(([v, l]) => (
            <button key={v} type="button" role="radio" aria-checked={form.kind === v} onClick={() => set({ kind: v })} className={`rounded px-2 py-0.5 ${form.kind === v ? "bg-ink font-bold text-white" : "text-ink-soft"}`}>
              {l}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1 text-xs">
          <input type="checkbox" className="accent-ai" checked={form.consent} onChange={() => set({ consent: !form.consent })} />
          医師の同意を得ている
        </label>
      </div>

      {facts && (
        <div className="rounded-md bg-paper px-3 py-2 text-[12px]">
          <p className="text-[11px] font-bold text-ink-soft">カルテから（記録の項目のうち、診療録と重なるもの）</p>
          <p>
            {facts.name}　{facts.sex}　{facts.age}歳　ID {facts.id}　入院 {fmtDay(facts.admittedOn)}　アレルギー歴：{facts.allergies.join("、") || "なし"}
          </p>
          <p>
            投薬・注射：
            {facts.drugs.length === 0
              ? "なし"
              : facts.drugs.map((d, i) => (
                  <span key={i} className="mr-2">
                    {displayText(d.text)}
                    <DrugMarks codes={[d.code]} />
                  </span>
                ))}
          </p>
          <p className="text-[11px] text-ink-faint">生年月日・退院年月日はこの試作のカルテにないため、記録に入りません。</p>
        </div>
      )}

      <textarea value={form.sideEffects} onChange={(e) => set({ sideEffects: e.target.value })} rows={1} placeholder="副作用歴（本人・家族から聞いたこと、これまでの記録）" aria-label="副作用歴" className={area} />
      <textarea value={form.management} onChange={(e) => set({ management: e.target.value })} rows={3} placeholder="薬学的管理指導の内容：投与量・投与方法・投与速度・相互作用・重複投薬・配合変化・配合禁忌の確認、効果と副作用の状況" aria-label="薬学的管理指導の内容" className={area} />
      <textarea value={form.teaching} onChange={(e) => set({ teaching: e.target.value })} rows={2} placeholder="患者への指導と、患者からの相談事項" aria-label="患者への指導・相談事項" className={area} />

      <div className="rounded-md border border-rule-soft px-3 py-2">
        <label className="flex items-center gap-1 text-xs font-bold">
          <input type="checkbox" className="accent-shu" checked={!!form.narcotic} onChange={() => set({ narcotic: form.narcotic ? undefined : { status: "", teaching: "", other: "" } })} />
          麻薬管理指導加算（麻薬の服用の注意事項などを指導した）
        </label>
        {form.narcotic && (
          <div className="mt-1.5 space-y-1.5">
            <textarea value={form.narcotic.status} onChange={(e) => set({ narcotic: { ...form.narcotic!, status: e.target.value } })} rows={2} placeholder="ア 麻薬に係る薬学的管理指導の内容（麻薬の服薬状況、疼痛緩和の状況など）" aria-label="麻薬 ア" className={area} />
            <textarea value={form.narcotic.teaching} onChange={(e) => set({ narcotic: { ...form.narcotic!, teaching: e.target.value } })} rows={2} placeholder="イ 麻薬に係る患者への指導と、患者からの相談事項" aria-label="麻薬 イ" className={area} />
            <input value={form.narcotic.other} onChange={(e) => set({ narcotic: { ...form.narcotic!, other: e.target.value } })} placeholder="ウ その他麻薬に係る事項" aria-label="麻薬 ウ" className={area} />
          </div>
        )}
      </div>

      {notes.map((n) => (
        <p key={n} className="text-xs text-yamabuki">
          確認　{n}
        </p>
      ))}
      {warn && <p className="text-xs font-bold text-yamabuki">確認　{warn} 記録は残りますが、算定には入りません。</p>}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={problems.length > 0 || !facts}
          onClick={() => {
            onRecord(patientId, { kind: form.kind, text: shidoText(form, facts!, fmtDay), ...(form.narcotic ? { mayaku: true } : {}) });
            setForm(EMPTY_FORM);
          }}
          className="rounded bg-ai px-3 py-1.5 font-bold text-white disabled:opacity-40"
        >
          記録する
        </button>
        {problems.length > 0 && <span className="text-xs text-ink-soft">まだ：{problems.join("・")}</span>}
        <span className="hint text-xs text-ink-faint">記録はカルテに薬剤師の記事として入り（医師が要点を読める）、その日の薬剤管理指導料（週1回・月4回まで。週は日曜〜土曜）と、麻薬管理指導加算を選んだときはその加算が算定の画面に入ります。</span>
      </div>
      {recs.length > 0 && (
        <ul className="space-y-1.5 border-t border-rule-soft pt-2 text-xs">
          {recs.map((r, i) => (
            <li key={i} className="whitespace-pre-wrap">
              <b>
                {formatShort(addDays(today, r.day))} {r.at}　区分{r.kind}
                {r.mayaku ? "・麻薬管理指導加算" : ""}
              </b>
              {"\n"}
              {displayText(r.text)}
            </li>
          ))}
        </ul>
      )}
      <p className="hint text-[11px] text-ink-faint">
        出典：
        <a href={SHIDO_SOURCE.url} target="_blank" rel="noreferrer" className="underline">
          {SHIDO_SOURCE.label}
        </a>
        。「1」の対象の薬は、電子添文の薬効分類で当てはめたもの。
      </p>
    </section>
  );
}
