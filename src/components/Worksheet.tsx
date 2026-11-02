"use client";

import { Check, Printer } from "lucide-react";
import { useMemo, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { addDays, formatShort, type CalendarDate } from "@/lib/dates";
import { abs } from "@/lib/flowsheet";
import { ORDER_TYPE_LABEL, orderLines } from "@/lib/format";
import { WARD_NAME } from "@/lib/ward";
import { SHIFTS, buildWorksheet, orderChanges, shiftWindow, timeLabel, type OrderChange, type Shift, type WorkKind, type WorkPatient } from "@/lib/worksheet";

interface Props {
  people: WorkPatient[];
  today: CalendarDate;
  nowTime: string;
  /** 指示受け: change key → time taken ("HH:MM"). */
  taken: Record<string, string>;
  /** Changes made before this session count as taken. */
  sessionKeys: Set<string>;
  /** Take one or several changes (指示受け). */
  onTake: (keys: string[]) => void;
}

const KINDS: WorkKind[] = ["注射", "内服", "処置", "採血"];
const KIND_STYLE: Record<WorkKind, string> = {
  注射: "bg-ai-soft text-ai",
  内服: "bg-wakatake-soft text-wakatake",
  処置: "bg-fuji-soft text-fuji",
  採血: "bg-yamabuki-soft text-yamabuki",
};

const noSubscribe = () => () => {};

/**
 * The ward worksheet for a shift: order changes to take (指示受け), what runs all shift, what is
 * due by the clock, and what has no set time. Built from the orders by code; printed on A4.
 */
export function Worksheet({ people, today, nowTime, taken, sessionKeys, onTake }: Props) {
  const [day, setDay] = useState<0 | 1>(0);
  const [shift, setShift] = useState<Shift>("day");
  const [kinds, setKinds] = useState<WorkKind[]>(KINDS);
  const mounted = useSyncExternalStore(noSubscribe, () => true, () => false);
  const nowAbs = abs(0, nowTime);
  const { lo, hi } = shiftWindow(shift, day);

  const sheet = useMemo(() => buildWorksheet(people, lo, hi, nowAbs), [people, lo, hi, nowAbs]);
  // 指示受け: what was ordered or stopped since yesterday 00:00.
  const changes = useMemo(() => orderChanges(people, -1440, nowAbs), [people, nowAbs]);
  const isTaken = (c: OrderChange) => !sessionKeys.has(c.key) || !!taken[c.key];
  const waiting = changes.filter((c) => !isTaken(c)).length;

  const props = { sheet, changes, kinds, today, day, shift, nowTime, isTaken, taken, sessionKeys };
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-rule bg-sheet px-5 py-2 text-sm">
        <h1 className="text-base font-bold">ワークシート</h1>
        <Segmented
          label="日付"
          value={day}
          options={[
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
              onClick={() => onTake(changes.filter((c) => !isTaken(c)).map((c) => c.key))}
              className="rounded border border-yamabuki px-2 py-0.5 text-xs font-bold text-yamabuki hover:bg-yamabuki hover:text-white"
            >
              まとめて受ける
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
          オーダからコードで集めています（AI は使っていません）。実施の記録はこの試作にはなく、時刻を過ぎたものを「済」にしています。点滴のつなぎ替えの時刻は、開始時刻と1日の本数から計算した目安です。
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
  changes: OrderChange[];
  kinds: WorkKind[];
  today: CalendarDate;
  day: DayOffsetLike;
  shift: Shift;
  nowTime: string;
  isTaken: (c: OrderChange) => boolean;
  taken: Record<string, string>;
  sessionKeys: Set<string>;
  onTake: (keys: string[]) => void;
  interactive: boolean;
}

type DayOffsetLike = 0 | 1;

function Sheet({ sheet, changes, kinds, today, day, shift, nowTime, isTaken, taken, sessionKeys, onTake, interactive }: SheetProps) {
  const s = SHIFTS[shift];
  const timed = sheet.timed.filter((i) => kinds.includes(i.kind));
  const untimed = sheet.untimed.filter((i) => kinds.includes(i.kind));
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

      <Section title={`指示の変更（昨日と今日）　指示受けがまだ ${changes.filter((c) => !isTaken(c)).length}件`}>
        {changes.length === 0 ? (
          <Empty>変更はありません</Empty>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={`${th} w-24`}>指示受け</th>
                <th className={`${th} w-24`}>時刻</th>
                <th className={`${th} w-28`}>部屋・患者</th>
                <th className={`${th} w-14`}>種別</th>
                <th className={th}>内容</th>
                <th className={`${th} w-28`}>指示</th>
              </tr>
            </thead>
            <tbody>
              {changes.map((c) => {
                const { main, detail } = orderLines(c.entry.order, today);
                const ok = isTaken(c);
                return (
                  <tr key={c.key} className={c.kind === "中止" ? "text-ink-soft" : ""}>
                    <td className={td}>
                      {!sessionKeys.has(c.key) ? (
                        <span className="text-ink-faint">受け済</span>
                      ) : ok ? (
                        <span className="flex items-center gap-0.5 text-wakatake">
                          <Check size={12} />
                          {taken[c.key]}
                        </span>
                      ) : interactive ? (
                        <button type="button" onClick={() => onTake([c.key])} className="rounded border border-yamabuki px-1.5 py-0.5 text-[11px] font-bold text-yamabuki hover:bg-yamabuki hover:text-white">
                          指示を受ける
                        </button>
                      ) : (
                        <span>□ まだ</span>
                      )}
                    </td>
                    <td className={td}>{c.timeKnown ? timeLabel(c.at, day, today) : `${formatShort(addDays(today, Math.floor(c.at / 1440))).replace(/（.）/, "")}（時刻なし）`}</td>
                    <td className={td}>
                      {c.room}　{c.name}
                    </td>
                    <td className={`${td} font-bold ${c.kind === "中止" ? "text-shu" : ""}`}>{c.kind}</td>
                    <td className={td}>
                      <span className="mr-1 text-ink-faint">{ORDER_TYPE_LABEL[c.entry.order.type]}</span>
                      <span className={c.kind === "中止" ? "line-through" : "font-bold"}>{main}</span>
                      <div className="text-ink-soft">{detail}</div>
                    </td>
                    <td className={td}>{c.entry.author}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
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
                  </td>
                  <td className={`${td} w-32 text-ink-faint`}>確認 □□□</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
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
                      <b>{i.main}</b>
                      {i.urgent && <span className="ml-1 font-bold text-shu">至急</span>}　<span className="text-ink-soft">{i.detail}</span>
                    </td>
                    <td className={`${td} ${i.state === "done" ? "text-ink-faint" : ""}`}>{i.state === "done" ? "済（時刻経過）" : "□　　　"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Section>

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
                    <b>{i.main}</b>　<span className="text-ink-soft">{i.detail}</span>
                  </td>
                  <td className={`${td} w-32 text-ink-faint`}>実施 □□□</td>
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
