"use client";

import { Printer } from "lucide-react";
import { useState } from "react";
import { addDays, formatShort, hospitalDay, type CalendarDate } from "@/lib/dates";
import { HOSPITAL_LINE_TEMPLATES, LINE_CATS, LINE_RULES, currentLines, lineLabel, lineProblems, loadMyTemplates, pastLines, saveMyTemplates, templateProblems, whenText, type LineCat, type LineTemplate, type StandingLine, type When } from "@/lib/standing-lines";
import type { StandingOrders } from "@/lib/standing";
import type { Patient } from "@/lib/types";
import { HOSPITAL } from "../HomeRxPrint";
import { usePrintSheet } from "../DeskParts";
import { DenyNote, useDeny, useMe } from "../RoleContext";
import { TabChoice } from "../TabChoice";
import { StandingView } from "./StandingPanel";

const CAT_TONE: Record<LineCat, string> = {
  ADL: "bg-ai-soft text-ai",
  検査: "bg-tab text-ink",
  安静: "bg-ai-soft text-ai",
  食事: "bg-yamabuki-soft text-yamabuki",
  清潔: "bg-mizu-soft text-mizu",
  排泄: "bg-kuri-soft text-kuri",
  観察: "bg-wakatake-soft text-wakatake",
  バイタル: "bg-wakatake-soft text-wakatake",
  呼出基準: "bg-shu-soft text-shu",
  処置: "bg-fuji-soft text-fuji",
  頓用: "bg-fuji-soft text-fuji",
  その他: "bg-tab text-ink-soft",
};

/** The category chip of a line. */
export function CatChip({ cat, small }: { cat: LineCat; small?: boolean }) {
  return <span className={`inline-block whitespace-nowrap rounded px-1 font-bold ${small ? "text-[10px] leading-4" : "text-[11px] leading-5"} ${CAT_TONE[cat]} print:border print:border-ink/40 print:bg-transparent print:text-ink`}>{cat}</span>;
}

interface Draft {
  cat: LineCat;
  text: string;
  start: When;
  end: When | null;
}

/**
 * 指示簿の行: the doctor's free-text lines (picked from a template and edited, or typed), each with a category,
 * a start and an optional end. A line is stopped with a reason and stays as history. Nurses read; the
 * worksheet takes new and stopped lines (指示受け). Printed on A4 (portrait) with the 項目で選ぶ fields.
 */
export function StandingLines({ patient, lines, fields, today, nowTime, onAdd, onStop, newId }: { patient: Patient; lines: StandingLine[]; fields?: StandingOrders; today: CalendarDate; nowTime: string; onAdd: (l: StandingLine) => void; onStop: (id: string, reason: string) => void; newId: () => string }) {
  const me = useMe();
  const deny = useDeny();
  const [print, sheet] = usePrintSheet();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [stopping, setStopping] = useState<{ id: string; reason: string } | null>(null);
  const [mine, setMine] = useState<LineTemplate[]>(() => loadMyTemplates(me.name));
  const [tplCat, setTplCat] = useState<LineCat | "all">("all");
  const [saveNote, setSaveNote] = useState("");
  const fmtDay = (d: number) => formatShort(addDays(today, d));
  const cur = currentLines(lines);
  const past = pastLines(lines);
  const canOrder = !deny("order");

  const startDraft = (t?: LineTemplate) => {
    setDraft({ cat: t?.cat ?? "安静", text: t?.text ?? "", start: { day: 0, time: nowTime }, end: null });
    setSaveNote("");
  };
  const pick = (t: LineTemplate) => (draft ? setDraft({ ...draft, cat: t.cat, text: t.text }) : startDraft(t));
  const keepMine = () => {
    if (!draft) return;
    const problems = templateProblems(draft.cat, draft.text, mine);
    if (problems.length) return setSaveNote(problems.join(" "));
    const next = [...mine, { id: newId(), cat: draft.cat, text: draft.text.trim() }];
    setMine(next);
    setSaveNote(saveMyTemplates(me.name, next) ? "自分のテンプレートに登録しました（この端末のみに保存されます）。" : "この端末に保存できませんでした（ページを閉じるまでは使えます）。");
  };
  const dropMine = (id: string) => {
    const next = mine.filter((t) => t.id !== id);
    setMine(next);
    saveMyTemplates(me.name, next);
  };
  const templates = [...mine.map((t) => ({ ...t, mine: true })), ...HOSPITAL_LINE_TEMPLATES.map((t) => ({ ...t, mine: false }))].filter((t) => tplCat === "all" || t.cat === tplCat);
  const problems = draft ? lineProblems({ ...draft, end: draft.end ?? undefined }) : [];
  const dayOptions = (from: number, to: number) => {
    const out: { value: number; label: string }[] = [];
    for (let d = from; d <= to; d++) out.push({ value: d, label: `${fmtDay(d)}${d === 0 ? " 今日" : d === 1 ? " 明日" : ""}` });
    return out;
  };
  const printSheet = () => print(<StandingPrintSheet patient={patient} lines={cur} fields={fields} today={today} nowTime={nowTime} by={me.name} />, { portrait: true });

  return (
    <section className="space-y-3 text-[12px]" aria-label="指示簿の行">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-bold text-ink-soft">指示の行（{cur.length}）</h3>
        <button type="button" onClick={printSheet} disabled={cur.length === 0 && !fields} className="flex items-center gap-1 rounded border border-ai/50 px-2 py-0.5 text-[11px] font-bold text-ai hover:bg-ai-soft disabled:opacity-40 pointer-coarse:py-1.5">
          <Printer size={12} />
          指示簿を印刷（A4 縦）
        </button>
        {!draft && (
          <button type="button" disabled={!canOrder} onClick={() => startDraft()} className="rounded-md border border-ai px-3 py-1 font-bold text-ai hover:bg-ai-soft disabled:opacity-40">
            ＋ 行を足す
          </button>
        )}
        <DenyNote action="order" />
      </div>
      <p className="text-[11px] text-ink-faint">{LINE_RULES.cats}</p>

      {cur.length === 0 ? (
        <p className="text-ink-faint">いまの指示の行はありません。</p>
      ) : (
        <ul className="divide-y divide-rule-soft rounded-md border border-rule">
          {cur.map((l) => (
            <li key={l.id} className="flex flex-wrap items-start gap-x-2 gap-y-1 px-2 py-1.5">
              <CatChip cat={l.cat} />
              <div className="min-w-0 flex-1">
                <div className="whitespace-pre-wrap">{l.text}</div>
                <div className="nums text-[11px] text-ink-faint">
                  {whenText(l.start, fmtDay)}から{l.end ? ` ${whenText(l.end, fmtDay)}まで` : "（変えるまで）"}　{l.by}
                  {l.start.day > 0 && <span className="ml-1 rounded border border-ai/40 px-1 text-ai">予定</span>}
                </div>
                {stopping?.id === l.id && (
                  <div className="mt-1 space-y-1 rounded border border-shu/40 bg-shu-soft/30 p-2">
                    <label className="flex items-center gap-1.5">
                      中止の理由
                      <input value={stopping.reason} onChange={(e) => setStopping({ id: l.id, reason: e.target.value })} placeholder="任意。例：歩行が安定した" className="flex-1 rounded border border-rule bg-sheet px-1.5 py-0.5" />
                    </label>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-ink-faint">行は消えず、中止の時刻と人が残ります。看護師が指示受けします。</span>
                      <button type="button" onClick={() => setStopping(null)} className="ml-auto rounded border border-rule px-2 py-0.5">
                        やめる
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onStop(l.id, stopping.reason);
                          setStopping(null);
                        }}
                        className="rounded bg-shu px-2 py-0.5 font-bold text-white"
                      >
                        中止を確定（{me.name} {nowTime}）
                      </button>
                    </div>
                  </div>
                )}
              </div>
              {canOrder && stopping?.id !== l.id && (
                <button type="button" onClick={() => setStopping({ id: l.id, reason: "" })} className="rounded border border-rule px-1.5 text-[11px] text-ink-soft hover:border-shu hover:text-shu pointer-coarse:py-1">
                  中止
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {draft && (
        <div className="space-y-2 rounded-md border border-ai/50 bg-ai-soft/20 p-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="w-14 shrink-0 text-ink-soft">分類</span>
            <TabChoice label="分類" options={LINE_CATS.map((c) => ({ value: c, label: c }))} value={draft.cat} onChange={(v) => setDraft({ ...draft, cat: v })} />
          </div>
          <textarea value={draft.text} onChange={(e) => setDraft({ ...draft, text: e.target.value })} rows={2} aria-label="指示の文" placeholder="例：安静度：病棟内フリー（テンプレートを選ぶと入ります。直してから確定）" className="w-full rounded border border-rule bg-sheet px-2 py-1" />
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="w-14 shrink-0 text-ink-soft">開始</span>
            <select value={draft.start.day} onChange={(e) => setDraft({ ...draft, start: { ...draft.start, day: Number(e.target.value) } })} aria-label="開始の日" className="rounded border border-rule bg-sheet px-1 py-0.5">
              {dayOptions(0, 7).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <input type="time" value={draft.start.time ?? ""} onChange={(e) => setDraft({ ...draft, start: { ...draft.start, time: e.target.value || undefined } })} aria-label="開始の時刻（任意）" className="rounded border border-rule bg-sheet px-1 py-0.5" />
            <span className="text-[11px] text-ink-faint">時刻は任意</span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="w-14 shrink-0 text-ink-soft">終了</span>
            <label className="flex items-center gap-1">
              <input type="checkbox" checked={!draft.end} onChange={() => setDraft({ ...draft, end: draft.end ? null : { day: Math.max(draft.start.day, 0) + 1 } })} className="accent-ai" />
              変えるまで続く
            </label>
            {draft.end && (
              <>
                <select value={draft.end.day} onChange={(e) => setDraft({ ...draft, end: { ...draft.end!, day: Number(e.target.value) } })} aria-label="終了の日" className="rounded border border-rule bg-sheet px-1 py-0.5">
                  {dayOptions(draft.start.day, draft.start.day + 14).map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <input type="time" value={draft.end.time ?? ""} onChange={(e) => setDraft({ ...draft, end: { ...draft.end!, time: e.target.value || undefined } })} aria-label="終了の時刻（任意）" className="rounded border border-rule bg-sheet px-1 py-0.5" />
                <span className="text-[11px] text-ink-faint">その日まで</span>
              </>
            )}
          </div>
          {draft.cat === "頓用" && <p className="text-[11px] text-yamabuki">{LINE_RULES.prn}</p>}
          <div className="flex flex-wrap items-center gap-2 border-t border-rule-soft pt-2">
            <button
              type="button"
              disabled={problems.length > 0 || !canOrder}
              onClick={() => {
                onAdd({ id: newId(), cat: draft.cat, text: draft.text.trim(), start: draft.start, end: draft.end ?? undefined, by: me.name, at: { day: 0, time: nowTime } });
                setDraft(null);
              }}
              className="rounded-md bg-ai px-4 py-1.5 font-bold text-white disabled:opacity-40"
            >
              この行を確定
            </button>
            <button type="button" onClick={() => setDraft(null)} className="rounded-md border border-rule px-3 py-1.5 text-ink-soft">
              やめる
            </button>
            <button type="button" disabled={!draft.text.trim()} onClick={keepMine} className="rounded-md border border-rule px-2 py-1.5 text-[11px] text-ink-soft hover:border-ai hover:text-ai disabled:opacity-40">
              この文を自分のテンプレートに登録
            </button>
            {problems.length > 0 && <span className="text-yamabuki">{problems.join(" ")}</span>}
            {saveNote && <span className="text-[11px] text-ink-soft">{saveNote}</span>}
          </div>
        </div>
      )}

      <details className="rounded-md border border-rule" open={!!draft}>
        <summary className="cursor-pointer px-2 py-1 font-bold text-ink-soft">テンプレート（院内 {HOSPITAL_LINE_TEMPLATES.length}・自分 {mine.length}）</summary>
        <div className="space-y-1.5 px-2 pb-2">
          <p className="text-[11px] text-ink-faint">{LINE_RULES.templates}</p>
          <div className="flex flex-wrap items-center gap-1 text-[11px]">
            <button type="button" aria-pressed={tplCat === "all"} onClick={() => setTplCat("all")} className={`rounded px-1.5 py-0.5 ${tplCat === "all" ? "bg-ink font-bold text-white" : "border border-rule text-ink-soft"}`}>
              すべて
            </button>
            {LINE_CATS.map((c) => (
              <button key={c} type="button" aria-pressed={tplCat === c} onClick={() => setTplCat(c)} className={`rounded px-1.5 py-0.5 ${tplCat === c ? "bg-ink font-bold text-white" : "border border-rule text-ink-soft"}`}>
                {c}
              </button>
            ))}
          </div>
          <ul className="max-h-64 space-y-0.5 overflow-y-auto">
            {templates.map((t) => (
              <li key={t.id} className="flex items-center gap-1.5">
                <button type="button" disabled={!canOrder} onClick={() => pick(t)} title="押すと行の文に入ります（直してから確定）" className="flex min-w-0 flex-1 items-center gap-1.5 rounded px-1 py-0.5 text-left hover:bg-paper disabled:opacity-40 pointer-coarse:py-1.5">
                  <CatChip cat={t.cat} small />
                  <span className="truncate">{t.text}</span>
                  {t.mine && <span className="ml-auto shrink-0 rounded border border-fuji/50 px-1 text-[10px] text-fuji">自分</span>}
                </button>
                {t.mine && (
                  <button type="button" onClick={() => dropMine(t.id)} aria-label={`テンプレート「${t.text}」を消す`} className="text-[11px] text-ink-faint hover:text-shu">
                    消す
                  </button>
                )}
              </li>
            ))}
            {templates.length === 0 && <li className="text-ink-faint">この分類のテンプレートはありません。</li>}
          </ul>
        </div>
      </details>

      {past.length > 0 && (
        <details className="text-[12px]">
          <summary className="cursor-pointer text-ink-soft">終わった行・中止した行（{past.length}）</summary>
          <ul className="mt-1 space-y-1 border-l-2 border-rule pl-2 text-ink-soft">
            {past.map((l) => (
              <li key={l.id} className="flex flex-wrap items-start gap-x-2">
                <CatChip cat={l.cat} small />
                <span className="line-through">{l.text}</span>
                <span className="nums text-[11px] text-ink-faint">
                  {whenText(l.start, fmtDay)}から　{l.by}
                  {l.stop ? `　中止 ${fmtDay(l.stop.day)} ${l.stop.time} ${l.stop.by}${l.stop.reason ? `（${l.stop.reason}）` : ""}` : l.end ? `　${whenText(l.end, fmtDay)}まで` : ""}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
      {sheet}
    </section>
  );
}

/** 指示簿 on A4 (portrait): the lines in force or planned, then the 項目で選ぶ fields. */
export function StandingPrintSheet({ patient, lines, fields, today, nowTime, by }: { patient: Patient; lines: StandingLine[]; fields?: StandingOrders; today: CalendarDate; nowTime: string; by: string }) {
  const fmtDay = (d: number) => formatShort(addDays(today, d));
  return (
    <div className="w-[180mm] text-[10pt] leading-relaxed text-ink">
      <h1 className="mb-1 text-center text-[16pt] font-bold">指示簿（約束指示）</h1>
      <div className="nums mb-2 flex flex-wrap justify-between gap-2 border-b border-ink/50 pb-1">
        <span>
          <b className="text-[13pt]">{patient.name}</b>（{patient.kana}）　{patient.age}歳 {patient.sex}　ID {patient.id}
        </span>
        <span>
          {patient.ward} {patient.room}　入院{hospitalDay(patient.admittedOn, 0)}日目
        </span>
      </div>
      <div className="nums mb-2 text-[9pt] text-ink-soft">
        印刷 {formatShort(today)} {nowTime}　{by}　{HOSPITAL}
      </div>
      <table className="w-full border-collapse text-[9.5pt]">
        <thead>
          <tr className="bg-ink/10">
            <th className="w-[14mm] border border-ink/40 px-1 py-1 text-left">分類</th>
            <th className="border border-ink/40 px-2 py-1 text-left">指示</th>
            <th className="w-[26mm] border border-ink/40 px-1 py-1 text-left">開始</th>
            <th className="w-[26mm] border border-ink/40 px-1 py-1 text-left">終了</th>
            <th className="w-[24mm] border border-ink/40 px-1 py-1 text-left">指示医</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.id} className="align-top">
              <td className="border border-ink/40 px-1 py-1">{l.cat}</td>
              <td className="border border-ink/40 px-2 py-1 whitespace-pre-wrap">{lineLabel(l)}</td>
              <td className="nums border border-ink/40 px-1 py-1">{whenText(l.start, fmtDay)}</td>
              <td className="nums border border-ink/40 px-1 py-1">{l.end ? whenText(l.end, fmtDay) : "変えるまで"}</td>
              <td className="border border-ink/40 px-1 py-1">{l.by}</td>
            </tr>
          ))}
          {lines.length === 0 && (
            <tr>
              <td colSpan={5} className="border border-ink/40 px-2 py-1 text-ink-soft">
                文の行はありません。
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {fields && (
        <section className="mt-3">
          <h2 className="mb-1 border-l-4 border-ink pl-2 text-[11pt] font-bold">項目で選んだ指示</h2>
          <div className="nums mb-1 text-[9pt] text-ink-soft">
            {fmtDay(fields.at.day)} {fields.at.time}　{fields.by}
            {fields.taken ? `　指示受け ${fields.taken.by} ${fields.taken.time}` : "　指示受けがまだ"}
          </div>
          <StandingView s={fields} />
        </section>
      )}
      <p className="mt-3 text-[8pt] text-ink-soft">架空の患者の指示簿です。分類と院内のテンプレートは架空の病院の取り決め。印刷のあとに変わった指示は電子カルテで確かめてください。</p>
    </div>
  );
}
