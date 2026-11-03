// 合成画像の「種」と擬似乱数。同じ文字列（検査 ID など）からは、毎回同じ数の並びが出る。
// Math.random は使わない（開くたびに画像が変わってしまうため）。

/** 文字列から 32 ビットの種を作る（FNV-1a）。 */
export function seedFrom(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** 0 以上 1 未満の数を返す関数。 */
export type Rng = () => number;

/** 種から決まった列を出す擬似乱数（mulberry32）。 */
export function makeRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** lo 以上 hi 未満の一様な数。 */
export function between(r: Rng, lo: number, hi: number): number {
  return lo + (hi - lo) * r();
}

/** 平均 0・標準偏差 1 の正規乱数（ボックス＝ミュラー法）。 */
export function gaussian(r: Rng): number {
  let u = 0;
  while (u === 0) u = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
}
