"use client";

import { Printer } from "lucide-react";
import { useMemo, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { addDays, formatShort, type CalendarDate } from "@/lib/dates";
import { abs } from "@/lib/flowsheet";
import { WARD_NAME } from "@/lib/ward";
import { marState, prnToday, standingPrnId, standingPrnState, type AdminRecord, type VoidReason, type VoidedRecord } from "@/lib/mar";
import { drugLabel, type PrnRule } from "@/lib/standing";
import { findOralDrug } from "@/lib/master";
import { dripRate, dripText } from "@/lib/drip";
import { MarCell, VoidControl } from "./MarCell";
import { RunningDrips } from "./DripControls";
import { TakeTable } from "./TakeTable";
import { CareSheet } from "./CareSheet";
import type { CareOrder, CareRecord } from "@/lib/care-orders";
import type { NursingProblem } from "@/lib/nursing-plan";
import { sortRows, takeRows, type TakeHold, type TakeRow } from "@/lib/order-take";
import { SHIFTS, buildWorksheet, orderChanges, shiftWindow, timeLabel, type OtherChange, type Shift, type WorkItem, type WorkKind, type WorkPatient } from "@/lib/worksheet";

interface Props {
  people: WorkPatient[];
  today: CalendarDate;
  nowTime: string;
  /** 指示受け: change key → time taken ("HH:MM"). */
  taken: Record<string, string>;
  /** Changes made before this session count as taken. */
  sessionKeys: Set<string>;
  /** Take one or several changes (指示受け), with the second nurse for a high-risk drug. */
  onTake: (keys: string[], second?: string) => void;
  /** 医師に確認: changes held to ask the doctor first (by row key), and holding one. */
  holds?: Record<string, TakeHold>;
  onHold?: (key: string, reason: TakeHold["reason"], note: string) => void;
  /** Nurses who can be the second checker. */
  nurses?: string[];
  /** 与薬・実施の記録. */
  records: Record<string, AdminRecord>;
  /** Items due before this time count as recorded by the (fictional) earlier shift. */
  sessionStart: number;
  onRecord: (r: AdminRecord) => void;
  /** Take a record back (reason), and the records taken back, by dose key. */
  onVoid?: (r: AdminRecord, reason: VoidReason) => void;
  voided?: Record<string, VoidedRecord[]>;
  /** 延長 and 食事 changes to take, besides the orders. */
  others?: OtherChange[];
  /** Orders the pharmacy is asking the doctor about (疑義照会中), with the question. */
  queried?: Record<string, string>;
  /** 指示簿の頓用 of each patient (given from the standing orders, not from an order). */
  standingPrn?: { patientId: string; room: string; name: string; rule: PrnRule }[];
  /** 看護ケア指示 (care and observation tasks with their 実施) and the nursing problems due for evaluation. */
  care?: { orders: CareOrder[]; records: CareRecord[]; plans: NursingProblem[]; onRecord: (r: CareRecord) => void; onVoid: (r: CareRecord, reason: string) => void };
}

const KINDS: WorkKind[] = ["注射", "内服", "処置", "採血", "検査"];
const KIND_STYLE: Record<WorkKind, string> = {
  注射: "bg-ai-soft text-ai",
  内服: "bg-wakatake-soft text-wakatake",
  処置: "bg-fuji-soft text-fuji",
  採血: "bg-yamabuki-soft text-yamabuki",
  検査: "bg-tab text-ink",
};

const noSubscribe = () => () => {};

/**
 * The ward worksheet for a shift: order changes to take (指示受け), what runs all shift, what is
 * due by the clock, and what has no set time. Built from the orders by code; printed on A4.
 */
export function Worksheet({ people, today, nowTime, taken, sessionKeys, onTake, records, sessionStart, onRecord, onVoid, voided = {}, standingPrn = [], queried = {}, others = [], holds = {}, onHold = () => {}, nurses = [], care }: Props) {
  // Opens on the shift going on now: before 08:30 that is the night shift that began the day before (昨日の夜勤);
  // left open past the next morning, tomorrow's day shift.
  const start = (() => {
    const n = abs(0, nowTime);
    const m = n % 1440;
    const d = Math.floor(n / 1440);
    const [dd, sh]: [number, Shift] = m < 510 ? [d - 1, "night"] : m < 1020 ? [d, "day"] : [d, "night"];
    return { day: Math.max(-1, Math.min(1, dd)) as DayOffsetLike, shift: sh };
  })();
  const [day, setDay] = useState<DayOffsetLike>(start.day);
  const [shift, setShift] = useState<Shift>(start.shift);
  const [kinds, setKinds] = useState<WorkKind[]>(KINDS);
  const mounted = useSyncExternalStore(noSubscribe, () => true, () => false);
  const nowAbs = abs(0, nowTime);
  const { lo, hi } = shiftWindow(shift, day);

  const sheet = useMemo(() => buildWorksheet(people, lo, hi, nowAbs), [people, lo, hi, nowAbs]);
  // 指示受け: what was ordered or stopped since yesterday 00:00.
  // ＋ 延長 and 食事 changes (kept outside the orders), in time order.
  const changes = useMemo(() => [...orderChanges(people, -1440, nowAbs), ...others].sort((a, b) => a.at - b.at || a.room.localeCompare(b.room)), [people, nowAbs, others]);
  const isTaken = (c: { key: string }) => !sessionKeys.has(c.key) || !!taken[c.key];
  // 指示受け rows: a 修正 as one 変更 row, flags, related orders; urgent and not yet taken first.
  const isRowTaken = (r: TakeRow) => r.keys.every((k) => isTaken({ key: k }));
  const rows = sortRows(takeRows(changes, people, today), isRowTaken);
  const waiting = rows.filter((r) => !isRowTaken(r)).length;
  // まとめて受ける: only rows that may be taken in bulk (not one-at-a-time ones, not held).
  const bulk = rows.filter((r) => !isRowTaken(r) && r.mustOne.length === 0 && !(holds[r.key] && !holds[r.key].answer));

  const props = { sheet, rows, isRowTaken, holds, onHold, nurses, kinds, today, day, shift, nowTime, isTaken, taken, sessionKeys, records, sessionStart, onRecord, onVoid, voided, standingPrn, queried, people, care };
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-rule bg-sheet px-5 py-2 text-sm">
        <h1 className="text-base font-bold">ワークシート</h1>
        <Segmented
          label="日付"
          value={day}
          options={[
            { value: -1, label: `昨日 ${formatShort(addDays(today, -1))}` },
            { value: 0, label: `今日 ${formatShort(today)}` },
            { value: 1, label: `明日 ${formatShort(addDays(today, 1))}` },
          ]}
          onChange={setDay}
        />
        <Segmented label="勤務帯" value={shift} options={(Object.keys(SHIFTS) as Shift[]).map((s) => ({ value: s, label: SHIFTS[s].label }))} onChange={setShift} />
        <fieldset className="flex items-center gap-2">
          <legend className="sr-only">出す種類</legend>
          {KINDS.map((k) => (
            <label key={k} className="flex cursor-pointer items-center gap-1 text-xs">
              <input type="checkbox" className="accent-ai" checked={kinds.includes(k)} onChange={() => setKinds((ks) => (ks.includes(k) ? ks.filter((x) => x !== k) : [...ks, k]))} />
              {k}
            </label>
          ))}
        </fieldset>
        {waiting > 0 && (
          <>
            <span className="rounded bg-yamabuki-soft px-2 py-0.5 text-xs font-bold text-yamabuki">指示受けがまだ {waiting}件</span>
            <button
              type="button"
              disabled={!bulk.length}
              onClick={() => onTake(bulk.flatMap((r) => r.keys))}
              title="至急・高リスク薬・口頭指示・変更などは除いて、1件ずつ受けます"
              className="rounded border border-yamabuki px-2 py-0.5 text-xs font-bold text-yamabuki hover:bg-yamabuki hover:text-white disabled:opacity-40"
            >
              まとめて受ける（{bulk.length}件{waiting - bulk.length > 0 ? `・1件ずつのもの ${waiting - bulk.length}件は除く` : ""}）
            </button>
          </>
        )}
        <button type="button" onClick={() => window.print()} className="ml-auto flex items-center gap-1.5 rounded-md bg-ai px-3 py-1.5 font-bold text-white">
          <Printer size={15} />
          印刷（A4横）
        </button>
      </div>
      <div className="scroll-thin min-h-0 flex-1 overflow-auto bg-paper p-5">
        <div className="mx-auto max-w-[1100px] rounded-lg border border-rule bg-sheet p-5 shadow-sm">
          <Sheet {...props} onTake={onTake} interactive />
        </div>
        <p className="mx-auto mt-2 max-w-[1100px] text-[11px] text-ink-faint">
          オーダからコードで集めています（AI は使っていません）。「照合」でリストバンドと薬・検体のラベルを読み（バーコードリーダーはキーボードと同じに入力されます）、患者・薬・時刻をコードが確かめてから実施を記録します。この画面を開く前の分は、前の勤務帯が記録したものとして扱います（架空）。点滴のつなぎ替えの時刻は、開始時刻と1日の本数から計算した目安です。
        </p>
      </div>
      {mounted &&
        createPortal(
          <div className="print-sheet hidden print:block">
            <Sheet {...props} onTake={onTake} interactive={false} />
          </div>,
          document.body,
        )}
    </div>
  );
}

function Segmented<T extends string | number>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-md border border-rule p-0.5">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`whitespace-nowrap rounded px-2.5 py-0.5 text-xs ${value === o.value ? "bg-ink font-bold text-white" : "text-ink-soft hover:text-ink"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

interface SheetProps {
  sheet: ReturnType<typeof buildWorksheet>;
  rows: TakeRow[];
  isRowTaken: (r: TakeRow) => boolean;
  holds: Record<string, TakeHold>;
  onHold: (key: string, reason: TakeHold["reason"], note: string) => void;
  nurses: string[];
  kinds: WorkKind[];
  today: CalendarDate;
  day: DayOffsetLike;
  shift: Shift;
  nowTime: string;
  isTaken: (c: { key: string }) => boolean;
  taken: Record<string, string>;
  sessionKeys: Set<string>;
  onTake: (keys: string[], second?: string) => void;
  interactive: boolean;
  records: Record<string, AdminRecord>;
  sessionStart: number;
  onRecord: (r: AdminRecord) => void;
  onVoid?: (r: AdminRecord, reason: VoidReason) => void;
  voided: Record<string, VoidedRecord[]>;
  standingPrn: { patientId: string; room: string; name: string; rule: PrnRule }[];
  queried: Record<string, string>;
  people: WorkPatient[];
  care?: Props["care"];
}

type DayOffsetLike = -1 | 0 | 1;

function Sheet({ sheet, rows, isRowTaken, holds, onHold, nurses, kinds, today, day, shift, nowTime, taken, onTake, interactive, records, sessionStart, onRecord, onVoid, voided, standingPrn, queried, people, care }: SheetProps) {
  const nowAbs = abs(0, nowTime);
  const other = (pid: string) => people.find((x) => x.patient.id !== pid)?.patient.id;
  const maxOf = (orderId: string) => {
    for (const x of people) for (const e of x.entries) if (e.id === orderId && e.order.type === "prescription") return e.order.maxPerDay;
    return undefined;
  };
  const s = SHIFTS[shift];
  const timed = sheet.timed.filter((i) => kinds.includes(i.kind));
  // 指示簿の頓用 sit with the other 必要時 items; each is recorded like a dose of an order.
  const fromStanding: (WorkItem & { rule: PrnRule })[] = standingPrn.map(({ patientId, room, name, rule }) => ({
    at: null,
    kind: rule.drug.code.startsWith("ORAL-") ? "内服" : "注射",
    patientId,
    room,
    name,
    main: `${drugLabel(rule.drug.code)} ${rule.drug.amount}${rule.drug.unit}`,
    detail: `指示簿 ${rule.when}${rule.detail ? `（${rule.detail}）` : ""}　${rule.intervalH}時間あけて1日${rule.maxPerDay}回まで`,
    orderId: standingPrnId(patientId, rule.id),
    state: null,
    rule,
  }));
  const ruleOf = (orderId: string) => fromStanding.find((x) => x.orderId === orderId)?.rule;
  // 点滴の速さ (mL/時, 滴/分) for an injection, computed from the order.
  const rateOf = (orderId: string) => {
    const e = people.flatMap((x) => x.entries).find((y) => y.id === orderId);
    return e && e.order.type === "injection" ? dripRate(e.order) : null;
  };
  // The same drug in this patient's other 頓用 (指示簿 or a 頓用 prescription), one dose in mg and the
  // insert's daily maximum (oral master), so that the interval and the day's total are per drug.
  const sameOf = (orderId: string) => {
    const me = fromStanding.find((x) => x.orderId === orderId);
    if (!me) return undefined;
    const code = me.rule.drug.code;
    const rx = people.find((x) => x.patient.id === me.patientId)?.entries.filter((e) => e.status === "有効" && e.order.type === "prescription" && e.order.drugCode === code && e.order.timings.length === 0) ?? [];
    const oral = findOralDrug(code);
    const doseMg = oral?.mg ? oral.mg * me.rule.drug.amount : me.rule.drug.unit === "mg" ? me.rule.drug.amount : undefined;
    return { ids: [...fromStanding.filter((x) => x.patientId === me.patientId && x.rule.drug.code === code && x.orderId !== orderId).map((x) => x.orderId), ...rx.map((e) => e.id)], doseMg, maxDailyMg: oral?.maxDailyMg };
  };
  const untimed = [...sheet.untimed, ...fromStanding].filter((i) => kinds.includes(i.kind));
  const running = sheet.running.filter((i) => kinds.includes(i.kind));
  const th = "border-b border-ink/40 px-1.5 py-1 text-left font-bold";
  const td = "border-b border-rule px-1.5 py-1 align-top";
  return (
    <div className="nums text-[12px] leading-snug text-ink print:text-[10px]">
      <header className="mb-3 flex items-baseline gap-3 border-b-2 border-ink pb-1">
        <h2 className="text-lg font-bold print:text-base">{WARD_NAME} ワークシート</h2>
        <span className="font-bold">
          {formatShort(addDays(today, day))} {s.label} {s.from}〜{s.nextDay ? "翌" : ""}
          {s.to}
        </span>
        <span className="ml-auto text-ink-soft">
          受け持ち {new Set([...timed, ...untimed, ...running].map((x) => x.patientId)).size}人　作成 {formatShort(today)} {nowTime}　架空の患者
        </span>
      </header>

      <Section title={`指示の変更（昨日と今日）　指示受けがまだ ${rows.filter((r) => !isRowTaken(r)).length}件`}>
        {rows.length === 0 ? <Empty>変更はありません</Empty> : <TakeTable rows={rows} taken={taken} isTaken={isRowTaken} holds={holds} interactive={interactive} day={day} today={today} nurses={nurses} onTake={onTake} onHold={onHold} />}
      </Section>

      <Section title="勤務のあいだ続くもの（点滴・酸素・留置）">
        {running.length === 0 ? (
          <Empty>ありません</Empty>
        ) : (
          <table className="w-full border-collapse">
            <tbody>
              {running.map((r) => (
                <tr key={r.orderId}>
                  <td className={`${td} w-28`}>
                    {r.room}　{r.name}
                  </td>
                  <td className={`${td} w-14`}>
                    <Kind kind={r.kind} />
                  </td>
                  <td className={td}>
                    <b>{r.main}</b>　<span className="text-ink-soft">{r.detail}</span>
                    {rateOf(r.orderId) && <div className="nums text-[11px] text-ai">速さ {dripText(rateOf(r.orderId)!)}</div>}
                  </td>
                  <td className={`${td} w-32 text-ink-faint`}>確認 □□□</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <RunningDrips people={people} records={records} sessionStart={sessionStart} nowTime={nowTime} onRecord={onRecord} interactive={interactive} />
      </Section>

      <Section title="時刻の決まっているもの">
        {timed.length === 0 ? (
          <Empty>ありません</Empty>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={`${th} w-20`}>時刻</th>
                <th className={`${th} w-28`}>部屋・患者</th>
                <th className={`${th} w-14`}>種類</th>
                <th className={th}>内容</th>
                <th className={`${th} w-24`}>実施</th>
              </tr>
            </thead>
            <tbody>
              {timed.map((i, k) => {
                const prev = timed[k - 1];
                const newHour = !prev || Math.floor((prev.at ?? 0) / 60) !== Math.floor((i.at ?? 0) / 60);
                return (
                  <tr key={`${i.orderId}-${i.at}-${k}`} className={newHour ? "border-t border-ink/30" : ""}>
                    <td className={`${td} font-bold`}>{i.at !== null ? timeLabel(i.at, day, today) : ""}</td>
                    <td className={td}>
                      {i.room}　{i.name}
                    </td>
                    <td className={td}>
                      <Kind kind={i.kind} />
                    </td>
                    <td className={td}>
                      <b>{i.main}</b>{queried[i.orderId] && <span className="ml-1 rounded bg-shu px-1 text-[10px] font-bold text-white">疑義照会中</span>}
                      {i.urgent && <span className="ml-1 font-bold text-shu">至急</span>}　<span className="text-ink-soft">{i.detail}</span>
                      {i.kind === "注射" && rateOf(i.orderId) && (
                        <div className="nums text-[11px] text-ai">
                          速さ {rateOf(i.orderId)!.mlPerH}mL/時 → 20滴セット 約{rateOf(i.orderId)!.drops20}滴/分・60滴セット 約{rateOf(i.orderId)!.drops60}滴/分
                        </div>
                      )}
                    </td>
                    <td className={td}>
                      {interactive && i.at !== null ? (
                        <MarCell item={i} state={marState(i, records, sessionStart, nowAbs)} record={records[`${i.orderId}|${i.at}`]} nowAbs={nowAbs} nowTime={nowTime} otherPatientId={other(i.patientId)} onRecord={onRecord} queried={queried[i.orderId]} onVoid={onVoid} voided={(voided[`${i.orderId}|${i.at}`] ?? []).map((v) => ({ by: v.by, at: v.at, reason: v.reason, status: `${v.record.status} ${v.record.doneAt}` }))} />
                      ) : (
                        <PrintMar state={marState(i, records, sessionStart, nowAbs)} record={records[`${i.orderId}|${i.at}`]} />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Section>

      {care && <CareSheet {...care} people={people} {...shiftWindow(shift, day)} day={day} today={today} nowTime={nowTime} sessionStart={sessionStart} interactive={interactive} />}

      <Section title="時刻の決まっていないもの（必要時・1日N回）">
        {untimed.length === 0 ? (
          <Empty>ありません</Empty>
        ) : (
          <table className="w-full border-collapse">
            <tbody>
              {untimed.map((i) => (
                <tr key={i.orderId}>
                  <td className={`${td} w-28`}>
                    {i.room}　{i.name}
                  </td>
                  <td className={`${td} w-14`}>
                    <Kind kind={i.kind} />
                  </td>
                  <td className={td}>
                    <b>{i.main}</b>{queried[i.orderId] && <span className="ml-1 rounded bg-shu px-1 text-[10px] font-bold text-white">疑義照会中</span>}　<span className="text-ink-soft">{i.detail}</span>
                  </td>
                  <td className={`${td} w-32 text-ink-faint`}>
                    {interactive ? (
                      <>
                      <MarCell item={i} state="予定" nowAbs={nowAbs} nowTime={nowTime} otherPatientId={other(i.patientId)} prn={ruleOf(i.orderId) ? standingPrnState(i.orderId, records, ruleOf(i.orderId)!, nowAbs, sameOf(i.orderId)) : i.kind === "内服" ? { ...prnToday(i.orderId, records, maxOf(i.orderId), nowAbs), max: maxOf(i.orderId) } : undefined} onRecord={onRecord} queried={queried[i.orderId]} />
                        {/* Today's doses of this 必要時 item, each can be taken back. */}
                        {Object.values(records)
                          .filter((r) => r.orderId === i.orderId && Math.floor(r.at / 1440) === Math.floor(nowAbs / 1440))
                          .sort((a, b) => a.at - b.at)
                          .map((r) => (
                            <div key={r.key} className="mt-0.5 text-[10px] text-ink-soft">
                              {r.status} {r.doneAt} {r.by}
                              {onVoid && <VoidControl record={r} onVoid={onVoid} />}
                            </div>
                          ))}
                      </>
                    ) : (
                      "実施 □□□"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
      <p className="mt-2 text-[10px] text-ink-faint">Simple Karte の試作。架空の病院・架空の患者で、実際の看護には使えません。</p>
    </div>
  );
}

function PrintMar({ state, record }: { state: ReturnType<typeof marState>; record?: AdminRecord }) {
  if (record) return <span>{record.status} {record.doneAt}{record.reason ? `（${record.reason}）` : ""}</span>;
  if (state === "記録済み") return <span className="text-ink-faint">実施（前の勤務）</span>;
  return <span>□　　　</span>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-4 break-inside-avoid-page">
      <h3 className="mb-1 border-l-4 border-ai pl-2 text-[13px] font-bold print:text-[11px]">{title}</h3>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-1.5 py-1 text-ink-faint">{children}</p>;
}

function Kind({ kind }: { kind: WorkKind }) {
  return <span className={`rounded px-1 py-px text-[11px] font-bold print:border print:border-ink/40 print:bg-transparent ${KIND_STYLE[kind]}`}>{kind}</span>;
}
