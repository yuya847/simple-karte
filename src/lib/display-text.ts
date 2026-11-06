/** Remove example disclaimers at the presentation boundary; keep stored values and proper names. */
export function displayText(value: string | null | undefined): string {
  return (value ?? "")
    .replace(/（架空(?:の(?:記録|規格|院内採用品|麻薬卸売業者|保険者|例|支部番号|住所|初期データ))?）/g, "")
    .replace(/（架空の病院の(?:取り決め|採用)）/g, "")
    .replace(/([・、])架空(?=）)/g, "")
    .replace(/^架空の病院の取り決め$/, "院内の取り決め")
    .replace(/架空のデータでは/g, "")
    .replace(/架空の品目/g, "品目");
}
