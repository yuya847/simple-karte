/** 開いた順を保ち、閉じた札と重複を除く。前面の順は重なりにだけ使う。 */
export function windowTray(open: readonly string[], minimized: readonly string[], zOrder: readonly string[]) {
  return [...new Set(open)].map((key) => ({ key, minimized: minimized.includes(key), z: 50 + Math.max(0, zOrder.indexOf(key)) }));
}
export function minimizeWindow(minimized: readonly string[], key: string, hide: boolean) {
  return hide ? [...new Set([...minimized, key])] : minimized.filter((k) => k !== key);
}

/** Centre the shrinking window on its own patient's tray entry. */
export function trayTransform(from: { x: number; y: number; width: number; height: number }, to: { x: number; y: number; width: number; height: number }) {
  return `translate(${to.x + to.width / 2 - from.x - from.width / 2}px, ${to.y + to.height / 2 - from.y - from.height / 2}px) scale(${Math.min(to.width / from.width, 0.2)}, ${Math.min(to.height / from.height, 0.15)})`;
}
