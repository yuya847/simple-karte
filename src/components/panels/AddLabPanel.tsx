"use client";

import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { TabChoice } from "../TabChoice";
import type { LabPoints } from "@/lib/billing/lab-points";
import { todayInTokyo, type CalendarDate } from "@/lib/dates";
import type { Draft } from "@/lib/drafts";
import { DRAW_TIMES, LAB_TABS, coveredBy, dayOptions, defaultDraw, drawProblem, drawText, labDraftOf, labelOf, pickedSummary, setPickables, tabSections, titleOf, togglePick, type DrawChoice, type DrawMode } from "@/lib/lab-catalog";
import { LAB_SOURCES } from "@/lib/lab-master-more";
import { LAB_TESTS, WARD_RULES, labInfo } from "@/lib/master";
import { nameIn, pickable, useMasterLocal } from "@/lib/master-local";
import type { LabPriority } from "@/lib/types";

const MODES: { value: DrawMode; label: string; title: string }[] = [
  { value: "now", label: "今すぐ（至急）", title: "いまの時刻から5分単位で切り上げ、至急として出す" },
  { value: "routine", label: "朝の定時", title: `病棟の定時採血（${WARD_RULES.routineDrawTime}）。日は下で選ぶ` },
  { value: "time", label: "日時を選ぶ", title: "日と時刻を選ぶ（定時の候補か、HH:MM を入れる）" },
  { value: "before_dose", label: "◯回目の投与前", title: `薬物濃度：時間ごとの注射の N 回目の投与の${WARD_RULES.minutesBeforeDoseForLevel}分前（病棟の決まり）` },
];

/**
 * Pick lab items by category tab (院内セット → 輸血検査), set when the sample is drawn (now, the routine
 * morning draw, a day and time, or before a dose for a level), and make one lab draft of it. A set
 * covers its single items, so those cannot be picked twice. The 実施料 of what is picked is read from
 * the official master on the server. The doctor decides every item; nothing is suggested here.
 */
export function AddLabPanel({
  onAdd,
  newId,
  today = todayInTokyo(),
  levelDrugs = [],
  initialTab = LAB_TABS[0].key,
}: {
  onAdd: (d: Draft) => void;
  newId: () => string;
  today?: CalendarDate;
  /** Injections running every N hours (a level can be timed to one of their doses). */
  levelDrugs?: { code: string; name: string }[];
  initialTab?: string;
}) {
  const [picked, setPicked] = useState<string[]>([]);
  const [tab, setTab] = useState(initialTab);
  const [draw, setDraw] = useState<DrawChoice>(defaultDraw());
  const [points, setPoints] = useState<{ for: string; data: LabPoints | null; failed: boolean } | null>(null);

  // マスタ管理: 採用 and not 中止, in 表示順, with the 院内名.
  const ml = useMasterLocal();
  const tests = pickable("検体検査", LAB_TESTS, ml);
  const name = (code: string) => nameIn(ml, "検体検査", code, labelOf(code));

  // 実施料 from the official master (server side), a moment after the picks settle.
  const key = picked.join(",");
  useEffect(() => {
    if (!key) return;
    const ctl = new AbortController();
    const t = window.setTimeout(async () => {
      try {
        const res = await fetch("/api/lab-points", { method: "POST", headers: { "content-type": "application/json" }, signal: ctl.signal, body: JSON.stringify({ codes: picked }) });
        if (!res.ok) throw new Error(String(res.status));
        setPoints({ for: key, data: (await res.json()) as LabPoints, failed: false });
      } catch (e) {
        if (!(e instanceof DOMException && e.name === "AbortError")) setPoints({ for: key, data: null, failed: true });
      }
    }, 300);
    return () => {
      window.clearTimeout(t);
      ctl.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` stands for the picks
  }, [key]);

  const current = LAB_TABS.find((x) => x.key === tab) ?? LAB_TABS[0];
  const summary = pickedSummary(picked);
  const problem = drawProblem(draw);
  const canAdd = picked.length > 0 && !problem;
  // Points shown only when they are for the current picks (an older answer or an empty pick shows nothing).
  const pts = key && points && points.for === key ? points : null;

  const itemButton = (code: string, label: string, title: string) => {
    const on = picked.includes(code);
    const by = on ? null : coveredBy(code, picked);
    if (by) {
      return (
        <button key={code} type="button" disabled title={`${title}　— ${name(by)}に含まれるので別には出せません`} className="nums min-w-12 rounded border border-dashed border-rule px-1.5 py-0.5 text-[12px] text-ink-faint/60">
          {label}
          <span className="ml-1 text-[10px]">{name(by)}に含まれる</span>
        </button>
      );
    }
    const i = labInfo(code);
    return (
      <button
        key={code}
        type="button"
        title={`${title}　${i.material}・${i.container}・${i.tat}`}
        aria-pressed={on}
        onClick={() => setPicked((p) => togglePick(p, code))}
        className={`nums min-w-12 rounded border px-1.5 py-0.5 text-[12px] ${on ? "border-ai bg-ai font-bold text-white" : "border-rule hover:border-ai"}`}
      >
        {label}
      </button>
    );
  };

  return (
    <div className="space-y-3 text-[13px]">
      {/* Fixed on top: what is picked, when, what it costs. */}
      <div className="sticky top-0 z-10 -mx-4 -mt-4 border-b border-rule bg-sheet px-4 pb-2 pt-3">
        <p className="hint mb-1 text-xs text-ink-soft">タブで分類を選び、項目を押して選びます。セットに含まれる項目は薄くなり、別には出せません。下で採取の日時を決め、「下書きにする」と記事の下に下書きができ、確かめて確定します。</p>
        {picked.length === 0 ? (
          <p className="text-xs text-ink-faint">まだ項目を選んでいません。</p>
        ) : (
          <>
            <ul className="flex flex-wrap gap-1" aria-label="選んだ項目">
              {picked.map((code) => (
                <li key={code} className="inline-flex items-center gap-0.5 rounded-md border border-ai bg-ai/10 pl-2 pr-0.5 text-[12px]" title={titleOf(code)}>
                  <span className="font-bold">{name(code)}</span>
                  <span className="hidden max-w-[22ch] truncate text-[11px] text-ink-soft sm:inline">{titleOf(code) !== name(code) ? `（${titleOf(code)}）` : ""}</span>
                  <button type="button" onClick={() => setPicked((p) => p.filter((c) => c !== code))} aria-label={`${name(code)}を外す`} className="rounded p-0.5 text-ink-faint hover:text-ink">
                    <X size={12} />
                  </button>
                </li>
              ))}
            </ul>
            <div className="mt-1.5 flex flex-wrap items-baseline gap-x-4 gap-y-0.5 text-[12px]">
              <span>
                <b>{summary.labCodes.length}項目</b>
                {picked.length !== summary.labCodes.length && <span className="text-ink-soft">（セットを開いて）</span>}
              </span>
              <span>容器：{summary.containers.join("・")}</span>
              <span>採取：{drawText(draw, today)}</span>
              <span className="nums">
                {pts?.data ? (
                  <>
                    実施料 <b>{pts.data.total.toLocaleString("ja-JP")}点</b>
                    <span className="text-ink-soft">（判断料・採血料は別。{pts.data.bundles.filter((b) => b.points !== null).map((b) => `${b.name.split("（")[0]} ${b.count}項目をまとめて${b.points}点`).join("、") || "まとめ点数なし"}）</span>
                  </>
                ) : pts?.failed ? (
                  <span className="text-ink-soft">点数は読めませんでした（項目数で確かめてください）</span>
                ) : (
                  <span className="text-ink-faint">点数を読み込み中…</span>
                )}
              </span>
            </div>
            {pts?.data?.lines.some((l) => l.note) && <div className="mt-0.5 text-[11px] text-ink-soft">{pts.data.lines.filter((l) => l.note).map((l) => `${l.label}：${l.note}`).join("　")}</div>}
            {summary.notes.map((n) => (
              <div key={n} className="text-[11px] text-yamabuki">
                {n}
              </div>
            ))}
          </>
        )}
      </div>

      <TabChoice label="検査の分類" options={LAB_TABS.map((t) => ({ value: t.key, label: t.label }))} value={current.key} onChange={setTab} />

      {current.key === "sets" ? (
        <section>
          <h3 className="mb-1 text-xs font-bold text-ink-soft">院内セット<span className="hint">（架空の病院の取り決め）</span></h3>
          <div className="flex flex-wrap gap-1.5">
            {setPickables(tests).map((s) => {
              const on = picked.includes(s.code);
              const by = on ? null : coveredBy(s.code, picked);
              return (
                <button
                  key={s.code}
                  type="button"
                  disabled={!!by}
                  title={by ? `${s.title}　— ${name(by)}に含まれる` : s.title}
                  aria-pressed={on}
                  onClick={() => setPicked((p) => togglePick(p, s.code))}
                  className={`rounded-md border px-2 py-1 ${on ? "border-ai bg-ai font-bold text-white" : by ? "border-dashed border-rule text-ink-faint/60" : "border-rule hover:border-ai"}`}
                >
                  {s.label}
                  {by && <span className="ml-1 text-[10px]">{name(by)}に含まれる</span>}
                </button>
              );
            })}
          </div>
          <p className="mt-1 text-[11px] text-ink-faint">セットの中身はボタンの title（マウスを乗せる）に出ます。セットを選ぶと、含まれる単項目は外れます。</p>
        </section>
      ) : (
        tabSections(current, tests).map((s) => (
          <section key={s.head || current.key}>
            {s.head && <h3 className="mb-1 text-xs font-bold text-ink-soft">{s.head}</h3>}
            <div className="flex flex-wrap gap-1">{s.items.map((t) => itemButton(t.code, nameIn(ml, "検体検査", t.code, t.abbr ?? t.name), t.name))}</div>
          </section>
        ))
      )}

      {/* When to draw */}
      <section className="rounded-md border border-rule bg-paper/60 p-2">
        <h3 className="mb-1 text-xs font-bold text-ink-soft">採取の日時</h3>
        <TabChoice label="採取のしかた" options={MODES} value={draw.mode} onChange={(mode) => setDraw((d) => ({ ...d, mode, priority: mode === "now" ? "至急" : d.priority }))} />
        {(draw.mode === "routine" || draw.mode === "time") && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1 text-xs">
              日
              <select value={draw.day} onChange={(e) => setDraw((d) => ({ ...d, day: Number(e.target.value) }))} className="rounded border border-rule bg-sheet px-1.5 py-1 text-[13px]">
                {dayOptions(today).map((o) => (
                  <option key={o.day} value={o.day}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            {draw.mode === "routine" ? (
              <span className="text-xs text-ink-soft">定時採血 {WARD_RULES.routineDrawTime}（病棟の決まり）</span>
            ) : (
              <label className="flex flex-wrap items-center gap-1 text-xs">
                時刻
                <span className="inline-flex gap-1">
                  {DRAW_TIMES.map((t) => (
                    <button key={t} type="button" onClick={() => setDraw((d) => ({ ...d, time: t }))} aria-pressed={draw.time === t} className={`nums rounded border px-1.5 py-0.5 text-[12px] ${draw.time === t ? "border-ai bg-ai font-bold text-white" : "border-rule hover:border-ai"}`}>
                      {t}
                    </button>
                  ))}
                </span>
                <input value={draw.time} onChange={(e) => setDraw((d) => ({ ...d, time: e.target.value.trim() }))} placeholder="HH:MM" inputMode="numeric" aria-label="時刻（HH:MM）" className="nums w-20 rounded border border-rule bg-sheet px-1.5 py-1 text-[13px]" />
              </label>
            )}
          </div>
        )}
        {draw.mode === "before_dose" && (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            {levelDrugs.length === 0 ? (
              <span className="text-ink-soft">時間ごと（◯時間ごと）の注射がいま有効でないので、投与前の採血は選べません。先に注射を出すか、「日時を選ぶ」で時刻を決めてください。</span>
            ) : (
              <>
                <label className="flex items-center gap-1">
                  薬
                  <select value={draw.beforeDose?.drugCode ?? ""} onChange={(e) => setDraw((d) => ({ ...d, beforeDose: e.target.value ? { n: d.beforeDose?.n ?? 3, drugCode: e.target.value } : null }))} className="rounded border border-rule bg-sheet px-1.5 py-1 text-[13px]">
                    <option value="">選ぶ</option>
                    {levelDrugs.map((d) => (
                      <option key={d.code} value={d.code}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex items-center gap-1">
                  <select value={draw.beforeDose?.n ?? 3} onChange={(e) => setDraw((d) => (d.beforeDose ? { ...d, beforeDose: { ...d.beforeDose, n: Number(e.target.value) } } : d))} disabled={!draw.beforeDose} className="rounded border border-rule bg-sheet px-1.5 py-1 text-[13px]">
                    {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                  回目の投与の{WARD_RULES.minutesBeforeDoseForLevel}分前
                </label>
              </>
            )}
          </div>
        )}
        {draw.mode !== "now" && (
          <div className="mt-2 flex items-center gap-2 text-xs">
            優先
            <TabChoice label="優先" options={(["定時", "至急"] as LabPriority[]).map((p) => ({ value: p, label: p === "定時" ? "通常（定時）" : "至急" }))} value={draw.priority} onChange={(priority) => setDraw((d) => ({ ...d, priority }))} />
          </div>
        )}
        <p className="hint mt-1 text-[11px] text-ink-soft">過ぎた日時は下書きの確認で止まります。「今すぐ」は至急として扱います。</p>
      </section>

      <div className="sticky bottom-0 flex items-center gap-2 border-t border-rule bg-sheet pt-3">
        {problem && picked.length > 0 && <span className="text-xs text-shu">{problem}</span>}
        <button type="button" disabled={!canAdd} onClick={() => onAdd(labDraftOf(newId(), picked, draw))} className="ml-auto rounded-md bg-ai px-4 py-2 text-sm font-bold text-white disabled:opacity-40">
          下書きにする（{summary.labCodes.length}項目・{drawText(draw, today)}）
        </button>
      </div>

      <footer className="hint space-y-1 text-[11px] text-ink-faint">
        <p>
          項目の分け方・略語・材料・容器（SRL の容器記号）・所要日数の参考：
          {LAB_SOURCES.map((s, i) => (
            <span key={s.url}>
              {i > 0 && "、"}
              <a href={s.url} target="_blank" rel="noreferrer" className="underline">
                {s.name}
              </a>
            </span>
          ))}
          。
        </p>
        <p>院内か外注か・所要日数・定時採血の時刻（{WARD_RULES.routineDrawTime}）と採取時刻の候補・院内セットの中身は架空の病院の取り決めです。実施料は医科診療行為マスターの点数で、判断料・採血料・加算は会計で算定します。結果の基準範囲は JCCLS 共用基準範囲（なければ SRL の値）です。</p>
      </footer>
    </div>
  );
}
