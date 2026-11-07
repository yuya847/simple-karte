"use client";
import { LAB_RESULT_MIME, LAB_SELECTIONS, labTransfer, selectLabSet } from "@/lib/lab-transfer";
import { requestLabPaste } from "../LabPasteReceiver";
import { FlowCellMenu, type CellAction } from "../FlowCellMenu";
import { labNumber } from "@/lib/lab-number";
import { pickWithShift, valueTip } from "@/lib/lab-pick";
import { useLongPress } from "@/lib/use-long-press";

import { displayText } from "@/lib/display-text";
import { X } from "lucide-react";
import { useCallback, useState } from "react";
import { createPortal, flushSync } from "react-dom";
import { addDays, formatShort, type CalendarDate } from "@/lib/dates";
import { cellOf, copyText, labColumns, labCsv, labRows, PERIODS, rangeText, trendOf, type LabColumn, type Order, type PendingDraw, type PeriodKey } from "@/lib/lab-table";
import { ANALYTES, rangeFor, type Analyte } from "@/lib/master";
import type { Patient } from "@/lib/types";

/** What the table does with the pointer: press an item or a date to choose it, drag to the note, right click for the rest. */
type Pick = {
  rows: string[];
  cols: string[];
  /** The cells that go into the note or the copy (shown only once something is chosen). */
  area: { rows: string[]; cols: string[] } | null;
  trend: string | null;
  onRow: (code: string, shift: boolean) => void;
  onCol: (key: string, shift: boolean) => void;
  onTrend: (code: string) => void;
  onDrag: (e: React.DragEvent, col?: LabColumn) => void;
};

/**
 * Lab results by date, plus culture reports. Values are shown, never judged. Pressing an item (row) or a date (column)
 * chooses it (Shift for a run of them); what is chosen can be dragged into the note from any cell, and the rest
 * (paste, copy, the graph, sets of items, CSV, print) is on the right-click menu (a long press on a finger).
 */
export function ResultsPanel({ patient, today, pending = [], onExport, focusAt }: { patient: Patient; today: CalendarDate; pending?: PendingDraw[]; onExport?: (what: "CSV" | "コピー" | "印刷", n: number) => void; focusAt?: { day: number; time: string } }) {
  const [order, setOrder] = useState<Order>("旧→新");
  const [period, setPeriod] = useState<PeriodKey>("all");
  const [abnormalOnly, setAbnormalOnly] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [codes, setCodes] = useState<string[]>([]);
  const [anchor, setAnchor] = useState<{ row: string | null; col: string | null }>({ row: null, col: null });
  const [showSelectedTrends, setShowSelectedTrends] = useState(false);
  const [trend, setTrend] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [printing, setPrinting] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number; code?: string } | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);
  const longPress = useLongPress<HTMLDivElement>((at) => setMenu(at));

  const days = PERIODS.find((p) => p.key === period)?.days ?? null;
  const cols = labColumns(patient.labs, pending, order, days === null ? null : 1 - days);
  const rows = labRows(cols, patient.sex, abnormalOnly);
  const resultCols = cols.filter((c) => c.kind === "result");
  const chosen = picked.length ? resultCols.filter((c) => picked.includes(c.key)) : [...resultCols].sort((a, b) => b.at - a.at).slice(0, 1);
  const chosenRows = codes.length ? rows.filter((a) => codes.includes(a.code)) : rows;
  const payload = labTransfer(patient, chosen.flatMap(c => c.kind === "result" ? [c.lab] : []), chosenRows.map(a => a.code), today);
  const dragResults = (e: React.DragEvent, columns: LabColumn[] = chosen) => {
    e.stopPropagation();
    const data = labTransfer(patient, columns.flatMap(c => c.kind === "result" ? [c.lab] : []), chosenRows.map(a => a.code), today);
    if (!data.text) { e.preventDefault(); return; }
    e.dataTransfer.setData(LAB_RESULT_MIME, JSON.stringify(data));
    e.dataTransfer.setData("text/plain", data.text);
    e.dataTransfer.effectAllowed = "copy";
  };
  const trendPatient = { ...patient, labs: (picked.length ? chosen : resultCols).flatMap(c => c.kind === "result" ? [c.lab] : []) };
  const trendAnalyte = trend ? ANALYTES.find((a) => a.code === trend) : undefined;
  const allCodes = rows.map((a) => a.code);
  const pick: Pick = {
    rows: codes,
    cols: picked,
    area: codes.length || picked.length ? { rows: chosenRows.map((a) => a.code), cols: chosen.map((c) => c.key) } : null,
    trend,
    onRow: (code, shift) => {
      setCodes((c) => pickWithShift(c, allCodes, code, anchor.row, shift));
      setAnchor((a) => ({ ...a, row: code }));
    },
    onCol: (key, shift) => {
      setPicked((p) => pickWithShift(p, resultCols.map((c) => c.key), key, anchor.col, shift));
      setAnchor((a) => ({ ...a, col: key }));
    },
    onTrend: (code) => setTrend((t) => (t === code ? null : code)),
    onDrag: (e, col) => dragResults(e, col && !picked.includes(col.key) ? [col] : chosen),
  };

  const flash = (t: string) => {
    setNote(t);
    window.setTimeout(() => setNote(""), 2500);
  };
  const copy = async () => {
    const text = copyText(chosen, chosenRows, patient.sex, today);
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      flash(`${chosen.length}回分の結果をコピーしました。記事に貼り付けられます`);
      onExport?.("コピー", chosen.length);
    } catch {
      flash("この端末ではコピーできませんでした");
    }
  };
  const saveCsv = () => {
    const blob = new Blob([labCsv(cols, rows, patient.sex, today)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `検査結果_${patient.id}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    onExport?.("CSV", cols.length);
  };
  const print = () => {
    flushSync(() => setPrinting(true));
    const done = () => {
      setPrinting(false);
      window.removeEventListener("afterprint", done);
    };
    window.addEventListener("afterprint", done);
    window.print();
    onExport?.("印刷", cols.length);
  };
  const clear = () => {
    setCodes([]);
    setPicked([]);
  };
  const what = `${codes.length ? `${chosenRows.length}項目` : "全項目"}・${picked.length ? `${chosen.length}回` : "最新の回"}`;
  const menuActions: CellAction[] = [
    { label: "記事に貼る", disabled: payload.text ? null : "貼る値がありません", onClick: () => requestLabPaste(payload) },
    { label: "コピー", disabled: payload.text ? null : "値がありません", onClick: () => void copy() },
    { label: "時系列で見る", disabled: chosenRows.length && resultCols.length ? null : "結果がありません", onClick: () => (!codes.length && menu?.code ? setTrend(menu.code) : setShowSelectedTrends(true)) },
    ...Object.keys(LAB_SELECTIONS)
      .filter((name) => selectLabSet(allCodes, name).length)
      .map((name) => ({ label: `${name}を選ぶ`, onClick: () => setCodes(selectLabSet(allCodes, name)) })),
    { label: "全部選ぶ", onClick: () => { setCodes(allCodes); setPicked(resultCols.map((c) => c.key)); } },
    ...(codes.length || picked.length ? [{ label: "選択を外す", onClick: clear }] : []),
    { label: order === "旧→新" ? "新しい回を左に並べる" : "古い回を左に並べる", onClick: () => setOrder((o) => (o === "旧→新" ? "新→旧" : "旧→新")) },
    { label: "CSV で保存", disabled: cols.length ? null : "結果がありません", onClick: saveCsv },
    { label: "印刷", disabled: cols.length ? null : "結果がありません", onClick: print },
  ];
  const codeAt = (t: EventTarget) => (t instanceof Element ? (t.closest("[data-code]")?.getAttribute("data-code") ?? undefined) : undefined);
  const tag = "rounded px-1.5 py-0.5";

  return (
    <div className="space-y-3">
      <section>
        <h3 className="mb-2 text-sm font-bold">検体検査</h3>
        {cols.length === 0 && patient.labs.length === 0 && pending.length === 0 ? (
          <p className="text-sm text-ink-faint">結果なし</p>
        ) : (
          <>
            <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
              <span className="flex items-center gap-1" role="group" aria-label="期間">
                {PERIODS.map((p) => (
                  <button key={p.key} type="button" aria-pressed={period === p.key} onClick={() => setPeriod(p.key)} className={`${tag} ${period === p.key ? "bg-ai text-sheet" : "text-ink-soft hover:bg-paper"}`}>
                    {p.label}
                  </button>
                ))}
              </span>
              <button type="button" aria-pressed={abnormalOnly} onClick={() => setAbnormalOnly((v) => !v)} className={`${tag} ${abnormalOnly ? "bg-ai text-sheet" : "text-ink-soft hover:bg-paper"}`}>
                H・L だけ
              </button>
            </div>
            {showSelectedTrends && chosenRows.map(a => <Trend key={a.code} analyte={a} patient={trendPatient} today={today} onClose={() => setShowSelectedTrends(false)} />)}
            {note && (
              <p role="status" className="mb-2 text-[11px] text-wakatake">
                {displayText(note)}
              </p>
            )}
            {trendAnalyte && <Trend analyte={trendAnalyte} patient={patient} today={today} onClose={() => setTrend(null)} />}
            {cols.length === 0 ? (
              <p className="text-sm text-ink-faint">この期間の結果はありません</p>
            ) : (
              <div
                className="scroll-thin overflow-x-auto outline-none focus-visible:ring-2 focus-visible:ring-ai/40"
                tabIndex={0}
                aria-label="検査結果の表（右クリック・長押しで操作）"
                {...longPress}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setMenu({ x: e.clientX, y: e.clientY, code: codeAt(e.target) });
                }}
                onKeyDown={(e) => {
                  if (e.key === "ContextMenu" || (e.shiftKey && e.key === "F10")) {
                    e.preventDefault();
                    const r = (e.target as Element).getBoundingClientRect();
                    setMenu({ x: r.left, y: r.bottom, code: codeAt(e.target) });
                  } else if (e.key === "Escape" && (codes.length || picked.length)) clear();
                }}
              >
                <LabTable cols={cols} rows={rows} patient={patient} today={today} focusAt={focusAt} pick={pick} />
              </div>
            )}
            {menu && <FlowCellMenu at={menu} title={`検査結果（${what}）`} actions={menuActions} onClose={closeMenu} />}
          </>
        )}
      </section>

      <section>
        <h3 className="mb-2 text-sm font-bold">細菌検査</h3>
        {patient.cultures.length === 0 ? (
          <p className="text-sm text-ink-faint">提出なし</p>
        ) : (
          <ul className="space-y-3">
            {patient.cultures.map((c, i) => (
              <li key={i} className="rounded-md border border-rule-soft bg-paper/60 p-3 text-[13px]">
                <div className="nums mb-1 flex flex-wrap items-center gap-2 text-xs text-ink-faint">
                  <span>採取 {formatShort(addDays(today, c.collectedOn))}</span>
                  <b className="text-ink">{c.specimen}培養</b>
                  {c.sets && <span>{c.sets}</span>}
                  <span className="ml-auto rounded border border-rule px-1">{c.status}</span>
                </div>
                {c.log && c.log.length > 0 && (
                  <ol className="nums mb-1 text-[11px] text-ink-soft">
                    {c.log.map((l, n) => (
                      <li key={n}>
                        {formatShort(addDays(today, l.day))} {l.time} {displayText(l.by)}　{displayText(l.text)}
                      </li>
                    ))}
                  </ol>
                )}
                {c.gram && <div>グラム染色：{c.gram}</div>}
                {c.organism && <div className="font-bold">同定：{c.organism}</div>}
                {c.susceptibility && (
                  <table className="nums mt-2 text-xs">
                    <thead>
                      <tr className="text-ink-faint">
                        <th className="pr-4 text-left font-normal">薬剤</th>
                        <th className="pr-4 text-right font-normal">MIC（μg/mL）</th>
                        <th className="text-left font-normal">判定</th>
                      </tr>
                    </thead>
                    <tbody>
                      {c.susceptibility.map((s) => (
                        <tr key={s.drug}>
                          <td className="pr-4">{s.drug}</td>
                          <td className="pr-4 text-right">{s.mic}</td>
                          <td className={s.result === "R" ? "text-shu" : ""}>{s.result}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {printing &&
        createPortal(
          <div className="print-sheet hidden bg-white p-[5mm] text-[9pt] text-ink print:block">
            <div className="mb-2 flex items-baseline gap-4">
              <b className="text-[12pt]">検査結果</b>
              <span>
                {patient.name}（{patient.id}）{patient.sex}
              </span>
              <span className="ml-auto">印刷 {formatShort(today)}</span>
            </div>
            <LabTable cols={cols} rows={rows} patient={patient} today={today} />
          </div>,
          document.body,
        )}
    </div>
  );
}

function LabTable({ cols, rows, patient, today, focusAt, pick }: { cols: LabColumn[]; rows: Analyte[]; patient: Patient; today: CalendarDate; focusAt?: { day: number; time: string }; pick?: Pick }) {
  const isFocus = (c: LabColumn) => !!focusAt && c.kind === "result" && c.day === focusAt.day && c.time === focusAt.time;
  const inArea = (c: LabColumn, a: Analyte) => !!pick?.area && pick.area.rows.includes(a.code) && pick.area.cols.includes(c.key);
  // Shift+press chooses a run; keep it from also selecting the text.
  const noShiftSelect = (e: React.MouseEvent) => e.shiftKey && e.preventDefault();
  return (
    <table className="nums w-auto table-auto self-start whitespace-nowrap border-collapse text-[13px] print:text-[9pt]">
      <thead>
        <tr className="border-b border-rule text-xs text-ink-faint">
          <th className="sticky left-0 z-10 bg-sheet py-1 pr-3 text-left font-normal print:static">項目</th>
          <th className="py-1 pr-3 text-left font-normal">単位</th>
          <th className="py-1 pr-3 text-left font-normal" title="共用＝JCCLS 共用基準範囲（2022）、SRL＝SRL 総合検査案内 2026-2027。＊は判断値あり">
            基準範囲
          </th>
          {cols.map((c) => {
            const r = c.kind === "result" ? c.lab : null;
            const on = !!pick && pick.cols.includes(c.key);
            const when = (
              <>
                {formatShort(addDays(today, c.day))}
                <br />
                {c.time}
              </>
            );
            return (
              <th draggable={!!pick && c.kind === "result"} onDragStart={(e) => pick?.onDrag(e, c)} key={c.key} ref={isFocus(c) ? (el) => el?.scrollIntoView({ inline: "center", block: "nearest" }) : undefined} className={`py-1 pl-3 text-right align-bottom font-normal ${isFocus(c) && !on ? "rounded-t bg-yamabuki-soft text-ink" : ""} ${c.kind === "pending" ? "text-yamabuki" : ""}`} title={displayText(r?.corrected ? `訂正（第${r.corrected.version}版）${r.corrected.at.time} ${r.corrected.by}　理由：${r.corrected.reason}` : c.kind === "pending" ? c.draw.tests : undefined)}>
                {pick && c.kind === "result" ? (
                  <button type="button" aria-pressed={on} onMouseDown={noShiftSelect} onClick={(e) => pick.onCol(c.key, e.shiftKey)} className={`-mr-1 rounded px-1 py-0.5 text-right ${on ? "bg-ai font-bold text-sheet" : "hover:bg-ai-soft hover:text-ai"}`}>
                    {when}
                  </button>
                ) : (
                  when
                )}
                {c.kind === "pending" && (
                  <>
                    <br />
                    <span className="font-bold">
                      {c.draw.status}
                      {c.draw.urgent ? "・至急" : ""}
                    </span>
                  </>
                )}
                {r?.corrected && (
                  <>
                    <br />
                    <span className="font-bold text-yamabuki">訂正 第{r.corrected.version}版</span>
                  </>
                )}
              </th>
            );
          })}
        </tr>
      </thead>
      <tbody>
        {rows.map((a) => {
          const on = !!pick && pick.rows.includes(a.code);
          return (
            <tr key={a.code} data-code={a.code} draggable={!!pick} onDragStart={(e) => pick?.onDrag(e)} className={`border-b border-rule-soft ${pick?.trend === a.code ? "bg-ai-soft/60" : ""}`}>
              <td className="sticky left-0 z-10 bg-sheet py-1 pr-3 font-bold print:static">
                {pick ? (
                  <button type="button" aria-pressed={on} onMouseDown={noShiftSelect} onClick={(e) => pick.onRow(a.code, e.shiftKey)} onDoubleClick={() => pick.onTrend(a.code)} className={`-mx-1 rounded px-1 ${on ? "bg-ai text-sheet" : "hover:bg-ai-soft hover:text-ai"}`}>
                    {a.name}
                  </button>
                ) : (
                  a.name
                )}
              </td>
              <td className="py-1 pr-3 text-xs text-ink-faint">{a.unit}</td>
              <td className="py-1 pr-3 text-[11px] text-ink-faint" title={a.judgment ? `判断値：${a.judgment}` : undefined}>
                {displayText(rangeText(a, patient.sex))}

                {a.judgment ? " ＊" : ""}
              </td>
              {cols.map((c) => {
                const x = cellOf(c, a, patient.sex);
                return (
                  <td key={c.key} title={pick && x.kind === "value" && c.kind === "result" ? displayText(valueTip(patient.labs, c.lab, a.code, a.unit, rangeText(a, patient.sex), today)) : undefined} className={`py-1 pl-3 text-right ${inArea(c, a) ? "bg-ai-soft" : isFocus(c) ? "bg-yamabuki-soft/60" : ""} ${x.kind === "value" && x.flag === "H" ? "text-shu" : x.kind === "value" && x.flag === "L" ? "text-ai" : ""}`}>
                    {x.kind === "value" ? (
                      <>
                        {labNumber(a.code, x.value)}
                        <span className="inline-block w-3 text-[10px]">{x.flag}</span>
                      </>
                    ) : x.kind === "pending" ? (
                      <span className="text-[11px] text-yamabuki">{x.status}</span>
                    ) : (
                      <span className="text-ink-faint">—</span>
                    )}
                  </td>
                );
              })}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** One analyte over time: a 2px line with markers, the reference range as a band, a hover readout. */
function Trend({ analyte, patient, today, onClose }: { analyte: Analyte; patient: Patient; today: CalendarDate; onClose: () => void }) {
  const pts = trendOf(patient.labs, analyte.code);
  const [hover, setHover] = useState<number | null>(null);
  const rg = rangeFor(analyte, patient.sex);
  const W = 560;
  const H = 170;
  const pad = { l: 44, r: 16, t: 12, b: 28 };
  const vals = [...pts.map((p) => p.value), ...(rg.low !== undefined ? [rg.low] : []), ...(rg.high !== undefined ? [rg.high] : [])];
  const lo0 = Math.min(...vals);
  const hi0 = Math.max(...vals);
  const span = hi0 - lo0 || Math.abs(hi0) || 1;
  const lo = lo0 - span * 0.1;
  const hi = hi0 + span * 0.1;
  const t0 = pts[0]?.at ?? 0;
  const t1 = pts.at(-1)?.at ?? 0;
  const x = (at: number) => (t1 === t0 ? (pad.l + W - pad.r) / 2 : pad.l + ((at - t0) / (t1 - t0)) * (W - pad.l - pad.r));
  const y = (v: number) => pad.t + (1 - (v - lo) / (hi - lo)) * (H - pad.t - pad.b);
  const ticks = [lo0, (lo0 + hi0) / 2, hi0];
  const fmt = (v: number) => (Math.abs(v) >= 100 ? Math.round(v).toLocaleString("ja-JP") : String(Math.round(v * 100) / 100));
  const h = hover !== null ? pts[hover] : null;
  const nearest = (clientX: number, box: DOMRect) => {
    const sx = ((clientX - box.left) / box.width) * W;
    let best = 0;
    pts.forEach((p, i) => {
      if (Math.abs(x(p.at) - sx) < Math.abs(x(pts[best].at) - sx)) best = i;
    });
    return best;
  };
  return (
    <div className="mb-3 rounded-md border border-rule-soft bg-sheet p-3">
      <div className="mb-1 flex items-baseline gap-2 text-xs">
        <b className="text-sm">{analyte.name}</b>
        <span className="text-ink-faint">
          {analyte.unit}　基準範囲 {displayText(rangeText(analyte, patient.sex))}（帯）　{pts.length}回
        </span>
        <button type="button" onClick={onClose} aria-label="グラフを閉じる" className="ml-auto text-ink-faint hover:text-ink">
          <X size={14} />
        </button>
      </div>
      {pts.length === 0 ? (
        <p className="text-xs text-ink-faint">結果がまだありません</p>
      ) : (
        <div className="relative">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full touch-none" role="img" aria-label={`${analyte.name}の経過：${pts.map((p) => `${formatShort(addDays(today, p.day))} ${p.time} ${p.value}`).join("、")}`} onPointerMove={(e) => setHover(nearest(e.clientX, e.currentTarget.getBoundingClientRect()))} onPointerLeave={() => setHover(null)}>
            {(rg.low !== undefined || rg.high !== undefined) && <rect x={pad.l} width={W - pad.l - pad.r} y={y(Math.min(rg.high ?? hi, hi))} height={Math.max(0, y(Math.max(rg.low ?? lo, lo)) - y(Math.min(rg.high ?? hi, hi)))} className="fill-wakatake-soft" />}
            {ticks.map((t, i) => (
              <g key={i}>
                <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} className="stroke-rule-soft" strokeWidth={1} />
                <text x={pad.l - 6} y={y(t) + 3} textAnchor="end" className="fill-ink-faint text-[10px]">
                  {fmt(t)}
                </text>
              </g>
            ))}
            {pts.map((p, i) =>
              i === 0 || i === pts.length - 1 || pts.length <= 6 ? (
                <text key={`x${i}`} x={x(p.at)} y={H - 8} textAnchor={pts.length > 1 && i === 0 ? "start" : pts.length > 1 && i === pts.length - 1 ? "end" : "middle"} className="fill-ink-faint text-[10px]">
                  {`${addDays(today, p.day).m}/${addDays(today, p.day).d} ${p.time}`}
                </text>
              ) : null,
            )}
            {h && <line x1={x(h.at)} x2={x(h.at)} y1={pad.t} y2={H - pad.b} className="stroke-ink-faint" strokeWidth={1} />}
            <polyline points={pts.map((p) => `${x(p.at)},${y(p.value)}`).join(" ")} fill="none" className="stroke-ai" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            {pts.map((p, i) => (
              <circle key={i} cx={x(p.at)} cy={y(p.value)} r={hover === i ? 5 : 4} className="fill-ai stroke-sheet" strokeWidth={2} tabIndex={0} onFocus={() => setHover(i)} onBlur={() => setHover(null)} aria-label={`${formatShort(addDays(today, p.day))} ${p.time} ${p.value}${analyte.unit}`} />
            ))}
          </svg>
          {h && (
            <div className="pointer-events-none absolute top-0 rounded border border-rule bg-sheet px-2 py-1 text-[11px] shadow-sm" style={{ left: `${Math.min(80, Math.max(0, (x(h.at) / W) * 100 - 8))}%` }}>
              <b className="nums text-[13px]">
                {h.value.toLocaleString("ja-JP")}
                {analyte.unit}
                {rg.high !== undefined && h.value > rg.high ? " H" : rg.low !== undefined && h.value < rg.low ? " L" : ""}
              </b>
              <div className="text-ink-faint">
                {formatShort(addDays(today, h.day))} {h.time}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* Help migration source (references and dynamic wording):
<span >項目名や日付を押すと選び（Shift で範囲）、ダブルクリックで経過のグラフ。「検査中」は採血・受付が済んで結果がまだのもの、「採取待ち」は予定の時刻を過ぎて採血の記録がないもの。</span>
*/
