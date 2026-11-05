import { ANALYTES } from "./master";
import type { TemplateFacts, TemplateValues } from "./note-templates";

export const SOFA_ITEMS = ["呼吸 P/F", "凝固 Plt", "肝 Bil", "循環 MAP/昇圧薬", "中枢神経 GCS", "腎 Cre/尿量"] as const;
export const SOFA_SOURCE = { label: "厚生労働省 中医協 入院（その2）令和3年11月10日：SOFA スコアと測定日", url: "https://www.mhlw.go.jp/content/12404000/000855421.pdf" };

export function sofaTotal(values: TemplateValues): number | null {
  const scores = SOFA_ITEMS.map((item) => values[`選択:SOFA ${item}`]);
  return scores.every((s) => typeof s === "string" && /^[0-4]$/.test(s)) ? scores.reduce<number>((n, s) => n + Number(s), 0) : null;
}

/** 将来の測定値を引用しない。項目ごとの最新値と時刻を残す。 */
export function recordMeasurements(f: TemplateFacts & { nowTime: string }) {
  const past = (r: { day: number; time: string }) => r.day < 0 || (r.day === 0 && r.time <= f.nowTime);
  const newest = <T extends { day: number; time: string }>(rows: T[]) => [...rows].filter(past).sort((a, b) => b.day - a.day || b.time.localeCompare(a.time));
  const stamp = (r: { day: number; time: string }) => `${r.day === 0 ? "今日" : `${-r.day}日前`} ${r.time}`;
  const labs = newest(f.patient.labs);
  const lab = (code: string) => {
    const r = labs.find((r) => Number.isFinite(r.values[code]));
    return r ? { value: r.values[code], text: `${code} ${r.values[code]} ${ANALYTES.find((a) => a.code === code)?.unit ?? ""}（${stamp(r)}）` } : undefined;
  };
  const vitals = newest(f.patient.vitals);
  const vital = (key: "sbp" | "dbp" | "spo2", label: string, unit: string) => {
    const v = vitals.find((v) => Number.isFinite(v[key]));
    return v ? `${label} ${v[key]}${unit}（${stamp(v)}）` : "";
  };
  return { lab, bloodPressure: [vital("sbp", "収縮期血圧", "mmHg"), vital("dbp", "拡張期血圧", "mmHg")].filter(Boolean).join("、"), spo2: vital("spo2", "SpO2", "%") };
}

export function icuPrefill(f: TemplateFacts & { nowTime: string }): TemplateValues {
  const m = recordMeasurements(f);
  const plt = m.lab("Plt");
  const bil = m.lab("T-Bil");
  return {
    "時刻:入室時刻": f.nowTime,
    "文:血圧": m.bloodPressure,
    "文:PaO2 または SpO2": m.spo2,
    ...Object.fromEntries(["Cre", "T-Bil", "Plt"].map((code) => [`文:${code}`, m.lab(code)?.text ?? ""])),
    // 公的資料の境界（血小板 ×10³/μL）を、このカルテの万/μLへ換算。
    ...(plt && plt.value >= 0 ? { "選択:SOFA 凝固 Plt": String(plt.value <= 2 ? 4 : plt.value <= 5 ? 3 : plt.value <= 10 ? 2 : plt.value <= 15 ? 1 : 0) } : {}),
    ...(bil && bil.value >= 0 && bil.value !== 12 ? { "選択:SOFA 肝 Bil": String(bil.value < 1.2 ? 0 : bil.value < 2 ? 1 : bil.value < 6 ? 2 : bil.value < 12 ? 3 : 4) } : {}),
  };
}

export function emergencyPrefill(f: TemplateFacts & { nowTime: string }): string {
  const m = recordMeasurements(f);
  return [m.bloodPressure, m.spo2, ...ANALYTES.map((a) => m.lab(a.code)?.text)].filter(Boolean).join("、");
}
