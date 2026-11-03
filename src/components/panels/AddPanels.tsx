"use client";

import { Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { TabChoice } from "../TabChoice";
import { newProcedureDraft, type Draft, type InjectionDraft, type LabDraft } from "@/lib/drafts";
import type { InjectionRoute, InjectionSchedule } from "@/lib/types";
import { rpLine, rpNumbers } from "@/lib/rp";
import { DRUGS, LAB_TESTS, ORAL_DRUGS, ORDER_SETS, WARD_RULES, findOralDrug, labInfo } from "@/lib/master";
import { USAGES } from "@/lib/rx";
import { MODALITIES, PHYSIO, REGIONS, emptyImaging, emptyPhysio, type Modality } from "@/lib/exams";
import { PROCEDURES, findProcDrug } from "@/lib/procedures";

const SCHEDULES: { label: string; value: InjectionSchedule }[] = [
  { label: "1回だけ", value: { kind: "once" } },
  { label: "1日1回", value: { kind: "per_day", count: 1 } },
  { label: "1日2回", value: { kind: "per_day", count: 2 } },
  { label: "1日3回", value: { kind: "per_day", count: 3 } },
  { label: "6時間ごと", value: { kind: "every_hours", hours: 6 } },
  { label: "8時間ごと", value: { kind: "every_hours", hours: 8 } },
  { label: "12時間ごと", value: { kind: "every_hours", hours: 12 } },
  { label: "24時間ごと", value: { kind: "every_hours", hours: 24 } },
];
const FLUID_SCHEDULES: { label: string; value: InjectionSchedule }[] = [1, 2, 3, 4].map((c) => ({ label: `1日${c}本`, value: { kind: "per_day", count: c } }));
const DRIP_MINUTES = [30, 60, 90, 120, 180, 240, 360, 480, 720, 1440];
const minutesLabel = (m: number) => (m < 60 ? `${m}分` : m % 60 === 0 ? `${m / 60}時間` : `${Math.floor(m / 60)}時間${m % 60}分`);

interface InjRow {
  drugCode: string;
  amount: string;
  unit: string;
}
/**
 * Routes as the ward says them. 末梢静脈 is a drip, ワンショット an IV push, ロック a flush of 生食 or
 * heparin to keep the line open (given as 静注; the word ロック goes into the order's comment).
 */
const ROUTE_TABS: { key: string; route: InjectionRoute; lock?: boolean; title: string }[] = [
  { key: "末梢静脈", route: "点滴静注", title: "末梢静脈からの点滴（点滴静注）" },
  { key: "ワンショット", route: "静注", title: "静脈注射（ワンショット）" },
  { key: "筋注", route: "筋注", title: "筋肉注射" },
  { key: "皮下注", route: "皮下注", title: "皮下注射" },
  { key: "ロック", route: "静注", lock: true, title: "生食・ヘパリンでルートの閉塞を防ぐ（静注として出す）" },
];
const masterOf = (code: string) => DRUGS.find((d) => d.code === code);
/** Whether every drug in the Rp can be given this way. */
const routeOk = (rows: InjRow[], tab: (typeof ROUTE_TABS)[number]) =>
  rows.length > 0 && (tab.lock ? rows.every((r) => masterOf(r.drugCode)?.lock) : rows.every((r) => masterOf(r.drugCode)?.routes.includes(tab.route)));

interface InjRp {
  rows: InjRow[];
  /** The route tab chosen (ROUTE_TABS key), "" until chosen. */
  route: string;
  sched: number;
  minutes: number;
  startDay: number;
  startTime: string;
  days: string;
  comment: string;
}
const newInjRp = (): InjRp => ({ rows: [], route: "", sched: -1, minutes: 0, startDay: 0, startTime: "", days: "", comment: "" });
const rowFor = (code: string): InjRow => {
  const d = DRUGS.find((x) => x.code === code)!;
  return {
    drugCode: code,
    amount: d.kind === "輸液" ? "1" : d.strength ? String(d.strength.amount) : "1",
    unit: d.kind === "輸液" ? (d.units.includes("本") ? "本" : d.units[0]) : (d.strength?.unit ?? d.units[0]),
  };
};
/** The route tabs open for these drugs. */
const routeTabsFor = (rows: InjRow[]) => ROUTE_TABS.filter((t) => routeOk(rows, t));
const routeOf = (rp: InjRp): InjectionRoute | null => ROUTE_TABS.find((t) => t.key === rp.route)?.route ?? null;

/**
 * A drug search inside one Rp. Keyboard: type, ↓ ↑ to move in the list, Enter to put the drug in,
 * Esc to clear. The box stays for the next drug (混注 or another drug of the same Rp).
 */
function RpDrugSearch({ options, onPick, placeholder, prefix = false }: { options: { code: string; name: string; sub: string; aliases: string[] }[]; onPick: (code: string) => void; placeholder: string; prefix?: boolean }) {
  const [q, setQ] = useState("");
  const [at, setAt] = useState(0);
  const norm = (x: string) => x.normalize("NFKC").toLowerCase();
  const hits = q.trim() ? options.filter((d) => [d.name, ...d.aliases].some((a) => (prefix ? norm(a).startsWith(norm(q)) : norm(a).includes(norm(q))))).slice(0, 8) : [];
  const pick = (code: string) => {
    onPick(code);
    setQ("");
    setAt(0);
  };
  return (
    <div className="relative">
      <label className="flex items-center gap-1.5 rounded border border-dashed border-rule bg-paper px-2 py-1 focus-within:border-ai">
        <Search size={13} className="text-ink-faint" />
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setAt(0);
          }}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return;
            if (e.key === "ArrowDown" && hits.length) setAt((a) => Math.min(a + 1, hits.length - 1));
            else if (e.key === "ArrowUp" && hits.length) setAt((a) => Math.max(a - 1, 0));
            else if (e.key === "Enter" && !e.metaKey && !e.ctrlKey && hits[at]) pick(hits[at].code);
            else if (e.key === "Escape" && q) setQ("");
            else return;
            e.preventDefault();
          }}
          placeholder={placeholder}
          aria-label={placeholder}
          role="combobox"
          aria-expanded={hits.length > 0}
          className="flex-1 bg-transparent text-[13px] outline-none"
        />
      </label>
      {hits.length > 0 && (
        <ul role="listbox" className="absolute inset-x-0 top-full z-10 mt-0.5 divide-y divide-rule-soft rounded border border-rule bg-sheet shadow-md">
          {hits.map((d, i) => (
            <li key={d.code} role="option" aria-selected={i === at}>
              <button type="button" tabIndex={-1} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(d.code)} className={`nums flex w-full items-baseline gap-2 px-2 py-1.5 text-left ${i === at ? "bg-ai-soft" : "hover:bg-paper"}`}>
                <b>{d.name}</b>
                <span className="text-xs text-ink-soft">{d.sub}</span>
                <span className="ml-auto text-[11px] text-ink-faint">{d.aliases.slice(0, 3).join("・")}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {q.trim() && hits.length === 0 && <p className="mt-0.5 text-[11px] text-ink-faint">院内のマスターにありません。</p>}
    </div>
  );
}

/** Focus the first box of a panel when it opens, and ⌘Enter / Ctrl+Enter anywhere in it to make the drafts. */
function usePanelKeys(submit: () => void) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    root.current?.querySelector<HTMLInputElement>("input[role=combobox]")?.focus();
  }, []);
  const onKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      submit();
    }
  };
  return { root, onKeyDown };
}

/** The drafts already collected under the note, numbered Rp1, Rp2 … (shown at the top of the window). */
function CollectedRps({ drafts, kind }: { drafts: Draft[]; kind: "injection" | "prescription" }) {
  const mine = drafts.filter((d) => d.kind === kind);
  const no = rpNumbers(drafts);
  if (mine.length === 0) return null;
  return (
    <section className="rounded-md border border-rule bg-paper p-2">
      <h3 className="mb-1 text-[11px] font-bold text-ink-soft">記事の下に貯まっている{kind === "injection" ? "注射" : "内服"}（確定はまだ）</h3>
      <ol className="space-y-0.5 text-[12px]">
        {mine.map((d) => (
          <li key={d.id} className="nums flex gap-2">
            <b className="shrink-0 text-ai">Rp{no[d.id]}</b>
            <span>{rpLine(d)}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/**
 * Injections by Rp, like the prescription window: put one or more drugs in an Rp (混注: the main
 * drug, drugs mixed in, and the fluid), then the route, frequency, drip time and start. Each Rp
 * becomes a draft that goes through the same checks as a spoken one; the doctor confirms.
 */
export function AddInjectionPanel({ onAdd, newId, drafts }: { onAdd: (d: Draft[]) => void; newId: () => string; drafts: Draft[] }) {
  const [rps, setRps] = useState<InjRp[]>([newInjRp(), newInjRp()]);
  const first = drafts.filter((d) => d.kind === "injection").length + 1;
  const upd = (i: number, patch: Partial<InjRp>) =>
    setRps((r) =>
      r.map((x, j) => {
        if (j !== i) return x;
        const next = { ...x, ...patch };
        // Keep the route valid for every drug; choose it when only one is left.
        const open = routeTabsFor(next.rows);
        if (next.route && !open.some((t) => t.key === next.route)) next.route = "";
        if (!next.route && open.length === 1) next.route = open[0].key;
        if (next.sched >= schedulesOf(next).length) next.sched = -1;
        return next;
      }),
    );
  const fluids = DRUGS.filter((d) => d.kind === "輸液");
  const options = DRUGS.map((d) => ({ code: d.code, name: d.name, sub: d.package, aliases: d.aliases }));
  const missingOf = (rp: InjRp) => [
    ...(rp.rows.every((r) => Number(r.amount) > 0 && r.unit) ? [] : ["量"]),
    ...(rp.route ? [] : ["経路"]),
    ...(rp.sched >= 0 ? [] : ["回数"]),
    ...(routeOf(rp) === "点滴静注" && !rp.minutes ? ["1回の時間"] : []),
  ];
  const filled = rps.filter((r) => r.rows.length > 0);
  // An Rp started but not finished is never dropped quietly: it blocks until filled or emptied.
  const unfinished = rps.map((r, i) => ({ i, miss: r.rows.length ? missingOf(r) : [] })).filter((x) => x.miss.length);
  const ready = unfinished.length ? [] : filled;

  const toDraft = (rp: InjRp): InjectionDraft => {
    const route = routeOf(rp);
    const lock = ROUTE_TABS.find((t) => t.key === rp.route)?.lock;
    const comment = [lock ? "ロック" : "", rp.comment.trim()].filter(Boolean).join("　");
    return {
      id: newId(),
      origin: "manual",
      sourceText: rp.rows.length > 1 ? "（マスターから選択・混注）" : "（マスターから選択）",
      comment: comment || null,
      kind: "injection",
      items: rp.rows.map((r) => {
        const d = masterOf(r.drugCode)!;
        return { drugCode: r.drugCode, said: d.aliases[0] ?? d.name, amount: Number(r.amount), unit: r.unit };
      }),
      route,
      schedule: schedulesOf(rp)[rp.sched].value,
      infusionMinutes: route === "点滴静注" ? rp.minutes : null,
      infusionScope: route === "点滴静注" ? "per_dose" : null,
      rateMlPerH: null,
      prefer: null,
      start: { day: rp.startDay, time: rp.startTime || null },
      days: Number(rp.days) > 0 ? Number(rp.days) : null,
      duplicate: null,
    };
  };
  const submit = () => {
    if (!ready.length) return;
    onAdd(ready.map(toDraft));
    setRps([newInjRp(), newInjRp()]);
  };
  const keys = usePanelKeys(submit);

  const field = "rounded border border-rule bg-paper px-1 py-0.5 outline-none focus:border-ai";
  return (
    <div ref={keys.root} onKeyDown={keys.onKeyDown} className="space-y-3 text-[13px]">
      <CollectedRps drafts={drafts} kind="injection" />
      <p className="text-[11px] text-ink-faint">キーボードだけで入れられます：薬の名前を打って ↓↑ と Enter、Tab で次の欄へ、経路・回数・時間は ← → で選ぶ、⌘Enter（Ctrl+Enter）で下書きにする。量を空にして Backspace でその薬を外します。</p>

      {rps.map((rp, i) => {
        const open = routeTabsFor(rp.rows);
        const schedules = schedulesOf(rp);
        const route = routeOf(rp);
        return (
          <section key={i} className={`space-y-1.5 rounded-md border p-2 ${rp.rows.length ? "border-ai/50" : "border-rule"}`}>
            <div className="flex items-baseline gap-2">
              <b className="text-ai">Rp{first + i}</b>
              {rp.rows.length === 0 && <span className="text-[11px] text-ink-faint">最初に選んだ薬が主薬。続けて選ぶと混注（輸液を最初に選ぶと「1日◯本」で数えます）</span>}
              {rps.length > 1 && (
                <button type="button" tabIndex={-1} onClick={() => setRps((r) => r.filter((_, j) => j !== i))} className="ml-auto text-[11px] text-ink-faint hover:text-shu">
                  この Rp を消す
                </button>
              )}
            </div>
            <table className="w-full">
              <tbody>
                {rp.rows.map((r, k) => {
                  const m = masterOf(r.drugCode)!;
                  return (
                    <tr key={k} className="align-baseline">
                      <td className="py-0.5">
                        {k > 0 && <span className="mr-1 text-[11px] text-ink-faint">＋</span>}
                        <b>{m.name}</b> <span className="text-xs text-ink-soft">{m.package}</span>
                      </td>
                      <td className="whitespace-nowrap py-0.5 text-right">
                        <input
                          value={r.amount}
                          onChange={(e) => upd(i, { rows: rp.rows.map((x, j) => (j === k ? { ...x, amount: e.target.value } : x)) })}
                          onKeyDown={(e) => {
                            if (e.key === "Backspace" && r.amount === "") {
                              e.preventDefault();
                              upd(i, { rows: rp.rows.filter((_, j) => j !== k) });
                            }
                          }}
                          inputMode="decimal"
                          aria-label={`${m.name}の量`}
                          className={`${field} w-14 text-right`}
                        />
                        <select value={r.unit} onChange={(e) => upd(i, { rows: rp.rows.map((x, j) => (j === k ? { ...x, unit: e.target.value } : x)) })} aria-label={`${m.name}の単位`} className={`${field} ml-1`}>
                          {m.units.map((u) => (
                            <option key={u}>{u}</option>
                          ))}
                        </select>
                      </td>
                      <td className="w-6 text-right">
                        <button type="button" tabIndex={-1} onClick={() => upd(i, { rows: rp.rows.filter((_, j) => j !== k) })} className="text-ink-faint hover:text-shu" aria-label="外す">
                          ×
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <RpDrugSearch options={options} onPick={(c) => upd(i, { rows: [...rp.rows, rowFor(c)] })} placeholder={rp.rows.length ? `Rp${first + i} に混注する薬を足す（名前・略称）` : `Rp${first + i} に薬を入れる（名前・略称）`} />
            {rp.rows.length > 0 && !isFluidRp(rp) && open.some((t) => t.route === "点滴静注") && !rp.rows.some((r) => masterOf(r.drugCode)?.kind === "輸液") && (
              <select value="" onChange={(e) => e.target.value && upd(i, { rows: [...rp.rows, { ...rowFor(e.target.value), amount: "1", unit: "本" }] })} className={`${field} text-[12px]`} aria-label="溶媒">
                <option value="">＋ 溶媒（輸液）を選ぶ</option>
                {fluids.map((f) => (
                  <option key={f.code} value={f.code}>
                    {f.name} {f.package}
                  </option>
                ))}
              </select>
            )}
            {rp.rows.length > 0 && (
              <div className="space-y-1 text-[12px]">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="w-16 text-ink-soft">経路</span>
                  <TabChoice
                    label={`Rp${first + i} の経路`}
                    options={ROUTE_TABS.map((t) => ({ value: t.key, label: t.key, disabled: !open.includes(t), title: open.includes(t) ? t.title : `${t.title}：この薬では使えません` }))}
                    value={rp.route || null}
                    onChange={(v) => upd(i, { route: v, minutes: ROUTE_TABS.find((t) => t.key === v)?.route === "点滴静注" ? rp.minutes : 0 })}
                  />
                  {open.length === 0 && <span className="text-shu">同じ経路で使えない薬が混ざっています</span>}
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="w-16 text-ink-soft">回数</span>
                  <TabChoice label={`Rp${first + i} の回数`} options={schedules.map((x, j) => ({ value: j, label: x.label }))} value={rp.sched >= 0 ? rp.sched : null} onChange={(v) => upd(i, { sched: v })} />
                </div>
                {route === "点滴静注" && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="w-16 text-ink-soft">1回の時間</span>
                    <TabChoice label={`Rp${first + i} の1回の時間`} options={DRIP_MINUTES.map((m) => ({ value: m, label: minutesLabel(m) }))} value={rp.minutes || null} onChange={(v) => upd(i, { minutes: v })} />
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="w-16 text-ink-soft">開始</span>
                  <TabChoice
                    label={`Rp${first + i} の開始日`}
                    options={[
                      { value: 0, label: "今日" },
                      { value: 1, label: "明日" },
                    ]}
                    value={rp.startDay}
                    onChange={(v) => upd(i, { startDay: v })}
                  />
                  <input type="time" value={rp.startTime} onChange={(e) => upd(i, { startTime: e.target.value })} className={field} aria-label={`Rp${first + i} の開始時刻`} />
                  <span className="text-[11px] text-ink-faint">空なら指示受け後すぐ</span>
                  <input value={rp.days} onChange={(e) => upd(i, { days: e.target.value })} inputMode="numeric" placeholder="—" aria-label={`Rp${first + i} の日数`} className={`${field} ml-auto w-10 text-right`} />
                  日間
                </div>
                <input value={rp.comment} onChange={(e) => upd(i, { comment: e.target.value })} placeholder="コメント（任意）" aria-label={`Rp${first + i} のコメント`} className={`${field} w-full`} />
              </div>
            )}
          </section>
        );
      })}
      <div className="sticky bottom-0 flex gap-2 border-t border-rule bg-sheet pt-3">
        <button type="button" onClick={() => setRps((r) => [...r, newInjRp()])} className="rounded-md border border-rule px-3 py-2 text-sm text-ink-soft">
          Rp を足す
        </button>
        <button
          type="button"
          disabled={!ready.length}
          title={unfinished.length ? unfinished.map((x) => `Rp${first + x.i}：${x.miss.join("・")}が未選択`).join("／") : "⌘Enter（Ctrl+Enter）でも押せます"}
          onClick={submit}
          className="flex-1 rounded-md bg-ai px-3 py-2 text-sm font-bold text-white disabled:opacity-40"
        >
          下書きにする（{ready.length} Rp）<kbd className="ml-2 rounded border border-white/40 px-1 text-[10px] font-normal">⌘↵</kbd>
        </button>
      </div>
      {unfinished.length > 0 && <p className="text-[12px] text-yamabuki">{unfinished.map((x) => `Rp${first + x.i}：${x.miss.join("・")}が未選択`).join("　")}</p>}
      <p className="text-[11px] text-ink-faint">点滴の速度（mL/時）は量と時間からコードで計算し、下書きに式を出します。経路・重複・時刻の確認も下書きに出ます。</p>
    </div>
  );
}

// The first drug picked is the main one (as on a slip): a fluid first means a bag with drugs mixed in,
// counted in bags (1日2本); a drug first means doses of that drug (8時間ごと), with any solvent after it.
const isFluidRp = (rp: InjRp) => rp.rows.length > 0 && masterOf(rp.rows[0].drugCode)?.kind === "輸液";
const schedulesOf = (rp: InjRp) => (isFluidRp(rp) ? FLUID_SCHEDULES : SCHEDULES);

/**
 * Pick lab items one by one (grouped like a lab's test guide) or a hospital set, and a draw time.
 * Each item shows its material and container (after the SRL 総合検査案内); it becomes a draft
 * that goes through the same checks.
 */
export function AddLabPanel({ onAdd, newId }: { onAdd: (d: Draft) => void; newId: () => string }) {
  const [picked, setPicked] = useState<string[]>([]);
  const toggle = (code: string) => setPicked((p) => (p.includes(code) ? p.filter((c) => c !== code) : [...p, code]));

  const make = (when: "now" | "morning_routine"): LabDraft => ({
    id: newId(),
    origin: "manual",
    sourceText: "（マスターから選択）",
    comment: null,
    kind: "lab",
    tests: picked.map((code) => ({ code, said: code })),
    collect: { day: when === "now" ? 0 : 1, when, time: null, beforeDose: null },
    priority: null,
    cultureSets: null,
    duplicateOk: false,
  });

  const ORDER = ["血液学", "凝固・線溶", "生化学", "炎症・感染", "心筋・心不全", "内分泌", "血液ガス", "尿", "微生物", "薬物濃度"];
  const groups = ORDER.filter((g) => LAB_TESTS.some((t) => t.group === g));
  const containers = [...new Set(picked.map((c) => labInfo(c).container))];
  const notes = picked.flatMap((c) => (labInfo(c).note ? [`${LAB_TESTS.find((t) => t.code === c)?.abbr ?? c}：${labInfo(c).note}`] : []));

  return (
    <div className="space-y-3 text-[13px]">
      <section>
        <h3 className="mb-1 text-xs font-bold text-ink-soft">院内セット（架空の病院）</h3>
        <div className="flex flex-wrap gap-1.5">
          {[...ORDER_SETS.map((s) => ({ code: s.code, label: s.name, sub: s.labCodes.map((c) => LAB_TESTS.find((t) => t.code === c)?.abbr).join("・") })), { code: "LAB-CHEM", label: "生化学（病棟定期セット）", sub: "13項目" }].map((x) => (
            <button
              key={x.code}
              type="button"
              title={x.sub}
              onClick={() => toggle(x.code)}
              className={`rounded-md border px-2 py-1 ${picked.includes(x.code) ? "border-ai bg-ai font-bold text-white" : "border-rule hover:border-ai"}`}
            >
              {x.label}
            </button>
          ))}
        </div>
      </section>
      {groups.map((g) => (
        <section key={g}>
          <h3 className="mb-1 text-xs font-bold text-ink-soft">{g}</h3>
          <div className="flex flex-wrap gap-1">
            {LAB_TESTS.filter((t) => t.group === g).map((t) => (
              <button
                key={t.code}
                type="button"
                title={`${t.name}　${labInfo(t.code).material}・${labInfo(t.code).container}・${labInfo(t.code).tat}`}
                onClick={() => toggle(t.code)}
                className={`nums min-w-12 rounded border px-1.5 py-0.5 text-[12px] ${picked.includes(t.code) ? "border-ai bg-ai font-bold text-white" : "border-rule hover:border-ai"}`}
              >
                {t.abbr ?? t.name}
              </button>
            ))}
          </div>
        </section>
      ))}
      {picked.length > 0 && (
        <div className="rounded-md bg-paper px-2 py-1.5 text-[12px]">
          <div>
            <b>{picked.length}項目</b>　容器：{containers.join("・")}
          </div>
          {notes.map((n) => (
            <div key={n} className="text-yamabuki">
              {n}
            </div>
          ))}
        </div>
      )}
      <div className="sticky bottom-0 flex gap-2 border-t border-rule bg-sheet pt-3">
        <button type="button" disabled={!picked.length} onClick={() => onAdd(make("now"))} className="flex-1 rounded-md border border-ai px-3 py-2 text-sm text-ai disabled:opacity-40">
          今すぐ（至急）
        </button>
        <button type="button" disabled={!picked.length} onClick={() => onAdd(make("morning_routine"))} className="flex-1 rounded-md bg-ai px-3 py-2 text-sm font-bold text-white disabled:opacity-40">
          明日朝の定時（{WARD_RULES.routineDrawTime}）
        </button>
      </div>
      <p className="text-[11px] text-ink-faint">項目の分け方・材料・容器（SRL の容器記号）・所要日数は SRL「総合検査案内 2026-2027」を参考にしました。院内か外注かは架空の病院の設定です。結果の基準範囲は JCCLS 共用基準範囲（なければ SRL の値）です。</p>
    </div>
  );
}

/**
 * Pick a procedure from the master. It becomes a draft right away; the checks ask for what the
 * item needs (器具・流量、部位・範囲・深さ、回数), each with choices for the doctor.
 */
export function AddProcedurePanel({ onAdd, newId }: { onAdd: (d: Draft) => void; newId: () => string }) {
  return (
    <div>
      <p className="mb-2 text-xs text-ink-soft">選ぶと右に下書きができます。足りないところ（流量・部位・範囲・回数など）は下書きの上で選ぶか、話して足してください。</p>
      <ul className="divide-y divide-rule-soft">
        {PROCEDURES.map((p) => (
          <li key={p.code}>
            <button type="button" onClick={() => onAdd(newProcedureDraft(p.code, newId()))} className="flex w-full items-baseline gap-2 px-1 py-2 text-left text-sm hover:bg-paper">
              <span className="font-bold">{p.name}</span>
              {p.uses && <span className="text-xs text-ink-soft">{findProcDrug(p.uses.code)?.name}</span>}
              <span className="ml-auto truncate text-[11px] text-ink-faint">{p.aliases.slice(0, 3).join("・")}</span>
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[11px] text-ink-faint">処置の項目と院内の取り決めは架空の病院のものです。算定のコードと点数は公式の医科診療行為マスターから読みます。</p>
    </div>
  );
}

interface RpRow {
  drugCode: string;
  daily: string;
}
interface Rp {
  rows: RpRow[];
  usage: string;
  days: string;
  category: "定期" | "臨時";
  prn: string;
  maxPerDay: string;
}
const newRp = (): Rp => ({ rows: [], usage: "", days: "7", category: "定期", prn: "", maxPerDay: "" });

/**
 * Oral prescriptions by Rp: search the master (前方一致 / 部分一致), put drugs in an Rp, give
 * the daily amount (1日量), usage and days. The amount per dose (1回量) is worked out and shown.
 * Each Rp becomes a draft and goes through the same checks (errors / warnings to 承知).
 */
export function AddRxPanel({ onAdd, newId, drafts = [] }: { onAdd: (d: Draft[]) => void; newId: () => string; drafts?: Draft[] }) {
  const first = drafts.filter((d) => d.kind === "prescription").length + 1;
  const [prefix, setPrefix] = useState(false);
  const [rps, setRps] = useState<Rp[]>([newRp(), newRp()]);
  const options = ORAL_DRUGS.map((d) => ({ code: d.code, name: d.name, sub: `${d.strength}／${d.unit}`, aliases: d.aliases }));
  const upd = (i: number, patch: Partial<Rp>) => setRps((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const usage = (u: string) => (u === "頓用" ? [] : USAGES.find((x) => x.label === u)?.timings ?? null);

  const toDraft = (rp: Rp): Draft => {
    const timings = rp.usage ? usage(rp.usage) : null;
    const prn = rp.usage === "頓用";
    return {
      id: newId(),
      origin: "manual",
      sourceText: "（Rp 入力）",
      comment: null,
      kind: "prescription",
      category: prn ? null : rp.category,
      items: rp.rows.map((r) => ({ drugCode: r.drugCode, said: findOralDrug(r.drugCode)?.name ?? r.drugCode, daily: prn ? null : Number(r.daily) || null, perDose: prn ? Number(r.daily) || null : null })),
      timings,
      prn: prn ? rp.prn.trim() || null : null,
      maxPerDay: prn ? Number(rp.maxPerDay) || null : null,
      days: prn ? null : Number(rp.days) || null,
      start: { day: null, timing: null },
      acks: [],
    };
  };
  const ready = rps.filter((r) => r.rows.length);
  const submit = () => {
    if (!ready.length) return;
    onAdd(ready.map(toDraft));
    setRps([newRp(), newRp()]);
  };
  const keys = usePanelKeys(submit);
  return (
    <div ref={keys.root} onKeyDown={keys.onKeyDown} className="space-y-3 text-[13px]">
      <CollectedRps drafts={drafts} kind="prescription" />
      <p className="text-[11px] text-ink-faint">キーボードだけで入れられます：薬の名前を打って ↓↑ と Enter、Tab で次の欄へ、用法と定期・臨時は ← → で選ぶ、⌘Enter（Ctrl+Enter）で下書きにする。1日量を空にして Backspace でその薬を外します。</p>
      <div className="flex items-center justify-end gap-2 text-[11px] text-ink-soft">
        薬の検索
        <div role="radiogroup" className="flex rounded-md border border-rule p-0.5">
          {[
            [true, "前方一致"],
            [false, "部分一致"],
          ].map(([v, l]) => (
            <button key={String(l)} type="button" role="radio" aria-checked={prefix === v} onClick={() => setPrefix(v as boolean)} className={`rounded px-1.5 py-0.5 ${prefix === v ? "bg-ink text-white" : "text-ink-soft"}`}>
              {l as string}
            </button>
          ))}
        </div>
      </div>

      {rps.map((rp, i) => {
        const timings = rp.usage ? usage(rp.usage) : null;
        const prn = rp.usage === "頓用";
        return (
          <section key={i} className={`space-y-1 rounded-md border p-2 ${rp.rows.length ? "border-ai/50" : "border-rule"}`}>
            <div className="flex items-baseline gap-2">
              <b className="text-ai">Rp{first + i}</b>
              {rps.length > 1 && (
                <button type="button" tabIndex={-1} onClick={() => setRps((r) => r.filter((_, j) => j !== i))} className="ml-auto text-[11px] text-ink-faint hover:text-shu">
                  この Rp を消す
                </button>
              )}
            </div>
            <table className="w-full">
              <tbody>
                {rp.rows.map((r, k) => {
                  const m = findOralDrug(r.drugCode)!;
                  const n = Number(r.daily);
                  const per = timings && timings.length && n ? Math.round((n / timings.length) * 100) / 100 : null;
                  return (
                    <tr key={k} className="align-baseline">
                      <td className="py-0.5 font-bold">
                        {m.name} {m.strength}
                      </td>
                      <td className="whitespace-nowrap py-0.5 text-right">
                        {prn ? "1回" : "1日"}
                        <input
                          value={r.daily}
                          aria-label={`${m.name}の${prn ? "1回量" : "1日量"}`}
                          onKeyDown={(e) => {
                            if (e.key === "Backspace" && r.daily === "") {
                              e.preventDefault();
                              upd(i, { rows: rp.rows.filter((_, j) => j !== k) });
                            }
                          }}
                          onChange={(e) => upd(i, { rows: rp.rows.map((x, j) => (j === k ? { ...x, daily: e.target.value } : x)) })}
                          inputMode="decimal"
                          className="mx-1 w-12 rounded border border-rule bg-paper px-1 text-right"
                        />
                        {m.unit}
                        {per !== null && !prn && (
                          <span className="block text-[11px] text-ai">
                            1回{per}
                            {m.unit}
                          </span>
                        )}
                      </td>
                      <td className="w-6 text-right">
                        <button type="button" tabIndex={-1} onClick={() => upd(i, { rows: rp.rows.filter((_, j) => j !== k) })} className="text-ink-faint hover:text-shu" aria-label="外す">
                          ×
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <RpDrugSearch options={options} prefix={prefix} onPick={(c) => upd(i, { rows: [...rp.rows, { drugCode: c, daily: "" }] })} placeholder={rp.rows.length ? `Rp${first + i} に同じ用法の薬を足す（名前・略称）` : `Rp${first + i} に薬を入れる（名前・略称）`} />
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[12px]">
              <TabChoice label={`Rp${first + i} の用法`} options={[...USAGES.map((u) => ({ value: u.label, label: u.label })), { value: "頓用", label: "頓用" }]} value={rp.usage || null} onChange={(v) => upd(i, { usage: v })} />
              {prn ? (
                <>
                  <input value={rp.prn} onChange={(e) => upd(i, { prn: e.target.value })} placeholder="条件（疼痛時など）" className="w-28 rounded border border-rule bg-paper px-1 py-0.5" />
                  1日
                  <input value={rp.maxPerDay} onChange={(e) => upd(i, { maxPerDay: e.target.value })} inputMode="numeric" className="w-8 rounded border border-rule bg-paper px-1 py-0.5 text-right" />
                  回まで
                </>
              ) : (
                <>
                  <input value={rp.days} onChange={(e) => upd(i, { days: e.target.value })} inputMode="numeric" className="w-10 rounded border border-rule bg-paper px-1 py-0.5 text-right" />
                  日分
                  <TabChoice
                    label={`Rp${first + i} の定期・臨時`}
                    options={[
                      { value: "定期", label: "定期" },
                      { value: "臨時", label: "臨時" },
                    ]}
                    value={rp.category}
                    onChange={(v) => upd(i, { category: v as Rp["category"] })}
                  />
                </>
              )}
            </div>
          </section>
        );
      })}
      <div className="sticky bottom-0 flex gap-2 border-t border-rule bg-sheet pt-3">
        <button
          type="button"
          onClick={() => setRps((r) => [...r, newRp()])}
          className="rounded-md border border-rule px-3 py-2 text-sm text-ink-soft"
        >
          Rp を足す
        </button>
        <button type="button" disabled={!ready.length} title="⌘Enter（Ctrl+Enter）でも押せます" onClick={submit} className="flex-1 rounded-md bg-ai px-3 py-2 text-sm font-bold text-white disabled:opacity-40">
          下書きにする（{ready.length} Rp）<kbd className="ml-2 rounded border border-white/40 px-1 text-[10px] font-normal">⌘↵</kbd>
        </button>
      </div>
      <p className="text-[11px] text-ink-faint">1回量は1日量 ÷ 回数でコードが出します。チェック（割り切れない量・重複・アレルギー・極量）は記事の下の下書きに出ます。重複・アレルギー・極量は、承知コメントを付けて確定できます。</p>
    </div>
  );
}

/**
 * Imaging order: pick the modality, then the region (only regions this hospital does for that
 * modality), and say why. Views, contrast, date and transport are asked on the draft with choices,
 * and the safety checks (eGFR, contrast allergy, MRI metal, pregnancy) run there.
 */
export function AddImagingPanel({ onAdd, newId }: { onAdd: (d: Draft) => void; newId: () => string }) {
  const [modality, setModality] = useState<Modality>("X線");
  const [region, setRegion] = useState<string | null>(null);
  const [purpose, setPurpose] = useState("");
  const regions = REGIONS.filter((r) => r.modalities.includes(modality));
  return (
    <div className="space-y-3 text-[13px]">
      <div role="radiogroup" aria-label="種類" className="flex flex-wrap gap-1">
        {MODALITIES.map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={modality === m}
            onClick={() => {
              setModality(m);
              setRegion(null);
            }}
            className={`rounded-md border px-3 py-1.5 ${modality === m ? "border-ai bg-ai font-bold text-white" : "border-rule text-ink-soft hover:border-ai"}`}
          >
            {m}
          </button>
        ))}
      </div>
      <div>
        <h3 className="mb-1 text-xs font-bold text-ink-soft">部位（{modality}）</h3>
        <div className="grid grid-cols-3 gap-1.5">
          {regions.map((r) => (
            <button
              key={r.code}
              type="button"
              onClick={() => setRegion(r.code)}
              className={`rounded-md border px-2 py-2 ${region === r.code ? "border-ai bg-ai-soft font-bold text-ai" : "border-rule hover:border-ai"}`}
            >
              {r.name}
            </button>
          ))}
        </div>
      </div>
      <label className="flex flex-col gap-1 text-xs text-ink-soft">
        目的（臨床診断・知りたいこと）
        <input value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="例：肺炎の経過" className="rounded-md border border-rule bg-paper px-2 py-1.5 text-[13px] text-ink outline-none focus:border-ai" />
      </label>
      <button
        type="button"
        disabled={!region}
        onClick={() => onAdd({ ...emptyImaging(newId(), modality), region, purpose: purpose.trim() || null })}
        className="w-full rounded-md bg-ai px-3 py-2 text-sm font-bold text-white disabled:opacity-40"
      >
        下書きにする
      </button>
      <p className="text-[11px] text-ink-faint">撮影の方向・単純か造影か・日時・移動は、右の下書きで選びます。造影なら腎機能（eGFR はコードで計算）・造影剤アレルギー、MRI なら体内金属の確認が出ます。部位と検査の組み合わせは架空の病院のものです。</p>
    </div>
  );
}

/** Physiological tests: pick the test and say why; place, date and transport are asked on the draft. */
export function AddPhysioPanel({ onAdd, newId }: { onAdd: (d: Draft) => void; newId: () => string }) {
  const [test, setTest] = useState<string | null>(null);
  const [purpose, setPurpose] = useState("");
  return (
    <div className="space-y-3 text-[13px]">
      <ul className="divide-y divide-rule-soft rounded border border-rule-soft">
        {PHYSIO.map((p) => (
          <li key={p.code}>
            <button type="button" onClick={() => setTest(p.code)} className={`flex w-full items-baseline gap-2 px-2 py-2 text-left ${test === p.code ? "bg-ai-soft font-bold text-ai" : "hover:bg-paper"}`}>
              {p.name}
              <span className="ml-auto text-[11px] font-normal text-ink-faint">{p.bedside ? "ベッドサイド可" : "検査室"}</span>
            </button>
          </li>
        ))}
      </ul>
      <label className="flex flex-col gap-1 text-xs text-ink-soft">
        目的
        <input value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="例：心機能評価" className="rounded-md border border-rule bg-paper px-2 py-1.5 text-[13px] text-ink outline-none focus:border-ai" />
      </label>
      <button
        type="button"
        disabled={!test}
        onClick={() => onAdd({ ...emptyPhysio(newId(), test), purpose: purpose.trim() || null })}
        className="w-full rounded-md bg-ai px-3 py-2 text-sm font-bold text-white disabled:opacity-40"
      >
        下書きにする
      </button>
    </div>
  );
}
