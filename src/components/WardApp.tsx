"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { AiDraftResponse } from "@/lib/ai-schema";
import { addDays, formatShort, isoDate, nowTimeInTokyo, todayInTokyo, type CalendarDate } from "@/lib/dates";
import { checkDraft, draftsFromAi, isReady, toOrder, type CheckContext, type Draft, type Issue, type StopDraft } from "@/lib/drafts";
import { orderLines, procedureTitle } from "@/lib/format";
import { anyDrugName } from "@/lib/master";
import { admitFromEr, type AdmitForm } from "@/lib/admission";
import { INITIAL_DIAGNOSES, UNCODED, type Diagnosis } from "@/lib/diagnoses";
import { DEFAULT_OPTIONS, type BillingOptions } from "@/lib/billing/model";
import { patientMonthPayload } from "@/lib/billing/payload";
import { BillingView } from "./BillingView";
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
import { Worksheet } from "./Worksheet";
import { PharmacyView, type ShidoRecord } from "./PharmacyView";
import { PharmacyInbox } from "./PharmacyInbox";
import { DialysisView } from "./DialysisView";
import { SurgeryView } from "./SurgeryView";
import { initialSurgeries, type Surgery } from "@/lib/surgery";
import { HD_PATIENTS, initialHdSessions, type HdPatient, type HdSession } from "@/lib/dialysis";
import { b008Check, ordersFromReport, type BroughtReport, type Query } from "@/lib/pharmacy";
import { orderChanges, sessionChangeKeys, type WorkPatient } from "@/lib/worksheet";
import { ActiveOrdersPanel } from "./panels/ActiveOrdersPanel";
import { AddInjectionPanel, AddLabPanel, AddProcedurePanel, AddRxPanel } from "./panels/AddPanels";
import { DiagnosisPanel } from "./panels/DiagnosisPanel";
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
  /** When each of them was stopped ("HH:MM"). */
  stopTimes: Record<string, string>;
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
  stopTimes: {},
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
  // Registered diagnoses per patient (official 傷病名マスター codes). Kept in this browser only.
  const [diagnoses, setDiagnoses] = useState<Record<string, Diagnosis[]>>(INITIAL_DIAGNOSES);
  // 加算 that depend on the patient's state, entered by a person on the 算定 screen. Kept in this browser only.
  const [billing, setBilling] = useState<Record<string, BillingOptions>>({});
  // 指示受け by a nurse: change key → time. Kept in this browser only.
  const [taken, setTaken] = useState<Record<string, string>>({});
  // Pharmacy work (all kept in this browser only).
  const [audited, setAudited] = useState<Record<string, string>>({});
  const [queries, setQueries] = useState<Query[]>([]);
  const [reports, setReports] = useState<BroughtReport[]>([]);
  const [shido, setShido] = useState<Record<string, ShidoRecord[]>>({});
  const [dispensed, setDispensed] = useState<Record<string, string>>({});
  // Dialysis unit (fictional; kept in this browser only).
  const [hdPatients, setHdPatients] = useState<HdPatient[]>(HD_PATIENTS);
  const [hdSessions, setHdSessions] = useState<Record<string, HdSession>>(() => (typeof window === "undefined" ? {} : initialHdSessions(nowTimeInTokyo())));
  // Operating rooms (fictional schedule relative to now; kept in this browser only).
  const [surgeries, setSurgeries] = useState<Surgery[]>(() => (typeof window === "undefined" ? [] : initialSurgeries(abs(0, nowTimeInTokyo()))));
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
    () => (patient ? currentEntries(patient, { added: chart.added, stopped: chart.stopped, stopTimes: chart.stopTimes }) : []),
    [patient, chart.stopped, chart.stopTimes, chart.added],
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
      allergies: patient?.allergies ?? [],
    };
  }, [entries, chart.drafts, nowTime, today, patient]);

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

  const updateFor = (id: string, patch: (c: ChartState) => Partial<ChartState>) =>
    setCharts((all) => {
      const cur = all[id] ?? newChart();
      return { ...all, [id]: { ...cur, ...patch(cur) } };
    });

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
      for (const o of [...(r.order ? [r.order] : []), ...(r.orders ?? [])]) added.push({ kind: "order", id: newId(), day: 0, time: nowTime, author: DOCTOR, status: "有効", order: o });
    }
    const stoppedEntries = entries.filter((e): e is OrderEntry => e.kind === "order" && stops.includes(e.id));
    const lines = [
      ...stoppedEntries.map((e) => {
        const o = e.order;
        const name =
          o.type === "injection" ? anyDrugName(o.items[0].drugCode) : o.type === "prescription" ? anyDrugName(o.drugCode) : o.type === "procedure" ? procedureTitle(o) : "";
        return `・${name} 中止`;
      }),
      ...added.map((e) => planLine(e, today)),
    ];
    update((c) => ({
      added: [...c.added, ...added],
      stopped: [...c.stopped, ...stops],
      stopTimes: { ...c.stopTimes, ...Object.fromEntries(stops.map((id) => [id, nowTime])) },
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
    // The admission diagnosis typed in the ED is kept as 未コード化傷病名 until a master name is chosen.
    setDiagnoses((all) => ({
      ...all,
      [id]: [{ id: newId(), code: UNCODED, name: form.diagnosis.trim(), prefixes: [], suffixes: [], main: true, start: 0, outcome: "継続" }],
    }));
    setEr((list) => list.map((x) => (x.id === from.id ? { ...x, status: "入院済", admittedAs: id } : x)));
    openPatient(id);
  };

  const addManualLab = (draft: Draft) => update((c) => ({ drafts: [...c.drafts, draft], flash: null }));
  // A stop chosen on a calendar becomes a draft like any other; the doctor confirms it on the right.
  const addStopDraft = (entry: OrderEntry, source = "（カレンダーから）") => {
    const o = entry.order;
    const drugCode = o.type === "injection" ? o.items[0].drugCode : o.type === "prescription" ? o.drugCode : null;
    const procCode = o.type === "procedure" ? o.code : null;
    if (!drugCode && !procCode) return;
    const draft: StopDraft = {
      id: newId(),
      origin: "manual",
      sourceText: source,
      comment: null,
      kind: "stop",
      drugCode,
      ...(procCode ? { procCode } : {}),
      said: o.type === "procedure" ? procedureTitle(o) : anyDrugName(drugCode!),
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

  const sessionChanges = Object.fromEntries(Object.entries(charts).map(([id, c]) => [id, { added: c.added, stopped: c.stopped, stopTimes: c.stopTimes }]));
  // Our patients with their bed and the record as it stands now (for the worksheet and the list).
  const people: WorkPatient[] = ward.beds.flatMap((b) => {
    const p = b.patientId ? findPatient(b.patientId) : undefined;
    if (!p) return [];
    const entries = currentEntries(p, sessionChanges[p.id]).filter((e): e is OrderEntry => e.kind === "order");
    return [{ patient: p, room: `${b.room}${b.bed}`, entries }];
  });

  // 指示受けがまだ: this session's new orders and stops that no nurse has taken yet.
  const sessionKeys = sessionChangeKeys(sessionChanges);
  const waiting: Record<string, number> = {};
  for (const c of orderChanges(people, -1440, abs(0, nowTime))) {
    if (sessionKeys.has(c.key) && !taken[c.key]) waiting[c.patientId] = (waiting[c.patientId] ?? 0) + 1;
  }

  const summaries: Record<string, ChartSummary> = Object.fromEntries(
    Object.entries(charts).map(([id, c]) => [id, { drafts: c.drafts.length, confirmedToday: c.added.length + c.stopped.length, waiting: waiting[id] ?? 0 }]),
  );
  const wideLeft = chart.leftView !== "record";

  return (
    <div className="flex h-screen flex-col print:hidden">
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
          today={today}
          onRegister={(p) => setEr((list) => [...list, p])}
          onUpdate={(p) => setEr((list) => list.map((x) => (x.id === p.id ? p : x)))}
          onStatus={(id, st: ErStatus) => setEr((list) => list.map((p) => (p.id === id ? { ...p, status: st } : p)))}
          onAdmit={admit}
          onOpenChart={openPatient}
        />
      ) : screen === "sheet" ? (
        <Worksheet
          people={people}
          today={today}
          nowTime={nowTime}
          taken={taken}
          sessionKeys={sessionKeys}
          onTake={(keys) => setTaken((t) => ({ ...t, ...Object.fromEntries(keys.map((k) => [k, nowTime])) }))}
        />
      ) : screen === "or" ? (
        <SurgeryView
          today={today}
          nowAbs={abs(0, nowTime)}
          surgeries={surgeries}
          people={people}
          onSave={(x) => setSurgeries((list) => (list.some((y) => y.id === x.id) ? list.map((y) => (y.id === x.id ? x : y)) : [...list, x]))}
        />
      ) : screen === "dialysis" ? (
        <DialysisView
          today={today}
          nowTime={nowTime}
          patients={hdPatients}
          sessions={hdSessions}
          onPatient={(p) => setHdPatients((list) => list.map((x) => (x.id === p.id ? p : x)))}
          onSession={(id, s) => setHdSessions((all) => ({ ...all, [id]: s }))}
        />
      ) : screen === "pharmacy" ? (
        <PharmacyView
          people={people}
          today={today}
          nowTime={nowTime}
          audited={audited}
          onAudit={(id) => setAudited((a) => ({ ...a, [id]: nowTime }))}
          queries={queries}
          onAsk={(q) => setQueries((qs) => [...qs, { ...q, id: newId(), askedAt: nowTime, by: "薬剤師 小林", status: "回答待ち" }])}
          reports={reports}
          onReport={(r) => setReports((rs) => [...rs, { ...r, id: newId(), at: nowTime, by: "薬剤師 小林", status: "医師へ報告" }])}
          shido={shido}
          onShido={(pid, rec) => {
            const days = (shido[pid] ?? []).map((x) => x.day);
            const dow = (d: number) => new Date(Date.UTC(today.y, today.m - 1, today.d + d)).getUTCDay();
            const month = (d: number) => {
              const t = new Date(Date.UTC(today.y, today.m - 1, today.d + d));
              return `${t.getUTCFullYear()}-${t.getUTCMonth() + 1}`;
            };
            if (!b008Check(days, 0, dow, month)) {
              setBilling((all) => {
                const cur = all[pid] ?? DEFAULT_OPTIONS;
                return { ...all, [pid]: { ...cur, yakuzaiShido: [...cur.yakuzaiShido, { day: 0, kind: rec.kind }] } };
              });
            }
            setShido((all) => ({ ...all, [pid]: [...(all[pid] ?? []), { ...rec, day: 0, at: nowTime }] }));
          }}
          dispensed={dispensed}
          onDispense={(key) => setDispensed((d) => ({ ...d, [key]: nowTime }))}
        />
      ) : screen === "list" ? (
        <PatientList
          ward={ward}
          nowTime={nowTime}
          changes={sessionChanges}
          summaries={summaries}
          waiting={waiting}
          onOpen={openPatient}
        />
      ) : patient && ctx ? (
        <>
          <PatientBar patient={patient} today={today} diagnoses={diagnoses[patient.id] ?? []} onOpenDiagnoses={() => setPanel("diagnoses")} />
          <div
            className={`grid min-h-0 flex-1 ${
              wideLeft ? "grid-cols-[150px_minmax(0,1.6fr)_minmax(0,1fr)_68px]" : "grid-cols-[150px_minmax(0,1fr)_minmax(0,1.2fr)_68px]"
            }`}
          >
            <DateTree patient={patient} entries={entries} today={today} selectedDay={chart.selectedDay} onSelect={(d) => update({ selectedDay: d })} />
            {panel === "billing" ? (
              <div className="col-span-2 flex min-h-0 flex-col">
                <BillingView
                  key={patient.id}
                  patient={patient}
                  entries={entries}
                  diagnoses={diagnoses[patient.id] ?? []}
                  today={today}
                  nowTime={nowTime}
                  options={billing[patient.id] ?? DEFAULT_OPTIONS}
                  onOptions={(next) => setBilling((all) => ({ ...all, [patient.id]: next }))}
                  wardPayload={() =>
                    allPatients.map((p) => {
                      const c = charts[p.id];
                      return patientMonthPayload(p, currentEntries(p, c ? { added: c.added, stopped: c.stopped, stopTimes: c.stopTimes } : undefined), diagnoses[p.id] ?? [], billing[p.id] ?? DEFAULT_OPTIONS);
                    })
                  }
                />
              </div>
            ) : (
              <>
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
              <PharmacyInbox
                today={today}
                entries={entries.filter((e): e is OrderEntry => e.kind === "order")}
                queries={queries.filter((q) => q.patientId === patient.id)}
                reports={reports.filter((r) => r.patientId === patient.id)}
                onChange={(q) => {
                  const e = entries.find((x): x is OrderEntry => x.kind === "order" && x.id === q.orderId);
                  if (e) addStopDraft(e, "（疑義照会から）");
                  setQueries((qs) => qs.map((x) => (x.id === q.id ? { ...x, status: "変更", answeredAt: nowTime } : x)));
                  update({ flash: "前のオーダの中止の下書きを作りました。正しい内容を話すか打って、まとめて確定してください。" });
                }}
                onKeep={(q, answer) => setQueries((qs) => qs.map((x) => (x.id === q.id ? { ...x, status: "変更なし", answer: answer.trim() || undefined, answeredAt: nowTime } : x)))}
                onDecide={(r, rows) => {
                  const orders = ordersFromReport({ ...r, rows }, nowTime);
                  const added: OrderEntry[] = orders.map((o) => ({ kind: "order", id: newId(), day: 0, time: nowTime, author: DOCTOR, status: "有効", order: o }));
                  const stopped = rows.filter((x) => x.decision === "中止").map((x) => `・持参薬 ${x.said} ${x.strength}：中止（鑑別報告より）`);
                  updateFor(patient.id, (c) => ({
                    added: [...c.added, ...added],
                    note: `${c.note.replace(/\s*$/, "")}\n${[...added.map((e) => planLine(e, today)), ...stopped].join("\n")}\n`,
                    flash: `持参薬の指示を確定しました（オーダ ${added.length}件・中止 ${stopped.length}件）。`,
                  }));
                  setReports((rs) => rs.map((x) => (x.id === r.id ? { ...x, rows, status: "指示済" } : x)));
                }}
              />
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
              {panel === "diagnoses" && (
                <Drawer title="病名" onClose={closePanel} wide>
                  <DiagnosisPanel
                    diagnoses={diagnoses[patient.id] ?? []}
                    admittedOn={patient.admittedOn}
                    today={today}
                    newId={newId}
                    onChange={(next) => setDiagnoses((all) => ({ ...all, [patient.id]: next }))}
                  />
                </Drawer>
              )}
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
              {panel === "add-rx" && (
                <Drawer title="処方（Rp 入力）" onClose={closePanel} wide>
                  <AddRxPanel onAdd={(ds) => { update((c) => ({ drafts: [...c.drafts, ...ds], flash: null })); closePanel(); }} newId={newId} />
                </Drawer>
              )}
              {panel === "add-procedure" && (
                <Drawer title="処置（マスターから選ぶ）" onClose={closePanel}>
                  <AddProcedurePanel onAdd={(d) => { addManualLab(d); closePanel(); }} newId={newId} />
                </Drawer>
              )}
              {panel === "add-lab" && (
                <Drawer title="検体検査（マスターから選ぶ）" onClose={closePanel}>
                  <AddLabPanel onAdd={(d) => { addManualLab(d); closePanel(); }} newId={newId} />
                </Drawer>
              )}
            </div>
              </>
            )}
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
