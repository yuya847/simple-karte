/** Transfer width between neighboring tracks, keeping the remaining tracks unchanged. */
export function resizeColumns(widths: number[], index: number, delta: number): number[] {
  if (index < 0 || index >= widths.length - 1 || !Number.isFinite(delta)) return widths;
  const next = [...widths];
  const leftMin = Math.min(widths[index], widths.length === 4 && index === 0 ? 100 : 240);
  const rightMin = Math.min(widths[index + 1], 240);
  const change = Math.max(leftMin - widths[index], Math.min(delta, widths[index + 1] - rightMin));
  next[index] += change;
  next[index + 1] -= change;
  return next;
}
