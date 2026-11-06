"use client";

import { displayText } from "@/lib/display-text";
import { Footprints } from "lucide-react";
import { useState } from "react";
import { FALL_RISKS, R8, type ChecklistRecord } from "@/lib/admit-eval";
import { FALL_RULES, FALL_SOURCES, fallChanges, fallDueList, fallSteps, type FallTrigger } from "@/lib/fall-reassess";
import { useMe } from "./RoleContext";

export interface FallPatient {
  id: string;
  name: string;
  room: string;
  admittedOn: number;
  first?: ChecklistRecord;
  reviews: ChecklistRecord[];
  triggers: FallTrigger[];
}

const STATE_STYLE = { 期限切れ: "bg-shu-soft text-shu", 今日まで: "bg-yamabuki-soft text-yamabuki", 期限内: "text-ink-soft" } as const;

function ReviewForm({ last, nowTime, onSave, onCancel }: { last?: ChecklistRecord; nowTime: string; onSave: (r: Pick<ChecklistRecord, "checked" | "plan">) => void; onCancel: () => void }) {
  const [checked, setChecked] = useState<string[]>(last?.checked ?? []);
  const [plan, setPlan] = useState(last?.plan ?? "");
  const ch = fallChanges(last, { checked });
  return (
    <div className="space-y-1.5 rounded-md border border-ai/40 bg-paper p-2 text-[12px]">
      <p className="hint text-ink-soft">前回の評価が入っています。いまの状態に合わせて直してください。</p>
      <div className="flex flex-wrap gap-1">
        {FALL_RISKS.map((x) => (
          <label key={x} className={`flex cursor-pointer items-center gap-1 rounded border px-1.5 py-0.5 ${checked.includes(x) ? "border-ink bg-ink text-white" : "border-rule bg-sheet"}`}>
            <input type="checkbox" className="sr-only" checked={checked.includes(x)} onChange={() => setChecked((c) => (c.includes(x) ? c.filter((y) => y !== x) : [...c, x]))} />
            {x}
          </label>
        ))}
      </div>
      <textarea value={plan} onChange={(e) => setPlan(e.target.value)} rows={2} placeholder="対策（ナースコールの位置、付き添い、ベッドの高さ、センサーなど）" aria-label="対策" className="w-full rounded border border-rule bg-sheet px-2 py-1" />
      {(ch.added.length > 0 || ch.gone.length > 0) && (
        <p className="text-ink-soft">
          前回から：{ch.added.length > 0 && <span className="text-shu">増えた {ch.added.join("、")}</span>}
          {ch.added.length > 0 && ch.gone.length > 0 && "　"}
          {ch.gone.length > 0 && <span className="text-wakatake">なくなった {ch.gone.join("、")}</span>}
        </p>
      )}
      <div className="flex gap-2">
        <button type="button" onClick={() => onSave({ checked, plan: plan.trim() })} className="rounded-md bg-ai px-3 py-1 font-bold text-white">
          再評価を記録（{nowTime}）
        </button>
        <button type="button" onClick={onCancel} className="rounded-md border border-rule px-3 py-1">
          やめる
        </button>
      </div>
    </div>
  );
}

/**
 * 転倒・転落の再評価: the team's patients with when their risk items must be checked again (7 days, or after a
 * 転棟・転床 or 手術), due first; the nurse re-assesses here. No score is used.
 */
export function FallBoard({ patients, nowTime, canRecord, onReview, onOpen }: { patients: FallPatient[]; nowTime: string; canRecord: boolean; onReview: (patientId: string, r: ChecklistRecord) => void; onOpen: (patientId: string) => void }) {
  const me = useMe();
  const [open, setOpen] = useState<string | null>(null);
  const rows = fallDueList(patients);
  const due = rows.filter((r) => r.state !== "期限内").length;
  const rel = (d: number) => (d === 0 ? "今日" : d === -1 ? "昨日" : d === 1 ? "明日" : d < 0 ? `${-d}日前` : `${d}日後`);
  return (
    <section aria-label="転倒・転落の再評価" className="scroll-thin min-h-0 flex-1 overflow-auto bg-paper p-5">
      <header className="mb-2 flex flex-wrap items-center gap-3">
        <h1 className="flex items-center gap-1.5 text-lg font-bold">
          <Footprints size={18} />
          転倒・転落の再評価
        </h1>
        <span className="nums text-sm text-ink-soft">
          {patients.length}人{due > 0 && <b className="ml-2 text-shu">期限が今日まで・過ぎた {due}人</b>}
        </span>
      </header>
      <p className="hint mb-2 text-xs text-ink-soft">入院時の評価と同じ、受け持ちのチームの患者です。「再評価する」で危険因子を確かめ直し、対策を書きます。名前を押すとカルテが開きます。</p>
      <table className="nums w-full border-collapse rounded-lg bg-sheet text-[12px]">
        <thead>
          <tr className="border-b border-rule text-left text-ink-soft">
            <th className="px-2 py-1.5">患者</th>
            <th className="px-2">前回の評価</th>
            <th className="px-2">危険因子</th>
            <th className="px-2">次の評価</th>
            <th className="px-2">理由</th>
            <th className="px-2" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const p = patients.find((x) => x.id === r.patientId)!;
            const steps = fallSteps(p.first, p.reviews);
            return (
              <tr key={r.patientId} className="border-b border-rule-soft align-top">
                <td className="px-2 py-1.5">
                  <button type="button" onClick={() => onOpen(p.id)} className="text-left font-bold text-ai underline-offset-2 hover:underline">
                    {p.room} {p.name}
                  </button>
                  <div className="text-[11px] text-ink-faint">入院{1 - p.admittedOn}日目</div>
                </td>
                <td className="px-2">
                  {r.last ? (
                    <>
                      {r.last.kind} {rel(r.last.at.day)} {r.last.at.time}
                      <div className="text-[11px] text-ink-faint">
                        {displayText(r.last.by)}（記録 {steps.length}回）
                      </div>
                    </>
                  ) : (
                    <span className="text-yamabuki">まだ</span>
                  )}
                </td>
                <td className="px-2">
                  {r.last ? r.last.checked.length ? r.last.checked.join("、") : "なし" : "—"}
                  {r.last?.plan && <div className="text-[11px] text-ink-soft">対策：{r.last.plan}</div>}
                </td>
                <td className="px-2">
                  <span className={`rounded px-1.5 py-0.5 font-bold ${STATE_STYLE[r.state]}`}>
                    {rel(r.dueOn)}（{r.state}）
                  </span>
                </td>
                <td className="px-2 text-[11px]">{r.reasons.join("・")}</td>
                <td className="px-2">
                  {canRecord && r.last && open !== p.id && (
                    <button type="button" onClick={() => setOpen(p.id)} className="rounded border border-ai px-2 py-0.5 text-ai hover:bg-ai hover:text-white">
                      再評価する
                    </button>
                  )}
                  {!r.last && <span className="text-[11px] text-ink-faint">入院時の評価で入れます</span>}
                  {open === p.id && (
                    <ReviewForm
                      last={r.last}
                      nowTime={nowTime}
                      onCancel={() => setOpen(null)}
                      onSave={(x) => {
                        onReview(p.id, { checked: x.checked, measures: [], plan: x.plan, by: me.name, at: { day: 0, time: nowTime } });
                        setOpen(null);
                      }}
                    />
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <ul className="mt-3 space-y-0.5 text-[11px] text-ink-faint">
        <li>
          <a href={FALL_SOURCES.teigen.url} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">
            {FALL_SOURCES.teigen.label}
          </a>
        </li>
        <li>危険因子の項目：{R8.fall}</li>
        <li>{FALL_RULES.interval}</li>
        <li>{FALL_RULES.surgery}</li>
        <li>{FALL_RULES.noScore}</li>
      </ul>
    </section>
  );
}
