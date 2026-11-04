"use client";

import { ClipboardList } from "lucide-react";
import { useState } from "react";
import {
  ADL_RANKS,
  DELIRIUM_MEASURES,
  DELIRIUM_RISKS,
  DISCHARGE_FACTORS,
  FALL_RISKS,
  PRESSURE_ITEMS,
  PRESSURE_TARGET_RANKS,
  duesOf,
  nutritionChanges,
  nutritionVersions,
  pressurePlanNeeded,
  pressureTarget,
  reviseNutrition,
  revisionProblems,
  suggestions,
  type AdlRank,
  type AdmitEval,
  type Due,
  type ItemKey,
  type NutritionFields,
  type NutritionRecord,
  type PlanRecord,
  type PressureRecord,
} from "@/lib/admit-eval";
import { addDays, formatShort, hospitalDay, type CalendarDate } from "@/lib/dates";
import type { Action } from "@/lib/roles";
import type { EvalHints } from "@/lib/anamnesis";
import type { WorkPatient } from "@/lib/worksheet";
import { PatientAvatar } from "./PatientAvatar";
import { DenyNote, useDeny, useMe } from "./RoleContext";

interface Props {
  people: WorkPatient[];
  evals: Record<string, AdmitEval>;
  today: CalendarDate;
  nowTime: string;
  onSave: (e: AdmitEval, what: string) => void;
  /** Candidates from 入院時の情報収集 (anamnesis.ts), by patient id; the nurse confirms each one. */
  hints?: Record<string, EvalHints>;
}

const COLUMNS: { key: ItemKey; short: string; action: Action }[] = [
  { key: "plan", short: "入院診療計画書", action: "plan" },
  { key: "nutrition", short: "栄養管理計画", action: "assess.nutrition" },
  { key: "reassess", short: "栄養の再評価", action: "assess.nutrition" },
  { key: "pressure", short: "褥瘡", action: "assess.nursing" },
  { key: "fall", short: "転倒・転落", action: "assess.nursing" },
  { key: "delirium", short: "せん妄", action: "assess.nursing" },
  { key: "discharge", short: "退院困難の抽出", action: "assess.discharge" },
  { key: "talk", short: "話合い・計画", action: "assess.discharge" },
  { key: "conference", short: "カンファレンス", action: "assess.discharge" },
];

const STATE_STYLE: Record<Due["state"], string> = {
  済: "border-wakatake/40 bg-wakatake-soft text-wakatake",
  期限内: "border-rule bg-sheet text-ink-soft",
  今日まで: "border-yamabuki bg-yamabuki-soft text-yamabuki font-bold",
  期限切れ: "border-shu bg-shu-soft text-shu font-bold",
  不要: "border-transparent text-ink-faint",
};

/** 入院時の評価: what each patient still needs after admission, with the deadline, by job. */
export function AdmitEvalView({ people, evals, today, nowTime, onSave, hints = {} }: Props) {
  const deny = useDeny();
  const [sel, setSel] = useState<{ pid: string; key: ItemKey } | null>(null);
  const day = (d: number) => formatShort(addDays(today, d)).replace(/（.）/, "");
  const selected = sel ? people.find((x) => x.patient.id === sel.pid) : undefined;
  return (
    <div className="scroll-thin min-h-0 flex-1 overflow-y-auto bg-paper p-4 text-[13px]">
      <header className="mb-2 flex flex-wrap items-baseline gap-2">
        <h2 className="flex items-center gap-1.5 text-base font-bold">
          <ClipboardList size={17} />
          入院時の評価（令和8年度の要件）
        </h2>
        <span className="hint text-xs text-ink-soft">期限は入院日を1日目として、コードで数えます。書くのは各職種、AI は使いません。</span>
      </header>
      <table className="w-full border-collapse text-[12px]">
        <thead>
          <tr className="border-b border-rule text-left text-ink-soft">
            <th className="py-1 pr-2 font-normal">患者</th>
            {COLUMNS.map((c) => (
              <th key={c.key} className={`px-1 py-1 font-normal ${deny(c.action) ? "" : "font-bold text-ink"}`} title={deny(c.action) ?? "あなたの職種が書く項目"}>
                {c.short}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {people.map((w) => {
            const ev = evals[w.patient.id] ?? { patientId: w.patient.id };
            const dues = duesOf(ev, w.patient.admittedOn);
            return (
              <tr key={w.patient.id} className="border-b border-rule-soft align-top">
                <td className="py-1.5 pr-2">
                  <div className="flex items-center gap-1.5">
                    <PatientAvatar sex={w.patient.sex} age={w.patient.age} size={24} className="rounded-full" />
                    <div>
                      <span className="nums text-ink-faint">{w.room}</span> <b>{w.patient.name}</b>
                      <div className="nums text-[11px] text-ink-faint">
                        入院{hospitalDay(w.patient.admittedOn, 0)}日目{ev.emergency ? "・緊急入院" : ""}
                      </div>
                    </div>
                  </div>
                </td>
                {COLUMNS.map((c) => {
                  const d = dues.find((x) => x.key === c.key)!;
                  const on = sel?.pid === w.patient.id && sel.key === c.key;
                  return (
                    <td key={c.key} className="px-1 py-1.5">
                      <button
                        type="button"
                        onClick={() => setSel(on ? null : { pid: w.patient.id, key: c.key })}
                        title={[d.note, d.source].filter(Boolean).join("\n")}
                        className={`w-full rounded border px-1 py-0.5 text-left leading-tight ${STATE_STYLE[d.state]} ${on ? "ring-2 ring-ai" : ""}`}
                      >
                        <span className="block">{d.state}</span>
                        <span className="nums block text-[10px] font-normal">
                          {d.state === "済" ? day(d.doneOn!) : d.dueOn === null ? "" : `期限 ${day(d.dueOn)}`}
                        </span>
                      </button>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>

      {sel && selected && (
        <Detail
          key={`${sel.pid}-${sel.key}`}
          w={selected}
          ev={evals[sel.pid] ?? { patientId: sel.pid }}
          item={sel.key}
          today={today}
          nowTime={nowTime}
          onSave={onSave}
          hints={hints[sel.pid]}
        />
      )}
      {!sel && <p className="hint mt-3 text-xs text-ink-faint">表の枠を押すと、その項目を書く欄が出ます。太字の列が、いまの職種が書く項目です。</p>}
    </div>
  );
}

function Detail({ w, ev, item, today, nowTime, onSave, hints }: { w: WorkPatient; ev: AdmitEval; item: ItemKey; today: CalendarDate; nowTime: string; onSave: (e: AdmitEval, what: string) => void; hints?: EvalHints }) {
  const col = COLUMNS.find((c) => c.key === item)!;
  const due = duesOf(ev, w.patient.admittedOn).find((d) => d.key === item)!;
  const locked = !!useDeny()(col.action);
  return (
    <section className="mt-4 rounded-lg border border-rule bg-sheet p-4">
      <h3 className="mb-1 font-bold">
        {w.room} {w.patient.name}さん：{due.label}
      </h3>
      <p className="hint mb-2 text-[11px] text-ink-faint">根拠：{due.source}</p>
      {due.note && <p className="mb-2 text-xs text-yamabuki">{due.note}</p>}
      <DenyNote action={col.action} className="mb-2" />
      <fieldset disabled={locked} className="m-0 min-w-0 border-0 p-0">
        {item === "plan" && <PlanForm w={w} ev={ev} today={today} nowTime={nowTime} onSave={onSave} />}
        {(item === "nutrition" || item === "reassess") && <NutritionForm w={w} ev={ev} today={today} nowTime={nowTime} onSave={onSave} start={item === "reassess" ? "再評価" : null} />}
        {item === "pressure" && <PressureForm ev={ev} nowTime={nowTime} onSave={onSave} adl={hints?.adl} />}
        {item === "fall" && <ChecklistForm kind="fall" ev={ev} nowTime={nowTime} onSave={onSave} suggested={hints?.fall ?? []} why={hints?.why} />}
        {item === "delirium" && <ChecklistForm kind="delirium" ev={ev} nowTime={nowTime} onSave={onSave} suggested={[...new Set([...suggestions(w.patient, !!ev.emergency).delirium, ...(hints?.delirium ?? [])])]} why={hints?.why} />}
        {(item === "discharge" || item === "talk" || item === "conference") && <DischargeForm w={w} ev={ev} nowTime={nowTime} today={today} onSave={onSave} hints={hints} />}
        {!hints && (item === "pressure" || item === "fall" || item === "delirium" || item === "discharge") && <p className="hint mt-2 text-[11px] text-ink-faint">入院時の情報収集（右端のツール「情報収集」）を書くと、答えから当てはまりそうな項目がここに候補として入ります。</p>}
      </fieldset>
    </section>
  );
}

const input = "rounded border border-rule bg-sheet px-1.5 py-0.5 text-ink";

function PlanForm({ w, ev, today, nowTime, onSave }: { w: WorkPatient; ev: AdmitEval; today: CalendarDate; nowTime: string; onSave: (e: AdmitEval, what: string) => void }) {
  const me = useMe();
  const [f, setF] = useState<Omit<PlanRecord, "explainedBy" | "explainedAt">>(
    ev.plan ?? { days: 14, symptoms: "", treatment: "", tests: "", surgery: "なし", other: "", nutritionNeeded: "無", explainedTo: "本人" },
  );
  const done = !!ev.plan;
  const text = (k: "symptoms" | "treatment" | "tests" | "surgery" | "other", label: string) => (
    <label className="block text-xs text-ink-soft">
      {label}
      <textarea value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} readOnly={done} rows={2} className={`mt-0.5 w-full ${input} text-[13px]`} />
    </label>
  );
  return (
    <div className="grid grid-cols-2 gap-2">
      <div className="col-span-2 text-xs text-ink-soft">
        病名：{w.patient.admissionDiagnosis}（病名の欄から）　病棟：5階東 {w.room}　主治医：{w.patient.attending}
      </div>
      {text("symptoms", "症状")}
      {text("treatment", "治療計画")}
      {text("tests", "検査内容及び日程")}
      {text("surgery", "手術内容及び日程")}
      {text("other", "その他（看護計画、リハビリテーション等の計画）")}
      <div className="space-y-1.5 text-xs text-ink-soft">
        <label className="flex items-center gap-1">
          推定される入院期間
          <input type="number" min={1} value={f.days} readOnly={done} onChange={(e) => setF({ ...f, days: Number(e.target.value) })} className={`w-16 ${input}`} />日
        </label>
        <div className="flex items-center gap-2">
          特別な栄養管理の必要性
          {(["有", "無"] as const).map((v) => (
            <label key={v} className="flex items-center gap-0.5">
              <input type="radio" disabled={done} checked={f.nutritionNeeded === v} onChange={() => setF({ ...f, nutritionNeeded: v })} className="accent-ai" />
              {v}
            </label>
          ))}
          <span className="text-ink-faint">（医師・看護師・管理栄養士で確かめる）</span>
        </div>
        <label className="flex items-center gap-1">
          説明した相手
          <input value={f.explainedTo} readOnly={done} onChange={(e) => setF({ ...f, explainedTo: e.target.value })} className={`w-32 ${input}`} />
        </label>
      </div>
      <div className="col-span-2 flex items-center gap-2">
        <span className="text-[11px] text-ink-faint">令和8年度から署名は要りません。説明した日と説明した人を記録し、文書を渡します。</span>
        {done ? (
          <span className="ml-auto text-xs font-bold text-wakatake">
            {formatShort(addDays(today, ev.plan!.explainedAt.day))} {ev.plan!.explainedAt.time} {ev.plan!.explainedBy} が {ev.plan!.explainedTo} に説明して渡しました
          </span>
        ) : (
          <button
            type="button"
            disabled={!f.symptoms.trim() || !f.treatment.trim() || !f.explainedTo.trim()}
            onClick={() => onSave({ ...ev, plan: { ...f, explainedBy: me.name, explainedAt: { day: 0, time: nowTime } } }, `入院診療計画書（説明・交付、特別な栄養管理 ${f.nutritionNeeded}）`)}
            className="ml-auto rounded bg-ai px-3 py-1 text-xs font-bold text-white disabled:opacity-40"
          >
            説明して渡した（{me.name}・{nowTime}）
          </button>
        )}
      </div>
    </div>
  );
}

type Revise = "再評価" | "訂正";
const fieldsOf = (r: NutritionRecord): NutritionFields => ({ goal: r.goal, energyKcal: r.energyKcal, proteinG: r.proteinG, route: r.route, counseling: r.counseling, reassessOn: r.reassessOn });

/**
 * 栄養管理計画書: made once, then never overwritten. 「再評価した」 and 「訂正する」 add a version (who, when,
 * why); the earlier versions stay below with what changed.
 */
function NutritionForm({ w, ev, today, nowTime, onSave, start }: { w: WorkPatient; ev: AdmitEval; today: CalendarDate; nowTime: string; onSave: (e: AdmitEval, what: string) => void; start: Revise | null }) {
  const me = useMe();
  const p = w.patient;
  const bmi = p.weightKg / (p.heightCm / 100) ** 2;
  const cur = ev.nutrition;
  const blank: NutritionFields = { goal: "", energyKcal: 0, proteinG: 0, route: "経口", counseling: "", reassessOn: 7 };
  // A reassessment starts from the version in force, with the next date at the same interval as before (7 days if none).
  const startFields = (k: Revise | null): NutritionFields => {
    if (!cur) return blank;
    const gap = cur.reassessOn - cur.at.day;
    return k === "再評価" ? { ...fieldsOf(cur), reassessOn: gap > 0 ? gap : 7 } : fieldsOf(cur);
  };
  const [mode, setMode] = useState<Revise | null>(cur ? start : null);
  const [f, setF] = useState<NutritionFields>(() => startFields(cur ? start : null));
  const [reason, setReason] = useState("");
  const done = !!cur && mode === null;
  const day = (d: number) => formatShort(addDays(today, d)).replace(/（.）/, "");
  if (ev.plan?.nutritionNeeded === "無") return <p className="text-xs text-ink-soft">入院診療計画書で「特別な栄養管理の必要性：無」なので、栄養管理計画書は要りません。</p>;
  const versions = cur ? nutritionVersions(cur) : [];
  const problems = mode ? revisionProblems(f, { kind: mode, reason }, cur ? fieldsOf(cur) : undefined) : [];
  const changes = cur && mode ? nutritionChanges(fieldsOf(cur), f, day) : [];
  const begin = (k: Revise) => {
    setMode(k);
    setF(startFields(k));
    setReason("");
  };
  return (
    <div className="space-y-2 text-xs text-ink-soft">
      <p className="nums">
        身長 {p.heightCm} cm・体重 {p.weightKg} kg・BMI {bmi.toFixed(1)}<span className="hint">（コードで計算）</span>　{p.dietNow ? `いまの食事：${p.dietNow}` : ""}
      </p>
      {cur && (
        <p className="nums text-ink">
          {mode ? `第${versions.length}版をもとに直しています` : `いまの版：第${versions.length}版`}（{day(cur.at.day)} {cur.at.time} {cur.by}
          {cur.revision ? `・${cur.revision.kind}` : "・作成"}）
        </p>
      )}
      <label className="block">
        目標
        <input value={f.goal} readOnly={done} onChange={(e) => setF({ ...f, goal: e.target.value })} className={`mt-0.5 w-full ${input}`} />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-1">
          エネルギー
          <input type="number" value={f.energyKcal || ""} readOnly={done} onChange={(e) => setF({ ...f, energyKcal: Number(e.target.value) })} className={`w-20 ${input}`} />
          kcal
        </label>
        <label className="flex items-center gap-1">
          たんぱく質
          <input type="number" value={f.proteinG || ""} readOnly={done} onChange={(e) => setF({ ...f, proteinG: Number(e.target.value) })} className={`w-16 ${input}`} />g
        </label>
        <span className="flex items-center gap-1">
          栄養補給方法
          {(["経口", "経腸栄養", "静脈栄養"] as const).map((v) => (
            <label key={v} className="flex items-center gap-0.5">
              <input type="radio" disabled={done} checked={f.route === v} onChange={() => setF({ ...f, route: v })} className="accent-ai" />
              {v}
            </label>
          ))}
        </span>
        {done ? (
          <span className={`nums ${cur!.reassessOn <= 0 ? "font-bold text-shu" : ""}`}>
            再評価の日 {day(cur!.reassessOn)}
            {cur!.reassessOn < 0 ? "（過ぎています）" : cur!.reassessOn === 0 ? "（今日）" : `（${cur!.reassessOn}日後）`}
          </span>
        ) : (
          <label className="flex items-center gap-1">
            {mode === "再評価" ? "次の再評価" : "再評価"}
            <input type="number" min={1} value={f.reassessOn} onChange={(e) => setF({ ...f, reassessOn: Number(e.target.value) })} className={`w-12 ${input}`} />
            日後<span className="nums text-ink-faint">（{day(f.reassessOn)}）</span>
          </label>
        )}
      </div>
      <label className="block">
        栄養食事相談（入院時・退院時の指導の予定など）
        <input value={f.counseling} readOnly={done} onChange={(e) => setF({ ...f, counseling: e.target.value })} className={`mt-0.5 w-full ${input}`} />
      </label>
      {mode && (
        <div className="space-y-1 rounded border border-ai/40 bg-ai-soft p-2 text-ink">
          <div className="flex flex-wrap items-center gap-2">
            {(["再評価", "訂正"] as const).map((k) => (
              <label key={k} className="flex items-center gap-0.5">
                <input type="radio" checked={mode === k} onChange={() => begin(k)} className="accent-ai" />
                {k === "再評価" ? "再評価した" : "訂正する（書き間違いなど）"}
              </label>
            ))}
            <span className="text-ink-soft">第{versions.length + 1}版として残します。前の版は消えません。</span>
          </div>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={mode === "再評価" ? "評価の内容（例：食事量は5割、体重 −1kg）" : "訂正の理由（必須。例：たんぱく質の入れ間違い）"}
            aria-label={mode === "再評価" ? "評価の内容" : "訂正の理由"}
            className={`w-full ${input}`}
          />
          {(changes.length > 0 || mode === "再評価") && <p className="text-ink-soft">{changes.length ? `変わるところ：${changes.join("／")}` : "内容は前の版と同じです（同じ計画で再評価したことを残します）。"}</p>}
          {problems.map((m) => (
            <p key={m} className="text-shu">
              {m}
            </p>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-end gap-2">
        {!cur ? (
          <button
            type="button"
            disabled={!f.goal.trim() || !f.energyKcal || !f.proteinG}
            onClick={() => onSave({ ...ev, nutrition: { ...f, by: me.name, at: { day: 0, time: nowTime } } }, `栄養管理計画書（${f.energyKcal}kcal・たんぱく質${f.proteinG}g・${f.route}）`)}
            className="rounded bg-ai px-3 py-1 font-bold text-white disabled:opacity-40"
          >
            栄養管理計画書を作った（{me.name}）
          </button>
        ) : mode ? (
          <>
            <button type="button" onClick={() => setMode(null)} className="rounded border border-rule px-3 py-1">
              やめる
            </button>
            <button
              type="button"
              disabled={problems.length > 0}
              onClick={() => {
                onSave({ ...ev, nutrition: reviseNutrition(cur, f, me.name, { day: 0, time: nowTime }, { kind: mode, reason }) }, `栄養管理計画書 第${versions.length + 1}版（${mode}${reason.trim() ? `：${reason.trim()}` : ""}）`);
                setMode(null);
              }}
              className="rounded bg-ai px-3 py-1 font-bold text-white disabled:opacity-40"
            >
              第{versions.length + 1}版を確定（{me.name}・{nowTime}）
            </button>
          </>
        ) : (
          <>
            <button type="button" onClick={() => begin("再評価")} className="rounded bg-ai px-3 py-1 font-bold text-white">
              再評価した
            </button>
            <button type="button" onClick={() => begin("訂正")} className="rounded border border-ai px-3 py-1 text-ai">
              訂正する
            </button>
          </>
        )}
      </div>
      {versions.length > 1 && (
        <section className="rounded border border-rule-soft bg-paper p-2">
          <h4 className="mb-1 font-bold text-ink-soft">版の履歴（前の版は消えずに残ります）</h4>
          <ol className="space-y-1">
            {versions.map((v, i) => (
              <li key={i} className="nums">
                <b className="text-ink">第{i + 1}版</b> {day(v.at.day)} {v.at.time} {v.by}　{v.revision ? `${v.revision.kind}${v.revision.reason ? `：${v.revision.reason}` : ""}` : "作成"}
                {i > 0 && (
                  <span className="block pl-4 text-ink-faint">
                    {nutritionChanges(versions[i - 1], v, day).join("／") || "内容の変更なし"}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}

function PressureForm({ ev, nowTime, onSave, adl }: { ev: AdmitEval; nowTime: string; onSave: (e: AdmitEval, what: string) => void; adl?: AdlRank }) {
  const me = useMe();
  const [f, setF] = useState<Omit<PressureRecord, "by" | "at">>(ev.pressure ?? { adl: adl ?? "J1", items: {}, ulcerNow: false, plan: "" });
  const target = pressureTarget(f.adl);
  const needPlan = pressurePlanNeeded({ ...f, by: "", at: { day: 0, time: "" } });
  const complete = !target || PRESSURE_ITEMS.every((i) => f.items[i.key] !== undefined);
  const saved = ev.pressure && !(pressurePlanNeeded(ev.pressure) && !ev.pressure.plan.trim());
  return (
    <div className="space-y-2 text-xs">
      <label className="flex items-center gap-2 text-ink-soft">
        障害高齢者の日常生活自立度
        <select value={f.adl} onChange={(e) => setF({ ...f, adl: e.target.value as AdlRank })} className={input}>
          {ADL_RANKS.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
        {!ev.pressure && adl && f.adl === adl && <span className="text-ink-faint">（入院時の情報収集から）</span>}
        <span className="text-ink-faint">評価の対象：{PRESSURE_TARGET_RANKS.join("・")}（架空の病院の設定。通知にランクの線引きはありません）</span>
      </label>
      {target && (
        <ul className="grid grid-cols-2 gap-x-4 gap-y-0.5">
          {PRESSURE_ITEMS.map((i) => (
            <li key={i.key} className="flex items-center gap-2">
              <span className="flex-1">{i.label}</span>
              {[false, true].map((v) => (
                <label key={String(v)} className="flex items-center gap-0.5">
                  <input type="radio" checked={f.items[i.key] === v} onChange={() => setF({ ...f, items: { ...f.items, [i.key]: v } })} className={v ? "accent-shu" : "accent-ai"} />
                  {v ? i.yes : i.no}
                </label>
              ))}
            </li>
          ))}
        </ul>
      )}
      <label className="flex items-center gap-1">
        <input type="checkbox" checked={f.ulcerNow} onChange={(e) => setF({ ...f, ulcerNow: e.target.checked })} className="accent-shu" />
        いま褥瘡がある
      </label>
      {needPlan && (
        <label className="block text-ink-soft">
          看護計画（「できない」「あり」が1つ以上か、褥瘡がある）：圧迫・ズレ力の排除、スキンケア、栄養状態の改善、リハビリテーション
          <textarea value={f.plan} onChange={(e) => setF({ ...f, plan: e.target.value })} rows={2} className={`mt-0.5 w-full ${input} text-[13px]`} />
        </label>
      )}
      <div className="flex items-center justify-end gap-2">
        {saved && (
          <span className="text-wakatake">
            {ev.pressure!.at.time} {ev.pressure!.by} が評価済み
          </span>
        )}
        <button
          type="button"
          disabled={!complete || (needPlan && !f.plan.trim())}
          onClick={() => onSave({ ...ev, pressure: { ...f, by: me.name, at: { day: 0, time: nowTime } } }, `褥瘡の危険因子（自立度 ${f.adl}${needPlan ? "・看護計画あり" : ""}）`)}
          className="rounded bg-ai px-3 py-1 font-bold text-white disabled:opacity-40"
        >
          評価を確定（{me.name}）
        </button>
      </div>
    </div>
  );
}

function ChecklistForm({ kind, ev, nowTime, onSave, suggested, why = {} }: { kind: "fall" | "delirium"; ev: AdmitEval; nowTime: string; onSave: (e: AdmitEval, what: string) => void; suggested: string[]; why?: Record<string, string> }) {
  const me = useMe();
  const rec = ev[kind];
  const [checked, setChecked] = useState<string[]>(rec?.checked ?? suggested);
  const [measures, setMeasures] = useState<string[]>(rec?.measures ?? []);
  const [plan, setPlan] = useState(rec?.plan ?? "");
  const risks: readonly string[] = kind === "fall" ? FALL_RISKS : DELIRIUM_RISKS;
  const toggle = (list: string[], set: (x: string[]) => void, v: string) => set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const needMeasures = kind === "delirium" && checked.length > 0;
  return (
    <div className="space-y-2 text-xs">
      <h4 className="font-bold text-ink-soft">{kind === "fall" ? "転倒・転落のリスク（あてはまるもの）" : "1. せん妄のリスク因子の確認"}</h4>
      <ul className="grid grid-cols-2 gap-x-4 gap-y-0.5">
        {risks.map((r) => (
          <li key={r}>
            <label className="flex items-center gap-1">
              <input type="checkbox" checked={checked.includes(r)} onChange={() => toggle(checked, setChecked, r)} className="accent-shu" />
              {r}
              {suggested.includes(r) && <span className="text-ink-faint">（{why[r] ?? "年齢からコードで"}）</span>}
            </label>
          </li>
        ))}
      </ul>
      {needMeasures && (
        <>
          <h4 className="font-bold text-ink-soft">2. ハイリスク患者に対するせん妄対策（実施するもの）</h4>
          <ul className="grid grid-cols-2 gap-x-4 gap-y-0.5">
            {DELIRIUM_MEASURES.map((m) => (
              <li key={m}>
                <label className="flex items-center gap-1">
                  <input type="checkbox" checked={measures.includes(m)} onChange={() => toggle(measures, setMeasures, m)} className="accent-ai" />
                  {m}
                </label>
              </li>
            ))}
          </ul>
          <p className="text-ink-faint">3. 対策のあとも、定期的にせん妄の有無を確かめます。</p>
        </>
      )}
      {kind === "fall" && checked.length > 0 && (
        <label className="block text-ink-soft">
          対策<span className="hint">（院内の取り決めで、危険度の点数は付けません）</span>
          <textarea value={plan} onChange={(e) => setPlan(e.target.value)} rows={2} className={`mt-0.5 w-full ${input} text-[13px]`} />
        </label>
      )}
      <div className="flex items-center justify-end gap-2">
        {rec && (
          <span className="text-wakatake">
            {rec.at.time} {rec.by} が確定
          </span>
        )}
        <button
          type="button"
          disabled={(needMeasures && measures.length === 0) || (kind === "fall" && checked.length > 0 && !plan.trim())}
          onClick={() =>
            onSave(
              { ...ev, [kind]: { checked, measures: needMeasures ? measures : [], plan: plan.trim() || undefined, by: me.name, at: { day: 0, time: nowTime } } },
              kind === "fall" ? `転倒・転落（リスク ${checked.length}項目）` : `せん妄（リスク因子 ${checked.length}・対策 ${needMeasures ? measures.length : 0}）`,
            )
          }
          className="rounded bg-ai px-3 py-1 font-bold text-white disabled:opacity-40"
        >
          確定（{me.name}）
        </button>
      </div>
    </div>
  );
}

function DischargeForm({ w, ev, nowTime, today, onSave, hints }: { w: WorkPatient; ev: AdmitEval; nowTime: string; today: CalendarDate; onSave: (e: AdmitEval, what: string) => void; hints?: EvalHints }) {
  const when = (a: { day: number; time: string }) => `${a.day === 0 ? "今日" : formatShort(addDays(today, a.day)).replace(/（.）/, "")} ${a.time}`;
  const me = useMe();
  const fromCode = suggestions(w.patient, !!ev.emergency).discharge;
  const sug = [...new Set([...fromCode, ...(hints?.discharge ?? [])])];
  const ds = ev.discharge;
  const [factors, setFactors] = useState<string[]>(ds?.factors ?? sug);
  const [note, setNote] = useState(ds?.note ?? "");
  const now = { day: 0, time: nowTime, by: me.name };
  const step = (label: string, field: "talkedAt" | "planStartedAt" | "conferenceAt") =>
    ds?.[field] ? (
      <span className="text-wakatake">
        {label}：済（{when(ds[field]!)}
        {ds[field]!.by ? ` ${ds[field]!.by}` : ""}）
      </span>
    ) : (
      <button type="button" disabled={!ds || ds.factors.length === 0} onClick={() => onSave({ ...ev, discharge: { ...ds!, [field]: now } }, `退院支援：${label}`)} className="rounded border border-ai px-2 py-0.5 text-ai disabled:opacity-40">
        {label}をした（{nowTime}）
      </button>
    );
  return (
    <div className="space-y-2 text-xs">
      <h4 className="font-bold text-ink-soft">退院困難な要因（ア〜チ）</h4>
      <ul className="grid grid-cols-2 gap-x-4 gap-y-0.5">
        {DISCHARGE_FACTORS.map((f) => (
          <li key={f.key}>
            <label className="flex items-start gap-1">
              <input type="checkbox" disabled={!!ds} checked={factors.includes(f.key)} onChange={() => setFactors(factors.includes(f.key) ? factors.filter((x) => x !== f.key) : [...factors, f.key])} className="mt-0.5 accent-shu" />
              <span>
                {f.key} {f.label}
                {sug.includes(f.key) && <span className="text-ink-faint">（{[fromCode.includes(f.key) && `${f.key === "イ" ? "入院の経路" : "入院時の病名"}からコードで`, hints?.why[f.key]].filter(Boolean).join("・")}）</span>}
              </span>
            </label>
          </li>
        ))}
      </ul>
      <label className="block text-ink-soft">
        メモ
        <input value={note} readOnly={!!ds} onChange={(e) => setNote(e.target.value)} className={`mt-0.5 w-full ${input}`} />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        {ds ? (
          <span className="text-wakatake">
            抽出：済（{when(ds.extractedAt)} {ds.extractedBy}）{ds.factors.length ? `　要因 ${ds.factors.join("・")}` : "　要因なし"}
          </span>
        ) : (
          <button
            type="button"
            onClick={() => onSave({ ...ev, discharge: { factors, note: note.trim(), extractedBy: me.name, extractedAt: now } }, `退院困難な要因の抽出（${factors.length ? factors.join("・") : "なし"}）`)}
            className="rounded bg-ai px-3 py-1 font-bold text-white"
          >
            抽出を確定（{me.name}）
          </button>
        )}
        {ds && ds.factors.length > 0 && (
          <>
            {step("患者・家族との話合い", "talkedAt")}
            {step("退院支援計画の着手", "planStartedAt")}
            {step("カンファレンス", "conferenceAt")}
          </>
        )}
      </div>
      <p className="text-ink-faint">要件を期限内に満たすと、退院の日に入退院支援加算１（一般病棟入院基本料等の場合 700点）が算定に入ります。</p>
    </div>
  );
}
