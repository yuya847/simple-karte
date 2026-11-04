/** Numbers correspond to displayed positions, including disabled options. */
export function optionNumber(index: number): string | null {
  return index >= 0 && index < 9 ? String(index + 1) : null;
}
export function numberedOptionIndex(key: string, options: readonly { disabled?: boolean }[]): number | null {
  if (!/^[1-9]$/.test(key)) return null;
  const index = Number(key) - 1;
  return index < options.length && !options[index].disabled ? index : null;
}
