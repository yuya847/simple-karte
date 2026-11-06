"use client";
import { createContext, useContext, useState, useSyncExternalStore } from "react";
import { scenarioMode } from "@/lib/scenarios/mode";
const ScenarioSaveContext = createContext<(() => Promise<void>) | null>(null);
export const ScenarioSaveProvider = ScenarioSaveContext.Provider;
const subscribe = () => () => {};
export function ScenarioSwitch() {
  const save = useContext(ScenarioSaveContext);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const active = useSyncExternalStore(subscribe, scenarioMode, () => false);
  return <><button type="button" disabled={busy} className="w-full border-t border-rule-soft px-2 py-1.5 text-left hover:bg-paper" onClick={async () => {
    setBusy(true);
    try { await save?.(); } catch { setError("保存できなかったため、病棟を切り替えませんでした。"); setBusy(false); return; }
    const url = new URL(window.location.href);
    if (active) url.searchParams.delete("scenarios"); else url.searchParams.set("scenarios", "100");
    window.location.assign(url.toString());
  }}>{active ? "元の病棟に戻る" : "試験用の病棟（100人）を開く"}</button>{error && <p role="status" className="px-2 text-xs text-shu">{error}</p>}</>;
}
