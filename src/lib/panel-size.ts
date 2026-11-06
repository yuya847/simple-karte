/** Widths for compact forms and wider tables. Height follows content until manually resized. */
export function panelWidth(key: string, wide = false) {
  if (key === "standing") return 1100;
  if (["add-leave", "add-discharge", "add-guide", "guide-record", "access-limit", "doctors", "opd-booking", "add-rehab"].includes(key)) return 640;
  if (["diet", "labels", "bedside", "scans"].includes(key)) return 720;
  return wide ? 960 : 720;
}

export function panelSize(key: string, wide: boolean, width: number, height: number, initialWidth?: number) {
  const w = Math.min(initialWidth ?? panelWidth(key, wide), width - 16);
  const h = Math.floor(height * 0.85);
  return { x: Math.max(8, (width - w) / 2), y: Math.max(8, height * 0.075), w, h };
}
