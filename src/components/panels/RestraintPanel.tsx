"use client";

import { displayText } from "@/lib/display-text";
import { useState } from "react";
import { DEVICES, REQUIREMENTS, RESTRAINT_SOURCES, REVIEW_HOURS, durationText, emptyRestraint, minutesOf, reviewDue, startProblems, type Restraint, type RestraintDraft } from "@/lib/restraint";
import { DenyNote, useDeny, useMe } from "../RoleContext";

/**
 * 身体的拘束: record it only when unavoidable — devices, why, the patient's state, the three conditions
 * and what was tried first — then review each shift and end it as soon as possible. The time is counted
 * by code; whether to continue is decided by people.
 */
export function RestraintPanel({ records, nowAbs, nowTime, fmtDay, onStart, onReview }: { records: Restraint[]; nowAbs: number; nowTime: string; fmtDay: (d: number) => string; onStart: (d: RestraintDraft) => void; onReview: (id: string, decision: "続ける" | "やめる", note: string) => void }) {
  const me = useMe();
  const deny = useDeny()("restraint");
  const active = records.find((r) => !r.end);
  const past = records.filter((r) => r.end);
  const [draft, setDraft] = useState<RestraintDraft | null>(null);
  const [note, setNote] = useState("");
  const set = (x: Partial<RestraintDraft>) => setDraft((d) => (d ? { ...d, ...x } : d));
  const input = "w-full rounded border border-rule bg-paper px-2 py-1";

  return (
    <div className="space-y-3 text-[13px]">


      {active ? (
        <section className="space-y-2 rounded-md border border-shu/40 bg-shu-soft/30 p-3">
          <h3 className="font-bold text-shu">
            身体的拘束中：{active.devices.join("・")}（{displayText(durationText(minutesOf(active, nowAbs)))}）
          </h3>
          {(() => {
            const due = reviewDue(active, nowAbs);
            return due ? <p className={`nums font-bold ${due.late ? "text-shu" : "text-ink-soft"}`}>{displayText(due.text)}（{REVIEW_HOURS}時間ごと＝勤務帯ごと）</p> : null;
          })()}
          <dl className="grid grid-cols-[7rem_1fr] gap-y-1 text-[12px]">
            <dt className="text-ink-faint">開始</dt>
            <dd className="nums">
              {fmtDay(active.start.day)} {active.start.time}　指示 {displayText(active.doctor)}・確認 {active.confirmedBy}
            </dd>
            <dt className="text-ink-faint">理由</dt>
            <dd>{active.why}</dd>
            <dt className="text-ink-faint">心身の状況</dt>
            <dd>{active.state}</dd>
            {REQUIREMENTS.map((r) => (
              <div key={r.key} className="contents">
                <dt className="text-ink-faint">{r.key}</dt>
                <dd>{active.met[r.key]}</dd>
              </div>
            ))}
            <dt className="text-ink-faint">試した方法</dt>
            <dd>{active.tried}</dd>
            <dt className="text-ink-faint">家族への説明</dt>
            <dd>{active.family || "—"}</dd>
          </dl>
          {active.reviews.length > 0 && (
            <ol className="space-y-0.5 border-l-2 border-rule pl-2 text-[12px]">
              {active.reviews.map((v, i) => (
                <li key={i} className="nums">
                  {fmtDay(v.at.day)} {v.at.time}　{displayText(v.by)}：<b>{v.decision}</b>　{displayText(v.note)}
                </li>
              ))}
            </ol>
          )}
          <div className="space-y-1.5">
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="見直しの記録（例：落ち着いて眠っている。外して様子を見る）" aria-label="見直しの記録" className={input} />
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={!note.trim() || !!deny}
                onClick={() => {
                  onReview(active.id, "やめる", note.trim());
                  setNote("");
                }}
                className="rounded-md bg-wakatake px-3 py-1.5 font-bold text-white disabled:opacity-40"
              >
                やめる（解除）
              </button>
              <button
                type="button"
                disabled={!note.trim() || !!deny}
                onClick={() => {
                  onReview(active.id, "続ける", note.trim());
                  setNote("");
                }}
                className="rounded-md border border-rule px-3 py-1.5 disabled:opacity-40"
              >
                続ける（見直しを記録）
              </button>
              <DenyNote action="restraint" />
            </div>
          </div>
        </section>
      ) : draft ? (
        <section className="space-y-2 rounded-md border border-rule p-3 text-[12px]">
          <h3 className="font-bold">身体的拘束の開始を記録する</h3>
          <div>
            <div className="mb-1 text-ink-soft">用具（必要なものだけ）</div>
            <div className="flex flex-wrap gap-1.5">
              {DEVICES.map((d) => (
                <label key={d} className={`flex items-center gap-1 rounded border px-2 py-0.5 pointer-coarse:py-1.5 ${draft.devices.includes(d) ? "border-ai bg-ai-soft" : "border-rule"}`}>
                  <input type="checkbox" checked={draft.devices.includes(d)} onChange={() => set({ devices: draft.devices.includes(d) ? draft.devices.filter((x) => x !== d) : [...draft.devices, d] })} className="accent-ai" />
                  {d}
                </label>
              ))}
            </div>
          </div>
          <input value={draft.why} onChange={(e) => set({ why: e.target.value })} placeholder="緊急やむを得ない理由" aria-label="緊急やむを得ない理由" className={input} />
          <input value={draft.state} onChange={(e) => set({ state: e.target.value })} placeholder="そのときの患者の心身の状況" aria-label="心身の状況" className={input} />
          <div className="space-y-1 rounded bg-paper p-2">
            <div className="text-ink-soft">3つの要件をすべて満たすか（{RESTRAINT_SOURCES.guide.label}）</div>
            {REQUIREMENTS.map((r) => (
              <label key={r.key} className="block">
                <span className="font-bold">{r.key}</span>
                <span className="ml-1 text-ink-faint">{r.hint}</span>
                <input value={draft.met[r.key]} onChange={(e) => set({ met: { ...draft.met, [r.key]: e.target.value } })} placeholder="どう満たすか" aria-label={r.key} className={`${input} mt-0.5`} />
              </label>
            ))}
          </div>
          <input value={draft.tried} onChange={(e) => set({ tried: e.target.value })} placeholder="先に試した代わりの方法（原因を取り除く・環境・見守り など）" aria-label="試した代わりの方法" className={input} />
          <div className="grid grid-cols-2 gap-2">
            <input value={draft.doctor} onChange={(e) => set({ doctor: e.target.value })} placeholder="指示した医師" aria-label="指示した医師" className={input} />
            <input value={draft.confirmedBy} onChange={(e) => set({ confirmedBy: e.target.value })} placeholder="一緒に確かめた人（1人では決めない）" aria-label="一緒に確かめた人" className={input} />
          </div>
          <input value={draft.family} onChange={(e) => set({ family: e.target.value })} placeholder="家族への説明（誰に・いつ・誰が）" aria-label="家族への説明" className={input} />
          {(() => {
            const miss = startProblems(draft);
            return (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  disabled={miss.length > 0 || !!deny}
                  onClick={() => {
                    onStart(draft);
                    setDraft(null);
                  }}
                  className="rounded-md bg-shu px-4 py-1.5 font-bold text-white disabled:opacity-40"
                >
                  開始を記録（{nowTime}）
                </button>
                <button type="button" onClick={() => setDraft(null)} className="rounded-md border border-rule px-3 py-1.5 text-ink-soft">
                  やめる
                </button>
                {miss.length > 0 && <span className="text-yamabuki">未入力：{miss.join("・")}</span>}
                <DenyNote action="restraint" />
              </div>
            );
          })()}
        </section>
      ) : (
        <div className="space-y-2">
          <p className="text-ink-soft">いまは身体的拘束をしていません。</p>
          <button type="button" disabled={!!deny} onClick={() => setDraft(emptyRestraint(me.role === "医師" ? me.name : ""))} className="rounded-md border border-shu/50 px-3 py-1.5 font-bold text-shu hover:bg-shu-soft disabled:opacity-40">
            開始を記録する（緊急やむを得ないときだけ）
          </button>
        </div>
      )}

      {past.length > 0 && (
        <section className="text-[12px]">
          <h3 className="mb-1 font-bold text-ink-soft">これまでの記録</h3>
          <ul className="space-y-1">
            {past.map((r) => (
              <li key={r.id} className="nums rounded border border-rule-soft px-2 py-1">
                {fmtDay(r.start.day)} {r.start.time}〜{fmtDay(r.end!.at.day)} {r.end!.at.time}（{displayText(durationText(minutesOf(r, nowAbs)))}）　{r.devices.join("・")}　解除：{displayText(r.end!.by)}「{displayText(r.end!.note)}」
              </li>
            ))}
          </ul>
        </section>
      )}

    </div>
  );
}

/* Help migration source (references and dynamic wording):
<span >、院内の取り決め</span>
<p >
        出典：{RESTRAINT_SOURCES.rule.label}／{RESTRAINT_SOURCES.guide.label}。精神病床での身体的拘束は精神保健及び精神障害者福祉に関する法律によります（この記録の対象外。{RESTRAINT_SOURCES.qa.label}）。
      </p>
*/

/* ヘルプへ移動した説明:
患者やほかの患者などの生命・身体を守るため、緊急やむを得ない場合を除いて、身体的拘束はしません。行うときは、用具と時間・心身の状況・やむを得ない理由を記録します（ ）。
*/
