/** キーボード・マウスの操作の一覧（ビューアにフォーカスがあるときに使える）。 */
export const SHORTCUTS: [string, string][] = [
  ["↑ / ↓・ホイール", "スライスを 1 枚送る"],
  ["PageUp / PageDown", "5 枚送る"],
  ["Home / End", "最初 / 最後のスライス"],
  ["← / →", "前 / 次のシリーズ"],
  ["Space", "シネ再生・停止"],
  ["W", "WW/WL（左右ドラッグで幅、上下でレベル）"],
  ["P", "移動（ドラッグ）"],
  ["Z", "拡大縮小（ドラッグ）"],
  ["D", "距離（ドラッグ）"],
  ["A", "角度（3 点をクリック、2 点目が頂点）"],
  ["R", "ROI（楕円をドラッグ）"],
  ["1〜5", "WW/WL のプリセット（ボタンの順）"],
  ["+ / −", "拡大 / 縮小"],
  ["⌘ または Ctrl＋ホイール", "マウスの所を中心に拡大縮小"],
  ["[ / ]", "左 / 右へ 90° 回転"],
  ["H / V", "左右 / 上下の反転"],
  ["I", "白黒の反転"],
  ["0", "表示を元に戻す"],
  ["Delete / Backspace", "この画像の最後の計測を消す"],
  ["C", "比較表示（同じ部位の前回と今回）"],
  ["F", "全画面"],
  ["?", "この一覧"],
  ["Esc", "計測の途中をやめる・全画面を閉じる"],
  ["Shift＋ドラッグ・中ボタン", "移動"],
  ["右ボタンでドラッグ", "拡大縮小"],
];

export function KeyHelp({ columns = 2 }: { columns?: 1 | 2 }) {
  return (
    <dl className={`grid gap-x-4 gap-y-0.5 text-[12px] ${columns === 2 ? "grid-cols-2" : "grid-cols-1"}`}>
      {SHORTCUTS.map(([k, v]) => (
        <div key={k} className="flex gap-2">
          <dt className="nums w-[9.5em] shrink-0 font-bold text-ink-soft">{k}</dt>
          <dd className="text-ink">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
