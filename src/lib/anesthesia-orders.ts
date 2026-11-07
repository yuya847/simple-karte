import { lineEffective } from './standing-calendar';
import { parseBasicBlock } from './standing-blocks';
import type { StandingLine, LineCat } from './standing-lines';

export function postopRestConflicts(lines: StandingLine[], cat: LineCat, text: string, time: string): StandingLine[] {
  if (cat !== '安静') return [];
  return lines.filter(l=>lineEffective(l,0,time) && (l.cat==='安静' || parseBasicBlock(l.text).rest) && (parseBasicBlock(l.text).rest ?? l.text).replace(/^安静度[：:]\s*/, '') !== text.trim());
}
/** Keep unrelated fields in a basic block when replacing its rest instruction. */
export function replacePostopRest(line: StandingLine, text: string): string {
  return parseBasicBlock(line.text).rest ? line.text.replace(/^(\s*安静度[：:]\s*).*$/m, `$1${text.trim()}`) : `安静度：${text.trim()}`;
}

import type { Dispatch, SetStateAction } from 'react';
import { linesFromFields } from './standing-lines';
import { endStandingField } from './standing-field-end';
import type { StandingOrders } from './standing';

export function anesthesiaPostopOrders(lines: Record<string, StandingLine[]>, fields: Record<string, StandingOrders[]>, setFields: Dispatch<SetStateAction<Record<string, StandingOrders[]>>>, addLine: (pid:string,line:StandingLine)=>void, by:string, time:string, newId:()=>string) {
  return {
    lines: Object.fromEntries([...new Set([...Object.keys(lines),...Object.keys(fields)])].map(pid=>[pid,[...(lines[pid]??[]),...linesFromFields(fields[pid]??[])]])),
    onAdd:(pid:string,text:string,cat:LineCat,changedFrom?:string)=>{
      const old=linesFromFields(fields[pid]??[]).find(l=>l.id===changedFrom);
      if(old) setFields(all=>{const versions=all[pid]??[];const last=versions.at(-1);return last ? {...all,[pid]:[...versions,{...endStandingField(last,old,0,'術後指示に置き換え',by,time),by,at:{day:0,time}}]} : all;});
      addLine(pid,{id:newId(),cat,text,changedFrom:old ? undefined : changedFrom,start:{day:0,time},by,at:{day:0,time}});
    },
  };
}
