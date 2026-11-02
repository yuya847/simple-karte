"use client";

import { AlertOctagon, CheckCircle2, HelpCircle, Info, RotateCcw, Trash2 } from "lucide-react";
import { effectiveRoute, isReady, procArea, procSchedule, ratePlan, resolvedCollect, resolvedStopTarget, type CheckContext, type Draft, type Issue } from "@/lib/drafts";
import { drugName, durationText, labName, procName, scheduleLabel } from "@/lib/format";
import { anyDrugName, findLab } from "@/lib/master";
import { AREA_LABEL, findProc, findProcDrug, procScheduleText } from "@/lib/procedures";

interface Props {
  draft: Draft;
  issues: Issue[];
  ctx: CheckContext;
  onApply: (next: Draft) => void;
  onRemove: () => void;
  onRedo: () => void;
}

const KIND_LABEL: Record<Draft["kind"], string> = { injection: "注射", lab: "検体検査", procedure: "処置", stop: "中止", unclear: "聞き取れず" };

/** One order draft: what was understood, then the checks with choices for the doctor. */
export function DraftCard({ draft, issues, ctx, onApply, onRemove, onRedo }: Props) {
  const ready = isReady(issues);
  const blocking = issues.filter((i) => i.level !== "info");
  const infos = issues.filter((i) => i.level === "info");

  return (
    <article
      className={`rounded-lg border bg-sheet text-[13px] ${
        ready ? "border-wakatake/40" : blocking.some((i) => i.level === "stop") ? "border-shu/50" : "border-yamabuki/50"
      }`}
    >
      <header className="flex items-center gap-2 border-b border-rule-soft px-3 py-1.5">
        <span className={`rounded px-1.5 py-0.5 text-[11px] font-bold ${draft.kind === "stop" ? "bg-shu-soft text-shu" : "bg-ai-soft text-ai"}`}>
          {KIND_LABEL[draft.kind]}
        </span>
        <span className="truncate text-xs text-ink-faint" title="話した言葉">
          「{draft.sourceText}」
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-1">
          {ready ? (
            <span className="flex items-center gap-1 text-xs text-wakatake">
              <CheckCircle2 size={14} />
              確定できます
            </span>
          ) : (
            <span className="text-xs text-yamabuki">確認 {blocking.length}件</span>
          )}
          <button type="button" onClick={onRedo} title="言い直す（指示の欄に戻す）" className="rounded p-1 text-ink-faint hover:bg-paper hover:text-ink">
            <RotateCcw size={14} />
          </button>
          <button type="button" onClick={onRemove} title="この下書きを消す" className="rounded p-1 text-ink-faint hover:bg-paper hover:text-shu">
            <Trash2 size={14} />
          </button>
        </span>
      </header>

      <div className="nums px-3 py-2">
        <Summary draft={draft} ctx={ctx} />
      </div>

      {blocking.length > 0 && (
        <ul className="space-y-2 px-3 pb-2">
          {blocking.map((i) => (
            <IssueRow key={i.key} issue={i} draft={draft} onApply={onApply} onRemove={onRemove} />
          ))}
        </ul>
      )}
      {infos.length > 0 && (
        <ul className="nums space-y-0.5 border-t border-rule-soft px-3 py-1.5 text-xs text-ink-soft">
          {infos.map((i) => (
            <li key={i.key} className="flex items-start gap-1.5">
              <Info size={12} className="mt-0.5 shrink-0 text-ink-faint" />
              <span>
                <b className="text-ink-faint">{i.title}</b>　{i.message === "速度" ? "" : i.message}
                {i.formula && <span className="ml-1 rounded bg-paper px-1">{i.formula}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

function IssueRow({ issue, draft, onApply, onRemove }: { issue: Issue; draft: Draft; onApply: (d: Draft) => void; onRemove: () => void }) {
  const stop = issue.level === "stop";
  return (
    <li className={`rounded-md px-2.5 py-2 ${stop ? "bg-shu-soft" : "bg-yamabuki-soft"}`}>
      <div className={`flex items-start gap-1.5 ${stop ? "text-shu" : "text-yamabuki"}`}>
        {stop ? <AlertOctagon size={14} className="mt-0.5 shrink-0" /> : <HelpCircle size={14} className="mt-0.5 shrink-0" />}
        <span className="text-ink">
          <b className={stop ? "text-shu" : "text-yamabuki"}>{issue.title}</b>　{issue.message}
        </span>
      </div>
      {issue.formula && <div className="nums mt-1 ml-5 inline-block rounded bg-sheet px-1.5 text-xs">{issue.formula}</div>}
      {issue.choices && issue.choices.length > 0 && (
        <div className="mt-1.5 ml-5 flex flex-wrap gap-1.5">
          {issue.choices.map((c) => (
            <button
              key={c.label}
              type="button"
              onClick={() => (c.remove ? onRemove() : c.apply && onApply(c.apply(draft)))}
              className="nums rounded-md border border-ai/40 bg-sheet px-2 py-1 text-left text-xs text-ai hover:bg-ai hover:text-white"
            >
              {c.label}
              {c.note && <span className="block text-[10px] opacity-75">{c.note}</span>}
            </button>
          ))}
        </div>
      )}
      {(!issue.choices || issue.choices.length === 0) && (
        <div className="mt-1 ml-5 text-[11px] text-ink-soft">↺ で指示の欄に戻して、言い直してください。</div>
      )}
    </li>
  );
}

function Summary({ draft, ctx }: { draft: Draft; ctx: CheckContext }) {
  if (draft.kind === "unclear") return <p className="text-ink-soft">この部分はオーダにできませんでした。</p>;

  if (draft.kind === "stop") {
    const target = resolvedStopTarget(draft, ctx);
    const o = target ? ctx.activeOrders.find((x) => x.id === target) : undefined;
    return (
      <p>
        <b>{draft.procCode ? procName(draft.procCode) : draft.drugCode ? anyDrugName(draft.drugCode) : draft.said}</b> を中止
        {o && <span className="block text-xs text-ink-soft">{ctx.describe(o)}</span>}
      </p>
    );
  }

  if (draft.kind === "injection") {
    const plan = ratePlan(draft);
    const route = effectiveRoute(draft);
    const parts = [
      route ?? "経路？",
      draft.schedule ? scheduleLabel(draft.schedule, draft.items[0]?.drugCode) : "回数？",
    ];
    if (route === "点滴静注") {
      if (plan.minutesPerDose !== null) parts.push(`1回${durationText(plan.minutesPerDose)}`);
      if (plan.rateMlPerH !== null) parts.push(`${plan.rateMlPerH}mL/時`);
      if (plan.minutesPerDose === null && plan.rateMlPerH === null) parts.push("速度？");
    }
    parts.push(`開始 ${ctx.fmtDay(draft.start.day ?? 0)} ${draft.start.time ?? "指示受け後"}`);
    if (draft.days) parts.push(`${draft.days}日間`);
    return (
      <div>
        <div className="font-bold">
          {draft.items.map((it, i) => (
            <span key={i}>
              {i > 0 && <span className="font-normal text-ink-faint"> ＋ </span>}
              {it.drugCode ? drugName(it.drugCode) : <span className="text-shu">{it.said}（？）</span>}
              <span className="ml-1">{it.amount ?? "？"}{it.unit ?? ""}</span>
            </span>
          ))}
        </div>
        <div className="text-xs text-ink-soft">{parts.join("　")}</div>
        {draft.comment && <div className="text-xs text-ink-soft">コメント：{draft.comment}</div>}
      </div>
    );
  }

  if (draft.kind === "procedure") {
    const m = draft.code ? findProc(draft.code) : undefined;
    const area = procArea(draft).area;
    const schedule = procSchedule(draft);
    const head = [m ? m.name : null];
    if (m?.needs.includes("o2")) head.push(`${draft.o2.device ?? "器具？"} ${draft.o2.lpm ?? "？"}L/分`);
    if (m?.needs.includes("site")) head.push(draft.site ?? "部位？");
    const parts: string[] = [];
    if (m?.needs.includes("depth")) parts.push(draft.depth ?? "深さ？");
    if (m?.needs.includes("area")) parts.push(area ? AREA_LABEL[area] : "範囲？");
    parts.push(schedule ? procScheduleText(schedule) : "回数？");
    const drug = m?.uses ?? (draft.drug?.code ? { code: draft.drug.code, amount: draft.drug.amount } : null);
    if (drug) {
      const pd = findProcDrug(drug.code);
      parts.push(`${pd?.name ?? drug.code} ${drug.amount ?? "？"}${pd?.unit ?? ""}`);
    }
    parts.push(`開始 ${ctx.fmtDay(draft.start.day ?? 0)} ${draft.start.time ?? "指示受け後"}`);
    if (draft.days) parts.push(`${draft.days}日間`);
    return (
      <div>
        <div className="font-bold">
          {m ? head.filter(Boolean).join("　") : <span className="text-shu">{draft.said}（？）</span>}
        </div>
        <div className="text-xs text-ink-soft">{parts.join("　")}</div>
        {draft.comment && <div className="text-xs text-ink-soft">コメント：{draft.comment}</div>}
      </div>
    );
  }

  const r = resolvedCollect(draft, ctx);
  return (
    <div>
      <div className="font-bold">
        {draft.tests.map((t, i) => (
          <span key={i}>
            {i > 0 && "、"}
            {t.code ? labName(t.code) : <span className="text-shu">{t.said}（？）</span>}
            {t.code && findLab(t.code)?.needs === "sets" && draft.cultureSets ? ` ${draft.cultureSets}セット` : ""}
          </span>
        ))}
      </div>
      <div className="text-xs text-ink-soft">{r ? `採取 ${ctx.fmtDay(r.day)} ${r.time}　${r.priority}` : "採取日時？"}</div>
      {draft.comment && <div className="text-xs text-ink-soft">コメント：{draft.comment}</div>}
    </div>
  );
}

