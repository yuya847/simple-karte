"use client";

import { IsoDayInput } from "./DayInput";

import { displayText } from "@/lib/display-text";
import { Building2, Calculator, Handshake, MailWarning, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { auditLog } from "@/lib/audit";
import { addDays, daysFrom, formatShort, isoDate, type CalendarDate } from "@/lib/dates";
import {
  FACILITIES,
  facilityById,
  fromEr,
  fromLetters,
  fromOpd,
  ledgerRow,
  liaisonHistory,
  monthPeriods,
  OPD_DEPTS,
  RATE_FORMULA,
  RATE_PERIOD_NOTE,
  RATE_TERMS,
  RATE_THRESHOLDS,
  rateCounts,
  REFERRAL_RATE_SOURCES,
  referralRates,
  REPLY_HOWS,
  REPLY_RULE,
  todayVisits,
  unanswered,
  type Direction,
  type ErLike,
  type LedgerRow,
  type LetterLike,
  type LiaisonBook,
  type OpdLike,
  type Period,
  type Referral,
  type ReplyHow,
  type ReplyState,
} from "@/lib/liaison";
import { useDeny, useMe } from "./RoleContext";
import { Sources, SubTabs } from "./DeskParts";

type Tab = "ledger" | "unanswered" | "rate" | "master";

const STATE_TONE: Record<ReplyState, string> = {
  受診待ち: "text-ink-soft",
  返書待ち: "font-bold text-yamabuki",
  期限切れ: "font-bold text-shu",
  返書済み: "text-wakatake",
  先方の返書待ち: "text-ink-soft",
  先方の返書あり: "text-wakatake",
};

/** Months of the fictional record shown (this month and the three before it). */
const BACK = 3;

/**
 * 地域医療連携: the 紹介・逆紹介の台帳 (from the fictional record, today's 外来・救急外来, the 紹介状 issued in
 * the charts, and what the 連携室 enters), the 返書 and its deadline, the 未返書の一覧, the 紹介割合・逆紹介割合
 * counted by code with the 通知's formula, and the 連携先の医療機関マスタ. No AI.
 */
export function LiaisonView({
  today,
  nowTime,
  book,
  onBook,
  opd,
  er,
  letters,
}: {
  today: CalendarDate;
  nowTime: string;
  book: LiaisonBook;
  onBook: (f: (b: LiaisonBook) => LiaisonBook) => void;
  opd: OpdLike[];
  er: (ErLike & { arrival: "救急車" | "独歩" | "紹介" })[];
  letters: LetterLike[];
}) {
  const me = useMe();
  const locked = useDeny()("liaison");
  const [tab, setTab] = useState<Tab>("ledger");
  const iso = isoDate(today);
  // The fictional record depends only on the calendar day (worked out once per day).
  const { periods, history } = useMemo(() => {
    const [y, m, d] = iso.split("-").map(Number);
    const ps = monthPeriods({ y, m, d }, BACK);
    return { periods: ps, history: liaisonHistory({ y, m, d }, -ps[BACK].from) };
  }, [iso]);

  // The book as it stands: the fictional record's 返書 under what the 連携室 recorded in this browser.
  const merged: LiaisonBook = { ...book, replies: { ...history.replies, ...book.replies }, received: { ...history.received, ...book.received } };
  const live = [...fromOpd(opd), ...fromEr(er, "救急外来の担当医"), ...fromLetters(letters), ...book.added];
  const rows = [...live, ...history.ledger].map((r) => ledgerRow(r, merged));
  const visits = [...history.visits, ...todayVisits(opd, er)];
  const late = unanswered(rows);
  const day = (d: number) => formatShort(addDays(today, d));

  const sendReply = (r: LedgerRow, how: ReplyHow) => {
    const rec = { day: 0, time: nowTime, by: me.name, how };
    auditLog({ role: me.role, actor: me.name, action: r.ref.direction === "紹介" ? "紹介元へ返書を送ったと記録した" : "紹介先からの返書を受け取ったと記録した", patient: r.ref.patient.name, detail: `${r.facility?.name ?? r.ref.facilityText ?? ""}・${how}` });
    onBook((b) => (r.ref.direction === "紹介" ? { ...b, replies: { ...b.replies, [r.ref.id]: rec } } : { ...b, received: { ...b.received, [r.ref.id]: rec } }));
  };
  const chooseFacility = (r: LedgerRow, id: string) => {
    auditLog({ role: me.role, actor: me.name, action: "台帳の医療機関を選んだ", patient: r.ref.patient.name, detail: facilityById(id)?.name });
    onBook((b) => ({ ...b, facility: { ...b.facility, [r.ref.id]: id } }));
  };

  return (
    <section aria-label="地域医療連携" className="scroll-thin min-h-0 flex-1 overflow-auto bg-paper">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-rule bg-sheet px-5 py-3">
        <h1 className="flex items-center gap-1.5 text-lg font-bold">
          <Handshake size={18} className="text-ai" />
          地域医療連携

        </h1>
        <SubTabs
          label="地域医療連携の画面"
          value={tab}
          onChange={setTab}
          tabs={[
            { key: "ledger", label: "紹介・逆紹介の台帳", icon: Handshake },
            { key: "unanswered", label: "未返書の一覧", icon: MailWarning, badge: late.filter((r) => r.state === "期限切れ").length },
            { key: "rate", label: "紹介割合・逆紹介割合", icon: Calculator },
            { key: "master", label: "連携先の医療機関", icon: Building2 },
          ]}
        />
        <span className="text-[12px] text-ink-soft">{REPLY_RULE}</span>
      </header>
      <div className="space-y-4 px-5 py-4 text-[13px]">
        {tab === "ledger" && <Ledger rows={rows} periods={periods} day={day} today={today} locked={locked} onReply={sendReply} onFacility={chooseFacility} onAdd={(r) => onBook((b) => ({ ...b, added: [...b.added, r] }))} />}
        {tab === "unanswered" && <Unanswered rows={late} waiting={rows.filter((r) => r.state === "先方の返書待ち" && (r.days ?? 0) >= 30)} day={day} locked={locked} onReply={sendReply} />}
        {tab === "rate" && <Rates periods={periods} visits={visits} rows={rows} />}
        {tab === "master" && <Master rows={rows} period={periods[0]} />}

      </div>
    </section>
  );
}

function ReplyButtons({ row, locked, onReply }: { row: LedgerRow; locked: string | null; onReply: (r: LedgerRow, how: ReplyHow) => void }) {
  const [how, setHow] = useState<ReplyHow | "">("");
  if (row.state === "受診待ち" || row.state === "返書済み" || row.state === "先方の返書あり") return null;
  const label = row.ref.direction === "紹介" ? "返書を送った" : "返書を受け取った";
  return (
    <span className="mt-1 flex flex-wrap items-center gap-1">
      <select value={how} onChange={(e) => setHow(e.target.value as ReplyHow)} aria-label="送り方" disabled={!!locked} className="rounded border border-rule bg-sheet px-1 py-0.5 text-[11px]">
        <option value="">方法を選ぶ</option>
        {REPLY_HOWS.map((h) => (
          <option key={h}>{h}</option>
        ))}
      </select>
      <button type="button" disabled={!how || !!locked} title={locked ?? undefined} onClick={() => how && onReply(row, how)} className="rounded border border-rule bg-sheet px-1.5 py-0.5 text-[11px] text-ai hover:border-ai disabled:opacity-40">
        {label}
      </button>
    </span>
  );
}

function StateCell({ row, day }: { row: LedgerRow; day: (d: number) => string }) {
  const r = row;
  return (
    <span className={STATE_TONE[r.state]}>
      {r.state}
      {r.state === "返書待ち" && r.due !== null && `（期限 ${day(r.due)}・あと${r.due}日）`}
      {r.state === "期限切れ" && r.due !== null && `（期限 ${day(r.due)}・${-r.due}日過ぎ）`}
      {r.state === "先方の返書待ち" && r.days !== null && `（${r.days}日）`}
      {r.reply && (
        <span className="block text-[11px] font-normal text-ink-faint">
          {day(r.reply.day)} {r.reply.how} {displayText(r.reply.by)}
        </span>
      )}
    </span>
  );
}

function FacilityCell({ row, locked, onFacility }: { row: LedgerRow; locked: string | null; onFacility: (r: LedgerRow, id: string) => void }) {
  if (row.facility)
    return (
      <>
        {displayText(row.facility.name)}
        {row.facility.related && <span className="ml-1 rounded bg-fuji-soft px-1 text-[10px] text-fuji">特別の関係</span>}
      </>
    );
  return (
    <span>
      <span className="text-shu">マスタにない：{row.ref.facilityText ?? "—"}</span>
      <select value="" disabled={!!locked} onChange={(e) => e.target.value && onFacility(row, e.target.value)} aria-label="マスタから選ぶ" className="mt-0.5 block rounded border border-rule bg-sheet px-1 py-0.5 text-[11px]">
        <option value="">マスタから選ぶ</option>
        {FACILITIES.map((f) => (
          <option key={f.id} value={f.id}>
            {displayText(f.name)}
          </option>
        ))}
      </select>
    </span>
  );
}

function Ledger({
  rows,
  periods,
  day,
  today,
  locked,
  onReply,
  onFacility,
  onAdd,
}: {
  rows: LedgerRow[];
  periods: Period[];
  day: (d: number) => string;
  today: CalendarDate;
  locked: string | null;
  onReply: (r: LedgerRow, how: ReplyHow) => void;
  onFacility: (r: LedgerRow, id: string) => void;
  onAdd: (r: Referral) => void;
}) {
  const [dir, setDir] = useState<Direction | "">("");
  const [month, setMonth] = useState(0);
  const [dept, setDept] = useState("");
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(100);
  const [adding, setAdding] = useState(false);
  const p = periods[month];
  const when = (r: LedgerRow) => r.ref.visitDay ?? r.ref.letterDay;
  const shown = rows
    .filter((r) => (!dir || r.ref.direction === dir) && (!dept || r.ref.department === dept) && (!q || `${r.ref.patient.name}${r.ref.patient.kana ?? ""}${r.facility?.name ?? r.ref.facilityText ?? ""}`.includes(q)))
    .filter((r) => (r.ref.visitDay === null && month === 0) || (when(r) >= p.from && when(r) <= p.to))
    .sort((a, b) => (b.ref.visitDay ?? 1) - (a.ref.visitDay ?? 1) || a.ref.id.localeCompare(b.ref.id));
  const depts = [...new Set(rows.map((r) => r.ref.department))];
  const input = "rounded border border-rule bg-sheet px-1.5 py-0.5";
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <select value={month} onChange={(e) => setMonth(Number(e.target.value))} aria-label="月" className={input}>
          {periods.map((x, i) => (
            <option key={x.label} value={i}>
              {x.label}
            </option>
          ))}
        </select>
        <select value={dir} onChange={(e) => setDir(e.target.value as Direction | "")} aria-label="紹介・逆紹介" className={input}>
          <option value="">紹介・逆紹介</option>
          <option value="紹介">紹介（他院から当院へ）</option>
          <option value="逆紹介">逆紹介（当院から他院へ）</option>
        </select>
        <select value={dept} onChange={(e) => setDept(e.target.value)} aria-label="診療科" className={input}>
          <option value="">すべての診療科</option>
          {depts.map((d) => (
            <option key={d}>{d}</option>
          ))}
        </select>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="患者・医療機関で探す" className={`${input} w-48`} />
        <span className="nums text-ink-soft">{shown.length}件</span>
        <button type="button" onClick={() => setAdding((a) => !a)} disabled={!!locked} title={locked ?? undefined} className="ml-auto flex items-center gap-1 rounded-md border border-rule bg-sheet px-2 py-1 text-ai hover:border-ai disabled:opacity-40">
          <Plus size={14} />
          台帳に記録する
        </button>
      </div>
      {locked && <p className="text-[11px] text-ink-soft">{locked}</p>}
      {adding && !locked && (
        <AddForm
          today={today}
          onAdd={(r) => {
            onAdd(r);
            setAdding(false);
          }}
        />
      )}

      <table className="w-full min-w-[980px] border-collapse rounded-lg bg-sheet text-[12px]">
        <thead>
          <tr className="border-b border-rule text-left text-ink-soft">
            <th className="px-2 py-1.5">受診日・紹介日</th>
            <th className="px-2">方向</th>
            <th className="px-2">患者</th>
            <th className="px-2">医療機関</th>
            <th className="px-2">診療科・担当医</th>
            <th className="px-2">理由</th>
            <th className="px-2">返書</th>
          </tr>
        </thead>
        <tbody>
          {shown.slice(0, limit).map((r) => (
            <tr key={r.ref.id} className="border-b border-rule-soft align-top">
              <td className="nums px-2 py-1.5">
                {r.ref.visitDay === null ? <span className="text-ink-soft">受診予定（紹介状 {day(r.ref.letterDay)}）</span> : day(r.ref.visitDay)}
                <div className="text-[10px] text-ink-faint">{displayText(r.ref.source)}</div>
              </td>
              <td className="px-2 py-1.5">
                <span className={r.ref.direction === "紹介" ? "text-ai" : "text-wakatake"}>{r.ref.direction}</span>
                {r.ref.direction === "紹介" && !r.ref.firstVisit && <div className="text-[10px] text-ink-faint">再診</div>}
                {r.ref.ambulance && <div className="text-[10px] text-ink-faint">救急車</div>}
                {r.ref.onlineOnly && <div className="text-[10px] text-ink-faint">オンラインのみ</div>}
              </td>
              <td className="px-2 py-1.5">
                <div className="text-[10px] text-ink-faint">{r.ref.patient.kana}</div>
                {displayText(r.ref.patient.name)}
              </td>
              <td className="px-2 py-1.5">
                <FacilityCell row={r} locked={locked} onFacility={onFacility} />
              </td>
              <td className="px-2 py-1.5">
                {r.ref.department}
                <div className="text-[11px] text-ink-soft">{displayText(r.ref.doctor)}</div>
              </td>
              <td className="max-w-64 px-2 py-1.5">{displayText(r.ref.reason)}</td>
              <td className="px-2 py-1.5">
                <StateCell row={r} day={day} />
                <ReplyButtons row={r} locked={locked} onReply={onReply} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {shown.length > limit && (
        <button type="button" onClick={() => setLimit((n) => n + 200)} className="rounded border border-rule bg-sheet px-2 py-1 text-ai">
          さらに表示（残り {shown.length - limit}件）
        </button>
      )}
    </>
  );
}

function AddForm({ today, onAdd }: { today: CalendarDate; onAdd: (r: Referral) => void }) {
  const me = useMe();
  const [f, setF] = useState({ direction: "" as Direction | "", facilityId: "", name: "", kana: "", department: "", doctor: "", letter: "", visit: "", firstVisit: false, ambulance: false, onlineOnly: false, reason: "" });
  const set = (x: Partial<typeof f>) => setF((c) => ({ ...c, ...x }));
  const off = (iso: string) => {
    const [y, m, d] = iso.split("-").map(Number);
    return daysFrom(today, { y, m, d });
  };
  const ok = f.direction && f.facilityId && f.name.trim() && f.department && f.letter;
  const input = "rounded border border-rule bg-sheet px-1.5 py-0.5";
  return (
    <form
      className="grid gap-2 rounded-lg border border-ai/40 bg-sheet p-3 sm:grid-cols-2 lg:grid-cols-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!ok) return;
        const letterDay = off(f.letter);
        const r: Referral = {
          id: `add:${Date.now().toString(36)}`,
          direction: f.direction as Direction,
          facilityId: f.facilityId,
          patient: { name: f.name.trim(), kana: f.kana.trim() || undefined },
          department: f.department,
          doctor: f.doctor.trim() || "（記載なし）",
          letterDay,
          visitDay: f.direction === "逆紹介" ? letterDay : f.visit ? off(f.visit) : null,
          firstVisit: f.direction === "紹介" && f.firstVisit,
          ambulance: f.ambulance,
          onlineOnly: f.onlineOnly,
          reason: f.reason.trim(),
          source: "台帳に記録",
          by: me.name,
        };
        auditLog({ role: me.role, actor: me.name, action: `${r.direction}を台帳に記録した`, patient: r.patient.name, detail: `${facilityById(r.facilityId)?.name}・${r.department}` });
        onAdd(r);
      }}
    >
      <label className="flex items-center gap-2">
        方向
        <select value={f.direction} onChange={(e) => set({ direction: e.target.value as Direction })} className={input} required>
          <option value="">選ぶ</option>
          <option value="紹介">紹介（他院から当院へ）</option>
          <option value="逆紹介">逆紹介（当院から他院へ）</option>
        </select>
      </label>
      <label className="flex items-center gap-2">
        医療機関
        <select value={f.facilityId} onChange={(e) => set({ facilityId: e.target.value })} className={`${input} min-w-0 flex-1`} required>
          <option value="">選ぶ</option>
          {FACILITIES.map((x) => (
            <option key={x.id} value={x.id}>
              {displayText(x.name)}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-2">
        診療科
        <select value={f.department} onChange={(e) => set({ department: e.target.value })} className={input} required>
          <option value="">選ぶ</option>
          {[...OPD_DEPTS.map((d) => d.name), "救急外来"].map((d) => (
            <option key={d}>{d}</option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-2">
        患者の氏名
        <input value={f.name} onChange={(e) => set({ name: e.target.value })} className={`${input} min-w-0 flex-1`} placeholder="名前" required />
      </label>
      <label className="flex items-center gap-2">
        カナ
        <input value={f.kana} onChange={(e) => set({ kana: e.target.value })} className={`${input} min-w-0 flex-1`} />
      </label>
      <label className="flex items-center gap-2">
        当院の担当医
        <input value={f.doctor} onChange={(e) => set({ doctor: e.target.value })} className={`${input} min-w-0 flex-1`} />
      </label>
      <label className="flex items-center gap-2">
        紹介状の日付
        <IsoDayInput value={f.letter} onChange={(e) => set({ letter: e.target.value })} className={input} required />
      </label>
      {f.direction === "紹介" && (
        <label className="flex items-center gap-2">
          当院の受診日
          <IsoDayInput value={f.visit} onChange={(e) => set({ visit: e.target.value })} className={input} />
          <span className="text-[11px] text-ink-faint">空なら受診予定</span>
        </label>
      )}
      <div className="flex flex-wrap items-center gap-3">
        {f.direction === "紹介" && (
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={f.firstVisit} onChange={(e) => set({ firstVisit: e.target.checked })} />
            初診
          </label>
        )}
        {f.direction === "紹介" && (
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={f.ambulance} onChange={(e) => set({ ambulance: e.target.checked })} />
            救急車で搬送
          </label>
        )}
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={f.onlineOnly} onChange={(e) => set({ onlineOnly: e.target.checked })} />
          情報通信機器を用いた診療のみ
        </label>
      </div>
      <label className="flex items-center gap-2 sm:col-span-2">
        理由
        <input value={f.reason} onChange={(e) => set({ reason: e.target.value })} className={`${input} min-w-0 flex-1`} />
      </label>
      <div className="flex items-center gap-2">
        <button type="submit" disabled={!ok} className="rounded-md bg-ai px-3 py-1 font-bold text-white disabled:opacity-40">
          記録する
        </button>
        <span className="text-[11px] text-ink-faint">最初から選ばれている項目はありません</span>
      </div>
    </form>
  );
}

function Unanswered({ rows, waiting, day, locked, onReply }: { rows: LedgerRow[]; waiting: LedgerRow[]; day: (d: number) => string; locked: string | null; onReply: (r: LedgerRow, how: ReplyHow) => void }) {
  const table = (list: LedgerRow[], empty: string) =>
    list.length === 0 ? (
      <p className="text-ink-faint">{empty}</p>
    ) : (
      <table className="w-full border-collapse rounded-lg bg-sheet text-[12px]">
        <thead>
          <tr className="border-b border-rule text-left text-ink-soft">
            <th className="px-2 py-1.5">状態</th>
            <th className="px-2">受診日・紹介日</th>
            <th className="px-2">患者</th>
            <th className="px-2">医療機関</th>
            <th className="px-2">診療科・担当医</th>
          </tr>
        </thead>
        <tbody>
          {list.map((r) => (
            <tr key={r.ref.id} className="border-b border-rule-soft align-top">
              <td className="px-2 py-1.5">
                <StateCell row={r} day={day} />
                <ReplyButtons row={r} locked={locked} onReply={onReply} />
              </td>
              <td className="nums px-2 py-1.5">{day(r.ref.visitDay ?? r.ref.letterDay)}</td>
              <td className="px-2 py-1.5">{displayText(r.ref.patient.name)}</td>
              <td className="px-2 py-1.5">
                {displayText(r.facility?.name ?? r.ref.facilityText)}
                {r.facility && <div className="nums text-[11px] text-ink-faint">TEL {displayText(r.facility.tel)}・FAX {displayText(r.facility.fax)}</div>}
              </td>
              <td className="px-2 py-1.5">
                {r.ref.department}
                <div className="text-[11px] text-ink-soft">{displayText(r.ref.doctor)}</div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  return (
    <>
      <section>
        <h2 className="mb-1 font-bold">
          当院から紹介元への返書がまだ <span className="nums text-shu">{rows.filter((r) => r.state === "期限切れ").length}</span>件が期限切れ・<span className="nums">{rows.length}</span>件
        </h2>
        <p className="mb-2 text-[11px] text-ink-soft">{REPLY_RULE}。期限の近い順（過ぎたものが先）。担当医に返書を書いてもらい、送ったら記録します。</p>
        {table(rows, "返書がまだの紹介はありません。")}
      </section>
      <section>
        <h2 className="mb-1 font-bold">逆紹介で、紹介先からの返書が30日以上ないもの {waiting.length}件</h2>

        {table(waiting, "ありません。")}
      </section>
    </>
  );
}

function Rates({ periods, visits, rows }: { periods: Period[]; visits: Parameters<typeof rateCounts>[1]; rows: LedgerRow[] }) {
  const choices: Period[] = [...periods, { label: `${periods[BACK].label}〜${periods[1].label}（暦月の3か月）`, from: periods[BACK].from, to: periods[1].to }];
  const [i, setI] = useState(1);
  const p = choices[i];
  const c = rateCounts(p, visits, rows);
  const r = referralRates(c);
  const n = (x: number) => x.toLocaleString("ja-JP");
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        期間
        <select value={i} onChange={(e) => setI(Number(e.target.value))} className="rounded border border-rule bg-sheet px-1.5 py-0.5">
          {choices.map((x, k) => (
            <option key={x.label} value={k}>
              {x.label}
            </option>
          ))}
        </select>
        <span className="text-[11px] text-ink-soft">{RATE_PERIOD_NOTE}この試作には直近の4か月分の記録しかないので、月ごとに計算します。</span>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-lg border border-rule bg-sheet p-3">
          <h2 className="font-bold">紹介割合</h2>
          <p className="text-[12px] text-ink-soft">{RATE_FORMULA.shokai}</p>
          <p className="nums mt-1 text-sm">
            （{n(c.referred)} ＋ {n(c.ambulance)}）÷ {n(c.first)} × 100 ＝ <b className="text-2xl">{r.shokai ?? "—"}</b>％
          </p>
        </div>
        <div className="rounded-lg border border-rule bg-sheet p-3">
          <h2 className="font-bold">逆紹介割合</h2>
          <p className="text-[12px] text-ink-soft">{RATE_FORMULA.gyaku}</p>
          <p className="nums mt-1 text-sm">
            {n(c.reverse)} ÷（{n(c.first)} ＋ {n(c.revisit)}）× 1,000 ＝ <b className="text-2xl">{r.gyaku ?? "—"}</b>‰
          </p>
        </div>
      </div>
      <table className="w-full border-collapse rounded-lg bg-sheet text-[12px]">
        <thead>
          <tr className="border-b border-rule text-left text-ink-soft">
            <th className="px-2 py-1.5">数</th>
            <th className="px-2 text-right">この期間</th>
            <th className="px-2">どこから数えたか</th>
            <th className="px-2">通知の定義（要約。通知が正）</th>
          </tr>
        </thead>
        <tbody>
          {(
            [
              ["初診の患者数", c.first, "外来の日計と、今日の外来・救急外来の受付（救急車を除く）"],
              ["再診の患者数", c.revisit, "外来の日計と、今日の外来の受付"],
              ["紹介患者数", c.referred, "この台帳の「紹介」のうち、受診日が期間内で初診のもの"],
              ["逆紹介患者数", c.reverse, "この台帳の「逆紹介」のうち、紹介した日が期間内のもの"],
              ["救急患者数", c.ambulance, "救急外来の日計と、今日の救急外来の救急車"],
            ] as [string, number, string][]
          ).map(([t, v, from]) => (
            <tr key={t} className="border-b border-rule-soft align-top">
              <td className="px-2 py-1.5 font-bold">{t}</td>
              <td className="nums px-2 py-1.5 text-right">{n(v)}</td>
              <td className="px-2 py-1.5 text-ink-soft">{displayText(from)}</td>
              <td className="px-2 py-1.5 text-[11px] text-ink-soft">{displayText(RATE_TERMS.find((x) => x.term === t)?.text)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {c.left.length > 0 && (
        <div className="rounded-lg border border-rule bg-sheet p-3 text-[12px]">
          <h3 className="font-bold">数えなかった台帳の行</h3>
          <ul className="mt-1 space-y-0.5">
            {c.left.map((x) => (
              <li key={x.why}>
                {x.why}：<span className="nums">{x.n}</span>件
              </li>
            ))}
          </ul>
        </div>
      )}
      {c.both > 0 && <p className="text-[12px] text-yamabuki">紹介状を持って救急車で来た初診の患者が {c.both}人います。通知の文言では紹介患者数にも救急患者数にも当たります。数え方は人が確かめてください。</p>}
      <div className="rounded-lg border border-rule bg-sheet p-3 text-[12px]">
        <h3 className="font-bold">通知の基準（令和8年度）</h3>
        <ul className="mt-1 space-y-0.5">
          {RATE_THRESHOLDS.map((t) => (
            <li key={t.group}>
              {t.group}：紹介割合 {t.shokai}％未満 又は 逆紹介割合 {t.gyaku}‰未満 は「紹介割合等が低い保険医療機関」（初診料 注2・注3、外来診療料 注2・注3）
            </li>
          ))}
        </ul>

      </div>
      <Sources items={REFERRAL_RATE_SOURCES} />
    </>
  );
}

function Master({ rows, period }: { rows: LedgerRow[]; period: Period }) {
  const inMonth = rows.filter((r) => (r.ref.visitDay ?? r.ref.letterDay) >= period.from && (r.ref.visitDay ?? r.ref.letterDay) <= period.to);
  return (
    <>

      <table className="w-full border-collapse rounded-lg bg-sheet text-[12px]">
        <thead>
          <tr className="border-b border-rule text-left text-ink-soft">
            <th className="px-2 py-1.5">医療機関</th>
            <th className="px-2">種類</th>
            <th className="px-2">診療科など</th>
            <th className="px-2">所在地</th>
            <th className="px-2">電話・FAX</th>
            <th className="px-2 text-right">{period.label}の紹介</th>
            <th className="px-2 text-right">逆紹介</th>
          </tr>
        </thead>
        <tbody>
          {FACILITIES.map((f) => (
            <tr key={f.id} className="border-b border-rule-soft">
              <td className="px-2 py-1.5 font-bold">
                {displayText(f.name)}
                {f.related && <span className="ml-1 rounded bg-fuji-soft px-1 text-[10px] font-normal text-fuji">特別の関係</span>}
              </td>
              <td className="px-2">{f.kind}</td>
              <td className="px-2">{f.what}</td>
              <td className="px-2">{f.town}</td>
              <td className="nums px-2">
                {f.tel}・{f.fax}
              </td>
              <td className="nums px-2 text-right">{inMonth.filter((r) => r.facility?.id === f.id && r.ref.direction === "紹介").length}</td>
              <td className="nums px-2 text-right">{inMonth.filter((r) => r.facility?.id === f.id && r.ref.direction === "逆紹介").length}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

/* Help migration source (references and dynamic wording):
<p >
          今日より前の台帳と外来の数は日付から作った記録（同じ日付なら毎回同じ）で、今日の分は外来・救急外来の受付と、カルテの退院サマリで発行した紹介状から入ります。連携室が記録した返書・選んだ医療機関・足した行は、このブラウザの中にあり、監査ログに残ります。返書の文を書くのは担当医です。
        </p>
<p >
        紹介を受けた患者は、受診してから返書（受診の報告）の期限を数えます。返書を送ったら「方法を選ぶ」→「返書を送った」。逆紹介は、紹介先からの返書を受け取ったら記録します。マスタにない医療機関は「マスタから選ぶ」で選ぶと、紹介割合・逆紹介割合に数えられます。
      </p>
<p >30日は、問い合わせるかを考える目安として出しています。</p>
<p >架空総合病院は一般病床134床（200床未満）なので、どちらの対象でもありません。ここでは参考として計算しています。基準に当たるかを判断するのは人です。</p>
<p >連携先の医療機関（電話・FAX は 000 の番号です）。「特別の関係」の医療機関からの紹介とそこへの逆紹介は、紹介割合・逆紹介割合に数えません。</p>
*/
