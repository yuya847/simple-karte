"use client";

import { TabChoice } from "../TabChoice";

export function InjectionDiluentChoice({ volumes, onChoose }: { volumes: number[]; onChoose: (volume: number | null) => void }) {
  if (!volumes.length) return null;
  return <div className="flex flex-wrap items-center gap-2" onKeyDown={e => {
    // This group owns its keys; the Rp's field navigation must not consume them.
    e.stopPropagation();
  }}>
    <span>溶解：生食 {volumes[0]}mL を入れますか？</span>
    <TabChoice numbered label="溶解の生食" value={null} options={[...volumes.map(v => ({ value: v, label: `生食 ${v}mL` })), { value: 0, label: "入れない" }]} onChange={v => onChoose(v || null)} />
  </div>;
}
