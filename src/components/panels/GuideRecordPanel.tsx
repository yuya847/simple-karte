"use client";

import { useState } from "react";
import { formatShort, addDays, type CalendarDate } from "@/lib/dates";
import { GUIDANCE_SOURCE, GUIDANCE_TIME_SOURCE, NUTRITION_ELIGIBLE, WHO_HEARD, guidanceProblems, nutritionCountNote, nutritionTimeNote, openRequests, type GuidanceRecord, type GuideKind } from "@/lib/guidance";
import type { Role } from "@/lib/roles";
import type { OrderEntry } from "@/lib/types";
import { TabChoice } from "../TabChoice";

const KINDS: GuideKind[] = ["栄養食事指導", "服薬指導", "退院時の生活指導"];
const KIND_OF: Partial<Record<Role, GuideKind>> = { 管理栄養士: "栄養食事指導", 薬剤師: "服薬指導", 看護師: "退院時の生活指導" };

export type GuidanceInput = Omit<GuidanceRecord, "id" | "patientId" | "by" | "at">;

/**
 * 指導の記録: what was actually explained, to whom and for how long. It answers the doctor's 指導の依頼
 * (closing it) and goes into the chart as the writer's note. The fee schedule's limits are counted in code.
 */
export function GuideRecordPanel({ role, entries, records, today, onSave }: { role: Role; entries: OrderEntry[]; records: GuidanceRecord[]; today: CalendarDate; onSave: (r: GuidanceInput) => void }) {
  const [kind, setKind] = useState<GuideKind>(KIND_OF[role] ?? "退院時の生活指導");
  const [heard, setHeard] = useState<GuidanceRecord["heard"] | null>(null);
  const [minutes, setMinutes] = useState("");
  const [text, setText] = useState("");
  const [eligible, setEligible] = useState<GuidanceRecord["eligible"] | null>(null);
  const open = openRequests(entries, kind, records);
  const mins = minutes.trim() ? Number(minutes) : null;
  const earlierNutrition = records.filter((r) => r.kind === "栄養食事指導" && r.eligible && r.eligible !== "対象外（算定しない）");
  const dow = (d: number) => new Date(Date.UTC(today.y, today.m - 1, today.d + d)).getUTCDay();
  const notes =
    kind === "栄養食事指導" && eligible && eligible !== "対象外（算定しない）"
      ? [nutritionCountNote(earlierNutrition.map((r) => r.at.day), 0, dow), nutritionTimeNote(mins, earlierNutrition.length)].filter((x): x is string => !!x)
      : [];
  const problems = [...guidanceProblems({ text, minutes: mins }), ...(heard ? [] : ["相手"]), ...(kind === "栄養食事指導" && !eligible ? ["算定の対象"] : [])];
  const field = "rounded border border-rule bg-paper px-2 py-1";
  return (
    <div className="space-y-3 text-[13px]">
      <TabChoice label="指導の種類" options={KINDS.map((k) => ({ value: k, label: k }))} value={kind} onChange={(v) => setKind(v as GuideKind)} />
      <div className="rounded-md border border-rule-soft bg-paper p-2 text-xs">
        <b>医師からの依頼</b>
        {open.length ? (
          <ul className="mt-1 space-y-0.5">
            {open.map((e) => (
              <li key={e.id}>
                {formatShort(addDays(today, e.day))} {e.time} {e.author}
                {e.order.type === "procedure" && e.order.guide?.note ? `：${e.order.guide.note}` : ""}
              </li>
            ))}
            <li className="text-ink-soft">記録すると、この依頼は済みになります。</li>
          </ul>
        ) : (
          <span className="ml-2 text-ink-faint">開いている依頼はありません（依頼なしでも記録できます）。</span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        相手
        <TabChoice label="指導の相手" options={WHO_HEARD.map((w) => ({ value: w, label: w }))} value={heard ?? ""} onChange={(v) => setHeard(v as GuidanceRecord["heard"])} />
        <label className="flex items-center gap-1">
          時間
          <input value={minutes} onChange={(e) => setMinutes(e.target.value.replace(/[^0-9]/g, ""))} inputMode="numeric" aria-label="指導の時間（分）" className={`${field} nums w-14 text-right`} />分
        </label>
      </div>
      {kind === "栄養食事指導" && (
        <div className="flex flex-wrap items-center gap-2">
          算定の対象
          <TabChoice label="入院栄養食事指導料の対象" options={NUTRITION_ELIGIBLE.map((x) => ({ value: x, label: x }))} value={eligible ?? ""} onChange={(v) => setEligible(v as GuidanceRecord["eligible"])} />
        </div>
      )}
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} aria-label="指導の内容" placeholder="説明した内容の要点（例：塩分6g未満の献立。家族が調理するため妻にも説明。次回は外食の選び方）" className={`${field} w-full`} />
      {notes.map((n) => (
        <p key={n} className="text-xs font-bold text-yamabuki">
          {n}このまま記録すると、算定には入りません。
        </p>
      ))}
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={problems.length > 0}
          onClick={() => {
            onSave({ kind, heard: heard!, minutes: mins, text: text.trim(), answers: open.map((e) => e.id), ...(kind === "栄養食事指導" ? { eligible: eligible! } : {}) });
            setText("");
            setMinutes("");
            setHeard(null);
          }}
          className="rounded-md bg-ai px-4 py-1.5 font-bold text-white disabled:opacity-40"
        >
          記録する
        </button>
        {problems.length > 0 && <span className="text-xs text-ink-faint">まだ：{problems.join("・")}</span>}
      </div>
      {records.length > 0 && (
        <div className="text-xs">
          <b className="text-ink-soft">これまでの記録</b>
          <ul className="mt-1 space-y-1">
            {records.map((r) => (
              <li key={r.id} className="border-l-2 border-ai/40 pl-2">
                <span className="nums text-ink-faint">
                  {formatShort(addDays(today, r.at.day))} {r.at.time}　{r.by}
                </span>
                　{r.kind}（{r.heard}・{r.minutes ?? "？"}分）{r.text}
              </li>
            ))}
          </ul>
        </div>
      )}
      {kind === "栄養食事指導" && (
        <p className="text-[11px] text-ink-faint">
          回数と時間の基準：{GUIDANCE_SOURCE.label}／{GUIDANCE_TIME_SOURCE.label}。対象かどうかは記録する人が選びます。
        </p>
      )}
    </div>
  );
}
