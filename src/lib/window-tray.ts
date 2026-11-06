/** 開いた順を保ち、閉じた札と重複を除く。前面の順は重なりにだけ使う。 */
export function windowTray(open: readonly string[], minimized: readonly string[], zOrder: readonly string[]) {
  return [...new Set(open)].map((key) => ({ key, minimized: minimized.includes(key), z: 50 + Math.max(0, zOrder.indexOf(key)) }));
}
export function minimizeWindow(minimized: readonly string[], key: string, hide: boolean) {
  return hide ? [...new Set([...minimized, key])] : minimized.filter((k) => k !== key);
}
