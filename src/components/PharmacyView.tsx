"use client";

import { Activity, BookOpenText, Check, Droplet, Package, HelpCircle, MessageSquareWarning, NotebookText, Pill, Printer, ScanText, Syringe } from "lucide-react";
import { createPortal, flushSync } from "react-dom";
import { DrugLabel } from "./Labels";
import { DrugInfoSheet, MedBagFace, NotebookSticker } from "./HomeRxPrint";
import { bagLine, bagsOf } from "@/lib/discharge-rx";
import { DRUG_INFO_SOURCE, drugInfoOf } from "@/lib/drug-info";
import { labelFor } from "@/lib/mar";
import { txText } from "@/lib/procedures";
import { ageSex } from "@/lib/person";
import type { OrderEntry } from "@/lib/types";
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
import { STAFF } from "@/lib/roles";

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
  /** 血液製剤の払出 (by transfusion order id): lot number, time, who. */
  txIssued: Record<string, { lot: string; at: string; by: string }>;
  onTxIssue: (entryId: string, lot: string) => void;
  /** 病棟薬剤業務日誌: the pharmacist's own words today. */
  journal: { text: string; at: string }[];
  onJournal: (text: string) => void;
  /** 退院時の薬: 調剤・鑑査・説明 and the pharmacist's wording, by patient. */
  homeRx: Record<string, HomeRxRecord>;
  onHomeRx: (patientId: string, patch: Partial<HomeRxRecord>) => void;
  onDispense: (key: string) => void;
  tdm: TdmReport[];
  onTdm: (r: Omit<TdmReport, "id" | "at" | "by" | "status">) => void;
}

type Tab = "audit" | "brought" | "shido" | "dispense" | "home" | "blood" | "tdm" | "journal";
const TABS: { key: Tab; label: string; icon: typeof Pill }[] = [
  { key: "audit", label: "処方監査・疑義照会", icon: MessageSquareWarning },
  { key: "brought", label: "持参薬鑑別", icon: ScanText },
  { key: "shido", label: "服薬指導", icon: Pill },
  { key: "dispense", label: "注射払出・ラベル（明日分）", icon: Syringe },
  { key: "home", label: "退院時の薬", icon: Package },
  { key: "blood", label: "血液製剤", icon: Droplet },
  { key: "tdm", label: "TDM", icon: Activity },
  { key: "journal", label: "業務日誌", icon: NotebookText },
];

/** How to use each tab (the pharmacist's day), shown at the top (can be folded). */
const GUIDE: { tab: Tab; steps: string }[] = [
  { tab: "audit", steps: "医師が出した注射・内服が新しい順に並びます。重複はコードが調べます。量・飲み合わせ・腎機能を確かめて「監査済み」。疑問があれば「疑義照会」を書くと、医師のカルテの右上に届き、医師が答えるか処方を直します。" },
  { tab: "brought", steps: "患者を選び、お薬手帳の文を貼って「読み取る」。Claude は表に写すだけで、院内の薬との照合（同じ成分・規格）はコードが行います。薬剤師が1行ずつ確かめて「医師へ報告」すると、医師がカルテで続ける・止めるを決めます。" },
  { tab: "shido", steps: "患者を選んで指導の内容を記録します。服薬指導の算定の回数（週1回・月4回まで）はコードが数え、超えると知らせます。" },
  { tab: "dispense", steps: "明日の注射が患者ごと・1回ごとに並びます。「ラベルを印刷」で点滴に貼るラベルを出し、取りそろえた薬のラベルのバーコードを「鑑査」の欄で読むと、その回と合っていれば払出の印が付きます（違う回・払出済みなら止まる）。" },
  { tab: "home", steps: "医師が内服の区分「退院時」で出した処方が患者ごとに並びます。①調剤 → ②鑑査 → ③説明して渡す、の順に記録します。薬袋（Rp ごと、合計の量はコードが数える）・お薬の説明書（薬剤情報提供文書）・お薬手帳のシールを印刷でき、説明書の「気をつけること」は印刷の前に直せます。" },
  { tab: "blood", steps: "医師が確定した輸血のオーダが並びます。製剤の製造番号（ロット）を入れて払い出すと、払出の記録になり、今日の日報に入ります。" },
  { tab: "tdm", steps: "バンコマイシンの血中濃度から、コードが AUC を計算します（式つき）。薬剤師が提案を書いて医師へ報告します。" },
  { tab: "journal", steps: "今日の監査・疑義照会・持参薬鑑別・服薬指導・払出・TDM の件数をコードが数えます。所感を書き残せます。" },
];

const PHARMACIST = STAFF.薬剤師.name;

/** The pharmacy's ward work. Checks are code; Claude only reads the お薬手帳 lines; the doctor decides. */
export function PharmacyView(p: Props) {
  const [tab, setTab] = useState<Tab>("audit");
  const [guide, setGuide] = useState(true);
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
        <button type="button" onClick={() => setGuide((g) => !g)} aria-expanded={guide} className="flex items-center gap-1 rounded border border-rule px-2 py-0.5 text-xs text-ink-soft hover:text-ai">
          <HelpCircle size={13} />
          使い方
        </button>
      </div>
      {guide && (
        <div className="border-b border-rule bg-ai-soft/40 px-5 py-2 text-[12px]">
          <p className="mb-1 flex items-center gap-1 font-bold text-ai">
            <BookOpenText size={14} />
            使い方：{TABS.find((t) => t.key === tab)?.label}
          </p>
          <p className="text-ink">{GUIDE.find((g) => g.tab === tab)?.steps}</p>
          <p className="mt-1 text-[11px] text-ink-soft">薬剤師として操作するには、左下の「自分」で「薬剤師」を選びます（デモではログインの代わり）。医師の側（疑義照会の回答・持参薬の指示・TDM の報告）は、医師でカルテを開くと右上に出ます。</p>
        </div>
      )}
      <div className="scroll-thin min-h-0 flex-1 overflow-auto bg-paper p-5">
        <div className="mx-auto max-w-[1100px]">
          {tab === "audit" && <Audit {...p} />}
          {tab === "brought" && <Brought {...p} />}
          {tab === "shido" && <Shido {...p} />}
          {tab === "dispense" && <Dispense {...p} />}
          {tab === "home" && <Home {...p} />}
          {tab === "blood" && <Blood {...p} />}
          {tab === "tdm" && <TdmView people={p.people} nowTime={p.nowTime} reports={p.tdm} onReport={p.onTdm} />}
          {tab === "journal" && <Journal {...p} />}
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

function Dispense({ people, today, nowTime, dispensed, onDispense, audited, queries }: Props) {
  // Before dispensing: the doctor has not answered a 疑義照会 on it, and (for orders written since yesterday,
  // the ones in 処方監査) it has been audited. Older orders were audited before this record begins.
  const blockOf = (orderId: string): string | null => {
    const x = people.find((y) => y.entries.some((e) => e.id === orderId));
    const e = x?.entries.find((y) => y.id === orderId);
    const q = queries.find((y) => y.orderId === orderId && queryOpen(y, x?.entries ?? []));
    if (q) return `疑義照会の回答待ちです（${q.question}）。回答のあとで払い出してください。`;
    if (e && abs(e.day, e.time) >= -1440 && !audited[orderId]) return "まだ監査していません。「処方監査・疑義照会」で監査してから払い出してください。";
    return null;
  };
  const { lo, hi } = shiftWindow("all", 1);
  const sheet = buildWorksheet(people, lo, hi, abs(0, nowTime));
  const doses = sheet.timed.filter((i) => i.kind === "注射" && i.at !== null);
  const byPatient = people.map((x) => ({ ...x, doses: doses.filter((d) => d.patientId === x.patient.id) })).filter((x) => x.doses.length);
  const [scan, setScan] = useState("");
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [printing, setPrinting] = useState<React.ReactNode | null>(null);
  const labelsOf = (x: (typeof byPatient)[number]) =>
    x.doses.map((d) => (
      <DrugLabel
        key={labelFor(d.orderId, d.at!)}
        p={{ id: x.patient.id, name: x.patient.name, kana: x.patient.kana, ageSex: ageSex(x.patient), where: `${x.patient.ward} ${x.room}`, allergies: x.patient.allergies }}
        d={{ code: labelFor(d.orderId, d.at!), when: timeLabel(d.at!, -99, today), main: d.main, detail: d.detail }}
      />
    ));
  const print = (nodes: React.ReactNode, who: string, n: number) => {
    flushSync(() => setPrinting(<div className="flex flex-wrap content-start gap-[3mm]">{nodes}</div>));
    const done = () => {
      setPrinting(null);
      window.removeEventListener("afterprint", done);
    };
    window.addEventListener("afterprint", done);
    window.print();
    auditLog({ role: "薬剤師", actor: PHARMACIST, action: "注射ラベルを印刷した", patient: who, detail: `${n}枚` });
  };
  // 鑑査: read the label stuck on what was picked; it must be one of tomorrow's doses (照合 by code).
  const inspect = () => {
    const code = scan.trim().toUpperCase();
    if (!code) return;
    const hit = doses.find((d) => labelFor(d.orderId, d.at!) === code);
    if (!hit) setResult({ ok: false, text: `「${code}」は明日の注射のどの回でもありません。取りそろえを確かめてください。` });
    else {
      const key = `${hit.orderId}|${hit.at}`;
      const block = blockOf(hit.orderId);
      if (block) setResult({ ok: false, text: `${hit.name}さん ${hit.main}：${block}` });
      else if (dispensed[key]) setResult({ ok: false, text: `この回（${hit.name}さん ${timeLabel(hit.at!, -99, today)}）はもう払い出しています。` });
      else {
        onDispense(key);
        auditLog({ role: "薬剤師", actor: PHARMACIST, action: "鑑査一致・払出", patient: hit.name, detail: `${hit.main}　${timeLabel(hit.at!, -99, today)}` });
        setResult({ ok: true, text: `一致：${hit.name}さん　${timeLabel(hit.at!, -99, today)}　${hit.main}。払出の印を付けました。` });
      }
    }
    setScan("");
  };
  return (
    <section className="space-y-3">
      <p className="text-xs text-ink-soft">
        明日（{formatShort(addDays(today, 1))}）の注射を、患者ごと・1回ごとに並べます（オーダからコードで計算。持続の点滴は1本ごと）。ラベルを印刷し、取りそろえた薬のラベルを読んで鑑査すると払出の印が付きます。
      </p>
      <div className={`${card} flex flex-wrap items-center gap-2 p-3 text-[13px]`}>
        <b>鑑査</b>
        <input
          value={scan}
          onChange={(e) => setScan(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && inspect()}
          placeholder="ラベルのバーコードを読む（リーダーは Enter まで打ちます）"
          aria-label="ラベルのバーコード"
          className="nums min-w-64 flex-1 rounded border border-rule bg-paper px-2 py-1 font-mono"
        />
        <button type="button" onClick={inspect} className="rounded-md bg-ai px-3 py-1 font-bold text-white">
          照合
        </button>
        <button type="button" onClick={() => print(byPatient.flatMap(labelsOf), "全員", doses.length)} disabled={!doses.length} className="flex items-center gap-1 rounded-md border border-rule px-3 py-1 disabled:opacity-40">
          <Printer size={14} />
          全員のラベル（{doses.length}枚）
        </button>
        {result && <p className={`w-full font-bold ${result.ok ? "text-wakatake" : "text-shu"}`}>{result.text}</p>}
      </div>
      {byPatient.map((x) => (
        <div key={x.patient.id} className={`${card} p-4 text-[13px]`}>
          <h3 className="mb-1 flex items-center gap-2 font-bold">
            {x.room}　{x.patient.name}
            <button type="button" onClick={() => print(labelsOf(x), x.patient.name, x.doses.length)} className="ml-auto flex items-center gap-1 rounded border border-rule px-2 py-0.5 text-xs font-normal hover:border-ai hover:text-ai">
              <Printer size={13} />
              ラベルを印刷（{x.doses.length}枚）
            </button>
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
                  <span className="nums font-mono text-[11px] text-ink-faint">{labelFor(d.orderId, d.at!)}</span>
                  {blockOf(d.orderId) && !dispensed[key] ? (
                    <span className="max-w-56 text-[11px] font-bold text-shu" title={blockOf(d.orderId)!}>
                      {blockOf(d.orderId)!.startsWith("疑義") ? "疑義照会の回答待ち" : "未監査"}
                    </span>
                  ) : dispensed[key] ? (
                    <span className="flex items-center gap-0.5 text-xs text-wakatake">
                      <Check size={12} />
                      払出 {dispensed[key]}
                    </span>
                  ) : (
                    <button type="button" onClick={() => onDispense(key)} title="鑑査の欄でラベルを読むと、ここが自動で付きます" className="rounded border border-ai px-2 py-0.5 text-xs text-ai hover:bg-ai hover:text-white">
                      払い出した
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      {printing && typeof document !== "undefined" && createPortal(<div className="hidden bg-white p-[5mm] print:block">{printing}</div>, document.body)}
      {byPatient.length === 0 && <p className="text-ink-faint">明日の注射はありません。</p>}
      <p className="text-[11px] text-ink-faint">架空の病院・架空の患者です。</p>
    </section>
  );
}

// ---------------------------------------------------------------------------
// 血液製剤: transfusion orders confirmed by doctors, issued with the product's lot number (日報).
// ---------------------------------------------------------------------------

function Blood({ people, today, txIssued, onTxIssue }: Props) {
  const orders = people.flatMap((x) => x.entries.filter((e): e is OrderEntry => e.status === "有効" && e.order.type === "procedure" && !!e.order.tx).map((e) => ({ x, e })));
  const [lot, setLot] = useState<Record<string, string>>({});
  const issuedToday = orders.filter(({ e }) => txIssued[e.id]);
  return (
    <section className="space-y-3">
      {orders.length === 0 && <p className="text-ink-faint">輸血のオーダはありません（医師がカルテの「輸血」から出します）。</p>}
      {orders.map(({ x, e }) => {
        const o = e.order.type === "procedure" ? e.order : null;
        const done = txIssued[e.id];
        return (
          <article key={e.id} className={`${card} flex flex-wrap items-center gap-3 px-4 py-2.5 text-[13px]`}>
            <b>
              {x.room}　{x.patient.name}
            </b>
            <span>{o?.tx ? txText(o.tx) : ""}</span>
            <span className="text-xs text-ink-soft">
              {o ? `${formatShort(addDays(today, o.start.day))} ${o.start.time ?? ""}` : ""}　{e.author}
            </span>
            {done ? (
              <span className="ml-auto text-xs text-wakatake">
                払出 {done.at}　製造番号 {done.lot}（{done.by}）
              </span>
            ) : (
              <span className="ml-auto flex items-center gap-1.5">
                <input value={lot[e.id] ?? ""} onChange={(ev) => setLot((m) => ({ ...m, [e.id]: ev.target.value }))} placeholder="製造番号（ロット）" aria-label="製造番号" className="nums w-36 rounded border border-rule bg-paper px-2 py-0.5 font-mono" />
                <button type="button" disabled={!(lot[e.id] ?? "").trim()} onClick={() => onTxIssue(e.id, lot[e.id].trim())} className="rounded border border-ai px-2 py-0.5 text-xs text-ai hover:bg-ai hover:text-white disabled:opacity-40">
                  払い出した
                </button>
              </span>
            )}
          </article>
        );
      })}
      {issuedToday.length > 0 && (
        <div className={`${card} p-3 text-[12px]`}>
          <h3 className="mb-1 font-bold">今日の払出（日報）</h3>
          <table className="nums w-full">
            <tbody>
              {issuedToday.map(({ x, e }) => (
                <tr key={e.id} className="border-t border-rule-soft">
                  <td className="py-0.5 pr-2">{txIssued[e.id].at}</td>
                  <td className="pr-2">{x.patient.name}</td>
                  <td className="pr-2">{e.order.type === "procedure" && e.order.tx ? txText(e.order.tx) : ""}</td>
                  <td className="font-mono">{txIssued[e.id].lot}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[11px] text-ink-faint">製造番号は、あとで製剤に問題がわかったときに使った患者をたどるため（遡及調査）に残します。架空の病院・架空の患者です。</p>
    </section>
  );
}

// ---------------------------------------------------------------------------
// 病棟薬剤業務日誌: today's work counted by code, with the pharmacist's words.
// ---------------------------------------------------------------------------

function Journal({ people, nowTime, audited, queries, reports, shido, dispensed, txIssued, tdm, journal, onJournal, homeRx }: Props) {
  const [text, setText] = useState("");
  const shidoToday = Object.values(shido).flat().filter((r) => r.day === 0).length;
  const lines: [string, number][] = [
    ["処方監査（監査済み）", Object.keys(audited).length],
    ["疑義照会", queries.length],
    ["うち処方が変わったもの", queries.filter((q) => q.status === "変更").length],
    ["持参薬鑑別の報告", reports.length],
    ["服薬指導", shidoToday],
    ["注射の払出（回）", Object.keys(dispensed).length],
    ["血液製剤の払出", Object.keys(txIssued).length],
    ["退院時の薬の説明", Object.values(homeRx).filter((r) => r.handed).length],
    ["TDM の報告", tdm.length],
    ["担当の患者", people.length],
  ];
  return (
    <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <table className={`${card} nums self-start text-[13px]`}>
        <tbody>
          {lines.map(([k, v]) => (
            <tr key={k} className="border-b border-rule-soft">
              <th className="px-3 py-1.5 text-left font-normal text-ink-soft">{k}</th>
              <td className="px-3 py-1.5 text-right text-base font-bold">{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className={`${card} space-y-2 p-3 text-[13px]`}>
        <h3 className="text-xs font-bold text-ink-soft">所感（{nowTime} 時点）</h3>
        {journal.map((j, i) => (
          <p key={i} className="whitespace-pre-wrap border-l-2 border-ai/40 pl-2">
            <span className="nums block text-[11px] text-ink-faint">{j.at}</span>
            {j.text}
          </p>
        ))}
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} placeholder="例：5階東の持参薬鑑別2件。バンコマイシンの TDM は明日の採血で再評価。" aria-label="業務日誌の所感" className="w-full rounded border border-rule bg-paper px-2 py-1" />
        <button
          type="button"
          disabled={!text.trim()}
          onClick={() => {
            onJournal(text.trim());
            setText("");
          }}
          className="rounded-md bg-ai px-4 py-1.5 font-bold text-white disabled:opacity-40"
        >
          書き残す
        </button>
        <p className="text-[11px] text-ink-faint">件数はこの画面での記録からコードで数えています（架空のデータ）。</p>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// 退院時の薬: 退院時処方 → 調剤 → 鑑査 → 説明して渡す, with 薬袋, the 薬剤情報提供文書 and the
// お薬手帳 sticker printed from the order. Amounts are counted in code; the words can be edited.
// ---------------------------------------------------------------------------

export interface HomeRxRecord {
  dispensed?: { by: string; at: string };
  checked?: { by: string; at: string };
  handed?: { by: string; at: string; note: string };
  /** The pharmacist's own wording of 気をつけること, by drug code. */
  care?: Record<string, string[]>;
}

function Home({ people, today, nowTime, homeRx, onHomeRx }: Props) {
  const [printing, setPrinting] = useState<React.ReactNode | null>(null);
  const [note, setNote] = useState<Record<string, string>>({});
  const date = formatShort(today).replace(/（.）/, "");
  const list = people.map((x) => ({ x, bags: bagsOf(x.entries) })).filter((r) => r.bags.length);
  const print = (node: React.ReactNode, what: string, who: string) => {
    flushSync(() => setPrinting(node));
    const done = () => {
      setPrinting(null);
      window.removeEventListener("afterprint", done);
    };
    window.addEventListener("afterprint", done);
    window.print();
    auditLog({ role: "薬剤師", actor: PHARMACIST, action: `${what}を印刷した`, patient: who });
  };
  if (!list.length) return <p className="text-ink-faint">退院時処方はありません（医師が内服の区分「退院時」で出します）。</p>;
  return (
    <section className="space-y-4">
      {list.map(({ x, bags }) => {
        const rec = homeRx[x.patient.id] ?? {};
        const hp = { id: x.patient.id, name: x.patient.name, kana: x.patient.kana, ageSex: ageSex(x.patient), allergies: x.patient.allergies };
        const care = (code: string) => rec.care?.[code] ?? drugInfoOf(code).care;
        const by = { dispensed: rec.dispensed?.by.replace("薬剤師 ", ""), checked: rec.checked?.by.replace("薬剤師 ", "") };
        const leave = x.entries.find((e) => e.status === "有効" && e.order.type === "procedure" && e.order.leave?.kind === "退院");
        const leaveText = leave && leave.order.type === "procedure" ? `退院 ${formatShort(addDays(today, leave.order.start.day))} ${leave.order.start.time ?? ""}` : "退院日は未入力";
        const step = (label: string, done: { by: string; at: string } | undefined, can: boolean, act: () => void, warn?: string) => (
          <div className={`flex min-w-40 flex-1 flex-col gap-1 rounded-md border px-3 py-2 ${done ? "border-wakatake/50 bg-wakatake-soft/40" : "border-rule"}`}>
            <span className="text-xs font-bold text-ink-soft">{label}</span>
            {done ? (
              <span className="flex items-center gap-1 text-xs text-wakatake">
                <Check size={12} />
                {done.at}　{done.by}
              </span>
            ) : (
              <button type="button" disabled={!can} onClick={act} className="self-start rounded border border-ai px-2 py-0.5 text-xs text-ai hover:bg-ai hover:text-white disabled:opacity-40">
                {label.replace(/^[①-③]/, "")}した
              </button>
            )}
            {warn && <span className="text-[11px] text-yamabuki">{warn}</span>}
          </div>
        );
        return (
          <article key={x.patient.id} className={`${card} space-y-3 p-4 text-[13px]`}>
            <h3 className="flex flex-wrap items-baseline gap-2 font-bold">
              {x.room}　{x.patient.name}
              <span className="text-xs font-normal text-ink-soft">
                {leaveText}　／　処方 {formatShort(addDays(today, bags[0].at.day))} {bags[0].at.time} {bags[0].doctor}
              </span>
            </h3>
            <ol className="space-y-1">
              {bags.map((b, i) => (
                <li key={b.rp} className="nums">
                  <b>Rp{i + 1}</b>（{b.kind}）{bagLine(b)}
                  <span className="ml-2 text-xs text-ink-soft">計 {b.drugs.map((d) => `${d.name} ${d.total ?? "？"}${d.unit}`).join("・")}</span>
                </li>
              ))}
            </ol>
            <div className="flex flex-wrap gap-2">
              {step("①調剤", rec.dispensed, true, () => {
                auditLog({ role: "薬剤師", actor: PHARMACIST, action: "退院時処方を調剤した", patient: x.patient.name });
                onHomeRx(x.patient.id, { dispensed: { by: PHARMACIST, at: `${date} ${nowTime}` } });
              })}
              {step(
                "②鑑査",
                rec.checked,
                !!rec.dispensed,
                () => {
                  auditLog({ role: "薬剤師", actor: PHARMACIST, action: "退院時処方を鑑査した", patient: x.patient.name });
                  onHomeRx(x.patient.id, { checked: { by: PHARMACIST, at: `${date} ${nowTime}` } });
                },
                rec.dispensed && !rec.checked ? "調剤した人とは別の薬剤師が鑑査するのが望ましい（このデモの薬剤師は1人です）" : undefined,
              )}
              <div className={`flex min-w-56 flex-[2] flex-col gap-1 rounded-md border px-3 py-2 ${rec.handed ? "border-wakatake/50 bg-wakatake-soft/40" : "border-rule"}`}>
                <span className="text-xs font-bold text-ink-soft">③説明して渡す</span>
                {rec.handed ? (
                  <span className="text-xs text-wakatake">
                    <Check size={12} className="inline" /> {rec.handed.at}　{rec.handed.by}
                    {rec.handed.note && <span className="block text-ink">{rec.handed.note}</span>}
                  </span>
                ) : (
                  <>
                    <input value={note[x.patient.id] ?? ""} onChange={(e) => setNote((m) => ({ ...m, [x.patient.id]: e.target.value }))} placeholder="誰に・何を説明したか（例：本人と長女に。ふらつき時は連絡）" aria-label="説明の記録" className="rounded border border-rule bg-paper px-2 py-0.5 text-xs" />
                    <button
                      type="button"
                      disabled={!rec.checked || !(note[x.patient.id] ?? "").trim()}
                      onClick={() => {
                        auditLog({ role: "薬剤師", actor: PHARMACIST, action: "退院時の薬を説明して渡した", patient: x.patient.name, detail: note[x.patient.id] });
                        onHomeRx(x.patient.id, { handed: { by: PHARMACIST, at: `${date} ${nowTime}`, note: note[x.patient.id].trim() } });
                      }}
                      className="self-start rounded border border-ai px-2 py-0.5 text-xs text-ai hover:bg-ai hover:text-white disabled:opacity-40"
                    >
                      説明して渡した
                    </button>
                  </>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => print(<div className="flex flex-wrap gap-[4mm]">{bags.map((b) => <MedBagFace key={b.rp} p={hp} b={b} date={date} by={by} />)}</div>, "薬袋", x.patient.name)} className="flex items-center gap-1 rounded-md border border-rule px-3 py-1 hover:border-ai hover:text-ai">
                <Printer size={14} />
                薬袋（{bags.length}枚）
              </button>
              <button type="button" onClick={() => print(<DrugInfoSheet p={hp} bags={bags} care={care} date={date} pharmacist={PHARMACIST} />, "薬剤情報提供文書", x.patient.name)} className="flex items-center gap-1 rounded-md border border-rule px-3 py-1 hover:border-ai hover:text-ai">
                <Printer size={14} />
                お薬の説明書（A4）
              </button>
              <button type="button" onClick={() => print(<NotebookSticker p={hp} bags={bags} date={date} doctor={bags[0].doctor} />, "お薬手帳のシール", x.patient.name)} className="flex items-center gap-1 rounded-md border border-rule px-3 py-1 hover:border-ai hover:text-ai">
                <Printer size={14} />
                お薬手帳のシール
              </button>
            </div>
            <details className="rounded-md border border-rule-soft bg-paper p-2">
              <summary className="cursor-pointer text-xs font-bold text-ink-soft">説明書の「気をつけること」を見る・直す</summary>
              <div className="mt-2 grid gap-2 md:grid-cols-2">
                {bags.flatMap((b) =>
                  b.drugs.map((d) => (
                    <label key={`${b.rp}-${d.code}`} className="block text-xs">
                      <b>
                        {d.name} {d.strength}
                      </b>
                      <span className="ml-1 text-ink-soft">{d.info.what}</span>
                      <textarea
                        value={care(d.code).join("\n")}
                        onChange={(e) => onHomeRx(x.patient.id, { care: { ...(rec.care ?? {}), [d.code]: e.target.value.split("\n") } })}
                        rows={3}
                        aria-label={`${d.name} の気をつけること`}
                        className="mt-0.5 w-full rounded border border-rule bg-white px-2 py-1"
                      />
                    </label>
                  )),
                )}
              </div>
              <p className="mt-1 text-[11px] text-ink-faint">1行が1項目です。最初の文面は添付文書をもとにした要約（{DRUG_INFO_SOURCE.label}）で、印刷の前に薬剤師が確かめます。</p>
            </details>
            <div className="flex flex-wrap items-start gap-3 overflow-x-auto rounded-md border border-rule bg-paper p-2">
              {bags.map((b) => (
                <MedBagFace key={b.rp} p={hp} b={b} date={date} by={by} />
              ))}
              <NotebookSticker p={hp} bags={bags} date={date} doctor={bags[0].doctor} />
            </div>
          </article>
        );
      })}
      {printing && typeof document !== "undefined" && createPortal(<div className="hidden bg-white p-[8mm] print:block">{printing}</div>, document.body)}
    </section>
  );
}
