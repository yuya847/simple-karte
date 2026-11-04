"use client";

import { TriangleAlert } from "lucide-react";
import { useState } from "react";
import { COND_LABS, COND_OPS, COND_VITALS, condMissing, emptyCond, ruleText, type CondAck, type CondHit, type CondOp, type CondRule } from "@/lib/cond-orders";
import { ANALYTES } from "@/lib/master";

const LAB_CHOICES = [...COND_LABS.flatMap((c) => ANALYTES.filter((a) => a.code === c)), ...ANALYTES.filter((a) => !COND_LABS.includes(a.code))];

/** The doctor writes each 条件付き指示: the item, the condition and what to do (nothing is preselected). */
export function CondEditor({ conds, onChange, newId }: { conds: CondRule[]; onChange: (c: CondRule[]) => void; newId: () => string }) {
  const set = (i: number, x: Partial<CondRule>) => onChange(conds.map((r, j) => (j === i ? { ...r, ...x } : r)));
  return (
    <section className="space-y-2 rounded-md border border-rule p-2">
      <h3 className="font-bold text-ink-soft">条件付き指示（検査値・バイタルが条件に当たったら）</h3>
      <p className="hint text-[11px] text-ink-faint">条件と、当たったときにすることを医師が書きます。最新の値が条件に当たると、看護師の画面と「やること」に出ます。薬を出したり、オーダを作ったりはしません。</p>
      {conds.map((r, i) => {
        const missing = condMissing(r);
        const unit = r.source === "lab" ? (ANALYTES.find((a) => a.code === r.item)?.unit ?? "") : (COND_VITALS.find((v) => v.key === r.item)?.unit ?? "");
        return (
          <div key={r.id} className="space-y-1 border-b border-rule-soft pb-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <select value={r.source} onChange={(e) => set(i, { source: e.target.value as CondRule["source"], item: "" })} aria-label="条件の種類" className="rounded border border-rule bg-paper px-1 py-0.5">
                <option value="lab">検査値</option>
                <option value="vital">バイタル</option>
              </select>
              <select value={r.item} onChange={(e) => set(i, { item: e.target.value })} aria-label="条件の項目" className="max-w-48 rounded border border-rule bg-paper px-1 py-0.5">
                <option value="">項目を選ぶ</option>
                {r.source === "lab"
                  ? LAB_CHOICES.map((a) => (
                      <option key={a.code} value={a.code}>
                        {a.name}
                        {a.unit ? `（${a.unit}）` : ""}
                      </option>
                    ))
                  : COND_VITALS.map((v) => (
                      <option key={v.key} value={v.key}>
                        {v.label}（{v.unit}）
                      </option>
                    ))}
              </select>
              <input value={Number.isFinite(r.value) ? r.value : ""} onChange={(e) => set(i, { value: e.target.value.trim() === "" ? Number.NaN : Number(e.target.value) })} inputMode="decimal" aria-label="条件の値" placeholder="値" className="w-16 rounded border border-rule bg-paper px-1 py-0.5 text-right" />
              {unit}
              <select value={r.op} onChange={(e) => set(i, { op: e.target.value as CondOp })} aria-label="条件の向き" className="rounded border border-rule bg-paper px-1 py-0.5">
                {COND_OPS.map((o) => (
                  <option key={o.op} value={o.op}>
                    {o.label}
                  </option>
                ))}
              </select>
              なら
            </div>
            <div className="flex flex-wrap items-center gap-1.5 pl-2">
              <label className="flex items-center gap-1">
                <input type="checkbox" checked={r.callDoctor} onChange={() => set(i, { callDoctor: !r.callDoctor })} className="accent-ai" />
                医師へ連絡
              </label>
              <input value={r.action} onChange={(e) => set(i, { action: e.target.value })} placeholder="ほかにすること（例：次のフロセミドは見合わせる）" aria-label="当たったときにすること" className="min-w-48 flex-1 rounded border border-rule bg-paper px-1 py-0.5" />
            </div>
            <div className="flex flex-wrap items-center gap-2 pl-2 text-[11px]">
              {missing.length ? <span className="text-yamabuki">未入力：{missing.join("・")}</span> : <span className="text-ink-soft">{ruleText(r)}</span>}
              <button type="button" onClick={() => onChange(conds.filter((_, j) => j !== i))} className="text-ink-faint hover:text-shu">
                この条件付き指示を消す
              </button>
            </div>
          </div>
        );
      })}
      <button type="button" onClick={() => onChange([...conds, emptyCond(newId())])} className="rounded border border-rule px-2 py-0.5 hover:border-ai hover:text-ai pointer-coarse:py-1.5">
        ＋ 条件付き指示を足す
      </button>
    </section>
  );
}

/** Rules met by the latest values, for the nurse to act on as written and record (code only compares). */
export function CondHits({ hits, acks, fmtDay, canRecord, onRecord }: { hits: CondHit[]; acks: Record<string, CondAck>; fmtDay: (d: number) => string; canRecord: boolean; onRecord: (h: CondHit, note: string) => void }) {
  const [notes, setNotes] = useState<Record<string, string>>({});
  if (!hits.length) return null;
  return (
    <section aria-label="条件に当たる指示" className="space-y-2 rounded-md border border-shu/50 bg-shu-soft/40 p-2 text-[12px]">
      <h3 className="flex items-center gap-1 font-bold text-shu">
        <TriangleAlert size={14} />
        条件付き指示に当たる値があります（最新の値をコードで比べました）
      </h3>
      {hits.map((h) => {
        const done = acks[h.key];
        return (
          <div key={h.key} className="space-y-1 rounded border border-rule bg-sheet p-2">
            <div>
              <b className={done ? "text-ink-soft" : "text-shu"}>{h.text}</b>
              <span className="nums ml-1 text-ink-faint">
                {fmtDay(h.at.day)} {h.at.time} の値
              </span>
            </div>
            <div>指示：{ruleText(h.rule)}</div>
            {done ? (
              <div className="text-wakatake">
                対応の記録：{done.at.time} {done.by}「{done.note}」
              </div>
            ) : canRecord ? (
              <div className="flex flex-wrap items-center gap-1.5">
                <input value={notes[h.key] ?? ""} onChange={(e) => setNotes((n) => ({ ...n, [h.key]: e.target.value }))} placeholder="したこと（例：山本医師に連絡し、指示を受けた）" aria-label="したこと" className="min-w-48 flex-1 rounded border border-rule bg-paper px-1 py-0.5" />
                <button type="button" disabled={!(notes[h.key] ?? "").trim()} onClick={() => onRecord(h, (notes[h.key] ?? "").trim())} className="rounded bg-wakatake px-2 py-0.5 font-bold text-white disabled:opacity-40">
                  対応を記録
                </button>
              </div>
            ) : (
              <div className="text-ink-faint">看護師が指示どおりに対応して記録します。</div>
            )}
          </div>
        );
      })}
    </section>
  );
}
