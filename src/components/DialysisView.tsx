"use client";

import { AlertTriangle, Droplets } from "lucide-react";
import { useState } from "react";
import { addDays, formatShort, type CalendarDate } from "@/lib/dates";
import { applyHdChange, hdDiff, hdFee, runsOn, ufPlan, type Course, type HdChangeRequest, type HdPatient, type HdSession } from "@/lib/dialysis";
import { isHoliday } from "@/lib/er";

interface Props {
  today: CalendarDate;
  nowTime: string;
  patients: HdPatient[];
  sessions: Record<string, HdSession>;
  onPatient: (p: HdPatient) => void;
  onSession: (id: string, s: HdSession) => void;
}

const DOCTOR = "山本（専攻医）";
const card = "rounded-lg border border-rule bg-sheet";
const input = "w-24 rounded border border-rule bg-paper px-2 py-1 text-[13px] outline-none focus:border-ai";

/** 透析室: today's schedule, each patient's conditions, and today's session with the arithmetic in code. */
export function DialysisView({ today, nowTime, patients, sessions, onPatient, onSession }: Props) {
  const dow = new Date(Date.UTC(today.y, today.m - 1, today.d)).getUTCDay();
  const holiday = dow === 0 || isHoliday(today.y, today.m, today.d);
  const todays = patients.filter((p) => runsOn(p, dow));
  const [selected, setSelected] = useState(todays[0]?.id ?? patients[0]?.id);
  const p = patients.find((x) => x.id === selected)!;
  const s = sessions[p.id] ?? { drugsGiven: [] };

  const state = (x: HdPatient) => {
    const ss = sessions[x.id];
    if (ss?.end) return { label: "終了", tone: "text-ink-faint" };
    if (ss?.start) return { label: `透析中（${ss.start}〜）`, tone: "font-bold text-ai" };
    if (ss?.preWeight) return { label: "体重測定済み", tone: "text-wakatake" };
    return { label: "予定", tone: "text-ink-soft" };
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-rule bg-sheet px-5 py-2">
        <h1 className="flex items-center gap-1.5 text-base font-bold">
          <Droplets size={18} className="text-ai" />
          透析室
          <span className="rounded border border-dashed border-ink-faint px-1.5 py-0.5 text-[10px] font-normal text-ink-soft">架空</span>
        </h1>
        <span className="text-sm text-ink-soft">
          {formatShort(today)}（{["日", "月", "火", "水", "木", "金", "土"][dow]}曜{holiday ? "・休日" : ""}）　{todays.length}人
        </span>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
        <aside className="scroll-thin min-h-0 overflow-auto border-r border-rule bg-paper p-3">
          {(["午前", "午後"] as Course[]).map((c) => (
            <section key={c} className="mb-3">
              <h2 className="mb-1 text-[12px] font-bold text-ink-soft">{c}のクール</h2>
              <ul className="space-y-1">
                {todays
                  .filter((x) => x.course === c)
                  .sort((a, b) => a.bed - b.bed)
                  .map((x) => {
                    const st = state(x);
                    return (
                      <li key={x.id}>
                        <button
                          type="button"
                          onClick={() => setSelected(x.id)}
                          className={`w-full rounded-md border px-3 py-2 text-left text-[13px] ${selected === x.id ? "border-ai bg-ai-soft" : "border-rule bg-sheet hover:border-ai/50"}`}
                        >
                          <div className="flex items-baseline gap-2">
                            <span className="text-[11px] text-ink-faint">{x.bed}番</span>
                            <b>{x.name}</b>
                            <span className="text-[11px] text-ink-soft">
                              {x.sex}・{x.age}歳・{x.status}
                            </span>
                          </div>
                          <div className="nums text-[11px] text-ink-soft">
                            {x.conditions.method} {x.conditions.minutes / 60}時間　DW {x.conditions.dw}kg
                            {x.startedOn > -31 && <span className="ml-1 font-bold text-yamabuki">導入期</span>}
                          </div>
                          <div className={`text-[11px] ${st.tone}`}>{st.label}</div>
                        </button>
                      </li>
                    );
                  })}
              </ul>
            </section>
          ))}
          <p className="text-[10px] text-ink-faint">今日が透析日でない人（月水金）は一覧に出ません。患者・条件・記録はすべて架空です。</p>
        </aside>

        <div className="scroll-thin min-h-0 overflow-auto p-4">
          <div className="mx-auto max-w-[900px] space-y-3">
            <header className="flex items-baseline gap-3">
              <h2 className="text-lg font-bold">{p.name}</h2>
              <span className="text-sm text-ink-soft">
                {p.sex}・{p.age}歳　{p.status}　{p.weekdays} {p.course}　{p.bed}番ベッド　導入 {formatShort(addDays(today, p.startedOn))}
              </span>
            </header>
            <Conditions key={`c-${p.id}`} p={p} today={today} nowTime={nowTime} onPatient={onPatient} />
            <Session key={`s-${p.id}`} p={p} s={s} nowTime={nowTime} holiday={holiday} onSession={(next) => onSession(p.id, next)} />
          </div>
        </div>
      </div>
    </div>
  );
}

function Conditions({ p, nowTime, onPatient }: { p: HdPatient; today: CalendarDate; nowTime: string; onPatient: (p: HdPatient) => void }) {
  const c = p.conditions;
  const [text, setText] = useState("");
  const [req, setReq] = useState<HdChangeRequest | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const read = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/hd-order", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `エラー（${res.status}）`);
      setReq(json.change);
    } catch (e) {
      setError(e instanceof Error ? e.message : "読み取れませんでした。");
    } finally {
      setBusy(false);
    }
  };
  const diff = req ? hdDiff(c, req) : [];
  const row = (k: string, v: string) => (
    <div className="flex gap-2">
      <dt className="w-28 shrink-0 text-ink-faint">{k}</dt>
      <dd>{v}</dd>
    </div>
  );
  return (
    <section className={`${card} p-4 text-[13px]`}>
      <h3 className="mb-2 font-bold">透析条件（医師の指示）</h3>
      <dl className="nums grid grid-cols-2 gap-x-6 gap-y-1">
        {row("方法・時間", `${c.method}　${c.minutes % 60 ? `${Math.floor(c.minutes / 60)}時間${c.minutes % 60}分` : `${c.minutes / 60}時間`}`)}
        {row("DW", `${c.dw}kg`)}
        {row("血流量", `${c.qb}mL/分`)}
        {row("ダイアライザ", c.dialyzer)}
        {row("透析液", c.dialysate)}
        {row("抗凝固薬", `ヘパリン 初回 ${c.heparin.initial}単位・持続 ${c.heparin.hourly}単位/時`)}
        {row("除水の上限", `量 ${c.ufMax}kg・速度 ${c.ufRateMax}mL/kg/時`)}
        {row("アクセス・針", `${c.access}・${c.needle}`)}
        {row("透析で使う薬", c.drugs.join("、") || "なし")}
      </dl>
      {p.history.length > 0 && (
        <div className="mt-2 text-[11px] text-ink-soft">
          変更の記録：{p.history.map((h) => `${h.at} ${h.text}（${h.by}）`).join("　")}
        </div>
      )}
      <div className="mt-3 border-t border-rule-soft pt-3">
        <div className="flex gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="条件の変更を話すか打つ（例：DW 58.0に下げて、時間は4時間半）。患者の名前は言わなくてよい"
            className="flex-1 rounded border border-rule bg-paper px-2 py-1.5 outline-none focus:border-ai"
          />
          <button type="button" disabled={!text.trim() || busy} onClick={read} className="rounded bg-ai px-3 py-1.5 font-bold text-white disabled:opacity-40">
            {busy ? "読み取り中…" : "下書きにする"}
          </button>
        </div>
        {error && <p className="mt-1 text-shu">{error}</p>}
        {req && (
          <div className="mt-2 rounded-md border border-ai/30 bg-ai-soft/40 p-3">
            {diff.length === 0 ? (
              <p className="text-ink-soft">変わる項目がありませんでした。言い直してください。</p>
            ) : (
              <table className="nums text-[13px]">
                <tbody>
                  {diff.map((d) => (
                    <tr key={d.label}>
                      <td className="pr-3 text-ink-faint">{d.label}</td>
                      <td className="pr-2 text-ink-soft line-through">{d.before}</td>
                      <td className="pr-2">→</td>
                      <td className="font-bold">{d.after}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {req.comment && <p className="mt-1 text-[12px] text-ink-soft">コメント：{req.comment}</p>}
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                disabled={!diff.length}
                onClick={() => {
                  onPatient({ ...p, conditions: applyHdChange(c, req), history: [...p.history, { at: `今日 ${nowTime}`, by: DOCTOR, text: diff.map((d) => `${d.label} ${d.before} → ${d.after}`).join("、") }] });
                  setReq(null);
                  setText("");
                }}
                className="rounded bg-ai px-3 py-1 font-bold text-white disabled:opacity-40"
              >
                確定（医師）
              </button>
              <button type="button" onClick={() => setReq(null)} className="rounded border border-rule px-3 py-1 text-ink-soft">
                やめる
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function Session({ p, s, nowTime, holiday, onSession }: { p: HdPatient; s: HdSession; nowTime: string; holiday: boolean; onSession: (s: HdSession) => void }) {
  const [pre, setPre] = useState(s.preWeight ? String(s.preWeight) : "");
  const plan = s.preWeight ? ufPlan(s.preWeight, p.conditions) : null;
  const fee = hdFee(p, s, holiday);
  return (
    <section className={`${card} p-4 text-[13px]`}>
      <h3 className="mb-2 font-bold">今日の透析（看護師・臨床工学技士が入れる）</h3>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col text-[12px] text-ink-soft">
          透析前の体重（kg）
          <input value={pre} onChange={(e) => setPre(e.target.value)} inputMode="decimal" className={input} />
        </label>
        <button
          type="button"
          disabled={!(Number(pre) > 0)}
          onClick={() => onSession({ ...s, preWeight: Number(pre) })}
          className="rounded border border-ai px-3 py-1 text-ai disabled:opacity-40"
        >
          入れる
        </button>
        <button type="button" disabled={!s.preWeight || !!s.start} onClick={() => onSession({ ...s, start: nowTime })} className="rounded bg-ai px-3 py-1 font-bold text-white disabled:opacity-40">
          開始（{s.start ?? "今"}）
        </button>
        <button type="button" disabled={!s.start || !!s.end} onClick={() => onSession({ ...s, end: nowTime })} className="rounded bg-ink px-3 py-1 font-bold text-white disabled:opacity-40">
          返血終了（{s.end ?? "今"}）
        </button>
      </div>

      {plan && (
        <div className="nums mt-3 rounded-md bg-paper px-3 py-2">
          <div>
            除水量 <b>{plan.uf}kg</b>　<span className="text-ink-soft">{plan.formula}</span>
          </div>
          <div>
            除水速度 <b>{plan.rate}mL/kg/時</b>　<span className="text-ink-soft">{plan.rateFormula}</span>
          </div>
          {plan.problems.map((x) => (
            <div key={x} className="mt-1 flex items-center gap-1 font-bold text-yamabuki">
              <AlertTriangle size={14} />
              {x} 医師に確かめてください。
            </div>
          ))}
          <p className="mt-1 text-[11px] text-ink-faint">計算はコードで行い、上限は医師の指示の値と比べるだけです。食事・補液の分は含めていません。</p>
        </div>
      )}

      {p.conditions.drugs.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-3 text-[12px]">
          <span className="text-ink-soft">透析で使う薬：</span>
          {p.conditions.drugs.map((d) => (
            <label key={d} className="flex items-center gap-1">
              <input
                type="checkbox"
                className="accent-ai"
                checked={s.drugsGiven.includes(d)}
                onChange={() => onSession({ ...s, drugsGiven: s.drugsGiven.includes(d) ? s.drugsGiven.filter((x) => x !== d) : [...s.drugsGiven, d] })}
              />
              {d} を使った
            </label>
          ))}
        </div>
      )}

      <div className="mt-3 border-t border-rule-soft pt-3">
        <h4 className="mb-1 text-[12px] font-bold text-ink-soft">算定の目安（J038 人工腎臓、令和8年度。外来の請求はこの試作では行いません）</h4>
        {fee.lines.length > 0 && (
          <table className="nums w-full text-[12px]">
            <tbody>
              {fee.lines.map((l) => (
                <tr key={l.code} className="border-b border-rule-soft align-top">
                  <td className="py-1 pr-2">
                    {l.name}
                    <span className="ml-1 text-[10px] text-ink-faint">{l.code}</span>
                  </td>
                  <td className="py-1 pr-2 text-right font-bold">{l.points.toLocaleString("ja-JP")}点</td>
                  <td className="py-1 text-ink-soft">{l.why}</td>
                </tr>
              ))}
              <tr>
                <td className="py-1 font-bold">合計</td>
                <td className="py-1 pr-2 text-right font-bold">{fee.total.toLocaleString("ja-JP")}点</td>
                <td />
              </tr>
            </tbody>
          </table>
        )}
        {fee.notes.map((n) => (
          <p key={n} className="text-[11px] text-ink-soft">
            ・{n}
          </p>
        ))}
      </div>
    </section>
  );
}
