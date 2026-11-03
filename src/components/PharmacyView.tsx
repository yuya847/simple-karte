"use client";

import { Activity, Check, MessageSquareWarning, Pill, ScanText, Syringe } from "lucide-react";
import { TdmView } from "./TdmView";
import type { TdmReport } from "@/lib/tdm";
import { useState } from "react";
import { addDays, formatShort, type CalendarDate } from "@/lib/dates";
import { abs } from "@/lib/flowsheet";
import { orderLines, oralName } from "@/lib/format";
import { alreadyOrdered, auditItems, b008Check, matchOral, queryOpen, type BroughtReport, type BroughtRow, type Query } from "@/lib/pharmacy";
import type { DayOffset } from "@/lib/types";
import { buildWorksheet, shiftWindow, timeLabel, type WorkPatient } from "@/lib/worksheet";
import { CLAUDE, auditLog } from "@/lib/audit";

export interface ShidoRecord {
  day: DayOffset;
  kind: "1" | "2";
  text: string;
  at: string;
}

interface Props {
  people: WorkPatient[];
  today: CalendarDate;
  nowTime: string;
  audited: Record<string, string>;
  onAudit: (entryId: string) => void;
  queries: Query[];
  onAsk: (q: Omit<Query, "id" | "askedAt" | "by" | "status">) => void;
  reports: BroughtReport[];
  onReport: (r: Omit<BroughtReport, "id" | "at" | "by" | "status">) => void;
  shido: Record<string, ShidoRecord[]>;
  onShido: (patientId: string, rec: Omit<ShidoRecord, "at" | "day">) => void;
  dispensed: Record<string, string>;
  onDispense: (key: string) => void;
  tdm: TdmReport[];
  onTdm: (r: Omit<TdmReport, "id" | "at" | "by" | "status">) => void;
}

type Tab = "audit" | "brought" | "shido" | "dispense" | "tdm";
const TABS: { key: Tab; label: string; icon: typeof Pill }[] = [
  { key: "audit", label: "処方監査・疑義照会", icon: MessageSquareWarning },
  { key: "brought", label: "持参薬鑑別", icon: ScanText },
  { key: "shido", label: "服薬指導", icon: Pill },
  { key: "dispense", label: "注射払出（明日分）", icon: Syringe },
  { key: "tdm", label: "TDM", icon: Activity },
];

const PHARMACIST = "薬剤師 小林";

/** The pharmacy's ward work. Checks are code; Claude only reads the お薬手帳 lines; the doctor decides. */
export function PharmacyView(p: Props) {
  const [tab, setTab] = useState<Tab>("audit");
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-rule bg-sheet px-5 py-2">
        <h1 className="text-base font-bold">薬剤部（病棟）</h1>
        <div role="tablist" className="flex rounded-md border border-rule p-0.5 text-sm">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={`flex items-center gap-1 rounded px-2.5 py-0.5 ${tab === key ? "bg-ink font-bold text-white" : "text-ink-soft hover:text-ink"}`}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </div>
        <span className="ml-auto text-xs text-ink-faint">{PHARMACIST}（架空）として操作します</span>
      </div>
      <div className="scroll-thin min-h-0 flex-1 overflow-auto bg-paper p-5">
        <div className="mx-auto max-w-[1100px]">
          {tab === "audit" && <Audit {...p} />}
          {tab === "brought" && <Brought {...p} />}
          {tab === "shido" && <Shido {...p} />}
          {tab === "dispense" && <Dispense {...p} />}
          {tab === "tdm" && <TdmView people={p.people} nowTime={p.nowTime} reports={p.tdm} onReport={p.onTdm} />}
        </div>
      </div>
    </div>
  );
}

const card = "rounded-lg border border-rule bg-sheet";

// ---------------------------------------------------------------------------

function Audit({ people, today, nowTime, audited, onAudit, queries, onAsk }: Props) {
  const nowAbs = abs(0, nowTime);
  const items = auditItems(people, -1440, nowAbs);
  const [asking, setAsking] = useState<string | null>(null);
  const [text, setText] = useState("");
  return (
    <section className="space-y-2">
      <p className="text-xs text-ink-soft">昨日と今日に出た注射・内服のオーダです。重複はコードが調べます。飲み合わせ・量・腎機能の判断は薬剤師が行い、疑問は医師に照会します（医師はカルテの右上で答えます）。</p>
      {items.length === 0 && <p className="text-ink-faint">新しいオーダはありません。</p>}
      {items.map((it) => {
        const { main, detail } = orderLines(it.entry.order, today);
        const qs = queries.filter((q) => q.orderId === it.entry.id);
        const open = qs.find((q) => queryOpen(q, people.find((x) => x.patient.id === it.patient.id)?.entries ?? []));
        const changed = !open && qs.some((q) => q.status === "変更");
        return (
          <article key={it.entry.id} className={`${card} px-4 py-2.5 text-[13px]`}>
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="text-xs text-ink-faint">
                {formatShort(addDays(today, it.entry.day))} {it.entry.time}　{it.entry.author}
              </span>
              <b>
                {it.room}　{it.patient.name}
              </b>
              <span className="ml-auto flex items-center gap-2 text-xs">
                {open ? (
                  <span className="rounded bg-yamabuki-soft px-1.5 py-0.5 font-bold text-yamabuki">疑義照会 {open.status === "回答待ち" ? "回答待ち" : "変更待ち（前のオーダが有効）"}</span>
                ) : changed ? (
                  <span className="rounded bg-tab px-1.5 py-0.5 text-ink-soft">疑義照会で変更（このオーダは中止済み）</span>
                ) : audited[it.entry.id] ? (
                  <span className="flex items-center gap-0.5 text-wakatake">
                    <Check size={13} />
                    監査済 {audited[it.entry.id]}
                  </span>
                ) : (
                  <>
                    <button type="button" onClick={() => onAudit(it.entry.id)} className="rounded border border-wakatake px-2 py-0.5 text-wakatake hover:bg-wakatake hover:text-white">
                      監査済にする
                    </button>
                    <button type="button" onClick={() => setAsking(it.entry.id)} className="rounded border border-yamabuki px-2 py-0.5 text-yamabuki hover:bg-yamabuki hover:text-white">
                      疑義照会
                    </button>
                  </>
                )}
              </span>
            </div>
            <div className={it.entry.status === "中止" ? "text-ink-faint line-through" : "font-bold"}>{main}</div>
            <div className="text-xs text-ink-soft">{detail}</div>
            {it.checks.map((c) => (
              <div key={c.text} className={`mt-1 text-xs ${c.level === "ask" ? "font-bold text-yamabuki" : "text-ink-soft"}`}>
                {c.level === "ask" ? "確認　" : ""}
                {c.text}
              </div>
            ))}
            {qs.map((q) => (
              <div key={q.id} className="mt-1.5 rounded bg-paper px-2 py-1 text-xs">
                <b>照会</b> {q.askedAt} {q.by}：{q.question}
                {q.status !== "回答待ち" && (
                  <div>
                    <b>回答</b> {q.answeredAt}：{q.status}
                    {q.answer ? `（${q.answer}）` : ""}
                  </div>
                )}
              </div>
            ))}
            {asking === it.entry.id && (
              <div className="mt-2 flex gap-2">
                <input value={text} onChange={(e) => setText(e.target.value)} placeholder="照会の内容（例：腎機能から量の確認をお願いします）" className="flex-1 rounded border border-rule bg-paper px-2 py-1 text-sm outline-none" autoFocus />
                <button
                  type="button"
                  disabled={!text.trim()}
                  onClick={() => {
                    onAsk({ patientId: it.patient.id, orderId: it.entry.id, question: text.trim() });
                    setText("");
                    setAsking(null);
                  }}
                  className="rounded bg-yamabuki px-3 py-1 text-sm font-bold text-white disabled:opacity-40"
                >
                  医師に送る
                </button>
              </div>
            )}
          </article>
        );
      })}
    </section>
  );
}

// ---------------------------------------------------------------------------

const SAMPLE = `2026年10月20日　あおば内科クリニック（架空）
Rp1　ノルバスク錠5mg　1回1錠　1日1回　朝食後　28日分
Rp2　ラシックス錠20mg　1回1錠　1日1回　朝食後　28日分
Rp3　マグミット錠330mg　1回2錠　1日2回　朝夕食後　28日分
Rp4　カロナール錠500　1回1錠　頓用　疼痛時　10回分`;

function Brought({ people, nowTime, reports, onReport }: Props) {
  const [patientId, setPatientId] = useState(people[0]?.patient.id ?? "");
  const [text, setText] = useState("");
  const [rows, setRows] = useState<BroughtRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const person = people.find((x) => x.patient.id === patientId);

  const read = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/mochikomi", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `エラー（${res.status}）`);
      auditLog({ role: "AI", actor: CLAUDE, action: "お薬手帳を表に写した", patient: person?.patient.name, detail: `${json.rows.length}剤` });
      setRows(
        (json.rows as Omit<BroughtRow, "match" | "checked" | "decision">[]).map((r) => ({ ...r, match: matchOral(r.said, r.strength), checked: false, decision: null })),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "読み取れませんでした。");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-4">
      <div className={`${card} space-y-2 p-4 text-[13px]`}>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2">
            患者
            <select value={patientId} onChange={(e) => { setPatientId(e.target.value); setRows(null); }} className="rounded border border-rule bg-paper px-2 py-1">
              {people.map((x) => (
                <option key={x.patient.id} value={x.patient.id}>
                  {x.room}　{x.patient.name}
                </option>
              ))}
            </select>
          </label>
          <button type="button" onClick={() => setText(SAMPLE)} className="rounded border border-rule px-2 py-1 text-xs text-ink-soft hover:text-ink">
            例文（架空のお薬手帳）を入れる
          </button>
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={6}
          placeholder="お薬手帳の薬の行を打つか貼り付けます。氏名・生年月日・ID は入れないでください（Claude に送るのは、この欄の文だけです）。"
          className="w-full rounded border border-rule bg-paper px-2 py-1.5 font-mono text-[12px] outline-none"
        />
        <div className="flex items-center gap-3">
          <button type="button" disabled={!text.trim() || busy} onClick={read} className="rounded bg-ai px-3 py-1.5 font-bold text-white disabled:opacity-40">
            {busy ? "読み取り中…" : "Claude で表にする"}
          </button>
          <span className="text-xs text-ink-faint">Claude は書いてあることを写すだけです。院内の薬との照合と登録済みかの確認はコードが行い、薬剤師が実物と照らして確かめます。</span>
        </div>
        {error && <p className="text-sm text-shu">{error}</p>}
      </div>

      {rows && person && (
        <div className={`${card} p-4 text-[13px]`}>
          <h3 className="mb-2 font-bold">
            鑑別　{person.room} {person.patient.name}
          </h3>
          <table className="nums w-full border-collapse">
            <thead className="text-left text-[11px] text-ink-faint">
              <tr>
                <th className="py-1 font-normal">手帳の記載</th>
                <th className="py-1 font-normal">用法</th>
                <th className="py-1 font-normal">院内の同じ成分・規格（コードで照合）</th>
                <th className="py-1 font-normal">実物と確認</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const already = r.match ? alreadyOrdered(r.match, person.entries) : [];
                return (
                  <tr key={i} className="border-t border-rule-soft align-top">
                    <td className="py-1.5">
                      <b>{r.said}</b> {r.strength}
                    </td>
                    <td className="py-1.5">
                      1回{r.amount ?? "？"}
                      {r.unit}　{r.timings.length ? `1日${r.timings.length}回 ${r.timings.join("・")}` : `頓用 ${r.prn ?? ""}`}
                      {r.daysLeft ? `　${r.daysLeft}日分` : ""}
                    </td>
                    <td className="py-1.5">
                      {r.match ? (
                        <>
                          {oralName(r.match)}
                          {already.length > 0 && <div className="text-xs font-bold text-yamabuki">同じ成分がもう登録されています（{already.map((e) => (e.order.type === "prescription" ? e.order.category : "")).join("・")}）</div>}
                        </>
                      ) : (
                        <span className="text-shu">院内のマスターにありません</span>
                      )}
                    </td>
                    <td className="py-1.5">
                      <label className="flex cursor-pointer items-center gap-1 text-xs">
                        <input type="checkbox" className="accent-ai" checked={r.checked} onChange={() => setRows((rs) => rs!.map((x, j) => (j === i ? { ...x, checked: !x.checked } : x)))} />
                        確認した
                      </label>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="mt-3 flex items-center gap-3">
            <button
              type="button"
              disabled={!rows.length || !rows.every((r) => r.checked)}
              onClick={() => {
                onReport({ patientId, rows });
                setRows(null);
                setText("");
              }}
              className="rounded bg-ai px-3 py-1.5 font-bold text-white disabled:opacity-40"
            >
              医師へ報告する
            </button>
            <span className="text-xs text-ink-faint">すべての行を実物と確認すると押せます。医師はカルテの右上で、薬ごとに「持参薬で継続・院内の薬に切替・中止」を選びます。</span>
          </div>
        </div>
      )}

      {reports.length > 0 && (
        <div className={`${card} p-4 text-[13px]`}>
          <h3 className="mb-1 font-bold">報告した鑑別</h3>
          <ul className="space-y-1">
            {reports.map((r) => {
              const pt = people.find((x) => x.patient.id === r.patientId);
              return (
                <li key={r.id}>
                  {r.at}　{pt?.room} {pt?.patient.name}　{r.rows.length}剤　<b className={r.status === "指示済" ? "text-wakatake" : "text-yamabuki"}>{r.status}</b>
                  {r.status === "指示済" && <span className="text-ink-soft">（{r.rows.map((x) => `${x.said}：${x.decision ?? "—"}`).join("、")}）</span>}
                </li>
              );
            })}
          </ul>
        </div>
      )}
      <p className="text-[11px] text-ink-faint">今の時刻 {nowTime}。架空の病院・架空の患者です。</p>
    </section>
  );
}

// ---------------------------------------------------------------------------

function Shido({ people, today, shido, onShido }: Props) {
  const [patientId, setPatientId] = useState(people[0]?.patient.id ?? "");
  const [kind, setKind] = useState<"1" | "2">("2");
  const [text, setText] = useState("");
  const recs = shido[patientId] ?? [];
  // 週は日曜〜土曜。dow/month from the calendar of today.
  const dow = (d: DayOffset) => new Date(Date.UTC(today.y, today.m - 1, today.d + d)).getUTCDay();
  const month = (d: DayOffset) => {
    const t = new Date(Date.UTC(today.y, today.m - 1, today.d + d));
    return `${t.getUTCFullYear()}-${t.getUTCMonth() + 1}`;
  };
  const warn = b008Check(recs.map((r) => r.day), 0, dow, month);
  return (
    <section className={`${card} space-y-3 p-4 text-[13px]`}>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2">
          患者
          <select value={patientId} onChange={(e) => setPatientId(e.target.value)} className="rounded border border-rule bg-paper px-2 py-1">
            {people.map((x) => (
              <option key={x.patient.id} value={x.patient.id}>
                {x.room}　{x.patient.name}
              </option>
            ))}
          </select>
        </label>
        <div role="radiogroup" className="flex rounded-md border border-rule p-0.5 text-xs">
          {(
            [
              ["1", "1：特に安全管理が必要な医薬品"],
              ["2", "2：それ以外"],
            ] as const
          ).map(([v, l]) => (
            <button key={v} type="button" role="radio" aria-checked={kind === v} onClick={() => setKind(v)} className={`rounded px-2 py-0.5 ${kind === v ? "bg-ink font-bold text-white" : "text-ink-soft"}`}>
              {l}
            </button>
          ))}
        </div>
      </div>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} placeholder="指導の内容、服薬の状況、副作用の確認など（薬剤管理指導記録）" className="w-full rounded border border-rule bg-paper px-2 py-1.5 outline-none" />
      {warn && <p className="text-xs font-bold text-yamabuki">確認　{warn} 記録は残りますが、算定には入りません。</p>}
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={!text.trim()}
          onClick={() => {
            onShido(patientId, { kind, text: text.trim() });
            setText("");
          }}
          className="rounded bg-ai px-3 py-1.5 font-bold text-white disabled:opacity-40"
        >
          記録する
        </button>
        <span className="text-xs text-ink-faint">記録すると、その日の薬剤管理指導料（B008）が算定の画面に入ります（週1回・月4回まで。週は日曜〜土曜）。</span>
      </div>
      {recs.length > 0 && (
        <ul className="space-y-1 border-t border-rule-soft pt-2 text-xs">
          {recs.map((r, i) => (
            <li key={i}>
              {formatShort(addDays(today, r.day))} {r.at}　区分{r.kind}　{r.text}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------

function Dispense({ people, today, nowTime, dispensed, onDispense }: Props) {
  const { lo, hi } = shiftWindow("all", 1);
  const sheet = buildWorksheet(people, lo, hi, abs(0, nowTime));
  const doses = sheet.timed.filter((i) => i.kind === "注射");
  const byPatient = people.map((x) => ({ ...x, doses: doses.filter((d) => d.patientId === x.patient.id) })).filter((x) => x.doses.length);
  return (
    <section className="space-y-3">
      <p className="text-xs text-ink-soft">
        明日（{formatShort(addDays(today, 1))}）の注射を、患者ごと・1回ごとに並べます（オーダからコードで計算。持続の点滴は1本ごと）。払い出したら印を付けます。
      </p>
      {byPatient.map((x) => (
        <div key={x.patient.id} className={`${card} p-4 text-[13px]`}>
          <h3 className="mb-1 font-bold">
            {x.room}　{x.patient.name}
          </h3>
          <ul className="divide-y divide-rule-soft">
            {x.doses.map((d) => {
              const key = `${d.orderId}|${d.at}`;
              return (
                <li key={key} className="flex items-baseline gap-3 py-1">
                  <span className="nums w-24 font-bold">{d.at !== null ? timeLabel(d.at, 1, today) : ""}</span>
                  <span className="flex-1">
                    {d.main}　<span className="text-xs text-ink-soft">{d.detail}</span>
                  </span>
                  {dispensed[key] ? (
                    <span className="flex items-center gap-0.5 text-xs text-wakatake">
                      <Check size={12} />
                      払出 {dispensed[key]}
                    </span>
                  ) : (
                    <button type="button" onClick={() => onDispense(key)} className="rounded border border-ai px-2 py-0.5 text-xs text-ai hover:bg-ai hover:text-white">
                      払い出した
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      {byPatient.length === 0 && <p className="text-ink-faint">明日の注射はありません。</p>}
      <p className="text-[11px] text-ink-faint">架空の病院・架空の患者です。</p>
    </section>
  );
}
