import { displayText } from "@/lib/display-text";
import type { VitalSign } from "@/lib/types";
import { vitalsIn } from "@/lib/vitals-text";
import { cautionHits } from "@/lib/rehab-record";

export function RehabVitals({ vitals, caution }: { vitals: VitalSign[]; caution: string }) {
  const v = vitalsIn(vitals, "today", 0, null).at(-1);
  if (!v) return <p className="text-ink-soft">今日のバイタル：測定記録なし</p>;
  const hits = cautionHits(caution, v);
  const fields = [
    ["bt", `BT ${v.bt ?? "—"}℃`], ["hr", `HR ${v.hr ?? "—"}/分`],
    ["sbp", `BP ${v.sbp ?? "—"}/${v.dbp ?? "—"}mmHg`], ["spo2", `SpO2 ${v.spo2 ?? "—"}%`],
  ];
  return <>
    <p className="nums text-ink-soft">今日の最新 {v.time}　{fields.map(([key, text]) => <span key={key} className={hits.includes(key) ? "mr-2 font-bold text-shu" : "mr-2"}>{displayText(text)}</span>)}</p>

  </>;
}

/* Help migration source (references and dynamic wording):
<p >注意の文からコードで読み取った値です。判断は療法士</p>
*/
