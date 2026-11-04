"use client";

// 入院時の情報収集（アナムネーシス）: the nurse's admission interview. Saved as versions (an update needs a
// reason); what is answered flows on to the patient profile (介助), 入院時の評価 (as candidates the nurse
// confirms there) and the 看護サマリ.

import { useState } from "react";
import { DISCHARGE_FACTORS } from "@/lib/admit-eval";
import { ANAMNESIS_SECTIONS, ANAMNESIS_SOURCES, anamnesisChanges, anamnesisProblems, anamnesisVersions, answered, careToProfile, emptyAnamnesis, evalHints, type AnamnesisField, type AnamnesisFields, type AnamnesisRecord } from "@/lib/anamnesis";
import { CARE_CHOICES, CARE_KEYS, type CareKey } from "@/lib/profile";
import type { Patient } from "@/lib/types";
import { DenyNote, useDeny, useMe } from "../RoleContext";

const input = "w-full rounded border border-rule bg-sheet px-1.5 py-0.5 text-[13px] outline-none focus:border-ai";
const chip = (on: boolean) => `rounded-md border px-2 py-0.5 text-[12px] pointer-coarse:py-1.5 ${on ? "border-wakatake bg-wakatake font-bold text-white" : "border-rule bg-sheet text-ink-soft hover:text-ink"}`;

export function AnamnesisPanel({ patient, record, care, fmtDay, onSave }: { patient: Patient; record?: AnamnesisRecord; care: Partial<Record<CareKey, { value: string }>>; fmtDay: (d: number) => string; onSave: (fields: AnamnesisFields, reason: string) => void }) {
  const me = useMe();
  const locked = !!useDeny()("anamnesis");
  // The help already in the profile is the starting answer (not asked again).
  const [f, setF] = useState<AnamnesisFields>(() => record?.fields ?? { ...emptyAnamnesis(), care: Object.fromEntries(CARE_KEYS.flatMap((k) => (care[k] ? [[k, care[k]!.value]] : []))) });
  const [reason, setReason] = useState("");
  const problems = anamnesisProblems(record, f, reason);
  const hints = evalHints(f);
  const toProfile = careToProfile(f, care);
  const count = answered(f);
  const when = (at: { day: number; time: string }) => `${at.day === 0 ? "今日" : fmtDay(at.day)} ${at.time}`;
  const versions = record ? anamnesisVersions(record) : [];

  const field = (x: AnamnesisField) => {
    if (x.type === "care")
      return (
        <div className="space-y-1">
          {CARE_KEYS.map((k) => (
            <div key={k} className="flex flex-wrap items-center gap-1">
              <span className="w-10 shrink-0 text-[12px] text-ink-soft">{k}</span>
              {CARE_CHOICES[k].map((v) => (
                <button key={v} type="button" aria-pressed={f.care[k] === v} onClick={() => setF({ ...f, care: { ...f.care, [k]: f.care[k] === v ? undefined : v } })} className={chip(f.care[k] === v)}>
                  {v}
                </button>
              ))}
            </div>
          ))}
        </div>
      );
    if (x.type === "one")
      return (
        <div role="radiogroup" aria-label={x.label} className="flex flex-wrap gap-1">
          {x.options.map((o) => (
            <button key={o} type="button" role="radio" aria-checked={f[x.key] === o} onClick={() => setF({ ...f, [x.key]: f[x.key] === o ? "" : o })} className={chip(f[x.key] === o)}>
              {o}
            </button>
          ))}
        </div>
      );
    if (x.type === "many")
      return (
        <div role="group" aria-label={x.label} className="flex flex-wrap gap-1">
          {x.options.map((o) => {
            const on = f[x.key].includes(o);
            return (
              <button key={o} type="button" aria-pressed={on} onClick={() => setF({ ...f, [x.key]: on ? f[x.key].filter((y) => y !== o) : [...f[x.key], o] })} className={chip(on)}>
                {o}
              </button>
            );
          })}
        </div>
      );
    return x.type === "long" ? (
      <textarea value={f[x.key]} onChange={(e) => setF({ ...f, [x.key]: e.target.value })} rows={2} aria-label={x.label} placeholder={x.placeholder} className={`${input} resize-y`} />
    ) : (
      <input value={f[x.key]} onChange={(e) => setF({ ...f, [x.key]: e.target.value })} aria-label={x.label} placeholder={x.placeholder} className={input} />
    );
  };

  return (
    <div className="space-y-3 text-[13px]">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className={`rounded border px-1.5 py-0.5 text-xs ${record ? "border-wakatake/40 bg-wakatake-soft text-wakatake" : "border-yamabuki/40 bg-yamabuki-soft text-yamabuki"}`}>{record ? `第${versions.length}版　${when(record.at)} ${record.by}` : "まだ聞き取っていません"}</span>
        <span className="nums text-xs text-ink-faint">
          答えた項目 {count.done}／{count.all}
        </span>
      </div>
      <p className="hint text-xs text-ink-soft">入院のときに本人・家族から聞いて書きます。保存すると、介助は患者プロファイルに、当てはまりそうな項目は「入院時の評価」の候補に、生活の様子は看護サマリに入ります（もう一度打たなくてよいように）。</p>
      <p className="text-xs text-ink-soft">
        アレルギー・感染症・禁忌は患者プロファイルで登録します（いま：アレルギー {patient.allergies.join("、") || "なし"}・感染症 {patient.infections.join("、") || "なし"}
        {patient.contraindications?.length ? `・禁忌 ${patient.contraindications.join("、")}` : ""}）。
      </p>
      <DenyNote action="anamnesis" />

      <fieldset disabled={locked} className="m-0 min-w-0 space-y-3 border-0 p-0">
        {ANAMNESIS_SECTIONS.map((s) => (
          <section key={s.title} className="rounded-lg border border-rule bg-paper/50 p-2.5">
            <h3 className="mb-1.5 text-sm font-bold">{s.title}</h3>
            <div className="space-y-1.5">
              {s.fields.map((x) => (
                <div key={x.key} className="grid grid-cols-[9rem_1fr] items-start gap-2">
                  <span className="pt-0.5 text-[12px] text-ink-soft">{x.label}</span>
                  {field(x)}
                </div>
              ))}
            </div>
          </section>
        ))}

        <section className="rounded-lg border border-ai/30 bg-ai-soft/30 p-2.5 text-[12px]">
          <h3 className="mb-1 text-sm font-bold text-ai">保存すると入るところ</h3>
          <ul className="space-y-0.5">
            <li>患者プロファイルの介助：{toProfile.length ? toProfile.map((c) => (c.kind === "care" ? `${c.key} ${c.value}` : "")).join("・") : "変わるところはありません"}</li>
            <li>
              入院時の評価（候補。評価のところで看護師が確かめて確定します）：
              {[
                hints.adl && `褥瘡 自立度 ${hints.adl}`,
                hints.fall.length > 0 && `転倒・転落 ${hints.fall.join("・")}`,
                hints.delirium.length > 0 && `せん妄 ${hints.delirium.join("・")}`,
                hints.discharge.length > 0 && `退院困難な要因 ${hints.discharge.map((k) => `${k}（${DISCHARGE_FACTORS.find((x) => x.key === k)?.label}）`).join("・")}`,
              ]
                .filter(Boolean)
                .join("／") || "なし"}
            </li>
            <li>看護サマリ・連携サマリの「入院前の生活」</li>
          </ul>
        </section>

        {record && (
          <label className="flex items-center gap-2 text-[12px]">
            <span className="shrink-0 text-ink-soft">更新の理由</span>
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="例：家族から聞き直した" aria-label="更新の理由" className={input} />
          </label>
        )}
        <div className="flex items-center gap-2">
          {problems.length > 0 && <span className="text-[11px] text-yamabuki">{problems.join(" ")}</span>}
          <button type="button" disabled={problems.length > 0} onClick={() => (onSave(f, reason), setReason(""))} className="ml-auto rounded-md bg-wakatake px-3 py-1 text-xs font-bold text-white disabled:opacity-40">
            {record ? "更新を保存" : "保存"}（{me.name}）
          </button>
        </div>
      </fieldset>

      {versions.length > 0 && (
        <section>
          <h3 className="mb-1 text-sm font-bold">版の履歴</h3>
          <ol className="space-y-1 border-l-2 border-rule pl-2 text-[12px]">
            {versions.map((v, i) => (
              <li key={i}>
                <span className="nums text-ink-faint">
                  第{i + 1}版　{when(v.at)} {v.by}
                  {v.reason ? `　理由：${v.reason}` : i === 0 ? "　（最初の聞き取り）" : ""}
                </span>
                {i > 0 && (
                  <ul className="text-ink-soft">
                    {anamnesisChanges(versions[i - 1].fields, v.fields).map((c) => (
                      <li key={c}>・{c}</li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}

      <p className="hint text-[10px] text-ink-faint">
        聞く項目の並びと選択肢は架空の病院の様式です。項目の根拠：
        {ANAMNESIS_SOURCES.map((s, i) => (
          <a key={s.url} href={s.url} target="_blank" rel="noreferrer" className="underline">
            {i > 0 ? "、" : ""}
            {s.name}
          </a>
        ))}
        。障害高齢者の日常生活自立度と、転倒・転落・せん妄・退院困難な要因の項目は「入院時の評価」と同じもの（出典はそちら）。
      </p>
    </div>
  );
}
