import { defaultSliding } from "./insulin";
import { effectiveRoute, ratePlan, resolvedCollect, type CheckContext, type Draft } from "./drafts";
import { drugName, durationText, imagingDraftText, labCardText, oralName, procName, scheduleLabel } from "./format";
import { anyDrugName, findDrug, findOralDrug } from "./master";
import { perDoseOf, timingName, dischargeStartDay } from "./rx";
import { opdPurposeOf } from "./opd-booking";
import { dietLabel } from "./diet";
import { findPhysio } from "./exams";
import { procSchedule } from "./drafts";
import { consultText, guideText, hdText, leaveText, moveText, rehabText, txText, procScheduleText } from "./procedures";



const LABEL: Record<Draft["kind"], string> = { injection: "注射", prescription: "内服", lab: "検体検査", procedure: "処置", imaging: "画像検査", physio: "生理検査", stop: "中止", extend: "延長", unclear: "聞き取れず", diet: "食事", "opd-booking": "外来予約" };

/** Current draft values, never the original dictation in place of an edited order. No checks or mutations. */
export function draftLine(d: Draft, ctx: CheckContext, rp?: number): string {
  let text: string;
  switch (d.kind) {
    case "injection": {
      const p = ratePlan(d);
      text = [d.items.map(i => `${i.drugCode ? d.sliding ? findDrug(i.drugCode)?.name ?? i.drugCode : drugName(i.drugCode) : `${i.said}（？）`} ${d.sliding ? "" : i.amount ?? "？"}${d.sliding ? "" : i.unit ?? ""}`).join(" ＋ "), effectiveRoute(d) ?? "経路？", d.sliding ? `スライディングスケール（${d.sliding.times.join() === defaultSliding().times.join() ? "毎食前・眠前" : d.sliding.times.join("・")}）` : d.schedule ? scheduleLabel(d.schedule, d.items[0]?.drugCode) : "回数？", p.minutesPerDose !== null ? `1回${durationText(p.minutesPerDose)}` : null, p.rateMlPerH !== null ? `${p.rateMlPerH}mL/時` : null, `${ctx.fmtDay(d.start.day ?? 0)} ${d.start.time ?? "指示受け後"}から`, d.schedule?.kind === "once" ? null : d.days ? `${d.days}日間` : "日数？"].filter(Boolean).join("　");
      break;
    }
    case "prescription": {
      const n = d.timings?.length || 1;
      text = [d.items.map(i => `${i.drugCode ? oralName(i.drugCode) : `${i.said}（？）`} 1回${d.timings === null ? "？" : perDoseOf(i, n) ?? "？"}${i.drugCode ? findOralDrug(i.drugCode)?.unit ?? "" : ""}`).join(" ＋ "), d.timings === null ? "用法？" : d.timings.length ? `1日${n}回 ${timingName(d.timings)}` : `頓用 ${d.prn ?? "条件？"}${d.maxPerDay ? `（1日${d.maxPerDay}回まで）` : ""}`, d.days ? `${d.days}日分` : null, d.category, d.category === "退院時" ? (dischargeStartDay(d, ctx) === null ? "退院日から" : `${ctx.fmtDay(dischargeStartDay(d, ctx)!)}から`) : `${ctx.fmtDay(d.start.day ?? 0)} ${d.start.timing ?? ""}から`].filter(Boolean).join("　");
      break;
    }
    case "lab": {
      const r = resolvedCollect(d, ctx);
      const codes = d.tests.map((t) => t.code);
      const items = codes.every((c): c is string => !!c) ? labCardText({ codes }, 8) : d.tests.map((t) => t.code ?? `${t.said}（？）`).join("・");
      const when = d.collect.when === "now" ? "今すぐ" : r ? `${ctx.fmtDay(r.day)} ${r.time}` : "採取日時？";
      const urgent = d.priority === "至急" || d.tests.some((t) => t.urgent);
      text = `${items}（${urgent ? "至急・" : ""}${when}）`;
      break;
    }
    case "imaging": text = `${imagingDraftText(d)}　${d.when.priority === "至急" ? "至急" : `${ctx.fmtDay(d.when.day ?? 0)} ${d.when.time ?? "日時？"}`}`; break;
    case "physio": text = `${d.test ? findPhysio(d.test)?.name ?? d.test : d.said}　${d.when.priority === "至急" ? "至急" : `${ctx.fmtDay(d.when.day ?? 0)} ${d.when.time ?? "日時？"}`}`; break;
    case "procedure": {
      if (d.leave) return leaveText({ ...d.leave, note: "" }, ctx.fmtDay).replace(/\s+/g, " ").trim();
      const s = procSchedule(d);
      text = [d.code ? procName(d.code) : `${d.said}（？）`, d.site, d.hd ? hdText(d.hd) : null, d.tx ? txText(d.tx) : null, d.rehab ? rehabText(d.rehab) : null, d.consult ? consultText(d.consult) : null, d.leave ? leaveText(d.leave, ctx.fmtDay) : null, d.guide ? guideText(d.guide) : null, d.move ? moveText(d.move) : null, d.o2.device ? `${d.o2.device} ${d.o2.lpm ?? "？"}L/分` : null, s ? procScheduleText(s) : "回数？", `${ctx.fmtDay(d.start.day ?? 0)} ${d.start.time ?? "指示受け後"}から`, d.days ? `${d.days}日間` : null].filter(Boolean).join("　"); break;
    }
    case "stop": text = `${d.procCode ? procName(d.procCode) : d.drugCode ? anyDrugName(d.drugCode) : d.said} を中止`; break;
    case "extend": { const o = ctx.activeOrders.find(o => o.id === d.targetOrderId); text = `${o ? ctx.describe(o) : "対象？"} ${d.addDays}日延長`; break; }
    case "diet": text = `${dietLabel({ ...d.diet, id: "", by: "", at: { day: 0, time: "" } })}　${ctx.fmtDay(d.diet.from.day)}の${d.diet.from.meal}食から`; break;
    case "opd-booking": text = `${d.dept ?? "科？"} ${d.doctor ?? ""}　${d.day === null ? "日付？" : ctx.fmtDay(d.day)} ${d.slot === "時刻" ? d.time ?? "時刻？" : d.slot ?? "午前・午後？"}　${opdPurposeOf(d) || "目的？"}　${d.note.trim()}`; break;
    case "unclear": text = `${d.sourceText}（${d.reason}）`; break;
  }
  return `${LABEL[d.kind]}${rp && (d.kind === "injection" || d.kind === "prescription") ? ` Rp${rp}` : ""} ${text}${d.comment ? `　${d.comment}` : ""}`.replace(/\s+/g, " ").trim();
}

/** Manual entry markers are not words dictated by the doctor. */
export function draftSourceText(source: string): string | null {
  const text = source.replace(/^[（(](?:Rp 入力|マスターから選択(?:・混注)?|[^）)]*の欄から)[）)]\s*/, "").trim();
  return text || null;
}

export function prescriptionUsage(d: Extract<Draft, { kind: "prescription" }>): string {
  if (d.once) return "1回だけ・今すぐ";
  return [d.timings === null ? "用法？" : d.timings.length ? `1日${d.timings.length}回 ${timingName(d.timings)}` : `頓用 ${d.prn ?? "条件？"}${d.maxPerDay ? `（1日${d.maxPerDay}回まで）` : ""}`, d.days ? `${d.days}日分` : null].filter(Boolean).join("　");
}
