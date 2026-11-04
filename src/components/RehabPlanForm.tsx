"use client";

// リハビリテーション実施計画書（別紙様式21 の主な欄）: the doctor makes it (with the therapists); the doctor, or a
// nurse or therapist the doctor asks, explains it and records the date and the person (no signature needed).

import { useState } from "react";
import { auditLog } from "@/lib/audit";
import { biTotal } from "@/lib/barthel";
import { BASIC_ITEMS, BODY_ITEMS, categoryOf, DISCIPLINE_NAME, PLAN_NOTE, planProblems, planState, type BasicLevel, type Discipline, type RehabDesk, type RehabPlan, type RehabRx } from "@/lib/rehab";
import { useDeny, useMe } from "./RoleContext";

const field = "rounded border border-rule bg-paper px-1.5 py-0.5 outline-none focus:border-ai";
const LEVELS: BasicLevel[] = ["自立", "一部介助", "介助", "非実施"];

type Draft = Omit<RehabPlan, "id" | "madeBy" | "explained">;

function draftOf(rx: RehabRx, desk: RehabDesk, prev: RehabPlan | null, startDay: number): Draft {
  if (prev) {
    const { id, madeBy, explained, ...rest } = prev;
    void madeBy;
    void explained;
    return { ...rest, replaces: id };
  }
  const bi = desk.bi.filter((b) => b.patientId === rx.patientId).sort((a, b) => a.day - b.day);
  return {
    orderId: rx.orderId,
    patientId: rx.patientId,
    diagnosis: "",
    treatment: "",
    onsetDay: rx.order.onset,
    startDay,
    comorbidities: "",
    risks: rx.order.cautions,
    contraindications: "",
    body: {},
    basic: {},
    biStartId: bi[0]?.id,
    biNowId: bi.at(-1)?.id,
    social: "",
    goalMonth: "",
    goalEnd: rx.order.goal,
    policy: "",
    content: {},
    staff: [],
  };
}

export function RehabPlanForm({ rx, desk, onDesk, nowTime, fmtDay, today = 0 }: { rx: RehabRx; desk: RehabDesk; onDesk: (f: (d: RehabDesk) => RehabDesk) => void; nowTime: string; fmtDay: (d: number) => string; today?: number }) {
  const me = useMe();
  const denyPlan = useDeny()("rehab.plan");
  const denyExplain = useDeny()("rehab.explain");
  const started = desk.sessions.some((s) => s.orderId === rx.orderId && s.recordedAt && !s.notDone) ? Math.min(...desk.sessions.filter((s) => s.orderId === rx.orderId && s.recordedAt && !s.notDone).map((s) => s.day)) : null;
  const st = planState(desk, rx.orderId, started, today);
  const [d, setD] = useState<Draft>(() => draftOf(rx, desk, st.plan, started ?? rx.startDay));
  const [to, setTo] = useState("患者本人");
  const problems = planProblems(d);
  const bis = desk.bi.filter((b) => b.patientId === rx.patientId).sort((a, b) => a.day - b.day);
  const biLabel = (id?: string) => {
    const e = bis.find((b) => b.id === id);
    return e ? `${fmtDay(e.day)} ${biTotal(e.scores) ?? "—"}点（${e.by}）` : "—";
  };
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD({ ...d, [k]: v });
  const text = (k: "diagnosis" | "treatment" | "comorbidities" | "risks" | "contraindications" | "social" | "goalMonth" | "goalEnd" | "policy", label: string, rows = 1) => (
    <label className="block">
      <span className="text-ink-soft">{label}</span>
      {rows > 1 ? (
        <textarea value={d[k]} onChange={(e) => set(k, e.target.value)} rows={rows} disabled={!!denyPlan} className={`${field} block w-full`} />
      ) : (
        <input value={d[k]} onChange={(e) => set(k, e.target.value)} disabled={!!denyPlan} className={`${field} block w-full`} />
      )}
    </label>
  );
  const make = () => {
    if (problems.length) return;
    const plan: RehabPlan = { ...d, id: `rp-${rx.orderId}-${desk.plans.length + 1}`, madeBy: { day: 0, time: nowTime, by: me.name }, staff: d.staff };
    onDesk((x) => ({ ...x, plans: [...x.plans, plan] }));
    auditLog({ role: me.role, actor: me.name, action: st.plan ? "確定（リハビリテーション実施計画書を見直した）" : "確定（リハビリテーション実施計画書）", patient: rx.name, detail: `${categoryOf(rx.order.field).name}　目標：${d.goalMonth.slice(0, 40)}` });
  };
  const cur = st.plan;
  return (
    <article className="space-y-2 rounded-lg border border-rule bg-sheet p-3 text-[12px]">
      <header className="flex flex-wrap items-baseline gap-x-3">
        <b>
          {rx.room}　{rx.name}
        </b>
        <span>{categoryOf(rx.order.field).name}</span>
        <span className="text-ink-soft">
          処方 {rx.orderedBy}（{fmtDay(rx.orderedAt.day)}）　職種 {rx.order.therapists.join("・")}　起算日 {fmtDay(rx.order.onset)}
        </span>
        <span className={st.state.includes("過ぎた") || st.state.includes("説明まだ") || st.state.includes("見直し") ? "font-bold text-shu" : "text-wakatake"}>
          {st.state}
          {!cur && started !== null && `（原則 ${fmtDay(st.dueBy)}、遅くとも ${fmtDay(st.lastBy)} まで）`}
        </span>
      </header>
      {cur && (
        <p className="text-ink-soft">
          いまの計画書：{fmtDay(cur.madeBy.day)} {cur.madeBy.by} 作成
          {cur.explained ? `　説明 ${fmtDay(cur.explained.day)} ${cur.explained.by} → ${cur.explained.to}` : "　説明・交付はまだ"}
        </p>
      )}
      <div className="grid gap-2 md:grid-cols-2">
        {text("diagnosis", "算定病名")}
        {text("treatment", "治療内容（手術を行った場合は、術式を含む）")}
        <p className="text-ink-soft">
          発症日 {fmtDay(d.onsetDay)}　リハ開始日 {fmtDay(d.startDay)}
        </p>
        {text("comorbidities", "併存疾患・合併症")}
        {text("risks", "安静度・リスク")}
        {text("contraindications", "禁忌・特記事項")}
      </div>
      <fieldset>
        <legend className="font-bold">心身機能・構造（該当する項目のみ。客観的評価も）</legend>
        <div className="grid gap-x-3 gap-y-0.5 md:grid-cols-2">
          {BODY_ITEMS.map((k) => (
            <label key={k} className="flex items-center gap-1">
              <input type="checkbox" checked={d.body[k] !== undefined} onChange={(e) => set("body", e.target.checked ? { ...d.body, [k]: "" } : Object.fromEntries(Object.entries(d.body).filter(([x]) => x !== k)))} disabled={!!denyPlan} className="accent-ai" />
              <span className="w-28 shrink-0">{k}</span>
              {d.body[k] !== undefined && <input value={d.body[k]} onChange={(e) => set("body", { ...d.body, [k]: e.target.value })} aria-label={`${k}の内容`} disabled={!!denyPlan} className={`${field} min-w-0 flex-1`} />}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="font-bold">基本動作</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {BASIC_ITEMS.map((k) => (
            <label key={k} className="flex items-center gap-1">
              {k}
              <select value={d.basic[k] ?? ""} onChange={(e) => set("basic", { ...d.basic, [k]: e.target.value as BasicLevel })} disabled={!!denyPlan} className={field}>
                <option value="">—</option>
                {LEVELS.map((l) => (
                  <option key={l}>{l}</option>
                ))}
              </select>
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="font-bold">日常生活活動（BI。開始時 → 現在）</legend>
        <div className="flex flex-wrap items-center gap-2">
          <select value={d.biStartId ?? ""} onChange={(e) => set("biStartId", e.target.value || undefined)} aria-label="開始時の BI" disabled={!!denyPlan} className={field}>
            <option value="">開始時の評価</option>
            {bis.map((b) => (
              <option key={b.id} value={b.id}>
                {biLabel(b.id)}
              </option>
            ))}
          </select>
          →
          <select value={d.biNowId ?? ""} onChange={(e) => set("biNowId", e.target.value || undefined)} aria-label="現在の BI" disabled={!!denyPlan} className={field}>
            <option value="">現在の評価</option>
            {bis.map((b) => (
              <option key={b.id} value={b.id}>
                {biLabel(b.id)}
              </option>
            ))}
          </select>
          <span className="text-ink-faint">評価は「ADL（BI）」で療法士が入れます。</span>
        </div>
      </fieldset>
      <div className="grid gap-2 md:grid-cols-2">
        {text("social", "社会保障サービスの申請状況（該当する場合）")}
        {text("goalMonth", "目標（今後1か月以内）", 2)}
        {text("goalEnd", "目標（当院退院時又は終了時）", 2)}
        {text("policy", "治療方針（リハビリテーション実施方針）", 2)}
      </div>
      <fieldset>
        <legend className="font-bold">治療内容（リハビリテーション実施内容）</legend>
        {(["PT", "OT", "ST"] as Discipline[]).map((k) => (
          <label key={k} className="flex items-center gap-2">
            <span className="w-24 shrink-0 text-ink-soft">{DISCIPLINE_NAME[k]}</span>
            <input value={d.content[k] ?? ""} onChange={(e) => set("content", { ...d.content, [k]: e.target.value })} disabled={!!denyPlan} className={`${field} flex-1`} />
          </label>
        ))}
      </fieldset>
      <label className="block">
        <span className="text-ink-soft">作成に関わった療法士（記名。読点で区切る）</span>
        <input value={d.staff.join("、")} onChange={(e) => set("staff", e.target.value.split(/[、,]/).map((s) => s.trim()).filter(Boolean))} disabled={!!denyPlan} className={`${field} block w-full`} />
      </label>
      {problems.length > 0 && (
        <ul className="list-disc pl-5 text-ink-soft">
          {problems.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={!!denyPlan || problems.length > 0} title={denyPlan ?? undefined} onClick={make} className="rounded bg-ai px-3 py-0.5 font-bold text-white disabled:opacity-40">
          {cur ? "見直した計画書を作成（医師）" : "計画書を作成（医師）"}
        </button>
        {cur && !cur.explained && (
          <>
            <select value={to} onChange={(e) => setTo(e.target.value)} aria-label="説明した相手" disabled={!!denyExplain} className={`${field} ml-auto`}>
              {["患者本人", "家族等", "患者本人と家族等"].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
            <button
              type="button"
              disabled={!!denyExplain}
              title={denyExplain ?? undefined}
              onClick={() => {
                onDesk((x) => ({ ...x, plans: x.plans.map((p) => (p.id === cur.id ? { ...p, explained: { day: 0, time: nowTime, by: me.name, to } } : p)) }));
                auditLog({ role: me.role, actor: me.name, action: "確定（リハビリテーション実施計画書を説明し交付した）", patient: rx.name, detail: `相手：${to}` });
              }}
              className="rounded border border-ai px-2 py-0.5 text-ai disabled:opacity-40"
            >
              説明して交付した
            </button>
          </>
        )}
      </div>
      <p className="text-[11px] text-ink-faint">{PLAN_NOTE}</p>
      <p className="text-[11px] text-ink-faint">別紙様式21 の栄養・口腔の欄は、回復期リハビリテーション病棟入院料などを算定する場合に必ず記入する欄です。この架空の病棟（急性期一般入院料）では載せていません。廃用症候群リハビリテーション料の「廃用症候群に係る評価表」（別紙様式22）は、この試作にはありません。</p>
    </article>
  );
}
