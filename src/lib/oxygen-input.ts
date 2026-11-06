export const OXYGEN_DEVICES = ["室内気", "鼻カニュラ", "マスク", "リザーバー", "ハイフロー"] as const;
export function oxygenParts(value: string) {
  return { device: OXYGEN_DEVICES.find((d) => value.startsWith(d)) ?? "室内気", flow: value.match(/([\d.]+)\s*L/)?.[1] ?? "" };
}
export function oxygenText(device: string, flow: string) {
  return device === "室内気" ? device : `${device} ${flow}L/分`;
}
