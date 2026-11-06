"use client";
import { displayText } from "@/lib/display-text";
import { useState } from "react";
import { addDays, formatShort, type CalendarDate } from "@/lib/dates";
import { diagnosisLabel, type Diagnosis } from "@/lib/diagnoses";
import { DiagnosisDetail } from "./DiagnosisDetail";
interface Props {
  diagnoses: Diagnosis[];
  admittedOn: number;
  today: CalendarDate;
  department?: string;
  canConfirm?: boolean;
  unmatched?: string[];
  onChange: (next: Diagnosis[]) => void;
  newId: () => string;
}
export function DiagnosisPanel({ diagnoses, today, department = "総合診療科", canConfirm = false, unmatched = [], onChange, newId }: Props) {
  const [edit, setEdit] = useState<Diagnosis | null>(null);
  const [query, setQuery] = useState("");
  const openNew = (q = "") => { setQuery(q); setEdit({ id: newId(), code: "", name: "", prefixes: [], suffixes: [], main: false, start: 0, outcome: "継続" }); };
  if (edit) return <DiagnosisDetail key={edit.id} initial={edit} today={today} department={department} query={query} onClose={() => setEdit(null)} onSave={d => { onChange(diagnoses.some(x => x.id === d.id) ? diagnoses.map(x => x.id === d.id ? d : x) : [...diagnoses, d]); setEdit(null); }} />;
  return <div className="space-y-4">
    {unmatched.filter(name => !diagnoses.some(d => diagnosisLabel(d) === name || d.name === name)).map(name => <p key={name} className="rounded bg-yamabuki-soft p-2 text-sm">記事の＃に病名の一覧に無いものがあります：{displayText(name)} → <button type="button" className="underline" onClick={() => openNew(name)}>病名を探す</button></p>)}
    <h3 className="text-sm font-bold">登録している病名</h3>
    {!diagnoses.length && <p className="text-sm">まだありません</p>}
    <table className="w-full text-left text-sm"><thead><tr className="border-b border-rule"><th>主</th><th>病名</th><th>ICD-10</th><th>開始</th><th>区分</th><th>操作</th></tr></thead><tbody>{diagnoses.map(d => <tr key={d.id} className="border-b border-rule-soft"><td>{d.main ? "主" : "—"}</td><td className="py-2">{diagnosisLabel(d)}<span className="block text-xs text-ink-faint">コード {d.code}</span>{d.auto && <span className="block text-xs text-yamabuki">自動（確認まだ）{canConfirm && <button type="button" className="ml-2 underline" onClick={() => onChange(diagnoses.map(x => x.id === d.id ? { ...x, auto: undefined } : x))}>確認</button>}</span>}</td><td>{d.icd10 ?? "—"}</td><td>{formatShort(addDays(today,d.start))}</td><td>{d.outcome}</td><td><button type="button" className="mr-3 underline" onClick={() => { setQuery(""); setEdit(d); }}>詳細</button><button type="button" className="text-ink-faint" onClick={() => onChange(diagnoses.filter(x => x.id !== d.id))}>削除</button></td></tr>)}</tbody></table>
    <button type="button" className="rounded bg-ai px-3 py-2 text-sm text-white" onClick={() => openNew()}>病名を追加</button>

  </div>;
}

/* Help migration source (references and dynamic wording):
<p >病名はマスターの名前と一致したものだけ自動で入れます。確認は医師。確認前の病名は算定に載せません。</p>
*/
