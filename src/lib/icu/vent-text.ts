import type { VentSetting } from "./types";

/** 「A/C-PC FiO2 0.4 PEEP 8 PC 10 RR 16」: the setting as entered, nothing added (orders, ICU 回診, 経過). */
export function ventSettingText(v: Pick<VentSetting, "mode" | "airway" | "fio2"> & Partial<VentSetting>): string {
  const extra = ([["PEEP", v.peep], ["PS", v.ps], ["PC", v.pc], ["VT", v.vt], ["RR", v.rr]] as const).filter(([, x]) => x !== undefined).map(([k, x]) => `${k} ${x}`);
  const flow = v.flow !== undefined ? `${v.flow}L/分` : "";
  if (v.mode === "なし") return [v.airway === "なし" ? "" : v.airway, flow, `FiO2 ${v.fio2}`].filter(Boolean).join(" ");
  return [v.mode, `FiO2 ${v.fio2}`, ...extra, flow].filter(Boolean).join(" ");
}
