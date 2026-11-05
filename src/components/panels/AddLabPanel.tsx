"use client";

import { useMe } from "../RoleContext";
import { orderDefaults } from "@/lib/order-defaults";
import { Search, X } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { TabChoice } from "../TabChoice";
import type { LabPoints } from "@/lib/billing/lab-points";
import { todayInTokyo, type CalendarDate } from "@/lib/dates";
import type { Draft, LabDraft } from "@/lib/drafts";
import { DRAW_TIMES, LAB_COMMENT_OPTIONS, LAB_TABS, coveredBy, dayOptions, defaultDraw, drawProblem, drawText, duplicatePicks, dedupePicks, isRapid, labDraftOf, labelOf, pickedSummary, searchLabs, tabSections, titleOf, togglePick, type DrawChoice, type DrawMode } from "@/lib/lab-catalog";
import { LAB_SOURCES } from "@/lib/lab-master-more";
import { BASIC_SETS, DEPT_SETS, setPicked as isSetPicked, toggleSet, type LabSet } from "@/lib/lab-sets";
import { LAB_TESTS, WARD_RULES, labInfo } from "@/lib/master";
import { nameIn, pickable, useMasterLocal } from "@/lib/master-local";
import { LAB_SITES, type LabSite } from "@/lib/types";

const MODES: { value: DrawMode; label: string; title: string }[] = [
  { value: "now", label: "今すぐ（至急）", title: "確定時の時刻で、至急として出す" },
  { value: "routine", label: "朝の定時", title: `病棟の定時採血（${WARD_RULES.routineDrawTime}）。日は右で選ぶ` },
  { value: "time", label: "日時を選ぶ", title: "日と時刻を選ぶ（定時の候補か、HH:MM を入れる）" },
  { value: "before_dose", label: "◯回目の投与前", title: `薬物濃度：時間ごとの注射の N 回目の投与の${WARD_RULES.minutesBeforeDoseForLevel}分前（病棟の決まり）` },
];

/** The layout of a published operating manual's lab order screen was the reference for the columns and the tab order (sets left, items in the middle, the picks right). */
const SCREEN_SOURCE = { name: "検体検査オーダー画面の並び：公開されている操作マニュアルの画面を参考（宮崎大学医学部附属病院）", url: "https://www.med.miyazaki-u.ac.jp/" };

const tabClass = (on: boolean) => `shrink-0 rounded px-2 py-0.5 text-[12px] whitespace-nowrap ${on ? "bg-ink font-bold text-white" : "text-ink-soft hover:bg-sheet hover:text-ink"}`;

/**
 * The lab order screen in three columns: sets on the left (基本セット・科別セット, pressing one picks
 * its items one by one), the category tabs and their items in the middle (頻用 first; a 3-column table
 * with the turnaround, rapid items in red), the picks on the right (each with its own 至急, where to
 * draw, the purpose). The band at the bottom sets when to draw, 至急 for the whole order, a comment
 * and 保存. The doctor decides every item; nothing is suggested here.
 */
export function AddLabPanel({
  patientId = "",
  onAdd,
  onSave,
  newId,
  today = todayInTokyo(),
  levelDrugs = [],
  initialTab = LAB_TABS[0].key,
}: {
  patientId?: string;
  onAdd: (d: Draft) => void;
  /** 保存: the draft is checked and, when nothing stops it or asks, confirmed at once. Without it the draft is only added (onAdd). */
  onSave?: (d: LabDraft) => void;
  newId: () => string;
  today?: CalendarDate;
  /** Injections running every N hours (a level can be timed to one of their doses). */
  levelDrugs?: { code: string; name: string }[];
  initialTab?: string;
}) {
  const mode = useMe().role === "看護師" ? "verbal" : "doctor";
  const tabId = useId();
  const [picked, setPicked] = useState<string[]>([]);
  const [urgent, setUrgent] = useState<string[]>([]);
  const [checked, setChecked] = useState<string[]>([]);
  const [tab, setTab] = useState(initialTab);
  const [query, setQuery] = useState("");
  const [draw, setDraw] = useState<DrawChoice>(() => ({ ...defaultDraw(), ...(orderDefaults(patientId, "定期", "", mode).drawMode === "now" ? { mode: "now", day: 0, priority: "至急" } : {}) }));
  const [site, setSite] = useState<LabSite>("病棟採血");
  const [comment, setComment] = useState("");
  const [purpose, setPurpose] = useState("");
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
  const pts = key && points && points.for === key ? points : null;
  const dups = duplicatePicks(picked);
  const allUrgent = picked.length > 0 && picked.every((c) => urgent.includes(c));
  const wholeUrgent = draw.priority === "至急";

  const setPicks = (next: string[]) => {
    setPicked(next);
    setUrgent((u) => u.filter((c) => next.includes(c)));
    setChecked((u) => u.filter((c) => next.includes(c)));
  };
  const toggleUrgent = (code: string) => setUrgent((u) => (u.includes(code) ? u.filter((c) => c !== code) : [...u, code]));
  const draftOf = () => labDraftOf(newId(), picked, draw, { urgent, site, comment, purpose });
  const save = () => {
    const d = draftOf();
    if (onSave) onSave(d);
    else onAdd(d);
  };

  const itemButton = (t: { code: string; abbr?: string; name: string }) => {
    const code = t.code;
    const label = nameIn(ml, "検体検査", code, t.abbr ?? t.name);
    const on = picked.includes(code);
    const by = on ? null : coveredBy(code, picked);
    const i = labInfo(code);
    const rapid = isRapid(code);
    if (by) {
      return (
        <button key={code} type="button" disabled title={`${t.name}　— ${name(by)}に含まれるので別には出せません`} className="flex min-w-0 items-center justify-between gap-1 rounded border border-dashed border-rule px-1.5 py-0.5 text-left text-[12px] text-ink-faint/60">
          <span className="truncate">{label}</span>
          <span className="shrink-0 text-[10px]">{name(by)}に含まれる</span>
        </button>
      );
    }
    return (
      <button
        key={code}
        type="button"
        title={`${t.name}　${i.material}・${i.container}・${i.tat}${rapid ? "（迅速対応）" : ""}`}
        aria-pressed={on}
        onClick={() => setPicks(togglePick(picked, code))}
        className={`flex min-w-0 items-center justify-between gap-1 rounded border px-1.5 py-0.5 text-left text-[12px] ${on ? "border-ai bg-ai font-bold text-white" : `border-rule hover:border-ai ${rapid ? "text-shu" : ""}`}`}
      >
        <span className="nums truncate">{label}</span>
        <span className={`nums shrink-0 rounded px-1 text-[10px] ${on ? "bg-white/20" : "bg-paper text-ink-soft"}`}>{i.tat}</span>
      </button>
    );
  };

  const setButton = (s: LabSet) => {
    const on = isSetPicked(picked, s);
    const part = !on && s.codes.some((c) => picked.includes(c));
    return (
      <button key={s.code} type="button" aria-pressed={on} title={`${s.codes.map(name).join("・")}（押すと項目が一つずつ選ばれます。もう一度押すと外れます）`} onClick={() => setPicks(toggleSet(picked, s))} className={`block w-full rounded border px-2 py-1 text-left text-[12px] ${on ? "border-ai bg-ai font-bold text-white" : part ? "border-ai/60 bg-ai/10" : "border-rule hover:border-ai"}`}>
        {s.name}
        <span className={`ml-1 text-[10px] ${on ? "text-white/80" : "text-ink-faint"}`}>{s.codes.length}項目</span>
      </button>
    );
  };

  const found = query.trim() ? searchLabs(query, tests) : null;
  const sections = found ? [{ head: found.length ? `「${query.trim()}」の項目` : `「${query.trim()}」に合う項目はありません`, items: found }] : tabSections(current, tests);

  return (
    <div className="@container space-y-3 text-[13px]">
      <p className="hint text-xs text-ink-soft">左のセットを押すと、その中の項目が一つずつ選ばれます（もう一度押すと外れます）。中央はタブで分類を選び、項目を押して選びます。赤い名前は迅速対応（院内・当日）の項目です。右に選んだ項目が並び、項目ごとに至急を付けられます。下の帯で採取の日時・至急・コメントを決め、「保存」で確定します（確かめることがあれば下書きの確認に回ります）。</p>

      <div className="grid gap-3 @3xl:grid-cols-[10rem_minmax(0,1fr)_18rem]">
        {/* Left: sets */}
        <aside className="space-y-3" aria-label="セット">
          <section>
            <h3 className="mb-1 text-xs font-bold text-ink-soft">基本セット<span className="hint">（架空の病院の取り決め）</span></h3>
            <div className="space-y-1">{BASIC_SETS.map(setButton)}</div>
          </section>
          <section>
            <h3 className="mb-1 text-xs font-bold text-ink-soft">科別セット<span className="hint">（架空の病院の取り決め）</span></h3>
            <div className="max-h-[40vh] space-y-2 overflow-y-auto pr-0.5 @3xl:max-h-none">
              {DEPT_SETS.map((d) => (
                <div key={d.dept}>
                  <div className="mb-0.5 text-[11px] text-ink-soft">{d.dept}</div>
                  <div className="space-y-1">{d.sets.map(setButton)}</div>
                </div>
              ))}
            </div>
          </section>
        </aside>

        {/* Middle: tabs and items */}
        <section className="@container min-w-0">
          <div className="mb-2 flex items-center gap-2 border-b border-rule pb-1">
            <div role="tablist" aria-label="検査の分類" className="flex min-w-0 flex-1 gap-0.5 overflow-x-auto">
              {LAB_TABS.map((t) => (
                <button key={t.key} type="button" id={`${tabId}-${t.key}`} role="tab" aria-controls={`${tabId}-items`} aria-selected={current.key === t.key && !found} onClick={() => { setTab(t.key); setQuery(""); }} className={tabClass(current.key === t.key && !found)}>
                  {t.label}
                </button>
              ))}
            </div>
            <label className="relative shrink-0" title="項目検索：名前・略語・かなで引きます（例 でぃーだいまー、BNP、肝炎）">
              <Search size={13} className="pointer-events-none absolute left-1.5 top-1/2 -translate-y-1/2 text-ink-faint" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="項目検索" aria-label="項目検索" className="w-32 rounded border border-rule bg-sheet py-0.5 pl-6 pr-1.5 text-[12px]" />
            </label>
          </div>
          <div id={`${tabId}-items`} role="tabpanel" aria-labelledby={`${tabId}-${current.key}`}>
          {sections.map((s) => (
            <section key={s.head || current.key} className="mb-2">
              {s.head && <h3 className="mb-1 text-xs font-bold text-ink-soft">{s.head}</h3>}
              <div className="grid grid-cols-2 gap-1 @md:grid-cols-3">{s.items.map(itemButton)}</div>
            </section>
          ))}
          </div>
          <p className="hint text-[11px] text-ink-faint">札は院内か外注かと所要日数（架空の病院の取り決め）。セットに含まれる項目は薄くなり、別には出せません。</p>
        </section>

        {/* Right: the picks */}
        <aside className="space-y-2" aria-label="選択中の検査項目">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <h3 className="text-xs font-bold text-ink-soft">選択中の検査項目</h3>
            <b className="nums">{picked.length}件</b>
            {picked.length > 0 && (
              <span className="nums text-[11px] text-ink-soft">
                {pts?.data ? `実施料 ${pts.data.total.toLocaleString("ja-JP")}点（判断料・採血料は別）` : pts?.failed ? "点数は読めませんでした" : "点数を読み込み中…"}
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-1 text-[11px]">
            <button type="button" disabled={checked.length === 0} onClick={() => setPicks(picked.filter((c) => !checked.includes(c)))} className="rounded border border-rule px-1.5 py-0.5 hover:border-ai disabled:opacity-40">選択削除</button>
            <button type="button" disabled={picked.length === 0} onClick={() => setPicks([])} className="rounded border border-rule px-1.5 py-0.5 hover:border-ai disabled:opacity-40">全削除</button>
            <button type="button" disabled={dups.length === 0} title="ほかの項目に含まれる項目（血算の横の WBC、PT の横の PT-INR）を外す" onClick={() => setPicks(dedupePicks(picked))} className="rounded border border-rule px-1.5 py-0.5 hover:border-ai disabled:opacity-40">重複削除{dups.length ? `（${dups.length}）` : ""}</button>
          </div>
          {picked.length === 0 ? (
            <p className="text-xs text-ink-faint">まだ項目を選んでいません。</p>
          ) : (
            <table className="w-full border-collapse text-[12px]">
              <thead>
                <tr className="border-b border-rule text-[10px] text-ink-soft">
                  <th className="w-5 py-0.5 text-left font-normal"><span className="sr-only">選択</span></th>
                  <th className="py-0.5 text-left font-normal">項目名称</th>
                  <th className="py-0.5 text-left font-normal">容器</th>
                  <th className="w-8 py-0.5 text-center font-normal">至急</th>
                  <th className="w-5 py-0.5"><span className="sr-only">外す</span></th>
                </tr>
              </thead>
              <tbody>
                {picked.map((code) => {
                  const i = labInfo(code);
                  const dup = dups.includes(code);
                  return (
                    <tr key={code} className="border-b border-rule/60 align-top">
                      <td className="py-0.5"><input type="checkbox" checked={checked.includes(code)} onChange={() => setChecked((u) => (u.includes(code) ? u.filter((c) => c !== code) : [...u, code]))} aria-label={`${name(code)}を選択`} /></td>
                      <td className="py-0.5" title={titleOf(code)}>
                        <span className={`font-bold ${isRapid(code) ? "text-shu" : ""}`}>{name(code)}</span>
                        {dup && <span className="ml-1 rounded bg-yamabuki-soft px-1 text-[10px] text-yamabuki">重複</span>}
                        <div className="truncate text-[10px] text-ink-soft" title={i.material}>{i.material}</div>
                      </td>
                      <td className="nums py-0.5 text-[11px]" title={i.tat}>{i.container}</td>
                      <td className="py-0.5 text-center"><input type="checkbox" checked={wholeUrgent || urgent.includes(code)} disabled={wholeUrgent} onChange={() => toggleUrgent(code)} aria-label={`${name(code)}を至急`} className="accent-shu" /></td>
                      <td className="py-0.5"><button type="button" onClick={() => setPicks(picked.filter((c) => c !== code))} aria-label={`${name(code)}を外す`} className="rounded p-0.5 text-ink-faint hover:text-ink"><X size={12} /></button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          <div className="flex flex-wrap gap-1 text-[11px]">
            <button type="button" disabled={picked.length === 0 || wholeUrgent || allUrgent} onClick={() => setUrgent([...picked])} className="rounded border border-shu/60 px-1.5 py-0.5 text-shu hover:bg-shu-soft disabled:opacity-40">全項目至急</button>
            <button type="button" disabled={urgent.length === 0 || wholeUrgent} onClick={() => setUrgent([])} className="rounded border border-rule px-1.5 py-0.5 hover:border-ai disabled:opacity-40">全項目至急解除</button>
          </div>
          {picked.length > 0 && (
            <div className="text-[11px] text-ink-soft">
              <div>容器：{summary.containers.join("・")}</div>
              {pts?.data?.bundles.some((b) => b.points !== null) && <div>{pts.data.bundles.filter((b) => b.points !== null).map((b) => `${b.name.split("（")[0]} ${b.count}項目をまとめて${b.points}点`).join("、")}</div>}
              {pts?.data?.lines.some((l) => l.note) && <div>{pts.data.lines.filter((l) => l.note).map((l) => `${l.label}：${l.note}`).join("　")}</div>}
              {summary.notes.map((n) => (
                <div key={n} className="text-yamabuki">{n}</div>
              ))}
            </div>
          )}
          <section className="rounded-md border border-rule bg-paper/60 p-2">
            <h3 className="mb-1 text-xs font-bold text-ink-soft">コメント</h3>
            <fieldset className="mb-1.5">
              <legend className="text-[11px] text-ink-soft">採血場所指示<span className="hint">（病棟では病棟採血が既定。架空の病院の取り決め）</span></legend>
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[12px]">
                {LAB_SITES.map((s) => (
                  <label key={s} className="inline-flex items-center gap-1">
                    <input type="radio" name="lab-site" value={s} checked={site === s} onChange={() => setSite(s)} />
                    {s}
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="block text-[11px] text-ink-soft">
              検査目的
              <input value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="自由記載（例 発熱の精査）" className="mt-0.5 w-full rounded border border-rule bg-sheet px-1.5 py-1 text-[12px] text-ink" />
            </label>
          </section>
        </aside>
      </div>

      {/* The band at the bottom: when to draw → 至急 → comment → 保存 */}
      <div className="sticky bottom-0 -mx-4 border-t border-rule bg-sheet px-4 pb-1 pt-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <TabChoice label="採取のしかた" options={MODES} value={draw.mode} onChange={(mode) => setDraw((d) => ({ ...d, mode, priority: mode === "now" ? "至急" : d.priority }))} />
            {(draw.mode === "routine" || draw.mode === "time") && (
              <select value={draw.day} onChange={(e) => setDraw((d) => ({ ...d, day: Number(e.target.value) }))} aria-label="日" className="rounded border border-rule bg-sheet px-1.5 py-1 text-[12px]">
                {dayOptions(today).map((o) => (
                  <option key={o.day} value={o.day}>
                    {o.label}
                  </option>
                ))}
              </select>
            )}
            {draw.mode === "routine" && <span className="nums text-xs text-ink-soft">定時採血 {WARD_RULES.routineDrawTime}</span>}
            {draw.mode === "time" && (
              <>
                <span className="inline-flex gap-1">
                  {DRAW_TIMES.map((t) => (
                    <button key={t} type="button" onClick={() => setDraw((d) => ({ ...d, time: t }))} aria-pressed={draw.time === t} className={`nums rounded border px-1.5 py-0.5 text-[12px] ${draw.time === t ? "border-ai bg-ai font-bold text-white" : "border-rule hover:border-ai"}`}>
                      {t}
                    </button>
                  ))}
                </span>
                <input value={draw.time} onChange={(e) => setDraw((d) => ({ ...d, time: e.target.value.trim() }))} placeholder="HH:MM" inputMode="numeric" aria-label="時刻（HH:MM）" className="nums w-20 rounded border border-rule bg-sheet px-1.5 py-1 text-[12px]" />
              </>
            )}
            {draw.mode === "before_dose" &&
              (levelDrugs.length === 0 ? (
                <span className="text-xs text-ink-soft">時間ごと（◯時間ごと）の注射がいま有効でないので、投与前の採血は選べません。先に注射を出すか、「日時を選ぶ」で時刻を決めてください。</span>
              ) : (
                <span className="inline-flex flex-wrap items-center gap-1 text-xs">
                  <select value={draw.beforeDose?.drugCode ?? ""} onChange={(e) => setDraw((d) => ({ ...d, beforeDose: e.target.value ? { n: d.beforeDose?.n ?? 3, drugCode: e.target.value } : null }))} aria-label="薬" className="rounded border border-rule bg-sheet px-1.5 py-1 text-[12px]">
                    <option value="">薬を選ぶ</option>
                    {levelDrugs.map((d) => (
                      <option key={d.code} value={d.code}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                  <select value={draw.beforeDose?.n ?? 3} onChange={(e) => setDraw((d) => (d.beforeDose ? { ...d, beforeDose: { ...d.beforeDose, n: Number(e.target.value) } } : d))} disabled={!draw.beforeDose} aria-label="何回目" className="rounded border border-rule bg-sheet px-1.5 py-1 text-[12px]">
                    {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                  回目の投与の{WARD_RULES.minutesBeforeDoseForLevel}分前
                </span>
              ))}
          </div>
          <label className={`inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 text-sm font-bold ${wholeUrgent ? "border-shu bg-shu-soft text-shu" : "border-rule text-ink-soft"}`} title="オーダ全体を至急で出す（検査室の受付で先に、採取は今すぐ）。項目ごとの至急は右の表で">
            <input
              type="checkbox"
              checked={wholeUrgent}
              onChange={(e) => setDraw((d) => (e.target.checked ? { ...d, priority: "至急", mode: d.mode === "routine" ? "now" : d.mode } : { ...d, priority: "定時", mode: d.mode === "now" ? "routine" : d.mode }))}
              className="accent-shu"
            />
            至急
          </label>
          <label className="inline-flex min-w-0 items-center gap-1 text-xs text-ink-soft" title="依頼コメント：候補から選ぶか、自由に書きます">
            コメント
            <input list="lab-comment-options" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="候補から／自由に" aria-label="依頼コメント" className="w-44 rounded border border-rule bg-sheet px-1.5 py-1 text-[12px] text-ink" />
            <datalist id="lab-comment-options">
              {LAB_COMMENT_OPTIONS.map((o) => (
                <option key={o} value={o} />
              ))}
            </datalist>
          </label>
          {problem && picked.length > 0 && <span className="text-xs text-shu">{problem}</span>}
          <button type="button" disabled={!canAdd} onClick={save} className="ml-auto rounded-md bg-ai px-4 py-2 text-sm font-bold text-white disabled:opacity-40">
            保存（{summary.labCodes.length}項目・採取 {drawText(draw, today)}）
          </button>
        </div>
        <p className="hint mt-1 text-[11px] text-ink-soft">過ぎた日時は確認で止まります。「今すぐ」は至急として扱います。全部の項目に至急を付けたときも、オーダ全体が至急になります。</p>
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
          <a href={SCREEN_SOURCE.url} target="_blank" rel="noreferrer" className="underline">
            {SCREEN_SOURCE.name}
          </a>
          。
        </p>
        <p>院内か外注か・所要日数・定時採血の時刻（{WARD_RULES.routineDrawTime}）と採取時刻の候補・頻用の項目・セットの中身・採血場所の区分は架空の病院の取り決めです。実施料は医科診療行為マスターの点数で、判断料・採血料・加算は会計で算定します。結果の基準範囲は JCCLS 共用基準範囲（なければ SRL の値）です。</p>
      </footer>
    </div>
  );
}
