"use client";

import { displayText } from "@/lib/display-text";
import { Printer } from "lucide-react";
import { useState } from "react";
import { createPortal, flushSync } from "react-dom";
import { auditLog } from "@/lib/audit";
import { addDays, formatShort, type CalendarDate } from "@/lib/dates";
import { NARCOTICS, classOf, docUrl } from "@/lib/drug-class";
import { anyDrugName } from "@/lib/master";
import {
  ACCIDENT_KINDS,
  accidentText,
  accountRows,
  balance,
  countStock,
  disposeLeftover,
  disposeReturned,
  dispensedFor,
  dispenseOral,
  fileAccident,
  fileNotice,
  oralBlock,
  oralQty,
  receiveSlip,
  receiveStock,
  recordAccident,
  unitOf,
  witnessProblem,
  type AccidentKind,
  type NarcoticBook,
  type When,
} from "@/lib/narcotic-book";
import { LICENCES, NARCOTIC_MANAGER, NARCOTIC_RULES, licenceOf, narcoticOrders, rxComplete, rxItems, usageText, type RxItem } from "@/lib/narcotics";
import { STAFF } from "@/lib/roles";
import type { OrderEntry } from "@/lib/types";
import type { WorkPatient } from "@/lib/worksheet";
import { DrugMarks } from "./DrugMarks";

const card = "rounded-lg border border-rule bg-sheet";
const ME = STAFF.薬剤師.name;
/** Fictional staff who can witness a 廃棄 (他の職員1名以上). */
const WITNESSES = ["薬剤師 吉田", STAFF.看護師.name, STAFF.医師.name];
const METHODS = ["放流", "焼却", "粉砕"];

interface Props {
  people: WorkPatient[];
  today: CalendarDate;
  nowTime: string;
  book: NarcoticBook;
  onBook: (f: (b: NarcoticBook) => NarcoticBook) => void;
  newId: () => string;
  /** Why an order cannot be dispensed yet (疑義照会の回答待ち・未監査: pharmacy.ts dispenseBlock), or null. */
  blockOf?: (orderId: string) => string | null;
  onAudit?: (orderId: string) => void;
}

/** 薬剤部の麻薬の管理: 麻薬処方箋の確認と払出、施用票の受領、残液の廃棄、病棟からの返納、受払簿、照合、事故届（模擬）. */
export function NarcoticDesk({ people, today, nowTime, book, onBook, newId, blockOf, onAudit }: Props) {
  const now: When = { day: 0, time: nowTime };
  const day = (d: number) => formatShort(addDays(today, d));
  const who = (pid: string | undefined) => people.find((x) => x.patient.id === pid);
  const label = (pid: string | undefined) => {
    const x = who(pid);
    return x ? `${x.patient.name}（ID ${x.patient.id}）` : (pid ?? "");
  };
  const orders = people.flatMap((x) => narcoticOrders(x.entries, -1).map((e) => ({ x, e })));
  const [printing, setPrinting] = useState<React.ReactNode | null>(null);
  const print = (node: React.ReactNode) => {
    flushSync(() => setPrinting(node));
    const done = () => {
      setPrinting(null);
      window.removeEventListener("afterprint", done);
    };
    window.addEventListener("afterprint", done);
    window.print();
  };
  const log = (action: string, patient?: string, detail?: string) => auditLog({ role: "薬剤師", actor: ME, action, patient, detail });

  const toReceive = book.slips.filter((s) => !s.received);
  const leftovers = book.ledger.filter((e) => e.kind === "払出" && e.slipId && !e.disposal && (book.slips.find((s) => s.id === e.slipId)?.leftMl ?? 0) > 0);
  const returns = book.ledger.filter((e) => e.kind === "返納");
  const manager = licenceOf(NARCOTIC_MANAGER, "麻薬管理者", today);

  return (
    <section className="space-y-4 text-[13px]">

      <p className="text-[11px] text-ink-faint">
        麻薬管理者：{displayText(NARCOTIC_MANAGER)}（{displayText(manager.ok ? manager.licence.no : manager.why)}）。{NARCOTIC_RULES.licences}
      </p>

      {/* --- 麻薬処方箋・麻薬注射せん --- */}
      <div className={`${card} p-4`}>
        <h3 className="mb-2 font-bold">麻薬処方箋・麻薬注射せん（昨日と今日）</h3>
        {orders.length === 0 && <p className="text-ink-faint">麻薬のオーダはありません。</p>}
        <div className="space-y-3">
          {orders.map(({ x, e }) => {
            const items = rxItems(e, x.patient, today);
            const ok = rxComplete(items);
            const signed = book.signed[e.id];
            const oral = e.order.type === "prescription";
            const q = e.order.type === "prescription" ? oralQty(e.order) : null;
            const block = oral ? (oralBlock(book, e, ok) ?? blockOf?.(e.id) ?? null) : null;
            const out = oral ? dispensedFor(book, e.id) : null;
            const slips = book.slips.filter((s) => s.orderId === e.id);
            const code = oral ? (e.order.type === "prescription" ? e.order.drugCode : "") : e.order.type === "injection" ? (e.order.items.find((i) => NARCOTICS.has(i.drugCode))?.drugCode ?? "") : "";
            return (
              <article key={e.id} className="rounded-md border border-rule-soft p-3">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="text-xs text-ink-faint">
                    {day(e.day)} {e.time}　{displayText(e.author)}
                  </span>
                  <b>
                    {x.room}　{x.patient.name}
                  </b>
                  <span>
                    {anyDrugName(code)}
                    <DrugMarks codes={[code]} />　{displayText(usageText(e.order).text)}
                  </span>
                  {e.status === "中止" && <span className="rounded bg-tab px-1.5 text-xs text-ink-soft">中止</span>}
                  <button type="button" onClick={() => { print(<RxSheet entry={e} items={items} patient={x.patient} room={x.room} today={today} />); log(oral ? "院内麻薬処方せんを印刷した" : "院内麻薬注射せんを印刷した", x.patient.name); }} className="ml-auto flex items-center gap-1 rounded border border-rule px-2 py-0.5 text-xs hover:border-ai hover:text-ai">
                    <Printer size={13} />
                    {oral ? "院内麻薬処方せん" : "院内麻薬注射せん"}を印刷
                  </button>
                </div>
                {items.some((i) => i.state === "missing") && <p className="mt-1 text-xs text-shu">不足：{items.filter((i) => i.state === "missing").map((i) => i.item).join("・")}</p>}
                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
                  {signed ? (
                    <span className="text-wakatake">署名を確かめた {signed.at.time} {displayText(signed.by)}</span>
                  ) : (
                    <button
                      type="button"
                      disabled={!ok}
                      onClick={() => {
                        onBook((b) => ({ ...b, signed: { ...b.signed, [e.id]: { by: ME, at: now } } }));
                        log("麻薬処方箋の署名を確かめた", x.patient.name, anyDrugName(code));
                      }}
                      className="rounded border border-wakatake px-2 py-0.5 text-wakatake hover:bg-wakatake hover:text-white disabled:opacity-40"
                    >
                      印刷した処方箋の署名を確かめた
                    </button>
                  )}
                  {!ok && <span className="font-bold text-shu">記載事項に足りないものがあります。医師に照会してください。</span>}
                  {oral &&
                    (out ? (
                      <span className="text-wakatake">
                        払出済み {day(out.at.day)} {out.at.time}（{-out.qty}
                        {unitOf(code)}）
                      </span>
                    ) : (
                      <>
                        <button
                          type="button"
                          disabled={!!block}
                          onClick={() => {
                            if (blockOf?.(e.id)) return;
                            onBook((b) => dispenseOral(b, e, x.patient.id, ME, now, label(x.patient.id), newId));
                            log("麻薬を払い出した（受払簿に記載）", x.patient.name, `${anyDrugName(code)} ${q?.qty ?? ""}${unitOf(code)}`);
                          }}
                          className="rounded bg-ai px-2.5 py-0.5 font-bold text-white disabled:opacity-40"
                        >
                          払い出す{q ? `（${q.formula}）` : ""}
                        </button>
                        {block && <span className="text-ink-soft">{block}</span>}
                        {blockOf?.(e.id)?.startsWith("まだ監査") && onAudit && <button type="button" onClick={() => onAudit(e.id)} className="text-ai underline">監査済にする</button>}
                      </>
                    ))}
                  {!oral && (
                    <span className="text-ink-soft">
                      施用票：{slips.length ? slips.map((s) => `${s.usedAt.time} ${s.received ? "受領済み" : "返納あり・受領待ち"}`).join("、") : "まだ返納なし（施用の日に払出として記載）"}
                    </span>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </div>

      {/* --- 施用票の受領と残液の廃棄 --- */}
      <div className={`${card} p-4`}>
        <h3 className="mb-2 font-bold">施用票と残液・空アンプルの返納</h3>
        {toReceive.length === 0 && leftovers.length === 0 && <p className="text-ink-faint">受け取る施用票・廃棄する残液はありません。</p>}
        {toReceive.map((s) => (
          <div key={s.id} className="mb-2 flex flex-wrap items-center gap-3 rounded-md border border-rule-soft px-3 py-2">
            <span>
              {day(s.usedAt.day)} {s.usedAt.time}　<b>{who(s.patientId)?.patient.name}</b>　{anyDrugName(s.code)}
              <DrugMarks codes={[s.code]} />
            </span>
            <span className="nums text-xs">
              払出 {s.issuedA}A・施用 {s.usedMl}mL・残 {s.leftMl}mL・未使用 {s.unusedA}A　施用者 {displayText(s.prescriber)}（{displayText((LICENCES[s.prescriber] ?? []).find((l) => l.kind === "麻薬施用者")?.no ?? "免許番号なし")}）　返納 {s.returnedAt.time} {displayText(s.by)}
            </span>
            <button
              type="button"
              onClick={() => {
                onBook((b) => receiveSlip(b, s.id, ME, now, label(s.patientId), newId));
                log("麻薬施用票と残液・空アンプルを受け取った（受払簿に払出を記載）", who(s.patientId)?.patient.name, `${anyDrugName(s.code)} ${s.issuedA - s.unusedA}A 施用 ${s.usedMl}mL 残 ${s.leftMl}mL`);
              }}
              className="ml-auto rounded bg-ai px-2.5 py-0.5 text-xs font-bold text-white"
            >
              受け取った（空アンプル・残液を確かめた）
            </button>
          </div>
        ))}
        {leftovers.map((e) => (
          <Dispose
            key={e.id}
            title={displayText(`${day(e.at.day)} ${e.at.time}　${anyDrugName(e.code)}　施用残 ${book.slips.find((s) => s.id === e.slipId)?.leftMl}mL（${e.note.split("　")[0]}）`)}
            onDone={(witness, method) => {
              onBook((b) => disposeLeftover(b, e.id, ME, witness, method, now));
              log("麻薬の施用残液を廃棄した（立会い）", undefined, `${anyDrugName(e.code)} 立会 ${witness} ${method}`);
            }}
            note="施用残液は届出なしで、他の職員の立会いの下に廃棄し、払出の備考に mL で書きます（マニュアル 第7 1(3)）。"
          />
        ))}
      </div>

      {/* --- 病棟からの返納（内服） --- */}
      <div className={`${card} p-4`}>
        <h3 className="mb-2 font-bold">病棟から返納された麻薬（調剤済み）</h3>
        {returns.length === 0 && <p className="text-ink-faint">返納はありません。</p>}
        {returns.map((e) =>
          e.disposal ? (
            <div key={e.id} className="mb-1 flex flex-wrap items-center gap-2 text-xs">
              <span>
                {day(e.at.day)}　{anyDrugName(e.code)}（{e.paren}
                {unitOf(e.code)}）{displayText(e.note)}　廃棄 {day(e.disposal.at.day)} {e.disposal.method}　立会 {displayText(e.disposal.witness)}
              </span>
              {e.notice &&
                (e.notice.filedOn !== undefined ? (
                  <span className="text-wakatake">調剤済麻薬廃棄届 提出 {day(e.notice.filedOn)}（模擬）</span>
                ) : (
                  <>
                    <span className={e.notice.dueDay <= 7 ? "font-bold text-yamabuki" : "text-ink-soft"}>調剤済麻薬廃棄届：{day(e.notice.dueDay)}まで（廃棄後30日以内、法 第35条第2項）</span>
                    <button type="button" onClick={() => { onBook((b) => fileNotice(b, e.id, 0)); log("調剤済麻薬廃棄届を出した（模擬）", undefined, anyDrugName(e.code)); }} className="rounded border border-rule px-2 py-0.5 hover:border-ai hover:text-ai">
                      届を出した（模擬）
                    </button>
                  </>
                ))}
            </div>
          ) : (
            <Dispose
              key={e.id}
              title={displayText(`${day(e.at.day)} ${e.at.time}　${anyDrugName(e.code)}（${e.paren}${unitOf(e.code)}）${e.note}`)}
              onDone={(witness, method) => {
                onBook((b) => disposeReturned(b, e.id, ME, witness, method, now));
                log("返納された麻薬を廃棄した（立会い）", undefined, `${anyDrugName(e.code)} ${e.paren}${unitOf(e.code)} 立会 ${witness}`);
              }}
              note="返納された調剤済みの麻薬は残高に加えず（ ）で書き、立会いの下に廃棄して、30日以内に調剤済麻薬廃棄届を出します（マニュアル 第6 2 ※3・第7 1(2)）。"
            />
          ),
        )}
      </div>

      <Ledger book={book} onBook={onBook} today={today} now={now} newId={newId} log={log} />

      <Accidents book={book} onBook={onBook} today={today} now={now} newId={newId} log={log} print={print} />

      <div className="text-[11px] text-ink-faint">

        <p className="mt-1">
          届はどこにも送りません（模擬）。
        </p>
      </div>
      {printing && typeof document !== "undefined" && createPortal(<div className="hidden bg-white p-[10mm] print:block">{printing}</div>, document.body)}
    </section>
  );
}

/** Choose a witness and a method, then record the 廃棄. */
function Dispose({ title, note, onDone }: { title: string; note: string; onDone: (witness: string, method: string) => void }) {
  const [witness, setWitness] = useState("");
  const [method, setMethod] = useState(METHODS[0]);
  const problem = witnessProblem(ME, witness);
  return (
    <div className="mb-2 rounded-md border border-yamabuki/40 bg-yamabuki-soft/30 px-3 py-2">
      <div className="text-[12px]">{title}</div>
      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
        <label className="flex items-center gap-1">
          立会者
          <select value={witness} onChange={(e) => setWitness(e.target.value)} className="rounded border border-rule bg-paper px-1 py-0.5">
            <option value="">選ぶ</option>
            {WITNESSES.map((w) => (
              <option key={w} value={w}>
                {w}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1">
          方法
          <select value={method} onChange={(e) => setMethod(e.target.value)} className="rounded border border-rule bg-paper px-1 py-0.5">
            {METHODS.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </label>
        <button type="button" disabled={!!problem} onClick={() => onDone(witness, method)} className="rounded bg-ai px-2.5 py-0.5 font-bold text-white disabled:opacity-40">
          立会いの下に廃棄した
        </button>
        {problem && witness && <span className="text-shu">{problem}</span>}
      </div>
      <p className="mt-1 text-[11px] text-ink-faint">{displayText(note)}</p>
    </div>
  );
}

type Sub = { book: NarcoticBook; onBook: Props["onBook"]; today: CalendarDate; now: When; newId: () => string; log: (a: string, p?: string, d?: string) => void };

/** 麻薬帳簿（受払簿）: one account per item, 受入・払出・残高・備考, and the 受入・照合 lines. */
function Ledger({ book, onBook, today, now, newId, log }: Sub) {
  const codes = [...NARCOTICS];
  const [code, setCode] = useState(codes[0]);
  const [inQty, setInQty] = useState("");
  const [lot, setLot] = useState("");
  const [counted, setCounted] = useState("");
  const rows = accountRows(book.ledger, code);
  const u = unitOf(code);
  const c = classOf(code);
  const day = (d: number) => formatShort(addDays(today, d));
  return (
    <div className={`${card} p-4`}>
      <div className="mb-2 flex flex-wrap items-center gap-3">
        <h3 className="font-bold">麻薬帳簿（受払簿）</h3>
        <select value={code} onChange={(e) => setCode(e.target.value)} className="rounded border border-rule bg-paper px-2 py-0.5 text-[13px]">
          {codes.map((k) => (
            <option key={k} value={k}>
              {anyDrugName(k)}
            </option>
          ))}
        </select>
        <span className="text-xs text-ink-soft">
          単位 {u}　残高 <b className="nums text-ink">{balance(book.ledger, code)}{u}</b>
        </span>
        {c?.doc && (
          <a href={docUrl(c.doc)} target="_blank" rel="noreferrer" className="text-[11px] text-ai underline">
            電子添文
          </a>
        )}
      </div>
      <table className="nums w-full text-[12px]">
        <thead className="text-left text-[11px] text-ink-faint">
          <tr>
            <th className="w-28 py-1 font-normal">年月日</th>
            <th className="w-16 py-1 text-right font-normal">受入</th>
            <th className="w-16 py-1 text-right font-normal">払出</th>
            <th className="w-16 py-1 text-right font-normal">残高</th>
            <th className="py-1 pl-3 font-normal">備考</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-rule-soft align-top">
              <td className="py-0.5">
                {day(r.at.day)} {r.at.time}
              </td>
              <td className="py-0.5 text-right">{r.qty > 0 && r.kind !== "繰越" ? r.qty : r.paren ? `(${r.paren})` : ""}</td>
              <td className="py-0.5 text-right">{r.qty < 0 ? -r.qty : ""}</td>
              <td className="py-0.5 text-right">{r.rest}</td>
              <td className="py-0.5 pl-3">
                <span className="text-ink-soft">{r.kind}　</span>
                {displayText(r.note)}
                {r.disposal && (
                  <span className="text-ink-soft">
                    　（{r.disposal.amount} 廃棄 {r.disposal.method}・立会者 {displayText(r.disposal.witness)}）
                  </span>
                )}
                <span className="text-ink-faint">　{displayText(r.by)}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        <span className="text-ink-soft">卸から受入：</span>
        <input value={inQty} onChange={(e) => setInQty(e.target.value.replace(/[^\d]/g, ""))} inputMode="numeric" placeholder="数" className="w-14 rounded border border-rule bg-paper px-1.5 py-0.5" aria-label="受け入れた数" />
        <input value={lot} onChange={(e) => setLot(e.target.value)} placeholder="製品番号（譲渡証）" className="w-36 rounded border border-rule bg-paper px-1.5 py-0.5" aria-label="製品番号" />
        <button
          type="button"
          disabled={!Number(inQty) || !lot.trim()}
          onClick={() => {
            onBook((b) => receiveStock(b, code, Number(inQty), lot, ME, now, newId));
            log("麻薬を受け入れた（受払簿）", undefined, `${anyDrugName(code)} ${inQty}${u} 製品番号 ${lot}`);
            setInQty("");
            setLot("");
          }}
          className="rounded border border-ai px-2 py-0.5 text-ai hover:bg-ai-soft disabled:opacity-40"
        >
          受入を記載
        </button>
        <span className="ml-4 text-ink-soft">在庫と照合：</span>
        <input value={counted} onChange={(e) => setCounted(e.target.value.replace(/[^\d]/g, ""))} inputMode="numeric" placeholder="数えた数" className="w-20 rounded border border-rule bg-paper px-1.5 py-0.5" aria-label="在庫の数" />
        <button
          type="button"
          disabled={counted === ""}
          onClick={() => {
            onBook((b) => countStock(b, code, Number(counted), ME, now, newId));
            log("麻薬の在庫と帳簿を照合した", undefined, `${anyDrugName(code)} 在庫 ${counted}${u}・帳簿 ${balance(book.ledger, code)}${u}`);
            setCounted("");
          }}
          className="rounded border border-ai px-2 py-0.5 text-ai hover:bg-ai-soft disabled:opacity-40"
        >
          照合を記載
        </button>
      </div>

    </div>
  );
}

/** 事故（滅失・破損・流失・所在不明・盗取）: out of the book at once and a 麻薬事故届 to file (模擬). */
function Accidents({ book, onBook, today, now, newId, log, print }: Sub & { print: (n: React.ReactNode) => void }) {
  const codes = [...NARCOTICS];
  const [code, setCode] = useState(codes[0]);
  const [qty, setQty] = useState("");
  const [kind, setKind] = useState<AccidentKind>(ACCIDENT_KINDS[0]);
  const [text, setText] = useState("");
  const lic = licenceOf(NARCOTIC_MANAGER, "麻薬管理者", today);
  const date = `${today.y}年${today.m}月${today.d}日`;
  return (
    <div className={`${card} p-4`}>
      <h3 className="mb-2 font-bold">麻薬の事故（事故届の入口）</h3>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <select value={code} onChange={(e) => setCode(e.target.value)} className="rounded border border-rule bg-paper px-1 py-0.5" aria-label="事故の麻薬">
          {codes.map((k) => (
            <option key={k} value={k}>
              {anyDrugName(k)}
            </option>
          ))}
        </select>
        <input value={qty} onChange={(e) => setQty(e.target.value.replace(/[^\d]/g, ""))} inputMode="numeric" placeholder={`数（${unitOf(code)}）`} className="w-16 rounded border border-rule bg-paper px-1.5 py-0.5" aria-label="事故の数" />
        <select value={kind} onChange={(e) => setKind(e.target.value as AccidentKind)} className="rounded border border-rule bg-paper px-1 py-0.5" aria-label="事故の種類">
          {ACCIDENT_KINDS.map((k) => (
            <option key={k}>{k}</option>
          ))}
        </select>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="事故の状況（いつ・どこで・何が）" className="min-w-64 flex-1 rounded border border-rule bg-paper px-1.5 py-0.5" aria-label="事故の状況" />
        <button
          type="button"
          disabled={!Number(qty) || !text.trim()}
          onClick={() => {
            onBook((b) => recordAccident(b, { code, qty: Number(qty), kind, text, at: now, by: ME }, newId));
            log("麻薬の事故を記録した", undefined, `${anyDrugName(code)} ${qty}${unitOf(code)} ${kind}`);
            setQty("");
            setText("");
          }}
          className="rounded bg-shu px-2.5 py-0.5 font-bold text-white disabled:opacity-40"
        >
          事故を記録
        </button>
      </div>

      {book.accidents.map((a) => {
        const t = accidentText(a, anyDrugName(a.code), NARCOTIC_MANAGER, lic.ok ? lic.licence.no : "（免許番号なし）", date);
        return (
          <div key={a.id} className="mt-2 rounded-md border border-shu/40 bg-shu-soft/30 p-2 text-xs">
            <pre className="whitespace-pre-wrap font-sans">{displayText(t)}</pre>
            <div className="mt-1 flex gap-2">
              <button type="button" onClick={() => print(<pre className="whitespace-pre-wrap font-sans text-[11pt]">{displayText(t)}</pre>)} className="flex items-center gap-1 rounded border border-rule px-2 py-0.5 hover:border-ai hover:text-ai">
                <Printer size={12} />
                印刷
              </button>
              {a.filedAt ? (
                <span className="text-wakatake">提出した {a.filedAt.time}（模擬）</span>
              ) : (
                <button type="button" onClick={() => { onBook((b) => fileAccident(b, a.id, now)); log("麻薬事故届を出した（模擬）", undefined, anyDrugName(a.code)); }} className="rounded border border-rule px-2 py-0.5 hover:border-ai hover:text-ai">
                  届を出した（模擬）
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** 院内麻薬処方せん／院内麻薬注射せん (マニュアル 第5 様式(1) の形): 上部に丸で囲んだ「麻」, the items from rxItems. */
function RxSheet({ entry, items, patient, room, today }: { entry: OrderEntry; items: RxItem[]; patient: { name: string; id: string; age: number }; room: string; today: CalendarDate }) {
  const oral = entry.order.type === "prescription";
  const v = (k: string) => items.find((i) => i.item === k)?.value ?? "";
  return (
    <div className="w-[170mm] border border-black p-[6mm] text-[10.5pt] leading-relaxed text-black">
      <div className="flex items-center gap-3 border-b border-black pb-2">
        <span className="inline-flex h-[12mm] w-[12mm] items-center justify-center rounded-full border-2 border-black text-[16pt] font-bold">麻</span>
        <span className="text-[15pt] font-bold tracking-widest">{oral ? "院内麻薬処方せん" : "院内麻薬注射せん"}</span>
        <span className="ml-auto text-[9pt]">架空総合病院</span>
      </div>
      <table className="mt-2 w-full">
        <tbody>
          <tr>
            <td className="w-[40mm]">病棟</td>
            <td>{room}　入院</td>
          </tr>
          <tr>
            <td>患者氏名</td>
            <td>
              {patient.name} 様　{v("患者の年齢")}　ID {patient.id}
            </td>
          </tr>
          <tr>
            <td>発行年月日</td>
            <td>{v("発行の年月日")}</td>
          </tr>
          <tr>
            <td>麻薬の品名</td>
            <td className="font-bold underline decoration-black">{v("麻薬の品名")}</td>
          </tr>
          <tr>
            <td>分量・用法・用量</td>
            <td>{v("用法・用量（投薬日数を含む）")}</td>
          </tr>
          <tr>
            <td>麻薬施用者の氏名</td>
            <td>{v("麻薬施用者の氏名")}　署名：＿＿＿＿＿＿＿＿＿＿</td>
          </tr>
          <tr>
            <td>麻薬施用者 免許番号</td>
            <td>{v("麻薬施用者の免許証の番号")}</td>
          </tr>
        </tbody>
      </table>
      <div className="mt-4 grid grid-cols-3 gap-2 text-[9pt]">
        <div className="h-[16mm] border border-black p-1">受領者</div>
        <div className="h-[16mm] border border-black p-1">交付者（薬局）</div>
        <div className="h-[16mm] border border-black p-1">麻薬管理者</div>
      </div>
      <p className="mt-2 text-[8pt]">院内の調剤所で調剤するため、患者の住所・処方箋の使用期間・麻薬業務所の名称と所在地は省略（麻薬及び向精神薬取締法施行規則 第9条の3 ただし書）。{formatShort(today)} 印刷。</p>
    </div>
  );
}

/* Help migration source (references and dynamic wording):
<p >
        麻薬処方箋の記載事項はコードが法と施行規則の項目で並べ、薬剤師が印刷した処方箋の署名を確かめて払い出します。注射の麻薬は、病棟が施用票を書いて残液・空アンプルを返納し、薬剤部が受け取った時に施用の日の払出として帳簿に入ります。残液と返納された薬は、立会いの職員を選んで廃棄を記録します。残高と照合の差はコードが数えます。
      </p>
<p >出典：{Object.values(NARCOTIC_SOURCES).map((s) => (
          <a key={s.url} href={s.url} target="_blank" rel="noreferrer" >
            {s.label}
          </a>
        ))}</p>
<span >{NARCOTIC_RULES.prn}{NARCOTIC_RULES.outpatient}</span>
<p >記録すると帳簿の残高から減り、備考に書きます。麻薬事故届はすみやかに都道府県知事へ（法 第35条第1項）。盗取は警察署にも（マニュアル 第8）。ここからは送りません（模擬）。</p>
*/

/* ヘルプへ移動した説明:
注射剤は A 単位で、払出は施用の日に書きます。返納は（ ）で書き残高に加えません。帳簿は最終の記載から2年間保存します（法 第39条）。（ ： ）
*/
