"use client";

import { abs } from "@/lib/flowsheet";
import { sofaFacts, sofaScore, SOFA_SOURCE, SOFA_ORIGINAL } from "@/lib/icu";
import type { IcuPaneProps } from "./parts";

/** SOFA: 今日・入室日・昨日の項目ごとの点と根拠（点はコードで計算）。 */
export function IcuSofaPane(p:IcuPaneProps) {
  const {patient,records}=p;
  const first=records.stays.filter(s=>s.patientId===patient.id).sort((a,b)=>abs(a.in.day,a.in.time)-abs(b.in.day,b.in.time))[0];
  const cols=[{label:'今日',day:0},{label:'入室日',day:first?.in.day},{label:'昨日',day:-1}].map(c=>({...c,result:c.day===undefined?null:sofaScore(sofaFacts(patient,records,c.day))}));
  return <><table className="w-full table-fixed text-xs"><thead><tr><th>項目</th>{cols.map(c=><th key={c.label}>{c.label}</th>)}</tr></thead><tbody>{['呼吸','凝固','肝','循環','中枢神経','腎'].map((label,j)=><tr key={label}><th className="border border-rule p-2">{label}</th>{cols.map(c=><td className="border border-rule p-2 align-top" key={c.label}><b>{c.result?.items[j].score??'—'}</b><p>{c.result?.items[j].basis??'入室記録なし'}</p></td>)}</tr>)}<tr><th>合計</th>{cols.map(c=><td key={c.label} className="p-2"><b>{c.result?.total??'—'}</b>{!!c.result?.missing.length&&<p>不足：{c.result.missing.join('・')}</p>}</td>)}</tr></tbody></table><p hidden className="hint">各日の最悪値。HFNC は呼吸補助に数えません。尿量条件は24時間分がある場合だけ使用。<a href={SOFA_ORIGINAL.url}>{SOFA_ORIGINAL.label}</a>／<a href={SOFA_SOURCE.url}>{SOFA_SOURCE.label}</a></p></>;
}
