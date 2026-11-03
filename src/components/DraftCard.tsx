"use client";

import { AlertOctagon, CheckCircle2, HelpCircle, Info, RotateCcw, Trash2 } from "lucide-react";
import { effectiveRoute, isReady, procArea, procSchedule, ratePlan, resolvedCollect, resolvedStopTarget, type CheckContext, type Draft, type Issue } from "@/lib/drafts";
import { drugName, durationText, labName, procName, scheduleLabel } from "@/lib/format";
import { anyDrugName, findLab } from "@/lib/master";
import { AREA_LABEL, consultText, findProc, findProcDrug, guideText, hdText, leaveText, moveText, procScheduleText, rehabText, txText } from "@/lib/procedures";
import { findOralDrug } from "@/lib/master";
import { perDoseOf, timingName } from "@/lib/rx";
import { findPhysio, findRegion } from "@/lib/exams";

interface Props {
  draft: Draft;
  issues: Issue[];
  ctx: CheckContext;
  onApply: (next: Draft) => void;
  onRemove: () => void;
  /** Put the words back into the instruction box (only while that box is shown). */
  onRedo?: () => void;
  /** Rp number for an injection or prescription (Rp1, Rp2 … within its kind). */
  rp?: number;
}

const KIND_LABEL: Record<Draft["kind"], string> = { injection: "注射", lab: "検体検査", procedure: "処置", prescription: "内服", extend: "延長", imaging: "画像検査", physio: "生理検査", stop: "中止", unclear: "聞き取れず" };

/** One order draft: what was understood, then the checks with choices for the doctor. */
export function DraftCard({ draft, issues, ctx, onApply, onRemove, onRedo, rp }: Props) {
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
          {rp ? ` Rp${rp}` : ""}
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
          {onRedo && (
            <button type="button" onClick={onRedo} title="言い直す（指示の欄に戻す）" className="rounded p-1 text-ink-faint hover:bg-paper hover:text-ink">
              <RotateCcw size={14} />
            </button>
          )}
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
            <IssueRow key={i.key} issue={i} draft={draft} onApply={onApply} onRemove={onRemove} canRedo={!!onRedo} />
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

function IssueRow({ issue, draft, onApply, onRemove, canRedo }: { issue: Issue; draft: Draft; onApply: (d: Draft) => void; onRemove: () => void; canRedo: boolean }) {
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
        <div className="mt-1 ml-5 text-[11px] text-ink-soft">
          {canRedo ? "↺ で指示の欄に戻して、言い直してください。" : draft.kind === "injection" || draft.kind === "prescription" ? "この下書きを消して（ごみ箱）、上のタブで入れ直してください。" : "この下書きを消して（ごみ箱）、右のツールで入れ直してください。"}
        </div>
      )}
    </li>
  );
}

function Summary({ draft, ctx }: { draft: Draft; ctx: CheckContext }) {
  if (draft.kind === "unclear") return <p className="text-ink-soft">この部分はオーダにできませんでした。</p>;

  if (draft.kind === "extend") {
    const o = ctx.activeOrders.find((x) => x.id === draft.targetOrderId);
    return (
      <p>
        <b>{draft.addDays}日延長</b>
        {o && <span className="block text-xs text-ink-soft">{ctx.describe(o)}</span>}
      </p>
    );
  }

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

  if (draft.kind === "imaging" || draft.kind === "physio") {
    const w = draft.when;
    const when = !w.priority ? "日時？" : w.priority === "至急" ? "至急" : `${ctx.fmtDay(w.day ?? 0)} ${w.time ?? ""} 予約`;
    const head =
      draft.kind === "imaging"
        ? [draft.modality ?? "種類？", draft.region ? (findRegion(draft.region)?.name ?? draft.region) : draft.regionSaid ? `${draft.regionSaid}（？）` : "部位？", draft.contrast].filter(Boolean).join("　")
        : draft.test
          ? (findPhysio(draft.test)?.name ?? draft.test)
          : `${draft.said || "検査"}（？）`;
    const sub =
      draft.kind === "imaging"
        ? [draft.views?.join("＋"), when, draft.transport ?? (draft.modality === "ポータブルX線" ? "病室" : "移動？")]
        : [when, draft.place ?? "場所？", draft.place === "検査室" ? (draft.transport ?? "移動？") : null];
    return (
      <div>
        <div className="font-bold">{head}</div>
        <div className="text-xs text-ink-soft">{sub.filter(Boolean).join("　")}</div>
        <div className="text-xs text-ink-soft">目的：{draft.purpose ?? <span className="text-yamabuki">？</span>}</div>
        {draft.acks.length > 0 && <span className="rounded bg-yamabuki-soft px-1 text-[11px] text-yamabuki">{draft.acks.join("・")}</span>}
      </div>
    );
  }

  if (draft.kind === "prescription") {
    const prn = draft.timings !== null && draft.timings.length === 0;
    const times = draft.timings?.length ?? 0;
    return (
      <div>
        <table className="w-full text-[13px]">
          <tbody>
            {draft.items.map((it, i) => {
              const m = it.drugCode ? findOralDrug(it.drugCode) : undefined;
              const per = draft.timings ? perDoseOf(it, prn ? 1 : times) : null;
              return (
                <tr key={i} className="align-baseline">
                  <td className="w-8 text-[11px] text-ink-faint">{i === 0 ? "Rp" : ""}</td>
                  <td className="font-bold">{m ? `${m.name} ${m.strength}` : <span className="text-shu">{it.said}（？）</span>}</td>
                  <td className="whitespace-nowrap text-right">
                    1回{per ?? "？"}
                    {m?.unit ?? ""}
                    {!prn && per !== null && times > 0 && (
                      <span className="block text-[11px] text-ink-faint">
                        1日{it.daily ?? Math.round(per * times * 100) / 100}
                        {m?.unit}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="mt-0.5 text-xs text-ink-soft">
          {draft.timings === null ? "用法？" : prn ? `頓用 ${draft.prn ?? "条件？"}${draft.maxPerDay ? `（1日${draft.maxPerDay}回まで）` : ""}` : `1日${draft.timings.length}回　${timingName(draft.timings)}`}
          {!prn && `　${draft.days ? `${draft.days}日分` : "日数？"}`}
          {!prn && `　${draft.category ?? "定期・臨時？"}`}
          {draft.acks.length > 0 && <span className="ml-2 rounded bg-yamabuki-soft px-1 text-yamabuki">{draft.acks.join("・")}</span>}
        </div>
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
    if (m?.needs.includes("hd")) head.push(draft.hd ? `${draft.hd.method}（${draft.hd.purpose}）` : "条件？");
    const parts: string[] = [];
    if (m?.needs.includes("hd") && draft.hd) parts.push(hdText(draft.hd));
    if (m?.needs.includes("tx")) parts.push(draft.tx ? txText(draft.tx) : "製剤？");
    if (m?.needs.includes("rehab")) parts.push(draft.rehab ? rehabText(draft.rehab) : "区分？");
    if (m?.needs.includes("consult")) parts.push(draft.consult ? consultText(draft.consult) : "依頼先？");
    if (m?.needs.includes("leave")) parts.push(draft.leave ? leaveText(draft.leave, ctx.fmtDay) : "日時？");
    if (m?.needs.includes("guide")) parts.push(draft.guide ? guideText(draft.guide) : "種類？");
    if (m?.needs.includes("move")) parts.push(draft.move ? moveText(draft.move) : "移動先？");
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

