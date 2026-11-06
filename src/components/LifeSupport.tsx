"use client";
import { useState } from "react";
import { LIFE_FIELDS, lifeLines, coordinationText, type Coordination, type LifeSupport } from "@/lib/life-support";
import { useDeny } from "./RoleContext";

export function LifeSupportForm({ value, onSave }: { value?: LifeSupport; onSave: (v: LifeSupport) => void }) {
  const [draft, setDraft] = useState<LifeSupport>(value ?? {});
  const [saved, setSaved] = useState(false);
  const deny = useDeny();
  return <form className="space-y-3 text-sm" onSubmit={e => { e.preventDefault(); if (!deny("assess.discharge")) { onSave(draft); setSaved(true); } }}>
    <fieldset disabled={!!deny("assess.discharge")} className="grid grid-cols-2 gap-3">
      {LIFE_FIELDS.map(([key, label]) => <label key={key}>{label}<input aria-label={label} type={["due", "lastContact"].includes(key) ? "date" : "text"} value={draft[key] ?? ""} onChange={e => { setDraft({ ...draft, [key]: e.target.value }); setSaved(false); }} className="mt-1 block w-full rounded border border-rule bg-paper px-2 py-1" /></label>)}
      <label><input type="checkbox" checked={!!draft.waiting} onChange={e => setDraft({ ...draft, waiting: e.target.checked })} /> 返答待ち</label>
      <button className="rounded bg-ai px-3 py-1 text-white">生活・制度を保存</button>
    </fieldset>
    {saved && <p role="status">保存しました。経過に残しました。</p>}
  </form>;
}
export function LifeSupportOverview({ value, onOpen, adjustment, coordination }: { coordination?: Coordination; value?: LifeSupport; onOpen: () => void; adjustment: string }) {
  const lines = lifeLines(value);
  return <section aria-label="生活・制度・調整状況" className="border-b border-rule bg-wakatake-soft px-4 py-2 text-xs">
    <button onClick={onOpen} className="font-bold text-ai">生活・制度</button>
    <p>{lines.length ? lines.join(" ／ ") : "生活・家族・制度：記録なし"}</p><p>調整：{adjustment || "記録なし"}</p>{coordination && <p>{coordinationText(coordination).split("\n").join(" ／ ")}</p>}
  </section>;
}
