"use client";
import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import type { Draft } from "./drafts";
import type { OrderEntry } from "./types";
import type { NurseSummary } from "./nursing-summary";
import { scenarioStorageKey } from "./scenarios/mode";
import { workspaceOn } from "./workspace";
import { pendingChartDrafts } from "./confirmed-drafts";

type Chart = { added: OrderEntry[]; drafts: Draft[]; confirmedDraftIds?: string[] };
const moving = (d: Draft) => d.kind === "procedure" && d.code === "PROC-MOVE";
const moveOrder = (e: OrderEntry) => e.order.type === "procedure" && e.order.code === "PROC-MOVE";
export function transferCharts(charts: Record<string, Chart>): Record<string, Chart> {
  return Object.fromEntries(Object.entries(charts).map(([id,c]) => [id, { added: c.added.filter(moveOrder), drafts: c.drafts.filter(moving), confirmedDraftIds: c.confirmedDraftIds ?? [] }]).filter(([,c]) => { const x=c as Chart; return x.added.length || x.drafts.length || x.confirmedDraftIds?.length; }));
}
export function restoreTransferCharts<T extends Chart>(all: Record<string,T>, saved: Record<string,Chart>, blank: () => T): Record<string,T> {
  const next={...all};
  for(const [id,s] of Object.entries(saved)) {
    const c=next[id] ?? blank();
    next[id]={...c, added:[...c.added.filter(e=>!s.added.some(x=>x.id===e.id)),...s.added], drafts:[...c.drafts.filter(d=>!moving(d)),...s.drafts], confirmedDraftIds:[...new Set([...(c.confirmedDraftIds ?? []),...(s.confirmedDraftIds ?? [])])]};
  }
  for(const [id,c] of Object.entries(next)) next[id]={...c,drafts:pendingChartDrafts(c.drafts,next[id.split("|")[0]]?.confirmedDraftIds)};
  return next;
}
/** Same-day standalone storage; configured shared workspaces remain authoritative. */
export function useTransferSummaryPersistence<T extends Chart>(charts: Record<string,T>, summaries: NurseSummary[], day: string|null, setCharts: Dispatch<SetStateAction<Record<string,T>>>, setSummaries: Dispatch<SetStateAction<NurseSummary[]>>, blank: () => T) {
  const initial=useRef({setCharts,setSummaries,blank});
  const skip=useRef(true);
  const key=scenarioStorageKey("simple-karte:transfer-summaries");
  useEffect(()=>{
    if(workspaceOn() || !day) return;
    skip.current=true;
    try {
      const saved=JSON.parse(localStorage.getItem(key) ?? "null");
      if(saved?.day!==day || !saved.charts || !Array.isArray(saved.summaries)) return;
      initial.current.setCharts(all=>restoreTransferCharts(all,saved.charts,initial.current.blank));
      initial.current.setSummaries(all=>[...all.filter(s=>!saved.summaries.some((x:NurseSummary)=>x.id===s.id)),...saved.summaries]);
    } catch { /* Keep the session usable if local storage is unavailable. */ }
  },[key,day]);
  useEffect(()=>{
    if(workspaceOn() || !day) return;
    if(skip.current){skip.current=false;return;}
    try {localStorage.setItem(key,JSON.stringify({day,charts:transferCharts(charts),summaries}));} catch { /* Storage may be disabled. */ }
  },[key,day,charts,summaries]);
}
