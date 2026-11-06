"use client";

import { displayText } from "@/lib/display-text";
import { ClipboardCheck, Download, FileInput, FileSearch, Loader2, RefreshCw, Undo2 } from "lucide-react";
import { useEffect, useEffectEvent, useMemo, useState } from "react";
import { auditLog } from "@/lib/audit";
import { HOSPITAL } from "@/lib/billing/facility";
import { INSPECT_KINDS, inspectCounts, inspectItems, type InspectKind } from "@/lib/billing/inspect";
import type { PatientInspection } from "@/lib/billing/inspect-run";
import type { PatientMonthPayload } from "@/lib/billing/payload";
import {
  actionKey,
  decodeSjis,
  JIYU,
  KASHO,
  mockHenrei,
  mockName,
  mockZogen,
  parseHenrei,
  parseZogen,
  RESUBMIT_FOR,
  RETURN_SOURCES,
  returnKind,
  zogenSummary,
  type ImportedReturn,
  type ResubmitKind,
  type ReturnDesk,
} from "@/lib/billing/returns";
import { encodeSjis } from "@/lib/billing/sjis";
import { isoDate, type CalendarDate } from "@/lib/dates";
import type { Diagnosis } from "@/lib/diagnoses";
import { CARDS } from "@/lib/opd-desk";
import type { Patient } from "@/lib/types";
import { saveFile, Sources, SubTabs } from "./DeskParts";
import { useDeny, useMe } from "./RoleContext";

type Tab = "inspect" | "import" | "resubmit";

const KIND_TONE: Record<InspectKind, string> = {
  病名と算定の不一致: "border-fuji/40 bg-fuji-soft text-fuji",
  算定漏れの候補: "border-shu/40 bg-shu-soft text-shu",
  人が選ぶ: "border-yamabuki/40 bg-yamabuki-soft text-yamabuki",
  確かめる: "border-yamabuki/40 bg-yamabuki-soft text-yamabuki",
  算定から外したもの: "border-rule bg-paper text-ink-soft",
};

const prevMonth = (m: string) => {
  const [y, mm] = m.split("-").map(Number);
  return mm === 1 ? `${y - 1}-12` : `${y}-${String(mm - 1).padStart(2, "0")}`;
};

/**
 * レセプト点検・返戻: the 点検の一覧 (the claim's and the receipt's own checks of this month, gathered), the
 * 返戻・査定 files read in the published CSV layout, and the 再請求・再審査請求 decided by 医事課.
 */
export function ReceiptDesk({
  patients,
  diagnoses,
  today,
  nowTime,
  payload,
  onOpen,
  desk,
  onDesk,
}: {
  patients: Patient[];
  diagnoses: Record<string, Diagnosis[]>;
  today: CalendarDate;
  nowTime: string;
  payload: () => PatientMonthPayload[];
  onOpen: (patientId: string, where: "billing" | "diagnoses") => void;
  desk: ReturnDesk;
  onDesk: (f: (d: ReturnDesk) => ReturnDesk) => void;
}) {
  const [tab, setTab] = useState<Tab>("inspect");
  const month = `${today.y}-${String(today.m).padStart(2, "0")}`;
  const files = desk.files.map((f) => ({ f, zogen: f.kind === "増減点連絡書" ? parseZogen(f.text) : null, henrei: f.kind === "返戻内訳書" ? parseHenrei(f.text) : null }));
  const undecided = files.reduce((n, x) => n + [...(x.zogen?.receipts ?? []), ...(x.henrei?.receipts ?? [])].filter((r) => !desk.actions[actionKey(x.f.id, r.uketsuke)]).length, 0);
  return (
    <section aria-label="レセプト点検・返戻" className="scroll-thin min-h-0 flex-1 overflow-auto bg-paper">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-rule bg-sheet px-5 py-3">
        <h1 className="flex items-center gap-1.5 text-lg font-bold">
          <FileSearch size={18} className="text-ai" />
          レセプト点検・返戻

        </h1>
        <SubTabs
          label="レセプトの画面"
          value={tab}
          onChange={setTab}
          tabs={[
            { key: "inspect", label: "点検の一覧", icon: ClipboardCheck },
            { key: "import", label: "返戻・査定の取り込み", icon: FileInput },
            { key: "resubmit", label: "再請求の記録", icon: Undo2, badge: undecided },
          ]}
        />
        <span className="text-[12px] text-ink-soft">オンライン請求にはつないでいません（模擬）。</span>
      </header>
      <div className="space-y-4 px-5 py-4 text-[13px]">
        {tab === "inspect" && <Inspect patients={patients} diagnoses={diagnoses} today={today} nowTime={nowTime} month={month} payload={payload} onOpen={onOpen} />}
        {tab === "import" && <Import files={files} month={month} nowTime={nowTime} onDesk={onDesk} />}
        {tab === "resubmit" && <Resubmit files={files} desk={desk} nowTime={nowTime} onDesk={onDesk} />}

      </div>
    </section>
  );
}

function Inspect({ patients, diagnoses, today, nowTime, month, payload, onOpen }: { patients: Patient[]; diagnoses: Record<string, Diagnosis[]>; today: CalendarDate; nowTime: string; month: string; payload: () => PatientMonthPayload[]; onOpen: (id: string, where: "billing" | "diagnoses") => void }) {
  const [checks, setChecks] = useState<PatientInspection[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runs, setRuns] = useState(0);
  const [only, setOnly] = useState<InspectKind | "">("");
  const request = useEffectEvent(() => ({ today: isoDate(today), nowTime, month, patients: payload() }));
  useEffect(() => {
    const ctl = new AbortController();
    (async () => {
      const body = request();
      if (!body.patients.length) return setChecks([]);
      setBusy(true);
      setError(null);
      try {
        const res = await fetch("/api/receipt-check", { method: "POST", headers: { "content-type": "application/json" }, signal: ctl.signal, body: JSON.stringify(body) });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? `エラー（${res.status}）`);
        setChecks(json.patients as PatientInspection[]);
      } catch (e) {
        if (ctl.signal.aborted) return;
        setError(e instanceof Error ? e.message : "点検ができませんでした。");
      } finally {
        if (!ctl.signal.aborted) setBusy(false);
      }
    })();
    return () => ctl.abort();
  }, [runs]);
  const rows = useMemo(() => (checks ?? []).filter((c) => c.days > 0).map((c) => ({ c, p: patients.find((p) => p.id === c.id)!, items: inspectItems(c.issues, c.receiptProblems, diagnoses[c.id] ?? []) })).filter((r) => r.p), [checks, patients, diagnoses]);
  const counts = inspectCounts(rows);
  return (
    <>

      <p className="text-xs">請求内容の未解決 {checks ? checks.reduce((n, p) => n + p.unresolved, 0) : "…"}件・ファイル形式とは別に点検</p>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {INSPECT_KINDS.map((k) => (
          <button key={k} type="button" onClick={() => setOnly(only === k ? "" : k)} aria-pressed={only === k} className={`nums rounded-md border px-2 py-1 ${counts[k] ? KIND_TONE[k] : "border-rule bg-sheet text-ink-faint"} ${only === k ? "ring-2 ring-ai" : ""}`}>
            {k} <b>{checks ? counts[k] : "…"}</b>
          </button>
        ))}
        <button type="button" onClick={() => setRuns((n) => n + 1)} disabled={busy} className="ml-auto flex items-center gap-1 rounded-md border border-rule bg-sheet px-2 py-1 text-ink-soft hover:text-ink disabled:opacity-50">
          {busy ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
          点検し直す
        </button>
      </div>
      {error && <p className="rounded-md border border-shu/40 bg-shu-soft px-3 py-2 text-sm text-shu">{error}</p>}
      <table className="w-auto table-auto self-start border-collapse rounded-lg bg-sheet text-[12px]">
        <thead>
          <tr className="border-b border-rule text-left text-ink-soft">
            <th className="px-2 py-1.5">患者</th>
            <th className="px-2">点数・日数</th>
            <th className="px-2">点検</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ c, p, items }) => {
            const list = only ? items.filter((i) => i.kind === only) : items;
            if (only && !list.length) return null;
            return (
              <tr key={c.id} className="border-b border-rule-soft align-top">
                <td className="px-2 py-1.5">
                  <button type="button" onClick={() => onOpen(p.id, "billing")} className="text-left font-bold text-ai hover:underline">
                    {p.room} {p.name}
                  </button>
                  <div className="nums text-[11px] text-ink-faint">
                    {p.id}・{p.attending}
                  </div>
                </td>
                <td className="nums px-2 py-1.5">
                  {c.points.toLocaleString("ja-JP")}点・{c.days}日
                </td>
                <td className="px-2 py-1.5">
                  {list.length === 0 ? (
                    <span className="text-ink-faint">点検で出たものはありません</span>
                  ) : (
                    <ul className="space-y-1">
                      {list.map((i) => (
                        <li key={i.kind + i.text} className="leading-snug">
                          <span className={`mr-1 rounded border px-1 text-[10px] font-bold ${KIND_TONE[i.kind]}`}>{i.kind}</span>
                          {displayText(i.text)}
                          <span className="ml-1 text-[10px] text-ink-faint">（{displayText(i.from)}）</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="mt-1 flex gap-1.5">
                    <button type="button" onClick={() => onOpen(p.id, "billing")} className="rounded border border-rule bg-sheet px-1.5 py-0.5 text-[11px] text-ai hover:border-ai">
                      算定を開く
                    </button>
                    {items.some((i) => i.kind === "病名と算定の不一致") && (
                      <button type="button" onClick={() => onOpen(p.id, "diagnoses")} className="rounded border border-rule bg-sheet px-1.5 py-0.5 text-[11px] text-ai hover:border-ai">
                        病名を開く
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {checks && !rows.length && <p className="text-xs text-ink-faint">今月に算定する入院の患者はいません。</p>}
      <ul className="space-y-0.5 text-[11px] text-ink-soft">
        <li>病名と算定の不一致：算定の計算が病名・傷病名について出した点検と、レセプトの点検（傷病名がない・主傷病がない・未コード化傷病名）。病名を直すのは医師です。</li>
        <li>算定漏れの候補：算定の計算が「入っていない」「足してください」「算定し直してください」と出したもの（例：造影剤の薬剤料、退院の日に算定する加算）。</li>
        <li>算定から外したもの：背反・回数の上限・届出なしで計算が外したもの（外した理由を確かめるため）。</li>
      </ul>
    </>
  );
}

type Parsed = { f: ImportedReturn; zogen: ReturnType<typeof parseZogen> | null; henrei: ReturnType<typeof parseHenrei> | null };

function patientLabel(karte: string, name: string) {
  const card = CARDS.find((c) => c.cardNo === karte);
  return card ? `${card.name}（診察券 ${karte}）` : `${name}（${karte || "カルテ番号なし"}）`;
}

function Import({ files, month, nowTime, onDesk }: { files: Parsed[]; month: string; nowTime: string; onDesk: (f: (d: ReturnDesk) => ReturnDesk) => void }) {
  const me = useMe();
  const locked = useDeny()("receipt");
  const [error, setError] = useState<string | null>(null);
  const claim = prevMonth(month);
  const o = { claimMonth: claim, processMonth: month, hospitalCode: HOSPITAL.code, hospitalName: HOSPITAL.name };
  const zName = mockName("zogn", HOSPITAL.code, HOSPITAL.prefecture, month);
  const hName = mockName("henr", HOSPITAL.code, HOSPITAL.prefecture, month);
  const add = (name: string, text: string) => {
    const kind = returnKind(text);
    if (!kind) {
      setError(`${name}：増減点連絡書か返戻内訳書の CSV ではありません（タイトルの行がありません）。`);
      return;
    }
    setError(null);
    auditLog({ role: me.role, actor: me.name, action: `${kind}を取り込んだ`, detail: name });
    onDesk((d) => ({ ...d, files: [...d.files, { id: `${Date.now().toString(36)}${d.files.length}`, name, kind, text, by: me.name, at: nowTime }] }));
  };
  const zogens = files.flatMap((x) => (x.zogen ? [x.zogen] : []));
  const s = zogenSummary(zogens);
  return (
    <>
      <div className="rounded-lg border border-rule bg-sheet p-3">
        <h2 className="font-bold">ファイルを取り込む</h2>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <label className={`flex items-center gap-1 rounded-md border border-rule px-2 py-1 ${locked ? "opacity-40" : "cursor-pointer hover:border-ai hover:text-ai"}`}>
            <FileInput size={14} />
            CSV を選んで取り込む
            <input
              type="file"
              accept=".csv,text/csv"
              multiple
              disabled={!!locked}
              className="hidden"
              onChange={async (e) => {
                for (const file of [...(e.target.files ?? [])]) add(file.name, decodeSjis(new Uint8Array(await file.arrayBuffer())));
                e.target.value = "";
              }}
            />
          </label>
          <button type="button" disabled={!!locked} onClick={() => (add(`${zName}（模擬）`, mockZogen(o)), add(`${hName}（模擬）`, mockHenrei(o)))} className="rounded-md border border-rule px-2 py-1 hover:border-ai hover:text-ai disabled:opacity-40">
            模擬のファイル2つをそのまま取り込む
          </button>
          <button type="button" onClick={() => saveFile(zName, encodeSjis(mockZogen(o)), "text/csv;charset=shift_jis")} className="flex items-center gap-1 rounded-md border border-rule px-2 py-1 hover:border-ai hover:text-ai">
            <Download size={14} />
            模擬の増減点連絡書を保存
          </button>
          <button type="button" onClick={() => saveFile(hName, encodeSjis(mockHenrei(o)), "text/csv;charset=shift_jis")} className="flex items-center gap-1 rounded-md border border-rule px-2 py-1 hover:border-ai hover:text-ai">
            <Download size={14} />
            模擬の返戻内訳書を保存
          </button>
        </div>
        {locked && <p className="mt-1 text-[11px] text-ink-soft">{locked}</p>}
        {error && <p className="mt-1 text-[12px] text-shu">{error}</p>}
      </div>

      {files.length > 0 && (
        <table className="w-auto table-auto self-start border-collapse rounded-lg bg-sheet text-[12px]">
          <thead>
            <tr className="border-b border-rule text-left text-ink-soft">
              <th className="px-2 py-1.5">ファイル</th>
              <th className="px-2">種類</th>
              <th className="px-2">診療月</th>
              <th className="px-2">審査支払機関</th>
              <th className="px-2 text-right">件数</th>
              <th className="px-2">取り込み</th>
            </tr>
          </thead>
          <tbody>
            {files.map(({ f, zogen, henrei }) => {
              const head = (zogen ?? henrei)!.header;
              const problems = (zogen ?? henrei)!.problems;
              return (
                <tr key={f.id} className="border-b border-rule-soft align-top">
                  <td className="px-2 py-1.5 break-all">
                    {f.name}
                    {problems.length > 0 && <div className="text-[11px] text-shu">{problems.slice(0, 3).join("／")}</div>}
                  </td>
                  <td className="px-2">{f.kind}</td>
                  <td className="px-2">{head.month ?? "—"}</td>
                  <td className="px-2">{head.payer}</td>
                  <td className="nums px-2 text-right">{(zogen ?? henrei)!.receipts.length}</td>
                  <td className="px-2 text-[11px] text-ink-soft">
                    {f.at} {displayText(f.by)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {zogens.length > 0 && (
        <section>
          <h2 className="mb-1 font-bold">
            査定（増減点連絡書）　合計 <span className="nums">{s.total.toLocaleString("ja-JP")}</span>点
          </h2>
          <div className="mb-2 grid gap-2 lg:grid-cols-2">
            <Summary title="事由ごと" rows={s.byJiyu.map((x) => ({ label: `${x.code}　${JIYU[x.code] ?? "（表にない記号）"}`, ...x }))} />
            <Summary title="箇所ごと" rows={s.byKasho.map((x) => ({ label: `${x.code}　${KASHO[x.code] ?? ""}`, ...x }))} />
          </div>
          <table className="w-auto table-auto self-start border-collapse rounded-lg bg-sheet text-[12px]">
            <thead>
              <tr className="border-b border-rule text-left text-ink-soft">
                <th className="px-2 py-1.5">患者</th>
                <th className="px-2">箇所</th>
                <th className="px-2 text-right">増減点</th>
                <th className="px-2">事由</th>
                <th className="px-2">請求内容 → 補正・査定後内容</th>
              </tr>
            </thead>
            <tbody>
              {zogens.flatMap((z) =>
                z.receipts.flatMap((r) =>
                  r.items.map((i, k) => (
                    <tr key={`${r.uketsuke}-${k}`} className="border-b border-rule-soft align-top">
                      <td className="px-2 py-1.5">
                        {k === 0 && (
                          <>
                            {patientLabel(r.karte, r.name)}
                            <div className="nums text-[11px] text-ink-faint">
                              {r.month}・{r.kubun}・受付番号 {r.uketsuke}
                              {r.total && `・請求 ${r.total.claimed ?? "—"} → 決定 ${r.total.decided ?? "—"}`}
                            </div>
                          </>
                        )}
                      </td>
                      <td className="px-2 py-1.5">
                        {i.kasho} {KASHO[i.kasho]}
                      </td>
                      <td className={`nums px-2 py-1.5 text-right ${(i.points ?? 0) < 0 ? "text-shu" : ""}`}>{i.points ?? "—"}</td>
                      <td className="px-2 py-1.5">
                        {i.jiyu.split("").map((c) => (
                          <div key={c}>
                            <b>{c}</b> <span className="text-[11px] text-ink-soft">{JIYU[c] ?? "（表にない記号）"}</span>
                          </div>
                        ))}
                      </td>
                      <td className="px-2 py-1.5">
                        {i.before || "—"} → <b>{i.after || "（削除）"}</b>
                      </td>
                    </tr>
                  )),
                ),
              )}
            </tbody>
          </table>
        </section>
      )}

      {files.some((x) => x.henrei) && (
        <section>
          <h2 className="mb-1 font-bold">返戻（返戻内訳書）</h2>
          <table className="w-auto table-auto self-start border-collapse rounded-lg bg-sheet text-[12px]">
            <thead>
              <tr className="border-b border-rule text-left text-ink-soft">
                <th className="px-2 py-1.5">患者</th>
                <th className="px-2">受付番号</th>
                <th className="px-2 text-right">請求点数</th>
                <th className="px-2">事由コード</th>
                <th className="px-2">事由</th>
              </tr>
            </thead>
            <tbody>
              {files.flatMap((x) =>
                (x.henrei?.receipts ?? []).map((r) => (
                  <tr key={x.f.id + r.uketsuke} className="border-b border-rule-soft">
                    <td className="px-2 py-1.5">
                      {patientLabel(r.karte, r.name)}
                      <div className="text-[11px] text-ink-faint">
                        {r.month}・{r.kubun}・{r.days}日
                      </div>
                    </td>
                    <td className="nums px-2">{r.uketsuke}</td>
                    <td className="nums px-2 text-right">{r.points?.toLocaleString("ja-JP")}</td>
                    <td className="nums px-2">{r.code}</td>
                    <td className="px-2">{displayText(r.reason)}</td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
          <p className="mt-1 text-[11px] text-ink-soft">返戻の事由コードの一覧は公開されていないため、ファイルに書かれた事由の文をそのまま出します。</p>
        </section>
      )}
      <Sources items={RETURN_SOURCES} />
    </>
  );
}

function Summary({ title, rows }: { title: string; rows: { label: string; count: number; points: number }[] }) {
  return (
    <table className="w-auto table-auto self-start border-collapse rounded-lg bg-sheet text-[12px]">
      <thead>
        <tr className="border-b border-rule text-left text-ink-soft">
          <th className="px-2 py-1">{title}</th>
          <th className="px-2 text-right">件数</th>
          <th className="px-2 text-right">点数</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.label} className="border-b border-rule-soft">
            <td className="px-2 py-1">{r.label}</td>
            <td className="nums px-2 text-right">{r.count}</td>
            <td className="nums px-2 text-right">{r.points}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Resubmit({ files, desk, nowTime, onDesk }: { files: Parsed[]; desk: ReturnDesk; nowTime: string; onDesk: (f: (d: ReturnDesk) => ReturnDesk) => void }) {
  const me = useMe();
  const locked = useDeny()("receipt");
  const items = files.flatMap((x) => [
    ...(x.henrei?.receipts ?? []).map((r) => ({ key: actionKey(x.f.id, r.uketsuke), kind: "返戻内訳書" as const, who: patientLabel(r.karte, r.name), what: `${r.code} ${r.reason}`, points: r.points })),
    ...(x.zogen?.receipts ?? []).map((r) => ({ key: actionKey(x.f.id, r.uketsuke), kind: "増減点連絡書" as const, who: patientLabel(r.karte, r.name), what: r.items.map((i) => `${i.kasho} ${KASHO[i.kasho] ?? ""} ${i.points ?? ""}点（${i.jiyu}）`).join("、"), points: r.total?.change ?? null })),
  ]);
  if (!items.length) return <p className="text-ink-faint">取り込んだ返戻・査定はまだありません。「返戻・査定の取り込み」で取り込みます。</p>;
  return (
    <>

      {locked && <p className="text-[11px] text-ink-soft">{locked}</p>}
      <table className="w-auto table-auto self-start border-collapse rounded-lg bg-sheet text-[12px]">
        <thead>
          <tr className="border-b border-rule text-left text-ink-soft">
            <th className="px-2 py-1.5">種類</th>
            <th className="px-2">患者</th>
            <th className="px-2">内容</th>
            <th className="px-2">決めたこと</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <tr key={it.key} className="border-b border-rule-soft align-top">
              <td className="px-2 py-1.5">{it.kind === "返戻内訳書" ? "返戻" : "査定"}</td>
              <td className="px-2 py-1.5">{it.who}</td>
              <td className="px-2 py-1.5">
                {it.what}
                {it.points !== null && <span className="nums ml-1 text-ink-soft">（{it.points}点）</span>}
              </td>
              <td className="px-2 py-1.5">
                {desk.actions[it.key] ? (
                  <span className="text-wakatake">
                    <b>{desk.actions[it.key].kind}</b>
                    {displayText(desk.actions[it.key].note && `：${desk.actions[it.key].note}`)}
                    <span className="block text-[11px] text-ink-faint">
                      {desk.actions[it.key].time} {displayText(desk.actions[it.key].by)}
                    </span>
                  </span>
                ) : (
                  <Decide
                    choices={RESUBMIT_FOR[it.kind]}
                    locked={locked}
                    onDecide={(kind, note) => {
                      auditLog({ role: me.role, actor: me.name, action: `${kind}と記録した`, detail: `${it.who}　${note}`.slice(0, 200) });
                      onDesk((d) => ({ ...d, actions: { ...d.actions, [it.key]: { kind, note, by: me.name, day: 0, time: nowTime } } }));
                    }}
                  />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function Decide({ choices, locked, onDecide }: { choices: ResubmitKind[]; locked: string | null; onDecide: (k: ResubmitKind, note: string) => void }) {
  const [k, setK] = useState<ResubmitKind | "">("");
  const [note, setNote] = useState("");
  return (
    <span className="flex flex-wrap items-center gap-1">
      <select value={k} onChange={(e) => setK(e.target.value as ResubmitKind)} disabled={!!locked} aria-label="決めたこと" className="rounded border border-rule bg-sheet px-1 py-0.5 text-[11px]">
        <option value="">選ぶ</option>
        {choices.map((c) => (
          <option key={c}>{c}</option>
        ))}
      </select>
      <input value={note} onChange={(e) => setNote(e.target.value)} disabled={!!locked} placeholder="直したこと・理由" className="w-44 rounded border border-rule bg-sheet px-1 py-0.5 text-[11px]" />
      <button type="button" disabled={!k || !!locked} onClick={() => k && onDecide(k, note.trim())} className="rounded border border-rule bg-sheet px-1.5 py-0.5 text-[11px] text-ai hover:border-ai disabled:opacity-40">
        記録する
      </button>
    </span>
  );
}

/* Help migration source (references and dynamic wording):
<p >取り込んだファイルと再請求の記録は、このブラウザの中にあり、監査ログに残ります。計算と点検はコードで行い、AI は使いません。</p>
<p >
        {Number(month.slice(5))}月分のレセプトを、算定の画面と同じ計算（告示・通知・マスター）と、レセプトのファイル（RECEIPTC.UKE）と同じ点検（記録条件仕様）に通し、出てきた点検を患者ごとに並べます。新しい決まりは足していません。直すかどうか・どれを選ぶかは人が決めます。
      </p>
<p >返戻は直して再請求するか、査定は再審査を請求するかを、医事課が決めて記録します（医学的な判断が要るものは医師と相談）。再請求のファイル（RECEIPTC.UKE の再請求分）を作ること、オンライン請求で送ることは、この試作ではしません（模擬）。</p>
*/

/* ヘルプへ移動した説明:
オンライン請求から受け取る増減点連絡書（ ）と返戻内訳書（ ）の CSV を、公開されている記録の形のとおりに読みます（Shift_JIS）。この試作はオンライン請求につないでいないので、模擬のファイル（ 月診療分・外来の患者）を作って試せます。
*/
