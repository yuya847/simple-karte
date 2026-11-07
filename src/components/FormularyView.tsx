"use client";

import { displayText } from "@/lib/display-text";
import { Download, Megaphone, Printer, Search } from "lucide-react";
import { useState } from "react";
import { createPortal, flushSync } from "react-dom";
import { auditLog } from "@/lib/audit";
import { UNTIL_CHOICES, fillDates, isRead, type Notice, type Reads } from "@/lib/board";
import { addDays, formatShort, type CalendarDate } from "@/lib/dates";
import { ADOPTION_NOTE, EMPTY_QUERY, diNotices, diProblems, formulary, formularyCsv, kiseiText, readers, searchFormulary, type FormularyItem, type FormularyQuery, type KiseiFilter } from "@/lib/formulary";
import { can } from "@/lib/roles";
import { DrugMarks } from "./DrugMarks";
import { useMe } from "./RoleContext";

interface Props {
  notices: Notice[];
  reads: Reads;
  today: CalendarDate;
  nowTime: string;
  /** Everyone a DI notice is for (to count who has read it). */
  staff: string[];
  onRead: (id: string, name: string) => void;
  onPost: (n: Notice) => void;
}

const ITEMS = formulary();
const input = "rounded-md border border-rule bg-sheet px-2 py-1 text-[13px] outline-none focus:border-ai";
let seq = 0;

/** 院内医薬品集（採用薬の一覧）と DI のお知らせ. Every role can look; 薬剤師 posts DI notices to the 掲示板. */
export function FormularyView({ notices, reads, today, nowTime, staff, onRead, onPost }: Props) {
  const me = useMe();
  const [f, setF] = useState<FormularyQuery>(EMPTY_QUERY);
  const [open, setOpen] = useState<string | null>(null);
  const [printing, setPrinting] = useState<React.ReactNode | null>(null);
  const shown = searchFormulary(ITEMS, f);
  const di = diNotices(notices);
  const set = (x: Partial<FormularyQuery>) => setF((c) => ({ ...c, ...x }));
  const save = () => {
    const blob = new Blob([formularyCsv(shown)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `院内医薬品集_${shown.length}品目.csv`;
    a.click();
    URL.revokeObjectURL(url);
    auditLog({ role: me.role, actor: me.name, action: "院内医薬品集を CSV に書き出した", detail: `${shown.length}品目` });
  };
  const print = () => {
    flushSync(() => setPrinting(<FormularySheet items={shown} today={today} sort={f.sort} />));
    const done = () => {
      setPrinting(null);
      window.removeEventListener("afterprint", done);
    };
    window.addEventListener("afterprint", done);
    window.print();
  };
  return (
    <section aria-label="院内医薬品集・DI" className="flex min-h-0 flex-1 flex-col bg-paper text-[13px]">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-rule bg-sheet px-5 py-3">
        <h1 className="text-lg font-bold">院内医薬品集・DI（医薬品情報）</h1>
        <label className="flex items-center gap-1">
          <Search size={14} className="text-ink-faint" />
          <input value={f.q} onChange={(e) => set({ q: e.target.value })} placeholder="一般名・販売名・よみ（かなでも）" aria-label="薬を探す" className={`${input} w-64`} />
        </label>
        <select value={f.route} onChange={(e) => set({ route: e.target.value as FormularyQuery["route"] })} aria-label="注射・内服" className={input}>
          <option value="">すべての剤形</option>
          <option value="注射">注射</option>
          <option value="内服">内服</option>
          <option value="外用">外用</option>
        </select>
        <select value={f.kisei} onChange={(e) => set({ kisei: e.target.value as KiseiFilter })} aria-label="規制区分" className={input}>
          <option value="">規制区分：すべて</option>
          <option value="麻薬">麻薬</option>
          <option value="毒薬">毒薬</option>
          <option value="劇薬">劇薬</option>
          <option value="ハイリスク">ハイリスク薬</option>
          <option value="処方箋医薬品以外">処方箋医薬品以外</option>
        </select>
        <select value={f.sort} onChange={(e) => set({ sort: e.target.value as FormularyQuery["sort"] })} aria-label="並べ方" className={input}>
          <option value="読み">読み順</option>
          <option value="薬効">薬効順（日本標準商品分類番号）</option>
        </select>
        <span className="text-xs text-ink-soft">{shown.length} 品目</span>
        <span className="ml-auto flex gap-2">
          <button type="button" onClick={print} className="flex items-center gap-1 rounded-md border border-rule px-2 py-1 text-xs hover:border-ai hover:text-ai">
            <Printer size={13} />
            印刷
          </button>
          <button type="button" onClick={save} className="flex items-center gap-1 rounded-md border border-rule px-2 py-1 text-xs hover:border-ai hover:text-ai">
            <Download size={13} />
            CSV
          </button>
        </span>
      </header>
      <div className="scroll-thin min-h-0 flex-1 overflow-auto p-5">
        <div className="mx-auto max-w-[1200px] space-y-4">

          <div className="overflow-x-auto rounded-lg border border-rule bg-sheet">
            <table className="w-auto table-auto self-start text-[12.5px]">
              <thead className="bg-tab/60 text-left text-[11px] text-ink-soft">
                <tr>
                  <th className="px-2 py-1.5 font-normal">院内の名前・規格</th>
                  <th className="px-2 py-1.5 font-normal">一般的名称</th>
                  <th className="px-2 py-1.5 font-normal">販売名・参照製品</th>
                  <th className="px-2 py-1.5 font-normal">規制区分</th>
                  <th className="px-2 py-1.5 font-normal">薬効分類</th>
                  <th className="px-2 py-1.5 font-normal">採用区分</th>
                  <th className="px-2 py-1.5 font-normal">DI</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((x) => {
                  const n = diNotices(notices, x.code);
                  return (
                    <Row key={x.code} x={x} n={n} open={open === x.code} onToggle={() => setOpen(open === x.code ? null : x.code)} today={today} reads={reads} meName={me.name} onRead={onRead} />
                  );
                })}
                {shown.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-2 py-3 text-ink-faint">
                      当てはまる薬はありません。
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
            <div className="rounded-lg border border-rule bg-sheet p-4">
              <h2 className="mb-2 flex items-center gap-1.5 font-bold">
                <Megaphone size={15} />
                DI のお知らせ（病棟への掲示）
              </h2>
              {di.length === 0 && <p className="text-ink-faint">まだありません。</p>}
              <ul className="space-y-2">
                {di.map((n) => {
                  const r = readers(n, reads, staff);
                  const mineRead = isRead(reads, n.id, me.name);
                  return (
                    <li key={n.id} className="rounded-md border border-rule-soft p-2.5">
                      <div className="flex flex-wrap items-baseline gap-2">
                        {n.important && <span className="rounded bg-shu px-1 text-[10px] font-bold text-white">重要</span>}
                        <b>{n.title}</b>
                        <span className="text-[11px] text-ink-faint">
                          {formatShort(addDays(today, n.posted.day))} {n.posted.time} {displayText(n.by)}
                        </span>
                      </div>
                      <p className="mt-1 whitespace-pre-wrap text-[12px]">{displayText(fillDates(n.body, today))}</p>
                      <div className="mt-1 text-[11px] text-ink-soft">
                        対象：
                        {n.drugs!.map((c) => (
                          <span key={c} className="mr-2">
                            {ITEMS.find((i) => i.code === c)?.name ?? c}
                            <DrugMarks codes={[c]} />
                          </span>
                        ))}
                      </div>

                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px]">
                        <span className="text-ink-soft">
                          既読 {r.read.length}/{staff.length}人{r.unread.length > 0 && `（まだ：${r.unread.join("、")}）`}
                        </span>
                        {!mineRead && (
                          <button type="button" onClick={() => onRead(n.id, me.name)} className="rounded border border-rule px-2 py-0.5 hover:border-ai hover:text-ai">
                            読んだ
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
            {can(me.role, "pharmacy") ? <DiPost nowTime={nowTime} onPost={onPost} /> : null}
          </div>


        </div>
      </div>
      {printing && typeof document !== "undefined" && createPortal(<div className="hidden bg-white p-[8mm] print:block">{printing}</div>, document.body)}
    </section>
  );
}

function Row({ x, n, open, onToggle, today, reads, meName, onRead }: { x: FormularyItem; n: Notice[]; open: boolean; onToggle: () => void; today: CalendarDate; reads: Reads; meName: string; onRead: (id: string, name: string) => void }) {
  const unread = n.filter((y) => !isRead(reads, y.id, meName)).length;
  return (
    <>
      <tr onClick={onToggle} className={`cursor-pointer border-t border-rule-soft align-top hover:bg-ai-soft/30 ${open ? "bg-ai-soft/30" : ""}`}>
        <td className="px-2 py-1.5">
          <span className="text-[10px] text-ink-faint">{x.route}　</span>
          <b>{x.name}</b> <span className="nums text-ink-soft">{x.spec}</span>
          <DrugMarks codes={[x.code]} />
        </td>
        <td className="px-2 py-1.5">{x.cls.generic || <span className="text-ink-faint">（記載なし）</span>}</td>
        <td className="px-2 py-1.5">{x.cls.product}</td>
        <td className="px-2 py-1.5">{displayText(kiseiText(x))}</td>
        <td className="px-2 py-1.5">
          {x.cls.yakko || <span className="text-ink-faint">（記載なし）</span>}
          <span className="nums block text-[10px] text-ink-faint">{x.cls.bunrui}</span>
        </td>
        <td className="px-2 py-1.5">{x.adoption}</td>
        <td className="px-2 py-1.5">{n.length > 0 && <span className={`rounded px-1.5 text-[11px] font-bold ${unread ? "bg-yamabuki-soft text-yamabuki" : "bg-tab text-ink-soft"}`}>{unread ? `未読 ${unread}` : `${n.length}件`}</span>}</td>
      </tr>
      {open && (
        <tr className="bg-ai-soft/20">
          <td colSpan={7} className="px-3 py-2 text-[12px]">
            <p className="text-ink-soft">採用区分：{x.adoption}（{ADOPTION_NOTE[x.adoption]}）{x.cls.b008 ? `　ハイリスク薬：${x.cls.b008.group}（${x.cls.b008.why}）` : ""}</p>
            {n.length === 0 && <p className="text-ink-faint">この薬の DI のお知らせはありません。</p>}
            {n.map((y) => (
              <div key={y.id} className="mt-1">
                <b>{y.title}</b> <span className="text-[11px] text-ink-faint">{formatShort(addDays(today, y.posted.day))} {displayText(y.by)}</span>
                <p className="whitespace-pre-wrap">{displayText(fillDates(y.body, today))}</p>
                {!isRead(reads, y.id, meName) && (
                  <button type="button" onClick={() => onRead(y.id, meName)} className="mt-0.5 rounded border border-rule px-2 py-0.5 text-[11px] hover:border-ai hover:text-ai">
                    読んだ
                  </button>
                )}
              </div>
            ))}
          </td>
        </tr>
      )}
    </>
  );
}

/** 薬剤師: a DI notice naming the drugs, put up on the 掲示板 as a 薬剤部 post. */
function DiPost({ nowTime, onPost }: { nowTime: string; onPost: (n: Notice) => void }) {
  const me = useMe();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [drugs, setDrugs] = useState<string[]>([]);
  const [important, setImportant] = useState(false);
  const [until, setUntil] = useState("14");
  const [source, setSource] = useState("");
  const problems = diProblems({ title, body, drugs });
  return (
    <div className="rounded-lg border border-rule bg-sheet p-4 text-[12.5px]">
      <h2 className="mb-2 font-bold">DI のお知らせを書く（薬剤師）</h2>
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="題名（例：電子添文の改訂、包装の変更）" className={`${input} mb-2 w-full`} aria-label="題名" />
      <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} placeholder="本文：何が変わったか、病棟で気をつけること" className={`${input} mb-2 w-full`} aria-label="本文" />
      <input value={source} onChange={(e) => setSource(e.target.value)} placeholder="出典（電子添文の改訂、安全性情報の URL など）" className={`${input} mb-2 w-full`} aria-label="出典" />
      <div className="mb-2 max-h-40 overflow-auto rounded border border-rule-soft p-1.5">
        {ITEMS.map((x) => (
          <label key={x.code} className="flex items-center gap-1.5 py-0.5">
            <input type="checkbox" className="accent-ai" checked={drugs.includes(x.code)} onChange={() => setDrugs((d) => (d.includes(x.code) ? d.filter((c) => c !== x.code) : [...d, x.code]))} />
            {x.name} <span className="text-ink-faint">{x.spec}</span>
          </label>
        ))}
      </div>
      <div className="mb-2 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-1">
          <input type="checkbox" className="accent-shu" checked={important} onChange={() => setImportant(!important)} />
          重要
        </label>
        <label className="flex items-center gap-1">
          掲示期限
          <select value={until} onChange={(e) => setUntil(e.target.value)} className={input}>
            {UNTIL_CHOICES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <button
        type="button"
        disabled={problems.length > 0}
        onClick={() => {
          const days = UNTIL_CHOICES.find((c) => c.value === until)?.days ?? null;
          onPost({ id: `n-di-${Date.now()}-${++seq}`, from: "薬剤部", title: `【DI】${title.trim()}`, body: body.trim(), by: me.name, posted: { day: 0, time: nowTime }, important, until: days, drugs, ...(source.trim() ? { source: source.trim() } : {}) });
          auditLog({ role: me.role, actor: me.name, action: "DI のお知らせを掲示した", detail: `${title.trim()}（${drugs.length}品目）` });
          setTitle("");
          setBody("");
          setDrugs([]);
          setSource("");
          setImportant(false);
        }}
        className="rounded-md bg-ai px-3 py-1.5 font-bold text-white disabled:opacity-40"
      >
        病棟に掲示する
      </button>
      {problems.length > 0 && (title || body || drugs.length > 0) && <span className="ml-2 text-xs text-ink-soft">まだ：{problems.join("・")}</span>}
    </div>
  );
}

/** The printed 院内医薬品集. */
function FormularySheet({ items, today, sort }: { items: FormularyItem[]; today: CalendarDate; sort: FormularyQuery["sort"] }) {
  return (
    <div className="text-[8.5pt] text-black">
      <h1 className="mb-1 text-[13pt] font-bold">院内医薬品集（{sort === "薬効" ? "薬効順" : "読み順"}）</h1>
      <p className="mb-2 text-[8pt]">{formatShort(today)} 現在</p>
      <table className="w-auto table-auto self-start border-collapse">
        <thead>
          <tr className="border-b border-black text-left">
            <th className="py-0.5">院内の名前・規格</th>
            <th>一般的名称</th>
            <th>販売名・参照製品</th>
            <th>規制区分</th>
            <th>薬効分類（番号）</th>
            <th>採用区分</th>
          </tr>
        </thead>
        <tbody>
          {items.map((x) => (
            <tr key={x.code} className="border-b border-black/30 align-top">
              <td className="py-0.5">
                {x.name} {x.spec}
                <DrugMarks codes={[x.code]} print />
              </td>
              <td>{x.cls.generic}</td>
              <td>{x.cls.product}</td>
              <td>{displayText(kiseiText(x))}</td>
              <td>
                {x.cls.yakko}（{x.cls.bunrui}）
              </td>
              <td>{x.adoption}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* Help migration source (references and dynamic wording):
<p >行を押すと、その薬の DI のお知らせと採用区分の説明が開きます。規制区分・薬効分類・一般的名称は、各薬の電子添文（PMDA）から写したものです。</p>
<p >DI のお知らせは薬剤師が書き、掲示板に「薬剤部」の掲示として出ます。病棟では掲示板か、この画面で読みます。</p>
<div >
            <p>
              出典：
              {[DRUG_CLASS_SOURCES.pmda, DRUG_CLASS_SOURCES.law, DRUG_CLASS_SOURCES.narcoticLaw, DRUG_CLASS_SOURCES.b008].map((s) => (
                <a key={s.url} href={s.url} target="_blank" rel="noreferrer" >
                  {s.label}
                </a>
              ))}
            </p>
            <p >
              採用区分（{Object.entries(ADOPTION_NOTE).map(([k, v]) => `${k}＝${v}`).join("、")}）。ハイリスク薬は、薬剤管理指導料「1」の対象の分類（通知 B008 (2)）に、電子添文の薬効分類名と有効成分で当てはめたもので、厚生労働省の対象薬剤一覧とはまだ照らしていません。電子添文の製品は規制区分を読んだ製品で、算定に使う医薬品マスターの品目と製造販売業者が違うものがあります。電子添文の改訂の中身はここでは読み取っていません（リンク先で確かめる）。
            </p>
          </div>
<span >。院内の取り決め</span>
*/
