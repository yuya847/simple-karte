"use client";
import { useEffect, useRef } from 'react';
import { workspaceOn } from './workspace';
import { scenarioStorageKey } from './scenarios/mode';
import type { Surgery } from './surgery';
import type { NoteEntry } from './types';
import type { IoEntry } from './io-balance';

interface Records { surgeries:Surgery[]; notes:Record<string,NoteEntry[]>; io:IoEntry[] }
/** Keep the anesthesia desk usable on reload when a shared workspace is not configured. */
export function useAnesthesiaPersistence(records:Records, day:string|null, setSurgeries:(fn:(all:Surgery[])=>Surgery[])=>void, setNotes:(fn:(all:Record<string,NoteEntry[]>)=>Record<string,NoteEntry[]>)=>void, setIo:(fn:(all:IoEntry[])=>IoEntry[])=>void) {
  const initial=useRef({setSurgeries,setNotes,setIo});
  const skip=useRef(true);
  const key=scenarioStorageKey('simple-karte:anesthesia');
  useEffect(()=>{
    if(workspaceOn() || !day) return;
    try {
      const saved=JSON.parse(localStorage.getItem(key)??'null') as (Records & {day:string})|null;
      if(saved?.day!==day || !Array.isArray(saved.surgeries) || !Array.isArray(saved.io) || !saved.notes) return;
      initial.current.setSurgeries(all=>all.map(s=>saved.surgeries.find(x=>x.id===s.id)??s));
      initial.current.setNotes(all=>{const next={...all};for(const [pid,notes] of Object.entries(saved.notes)) next[pid]=[...(next[pid]??[]).filter(n=>!n.id?.startsWith('anesthesia:')),...notes];return next;});
      initial.current.setIo(all=>[...all.filter(e=>!e.id.startsWith('anesthesia:')),...saved.io]);
    } catch { /* An unavailable local store leaves the desk usable for this session. */ }
  },[key,day]);
  useEffect(()=>{
    if(workspaceOn() || !day) return;
    if(skip.current){skip.current=false;return;}
    try { localStorage.setItem(key,JSON.stringify({day,surgeries:records.surgeries.filter(s=>s.anesthesiaCase),notes:Object.fromEntries(Object.entries(records.notes).map(([pid,notes])=>[pid,notes.filter(n=>n.id?.startsWith('anesthesia:'))])),io:records.io.filter(e=>e.id.startsWith('anesthesia:'))})); } catch { /* Storage may be disabled. */ }
  },[records.surgeries,records.notes,records.io,day,key]);
}
