import type { StandingLine } from "./standing-lines";

// 架空の患者の指示。中止・変更前の本文と期間も残す。
export const standingSeeds: Record<string, StandingLine[]> = {
  "90010198": [
    {
      id: "sl-198-1",
      text: `基本指示（変更前）
安静度：ベッド上、頭を上げてよい
清潔：シャワー浴
測定：バイタル 1日3回、体重 毎朝、水分出納 水分出納（IN/OUT）を測る
観察：体重が前日より1kg以上増えたら報告`,
      cat: "その他",
      start: { day: -3, time: "10:00" },
      at: { day: -3, time: "10:00" },
      by: "山本（専攻医）",
      end: { day: -1, time: "09:00" },
      stop: { day: -1, time: "09:00", by: "山本（専攻医）", reason: "息切れが落ち着いた" },
    },
    {
      id: "sb-90010198-1",
      text: `基本指示
安静度：病棟内フリー（息切れが出たら休む）
清潔：シャワー浴
測定：バイタル 1日3回、体重 毎朝、水分出納 水分出納（IN/OUT）を測る
観察：体重が前日より1kg以上増えたら報告`,
      cat: "その他",
      start: { day: -1, time: "09:00" },
      at: { day: -1, time: "09:00" },
      by: "山本（専攻医）",
    },
    {
      id: "call-90010198",
      text: `Drコール指示
収縮期血圧 180mmHg以上
収縮期血圧 90mmHg以下
脈拍 120/分以上
SpO2 92%未満
意識レベルの低下
K 4 mmol/L 未満なら：医師へ連絡。カリウムを補うかは医師が決める（看護師は投与しない）
収縮期血圧 95 mmHg 未満なら：医師へ連絡。次のフロセミドの静注は見合わせ、医師の指示を受ける`,
      cat: "呼出基準",
      start: { day: -3, time: "10:00" },
      at: { day: -3, time: "10:00" },
      by: "山本（専攻医）",
    },
    {
      id: "prn-90010198-発熱時",
      text: `発熱時指示
発熱時（38.0℃以上・NSAIDs は使わない）：アセトアミノフェン錠500mg 1錠　6時間あけて1日3回まで`,
      cat: "頓用",
      start: { day: -3, time: "10:00" },
      at: { day: -3, time: "10:00" },
      by: "山本（専攻医）",
    },
    {
      id: "sl-198-4",
      cat: "処置",
      text: `処置指示
弾性ストッキングを着ける`,
      start: { day: -3, time: "10:00" },
      by: "山本（専攻医）",
      at: { day: -3, time: "10:00" },
    },
  ],
  "90010231": [
    {
      id: "sb-90010231-0",
      text: `基本指示（変更前）
安静度：病棟内歩行
清潔：シャワー浴
測定：バイタル 1日3回、体重 なし、水分出納 測らない
排泄：トイレまで歩いてよい
観察：咳と痰の性状を勤務ごとに記録
注意：転倒に注意（ベッド柵・離床センサー）`,
      cat: "その他",
      start: { day: -3, time: "10:00" },
      at: { day: -3, time: "10:00" },
      by: "山本（専攻医）",
      end: { day: -2, time: "15:30" },
      stop: { day: -2, time: "15:30", by: "山本（専攻医）", reason: "歩行が安定した" },
    },
    {
      id: "sb-90010231-1",
      text: `基本指示
安静度：病棟内歩行
清潔：シャワー浴
測定：バイタル 1日3回、体重 なし、水分出納 測らない
排泄：トイレまで歩いてよい
観察：咳と痰の性状を勤務ごとに記録`,
      cat: "その他",
      start: { day: -2, time: "15:30" },
      at: { day: -2, time: "15:30" },
      by: "山本（専攻医）",
    },
    {
      id: "call-90010231",
      text: `Drコール指示
収縮期血圧 90mmHg以下
脈拍 130/分以上
体温 39℃以上
SpO2 92%未満
意識レベルの低下`,
      cat: "呼出基準",
      start: { day: -3, time: "10:00" },
      at: { day: -3, time: "10:00" },
      by: "山本（専攻医）",
    },
    {
      id: "prn-90010231-発熱時",
      text: `発熱時指示
発熱時（38.5℃以上）：アセトアミノフェン錠500mg 1錠　6時間あけて1日3回まで`,
      cat: "頓用",
      start: { day: -3, time: "10:00" },
      at: { day: -3, time: "10:00" },
      by: "山本（専攻医）",
    },
    {
      id: "prn-90010231-便秘時",
      text: `便秘時指示
便秘時（3日排便なし）：センノシド錠12mg 2錠　24時間あけて1日1回まで`,
      cat: "頓用",
      start: { day: -3, time: "10:00" },
      at: { day: -3, time: "10:00" },
      by: "山本（専攻医）",
    },
  ],
  "90010244": [
    {
      id: "sb-90010244-0",
      text: `基本指示
安静度：ベッド上（頭を上げてよい）
清潔：清拭
測定：バイタル 4時間ごと、体重 なし、水分出納 水分出納（IN/OUT）を測る
食事：絶食（水分はよい）
モニター：SpO2 を持続モニターで見る
注意：吸引は必要時。食事の再開は医師が指示する。`,
      cat: "その他",
      start: { day: -1, time: "09:30" },
      at: { day: -1, time: "09:30" },
      by: "山本（専攻医）",
    },
    {
      id: "call-90010244",
      text: `Drコール指示
収縮期血圧 90mmHg以下
呼吸数 25/分以上
SpO2 90%未満
意識レベルの低下`,
      cat: "呼出基準",
      start: { day: -1, time: "09:30" },
      at: { day: -1, time: "09:30" },
      by: "山本（専攻医）",
    },
    {
      id: "prn-90010244-発熱時",
      text: `発熱時指示
発熱時（38.5℃以上・絶食中）：アセリオ静注液1000mgバッグ 500mg　6時間あけて1日2回まで`,
      cat: "頓用",
      start: { day: -1, time: "09:30" },
      at: { day: -1, time: "09:30" },
      by: "山本（専攻医）",
    },
    {
      id: "sl-244-2",
      cat: "処置",
      text: `処置指示
吸引は必要時`,
      start: { day: -1, time: "09:30" },
      by: "山本（専攻医）",
      at: { day: -1, time: "09:30" },
    },
  ],
  "90010260": [
    {
      id: "sb-90010260-0",
      text: `基本指示（変更前）
安静度：病棟内歩行
清潔：シャワー浴
測定：バイタル 1日3回、体重 なし、水分出納 尿量だけ測る
排泄：排尿のたびに尿量を記録、6時間以上ないときは報告`,
      cat: "その他",
      start: { day: -2, time: "11:00" },
      at: { day: -2, time: "11:00" },
      by: "山本（専攻医）",
      end: { day: 1, time: "00:00" },
      changed: { day: 1, time: "00:00", by: "山本（専攻医）", toId: "sb-90010260-1" },
    },
    {
      id: "sb-90010260-1",
      text: `基本指示
安静度：病棟内歩行
清潔：シャワー浴
測定：バイタル 1日3回、体重 なし、水分出納 尿量だけ測る`,
      cat: "その他",
      start: { day: 1, time: "00:00" },
      at: { day: 1, time: "00:00" },
      by: "山本（専攻医）",
      changedFrom: "sb-90010260-0",
    },
    {
      id: "call-90010260",
      text: `Drコール指示
収縮期血圧 90mmHg以下
体温 39℃以上
SpO2 94%未満
意識レベルの低下
腰背部痛が頓用で治まらないとき医師を呼ぶ`,
      cat: "呼出基準",
      start: { day: -2, time: "11:00" },
      at: { day: -2, time: "11:00" },
      by: "山本（専攻医）",
    },
    {
      id: "prn-90010260-発熱時",
      text: `発熱時指示
発熱時（38.5℃以上）：アセトアミノフェン錠500mg 1錠　6時間あけて1日3回まで`,
      cat: "頓用",
      start: { day: -2, time: "11:00" },
      at: { day: -2, time: "11:00" },
      by: "山本（専攻医）",
    },
    {
      id: "prn-90010260-疼痛時",
      text: `疼痛時指示
疼痛時（腰背部痛）：アセトアミノフェン錠500mg 1錠　6時間あけて1日3回まで`,
      cat: "頓用",
      start: { day: -2, time: "11:00" },
      at: { day: -2, time: "11:00" },
      by: "山本（専攻医）",
    },
  ],
};

// ---------- 保存された古い指示を、かたまりの指示に移す（読み込みのたびに通す） ----------

/** The ids of the old one-line seed orders (before the blocks). */
const OLD_SEED_LINE_IDS = new Set(["sl-231-1", "sl-231-2", "sl-231-3", "sl-198-1", "sl-198-2", "sl-198-3", "sl-198-4", "sl-260-1", "sl-260-2", "sl-244-1", "sl-244-2", "sl-244-3"]);

/**
 * Saved standing lines from before the blocks: the old seed lines are replaced by the seed blocks (same id → the
 * block's text; old ids not used by the blocks → dropped), and seed blocks missing from the save are added. Lines
 * someone wrote (any other id) stay as they are.
 */
export function migrateStandingLines(saved: Record<string, StandingLine[]>, seeds: Record<string, StandingLine[]> = standingSeeds): Record<string, StandingLine[]> {
  const out: Record<string, StandingLine[]> = {};
  for (const pid of new Set([...Object.keys(saved), ...Object.keys(seeds)])) {
    const seed = seeds[pid] ?? [];
    const seedIds = new Set(seed.map((l) => l.id));
    const kept = (saved[pid] ?? []).filter((l) => !l.fromFields && !(OLD_SEED_LINE_IDS.has(l.id) && !seedIds.has(l.id)));
    const fromSeed = kept.map((l) => (seedIds.has(l.id) && !l.text.includes("\n") ? seed.find((s) => s.id === l.id)! : l));
    const missing = seed.filter((s) => !fromSeed.some((l) => l.id === s.id));
    const seen = new Set<string>();
    out[pid] = [...fromSeed, ...missing].filter(line => {
      const key = JSON.stringify([line.text.trim(), line.cat, line.start, line.at, line.by, line.end, line.stop, line.changed, line.changedFrom]);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
  return out;
}

/** Saved field-based orders: the old seed versions (山本（専攻医）, 3 days ago 10:00) now live in the blocks and are dropped. */
export function migrateStandingVersions<T extends { by: string; at: { day: number; time: string } }>(saved: Record<string, T[]>): Record<string, T[]> {
  return Object.fromEntries(Object.entries(saved).map(([pid, vs]) => [pid, vs.filter((v) => !(v.by === "山本（専攻医）" && v.at.day === -3 && v.at.time === "10:00"))]));
}
