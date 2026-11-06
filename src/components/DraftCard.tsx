"use client";
import { InjectionDraftEditor } from "./InjectionDraftEditor";
import { insulinDoseText } from "@/lib/insulin-doses";

import { displayText } from "@/lib/display-text";
import { dietLabel } from "@/lib/diet";

import { draftLine, draftSourceText, prescriptionUsage } from "@/lib/draft-line";
import { useId, useState } from "react";
import { AlertOctagon, CheckCircle2, HelpCircle, Info, RotateCcw, Trash2 } from "lucide-react";
import { applyChoice, effectiveRoute, isReady, procArea, procSchedule, ratePlan, resolvedCollect, resolvedStopTarget, type CheckContext, type Draft, type Issue } from "@/lib/drafts";
import { drugName, durationText, labName, procName, scheduleLabel } from "@/lib/format";
import { anyDrugName, findLab } from "@/lib/master";
import { AREA_LABEL, consultText, findProc, findProcDrug, guideText, hdText, leaveText, moveText, procScheduleText, rehabText, txText } from "@/lib/procedures";
import { findOralDrug } from "@/lib/master";
import { perDoseOf } from "@/lib/rx";
import { findPhysio, findRegion, viewsText } from "@/lib/exams";
import { opdPurposeOf } from "@/lib/opd-booking";
import { DrugMarks } from "./DrugMarks";

import { ImagingDraftEditor } from "./ImagingConsent";

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

const KIND_LABEL: Record<Draft["kind"], string> = { injection: "注射", lab: "検体検査", procedure: "処置", prescription: "内服", extend: "延長", imaging: "画像検査", physio: "生理検査", stop: "中止", unclear: "聞き取れず", diet: "食事", "opd-booking": "外来予約" };

/** One order draft: what was understood, then the checks with choices for the doctor. */
export function DraftCard({ draft, issues, ctx, onApply, onRemove, onRedo, rp, bare }: Props & { bare?: boolean }) {
  // Open from the start when something still has to be filled in (目的・同意書…), so the fields are right there.
  const [open, setOpen] = useState(() => issues.some((i) => i.level !== "info"));
  const issueKey = `${draft.id}:${issues.filter((i) => i.level !== "info").map((i) => i.key).join(",")}`;
  const [previousIssues, setPreviousIssues] = useState(issueKey);
  if (previousIssues !== issueKey) {
    setPreviousIssues(issueKey);
    if (issues.some((i) => i.level !== "info")) setOpen(true);
  }
  const detailId = useId();
  const ready = isReady(issues);
  const blocking = issues.filter((i) => i.level !== "info");
  const infos = issues.filter((i) => i.level === "info");

  return (
    // An order below the note is boxed, so it never reads as text of the note (ユーザー 2026-11-06).
    <article className={`text-[13px] leading-relaxed pointer-coarse:text-[16px] ${bare ? "border-t border-ai/15 first:border-t-0" : "my-1 rounded-md border border-ai/40 bg-ai-soft/20"}`}>
      <div className="flex flex-wrap items-start gap-1 px-2 py-1">
        <button id={`draft-line-${draft.id}`} type="button" aria-expanded={open} aria-controls={detailId} onClick={() => setOpen((value) => !value)} className="nums min-w-[10rem] flex-1 whitespace-pre-wrap break-words text-left hover:bg-ai-soft/30">
          {draftLine(draft, ctx, rp)}
        </button>
        <button type="button" aria-label={ready ? "確定できます・詳細を開く" : `確認 ${blocking.length}件・理由を開く`} aria-expanded={open} aria-controls={detailId} onClick={() => setOpen((value) => !value)} className={`shrink-0 p-1 ${ready ? "text-wakatake" : "text-yamabuki"}`}>
          {ready ? <CheckCircle2 size={14} /> : <><AlertOctagon size={14} className="inline" /> 確認 {blocking.length}件・理由を開く</>}
        </button>
        <button type="button" onClick={onRemove} aria-label="この下書きを消す" title="この下書きを消す" className="shrink-0 p-1 text-ink-faint hover:text-shu"><Trash2 size={14} /></button>
      </div>
      {open && <div id={detailId} className="mx-2 mb-1 border-t border-ai/20 pt-1">
      <header className="flex items-center gap-2 px-3 py-1.5">
        <span className={`rounded px-1.5 py-0.5 text-[11px] font-bold ${draft.kind === "stop" ? "bg-shu-soft text-shu" : "bg-ai-soft text-ai"}`}>
          {draft.kind === "prescription" && draft.administration ? draft.administration.kind : KIND_LABEL[draft.kind]}
          {rp ? ` Rp${rp}` : ""}
        </span>
        <span className="truncate text-xs text-ink-faint" title="話した言葉">
          {displayText(draftSourceText(draft.sourceText) ? `「${draftSourceText(draft.sourceText)}」` : "")}
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

      {draft.kind === "lab" && blocking.length > 0 && (
        <ul className="space-y-2 px-3 pb-2">
          {blocking.map((i) => (
            <IssueRow key={i.key} issue={i} draft={draft} onApply={onApply} onRemove={onRemove} canRedo={!!onRedo} />
          ))}
        </ul>
      )}

      <div className="nums px-3 py-2">
        <Summary draft={draft} ctx={ctx} />
      </div>

      {draft.kind === "injection" && <InjectionDraftEditor draft={draft} onApply={onApply} />}
      {draft.kind === "imaging" && <ImagingDraftEditor draft={draft} onApply={onApply} />}
      {draft.kind !== "lab" && blocking.length > 0 && (
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
                <SourceLinks sources={i.sources} />
              </span>
            </li>
          ))}
        </ul>
      )}
      </div>}
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
      {issue.sources && issue.sources.length > 0 && (
        <div className="mt-1 ml-5 text-xs">
          <SourceLinks sources={issue.sources} />
        </div>
      )}
      {issue.input && <ReasonInput key={issue.key} input={issue.input} draft={draft} onApply={onApply} />}
      {issue.choices && issue.choices.length > 0 && (
        <div className="mt-1.5 ml-5 flex flex-wrap gap-1.5">
          {issue.choices.map((c) => (
            <button
              key={c.label}
              type="button"
              onClick={() => (c.remove ? onRemove() : onApply(applyChoice(draft, c)))}
              className="nums rounded-md border border-ai/40 bg-sheet px-2 py-1 text-left text-xs text-ai hover:bg-ai hover:text-white"
            >
              {c.label}
              {c.note && <span className="block text-[10px] opacity-75">{displayText(c.note)}</span>}
            </button>
          ))}
        </div>
      )}
      {(!issue.choices || issue.choices.length === 0) && !issue.input && !(draft.kind === "imaging" && ["purpose", "consent"].includes(issue.key)) && (
        <div className="mt-1 ml-5 text-[11px] text-ink-soft">
          {canRedo ? "↺ で指示の欄に戻して、言い直してください。" : "この下書きを消して（ごみ箱）、右のツールで入れ直してください。"}
        </div>
      )}
    </li>
  );
}

/** The documents an issue comes from (電子添文 on PMDA), each opened in a new tab. */
export function SourceLinks({ sources }: { sources?: { label: string; url: string }[] }) {
  if (!sources?.length) return null;
  return (
    <span className="ml-1 inline-flex flex-wrap gap-x-2">
      {sources.map((s) => (
        <a key={`${s.url}${s.label}`} href={s.url} target="_blank" rel="noreferrer" className="text-ai underline decoration-dotted underline-offset-2 hover:text-ink">
          {s.label}
        </a>
      ))}
    </span>
  );
}

/** The doctor's reason to go on (併用禁忌, or a 配合 the 電子添文 says not to make). Enter or the button keeps it on the draft. */
function ReasonInput({ input, draft, onApply }: { input: NonNullable<Issue["input"]>; draft: Draft; onApply: (d: Draft) => void }) {
  const [text, setText] = useState("");
  const done = () => text.trim() && onApply(input.apply(draft, text));
  return (
    <div className="mt-1.5 ml-5 flex flex-wrap gap-1.5">
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.nativeEvent.isComposing) {
            e.preventDefault();
            done();
          }
        }}
        placeholder={input.placeholder}
        aria-label={input.placeholder}
        className="min-w-48 flex-1 rounded border border-rule bg-sheet px-2 py-1 text-xs outline-none focus:border-ai"
      />
      <button type="button" disabled={!text.trim()} onClick={done} className="rounded-md border border-ai/40 bg-sheet px-2 py-1 text-xs text-ai hover:bg-ai hover:text-white disabled:opacity-40">
        {input.button}
      </button>
    </div>
  );
}

function Summary({ draft, ctx }: { draft: Draft; ctx: CheckContext }) {
  if (draft.kind === "unclear") return <p className="text-ink-soft">この部分はオーダにできませんでした。</p>;
  if (draft.kind === "diet") {
    const d = draft.diet;
    return (
      <div>
        <div className="font-bold">{dietLabel({ ...d, id: "", by: "", at: { day: 0, time: "" } })}</div>
        <div className="text-xs text-ink-soft">
          {displayText(d.from.day === 0 ? "今日" : d.from.day === 1 ? "明日" : "明後日")}の{displayText(d.from.meal)}食から{d.comment ? `　${d.comment}` : ""}
        </div>
      </div>
    );
  }

  if (draft.kind === "opd-booking") {
    const when = draft.day === null ? "日付？" : `${ctx.fmtDay(draft.day)} ${draft.slot === "時刻" ? (draft.time ?? "時刻？") : (draft.slot ?? "午前・午後？")}`;
    return (
      <div>
        <div className="font-bold">
          {draft.dept ?? <span className="text-shu">科？</span>}
          {draft.doctor && <span className="ml-1 font-normal text-ink-soft">（{displayText(draft.doctor)}）</span>}
          <span className="ml-2">{when}</span>
        </div>
        <div className="text-xs text-ink-soft">{opdPurposeOf(draft) || "目的？"}{displayText(draft.note.trim() ? `　${draft.note.trim()}` : "")}</div>
      </div>
    );
  }

  if (draft.kind === "extend") {
    const o = ctx.activeOrders.find((x) => x.id === draft.targetOrderId);
    return (
      <p>
        <b>{draft.addDays > 0 ? `${draft.addDays}日延長` : `${-draft.addDays}日短縮`}</b>
        {o && <span className="block text-xs text-ink-soft">{ctx.describe(o)}</span>}
      </p>
    );
  }

  if (draft.kind === "stop") {
    const target = resolvedStopTarget(draft, ctx);
    const o = target ? ctx.activeOrders.find((x) => x.id === target) : undefined;
    return (
      <p>
        <b>{draft.procCode ? procName(draft.procCode) : draft.drugCode ? anyDrugName(draft.drugCode) : draft.said}</b> を中止{draft.effectiveDay !== undefined && `（${draft.effectiveDay === 0 ? "今日" : `${draft.effectiveDay}日後`}から）`}
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
              <DrugMarks codes={[it.drugCode]} />
              <span className="ml-1">{draft.insulinDoses ? insulinDoseText(draft.insulinDoses) : `${it.amount ?? "？"}${it.unit ?? ""}`}</span>
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
        ? [draft.modality ?? "種類？", draft.region ? `${findRegion(draft.region)?.sided ? (draft.side ?? "左右？") : ""}${findRegion(draft.region)?.name ?? draft.region}` : draft.regionSaid ? `${draft.regionSaid}（？）` : "部位？", draft.contrast].filter(Boolean).join("　")
        : draft.test
          ? (findPhysio(draft.test)?.name ?? draft.test)
          : `${draft.said || "検査"}（？）`;
    const sub =
      draft.kind === "imaging"
        ? [draft.views?.length ? viewsText(draft.views) : null, draft.position, draft.ct?.mode && draft.ct.mode !== "通常" ? draft.ct.mode : null, draft.ct?.phases?.join("・"), draft.mri?.sequences.join("・"), draft.note, when, draft.transport ?? (draft.modality === "ポータブルX線" ? "病室" : "移動？")]
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
                  <td className="font-bold">
                    {m ? `${m.name} ${m.strength}` : <span className="text-shu">{it.said}（？）</span>}
                    <DrugMarks codes={[it.drugCode]} />
                  </td>
                  <td className="whitespace-nowrap text-right">
                    {draft.administration ? "総量" : "1回"}{per ?? "？"}
                    {m?.unit ?? ""}
                    <span className="ml-2">{prescriptionUsage(draft)}</span>
                    {!prn && per !== null && times > 0 && <span className="ml-2 text-[11px] text-ink-faint">（1日{it.daily ?? Math.round(per * times * 100) / 100}{m?.unit}）</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="mt-0.5 text-xs text-ink-soft">
          {!prn && `　${draft.category ?? "定期・臨時？"}`}
          {draft.acks.length > 0 && <span className="ml-2 rounded bg-yamabuki-soft px-1 text-yamabuki">{draft.acks.join("・")}</span>}
        </div>
        {draft.onePack && <div className="text-xs text-ink-soft">一包化</div>}
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

