"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { AiDraftResponse } from "@/lib/ai-schema";
import { addDays, formatShort, isoDate, nowTimeInTokyo, todayInTokyo, type CalendarDate } from "@/lib/dates";
import { checkDraft, draftsFromAi, isReady, toOrder, type CheckContext, type Draft, type Issue, type StopDraft } from "@/lib/drafts";
import { orderLines } from "@/lib/format";
import { anyDrugName } from "@/lib/master";
import { admitFromEr, type AdmitForm } from "@/lib/admission";
import { initialErPatients, type ErPatient, type ErStatus } from "@/lib/er";
import { abs } from "@/lib/flowsheet";
import { PATIENTS } from "@/lib/patients";
import { BEDS, type BedAssignment, type WardState } from "@/lib/ward";
import { currentEntries } from "@/lib/record";
import type { DayOffset, HistoryEntry, OrderEntry, Patient } from "@/lib/types";
import { DateTree } from "./DateTree";
import { EmergencyBoard } from "./EmergencyBoard";
import { HistoryPane, type LeftView } from "./HistoryPane";
import { PatientBar } from "./PatientBar";
import { PatientPicker } from "./PatientPicker";
import { PatientList } from "./PatientList";
import { PatientTabs, type PinnedTab } from "./PatientTabs";
import { TodayPane, type DraftMeta } from "./TodayPane";
import { ToolRail, type PanelKind } from "./ToolRail";
import { WardMap, type ChartSummary } from "./WardMap";
import { ActiveOrdersPanel } from "./panels/ActiveOrdersPanel";
import { AddInjectionPanel, AddLabPanel } from "./panels/AddPanels";
import { Drawer } from "./panels/Drawer";
import { ImagingPanel } from "./panels/ImagingPanel";
import { ResultsPanel } from "./panels/ResultsPanel";

const NOTE_TEMPLATE = "S)\nO)\nA)\nP)\n";
const DOCTOR = "山本（専攻医）";

/** Per-patient working state. Kept while the tab is open, so switching tabs loses nothing. */
interface ChartState {
  selectedDay: DayOffset | null;
  showStopped: boolean;
  leftView: LeftView;
  note: string;
  instruction: string;
  drafts: Draft[];
  /** Orders confirmed today in this session. */
  added: OrderEntry[];
  /** Orders stopped today in this session. */
  stopped: string[];
  drafting: boolean;
  error: string | null;
  meta: DraftMeta | null;
  flash: string | null;
}

const newChart = (): ChartState => ({
  selectedDay: null,
  showStopped: false,
  leftView: "record",
  note: NOTE_TEMPLATE,
  instruction: "",
  drafts: [],
  added: [],
  stopped: [],
  drafting: false,
  error: null,
  meta: null,
  flash: null,
});

// "Today" and "now" come from the browser clock in Japan time. The server never renders
// them, so the page cannot disagree with itself across midnight.
const noSubscribe = () => () => {};
const everyFifteenSeconds = (cb: () => void) => {
  const t = setInterval(cb, 15_000);
  return () => clearInterval(t);
};
const clientToday = () => isoDate(todayInTokyo());
const clientNow = () => nowTimeInTokyo();
const serverNull = () => null;

function parseIso(s: string): CalendarDate {
  const [y, m, d] = s.split("-").map(Number);
  return { y, m, d };
}

const newId = () => crypto.randomUUID();

/** Short line for the P) section of today's note, written by code from the confirmed order. */
function planLine(entry: OrderEntry, today: CalendarDate): string {
  const { main, detail } = orderLines(entry.order, today);
  return `・${main}　${detail}`;
}

export default function WardApp() {
  const todayKey = useSyncExternalStore(noSubscribe, clientToday, serverNull);
  const nowTime = useSyncExternalStore(everyFifteenSeconds, clientNow, serverNull);
  const [tabs, setTabs] = useState<string[]>([PATIENTS[0].id]);
  const [activeId, setActiveId] = useState<string | null>(PATIENTS[0].id);
  const [charts, setCharts] = useState<Record<string, ChartState>>({});
  const [pickerOpen, setPickerOpen] = useState(false);
  const [panel, setPanel] = useState<PanelKind | null>(null);
  // The ward map is the pinned first tab and the start screen; then the patient list and the ED board.
  const [screen, setScreen] = useState<PinnedTab | "chart">("map");
  // Patients admitted today from the ED, and the beds they took. Kept in this browser only.
  const [admitted, setAdmitted] = useState<Patient[]>([]);
  const [newBeds, setNewBeds] = useState<BedAssignment[]>([]);
  const [er, setEr] = useState<ErPatient[]>(() => (typeof window === "undefined" ? [] : initialErPatients(abs(0, nowTimeInTokyo()))));

  const allPatients = useMemo(() => [...PATIENTS, ...admitted], [admitted]);
  const findPatient = useCallback((id: string) => allPatients.find((p) => p.id === id), [allPatients]);
  const ward: WardState = useMemo(() => ({ beds: [...BEDS, ...newBeds], patient: findPatient }), [newBeds, findPatient]);

  const openPatient = useCallback((id: string) => {
    setTabs((t) => (t.includes(id) ? t : [...t, id]));
    setActiveId(id);
    setScreen("chart");
    setPanel(null);
    setPickerOpen(false);
  }, []);

  const closePatient = (id: string) => {
    const i = tabs.indexOf(id);
    const next = tabs.filter((t) => t !== id);
    setTabs(next);
    if (activeId === id) setActiveId(next[Math.min(i, next.length - 1)] ?? null);
    if (next.length === 0) setScreen("map");
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

  const patient = activeId ? findPatient(activeId) : undefined;
  const chart = (activeId && charts[activeId]) || newChart();
  const today = useMemo(() => (todayKey ? parseIso(todayKey) : null), [todayKey]);

  // The record as it stands now: history, with today's stops applied, plus today's confirmed orders.
  const entries: HistoryEntry[] = useMemo(
    () => (patient ? currentEntries(patient, { added: chart.added, stopped: chart.stopped }) : []),
    [patient, chart.stopped, chart.added],
  );

  const ctx: CheckContext | null = useMemo(() => {
    if (!today || !nowTime) return null;
    const orders = entries.filter((e): e is OrderEntry => e.kind === "order");
    return {
      activeOrders: orders.filter((o) => o.status === "有効"),
      labOrders: orders.filter((o) => o.order.type === "lab" && o.status !== "中止"),
      drafts: chart.drafts,
      nowTime,
      fmtDay: (d) => formatShort(addDays(today, d)),
      describe: (o) => {
        const { main, detail } = orderLines(o.order, today);
        return `${main}（${detail}）`;
      },
    };
  }, [entries, chart.drafts, nowTime, today]);

  const issues: Record<string, Issue[]> = useMemo(() => {
    if (!ctx) return {};
    return Object.fromEntries(chart.drafts.map((d) => [d.id, checkDraft(d, ctx)]));
  }, [chart.drafts, ctx]);

  if (!today || !nowTime || (patient && !ctx)) {
    return <div className="grid h-screen place-items-center text-sm text-ink-faint">読み込み中…</div>;
  }

  const update = (patch: Partial<ChartState> | ((c: ChartState) => Partial<ChartState>)) => {
    if (!activeId) return;
    const id = activeId;
    setCharts((all) => {
      const cur = all[id] ?? newChart();
      const p = typeof patch === "function" ? patch(cur) : patch;
      return { ...all, [id]: { ...cur, ...p } };
    });
  };

  const requestDrafts = async () => {
    const text = chart.instruction.trim();
    if (!text) return;
    update({ drafting: true, error: null, flash: null });
    try {
      const res = await fetch("/api/draft", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `エラー（${res.status}）`);
      const parsed = AiDraftResponse.safeParse(json.result);
      if (!parsed.success) throw new Error("下書きの形が正しくありませんでした。");
      const drafts = draftsFromAi(parsed.data, newId);
      update((c) => ({ drafts: [...c.drafts, ...drafts], instruction: "", drafting: false, meta: json.meta ?? null }));
    } catch (e) {
      update({ drafting: false, error: e instanceof Error ? e.message : "下書きを作れませんでした。" });
    }
  };

  const confirm = () => {
    if (!ctx) return;
    if (!chart.drafts.every((d) => isReady(issues[d.id] ?? []))) return;
    const added: OrderEntry[] = [];
    const stops: string[] = [];
    for (const d of chart.drafts) {
      const r = toOrder(d, ctx);
      stops.push(...r.stopIds);
      if (r.order) added.push({ kind: "order", id: newId(), day: 0, time: nowTime, author: DOCTOR, status: "有効", order: r.order });
    }
    const stoppedEntries = entries.filter((e): e is OrderEntry => e.kind === "order" && stops.includes(e.id));
    const lines = [
      ...stoppedEntries.map((e) => {
        const o = e.order;
        const name = o.type === "injection" ? anyDrugName(o.items[0].drugCode) : o.type === "prescription" ? anyDrugName(o.drugCode) : "";
        return `・${name} 中止`;
      }),
      ...added.map((e) => planLine(e, today)),
    ];
    update((c) => ({
      added: [...c.added, ...added],
      stopped: [...c.stopped, ...stops],
      drafts: [],
      note: lines.length ? `${c.note.replace(/\s*$/, "")}\n${lines.join("\n")}\n` : c.note,
      flash: `${added.length + stops.length}件を確定しました。左の経過と記事の P) に入りました。`,
      selectedDay: 0,
    }));
  };

  const admit = (from: ErPatient, form: AdmitForm) => {
    const id = `9002${String(admitted.length + 1).padStart(4, "0")}`;
    const { patient: p, bed } = admitFromEr(from, form, id, nowTime);
    setAdmitted((a) => [...a, p]);
    setNewBeds((b) => [...b, bed]);
    setEr((list) => list.map((x) => (x.id === from.id ? { ...x, status: "入院済", admittedAs: id } : x)));
    openPatient(id);
  };

  const addManualLab = (draft: Draft) => update((c) => ({ drafts: [...c.drafts, draft] }));
  // A stop chosen on a calendar becomes a draft like any other; the doctor confirms it on the right.
  const addStopDraft = (entry: OrderEntry) => {
    const o = entry.order;
    const drugCode = o.type === "injection" ? o.items[0].drugCode : o.type === "prescription" ? o.drugCode : null;
    if (!drugCode) return;
    const draft: StopDraft = {
      id: newId(),
      origin: "manual",
      sourceText: "（カレンダーから）",
      comment: null,
      kind: "stop",
      drugCode,
      said: anyDrugName(drugCode),
      targetOrderId: entry.id,
    };
    update((c) => (c.drafts.some((d) => d.kind === "stop" && d.targetOrderId === entry.id) ? {} : { drafts: [...c.drafts, draft], flash: null }));
  };
  // Append to the instruction box, adding a sentence break when needed.
  const insertText = (text: string) =>
    update((c) => {
      const cur = c.instruction.replace(/\s*$/, "");
      return { instruction: cur ? `${cur}${/[。、]$/.test(cur) ? "" : "。"}${text}` : text };
    });

  const summaries: Record<string, ChartSummary> = Object.fromEntries(
    Object.entries(charts).map(([id, c]) => [id, { drafts: c.drafts.length, confirmedToday: c.added.length + c.stopped.length }]),
  );
  const wideLeft = chart.leftView !== "record";

  return (
    <div className="flex h-screen flex-col">
      <PatientTabs
        tabs={tabs.map((id) => findPatient(id)!).filter(Boolean)}
        activeId={screen === "chart" ? activeId : null}
        pinned={screen === "chart" ? null : screen}
        onSelectPinned={(t) => {
          setScreen(t);
          setPanel(null);
        }}
        onSelect={(id) => {
          setActiveId(id);
          setScreen("chart");
          setPanel(null);
        }}
        onClose={closePatient}
        onOpenPicker={() => setPickerOpen(true)}
      />

      {screen === "map" ? (
        <WardMap ward={ward} summaries={summaries} onOpen={openPatient} />
      ) : screen === "er" ? (
        <EmergencyBoard
          patients={er}
          nowAbs={abs(0, nowTime)}
          ward={ward}
          onRegister={(p) => setEr((list) => [...list, p])}
          onStatus={(id, st: ErStatus) => setEr((list) => list.map((p) => (p.id === id ? { ...p, status: st } : p)))}
          onAdmit={admit}
          onOpenChart={openPatient}
        />
      ) : screen === "list" ? (
        <PatientList
          ward={ward}
          nowTime={nowTime}
          changes={Object.fromEntries(Object.entries(charts).map(([id, c]) => [id, { added: c.added, stopped: c.stopped }]))}
          summaries={summaries}
          onOpen={openPatient}
        />
      ) : patient && ctx ? (
        <>
          <PatientBar patient={patient} today={today} />
          <div
            className={`grid min-h-0 flex-1 ${
              wideLeft ? "grid-cols-[150px_minmax(0,1.6fr)_minmax(0,1fr)_68px]" : "grid-cols-[150px_minmax(0,1fr)_minmax(0,1.2fr)_68px]"
            }`}
          >
            <DateTree patient={patient} entries={entries} today={today} selectedDay={chart.selectedDay} onSelect={(d) => update({ selectedDay: d })} />
            <HistoryPane
              patient={patient}
              entries={entries}
              today={today}
              nowTime={nowTime}
              selectedDay={chart.selectedDay}
              onSelectDay={(d) => update({ selectedDay: d })}
              showStopped={chart.showStopped}
              onToggleStopped={() => update({ showStopped: !chart.showStopped })}
              view={chart.leftView}
              onView={(v) => update({ leftView: v })}
              onStopDraft={addStopDraft}
              draftedStops={chart.drafts.flatMap((d) => (d.kind === "stop" && d.targetOrderId ? [d.targetOrderId] : []))}
            />
            <div className="relative flex min-h-0 flex-col">
              <TodayPane
                patient={patient}
                today={today}
                note={chart.note}
                onNoteChange={(v) => update({ note: v })}
                instruction={chart.instruction}
                onInstructionChange={(v) => update({ instruction: v })}
                onAppendInstruction={insertText}
                drafts={chart.drafts}
                issues={issues}
                ctx={ctx}
                drafting={chart.drafting}
                error={chart.error}
                meta={chart.meta}
                flash={chart.flash}
                onDraft={requestDrafts}
                onApply={(next) => update((c) => ({ drafts: c.drafts.map((d) => (d.id === next.id ? next : d)), flash: null }))}
                onRemove={(id) => update((c) => ({ drafts: c.drafts.filter((d) => d.id !== id) }))}
                onRedo={(id) =>
                  update((c) => {
                    const d = c.drafts.find((x) => x.id === id);
                    return {
                      drafts: c.drafts.filter((x) => x.id !== id),
                      instruction: d ? (c.instruction ? `${c.instruction}。${d.sourceText}` : d.sourceText) : c.instruction,
                    };
                  })
                }
                onConfirm={confirm}
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
              {panel === "add-injection" && (
                <Drawer title="注射（マスターから選ぶ）" onClose={closePanel}>
                  <AddInjectionPanel onPick={insertText} />
                </Drawer>
              )}
              {panel === "add-lab" && (
                <Drawer title="検体検査（マスターから選ぶ）" onClose={closePanel}>
                  <AddLabPanel onAdd={(d) => { addManualLab(d); closePanel(); }} newId={newId} />
                </Drawer>
              )}
            </div>
            <ToolRail
              open={panel}
              onOpen={setPanel}
              leftView={chart.leftView}
              onLeftView={(v) => update({ leftView: v })}
            />
          </div>
        </>
      ) : (
        <div className="grid flex-1 place-items-center">
          <button type="button" onClick={() => setPickerOpen(true)} className="rounded-md border border-rule bg-sheet px-4 py-2 text-sm">
            患者を開く（⌘K）
          </button>
        </div>
      )}

      {pickerOpen && <PatientPicker patients={allPatients} openIds={tabs} onOpen={openPatient} onClose={() => setPickerOpen(false)} />}
    </div>
  );
}
