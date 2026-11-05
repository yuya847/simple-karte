import type { InjectionOrder, SlidingScale } from "./types";
import { findDrug } from "./master";
import { validDoseTime } from "./inj-entry";
export const isInsulin = (o: Pick<InjectionOrder, "items">) => o.items.length === 1 && findDrug(o.items[0].drugCode)?.category === "インスリン";
export const SLIDING_HINT = "架空の病院の取り決め：初期表は199以下0、200〜249は2、250〜299は4、300〜349は6、350以上8単位・医師へ連絡。医師が患者ごとに表と測定時刻を確かめて直してください。品目も架空で薬価はありません。";
export function defaultSliding(): SlidingScale { return { times: ["07:30", "11:30", "17:30", "21:00"], rows: [{from:0,to:199,units:0},{from:200,to:249,units:2},{from:250,to:299,units:4},{from:300,to:349,units:6},{from:350,to:null,units:8}], callAbove:350 }; }
export function slidingProblems(s: SlidingScale): string[] {
  const bad = !s.rows.length || s.rows.some((r,i) => !Number.isInteger(r.from) || r.from < 0 || !Number.isFinite(r.units) || r.units < 0 || (r.to !== null && (!Number.isInteger(r.to) || r.to < r.from)) || (i > 0 && (s.rows[i-1].to === null || r.from !== s.rows[i-1].to! + 1))) || s.rows[0]?.from !== 0 || s.rows.at(-1)?.to !== null;
  return [...(bad ? ["血糖範囲は0から上限なしまで、重複・抜けなく入力してください。単位は0以上です。"] : []), ...(!s.times.length || s.times.some(t => !validDoseTime(t) || t === "24:00") || new Set(s.times).size !== s.times.length ? ["測定時刻を重複なく入力してください。"] : []), ...(s.callAbove !== undefined && (!Number.isFinite(s.callAbove) || s.callAbove < 0) ? ["連絡する血糖値を0以上で入力してください。"] : [])];
}
export function slidingUnits(rows: SlidingScale["rows"], glucose: number): number | null {
  if (!Number.isInteger(glucose) || glucose < 0 || slidingProblems({ rows, times:["07:30"] }).length) return null;
  const r = rows.find(r => glucose >= r.from && (r.to === null || glucose <= r.to));
  return r?.units ?? null;
}
export type InsulinChange = { units: number } | { sliding: SlidingScale };
export function adjustInsulin(order: InjectionOrder, change: InsulinChange, today: number): { stop: InjectionOrder; next: InjectionOrder } {
  if (!isInsulin(order) || !Number.isInteger(today) || order.start.day > today) throw new Error("今日投与中のインスリンを選んでください。");
  if ("units" in change && (!Number.isFinite(change.units) || change.units <= 0 || order.sliding)) throw new Error("固定量は0より大きい単位で入力してください。");
  if ("sliding" in change && (!order.sliding || slidingProblems(change.sliding).length)) throw new Error("スケールを確認してください。");
  const boundary = today + 1;
  const endDay = order.end ? order.end.day + (Number(order.end.time.slice(0,2))*60 + Number(order.end.time.slice(3)))/1440 : order.days ? order.start.day + order.days : Infinity;
  if (endDay <= today) throw new Error("今日の投与予定がありません。");
  const stop = {...order, end:{day:today,time:"24:00"}, days:boundary-order.start.day};
  const next: InjectionOrder = {...order, items:order.items.map(i => ({...i, amount:"units" in change ? change.units : 0})), start:{day:boundary,time:order.doseTimes?.[0] ?? order.start.time}, end:endDay <= boundary ? undefined : order.end, days:order.days ? Math.max(1,order.start.day+order.days-boundary) : endDay <= boundary ? 1 : undefined};
  if ("sliding" in change) { next.sliding = structuredClone(change.sliding); next.doseTimes = [...change.sliding.times]; next.schedule = {kind:"per_day",count:change.sliding.times.length}; next.start.time = [...change.sliding.times].sort()[0]; }
  return {stop,next};
}

/** Chart update stays outside WardApp; the replaced instruction remains available in the record. */
export function insulinAdjustmentEntries(entry: import("./types").OrderEntry, change: InsulinChange, today: number, id:string, by:string, time:string): import("./types").OrderEntry {
 if(entry.status !== "有効" || entry.order.type !== "injection") throw new Error("有効な注射を選んでください。");
 const {next}=adjustInsulin(entry.order,change,today);
 return {kind:"order",id,day:today,time,author:by,status:"有効",order:{...next,replaces:entry.id}};
}
