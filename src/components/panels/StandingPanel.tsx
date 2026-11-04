"use client";

import { useState } from "react";
import { DRUGS, ORAL_DRUGS } from "@/lib/master";
import { isNarcotic } from "@/lib/drug-class";
import { NARCOTIC_RULES } from "@/lib/narcotics";
import {
  BATHS,
  CALL_ITEMS,
  IO,
  PRN_WHEN,
  RESTS,
  VITAL_FREQS,
  WEIGHTS,
  callText,
  checkPrn,
  emptyStanding,
  prnText,
  type CallKey,
  type PrnRule,
  type StandingOrders,
} from "@/lib/standing";
import { condMissing, ruleText, type CondAck, type CondHit } from "@/lib/cond-orders";
import { CondEditor, CondHits } from "../CondOrders";
import { DenyNote, useDeny, useMe } from "../RoleContext";
import { TabChoice } from "../TabChoice";

// 麻薬 are not offered here (NARCOTIC_RULES.prn): each use is ordered, so that the 麻薬施用者 check applies.
const PRN_DRUGS = [
  ...ORAL_DRUGS.filter((d) => !isNarcotic(d.code)).map((d) => ({ code: d.code, label: `${d.name}${d.strength}（内服）`, unit: d.unit })),
  ...DRUGS.filter((d) => d.kind === "その他" && !d.lock && !isNarcotic(d.code)).map((d) => ({ code: d.code, label: `${d.name} ${d.package}（注射）`, unit: d.strength?.unit === "mEq" ? "mEq" : "mg" })),
];

/**
 * 指示簿（約束指示）. The doctor sets each item (nothing is preselected) and confirms a new version; the
 * nurse takes it (指示受け). As-needed drugs are checked in code: the day's total against the package
 * insert, whether the interval fits in a day, and allergies.
 */
export function StandingPanel({
  versions,
  allergies,
  nowTime,
  fmtDay,
  onSave,
  onTake,
  newId,
  condHits = [],
  condAcks = {},
  onCondRecord,
}: {
  versions: StandingOrders[];
  allergies: string[];
  nowTime: string;
  fmtDay: (d: number) => string;
  onSave: (s: StandingOrders) => void;
  onTake: () => void;
  newId: () => string;
  /** 条件付き指示 the latest values meet, and the nurses' records of what was done. */
  condHits?: CondHit[];
  condAcks?: Record<string, CondAck>;
  onCondRecord?: (h: CondHit, note: string) => void;
}) {
  const me = useMe();
  const deny = useDeny();
  const cur = versions.at(-1);
  const [edit, setEdit] = useState<StandingOrders | null>(null);
  const [acked, setAcked] = useState(false);

  if (edit) {
    const set = (x: Partial<StandingOrders>) => setEdit((e) => (e ? { ...e, ...x } : e));
    const issues = edit.prn.map((r) => (r.drug.code && r.drug.amount > 0 && r.intervalH && r.maxPerDay ? checkPrn(r, allergies) : []));
    const stop = issues.some((x) => x.some((i) => i.level === "stop"));
    const ask = issues.some((x) => x.some((i) => i.level === "ask"));
    const missing = [
      !edit.rest && "安静度",
      !edit.bath && "清潔",
      !edit.vitals && "バイタル測定",
      !edit.weight && "体重",
      !edit.io && "水分出納",
      edit.prn.some((r) => !r.drug.code || !(r.drug.amount > 0) || !r.intervalH || !r.maxPerDay) && "頓用の薬・量・間隔・回数",
      (edit.conds ?? []).some((r) => condMissing(r).length > 0) && "条件付き指示の項目・値・すること",
    ].filter((x): x is string => !!x);
    const row = (label: string, el: React.ReactNode) => (
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="w-20 shrink-0 text-ink-soft">{label}</span>
        {el}
      </div>
    );
    const setCall = (key: CallKey, value: number | null) => set({ calls: value === null ? edit.calls.filter((c) => c.key !== key) : [...edit.calls.filter((c) => c.key !== key), { key, value }] });
    const setPrn = (i: number, x: Partial<PrnRule>) => set({ prn: edit.prn.map((r, j) => (j === i ? { ...r, ...x } : r)) });
    return (
      <div className="space-y-3 text-[12px]">
        <p className="text-[11px] text-ink-faint">項目は医師が選びます（最初から選ばれているものはありません）。確定すると新しい版になり、看護師が指示受けします。</p>
        {row("安静度", <TabChoice label="安静度" options={RESTS.map((x) => ({ value: x, label: x }))} value={edit.rest} onChange={(v) => set({ rest: v })} />)}
        {row("清潔", <TabChoice label="清潔" options={BATHS.map((x) => ({ value: x, label: x }))} value={edit.bath} onChange={(v) => set({ bath: v })} />)}
        {row("バイタル", <TabChoice label="バイタル測定" options={VITAL_FREQS.map((x) => ({ value: x, label: x }))} value={edit.vitals} onChange={(v) => set({ vitals: v })} />)}
        {row("体重", <TabChoice label="体重測定" options={WEIGHTS.map((x) => ({ value: x, label: x }))} value={edit.weight} onChange={(v) => set({ weight: v })} />)}
        {row("水分出納", <TabChoice label="水分出納" options={IO.map((x) => ({ value: x, label: x }))} value={edit.io} onChange={(v) => set({ io: v })} />)}

        <section className="space-y-1 rounded-md border border-rule p-2">
          <h3 className="font-bold text-ink-soft">医師を呼ぶ基準（ドクターコール）</h3>
          {CALL_ITEMS.map((c) => {
            const on = edit.calls.find((x) => x.key === c.key);
            return (
              <div key={c.key} className="flex flex-wrap items-center gap-1.5">
                <label className="flex w-36 items-center gap-1.5">
                  <input type="checkbox" checked={!!on} onChange={() => setCall(c.key, on ? null : c.choices[0])} className="accent-ai" />
                  {c.label} {c.op}
                </label>
                {on && (
                  <>
                    <input value={on.value} onChange={(e) => setCall(c.key, Number(e.target.value) || 0)} inputMode="decimal" aria-label={`${c.label}の基準`} className="w-14 rounded border border-rule bg-paper px-1 py-0.5 text-right" />
                    {c.unit}
                    <TabChoice label={`${c.label}のよく使う基準`} options={c.choices.map((n) => ({ value: n, label: String(n) }))} value={on.value} onChange={(v) => setCall(c.key, v)} />
                  </>
                )}
              </div>
            );
          })}
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={edit.callConscious} onChange={() => set({ callConscious: !edit.callConscious })} className="accent-ai" />
            意識レベルが下がったとき
          </label>
        </section>

        <section className="space-y-2 rounded-md border border-rule p-2">
          <h3 className="font-bold text-ink-soft">頓用（必要時の薬）</h3>
          <p className="text-[11px] text-ink-faint">{NARCOTIC_RULES.prn}</p>
          {edit.prn.map((r, i) => {
            const drug = PRN_DRUGS.find((d) => d.code === r.drug.code);
            return (
              <div key={r.id} className="space-y-1 border-b border-rule-soft pb-2">
                {row("いつ", <TabChoice label="頓用の場面" options={PRN_WHEN.map((x) => ({ value: x, label: x }))} value={r.when} onChange={(v) => setPrn(i, { when: v })} />)}
                {row("条件", <input value={r.detail} onChange={(e) => setPrn(i, { detail: e.target.value })} placeholder="例：38.5℃以上" className="flex-1 rounded border border-rule bg-paper px-1 py-0.5" />)}
                {row(
                  "薬",
                  <>
                    <select value={r.drug.code} onChange={(e) => setPrn(i, { drug: { code: e.target.value, amount: r.drug.amount, unit: PRN_DRUGS.find((d) => d.code === e.target.value)?.unit ?? "" } })} aria-label="頓用の薬" className="max-w-64 rounded border border-rule bg-paper px-1 py-0.5">
                      <option value="">薬を選ぶ</option>
                      {PRN_DRUGS.map((d) => (
                        <option key={d.code} value={d.code}>
                          {d.label}
                        </option>
                      ))}
                    </select>
                    <input value={r.drug.amount} onChange={(e) => setPrn(i, { drug: { ...r.drug, amount: Number(e.target.value) || 0 } })} inputMode="decimal" aria-label="1回量" className="w-14 rounded border border-rule bg-paper px-1 py-0.5 text-right" />
                    {drug?.unit}
                  </>,
                )}
                {row(
                  "間隔・回数",
                  <>
                    <TabChoice label="頓用の間隔" options={[4, 6, 8, 12, 24].map((n) => ({ value: n, label: `${n}時間` }))} value={r.intervalH} onChange={(v) => setPrn(i, { intervalH: v })} />
                    あけて1日
                    <TabChoice label="1日の回数" options={[1, 2, 3, 4].map((n) => ({ value: n, label: `${n}回` }))} value={r.maxPerDay} onChange={(v) => setPrn(i, { maxPerDay: v })} />
                    まで
                  </>,
                )}
                {issues[i].map((x, k) => (
                  <p key={k} className={`nums pl-[5.5rem] ${x.level === "stop" ? "font-bold text-shu" : x.level === "ask" ? "text-yamabuki" : "text-ai"}`}>
                    {x.message}
                    {x.formula && <span className="ml-1">（{x.formula}、コードで計算）</span>}
                  </p>
                ))}
                <button type="button" onClick={() => set({ prn: edit.prn.filter((_, j) => j !== i) })} className="pl-[5.5rem] text-[11px] text-ink-faint hover:text-shu">
                  この頓用を消す
                </button>
              </div>
            );
          })}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-ink-soft">＋ 頓用を足す：</span>
            {PRN_WHEN.map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => set({ prn: [...edit.prn, { id: newId(), when: w, detail: "", drug: { code: "", amount: 0, unit: "" }, intervalH: 0, maxPerDay: 0 }] })}
                className="rounded border border-rule px-2 py-0.5 hover:border-ai hover:text-ai pointer-coarse:py-1.5"
              >
                {w}
              </button>
            ))}
          </div>
        </section>

        <CondEditor conds={edit.conds ?? []} onChange={(conds) => set({ conds })} newId={newId} />

        <textarea value={edit.other} onChange={(e) => set({ other: e.target.value })} rows={2} placeholder="その他の指示（任意）" aria-label="その他の指示" className="w-full rounded border border-rule bg-paper px-2 py-1" />
        {ask && !stop && (
          <label className="flex items-center gap-1.5 text-yamabuki">
            <input type="checkbox" checked={acked} onChange={() => setAcked(!acked)} className="accent-yamabuki" />
            上の注意を承知して確定する
          </label>
        )}
        <div className="sticky bottom-0 flex flex-wrap items-center gap-2 border-t border-rule bg-sheet pt-3">
          <button
            type="button"
            disabled={missing.length > 0 || stop || (ask && !acked) || !!deny("order")}
            onClick={() => {
              onSave({ ...edit, by: me.name, at: { day: 0, time: nowTime }, taken: undefined });
              setEdit(null);
              setAcked(false);
            }}
            className="rounded-md bg-ai px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
          >
            指示簿を確定
          </button>
          <button type="button" onClick={() => setEdit(null)} className="rounded-md border border-rule px-3 py-2 text-sm text-ink-soft">
            やめる
          </button>
          {missing.length > 0 && <span className="text-yamabuki">未選択：{missing.join("・")}</span>}
          {stop && <span className="font-bold text-shu">アレルギーに当たる頓用があります</span>}
          <DenyNote action="order" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 text-[13px]">
      {cur ? (
        <>
          <div className="flex flex-wrap items-center gap-2 text-[12px]">
            <span className="nums text-ink-soft">
              {fmtDay(cur.at.day)} {cur.at.time}　{cur.by}（第{versions.length}版）
            </span>
            {cur.taken ? (
              <span className="rounded bg-wakatake-soft px-1.5 text-wakatake">
                指示受け済：{cur.taken.by} {cur.taken.time}
              </span>
            ) : (
              <span className="rounded bg-yamabuki-soft px-1.5 font-bold text-yamabuki">指示受けがまだ</span>
            )}
            {!cur.taken && !deny("mar") && (
              <button type="button" onClick={onTake} className="rounded-md bg-wakatake px-3 py-1 font-bold text-white">
                指示受けする
              </button>
            )}
          </div>
          <CondHits hits={condHits} acks={condAcks} fmtDay={fmtDay} canRecord={!!onCondRecord && (me.role === "看護師" || me.role === "医師")} onRecord={(h, note) => onCondRecord?.(h, note)} />
          <StandingView s={cur} />
        </>
      ) : (
        <p className="text-ink-faint">この患者の指示簿はまだありません。</p>
      )}
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={!!deny("order")}
          onClick={() => setEdit(cur ? { ...cur, prn: cur.prn.map((r) => ({ ...r })), conds: (cur.conds ?? []).map((r) => ({ ...r })) } : emptyStanding(me.name, { day: 0, time: nowTime }))}
          className="rounded-md border border-ai px-3 py-1.5 font-bold text-ai hover:bg-ai-soft disabled:opacity-40"
        >
          {cur ? "指示簿を変える" : "指示簿を書く"}
        </button>
        <DenyNote action="order" />
      </div>
      {versions.length > 1 && (
        <details className="text-[12px]">
          <summary className="cursor-pointer text-ink-soft">前の版（{versions.length - 1}）</summary>
          {versions
            .slice(0, -1)
            .toReversed()
            .map((v, i) => (
              <div key={i} className="mt-2 border-l-2 border-rule pl-2 text-ink-soft">
                <div className="nums text-[11px]">
                  {fmtDay(v.at.day)} {v.at.time}　{v.by}
                </div>
                <StandingView s={v} />
              </div>
            ))}
        </details>
      )}
    </div>
  );
}

export function StandingView({ s }: { s: StandingOrders }) {
  const line = (k: string, v: React.ReactNode) => (
    <>
      <dt className="text-ink-faint">{k}</dt>
      <dd>{v}</dd>
    </>
  );
  return (
    <dl className="grid grid-cols-[6.5rem_1fr] gap-y-1 text-[12px]">
      {line("安静度", s.rest ?? "—")}
      {line("清潔", s.bath ?? "—")}
      {line("バイタル", s.vitals ?? "—")}
      {line("体重", s.weight ?? "—")}
      {line("水分出納", s.io ?? "—")}
      {line("医師を呼ぶ", [...s.calls.map(callText), ...(s.callConscious ? ["意識レベルの低下"] : [])].join("、") || "—")}
      {line(
        "頓用",
        s.prn.length ? (
          <ul>
            {s.prn.map((r) => (
              <li key={r.id}>{prnText(r)}</li>
            ))}
          </ul>
        ) : (
          "—"
        ),
      )}
      {(s.conds ?? []).length > 0 &&
        line(
          "条件付き指示",
          <ul>
            {(s.conds ?? []).map((r) => (
              <li key={r.id}>{ruleText(r)}</li>
            ))}
          </ul>,
        )}
      {s.other && line("その他", s.other)}
    </dl>
  );
}
