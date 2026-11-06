"use client";

import { displayText } from "@/lib/display-text";
import { Check, Microscope } from "lucide-react";
import { useState } from "react";
import { auditLog } from "@/lib/audit";
import { AST_DRUGS, EMPTY_STEP, GRAM_RESULTS, NO_GROWTH, ORGANISMS, STAGE_LABEL, addCultureStep, checkStep, cultureOf, cultureQueue, setsDrawn, stepText, type CultureItem, type Sir, type StepInput } from "@/lib/lab-culture";
import type { LabDesk } from "@/lib/lab-desk";
import { bloodCulturePanic, hitLine, type PanicCall } from "@/lib/results";
import type { CultureStage } from "@/lib/types";
import type { WorkPatient } from "@/lib/worksheet";
import { PlaceMark } from "./LabMarks";
import { DenyNote, useDeny, useMe } from "./RoleContext";
import { TabChoice } from "./TabChoice";

interface Props {
  people: WorkPatient[];
  desk: LabDesk;
  calls: Record<string, PanicCall>;
  nowAbs: number;
  dayLabel: (d: number) => string;
  onDesk: (f: (d: LabDesk) => LabDesk) => void;
  /** A step made a panic value (a positive blood culture): one line for the banner. */
  onPanic: (line: string) => void;
}

/** 培養（細菌検査）: each culture reported in steps — 塗抹, 中間報告, 最終報告 — with who and when. */
export function LabCulture({ people, desk, calls, nowAbs, dayLabel, onDesk, onPanic }: Props) {
  const me = useMe();
  const deny = useDeny()("lab.result");
  const queue = cultureQueue(people, desk, calls);
  const [sel, setSel] = useState<string | null>(null);
  const item = queue.find((i) => i.key === sel) ?? queue.find((i) => i.next.length > 0 || i.waits) ?? queue[0];
  if (queue.length === 0) return <p className="mx-auto max-w-[1100px] rounded-lg border border-rule bg-sheet p-4 text-ink-soft">報告を待つ培養はありません。血液培養・尿培養の検体を「検体の受付」で読むと、ここに「培養中」で並びます。</p>;
  return (
    <div className="mx-auto max-w-[1100px] space-y-2">
      <DenyNote action="lab.result" />
      <div className="flex flex-wrap items-start gap-3">
        <ul className="w-72 shrink-0 space-y-1">
          {queue.map((i) => (
            <li key={i.key}>
              <button
                type="button"
                onClick={() => setSel(i.key)}
                className={`w-full rounded border px-2 py-1 text-left text-[12px] ${i.key === item?.key ? "border-ai bg-ai-soft" : "border-rule bg-sheet hover:border-ai"} ${i.next.length === 0 && !i.waits ? "opacity-60" : ""}`}
              >
                <span className="nums block text-ink-soft">
                  採取 {dayLabel(i.culture.collectedOn)}　<PlaceMark place={i.place} room={i.room} /> <b className="text-ink">{i.name}</b>
                </span>
                <span className="block">
                  <b>{i.culture.specimen}培養</b>
                  {i.culture.sets ? `（${i.culture.sets}）` : ""}
                  <span className={i.waits ? "font-bold text-shu" : i.culture.status === "最終報告" ? "text-ink-faint" : "text-ai"}>
                    {i.waits ? "陽性の連絡がまだ" : i.culture.stage ? STAGE_LABEL[i.culture.stage].replace(/（.*/, "") : i.culture.status}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        {item && <Detail key={`${item.key}-${item.culture.log?.length ?? 0}`} item={item} locked={!!deny} dayLabel={dayLabel} onStep={(step) => {
          const before = item.culture;
          onDesk((d) => addCultureStep(d, item, step, me.name, nowAbs));
          const after = cultureOf({ key: item.key, patientId: item.patientId, base: before, steps: [{ ...step, by: me.name, day: 0, time: "" }] });
          const panic = bloodCulturePanic(after);
          auditLog({ role: me.role, actor: me.name, action: `確定（培養の報告：${step.stage}）`, patient: item.name, detail: `${before.specimen}培養（採取 ${dayLabel(before.collectedOn)}）　${stepText(step)}${panic.length ? "　パニック値" : ""}` });
          if (panic.length) onPanic(`${item.room} ${item.name}さん ${panic.map(hitLine).join("、")}`);
          setSel(item.key);
        }} />}
      </div>
    </div>
  );
}

function Detail({ item, locked, dayLabel, onStep }: { item: CultureItem; locked: boolean; dayLabel: (d: number) => string; onStep: (s: NonNullable<ReturnType<typeof checkStep>["step"]>) => void }) {
  const c = item.culture;
  const [stage, setStage] = useState<CultureStage | null>(item.next[0] ?? null);
  const [input, setInput] = useState<StepInput>({ ...EMPTY_STEP, organism: c.organism ?? "" });
  const set = (x: Partial<StepInput>) => setInput((v) => ({ ...v, ...x }));
  const check = stage ? checkStep(stage, c, input) : null;
  const blood = c.specimen === "血液";
  return (
    <section className="min-w-0 flex-1 space-y-2 rounded-lg border border-rule bg-sheet p-3 text-[12px]">
      <div className="flex flex-wrap items-baseline gap-2">
        <Microscope size={15} className="self-center text-ai" />
        <b className="text-[14px]">
          {item.room} {item.name}さん　{c.specimen}培養
        </b>
        <span className="nums text-ink-soft">
          採取 {dayLabel(c.collectedOn)}
          {c.sets ? `　${c.sets}` : ""}
        </span>
        <span className="ml-auto rounded border border-rule px-1 text-ink-soft">{c.status}</span>
        {c.id && <span className="nums font-mono text-[11px] text-ink-faint">{c.id}</span>}
      </div>
      <dl className="grid grid-cols-[7rem_1fr] gap-y-0.5">
        <dt className="text-ink-faint">グラム染色</dt>
        <dd>{c.gram ?? "—"}</dd>
        <dt className="text-ink-faint">菌名</dt>
        <dd className="font-bold">{c.organism ?? "—"}</dd>
        {c.susceptibility && (
          <>
            <dt className="text-ink-faint">感受性</dt>
            <dd className="nums">{c.susceptibility.map((s) => `${s.drug} ${s.result}${s.mic !== "—" ? `（${s.mic}）` : ""}`).join("、")}</dd>
          </>
        )}
      </dl>
      {c.log && c.log.length > 0 && (
        <ol className="nums space-y-0.5 rounded border border-rule-soft bg-paper px-2 py-1 text-[11px] text-ink-soft">
          {c.log.map((l, n) => (
            <li key={n}>
              {dayLabel(l.day)} {l.time} {displayText(l.by)}　{displayText(l.text)}
            </li>
          ))}
        </ol>
      )}
      {item.waits && <p className="font-bold text-shu">{item.waits}「結果とパニック値」で報告を記録します。</p>}
      {item.next.length === 0 && !item.waits && <p className="font-bold text-wakatake">最終報告まで済みました。</p>}

      {item.next.length > 0 && (
        <fieldset disabled={locked} className="m-0 min-w-0 space-y-2 border-0 border-t border-rule-soft p-0 pt-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-bold">次の報告</span>
            <TabChoice label="次の報告" options={item.next.map((s) => ({ value: s, label: STAGE_LABEL[s] }))} value={stage} onChange={setStage} />
          </div>
          {stage === "塗抹" && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <span className="w-20 shrink-0 text-ink-soft">グラム染色</span>
                <TabChoice label="グラム染色の所見" options={GRAM_RESULTS.map((g) => ({ value: g, label: g, disabled: blood && g === "菌を認めない" }))} value={input.gram} onChange={(g) => set({ gram: g })} />
              </div>
              {blood && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="w-20 shrink-0 text-ink-soft">陽性のセット</span>
                  <TabChoice
                    label="陽性のセット数"
                    options={Array.from({ length: setsDrawn(c) }, (_, k) => ({ value: k + 1, label: `${setsDrawn(c)}セット中${k + 1}セット` }))}
                    value={input.positive}
                    onChange={(n) => set({ positive: n })}
                  />
                </div>
              )}
              {blood && <p className="text-[11px] text-shu">血液培養の塗抹陽性は医師へ電話連絡してください。</p>}
            </>
          )}
          {(stage === "中間報告" || stage === "最終報告") && (
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="w-20 shrink-0 text-ink-soft">菌名</span>
                <input value={input.organism} onChange={(e) => set({ organism: e.target.value })} list={`org-${item.key}`} placeholder="選ぶか書く" aria-label="菌名" className="w-80 rounded border border-rule bg-paper px-1.5 py-0.5" />
                <datalist id={`org-${item.key}`}>
                  {[...ORGANISMS, ...(stage === "最終報告" ? [NO_GROWTH] : [])].map((o) => (
                    <option key={o} value={o} />
                  ))}
                </datalist>
              </div>
              <div className="flex flex-wrap gap-1 pl-[5.5rem]">
                {[...ORGANISMS, ...(stage === "最終報告" ? [NO_GROWTH] : [])].map((o) => (
                  <button key={o} type="button" onClick={() => set({ organism: o })} className={`rounded border px-1.5 text-[11px] ${input.organism === o ? "border-ai bg-ai-soft font-bold text-ai" : "border-rule text-ink-soft hover:border-ai"}`}>
                    {o}
                  </button>
                ))}
              </div>
            </div>
          )}
          {stage === "最終報告" && input.organism.trim() !== NO_GROWTH && (
            <table className="w-full max-w-[560px] border-collapse">
              <thead>
                <tr className="border-b border-rule text-left text-ink-soft">
                  <th className="py-0.5 pr-2 font-normal">薬剤</th>
                  <th className="py-0.5 pr-2 font-normal">判定（検査室）</th>
                  <th className="py-0.5 font-normal">MIC（μg/mL・任意）</th>
                </tr>
              </thead>
              <tbody>
                {AST_DRUGS.map((d) => (
                  <tr key={d.code} className="border-b border-rule-soft">
                    <td className="py-0.5 pr-2">
                      <b>{d.code}</b> <span className="text-[11px] text-ink-faint">{d.name}</span>
                    </td>
                    <td className="py-0.5 pr-2">
                      <span role="radiogroup" aria-label={`${d.code} の判定`} className="inline-flex gap-0.5">
                        {(["S", "I", "R", null] as (Sir | null)[]).map((v) => (
                          <button
                            key={v ?? "none"}
                            type="button"
                            role="radio"
                            aria-checked={(input.sir[d.code] ?? null) === v}
                            onClick={() => set({ sir: { ...input.sir, [d.code]: v } })}
                            className={`rounded border px-1.5 text-[11px] ${(input.sir[d.code] ?? null) === v ? (v === "R" ? "border-shu bg-shu text-white" : v ? "border-ai bg-ai text-white" : "border-ink-soft bg-ink-soft text-white") : "border-rule text-ink-soft"}`}
                          >
                            {v ?? "未実施"}
                          </button>
                        ))}
                      </span>
                    </td>
                    <td className="py-0.5">
                      <input value={input.mic[d.code] ?? ""} onChange={(e) => set({ mic: { ...input.mic, [d.code]: e.target.value } })} aria-label={`${d.code} の MIC`} className="nums w-20 rounded border border-rule bg-paper px-1 py-0.5 text-right" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {stage && (
            <div className="flex flex-wrap items-center gap-2">
              <input value={input.note} onChange={(e) => set({ note: e.target.value })} placeholder="コメント（任意）例：10⁵/mL、2菌種" aria-label="報告のコメント" className="min-w-0 flex-1 rounded border border-rule bg-paper px-1.5 py-0.5" />
              {check && check.missing.length > 0 && <span className="text-ink-soft">あと：{check.missing.join("・")}</span>}
              <button type="button" disabled={!check?.step} onClick={() => check?.step && onStep(check.step)} className="flex items-center gap-1 rounded bg-wakatake px-3 py-1 font-bold text-white disabled:opacity-40">
                <Check size={13} />
                {STAGE_LABEL[stage].replace(/（.*/, "")}を確定
              </button>
            </div>
          )}

        </fieldset>
      )}
    </section>
  );
}

/* Help migration source (references and dynamic wording):
<p >
            順番（塗抹 → 中間報告 → 最終報告。陰性はそのまま最終報告）と、各報告に要るものはコードが確かめます。所見・菌名・S／I／R は検査室が読んで判定したものを入れ、この画面は判定しません。薬剤の略号は日本化学療法学会の抗菌薬略号。報告は医師のカルテの「未確認の結果」と検査結果の細菌検査に出ます。
          </p>
*/
