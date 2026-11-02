"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { isoDate, todayInTokyo, type CalendarDate } from "@/lib/dates";
import { PATIENTS, findPatient } from "@/lib/patients";
import type { DayOffset, HistoryEntry } from "@/lib/types";
import { DateTree } from "./DateTree";
import { HistoryPane } from "./HistoryPane";
import { PatientBar } from "./PatientBar";
import { PatientPicker } from "./PatientPicker";
import { PatientTabs } from "./PatientTabs";
import { TodayPane } from "./TodayPane";
import { ToolRail, type PanelKind } from "./ToolRail";
import { ActiveOrdersPanel } from "./panels/ActiveOrdersPanel";
import { Drawer } from "./panels/Drawer";
import { ImagingPanel } from "./panels/ImagingPanel";
import { ResultsPanel } from "./panels/ResultsPanel";

const NOTE_TEMPLATE = "S)\nO)\nA)\nP)\n";

/** Per-patient working state. Kept while the tab is open, so switching tabs loses nothing. */
interface ChartState {
  selectedDay: DayOffset | null;
  showStopped: boolean;
  note: string;
  instruction: string;
}

const newChart = (): ChartState => ({ selectedDay: null, showStopped: false, note: NOTE_TEMPLATE, instruction: "" });

// "Today" comes from the browser clock in Japan time. The server never renders it,
// so the page cannot disagree with itself across midnight.
const noSubscribe = () => () => {};
const clientToday = () => isoDate(todayInTokyo());
const serverToday = () => null;

function parseIso(s: string): CalendarDate {
  const [y, m, d] = s.split("-").map(Number);
  return { y, m, d };
}

export default function WardApp() {
  const todayKey = useSyncExternalStore(noSubscribe, clientToday, serverToday);
  const [tabs, setTabs] = useState<string[]>([PATIENTS[0].id]);
  const [activeId, setActiveId] = useState<string | null>(PATIENTS[0].id);
  const [charts, setCharts] = useState<Record<string, ChartState>>({});
  const [pickerOpen, setPickerOpen] = useState(false);
  const [panel, setPanel] = useState<PanelKind | null>(null);

  const openPatient = useCallback((id: string) => {
    setTabs((t) => (t.includes(id) ? t : [...t, id]));
    setActiveId(id);
    setPickerOpen(false);
  }, []);

  const closePatient = (id: string) => {
    const i = tabs.indexOf(id);
    const next = tabs.filter((t) => t !== id);
    setTabs(next);
    if (activeId === id) setActiveId(next[Math.min(i, next.length - 1)] ?? null);
    setCharts((c) => {
      const rest = { ...c };
      delete rest[id];
      return rest;
    });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPickerOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const closePanel = useCallback(() => setPanel(null), []);

  if (!todayKey) return <div className="grid h-screen place-items-center text-sm text-ink-faint">読み込み中…</div>;
  const today = parseIso(todayKey);

  const patient = activeId ? findPatient(activeId) : undefined;
  const chart = (activeId && charts[activeId]) || newChart();
  const update = (patch: Partial<ChartState>) => {
    if (!activeId) return;
    setCharts((c) => ({ ...c, [activeId]: { ...(c[activeId] ?? newChart()), ...patch } }));
  };
  const entries: HistoryEntry[] = patient?.history ?? [];

  return (
    <div className="flex h-screen flex-col">
      <PatientTabs
        tabs={tabs.map((id) => findPatient(id)!).filter(Boolean)}
        activeId={activeId}
        onSelect={(id) => {
          setActiveId(id);
          setPanel(null);
        }}
        onClose={closePatient}
        onOpenPicker={() => setPickerOpen(true)}
      />

      {patient ? (
        <>
          <PatientBar patient={patient} today={today} />
          <div className="grid min-h-0 flex-1 grid-cols-[150px_minmax(0,1fr)_minmax(0,1.15fr)_68px]">
            <DateTree
              patient={patient}
              entries={entries}
              today={today}
              selectedDay={chart.selectedDay}
              onSelect={(d) => update({ selectedDay: d })}
            />
            <HistoryPane
              patient={patient}
              entries={entries}
              today={today}
              selectedDay={chart.selectedDay}
              showStopped={chart.showStopped}
              onToggleStopped={() => update({ showStopped: !chart.showStopped })}
            />
            <div className="relative flex min-h-0 flex-col">
              <TodayPane
                patient={patient}
                today={today}
                note={chart.note}
                onNoteChange={(v) => update({ note: v })}
                instruction={chart.instruction}
                onInstructionChange={(v) => update({ instruction: v })}
              />
              {panel === "results" && (
                <Drawer title="検査結果" onClose={closePanel} wide>
                  <ResultsPanel patient={patient} today={today} />
                </Drawer>
              )}
              {panel === "imaging" && (
                <Drawer title="放射線画像" onClose={closePanel} wide>
                  <ImagingPanel patient={patient} today={today} />
                </Drawer>
              )}
              {panel === "active-orders" && (
                <Drawer title="有効なオーダ" onClose={closePanel}>
                  <ActiveOrdersPanel entries={entries} today={today} />
                </Drawer>
              )}
              {(panel === "add-injection" || panel === "add-lab") && (
                <Drawer title={panel === "add-injection" ? "注射を足す" : "検体検査を足す"} onClose={closePanel}>
                  <p className="text-sm text-ink-faint">準備中です。</p>
                </Drawer>
              )}
            </div>
            <ToolRail open={panel} onOpen={setPanel} />
          </div>
        </>
      ) : (
        <div className="grid flex-1 place-items-center">
          <button type="button" onClick={() => setPickerOpen(true)} className="rounded-md border border-rule bg-sheet px-4 py-2 text-sm">
            患者を開く（⌘K）
          </button>
        </div>
      )}

      {pickerOpen && <PatientPicker patients={PATIENTS} openIds={tabs} onOpen={openPatient} onClose={() => setPickerOpen(false)} />}
    </div>
  );
}
