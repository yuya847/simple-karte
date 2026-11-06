"use client";

import { oxygenParts, oxygenText, OXYGEN_DEVICES } from "@/lib/oxygen-input";

export function OxygenInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const { device, flow } = oxygenParts(value);
  return <div className="flex min-w-0 gap-1">
    <select aria-label="酸素の方法" value={device} onChange={(e) => onChange(oxygenText(e.target.value, flow))} className="min-w-0 flex-1 rounded border border-rule bg-paper px-1.5 py-1 text-[13px]">
      {OXYGEN_DEVICES.map((d) => <option key={d} value={d}>{d}</option>)}
    </select>
    {device !== "室内気" && <label className="flex items-center gap-1"><input aria-label="酸素流量 L/分" type="number" min="0.1" step="0.1" value={flow} onChange={(e) => onChange(oxygenText(device, e.target.value))} className="w-16 rounded border border-rule bg-paper px-1 py-1 text-right" />L/分</label>}
  </div>;
}
