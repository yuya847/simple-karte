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
import type { DayOffset, HistoryEntry, NoteEntry, OrderEntry, Patient, VitalSign } from "@/lib/types";
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
import { AddImagingPanel, AddInjectionPanel, AddLabPanel, AddPhysioPanel, AddProcedurePanel, AddRxPanel } from "./panels/AddPanels";
import { latestCre } from "@/lib/exams";
import { ConsentPanel } from "./panels/ConsentPanel";
import { VitalsPanel } from "./panels/VitalsPanel";
import { VerbalInbox } from "./VerbalInbox";
import { DirectivePanel } from "./panels/DirectivePanel";
import { DietPanel } from "./panels/DietPanel";
import { DischargePanel } from "./panels/DischargePanel";
import type { DischargeDraft } from "@/lib/discharge";
import type { TdmReport } from "@/lib/tdm";
import { INITIAL_DIETS, MEALS, dietAt, dietLabel, nextMeal, type DietOrder } from "@/lib/diet";
import { INITIAL_DIRECTIVES, bandLabel, current as currentDirective, directiveLine, type AdvanceDirective } from "@/lib/directives";
import { AuditView } from "./AuditView";
import { ChatThread, ChatView } from "./ChatView";
import { AcuityView } from "./AcuityView";
import { HandoffView } from "./HandoffView";
import { LabView } from "./LabView";
import { AdmitEvalView } from "./AdmitEvalView";
import { deliriumBillable, dischargeSupportMet, duesOf, initialEvals, type AdmitEval } from "@/lib/admit-eval";
import { ResultsInbox } from "./ResultsInbox";
import { PANIC_LIMITS, PANIC_SOURCE, cultureArrivals, hitLine, mergeCultures, resultsOf, uncalled, unseen, type Ack, type PanicCall } from "@/lib/results";
import type { Handoff } from "@/lib/handoff";
import { FICTIONAL_AMBULANCE, INITIAL_B, type BRecord } from "@/lib/acuity";
import { patientChannel } from "@/lib/chat";
import { CLAUDE, auditLog } from "@/lib/audit";
import { overdue, type AdminRecord } from "@/lib/mar";
import { buildWorksheet } from "@/lib/worksheet";
import { news2 } from "@/lib/news2";
import { findConsent, type ConsentCode, type ConsentRecord } from "@/lib/consent";
import { DiagnosisPanel } from "./panels/DiagnosisPanel";
import { RoleProvider } from "./RoleContext";
import { STAFF, TABS, denyReason, home, type Role } from "@/lib/roles";
import { noteKey, noteTemplate, parseNote, reviseNote } from "@/lib/notes";
import { Drawer } from "./panels/Drawer";
import { ImagingPanel } from "./panels/ImagingPanel";
import { ResultsPanel } from "./panels/ResultsPanel";

const NOTE_TEMPLATE = "S)\nO)\nA)\nP)\n";
/** The attending doctor of the four ward patients (fictional). */
const DOCTOR = STAFF.医師.name;

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
  const [screen, setScreen] = useState<PinnedTab | "chart">(home("医師"));
  // Who is using the chart. The demo picks a role instead of logging in.
  const [role, setRole] = useState<Role>("医師");
  const me = STAFF[role];
  const deny = (a: Parameters<typeof denyReason>[1]) => denyReason(role, a);
  // Patients admitted today from the ED, and the beds they took. Kept in this browser only.
  const [admitted, setAdmitted] = useState<Patient[]>([]);
  const [newBeds, setNewBeds] = useState<BedAssignment[]>([]);
  // Registered diagnoses per patient (official 傷病名マスター codes). Kept in this browser only.
  const [diagnoses, setDiagnoses] = useState<Record<string, Diagnosis[]>>(INITIAL_DIAGNOSES);
  // 加算 that depend on the patient's state, entered by a person on the 算定 screen. Kept in this browser only.
  const [billing, setBilling] = useState<Record<string, BillingOptions>>({});
  // Consent forms (fictional). The four patients gave the admission consent on their admission day.
  const [consents, setConsents] = useState<ConsentRecord[]>(() =>
    PATIENTS.map((p) => ({
      id: `consent-adm-${p.id}`,
      patientId: p.id,
      code: "CONSENT-ADMISSION" as const,
      status: "同意" as const,
      createdAt: { day: p.admittedOn, time: "15:00" },
      explainedAt: { day: p.admittedOn, time: "15:30" },
      explainedBy: DOCTOR,
      witness: "看護師（架空）",
      answers: {},
    })),
  );
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

  // Vital signs entered in this session (kept in this browser only), merged into each patient.
  const [extraVitals, setExtraVitals] = useState<Record<string, VitalSign[]>>({});
  // 与薬・実施の記録 (eMAR). Items due before this session are taken as recorded by the earlier shift.
  const [mar, setMar] = useState<Record<string, AdminRecord>>({});
  // A nurse confirming orders is always entering a doctor's spoken order (口頭指示).
  const verbalMode = role === "看護師";
  const [sessionStart, setSessionStart] = useState<number | null>(null);
  if (sessionStart === null && nowTime) setSessionStart(abs(0, nowTime));
  // Advance directives (history kept) and warnings added on the band.
  const [directives, setDirectives] = useState<AdvanceDirective[]>(INITIAL_DIRECTIVES);
  const [diets, setDiets] = useState<DietOrder[]>(INITIAL_DIETS);
  const [tdmReports, setTdmReports] = useState<TdmReport[]>([]);
  const [bRecords, setBRecords] = useState<BRecord[]>(INITIAL_B);
  const [discharges, setDischarges] = useState<Record<string, DischargeDraft>>({});
  const [extraCautions, setExtraCautions] = useState<Record<string, string[]>>({});
  // Notes confirmed in this session, and corrected notes (by key, earlier versions inside).
  const [notes, setNotes] = useState<Record<string, NoteEntry[]>>({});
  const [revised, setRevised] = useState<Record<string, Record<string, NoteEntry>>>({});
  const [handoffs, setHandoffs] = useState<Record<string, Handoff>>({});
  // 入院時の評価（計画書・栄養・褥瘡・転倒転落・せん妄・退院支援）.
  const [evals, setEvals] = useState<Record<string, AdmitEval>>(() => Object.fromEntries(initialEvals().map((e) => [e.patientId, e])));
  // Results the doctor marked as seen, and panic values phoned in by the laboratory.
  const [acks, setAcks] = useState<Record<string, Ack>>({});
  const [calls, setCalls] = useState<Record<string, PanicCall>>({});
  const [arrivedCultures] = useState(() => (typeof window === "undefined" ? {} : cultureArrivals(abs(0, nowTimeInTokyo()))));
  const allPatients = useMemo(
    () =>
      [...PATIENTS, ...admitted].map((p) => {
        const d = currentDirective(directives, p.id);
        const next = nextMeal(nowTime ? abs(0, nowTime) : 0);
        const diet = dietAt(diets, p.id, next.day, next.meal);
        return {
          ...p,
          vitals: [...p.vitals, ...(extraVitals[p.id] ?? [])],
          cultures: mergeCultures(p.cultures, arrivedCultures[p.id]),
          cautions: [...p.cautions, ...(extraCautions[p.id] ?? [])],
          codeStatus: d && d.cpr !== "未確認" ? bandLabel(d) : undefined,
          dietNow: diet ? dietLabel(diet) : undefined,
        };
      }),
    [admitted, extraVitals, extraCautions, directives, diets, nowTime, arrivedCultures],
  );
  const findPatient = useCallback((id: string) => allPatients.find((p) => p.id === id), [allPatients]);
  const ward: WardState = useMemo(() => ({ beds: [...BEDS, ...newBeds], patient: findPatient }), [newBeds, findPatient]);

  const openPatient = useCallback((id: string) => {
    auditLog({ role: me.role, actor: me.name, action: "カルテを開いた", patient: findPatient(id)?.name ?? id });
    setTabs((t) => (t.includes(id) ? t : [...t, id]));
    setActiveId(id);
    setScreen("chart");
    setPanel(null);
    setPickerOpen(false);
  }, [findPatient, me]);

  const closePatient = (id: string) => {
    const i = tabs.indexOf(id);
    const next = tabs.filter((t) => t !== id);
    setTabs(next);
    if (activeId === id) setActiveId(next[Math.min(i, next.length - 1)] ?? null);
    if (next.length === 0) setScreen(home(role));
    // The chart's state stays: today's confirmed orders and notes belong to the record, not to the tab.
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
    () => (patient ? currentEntries(patient, { added: chart.added, stopped: chart.stopped, stopTimes: chart.stopTimes, notes: notes[patient.id], revised: revised[patient.id] }) : []),
    [patient, chart.stopped, chart.stopTimes, chart.added, notes, revised],
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
      consents: consents.filter((c) => c.patientId === patient?.id).map((c) => ({ code: c.code, status: c.status })),
      patientFacts: patient ? { sex: patient.sex, age: patient.age, allergies: patient.allergies, cre: latestCre(patient), heightCm: patient.heightCm, weightKg: patient.weightKg } : null,
    };
  }, [entries, chart.drafts, nowTime, today, patient, consents]);

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
      auditLog({ role: "AI", actor: CLAUDE, action: "下書きを作った", patient: patient?.name, detail: `${drafts.length}件 「${text.slice(0, 50)}${text.length > 50 ? "…" : ""}」${json.meta?.ms ? `（${(json.meta.ms / 1000).toFixed(1)}秒）` : ""}` });
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
    const newConsents: ConsentRecord[] = [];
    for (const d of chart.drafts) {
      const r = toOrder(d, ctx);
      stops.push(...r.stopIds);
      const ids: string[] = [];
      for (const o of [...(r.order ? [r.order] : []), ...(r.orders ?? [])]) {
        const id = newId();
        ids.push(id);
        added.push({ kind: "order", id, day: 0, time: nowTime, author: DOCTOR, status: "有効", order: o, ...(verbalMode ? { verbal: { takenBy: me.name, doctor: DOCTOR, at: { day: 0, time: nowTime } } } : {}) });
      }
      // A consent form to prepare with the order (説明前): the doctor explains before it is done.
      for (const code of r.consents ?? []) newConsents.push({ id: newId(), patientId: patient!.id, code, status: "説明前", orderId: ids[0], createdAt: { day: 0, time: nowTime }, answers: {} });
    }
    const stoppedEntries = entries.filter((e): e is OrderEntry => e.kind === "order" && stops.includes(e.id));
    const lines = [
      ...stoppedEntries.map((e) => {
        const o = e.order;
        const name =
          o.type === "injection" ? anyDrugName(o.items[0].drugCode) : o.type === "prescription" ? anyDrugName(o.drugCode) : o.type === "procedure" ? procedureTitle(o) : "";
        return `・${name} 中止`;
      }),
      ...added.map((e) => planLine(e, today) + (e.verbal ? `（口頭指示 ${e.verbal.doctor} → 受け ${e.verbal.takenBy}）` : "")),
    ];
    if (newConsents.length) setConsents((all) => [...all, ...newConsents]);
    auditLog(
      verbalMode
        ? { role: me.role, actor: me.name, action: `確定（口頭指示を代行入力。指示 ${DOCTOR}）`, patient: patient?.name, detail: lines.map((l) => l.replace(/^・/, "")).join("／").slice(0, 200) }
        : { role: me.role, actor: me.name, action: "確定（オーダ）", patient: patient?.name, detail: lines.map((l) => l.replace(/^・/, "")).join("／").slice(0, 200) },
    );
    update((c) => ({
      added: [...c.added, ...added],
      stopped: [...c.stopped, ...stops],
      stopTimes: { ...c.stopTimes, ...Object.fromEntries(stops.map((id) => [id, nowTime])) },
      drafts: [],
      note: lines.length ? `${c.note.replace(/\s*$/, "")}\n${lines.join("\n")}\n` : c.note,
      flash: `${added.length + stops.length}件を確定しました。左の経過と記事の P) に入りました。${newConsents.length ? `同意書の下書き ${newConsents.length}件（右の「同意書」）。` : ""}`,
      selectedDay: 0,
    }));
  };

  const lettersOf = (pid: string) => {
    const d = discharges[pid];
    return d?.letter.issuedAt ? [{ day: d.letter.issuedAt.day, to: d.letter.to, dischargeDay: d.dischargeDay, attach: !!d.letter.attach }] : [];
  };

  const createConsent = (code: ConsentCode) => {
    if (!patient) return;
    setConsents((all) => [...all, { id: newId(), patientId: patient.id, code, status: "説明前", createdAt: { day: 0, time: nowTime }, answers: {} }]);
  };
  const updateConsent = (r: ConsentRecord) => {
    const before = consents.find((c) => c.id === r.id);
    setConsents((all) => all.map((c) => (c.id === r.id ? r : c)));
    if (before && before.status !== r.status && r.status !== "説明前") {
      auditLog({ role: me.role, actor: me.name, action: `確定（同意書：${r.status}）`, patient: patient?.name, detail: findConsent(r.code).short });
      const t = findConsent(r.code).short;
      const line = `・同意書：${t} ${r.status === "同意" ? "説明・同意" : r.status === "拒否" ? "説明・同意されず" : "同意の撤回"}（${nowTime}${r.explainedBy ? ` 説明 ${r.explainedBy}` : ""}${r.witness ? `、同席 ${r.witness}` : ""}${r.signatures?.length ? `、タブレットで署名：${r.signatures.map((x) => x.role).join("・")}` : ""}）`;
      update((c) => ({ note: `${c.note.replace(/\s*$/, "")}\n${line}\n` }));
    }
  };

  const admit = (from: ErPatient, form: AdmitForm) => {
    const id = `9002${String(admitted.length + 1).padStart(4, "0")}`;
    const { patient: p, bed } = admitFromEr(from, form, id, nowTime);
    setAdmitted((a) => [...a, p]);
    // Admitted from the ED: an emergency admission (退院困難な要因 イ, 栄養管理計画は7日以内).
    setEvals((all) => ({ ...all, [id]: { patientId: id, emergency: true } }));
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

  const sessionChanges = Object.fromEntries(Object.entries(charts).map(([id, c]) => [id, { added: c.added, stopped: c.stopped, stopTimes: c.stopTimes, notes: notes[id], revised: revised[id] }]));
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

  // Results per patient on the ward: what the doctor has not seen, and panic values not yet phoned in.
  const wardResults = people.flatMap((x) => resultsOf(x.patient, PANIC_LIMITS));
  const unseenResults = unseen(wardResults, acks);
  const resultState = Object.fromEntries(
    people.map((x) => {
      const mine = unseenResults.filter((i) => i.patientId === x.patient.id);
      return [x.patient.id, { unseen: mine.length, panic: mine.filter((i) => i.panic.length > 0).length }];
    }),
  );
  // 入院時の評価 that this role must do today or is already late with.
  const admitDue = TABS[role].includes("admit")
    ? people.reduce((n, x) => n + duesOf(evals[x.patient.id] ?? { patientId: x.patient.id }, x.patient.admittedOn).filter((d) => (d.state === "期限切れ" || d.state === "今日まで") && d.who.some((r) => r === role)).length, 0)
    : 0;
  const markSeen = (pid: string, keys: string[], response?: string) => {
    const seen = wardResults.filter((i) => keys.includes(i.key));
    auditLog({ role: me.role, actor: me.name, action: response ? "確定（パニック値への対応）" : "結果を確認した", patient: findPatient(pid)?.name, detail: `${seen.map((i) => `${i.kind} ${i.time} ${i.title}`).join("／").slice(0, 160)}${response ? `　対応：${response}` : ""}` });
    setAcks((a) => ({ ...a, ...Object.fromEntries(keys.map((k) => [k, { by: me.name, at: { day: 0, time: nowTime }, ...(response ? { response } : {}) }])) }));
    if (response)
      updateFor(pid, (c) => ({ note: `${c.note.replace(/\s*$/, "")}\n・パニック値（${seen.flatMap((i) => i.panic.map(hitLine)).join("、")}）${calls[keys[0]] ? `：${calls[keys[0]].at.time} ${calls[keys[0]].by}より${calls[keys[0]].means}で報告` : ""}。対応：${response}\n` }));
  };

  const summaries: Record<string, ChartSummary> = Object.fromEntries(
    Object.entries(charts).map(([id, c]) => [id, { drafts: c.drafts.length, confirmedToday: c.added.length + c.stopped.length, waiting: waiting[id] ?? 0 }]),
  );
  const wideLeft = chart.leftView !== "record";

  const switchRole = (r: Role) => {
    auditLog({ role: r, actor: STAFF[r].name, action: "職種を選んで入った（デモではログインの代わり）" });
    setRole(r);
    setScreen(home(r));
    setPanel(null);
  };
  const orderMode = !deny("order") ? "doctor" : !deny("order.verbal") ? "verbal" : "none";
  const orderBlock = orderMode === "none" ? deny("order") ?? undefined : undefined;
  const blocked: Partial<Record<PanelKind, string>> = {
    ...(orderBlock ? { "add-injection": orderBlock, "add-rx": orderBlock, "add-lab": orderBlock, "add-imaging": orderBlock, "add-physio": orderBlock, "add-procedure": orderBlock } : {}),
    ...(deny("billing") ? { billing: deny("billing")! } : {}),
  };

  return (
    <RoleProvider value={role}>
    <div className="flex h-screen flex-col print:hidden">
      <PatientTabs
        role={role}
        onRole={switchRole}
        badges={{ lab: uncalled(wardResults.filter((i) => i.day === 0), calls).length, list: role === "医師" ? unseenResults.length : 0, admit: admitDue }}
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
          onRegister={(p) => {
            auditLog({ role: me.role, actor: me.name, action: p.status === "搬送中" ? "確定（救急隊の受入要請）" : "確定（救急受付）", patient: p.name, detail: p.complaint });
            setEr((list) => [...list, p]);
          }}
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
          onTake={(keys) => {
            auditLog({ role: me.role, actor: me.name, action: "指示受け", detail: `${keys.length}件` });
            setTaken((t) => ({ ...t, ...Object.fromEntries(keys.map((k) => [k, nowTime])) }));
          }}
          records={mar}
          sessionStart={sessionStart ?? abs(0, nowTime)}
          onRecord={(r) => {
            const who = findPatient(r.patientId);
            const item = people.flatMap((x) => x.entries).find((e) => e.id === r.orderId);
            auditLog({
              role: "看護師",
              actor: r.by,
              action: r.status === "実施" ? "確定（実施）" : "確定（未実施）",
              patient: who?.name,
              detail: `${item ? orderLines(item.order, today).main : r.orderId}　${r.status === "実施" ? `リストバンド${r.checked.patient ? "一致" : "—"}${r.checked.label === null ? "" : `・ラベル${r.checked.label ? "一致" : "—"}`}${r.offBy !== undefined ? `・予定より${Math.abs(r.offBy)}分${r.offBy > 0 ? "遅れ" : "早め"}` : ""}` : r.reason}`,
            });
            setMar((all) => ({ ...all, [r.key]: r }));
          }}
        />
      ) : screen === "audit" ? (
        <AuditView />
      ) : screen === "admit" ? (
        <AdmitEvalView
          people={people}
          evals={evals}
          today={today}
          nowTime={nowTime}
          onSave={(e, what) => {
            const p = findPatient(e.patientId);
            auditLog({ role: me.role, actor: me.name, action: `確定（入院時の評価：${what}）`, patient: p?.name });
            setEvals((all) => ({ ...all, [e.patientId]: e }));
            if (p) {
              const sen = deliriumBillable(e, p.admittedOn);
              const nyu = dischargeSupportMet(e, p.admittedOn);
              if (sen || nyu)
                setBilling((all) => {
                  const cur = all[p.id] ?? DEFAULT_OPTIONS;
                  return { ...all, [p.id]: { ...cur, senmou: cur.senmou || sen, nyutaiin: cur.nyutaiin || nyu } };
                });
            }
          }}
        />
      ) : screen === "lab" ? (
        <LabView
          people={people}
          items={wardResults.filter((i) => i.day === 0)}
          calls={calls}
          acks={acks}
          limits={PANIC_LIMITS}
          limitsSource={PANIC_SOURCE}
          nowTime={nowTime}
          attending={DOCTOR}
          onCall={(c) => {
            auditLog({ role: me.role, actor: me.name, action: "確定（パニック値を電話で連絡）", patient: findPatient(c.patientId)?.name, detail: `${c.hits.map(hitLine).join("、")} → ${c.to}${c.readBack ? "（復唱あり）" : "（復唱なし）"}` });
            setCalls((all) => ({ ...all, [c.key]: c }));
          }}
        />
      ) : screen === "handoff" ? (
        <HandoffView
          people={people}
          today={today}
          nowTime={nowTime}
          handoffs={handoffs}
          extraFacts={Object.fromEntries(
            Object.entries(resultState).flatMap(([pid, r]) => (r.unseen ? [[pid, [`医師が未確認の結果：${r.unseen}件${r.panic ? `（パニック値 ${r.panic}件）` : ""}`]]] : [])),
          )}
          onSave={(h) => setHandoffs((all) => ({ ...all, [h.patientId]: h }))}
          onSend={(h) => {
            auditLog({ role: me.role, actor: me.name, action: "確定（申し送りを送った）", patient: findPatient(h.patientId)?.name, detail: `${h.shift}　${h.severity}　やること ${h.actions.length}件` });
            setHandoffs((all) => ({ ...all, [h.patientId]: h }));
          }}
          onReceive={(h) => {
            auditLog({ role: me.role, actor: h.to ?? me.name, action: "確定（申し送りを受けた・復唱）", patient: findPatient(h.patientId)?.name, detail: h.synthesis });
            setHandoffs((all) => ({ ...all, [h.patientId]: h }));
          }}
        />
      ) : screen === "acuity" ? (
        <AcuityView
          people={people}
          today={today}
          nowTime={nowTime}
          records={bRecords}
          ambulance={{ ...FICTIONAL_AMBULANCE, ...Object.fromEntries(er.filter((x) => x.admittedAs).map((x) => [x.admittedAs!, x.arrival === "救急車"])) }}
          fasting={(pid, day) => MEALS.every((m) => dietAt(diets, pid, day, m)?.kind === "絶食")}
          onSave={(r) => {
            auditLog({ role: "看護師", actor: r.by, action: "確定（看護必要度 B項目）", patient: findPatient(r.patientId)?.name, detail: `${r.day === 0 ? "今日" : `${r.day}日`}` });
            setBRecords((all) => [...all.filter((x) => !(x.patientId === r.patientId && x.day === r.day)), r]);
          }}
        />
      ) : screen === "chat" ? (
        <ChatView
          patients={people.map((x) => ({ patient: x.patient, room: x.room }))}
          today={today}
          nowTime={nowTime}
          onChart={(pid, m, line) => {
            auditLog({ role: me.role, actor: me.name, action: "チャットをカルテに転記", patient: findPatient(pid)?.name, detail: m.text });
            updateFor(pid, (c) => ({ note: `${c.note.replace(/\s*$/, "")}\n${line}\n` }));
          }}
        />
      ) : screen === "or" ? (
        <SurgeryView
          today={today}
          nowAbs={abs(0, nowTime)}
          surgeries={surgeries}
          people={people}
          onSave={(x) => {
            auditLog({ role: me.role, actor: me.name, action: x.status === "申込" ? "確定（手術申込）" : "手術室の記録", patient: x.name, detail: `${x.procedure} ${x.room ?? ""} ${x.start ?? ""}` });
            setSurgeries((list) => (list.some((y) => y.id === x.id) ? list.map((y) => (y.id === x.id ? x : y)) : [...list, x]));
          }}
        />
      ) : screen === "dialysis" ? (
        <DialysisView
          today={today}
          nowTime={nowTime}
          patients={hdPatients}
          sessions={hdSessions}
          onPatient={(p) => {
            auditLog({ role: me.role, actor: me.name, action: "確定（透析条件）", patient: p.name, detail: p.history.at(-1)?.text });
            setHdPatients((list) => list.map((x) => (x.id === p.id ? p : x)));
          }}
          onSession={(id, s) => setHdSessions((all) => ({ ...all, [id]: s }))}
        />
      ) : screen === "pharmacy" ? (
        <PharmacyView
          people={people}
          today={today}
          nowTime={nowTime}
          audited={audited}
          onAudit={(id) => {
            auditLog({ role: me.role, actor: me.name, action: "処方監査", detail: id });
            setAudited((a) => ({ ...a, [id]: nowTime }));
          }}
          queries={queries}
          onAsk={(q) => {
            auditLog({ role: me.role, actor: me.name, action: "疑義照会", patient: findPatient(q.patientId)?.name, detail: q.question });
            setQueries((qs) => [...qs, { ...q, id: newId(), askedAt: nowTime, by: me.name, status: "回答待ち" }]);
          }}
          reports={reports}
          onReport={(r) => {
            auditLog({ role: me.role, actor: me.name, action: "確定（持参薬鑑別を報告）", patient: findPatient(r.patientId)?.name, detail: `${r.rows.length}剤` });
            setReports((rs) => [...rs, { ...r, id: newId(), at: nowTime, by: me.name, status: "医師へ報告" }]);
          }}
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
            auditLog({ role: me.role, actor: me.name, action: "確定（服薬指導）", patient: findPatient(pid)?.name, detail: `区分${rec.kind}` });
            setShido((all) => ({ ...all, [pid]: [...(all[pid] ?? []), { ...rec, day: 0, at: nowTime }] }));
          }}
          dispensed={dispensed}
          onDispense={(key) => setDispensed((d) => ({ ...d, [key]: nowTime }))}
          tdm={tdmReports}
          onTdm={(r) => {
            auditLog({ role: me.role, actor: me.name, action: "TDM を医師に報告", patient: findPatient(r.patientId)?.name, detail: `${r.drug} AUC24 ${Math.round(r.auc24)}　${r.proposal}` });
            setTdmReports((all) => [...all, { ...r, id: newId(), at: nowTime, by: me.name, status: "医師へ報告" }]);
          }}
        />
      ) : screen === "list" ? (
        <PatientList
          ward={ward}
          nowTime={nowTime}
          changes={sessionChanges}
          summaries={summaries}
          waiting={waiting}
          resultState={resultState}
          marPending={Object.fromEntries(
            people.map((x) => {
              const start = sessionStart ?? abs(0, nowTime);
              const nowAbs = abs(0, nowTime);
              return [x.patient.id, buildWorksheet([x], start, nowAbs + 1, nowAbs).timed.filter((i) => overdue(i, mar, start, nowAbs)).length];
            }),
          )}
          consentState={Object.fromEntries(
            allPatients.map((p) => {
              const mine = consents.filter((c) => c.patientId === p.id);
              return [p.id, { admission: mine.some((c) => c.code === "CONSENT-ADMISSION" && c.status === "同意"), pending: mine.filter((c) => c.status === "説明前").map((c) => findConsent(c.code).short) }];
            }),
          )}
          onOpen={openPatient}
        />
      ) : patient && ctx ? (
        <>
          <PatientBar
            patient={patient}
            today={today}
            diagnoses={diagnoses[patient.id] ?? []}
            directive={currentDirective(directives, patient.id)}
            onOpenDiagnoses={() => setPanel("diagnoses")}
            onOpenDirective={() => setPanel("directive")}
            onOpenDiet={() => setPanel("diet")}
          />
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
                  diets={diets}
                  letters={lettersOf(patient.id)}
                  onOptions={(next) => setBilling((all) => ({ ...all, [patient.id]: next }))}
                  wardPayload={() =>
                    allPatients.map((p) => {
                      const c = charts[p.id];
                      return patientMonthPayload(p, currentEntries(p, c ? { added: c.added, stopped: c.stopped, stopTimes: c.stopTimes, notes: notes[p.id], revised: revised[p.id] } : undefined), diagnoses[p.id] ?? [], billing[p.id] ?? DEFAULT_OPTIONS, { diets, letters: lettersOf(p.id) });
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
              onReviseNote={(e, text, reason) => {
                const next = reviseNote(e, text, me.name, { day: 0, time: nowTime }, reason);
                setRevised((all) => ({ ...all, [patient.id]: { ...(all[patient.id] ?? {}), [noteKey(e)]: next } }));
                auditLog({ role: me.role, actor: me.name, action: `確定（記事の修正・第${next.versions!.length}版）`, patient: patient.name, detail: `${e.time} の記事　理由：${reason.trim()}` });
              }}
            />
            <div className="relative flex min-h-0 flex-col">
              <ResultsInbox
                today={today}
                items={unseen(resultsOf(patient, PANIC_LIMITS), acks)}
                calls={calls}
                onSeen={(keys, response) => markSeen(patient.id, keys, response)}
                onOpenResults={() => setPanel("results")}
              />
              <VerbalInbox
                entries={entries.filter((e): e is OrderEntry => e.kind === "order")}
                today={today}
                nowAbs={abs(0, nowTime)}
                onSign={(ids) => {
                  auditLog({ role: me.role, actor: me.name, action: "確定（口頭指示を承認）", patient: patient.name, detail: `${ids.length}件` });
                  update((c) => ({
                    added: c.added.map((e) => (ids.includes(e.id) && e.verbal ? { ...e, verbal: { ...e.verbal, signedAt: { day: 0, time: nowTime } } } : e)),
                    flash: `口頭指示 ${ids.length}件を承認しました。`,
                  }));
                }}
              />
              <PharmacyInbox
                today={today}
                entries={entries.filter((e): e is OrderEntry => e.kind === "order")}
                queries={queries.filter((q) => q.patientId === patient.id)}
                reports={reports.filter((r) => r.patientId === patient.id)}
                tdm={tdmReports.filter((r) => r.patientId === patient.id)}
                onTdmSeen={(r) => {
                  auditLog({ role: me.role, actor: me.name, action: "TDM の報告を確認", patient: patient.name, detail: `${r.drug} AUC24 ${Math.round(r.auc24)}` });
                  setTdmReports((all) => all.map((x) => (x.id === r.id ? { ...x, status: "確認済" } : x)));
                  update((c) => ({ note: `${c.note.replace(/\s*$/, "")}\n・TDM（${r.by}）：${r.drug} AUC24 ${Math.round(r.auc24)} μg·h/mL。薬剤師より「${r.proposal}」\n` }));
                }}
                onChange={(q) => {
                  const e = entries.find((x): x is OrderEntry => x.kind === "order" && x.id === q.orderId);
                  if (e) addStopDraft(e, "（疑義照会から）");
                  auditLog({ role: me.role, actor: me.name, action: "疑義照会に回答（変更する）", patient: patient.name, detail: q.question });
                  setQueries((qs) => qs.map((x) => (x.id === q.id ? { ...x, status: "変更", answeredAt: nowTime } : x)));
                  update({ flash: "前のオーダの中止の下書きを作りました。正しい内容を右のツールから足して、まとめて確定してください。" });
                }}
                onKeep={(q, answer) => {
                  auditLog({ role: me.role, actor: me.name, action: "疑義照会に回答（変更しない）", patient: patient.name, detail: answer || q.question });
                  setQueries((qs) => qs.map((x) => (x.id === q.id ? { ...x, status: "変更なし", answer: answer.trim() || undefined, answeredAt: nowTime } : x)));
                }}
                onDecide={(r, rows) => {
                  const orders = ordersFromReport({ ...r, rows }, nowTime);
                  const added: OrderEntry[] = orders.map((o) => ({ kind: "order", id: newId(), day: 0, time: nowTime, author: DOCTOR, status: "有効", order: o }));
                  const stopped = rows.filter((x) => x.decision === "中止").map((x) => `・持参薬 ${x.said} ${x.strength}：中止（鑑別報告より）`);
                  updateFor(patient.id, (c) => ({
                    added: [...c.added, ...added],
                    note: `${c.note.replace(/\s*$/, "")}\n${[...added.map((e) => planLine(e, today)), ...stopped].join("\n")}\n`,
                    flash: `持参薬の指示を確定しました（オーダ ${added.length}件・中止 ${stopped.length}件）。`,
                  }));
                  auditLog({ role: me.role, actor: me.name, action: "確定（持参薬の指示）", patient: patient.name, detail: rows.map((x) => `${x.said}：${x.decision}`).join("、") });
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
                onRemove={(id) => {
                  auditLog({ role: me.role, actor: me.name, action: "下書きを消した", patient: patient.name, detail: chart.drafts.find((d) => d.id === id)?.sourceText });
                  update((c) => ({ drafts: c.drafts.filter((d) => d.id !== id) }));
                }}
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
                orderMode={orderMode}
                onConfirmNote={() => {
                  const n: NoteEntry = { kind: "note", id: newId(), day: 0, time: nowTime, author: me.name, role: me.role, ...parseNote(chart.note) };
                  setNotes((all) => ({ ...all, [patient.id]: [...(all[patient.id] ?? []), n] }));
                  auditLog({ role: me.role, actor: me.name, action: "確定（記事）", patient: patient.name, detail: chart.note.replace(/\s+/g, " ").slice(0, 120) });
                  update({ note: noteTemplate(me.role), flash: "記事を確定しました。左の経過に入りました。" });
                }}
              />
              {panel === "diagnoses" && (
                <Drawer title="病名" onClose={closePanel} wide locked={deny("diagnosis")}>
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
                  <ImagingPanel patient={patient} today={today} entries={entries} nowAbs={abs(0, nowTime)} />
                </Drawer>
              )}
              {panel === "active-orders" && (
                <Drawer title="有効なオーダ" onClose={closePanel}>
                  <ActiveOrdersPanel entries={entries} today={today} />
                </Drawer>
              )}
              {panel === "add-injection" && (
                <Drawer title="注射（Rp 入力）" onClose={closePanel} wide locked={orderBlock}>
                  <AddInjectionPanel onAdd={(ds) => { update((c) => ({ drafts: [...c.drafts, ...ds], flash: null })); closePanel(); }} newId={newId} drafts={chart.drafts} />
                </Drawer>
              )}
              {panel === "add-rx" && (
                <Drawer title="処方（Rp 入力）" onClose={closePanel} wide locked={orderBlock}>
                  <AddRxPanel onAdd={(ds) => { update((c) => ({ drafts: [...c.drafts, ...ds], flash: null })); closePanel(); }} newId={newId} drafts={chart.drafts} />
                </Drawer>
              )}
              {panel === "vitals" && (
                <Drawer title="バイタル（看護師が入れる）" onClose={closePanel} locked={deny("vitals")}>
                  <VitalsPanel
                    nowTime={nowTime}
                    last={patient.vitals.at(-1)}
                    onSave={(v) => {
                      auditLog({ role: me.role, actor: me.name, action: "確定（バイタル）", patient: patient.name, detail: `BT ${v.bt ?? "—"} HR ${v.hr ?? "—"} BP ${v.sbp ?? "—"}/${v.dbp ?? "—"} RR ${v.rr ?? "—"} SpO2 ${v.spo2 ?? "—"}　NEWS2 ${news2(v).total}` });
                      setExtraVitals((all) => ({ ...all, [patient.id]: [...(all[patient.id] ?? []), v] }));
                      closePanel();
                    }}
                  />
                </Drawer>
              )}
              {panel === "discharge" && (
                <Drawer title="退院時サマリー・診療情報提供書" onClose={closePanel} wide>
                  <DischargePanel
                    patient={patient}
                    today={today}
                    nowTime={nowTime}
                    doctor={DOCTOR}
                    entries={entries.filter((e): e is OrderEntry => e.kind === "order")}
                    diagnoses={diagnoses[patient.id] ?? []}
                    consentsPending={consents.filter((c) => c.patientId === patient.id && c.status === "説明前").map((c) => findConsent(c.code).short)}
                    directive={currentDirective(directives, patient.id) ? directiveLine(currentDirective(directives, patient.id)!) : undefined}
                    draft={discharges[patient.id]}
                    onSave={(d) => {
                      setDischarges((all) => ({ ...all, [patient.id]: d }));
                      update({ flash: "退院時サマリーを途中まで残しました。" });
                    }}
                    onConfirm={(d) => {
                      setDischarges((all) => ({ ...all, [patient.id]: d }));
                      auditLog({ role: me.role, actor: me.name, action: "確定（退院時サマリー）", patient: patient.name, detail: `退院 ${d.dischargeDay}日後・${d.destination}` });
                      update((c) => ({ note: `${c.note.replace(/\s*$/, "")}\n・退院時サマリーを確定（退院先：${d.destination}）\n` }));
                    }}
                    onIssueLetter={(d) => {
                      setDischarges((all) => ({ ...all, [patient.id]: d }));
                      auditLog({ role: me.role, actor: me.name, action: "確定（診療情報提供書）", patient: patient.name, detail: `${d.letter.to} ${d.letter.dept}：${d.letter.purpose}` });
                      update((c) => ({ note: `${c.note.replace(/\s*$/, "")}\n・診療情報提供書：${d.letter.to} ${d.letter.dept} ${d.letter.doctor ? `${d.letter.doctor}先生` : ""}（${d.letter.purpose}）\n` }));
                    }}
                  />
                </Drawer>
              )}
              {panel === "diet" && (
                <Drawer title="食事" onClose={closePanel} wide locked={deny("diet")}>
                  <DietPanel
                    patient={patient}
                    today={today}
                    nowTime={nowTime}
                    doctor={DOCTOR}
                    diets={diets}
                    entries={entries.filter((e): e is OrderEntry => e.kind === "order")}
                    onSave={(d) => {
                      setDiets((all) => [...all, d]);
                      const when = `${d.from.day === 0 ? "今日" : d.from.day === 1 ? "明日" : "明後日"}の${d.from.meal}食から`;
                      auditLog({ role: me.role, actor: me.name, action: "確定（食事）", patient: patient.name, detail: `${dietLabel(d)}（${when}）` });
                      update((c) => ({ note: `${c.note.replace(/\s*$/, "")}\n・食事：${dietLabel(d)}（${when}）${d.comment ? `　${d.comment}` : ""}\n`, flash: `食事を確定しました（${when}）。` }));
                      closePanel();
                    }}
                  />
                </Drawer>
              )}
              {panel === "chat" && (
                <Drawer title={`チャット：${patient.name}さん`} onClose={closePanel}>
                  <div className="h-[70vh]">
                    <ChatThread
                      channel={{ id: patientChannel(patient.id), name: `${patient.name}さん`, kind: "患者", patientId: patient.id, description: "" }}
                      today={today}
                      nowTime={nowTime}
                      onChart={(m, line) => {
                        auditLog({ role: me.role, actor: me.name, action: "チャットをカルテに転記", patient: patient.name, detail: m.text });
                        update((c) => ({ note: `${c.note.replace(/\s*$/, "")}\n${line}\n` }));
                      }}
                    />
                  </div>
                </Drawer>
              )}
              {panel === "directive" && (
                <Drawer title="事前指示・注意の掲示" onClose={closePanel} locked={deny("directive")}>
                  <DirectivePanel
                    patientId={patient.id}
                    today={today}
                    nowTime={nowTime}
                    doctor={DOCTOR}
                    history={directives.filter((d) => d.patientId === patient.id)}
                    cautions={patient.cautions}
                    onSave={(d) => {
                      setDirectives((all) => [...all.map((x) => (x.patientId === d.patientId && x.status === "有効" ? { ...x, status: "取消" as const } : x)), d]);
                      auditLog({ role: me.role, actor: me.name, action: "確定（事前指示）", patient: patient.name, detail: directiveLine(d) });
                      update((c) => ({ note: `${c.note.replace(/\s*$/, "")}\n・事前指示：${directiveLine(d)}\n`, flash: "事前指示を確定しました。患者の帯と病棟マップに出ます。" }));
                      closePanel();
                    }}
                    onAddCaution={(text) => {
                      setExtraCautions((all) => ({ ...all, [patient.id]: [...(all[patient.id] ?? []), text] }));
                      auditLog({ role: me.role, actor: me.name, action: "注意を掲示", patient: patient.name, detail: text });
                    }}
                  />
                </Drawer>
              )}
              {panel === "consents" && (
                <Drawer title="説明・同意書" onClose={closePanel} wide>
                  <ConsentPanel
                    patient={patient}
                    room={ward.beds.find((b) => b.patientId === patient.id)?.room ?? ""}
                    today={today}
                    nowTime={nowTime}
                    doctor={DOCTOR}
                    records={consents.filter((c) => c.patientId === patient.id)}
                    orders={entries.filter((e): e is OrderEntry => e.kind === "order")}
                    onCreate={createConsent}
                    onUpdate={updateConsent}
                  />
                </Drawer>
              )}
              {panel === "add-imaging" && (
                <Drawer title="画像検査" onClose={closePanel} locked={orderBlock}>
                  <AddImagingPanel onAdd={(d) => { addManualLab(d); closePanel(); }} newId={newId} />
                </Drawer>
              )}
              {panel === "add-physio" && (
                <Drawer title="生理検査" onClose={closePanel} locked={orderBlock}>
                  <AddPhysioPanel onAdd={(d) => { addManualLab(d); closePanel(); }} newId={newId} />
                </Drawer>
              )}
              {panel === "add-procedure" && (
                <Drawer title="処置（マスターから選ぶ）" onClose={closePanel} locked={orderBlock}>
                  <AddProcedurePanel onAdd={(d) => { addManualLab(d); closePanel(); }} newId={newId} />
                </Drawer>
              )}
              {panel === "add-lab" && (
                <Drawer title="検体検査（マスターから選ぶ）" onClose={closePanel} locked={orderBlock}>
                  <AddLabPanel onAdd={(d) => { addManualLab(d); closePanel(); }} newId={newId} />
                </Drawer>
              )}
            </div>
              </>
            )}
            <ToolRail
              open={panel}
              onOpen={setPanel}
              blocked={blocked}
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
    </RoleProvider>
  );
}
