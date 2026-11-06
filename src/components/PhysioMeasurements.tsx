"use client";
import { bronchodilatorResponse, echoCalculated, echoFlag, ECHO_FORMULAS, ECG_FINDINGS, goldCandidate, spiroCalculated, spiroQuality, VALVES, ventilationCandidate, type Grade, type Motion, type PhysioFacts, type PhysioSelections } from "@/lib/physio-calculations";
import { fieldsOf, type PhysioReport } from "@/lib/physio-desk";

const units: Record<string, string> = { LVEF: "%", FS: "%", SimpsonEF: "%", BSA: "m²", LVMass: "g", LVMI: "g/m²", TRPG: "mmHg", RAP: "mmHg", RVSP: "mmHg" };
const field = "rounded border border-rule bg-paper px-1.5 py-0.5 w-24 text-right";
const motions: Motion[] = ["正常", "低収縮", "無収縮", "奇異性"];
const colors = ["#d8e8df", "#f4d482", "#e8a299", "#b9a2ce"];
// AHA/ASE 17-segment convention: basal 1–6, mid 7–12, apical 13–16, apex 17.
export const SEGMENTS = ["基部前壁", "基部前壁中隔", "基部下壁中隔", "基部下壁", "基部下側壁", "基部前側壁", "中部前壁", "中部前壁中隔", "中部下壁中隔", "中部下壁", "中部下側壁", "中部前側壁", "心尖部前壁", "心尖部中隔", "心尖部下壁", "心尖部側壁", "心尖"];
function wedge(inner: number, outer: number, start: number, end: number) {
  const xy = (r: number, a: number) => `${130 + r * Math.sin(a)},${130 - r * Math.cos(a)}`;
  return `M${xy(outer, start)} A${outer},${outer} 0 0 0 ${xy(outer, end)} L${xy(inner, end)} A${inner},${inner} 0 0 1 ${xy(inner, start)} Z`;
}
function Bullseye({ selections, onChange, disabled }: { selections: PhysioSelections; onChange: (s: PhysioSelections) => void; disabled: boolean }) {
  const motion = selections.motion ?? {};
  return <div className="flex flex-wrap gap-4"><svg viewBox="0 0 260 260" className="w-64" role="img" aria-label="左室壁運動17分画ブルズアイ">
    {Array.from({ length: 16 }, (_, i) => {
      const ring = i < 6 ? 0 : i < 12 ? 1 : 2, count = ring === 2 ? 4 : 6, index = i - (ring === 0 ? 0 : ring === 1 ? 6 : 12);
      const angle = 2 * Math.PI / count, start = angle / 2 - index * angle, end = start - angle;
      const radius = [99, 66, 33][ring], middle = start - angle / 2;
      return <g key={i}><path d={wedge([82, 49, 16][ring], [116, 82, 49][ring], start, end)} fill={motion[i + 1] ? colors[motions.indexOf(motion[i + 1])] : "#eee"} stroke="white" /><text x={130 + radius * Math.sin(middle)} y={134 - radius * Math.cos(middle)} textAnchor="middle" fontSize="12">{i + 1}</text></g>;
    })}<circle cx="130" cy="130" r="16" fill={motion[17] ? colors[motions.indexOf(motion[17])] : "#eee"} /><text x="130" y="134" textAnchor="middle" fontSize="12">17</text>
  </svg><div className="grid grid-cols-2 gap-1">
    <button type="button" className="col-span-2 rounded border border-rule" disabled={disabled} onClick={() => onChange({ ...selections, motion: Object.fromEntries(SEGMENTS.map((_, i) => [i + 1, "正常" as Motion])) })}>全分画を正常にする</button>
    {SEGMENTS.map((label, i) => <label key={label}>{i + 1} {label} <select aria-label={`${i + 1} ${label}`} disabled={disabled} value={motion[i + 1] ?? ""} onChange={(e) => onChange({ ...selections, motion: { ...motion, [i + 1]: e.target.value as Motion } })}><option value="" disabled>未評価</option>{motions.map((m) => <option key={m}>{m}</option>)}</select></label>)}
  </div></div>;
}
function FlowVolume({ v }: { v: Record<string, number> }) {
  const xmax = Math.max(v.FVC || 0, v.FVCPost || 0, 1), ymax = Math.max(v.PEF || 0, v.PEFPost || 0, v.V50 || 0, v.V50Post || 0, v.V25 || 0, v.V25Post || 0, 1);
  return <svg viewBox="0 0 440 220" className="max-w-lg" role="img" aria-label="簡易フローボリューム曲線"><path d="M40 15 V185 H415" fill="none" stroke="currentColor" />
    {["", "Post"].map((s, i) => {
      if (!["FVC", "PEF", "V50", "V25"].every((k) => Number.isFinite(v[k + s])) || v[`FVC${s}`] <= 0) return null;
      const points = [[0, 0], [.1, v[`PEF${s}`]], [.5, v[`V50${s}`]], [.75, v[`V25${s}`]], [1, 0]];
      return <polyline key={s} points={points.map(([x, y]) => `${40 + x * v[`FVC${s}`] / xmax * 360},${185 - y / ymax * 160}`).join(" ")} fill="none" stroke={i ? "#b26448" : "#32728a"} strokeWidth="2" />;
    })}<text x="45" y="15" fontSize="12">流量 {ymax.toFixed(1)} L/s</text><text x="270" y="210" fontSize="12">呼出量 {xmax.toFixed(1)} L</text><text x="120" y="35" fill="#32728a">前</text><text x="155" y="35" fill="#b26448">後</text></svg>;
}
export function PhysioMeasurements({ test, raw, values, onValue, facts, selections, onSelections, disabled, previous }: {
  test: string; raw: Record<string, string>; values: Record<string, number>; onValue: (k: string, v: string) => void;
  facts?: PhysioFacts; selections: PhysioSelections; onSelections: (s: PhysioSelections) => void; disabled: boolean; previous?: PhysioReport;
}) {
  const echo = test === "PHY-UCG", spiro = test === "PHY-SPIRO";
  const computed = echo ? echoCalculated(values, facts) : spiro && facts ? spiroCalculated(values, facts) : {};
  const input = (key: string, label: string) => <input aria-label={label} type="number" step="any" readOnly={test === "PHY-ECG" && ["QTc", "QTcF"].includes(key)} value={raw[key] ?? ""} disabled={disabled} onChange={(e) => onValue(key, e.target.value)} className={field} />;
  return <div className="space-y-3">
    {facts && <p className="nums">{facts.age}歳　{facts.sex}　{facts.heightCm}cm　{facts.weightKg}kg</p>}
    {spiro && <p>日本呼吸器学会2001年式</p>}
    <table className="w-auto table-auto self-start [&_th]:px-2 [&_td]:px-2 text-left nums"><thead><tr><th>計測</th><th>{spiro ? "気管支拡張薬 前" : "今回"}</th>{spiro && <th>後</th>}<th>単位</th>{echo && previous && <><th>前回（{previous.day}日・{previous.time}）</th><th>差</th></>}</tr></thead><tbody>
      {fieldsOf(test).filter((f) => !echo || !["LVEF", "FS"].includes(f.key)).map((f) => <tr key={f.key}><td>{f.label} {echo && facts && echoFlag(f.key, values[f.key], facts.sex)}</td><td>{input(f.key, spiro ? `${f.label} 前` : f.label)}</td>{spiro && <td>{input(`${f.key}Post`, `${f.label} 後`)}</td>}<td>{f.unit}</td>{echo && previous && <><td>{previous.values[f.key] ?? "—"}</td><td>{Number.isFinite(values[f.key]) && previous.values[f.key] !== undefined ? (values[f.key] - previous.values[f.key]).toFixed(1) : "—"}</td></>}</tr>)}
    </tbody></table>
    {echo && <><div className="grid gap-1 sm:grid-cols-2">{Object.entries(computed).map(([key, value]) => {
      const old = previous ? echoCalculated(previous.values, previous.facts ?? facts)[key] : undefined;
      return <p key={key}><b>{key} {value}{units[key]} {facts && echoFlag(key, value, facts.sex)}</b>{old !== undefined && <span>　前回 {old}　差 {(value - old).toFixed(1)}</span>}<span className="block text-ink-soft">{ECHO_FORMULAS[key]}</span></p>;
    })}</div><Bullseye selections={selections} onChange={onSelections} disabled={disabled} />
    <div className="grid gap-2 sm:grid-cols-2">{VALVES.map((valve) => <fieldset key={valve} className="rounded border border-rule p-2"><legend>{valve}</legend>{(["stenosis", "regurgitation"] as const).map((kind) => <div key={kind}><span>{kind === "stenosis" ? "狭窄" : "逆流"}　</span>{(["なし", "軽度", "中等度", "高度"] as Grade[]).map((grade) => <button key={grade} type="button" aria-pressed={selections.valves?.[valve]?.[kind] === grade} disabled={disabled} className={`m-0.5 rounded border px-2 ${selections.valves?.[valve]?.[kind] === grade ? "border-ai bg-ai-soft" : "border-rule"}`} onClick={() => onSelections({ ...selections, valves: { ...selections.valves, [valve]: { ...selections.valves?.[valve], [kind]: grade } as { stenosis: Grade; regurgitation: Grade } } })}>{grade}</button>)}</div>)}</fieldset>)}</div></>}
    {spiro && facts && <><table className="nums w-auto table-auto self-start [&_th]:px-2 [&_td]:px-2"><thead><tr><th>項目</th><th>予測 L</th><th>LLN L</th><th>前 %予測</th><th>後 %予測</th></tr></thead><tbody>{["VC", "FVC", "FEV1"].map((k) => <tr key={k}><td>{k}</td>{[`pred${k}`, `lln${k}`, `p${k}`, `p${k}Post`].map((key) => <td key={key}>{computed[key]?.toFixed(2) ?? "—"}</td>)}</tr>)}</tbody></table>
      <p>1秒率（Gaensler） 前 {computed.ratio?.toFixed(1) ?? "—"}% ／ 後 {computed.ratioPost?.toFixed(1) ?? "—"}%</p>
      <p>換気障害の候補：前 {ventilationCandidate(values, facts)} ／ 後 {ventilationCandidate(values, facts, true)} {goldCandidate(values, facts) && `　GOLD ${goldCandidate(values, facts)}（候補・後）`}</p>
      <p>気管支拡張薬反応（12%かつ200mL）：{bronchodilatorResponse(values) === undefined ? "未判定" : bronchodilatorResponse(values) ? "あり（候補）" : "なし（候補）"}　{computed.responseMl?.toFixed(0)} mL ／ {computed.responsePercent?.toFixed(1)}%</p>
      {["", "Post"].map((suffix) => { const q = spiroQuality(values, suffix), key = suffix ? "qualityPostChecked" : "qualityChecked"; return <label key={suffix} className="block"><input type="checkbox" disabled={disabled} checked={selections[key] ?? false} onChange={(e) => onSelections({ ...selections, [key]: e.target.checked })} /> 品質確認（{suffix ? "後" : "前"}）：努力 {values[`attempts${suffix}`] ?? "—"}回 ／ 上位2回差 FVC {q.fvc?.toFixed(0) ?? "—"}mL・FEV1 {q.fev1?.toFixed(0) ?? "—"}mL ／ {q.repeatable === undefined ? "未評価" : q.repeatable ? "150mL以内" : "150mL超"}</label>; })}
      <FlowVolume v={values} /></>}
    {test === "PHY-ECG" && <p>QTc：Bazett QT/√RR・Fridericia QT/∛RR</p>}
    {test === "PHY-ECG" && <div>{ECG_FINDINGS.map((tag) => <button type="button" key={tag} disabled={disabled} aria-pressed={selections.ecg?.includes(tag) ?? false} className={`m-1 rounded border px-2 ${selections.ecg?.includes(tag) ? "border-ai bg-ai-soft" : "border-rule"}`} onClick={() => onSelections({ ...selections, ecg: selections.ecg?.includes(tag) ? selections.ecg.filter((s) => s !== tag) : [...(selections.ecg ?? []), tag] })}>{tag}</button>)}</div>}
  </div>;
}
