"use client";

import { displayText } from "@/lib/display-text";
import { useState } from "react";
import { openHelp } from "@/lib/help/events";
import { Check, HelpCircle, X } from "lucide-react";
import { useMe } from "./RoleContext";
import { auditLog } from "@/lib/audit";
import { formatShort, type CalendarDate } from "@/lib/dates";
import {
  NIGHT_BAND,
  SHIFT_INFO,
  WARD_BASE,
  blanks,
  dayCrew,
  dayUnits,
  daysIn,
  dow,
  emptyMonth,
  form9,
  initialRosterBook,
  monthKey,
  nextMonth,
  nightCrew,
  rosterIssues,
  shownCode,
  type RosterBook,
  type RosterIssue,
  type RosterMonth,
  type ShiftCode,
} from "@/lib/roster";
import { WARD_NAME } from "@/lib/ward";

/** The codes the 看護師長 puts in: choose one, then press the cells. */
const PAINT: { code: ShiftCode; label: string }[] = [
  { code: "日", label: `日勤 ${SHIFT_INFO.日.from}〜${SHIFT_INFO.日.to}` },
  { code: "夜", label: `夜勤 ${SHIFT_INFO.夜.from}〜翌${SHIFT_INFO.夜.to}` },
  { code: "休", label: "休み" },
  { code: "有", label: "年休" },
  { code: "", label: "消す" },
];

const cellCls = (c: string) =>
  c === "夜" ? "bg-fuji-soft font-bold text-fuji" : c === "明" ? "bg-fuji-soft/40 text-fuji/70" : c === "日" ? "bg-white text-ink" : c === "有" ? "bg-wakatake-soft text-wakatake" : c === "休" ? "bg-paper text-ink-faint" : "bg-shu-soft/50 text-ink-faint";

const KIND_LABEL: Record<RosterIssue["kind"], { text: string; cls: string }> = {
  基準: { text: "施設基準", cls: "bg-shu text-white" },
  重なり: { text: "時間が重なる", cls: "bg-shu-soft text-shu" },
  院内: { text: "院内の取り決め", cls: "bg-yamabuki-soft text-yamabuki" },
};

const WEEK = "日月火水木金土";
const card = "rounded-lg border border-rule bg-sheet";
const short = (name: string) => name.replace(/^(看護師長|准看護師|看護師) /, "");
const hours = (h: number) => (Number.isInteger(h) ? `${h}` : h.toFixed(1));

interface Props {
  /** null until the 看護師長 changes something (the FICTIONAL draft is shown until then). */
  book: RosterBook | null;
  today: CalendarDate;
  nowTime: string;
  onChange: (b: RosterBook) => void;
}

/**
 * 勤務表と様式9: the 看護師長 enters the month; code counts the night hours and checks the 施設基準
 * (roster.ts). Neither code nor AI makes the roster.
 */
export function RosterView({ book: saved, today, nowTime, onChange }: Props) {
  const me = useMe();
  const [which, setWhich] = useState<"this" | "next">("this");
  const [paint, setPaint] = useState<ShiftCode>("夜");
  const [ng, setNg] = useState<[string, string]>(["", ""]);
  const book = saved ?? initialRosterBook(today.y, today.m);
  const thisKey = monthKey(today.y, today.m);
  const ym = which === "this" ? { y: today.y, m: today.m } : nextMonth(today.y, today.m);
  const key = monthKey(ym.y, ym.m);
  const days = daysIn(ym.y, ym.m);
  const before = book.months[thisKey];
  const stored = book.months[key] ?? emptyMonth(book.nurses, ym.y, ym.m, before);
  // Next month starts from the last day of this month as it stands (its night runs into the 1st).
  const month: RosterMonth =
    which === "next" && before ? { ...stored, shifts: Object.fromEntries(book.nurses.map((n) => [n.id, [before.shifts[n.id]?.[daysIn(today.y, today.m)] ?? "", ...(stored.shifts[n.id] ?? []).slice(1)]])) } : stored;
  const census = book.census[key] ?? book.census[thisKey] ?? 0;
  const f = form9(book.nurses, month, census);
  const issues = rosterIssues(book.nurses, month, book.ngPairs);
  const empty = blanks(book.nurses, month);
  const canEdit = me.role === "看護師";
  const name = (id: string) => book.nurses.find((n) => n.id === id)?.name ?? id;

  const putMonth = (next: RosterMonth) => onChange({ ...book, months: { ...book.months, [key]: next } });
  const setCell = (id: string, i: number) => {
    const cur = month.shifts[id] ?? Array<ShiftCode>(days + 1).fill("");
    if (!canEdit || cur[i] === paint) return;
    putMonth({ ...month, confirmed: undefined, shifts: { ...month.shifts, [id]: cur.map((c, j) => (j === i ? paint : c)) } });
  };
  const confirm = () => {
    const at = `${formatShort(today).replace(/（.）/, "")} ${nowTime}`;
    putMonth({ ...month, confirmed: { by: me.name, at } });
    auditLog({ role: me.role, actor: me.name, action: "確定（勤務表）", detail: `${WARD_NAME} ${ym.y}年${ym.m}月　月平均夜勤時間数 ${f.avgNight ?? "—"}時間　確認 ${issues.length}件` });
  };
  const addNg = () => {
    auditLog({ role: me.role, actor: me.name, action: "同じ夜勤に入れない組み合わせを登録", detail: `${name(ng[0])}・${name(ng[1])}` });
    onChange({ ...book, ngPairs: [...book.ngPairs, ng] });
    setNg(["", ""]);
  };
  const ngExists = book.ngPairs.some(([a, b]) => (a === ng[0] && b === ng[1]) || (a === ng[1] && b === ng[0]));
  const mark = (ok: boolean) => (ok ? <span className="font-bold text-wakatake">満たす</span> : <span className="font-bold text-shu">満たさない</span>);

  return (
    <section aria-label="勤務表と様式9" className="scroll-thin min-h-0 flex-1 overflow-y-auto bg-paper">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-rule bg-sheet px-5 py-3">
        <h1 className="text-lg font-bold">
          勤務表と様式9（{WARD_NAME}）

        </h1>
        <div role="tablist" className="flex rounded-md border border-rule p-0.5 text-sm">
          {(
            [
              ["this", `${today.m}月（今月）`],
              ["next", `${nextMonth(today.y, today.m).m}月（来月）`],
            ] as const
          ).map(([k, l]) => (
            <button key={k} type="button" role="tab" aria-selected={which === k} onClick={() => setWhich(k)} className={`rounded px-2.5 py-0.5 ${which === k ? "bg-ink font-bold text-white" : "text-ink-soft hover:text-ink"}`}>
              {l}
            </button>
          ))}
        </div>
        <span className="text-xs text-ink-soft">
          届出：{WARD_BASE.name}（{WARD_BASE.ratio}対1）
        </span>
        <button type="button" onClick={() => openHelp("screen:roster")} className="ml-auto flex items-center gap-1 rounded border border-rule px-2 py-0.5 text-xs text-ink-soft hover:text-ai">
          <HelpCircle size={13} />
          使い方
        </button>
      </header>


      <div className="space-y-4 px-5 py-4">
        <div className={`${card} flex flex-wrap items-center gap-2 p-3 text-[13px]`}>
          <b>入れる勤務</b>
          {PAINT.map((p) => (
            <button key={p.label} type="button" aria-pressed={paint === p.code} disabled={!canEdit} onClick={() => setPaint(p.code)} className={`flex items-center gap-1.5 rounded-md border px-2 py-0.5 disabled:opacity-40 ${paint === p.code ? "border-ink ring-1 ring-ink" : "border-rule"}`}>
              <span className={`inline-flex h-5 w-5 items-center justify-center rounded text-[11px] ${cellCls(p.code)}`}>{p.code || "・"}</span>
              {p.label}
            </button>
          ))}
        </div>

        <div className="scroll-thin overflow-x-auto rounded-lg border border-rule bg-sheet">
          <table className="nums border-collapse text-[11px]">
            <thead>
              <tr className="border-b border-rule text-ink-soft">
                <th className="sticky left-0 z-10 bg-sheet px-2 py-1 text-left font-normal">氏名</th>
                <th className="px-0.5 font-normal" title={which === "next" ? "今月の最後の日（ここの夜勤は1日の朝まで）" : "前の月の最後の日（ここの夜勤は1日の朝まで）"}>
                  前月
                  <br />
                  末日
                </th>
                {Array.from({ length: days }, (_, k) => {
                  const w = dow(ym.y, ym.m, k + 1);
                  return (
                    <th key={k} className={`w-6 px-0 font-normal ${w === 0 || w === 6 ? "text-shu" : ""}`}>
                      {k + 1}
                      <br />
                      {WEEK[w]}
                    </th>
                  );
                })}
                <th className="px-1.5 font-normal">夜勤</th>
                <th className="px-1.5 font-normal" title="夜勤時間帯に病棟で勤務した時間（様式9 の中段）">夜勤時間</th>
                <th className="px-1.5 font-normal" title="病棟で勤務した時間（上段と中段の計）">勤務時間</th>
                <th className="px-1.5 font-normal" title="様式9 の「夜勤の有無」">有無</th>
              </tr>
            </thead>
            <tbody>
              {book.nurses.map((n) => {
                const r = f.rows.find((x) => x.nurse.id === n.id)!;
                const codes = month.shifts[n.id] ?? [];
                return (
                  <tr key={n.id} className="border-b border-rule-soft">
                    <th className="sticky left-0 z-10 whitespace-nowrap bg-sheet px-2 py-0.5 text-left font-normal">
                      {short(n.name)}
                      {n.head && <span className="ml-1 text-[10px] text-ink-soft">師長</span>}
                      {n.kind === "准看護師" && <span className="ml-1 text-[10px] text-ink-soft">准看</span>}
                      {n.newcomer && <span className="ml-1 rounded bg-yamabuki-soft px-1 text-[10px] text-yamabuki">1年目</span>}
                      {n.nightOnly && <span className="ml-1 rounded bg-fuji-soft px-1 text-[10px] text-fuji">夜専</span>}
                    </th>
                    {Array.from({ length: days + 1 }, (_, i) => {
                      const shown = shownCode(codes, i);
                      const flagged = i > 0 && issues.some((x) => x.day === i && x.nurseIds.includes(n.id));
                      const locked = !canEdit || (which === "next" && i === 0);
                      return (
                        <td key={i} className={`p-0 ${i === 0 ? "border-r border-rule" : ""}`}>
                          <button
                            type="button"
                            disabled={locked}
                            onClick={() => setCell(n.id, i)}
                            aria-label={`${n.name} ${i === 0 ? "前月末日" : `${ym.m}月${i}日`} ${shown || "未入力"}`}
                            className={`h-6 w-6 text-center ${cellCls(shown)} ${flagged ? "ring-2 ring-inset ring-shu" : ""} ${locked ? "cursor-default" : "hover:outline hover:outline-1 hover:outline-ai"}`}
                          >
                            {shown || "・"}
                          </button>
                        </td>
                      );
                    })}
                    <td className="px-1.5 text-right">{r.nights}</td>
                    <td className="px-1.5 text-right font-bold">{hours(r.nightHours)}</td>
                    <td className="px-1.5 text-right">{hours(r.dayHours + r.nightHours)}</td>
                    <td className="px-1.5" title={r.excluded ?? "月平均夜勤時間数に含める"}>
                      {r.night}
                      {r.excluded && <span className="text-ink-faint">（除く）</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="text-ink-soft">
              <tr className="border-t border-rule">
                <th className="sticky left-0 z-10 bg-sheet px-2 py-0.5 text-left font-normal">日勤（人）</th>
                <td />
                {Array.from({ length: days }, (_, k) => (
                  <td key={k} className="text-center">
                    {dayCrew(book.nurses, month, k + 1).length}
                  </td>
                ))}
              </tr>
              <tr>
                <th className="sticky left-0 z-10 bg-sheet px-2 py-0.5 text-left font-normal">夜勤（人）</th>
                <td className="text-center">{nightCrew(book.nurses, month, 0).length}</td>
                {Array.from({ length: days }, (_, k) => {
                  const n = nightCrew(book.nurses, month, k + 1).length;
                  return (
                    <td key={k} className={`text-center ${n < WARD_BASE.minNight ? "font-bold text-shu" : ""}`}>
                      {n}
                    </td>
                  );
                })}
              </tr>
              <tr title="その日に病棟で勤務した看護職員の時間 ÷ 8。基準は月平均で見ます（24時間の範囲で傾斜配置できる。別添2 第2 4 (4)イ）">
                <th className="sticky left-0 z-10 bg-sheet px-2 py-0.5 text-left font-normal">時間÷8（参考）</th>
                <td />
                {Array.from({ length: days }, (_, k) => {
                  const u = dayUnits(f, k + 1);
                  return (
                    <td key={k} className={`px-0.5 text-center text-[10px] ${u < f.required ? "text-yamabuki" : ""}`}>
                      {u.toFixed(1)}
                    </td>
                  );
                })}
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <section className={`${card} p-4 text-[13px]`}>
            <h2 className="mb-2 font-bold">
              様式9「3．入院患者の数及び看護要員の数」
              <span className="ml-2 text-xs font-normal text-ink-soft">
                {ym.y}年{ym.m}月（{days}日）・{WARD_NAME}の分
              </span>
            </h2>
            <table className="nums w-full border-collapse">
              <tbody className="align-top">
                <tr className="border-b border-rule-soft">
                  <th className="w-56 py-1.5 pr-2 text-left font-normal text-ink-soft">① 1日平均入院患者数〔A〕</th>
                  <td className="py-1.5">
                    <input
                      type="number"
                      min={0}
                      step={0.1}
                      value={census}
                      disabled={!canEdit}
                      onChange={(e) => onChange({ ...book, census: { ...book.census, [key]: Math.max(0, Number(e.target.value) || 0) } })}
                      aria-label="1日平均入院患者数"
                      className="w-20 rounded border border-rule bg-paper px-1.5 py-0.5 text-right"
                    />{" "}
                    人
                  </td>
                </tr>
                <tr className="border-b border-rule-soft">
                  <th className="py-1.5 pr-2 text-left font-normal text-ink-soft">② 月平均1日当たり看護職員配置数</th>
                  <td className="py-1.5">
                    <b className="text-base">{f.M}</b> 人　{mark(f.staffOk)}
                    <span className="ml-2 text-xs text-ink-soft">必要数 {f.required} 人</span>
                  </td>
                </tr>
                <tr className="border-b border-rule-soft">
                  <th className="py-1.5 pr-2 text-left font-normal text-ink-soft">③ 看護職員中の看護師の比率</th>
                  <td className="py-1.5">
                    <b className="text-base">{f.nurseShare === null ? "—" : `${(Math.floor(f.nurseShare * 1000) / 10).toFixed(1)}%`}</b>　{mark(f.shareOk)}
                    <span className="ml-2 text-xs text-ink-soft">7割以上</span>
                  </td>
                </tr>
                <tr className="border-b border-rule-soft">
                  <th className="py-1.5 pr-2 text-left font-normal text-ink-soft">⑤ 夜勤時間帯（16時間）</th>
                  <td className="py-1.5">
                    {displayText(NIGHT_BAND.from)}〜翌{NIGHT_BAND.to}
                  </td>
                </tr>
                <tr>
                  <th className="py-1.5 pr-2 text-left font-normal text-ink-soft">⑥ 月平均夜勤時間数</th>
                  <td className="py-1.5">
                    <b className="text-base">{f.avgNight ?? "—"}</b> 時間　{f.avgNight !== null && mark(f.nightOk)}
                    <span className="ml-2 text-xs text-ink-soft">72時間以下</span>
                  </td>
                </tr>
              </tbody>
            </table>

          </section>

          <div className="space-y-4">
            <section className={`${card} p-4 text-[13px]`}>
              <h2 className="mb-1 flex items-baseline gap-2 font-bold">
                確認（{issues.length}件）
                {empty > 0 && <span className="text-xs font-normal text-ink-soft">未入力 {empty} マス</span>}
              </h2>
              {issues.length === 0 ? (
                <p className="text-ink-faint">日ごとの確認で見つかったものはありません。</p>
              ) : (
                <ul className="scroll-thin max-h-72 space-y-1 overflow-y-auto">
                  {issues.map((x, i) => (
                    <li key={i}>
                      <span className={`mr-1.5 rounded px-1.5 py-0.5 text-[10px] font-bold ${KIND_LABEL[x.kind].cls}`}>{displayText(KIND_LABEL[x.kind].text)}</span>
                      <span className="nums mr-1 font-bold">
                        {ym.m}/{x.day}
                      </span>
                      {displayText(x.text)}
                      <span className="block pl-1 text-[11px] text-ink-faint">{x.basis}</span>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-rule-soft pt-2">
                {month.confirmed ? (
                  <span className="flex items-center gap-1 text-wakatake">
                    <Check size={14} />
                    確定 {month.confirmed.at}　{displayText(month.confirmed.by)}（このあと直すと確定は外れます）
                  </span>
                ) : (
                  <>
                    <button type="button" disabled={!canEdit} onClick={confirm} className="rounded-md bg-ai px-3 py-1 font-bold text-white disabled:opacity-40">
                      この月の勤務表を確定する
                    </button>
                  </>
                )}
              </div>
            </section>

            <section className={`${card} p-4 text-[13px]`}>
              <h2 className="mb-1 font-bold">同じ夜勤に入れない組み合わせ</h2>
              <ul className="mb-2 space-y-1">
                {book.ngPairs.map(([a, b], i) => (
                  <li key={`${a}-${b}`} className="flex items-center gap-2">
                    {name(a)} と {name(b)}
                    <button
                      type="button"
                      disabled={!canEdit}
                      aria-label={`${name(a)} と ${name(b)} の登録を外す`}
                      onClick={() => {
                        auditLog({ role: me.role, actor: me.name, action: "同じ夜勤に入れない組み合わせを外した", detail: `${name(a)}・${name(b)}` });
                        onChange({ ...book, ngPairs: book.ngPairs.filter((_, j) => j !== i) });
                      }}
                      className="rounded p-0.5 text-ink-faint hover:text-shu disabled:opacity-40"
                    >
                      <X size={13} />
                    </button>
                  </li>
                ))}
                {book.ngPairs.length === 0 && <li className="text-ink-faint">登録はありません。</li>}
              </ul>
              <div className="flex flex-wrap items-center gap-1.5">
                {[0, 1].map((k) => (
                  <select key={k} value={ng[k]} disabled={!canEdit} onChange={(e) => setNg((p) => (k === 0 ? [e.target.value, p[1]] : [p[0], e.target.value]))} aria-label={`組み合わせの${k + 1}人目`} className="rounded border border-rule bg-paper px-1.5 py-0.5">
                    <option value="">（選ぶ）</option>
                    {book.nurses.map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.name}
                      </option>
                    ))}
                  </select>
                ))}
                <button type="button" disabled={!canEdit || !ng[0] || !ng[1] || ng[0] === ng[1] || ngExists} onClick={addNg} className="rounded border border-ai px-2 py-0.5 text-xs text-ai hover:bg-ai hover:text-white disabled:opacity-40">
                  登録する
                </button>
              </div>
            </section>
          </div>
        </div>
      </div>
    </section>
  );
}

/* Help migration source (references and dynamic wording):
<p>
            看護師長が月の勤務を入れる画面です。「入れる勤務」を選んでからマスを押すと、その勤務が入ります（夜勤のあとの休みは「明」と出ます。夜勤は翌9:00まで）。入れるたびに、1人ずつの夜勤の回数と夜勤時間帯の時間、様式9の月平均夜勤時間数・看護職員の配置・看護師の比率を、通知の数え方でコードが数えます。夜勤の人数と看護師がいるか、1年目だけの夜勤、登録した組み合わせ、明けの日の勤務は日ごとに確かめ、マスに赤い枠が付きます。
          </p>
<p >勤務表はコードも AI も作りません。今月はデモの下書きが入っていて、確認の例が2つ残っています。決めるのは看護師長で、確認が残っていても確定できます。</p>
<ul >
              <li>月平均夜勤時間数は、本来は同じ入院基本料（{WARD_BASE.name}）を届け出ている病棟全体で計算します（別添2 第2 4 (3)オ）。ここは{WARD_NAME}の分だけの試算です。72時間は平均の基準で、1人ずつの上限ではありません。</li>
              <li>勤務時間には通常の休憩時間を入れ、申し送りの時間は除いていません（除くかは病棟全体で月単位で選ぶ。別添2 第2 4 (3)カ(ホ)、別紙5 の 2．）。年休は入れません。</li>
              <li>1日に勤務する数は24時間の範囲で傾斜配置でき（別添2 第2 4 (4)イ）、② は月平均で見ます。表の下の「時間÷8」は日ごとの参考です。</li>
              <li>
                出典：告示「基本診療料の施設基準等」第五 一 (6)(7)・第五 二 (1) ロ ① 1・2（令和8年厚生労働省告示第70号）、通知「基本診療料の施設基準等及びその届出に関する手続きの取扱いについて」（令和8年3月5日 保医発0305第7号）別添2 第2 4 (2)(3)(4)、別添6 別紙5、別添7 様式9 の記載上の注意。
              </li>
            </ul>
*/
