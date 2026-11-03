"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { AiDraftResponse } from "@/lib/ai-schema";
import { addDays, continuedTime, formatShort, isoDate, nowTimeInTokyo, todayInTokyo, type CalendarDate } from "@/lib/dates";
import { checkDraft, draftsFromAi, isReady, newProcedureDraft, orderEndDay, toOrder, type CheckContext, type Draft, type ExtendDraft, type Issue, type StopDraft } from "@/lib/drafts";
import { orderLines, procedureTitle } from "@/lib/format";
import { anyDrugName } from "@/lib/master";
import { INITIAL_REQUESTS, admitFromEr, admitFromOpd, type AdmissionRequest } from "@/lib/admission";
import { OPD_PATIENTS, type OpdPatient, type OpdStatus } from "@/lib/opd";
import { INITIAL_DIAGNOSES, UNCODED, type Diagnosis } from "@/lib/diagnoses";
import { DEFAULT_OPTIONS, type BillingOptions } from "@/lib/billing/model";
import { patientMonthPayload } from "@/lib/billing/payload";
import { BillingView } from "./BillingView";
import { initialErPatients, type ErPatient, type ErStatus } from "@/lib/er";
import { abs } from "@/lib/flowsheet";
import { PATIENTS } from "@/lib/patients";
import { BEDS, FLOORS, OTHER_FLOOR_BEDS, WARD_NAME, doctorFor, floorOf, nurseFor, type BedAssignment, type Floor, type WardState } from "@/lib/ward";
import { currentEntries } from "@/lib/record";
import type { DayOffset, HistoryEntry, InjectionOrder, NoteEntry, OrderEntry, Patient, VitalSign } from "@/lib/types";
import { DateTree } from "./DateTree";
import { readDo, DO_MIME, type DoPayload } from "./HistoryPane";
import { PAST_RX, patternsOf, previousOf, type RxPattern } from "@/lib/rx-memory";
import { PAST_INJ, injPatternsOf, injPreviousOf } from "@/lib/inj-memory";
import { EmergencyBoard } from "./EmergencyBoard";
import { OpdBoard } from "./OpdBoard";
import { VisitChart, type Visit, type VisitNote } from "./VisitChart";
import { OpdRxPanel, RevisitPanel, type OpdRx, type Revisit } from "./OpdOrders";
import { CalendarPlus, Pill as PillIcon } from "lucide-react";
import { WardRequests } from "./WardRequests";
import { BedMoveDialog } from "./BedMoveDialog";
import { DeptMoveDialog } from "./DeptMoveDialog";
import type { BookWhat, MoveEvent } from "./DietCalendar";
import { moveText } from "@/lib/procedures";
import { bedProblem } from "@/lib/admission";
import { StickyStrip, type Sticky } from "./StickyStrip";
import { BoardView } from "./BoardView";
import { ExtractView } from "./ExtractView";
import { JournalView } from "./JournalView";
import { MealsView } from "./MealsView";
import { journalLines, staffing } from "@/lib/journal";
import { GUIDE_TO } from "@/lib/procedures";
import { bookingsOf } from "@/lib/bookings";
import { runExtract } from "@/lib/extract";
import { ManualView } from "./ManualView";
import { IncidentView } from "./IncidentView";
import { INITIAL_NOTICES, INITIAL_READS, markRead, unreadCount, type Notice, type Reads } from "@/lib/board";
import { INITIAL_INCIDENTS, applyStatus, emptyDraft, type IncidentDraft, type IncidentReport } from "@/lib/incident";
import { StandingPanel } from "./panels/StandingPanel";
import { RestraintPanel } from "./panels/RestraintPanel";
import { RegimenPanel } from "./panels/RegimenPanel";
import { SummaryPanel } from "./panels/SummaryPanel";
import { SetPanel } from "./panels/SetPanel";
import { SchemaPanel } from "./panels/SchemaPanel";
import { DocsPanel } from "./panels/DocsPanel";
import { LabelsPanel } from "./panels/LabelsPanel";
import { DischargeDialog } from "./DischargeDialog";
import { dischargeChecklist } from "@/lib/discharge-check";
import { bagsOf } from "@/lib/discharge-rx";
import { GuideRecordPanel, type GuidanceInput } from "./panels/GuideRecordPanel";
import { guidanceNoteText, nutritionCountNote, nutritionTimeNote, openRequests, type GuidanceRecord } from "@/lib/guidance";
import { labelItems } from "@/lib/labels";
import { ageSex } from "@/lib/person";
import { stayDays, type DocKind, type DocRecord } from "@/lib/documents";
import { diagnosisLabel } from "@/lib/diagnoses";
import { summaryFacts } from "@/lib/summary";
import { INITIAL_RESTRAINTS, activeOf, durationText, minutesOf, reviewDue, type Restraint } from "@/lib/restraint";
import { callHits, initialStanding, type StandingOrders } from "@/lib/standing";
import type { Flag } from "@/lib/patient-flags";
import { HistoryPane, type LeftView } from "./HistoryPane";
import { PatientBar } from "./PatientBar";
import { PatientPicker } from "./PatientPicker";
import { PatientList, type GroupBy } from "./PatientList";
import { AppFrame, type TabItem, type TabRow, type Todo } from "./AppFrame";
import { NewTabPage } from "./NewTabPage";
import { WardMenu } from "./WardMenu";
import { AREA_ICON, WARD_ICON } from "./nav-icons";
import { LayoutList, Plus } from "lucide-react";
import {
  AREAS,
  allowedWardTabs,
  areasFor,
  homeArea,
  nextAfterClose,
  ownerFor,
  rehome,
  wardOwner,
  wardTabInfo,
  wardTabLabel,
  wardTabOf,
  wardTabsFor,
  type AreaKey,
  type Owner,
  type PatientTab,
  type WardTab,
} from "@/lib/nav";
import { verbalUnsigned } from "@/lib/verbal";
import { TodayPane, type DraftMeta } from "./TodayPane";
import { ToolRail, type PanelKind } from "./ToolRail";
import { RightTabs, type RightTab } from "./RightTabs";
import { Dockable, defaultWin, type Win } from "./Dockable";
import { InjectionCalendar } from "./Calendars";
import { WardMap, type ChartSummary, type Pick } from "./WardMap";
import { Worksheet } from "./Worksheet";
import { PharmacyView, type HomeRxRecord, type ShidoRecord } from "./PharmacyView";
import { PharmacyInbox } from "./PharmacyInbox";
import { DialysisView } from "./DialysisView";
import { SurgeryView } from "./SurgeryView";
import { initialSurgeries, type Surgery } from "@/lib/surgery";
import { HD_PATIENTS, initialHdSessions, type HdPatient, type HdSession } from "@/lib/dialysis";
import { b008Check, draftsFromReport, type BroughtReport, type Query } from "@/lib/pharmacy";
import { orderChanges, sessionChangeKeys, type WorkPatient } from "@/lib/worksheet";
import { ActiveOrdersPanel } from "./panels/ActiveOrdersPanel";
import { AddConsultPanel, AddGuidePanel, AddLeavePanel, AddRehabPanel, AddDialysisPanel, AddTransfusionPanel, AddImagingPanel, AddInjectionPanel, AddLabPanel, AddPhysioPanel, AddProcedurePanel, AddRxPanel } from "./panels/AddPanels";
import { latestCre } from "@/lib/exams";
import { latestValue } from "@/lib/clinical";
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
import { handoffKey, type Handoff } from "@/lib/handoff";
import { FICTIONAL_AMBULANCE, INITIAL_B, type BRecord } from "@/lib/acuity";
import { patientChannel } from "@/lib/chat";
import { CLAUDE, auditLog } from "@/lib/audit";
import { overdue, type AdminRecord, type VoidedRecord } from "@/lib/mar";
import { buildWorksheet } from "@/lib/worksheet";
import { news2 } from "@/lib/news2";
import { findConsent, type ConsentCode, type ConsentRecord } from "@/lib/consent";
import { DiagnosisPanel } from "./panels/DiagnosisPanel";
import { RoleProvider } from "./RoleContext";
import { STAFF, TABS, denyReason, type Role } from "@/lib/roles";
import { noteKey, noteTemplate, parseNote, reviseNote } from "@/lib/notes";
import { insertIntoO } from "@/lib/vitals-text";
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
  /** The right side: writing the note, or entering injections / oral drugs by Rp. */
  rightTab: RightTab;
  /** Tabs open on the right besides 記事作成 (opened from the tools, closed with ×). */
  openTabs: RightTab[];
  note: string;
  instruction: string;
  drafts: Draft[];
  /** Orders confirmed today in this session. */
  added: OrderEntry[];
  /** Orders stopped today in this session. */
  stopped: string[];
  /** When each of them was stopped ("HH:MM"). */
  stopTimes: Record<string, string>;
  /** 延長 confirmed today: order id → its new 日数. */
  extended: Record<string, number>;
  /** An order to copy into the 注射 tab for 修正 (the old one gets a stop draft). */
  injSeed?: { key: string; order: InjectionOrder };
  /** シェーマ attached to today's note (kept with it when confirmed). */
  figures?: { caption: string; dataUrl: string }[];
  /** Do of a past prescription (or one picked from 処方の記憶): copied into the 内服 tab. */
  rxSeed?: { key: string; pattern: RxPattern };
  drafting: boolean;
  error: string | null;
  meta: DraftMeta | null;
  flash: string | null;
}

/**
 * What a chart holds for everyone (today's confirmed orders, stops and extensions) is kept under the
 * patient id; what one person is writing (the note, the instruction, drafts, what is on screen) under
 * "id|role", so that a nurse never confirms a doctor's half-written note or drafts as their own.
 */
const SHARED_KEYS = ["added", "stopped", "stopTimes", "extended"] as const;
type SharedKey = (typeof SHARED_KEYS)[number];
const isShared = (k: string): k is SharedKey => (SHARED_KEYS as readonly string[]).includes(k);
const deskKeyOf = (id: string, role: string) => `${id}|${role}`;
function mergedChart(all: Record<string, ChartState>, id: string, role: string): ChartState {
  const base = all[id] ?? newChart();
  const desk = all[deskKeyOf(id, role)] ?? newChart();
  return { ...desk, added: base.added, stopped: base.stopped, stopTimes: base.stopTimes, extended: base.extended };
}
function applyChart(all: Record<string, ChartState>, id: string, role: string, patch: (c: ChartState) => Partial<ChartState>): Record<string, ChartState> {
  const p = patch(mergedChart(all, id, role));
  const shared: Partial<ChartState> = {};
  const mine: Partial<ChartState> = {};
  for (const [k, v] of Object.entries(p)) Object.assign(isShared(k) ? shared : mine, { [k]: v });
  const dk = deskKeyOf(id, role);
  return { ...all, [id]: { ...(all[id] ?? newChart()), ...shared }, [dk]: { ...(all[dk] ?? newChart()), ...mine } };
}

const newChart = (): ChartState => ({
  selectedDay: null,
  showStopped: false,
  leftView: "record",
  rightTab: "note",
  // 注射 and 内服 are there from the start; each closes with × and opens again from the tools.
  openTabs: ["injection", "rx"],
  note: NOTE_TEMPLATE,
  instruction: "",
  drafts: [],
  added: [],
  stopped: [],
  stopTimes: {},
  extended: {},
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
// 今日 is the day the page was opened: the records here live in the page, and every day offset is counted
// from it. After midnight the clock runs on (00:30 → "24:30") so that a night shift keeps its order.
let bootDay: string | null = null;
const clientToday = () => (bootDay ??= isoDate(todayInTokyo()));
const clientNow = () => continuedTime(parseIso(clientToday()));
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

/** What the main area shows: a ② screen, a place, a chart, 新しいタブ, or 病棟's menu of screens. */
type Screen = WardTab | AreaKey | "chart" | "new" | "wardmenu" | "visit";
/** front[owner] when the tab shows 新しいタブ. */
const NEW_TAB = "__new__";
const LIST_TABS = ["floor", "mine", "dept", "all", "doctor"] as const;

// 病棟's screens to open first (最初に開く), per role. A convenience kept in this browser only.
const WARD_DEFAULTS_KEY = "simple-karte:ward-defaults";
function loadWardDefaults(): Record<string, WardTab[]> {
  try {
    const v = typeof window === "undefined" ? null : window.localStorage.getItem(WARD_DEFAULTS_KEY);
    const o: unknown = v ? JSON.parse(v) : {};
    return o && typeof o === "object" ? (o as Record<string, WardTab[]>) : {};
  } catch {
    return {};
  }
}
function saveWardDefaults(v: Record<string, WardTab[]>) {
  try {
    window.localStorage.setItem(WARD_DEFAULTS_KEY, JSON.stringify(v));
  } catch {
    // Storage blocked (private window): the check works until the page is closed.
  }
}
const defaultsOf = (all: Record<string, WardTab[]>, role: Role): WardTab[] => (Array.isArray(all[role]) ? all[role] : []);

export default function WardApp() {
  const todayKey = useSyncExternalStore(noSubscribe, clientToday, serverNull);
  const nowTime = useSyncExternalStore(everyFifteenSeconds, clientNow, serverNull);
  const [charts, setCharts] = useState<Record<string, ChartState>>({});
  const [pickerOpen, setPickerOpen] = useState(false);
  const [panel, setPanel] = useState<PanelKind | null>(null);
  // Who is using the chart. The demo picks a role instead of logging in.
  const [role, setRole] = useState<Role>("医師");
  // ①②③: the place chosen in the left menu; inside 病棟 the screens open as tabs (②) and the one in
  // front ("menu" = 病棟's menu of screens); the charts, each under the tab it was opened from (③; in
  // 救急外来 and 外来 they follow the list on ②); and what each tab shows (a chart id, 新しいタブ, or
  // nothing = its own screen).
  const [boot] = useState(() => {
    const defaults = loadWardDefaults();
    return { defaults, tabs: allowedWardTabs("医師", defaultsOf(defaults, "医師")) };
  });
  const [area, setArea] = useState<AreaKey>(homeArea("医師"));
  const [wardDefaults, setWardDefaults] = useState<Record<string, WardTab[]>>(boot.defaults);
  const [wardTabs, setWardTabs] = useState<WardTab[]>(boot.tabs);
  const [wardTab, setWardTab] = useState<WardTab | "menu">(boot.tabs[0] ?? "menu");
  const [patientTabs, setPatientTabs] = useState<PatientTab[]>([]);
  const [front, setFront] = useState<Partial<Record<Owner, string>>>({});
  const [newTabFor, setNewTabFor] = useState<Owner | null>(null);
  // The floor shown on 病棟マップ and ◯階, and the department and doctor chosen on 科別 and 主治医別.
  const [floor, setFloor] = useState(WARD_NAME);
  const [deptPick, setDeptPick] = useState("");
  const [doctorPick, setDoctorPick] = useState("");
  const me = STAFF[role];
  const deny = (a: Parameters<typeof denyReason>[1]) => denyReason(role, a);
  // Patients admitted today from the ED, and the beds they took. Kept in this browser only.
  const [admitted, setAdmitted] = useState<Patient[]>([]);
  const [newBeds, setNewBeds] = useState<BedAssignment[]>([]);
  // 転棟・転床: where each moved patient is now, and the move being chosen (dialog).
  const [moves, setMoves] = useState<Record<string, { room: string; bed: string }>>({});
  const [moving, setMoving] = useState<{ patientId: string; to?: { room: string; bed: string } } | null>(null);
  // 移動の予約: what is being booked from the calendar, booked moves carried out, 転科, and moves done.
  const [booking, setBooking] = useState<{ day: number; what: "move" | "dept" } | null>(null);
  const [leavePreset, setLeavePreset] = useState<number | null>(null);
  const [movesDone, setMovesDone] = useState<Record<string, string>>({});
  // 退院を実施した時, and the 退院 being confirmed (the checklist dialog).
  const [discharged, setDischarged] = useState<Record<string, { day: number; time: string; by: string }>>({});
  const [dischargeAsk, setDischargeAsk] = useState<string | null>(null);
  const [deptChanges, setDeptChanges] = useState<Record<string, { dept: string; doctor: string }>>({});
  const [moveLog, setMoveLog] = useState<{ patientId: string; label: string; time: string }[]>([]);
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
  // 外来 today, the record written in each ED/outpatient tab, and the 入院申込 waiting on the wards.
  const [opd, setOpd] = useState<OpdPatient[]>(OPD_PATIENTS);
  const [visitNotes, setVisitNotes] = useState<Record<string, VisitNote[]>>({});
  const [requests, setRequests] = useState<AdmissionRequest[]>(INITIAL_REQUESTS);
  // 外来処方（院外処方せん）と再診予約, per outpatient.
  const [opdRx, setOpdRx] = useState<Record<string, OpdRx[]>>({});
  const [revisits, setRevisits] = useState<Record<string, Revisit>>({});
  // 掲示板 (notices and who read them), 院内マニュアル (the one open), インシデントレポート (and the draft).
  const [notices, setNotices] = useState<Notice[]>(INITIAL_NOTICES);
  const [reads, setReads] = useState<Reads>(INITIAL_READS);
  const [manualOpen, setManualOpen] = useState<string | null>(null);
  const [incidents, setIncidents] = useState<IncidentReport[]>(INITIAL_INCIDENTS);
  const [incidentDraft, setIncidentDraft] = useState<IncidentDraft>(emptyDraft);
  // 薬剤部：血液製剤の払出（製造番号）と病棟薬剤業務日誌.
  const [txIssued, setTxIssued] = useState<Record<string, { lot: string; at: string; by: string }>>({});
  const [pharmJournal, setPharmJournal] = useState<{ text: string; at: string }[]>([]);
  const [homeRx, setHomeRx] = useState<Record<string, HomeRxRecord>>({});
  // 指導の記録 (栄養食事指導・服薬指導・退院時の生活指導): each answers the 指導の依頼 and goes into the chart.
  const [guidance, setGuidance] = useState<GuidanceRecord[]>([]);
  // 書類作成で作った書類.
  const [documents, setDocuments] = useState<DocRecord[]>([]);
  // 他科依頼の返書 (by order id).
  const [consultReplies, setConsultReplies] = useState<Record<string, { text: string; by: string; at: string }>>({});
  // 看護日誌: the charge nurse's words, per floor.
  const [journal, setJournal] = useState<Record<string, { text: string; by: string; at: string }[]>>({});
  // 妊娠中の印 and 付箋, per patient.
  const [pregnancy, setPregnancy] = useState<Record<string, { weeks: number | null } | null>>({});
  const [stickies, setStickies] = useState<Record<string, Sticky[]>>({ "90010231": [{ id: "st-1", text: "明日の血液培養の結果を家族に説明する", by: "山本（専攻医）", at: "17:40", shared: true }] });
  // 身体的拘束 records (start, reviews each shift, end).
  const [restraints, setRestraints] = useState<Restraint[]>(INITIAL_RESTRAINTS);
  // 指示簿 per patient, every version kept (the last one is in force).
  const [standing, setStanding] = useState<Record<string, StandingOrders[]>>(initialStanding);

  // Vital signs entered in this session (kept in this browser only), merged into each patient.
  const [extraVitals, setExtraVitals] = useState<Record<string, VitalSign[]>>({});
  // 与薬・実施の記録 (eMAR). Items due before this session are taken as recorded by the earlier shift.
  const [mar, setMar] = useState<Record<string, AdminRecord>>({});
  // 実施・未実施 records taken back (with who, when and why), by dose key.
  const [marVoided, setMarVoided] = useState<Record<string, VoidedRecord[]>>({});
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
  // Right-side tabs shown in their own window (別ウインドウ), and which window is in front.
  const [floating, setFloating] = useState<Partial<Record<RightTab, Win>>>({});
  // A past note or order is being dragged over the right side (Do).
  const [dropping, setDropping] = useState(false);
  // The imaging order opened from the left (its study comes first in the PACS viewer).
  const [imageFocus, setImageFocus] = useState<string | null>(null);
  const [zOrder, setZOrder] = useState<RightTab[]>([]);
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
          room: moves[p.id]?.room ?? p.room,
          department: deptChanges[p.id]?.dept ?? p.department,
          attending: deptChanges[p.id]?.doctor ?? p.attending,
          pregnancy: pregnancy[p.id] ?? p.pregnancy ?? null,
          ...(discharged[p.id] ? { dischargedAt: discharged[p.id] } : {}),
          ward: moves[p.id] ? floorOf(moves[p.id].room).replace("病棟", "") : p.ward,
          codeStatus: d && d.cpr !== "未確認" ? bandLabel(d) : undefined,
          dietNow: diet ? dietLabel(diet) : undefined,
        };
      }),
    [admitted, extraVitals, extraCautions, directives, diets, nowTime, arrivedCultures, moves, pregnancy, deptChanges, discharged],
  );
  const findPatient = useCallback((id: string) => allPatients.find((p) => p.id === id), [allPatients]);
  const ward: WardState = useMemo(
    () => ({ beds: [...BEDS, ...newBeds].map((b) => (b.patientId && moves[b.patientId] ? { ...b, ...moves[b.patientId] } : b)), patient: findPatient }),
    [newBeds, findPatient, moves],
  );

  // What is in front: the ② tab (and its ③), and in it a chart, 新しいタブ, or its own screen.
  const owner: Owner | null = area === "ward" ? (wardTab === "menu" ? null : wardOwner(wardTab)) : area === "er" || area === "opd" ? area : null;
  const shownThere = owner ? front[owner] : undefined;
  const activeId = shownThere && shownThere !== NEW_TAB && findPatient(shownThere) ? shownThere : null;
  // A patient of 救急外来 or 外来 (key "er:◯" / "opd:◯"): their visit, not a ward chart.
  const visitOf = (key: string): Visit | null => {
    const i = key.indexOf(":");
    const kind = key.slice(0, i);
    const id = key.slice(i + 1);
    if (kind === "er") {
      const x = er.find((e) => e.id === id);
      return x ? { kind: "er", er: x } : null;
    }
    if (kind === "opd") {
      const x = opd.find((o) => o.id === id);
      return x ? { kind: "opd", op: x } : null;
    }
    return null;
  };
  const visitKey = shownThere && !activeId && visitOf(shownThere) ? shownThere : null;
  const screen: Screen = area === "ward" && wardTab === "menu" ? "wardmenu" : shownThere === NEW_TAB ? "new" : activeId ? "chart" : visitKey ? "visit" : area === "ward" ? (wardTab as WardTab) : area;
  const myWardTabs = wardTabsFor(role);

  /** Bring a ② tab to the front (opening it in 病棟 if needed), showing a chart, 新しいタブ or its own screen. */
  const show = (o: Owner, what?: string) => {
    const w = wardTabOf(o);
    if (w) {
      setArea("ward");
      setWardTabs((all) => (all.includes(w) ? all : [...all, w]));
      setWardTab(w);
    } else setArea(o as AreaKey);
    setFront((f) => ({ ...f, [o]: what }));
    setPanel(null);
  };
  // Opened from a place without patient tabs (やること, ⌘K on 手術室 …): under the first patient list of 病棟.
  const listOwner = (): Owner => {
    const open = wardTabs.find((t) => wardTabInfo(t).group === "patients");
    const any = (["mine", "all", "floor", "dept", "doctor", "map"] as WardTab[]).find((t) => myWardTabs.includes(t));
    return wardOwner(open ?? any ?? myWardTabs[0] ?? "mine");
  };
  // A chart opens where it is already open, else under the tab in front.
  const openPatient = (id: string) => {
    auditLog({ role: me.role, actor: me.name, action: "カルテを開いた", patient: findPatient(id)?.name ?? id });
    const o = ownerFor(patientTabs, id, owner, listOwner());
    if (!patientTabs.some((t) => t.id === id)) setPatientTabs((ts) => [...ts, { id, owner: o }]);
    if (newTabFor === o) setNewTabFor(null);
    show(o, id);
    setPickerOpen(false);
  };

  // A patient of 救急外来 or 外来 opens as a tab after the list (②).
  const openVisit = (kind: "er" | "opd", id: string) => {
    const key = `${kind}:${id}`;
    const v = visitOf(key);
    auditLog({ role: me.role, actor: me.name, action: "受診の画面を開いた", patient: v ? (v.kind === "er" ? v.er.name : v.op.name) : id });
    const o = ownerFor(patientTabs, key, kind, kind);
    if (!patientTabs.some((t) => t.id === key)) setPatientTabs((ts) => [...ts, { id: key, owner: o }]);
    if (newTabFor === o) setNewTabFor(null);
    show(o, key);
  };

  const closePatient = (id: string) => {
    const t = patientTabs.find((x) => x.id === id);
    if (!t) return;
    const next = nextAfterClose(patientTabs, id);
    setPatientTabs((ts) => ts.filter((x) => x.id !== id));
    if (front[t.owner] === id) setFront((f) => ({ ...f, [t.owner]: next ?? undefined }));
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
  // Put the cursor in the first drug search of 注射 / 内服 when that tab is shown (keyboard use).
  const focusRightTab = (t: string) =>
    requestAnimationFrame(() => document.querySelector<HTMLInputElement>(`[data-right-tab="${t}"] input[role=combobox]`)?.focus());

  const patient = activeId ? findPatient(activeId) : undefined;
  const chart = activeId ? mergedChart(charts, activeId, role) : newChart();
  const today = useMemo(() => (todayKey ? parseIso(todayKey) : null), [todayKey]);

  // The record as it stands now: history, with today's stops applied, plus today's confirmed orders.
  const entries: HistoryEntry[] = useMemo(
    () => (patient ? currentEntries(patient, { added: chart.added, stopped: chart.stopped, stopTimes: chart.stopTimes, extended: chart.extended, notes: notes[patient.id], revised: revised[patient.id] }) : []),
    [patient, chart.stopped, chart.stopTimes, chart.extended, chart.added, notes, revised],
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
      patientFacts: patient ? { sex: patient.sex, age: patient.age, allergies: patient.allergies, cre: latestCre(patient), heightCm: patient.heightCm, weightKg: patient.weightKg, pregnancy: patient.pregnancy ?? null } : null,
      txFacts: patient ? { blood: patient.blood, latest: { Hb: latestValue(patient, "Hb"), Plt: latestValue(patient, "Plt"), "PT-INR": latestValue(patient, "PT-INR") } } : null,
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
    setCharts((all) => applyChart(all, id, role, (c) => (typeof patch === "function" ? patch(c) : patch)));
  };

  const updateFor = (id: string, patch: (c: ChartState) => Partial<ChartState>) => setCharts((all) => applyChart(all, id, role, patch));

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
    const extended: Record<string, number> = {};
    const newConsents: ConsentRecord[] = [];
    for (const d of chart.drafts) {
      const r = toOrder(d, ctx);
      stops.push(...r.stopIds);
      if (r.extend) extended[r.extend.orderId] = r.extend.days;
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
      ...Object.entries(extended).flatMap(([id, days]) => {
        const e = entries.find((x): x is OrderEntry => x.kind === "order" && x.id === id);
        if (!e) return [];
        const o = e.order as InjectionOrder;
        const end = orderEndDay({ ...o, days } as InjectionOrder);
        return [`・${o.type === "injection" ? anyDrugName(o.items[0].drugCode) : orderLines(e.order, today).main} 延長：${o.days}日間 → ${days}日間（〜${end !== null ? formatShort(addDays(today, end)) : ""}）`];
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
      extended: { ...c.extended, ...extended },
      drafts: [],
      note: lines.length ? `${c.note.replace(/\s*$/, "")}\n${lines.join("\n")}\n` : c.note,
      flash: `${added.length + stops.length + Object.keys(extended).length}件を確定しました。左の経過と記事の P) に入りました。${newConsents.length ? `同意書の下書き ${newConsents.length}件（右の「同意書」）。` : ""}`,
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

  // The ward takes in an 入院申込: the bed is decided and the ward chart is made from the visit.
  const acceptRequest = (r: AdmissionRequest, bed: { room: string; bed: string }) => {
    const id = `9002${String(admitted.length + 1).padStart(4, "0")}`;
    const said = (visitNotes[`${r.from.kind}:${r.from.id}`] ?? []).map((n) => n.text);
    let built: ReturnType<typeof admitFromOpd> | null = null;
    if (r.from.kind === "er") {
      const e = er.find((x) => x.id === r.from.id);
      if (!e) return;
      built = admitFromEr(e, { diagnosis: r.diagnosis, department: r.department, heightCm: r.heightCm, weightKg: r.weightKg, allergies: r.allergies, room: bed.room, bed: bed.bed }, id, nowTime);
      built.patient.history.splice(1, 0, ...said.map((t) => ({ kind: "note" as const, day: 0, time: nowTime, author: r.attending, role: "医師" as const, text: `救急外来：${t}` })));
      setEr((list) => list.map((x) => (x.id === e.id ? { ...x, status: "入院済", admittedAs: id } : x)));
    } else {
      const o = opd.find((x) => x.id === r.from.id);
      if (!o) return;
      built = admitFromOpd(o, r, bed, id, nowTime, said);
      setOpd((list) => list.map((x) => (x.id === o.id ? { ...x, status: "終了" } : x)));
    }
    const { patient: p, bed: b } = built;
    auditLog({ role: me.role, actor: me.name, action: "確定（入院を受けた・ベッドを決めた）", patient: p.name, detail: `${b.room}${b.bed ? `-${b.bed}` : ""}　${r.urgency}　${r.diagnosis}` });
    setAdmitted((a) => [...a, p]);
    // 緊急入院 counts as emergency (退院困難な要因 イ, 栄養管理計画は7日以内).
    setEvals((all) => ({ ...all, [id]: { patientId: id, emergency: r.urgency === "緊急" } }));
    setNewBeds((x) => [...x, b]);
    // The admission diagnosis is kept as 未コード化傷病名 until a master name is chosen.
    setDiagnoses((all) => ({
      ...all,
      [id]: [{ id: newId(), code: UNCODED, name: r.diagnosis.trim(), prefixes: [], suffixes: [], main: true, start: 0, outcome: "継続" }],
    }));
    setRequests((rs) => rs.map((x) => (x.id === r.id ? { ...x, status: "入院済", admittedAs: id } : x)));
    openPatient(id);
  };
  const requestFor = (kind: "er" | "opd") =>
    Object.fromEntries(requests.filter((r) => r.from.kind === kind && r.status !== "取消").map((r) => [r.from.id, r])) as Record<string, AdmissionRequest | undefined>;

  const addManualLab = (draft: Draft) => update((c) => ({ drafts: [...c.drafts, draft], flash: null }));
  // A stop chosen on a calendar becomes a draft like any other; the doctor confirms it on the right.
  // Doses the ward recorded as 未実施, for the claim ("orderId|minutes").
  const notGivenOf = (pid: string) => Object.values(mar).filter((r) => r.patientId === pid && r.status === "未実施").map((r) => r.key);
  // 指導の記録: kept, answers the open 指導の依頼, goes into the chart as the writer's note, and for an
  // eligible 栄養食事指導 within the fee schedule's limits (週1回・入院中2回) goes to the claim.
  const recordGuidance = (pid: string, r: GuidanceInput, fromPharmacy = false) => {
    const rec: GuidanceRecord = { ...r, id: newId(), patientId: pid, by: me.name, at: { day: 0, time: nowTime } };
    setGuidance((all) => [...all, rec]);
    const n: NoteEntry = { kind: "note", id: newId(), day: 0, time: nowTime, author: me.name, role: me.role, text: guidanceNoteText(rec) };
    setNotes((all) => ({ ...all, [pid]: [...(all[pid] ?? []), n] }));
    if (r.kind === "栄養食事指導" && r.eligible && r.eligible !== "対象外（算定しない）") {
      const earlier = guidance.filter((g) => g.patientId === pid && g.kind === "栄養食事指導" && g.eligible && g.eligible !== "対象外（算定しない）").map((g) => g.at.day);
      const dow = (d: number) => new Date(Date.UTC(today.y, today.m - 1, today.d + d)).getUTCDay();
      if (!nutritionCountNote(earlier, 0, dow) && !nutritionTimeNote(r.minutes, earlier.length)) setBilling((all) => ({ ...all, [pid]: { ...(all[pid] ?? DEFAULT_OPTIONS), eiyoShido: [...((all[pid] ?? DEFAULT_OPTIONS).eiyoShido ?? []), { day: 0 }] } }));
    }
    if (!fromPharmacy) auditLog({ role: me.role, actor: me.name, action: `確定（${r.kind}の記録）`, patient: findPatient(pid)?.name, detail: `${r.heard}・${r.minutes ?? "？"}分${r.answers.length ? `・依頼 ${r.answers.length}件を済みに` : ""}` });
  };

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
  // 延長 and 修正 from the injection calendar (left view or the right tab).
  const extendDraft = (e: OrderEntry, n: number) => {
    const draft: ExtendDraft = { id: newId(), origin: "manual", sourceText: "（カレンダーから延長）", comment: null, kind: "extend", targetOrderId: e.id, addDays: n };
    update((c) => ({ drafts: [...c.drafts.filter((d) => !(d.kind === "extend" && d.targetOrderId === e.id)), draft], flash: `延長の下書きを作りました（${n}日）。記事の下で確かめて確定してください。` }));
  };
  const modifyOrder = (e: OrderEntry) => {
    if (e.order.type !== "injection") return;
    addStopDraft(e, "（カレンダーから修正）");
    const order = e.order;
    update((c) => ({
      injSeed: { key: newId(), order },
      openTabs: c.openTabs.includes("injection") ? c.openTabs : [...c.openTabs, "injection"],
      rightTab: floating.injection ? c.rightTab : "injection",
      flash: "前のオーダの中止の下書きを入れ、同じ内容を注射のタブに写しました。直して下書きにし、まとめて確定してください。",
    }));
    if (floating.injection) toFront("injection");
  };
  const pendingExtends: Record<string, number> = Object.fromEntries(chart.drafts.flatMap((d) => (d.kind === "extend" ? [[d.targetOrderId, d.addDays]] : [])));
  const toFront = (t: RightTab) => setZOrder((z) => [...z.filter((x) => x !== t), t]);
  const openRight = (t: RightTab) => {
    update((c) => ({ openTabs: t === "note" || c.openTabs.includes(t) ? c.openTabs : [...c.openTabs, t], rightTab: floating[t] ? c.rightTab : t }));
    if (floating[t]) toFront(t);
    focusRightTab(t);
  };

  // Do: a past note or order copied to the right (dragged from the left, or from its menu).
  const doFromHistory = (p: DoPayload) => {
    if (p.kind === "note") {
      update((c) => ({ note: `${c.note.replace(/\s*$/, "")}${c.note.trim() ? "\n" : ""}${p.text}\n`, flash: `${p.label} の記載を記事に写しました（Do）。直してから確定してください。` }));
      openRight("note");
      return;
    }
    const e = entries.find((x): x is OrderEntry => x.kind === "order" && x.id === p.entryId);
    if (!e || !patient) return;
    const o = e.order;
    if (o.type === "injection") {
      update({ injSeed: { key: newId(), order: o }, flash: "同じ注射を注射のタブに写しました（Do）。直して下書きにしてください。" });
      openRight("injection");
    } else if (o.type === "prescription") {
      const rp = o.rp;
      const same = entries.filter((x): x is OrderEntry => x.kind === "order" && x.order.type === "prescription" && (rp ? x.order.rp === rp : x.id === e.id));
      const [pattern] = previousOf(patient.id, same.map((x) => (x.order.type === "prescription" && x.order.category === "持参薬" ? { ...x, order: { ...x.order, category: "定期" as const } } : x)));
      if (!pattern) return;
      update({ rxSeed: { key: newId(), pattern }, flash: "同じ処方を内服のタブに写しました（Do）。日数などを確かめて下書きにしてください。" });
      openRight("rx");
    } else if (o.type === "lab") {
      addManualLab({ id: newId(), origin: "manual", sourceText: "（Do：前の検査から）", comment: null, kind: "lab", tests: o.codes.map((code) => ({ code, said: code })), collect: { day: null, when: null, time: null, beforeDose: null }, priority: null, cultureSets: null, duplicateOk: false });
      update({ flash: "同じ検査を下書きにしました（Do）。採る日時を選んでください。" });
      openRight("note");
    }
  };

  // Append to the instruction box, adding a sentence break when needed.
  const insertText = (text: string) =>
    update((c) => {
      const cur = c.instruction.replace(/\s*$/, "");
      return { instruction: cur ? `${cur}${/[。、]$/.test(cur) ? "" : "。"}${text}` : text };
    });

  const sessionChanges = Object.fromEntries(Object.entries(charts).filter(([k]) => !k.includes("|")).map(([id, c]) => [id, { added: c.added, stopped: c.stopped, stopTimes: c.stopTimes, extended: c.extended, notes: notes[id], revised: revised[id] }]));
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

  const areas = areasFor(role);
  /** A ② screen of 病棟, shown on its own (from やること, its menu …). */
  const goWard = (t: WardTab) => show(wardOwner(t), undefined);
  const openArea = (k: AreaKey) => {
    const a = areas.find((x) => x.key === k);
    if (!a || a.soon) return;
    setPanel(null);
    setArea(k);
    // 病棟 with nothing open: the screens checked 最初に開く, else its menu.
    if (k === "ward" && !wardTabs.length) {
      const d = allowedWardTabs(role, defaultsOf(wardDefaults, role));
      setWardTabs(d);
      setWardTab(d[0] ?? "menu");
    }
  };
  // Closing a ② tab closes the charts under it (their records stay).
  const closeWardTab = (t: WardTab) => {
    const o = wardOwner(t);
    const rest = wardTabs.filter((x) => x !== t);
    setWardTabs(rest);
    setPatientTabs((ts) => ts.filter((x) => x.owner !== o));
    setFront((f) => ({ ...f, [o]: undefined }));
    if (newTabFor === o) setNewTabFor(null);
    if (wardTab === t) {
      const i = wardTabs.indexOf(t);
      setWardTab(rest[Math.min(i, rest.length - 1)] ?? "menu");
    }
  };
  const toggleDefault = (t: WardTab) =>
    setWardDefaults((all) => {
      const cur = defaultsOf(all, role);
      const next = { ...all, [role]: cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t] };
      saveWardDefaults(next);
      return next;
    });
  // The lists of 病棟: a floor, 受け持ち, by department, all wards, by attending doctor.
  const floorInfo: Floor = FLOORS.find((f) => f.name === floor) ?? FLOORS[0];
  const allBeds = [...ward.beds, ...OTHER_FLOOR_BEDS];
  const bedsOn = (name: string) => allBeds.filter((b) => floorOf(b.room) === name);
  const deptOf = (b: BedAssignment) => (b.patientId ? findPatient(b.patientId)?.department : b.other?.department) ?? "";
  const doctorOf = (b: BedAssignment) => (b.patientId ? (findPatient(b.patientId)?.attending ?? "") : doctorFor(b.other?.department ?? ""));
  const choices = (xs: string[], all: string) => [{ value: "", label: all }, ...[...new Set(xs)].filter(Boolean).sort((a, b) => a.localeCompare(b, "ja")).map((x) => ({ value: x, label: x }))];
  const floorPick: Pick = { label: "階", value: floor, options: FLOORS.map((f) => ({ value: f.name, label: f.name })), onChange: setFloor };
  const lists: Record<(typeof LIST_TABS)[number], { beds: BedAssignment[]; title: string; pick?: Pick; group: GroupBy; floor?: Floor }> = {
    floor: { beds: bedsOn(floor), title: "患者一覧", pick: floorPick, group: "room", floor: floorInfo },
    mine: { beds: ward.beds.filter((b) => b.patientId), title: "受け持ち患者", group: "room" },
    dept: {
      beds: deptPick ? allBeds.filter((b) => deptOf(b) === deptPick) : allBeds,
      title: "科別",
      pick: { label: "科", value: deptPick, options: choices(allBeds.map(deptOf), "すべての科"), onChange: setDeptPick },
      group: "department",
    },
    all: { beds: allBeds, title: "全病棟の患者一覧", group: "floor" },
    doctor: {
      beds: doctorPick ? allBeds.filter((b) => doctorOf(b) === doctorPick) : allBeds,
      title: "主治医別",
      pick: { label: "主治医", value: doctorPick, options: choices(allBeds.map(doctorOf), "すべての主治医"), onChange: setDoctorPick },
      group: "doctor",
    },
  };
  const listKey = LIST_TABS.find((k) => k === screen);
  // やること: what waits for this role, from everywhere, each with where to go.
  const todos: Todo[] = [];
  for (const x of people) {
    const pid = x.patient.id;
    const r = resultState[pid];
    if (!deny("result.ack") && r?.panic) todos.push({ key: `panic-${pid}`, label: `パニック値：${x.patient.name}さん`, detail: "対応を書いて確認する", count: r.panic, tone: "shu", go: () => openPatient(pid) });
    if (!deny("result.ack") && r && r.unseen > r.panic) todos.push({ key: `unseen-${pid}`, label: `未確認の結果：${x.patient.name}さん`, count: r.unseen - r.panic, tone: "ai", go: () => openPatient(pid) });
    const v = verbalUnsigned(x.entries).length;
    if (!deny("order.sign") && v) todos.push({ key: `verbal-${pid}`, label: `口頭指示の承認待ち：${x.patient.name}さん`, count: v, tone: "yamabuki", go: () => openPatient(pid) });
  }
  // 指示簿: the latest vitals against the call criteria, and versions no nurse has taken yet.
  const standingNow = (pid: string) => standing[pid]?.at(-1);
  const callsMet: Record<string, string[]> = Object.fromEntries(people.map((x) => [x.patient.id, callHits(standingNow(x.patient.id), x.patient.vitals.at(-1))]));
  const standingFlags: Record<string, Flag[]> = Object.fromEntries(
    people.map((x) => {
      const pid = x.patient.id;
      const out: Flag[] = callsMet[pid].length ? [{ label: "医師を呼ぶ基準", tone: "shu", title: `指示簿の基準に当たる：${callsMet[pid].join("、")}` }] : [];
      if (standingNow(pid) && !standingNow(pid)!.taken) out.push({ label: "指示簿 指示受けがまだ", tone: "yamabuki", title: "指示簿が変わりました" });
      for (const e of x.entries) {
        if (e.status !== "有効" || e.order.type !== "procedure" || !e.order.leave) continue;
        const l = e.order.leave;
        if (l.from.day >= 0 && l.from.day <= 1) out.push({ label: `${l.from.day === 0 ? "今日" : "明日"} ${l.from.time} ${l.kind}`, tone: "wakatake", title: `${l.destination}${l.back ? `　戻り ${l.back.time}` : ""}` });
      }
      const rs = activeOf(restraints, pid);
      if (rs) out.push({ label: `身体的拘束中 ${durationText(minutesOf(rs, abs(0, nowTime)))}`, tone: "shu", title: `${rs.devices.join("・")}　${reviewDue(rs, abs(0, nowTime))?.text ?? ""}` });
      return [pid, out];
    }),
  );
  // The 移動 row of the 移動・食事 calendar: admission, booked and done moves, discharge and leave.
  const moveEventsOf = (pid: string): MoveEvent[] => {
    const p = findPatient(pid);
    const es = (people.find((x) => x.patient.id === pid)?.entries ?? []).filter((e) => e.status === "有効" && e.order.type === "procedure");
    return [
      ...(p ? [{ day: p.admittedOn, time: null, label: "入院", tone: "ink" as const }] : []),
      ...es.flatMap((e): MoveEvent[] => {
        const o = e.order;
        if (o.type !== "procedure") return [];
        if (o.move) return [{ day: o.start.day, time: o.start.time ?? null, label: moveText(o.move), tone: "ai", entryId: e.id, done: !!movesDone[e.id] }];
        if (o.leave) return [{ day: o.leave.from.day, time: o.leave.from.time, label: `${o.leave.kind}（${o.leave.destination}）`, tone: o.leave.kind === "退院" ? "wakatake" : "yamabuki", ...(o.leave.kind === "退院" ? { entryId: e.id, done: !!discharged[pid] } : {}) }, ...(o.leave.back ? [{ day: o.leave.back.day, time: o.leave.back.time, label: `${o.leave.kind}から帰院`, tone: "yamabuki" as const }] : [])];
        return [];
      }),
      ...moveLog.filter((m) => m.patientId === pid).map((m) => ({ day: 0, time: m.time, label: m.label, tone: "ai" as const, done: true })),
    ];
  };
  // 実施: carry out a booked move now (the bed is checked again: still empty, the room's sex).
  const doMove = (entryId: string) => {
    const x = people.find((y) => y.entries.some((e) => e.id === entryId));
    const e = x?.entries.find((y) => y.id === entryId);
    // 退院: show the checklist first.
    if (x && e && e.order.type === "procedure" && e.order.leave?.kind === "退院") return setDischargeAsk(x.patient.id);
    if (!x || !e || e.order.type !== "procedure" || !e.order.move) return;
    const m = e.order.move;
    const pid = x.patient.id;
    if (m.kind === "転科") {
      setDeptChanges((all) => ({ ...all, [pid]: { dept: m.toDept!, doctor: m.toDoctor! } }));
    } else {
      const to = m.to!;
      const room = FLOORS.flatMap((f) => f.rooms).find((r) => r.no === to.room);
      const taken = allBeds.some((b) => b.room === to.room && b.bed === to.bed && b.patientId !== pid);
      const problem = taken ? "そのベッドはいま空いていません" : room ? bedProblem({ beds: allBeds, patient: findPatient }, room, x.patient.sex) : "その部屋はありません";
      if (problem) {
        update({ flash: `実施できません：${problem}。予約を中止して、別のベッドで予約し直してください。` });
        return;
      }
      setMoves((all) => ({ ...all, [pid]: to }));
    }
    auditLog({ role: me.role, actor: me.name, action: `確定（${m.kind}の実施）`, patient: x.patient.name, detail: moveText(m) });
    setMovesDone((all) => ({ ...all, [entryId]: nowTime }));
    updateFor(pid, (c) => ({ note: `${c.note.replace(/\s*$/, "")}\n・${m.kind}を実施（${nowTime}）：${moveText(m)}\n` }));
  };
  const openStanding = (pid: string) => {
    openPatient(pid);
    setPanel("standing");
  };
  for (const x of people) {
    const pid = x.patient.id;
    if (callsMet[pid].length && (role === "看護師" || role === "医師")) todos.push({ key: `call-${pid}`, label: `医師を呼ぶ基準に当たる：${x.patient.name}さん`, detail: callsMet[pid].join("、"), count: callsMet[pid].length, tone: "shu", go: () => openStanding(pid) });
    for (const e of x.entries) {
      if (e.status !== "有効" || e.order.type !== "procedure" || !e.order.guide || !e.order.guide.kind) continue;
      const g = e.order.guide;
      // A request answered by a 指導の記録 is done.
      if (!openRequests([e], g.kind, guidance).length) continue;
      if (GUIDE_TO[g.kind] === role)
        todos.push({
          key: `guide-${e.id}`,
          label: `${g.kind}の依頼：${x.patient.name}さん`,
          detail: g.note || undefined,
          count: 1,
          tone: "ai",
          // 薬剤師 records 服薬指導 in 薬剤部; the others in the chart's 指導の記録.
          go:
            role === "薬剤師"
              ? () => openArea("pharmacy")
              : () => {
                  openPatient(pid);
                  setPanel("guide-record");
                },
        });
    }
    const rsNow = activeOf(restraints, pid);
    const due = rsNow ? reviewDue(rsNow, abs(0, nowTime)) : null;
    if (due?.late && (role === "看護師" || role === "医師")) todos.push({ key: `restraint-${pid}`, label: `身体的拘束の見直し：${x.patient.name}さん`, detail: due.text, count: 1, tone: "shu", go: () => (openPatient(pid), setPanel("restraint")) });
    if (role === "看護師" && standingNow(pid) && !standingNow(pid)!.taken) todos.push({ key: `standing-${pid}`, label: `指示簿の指示受けがまだ：${x.patient.name}さん`, count: 1, tone: "yamabuki", go: () => openStanding(pid) });
  }
  const takeWaiting = Object.values(waiting).reduce((a, b) => a + b, 0);
  if (role === "看護師" && takeWaiting) todos.push({ key: "take", label: "指示受けがまだ", detail: "ワークシートで受ける", count: takeWaiting, tone: "yamabuki", go: () => goWard("sheet") });
  if (admitDue) todos.push({ key: "admit", label: "入院時の評価：期限切れ・今日まで", count: admitDue, tone: "shu", go: () => goWard("admit") });
  const toCall = uncalled(wardResults.filter((i) => i.day === 0), calls).length;
  if (!deny("panic.call") && toCall) todos.push({ key: "call", label: "パニック値の連絡がまだ", detail: "検査室で連絡を記録する", count: toCall, tone: "shu", go: () => openArea("lab") });

  const summaries: Record<string, ChartSummary> = Object.fromEntries(
    Object.entries(charts)
      .filter(([k]) => !k.includes("|"))
      .map(([id, c]) => [id, { drafts: charts[deskKeyOf(id, role)]?.drafts.length ?? 0, confirmedToday: c.added.length + c.stopped.length, waiting: waiting[id] ?? 0 }]),
  );
  const wideLeft = chart.leftView !== "record";

  // 新しいタブ (＋ on ③, or on ② in 救急外来・外来): find a patient and open the chart under that tab.
  const openNewTab = (o: Owner) => {
    setNewTabFor(o);
    show(o, NEW_TAB);
  };
  const closeNewTab = () => {
    const o = newTabFor;
    setNewTabFor(null);
    if (o) setFront((f) => (f[o] === NEW_TAB ? { ...f, [o]: undefined } : f));
  };

  const switchRole = (r: Role) => {
    auditLog({ role: r, actor: STAFF[r].name, action: "職種を選んで入った（デモではログインの代わり）" });
    setRole(r);
    // Charts stay open; those under a screen the role cannot open move to its first patient list.
    const moved = rehome(patientTabs, wardTabsFor(r));
    const keep = allowedWardTabs(r, [...defaultsOf(wardDefaults, r), ...wardTabs, ...moved.flatMap((t) => wardTabOf(t.owner) ?? [])]);
    setPatientTabs(moved);
    setWardTabs(keep);
    setWardTab(keep[0] ?? "menu");
    setArea(homeArea(r));
    setFront({});
    setNewTabFor(null);
    setPanel(null);
  };
  const orderMode = !deny("order") ? "doctor" : !deny("order.verbal") ? "verbal" : "none";
  const orderBlock = orderMode === "none" ? deny("order") ?? undefined : undefined;
  const blocked: Partial<Record<PanelKind, string>> = {
    ...(orderBlock ? { "add-injection": orderBlock, "add-rx": orderBlock, "add-lab": orderBlock, "add-imaging": orderBlock, "add-physio": orderBlock, "add-procedure": orderBlock, "add-dialysis": orderBlock, "add-transfusion": orderBlock, regimen: orderBlock, sets: orderBlock, "add-rehab": orderBlock, "add-consult": orderBlock, "add-leave": orderBlock, "add-discharge": orderBlock, "add-guide": orderBlock } : {}),
    ...(deny("billing") ? { billing: deny("billing")! } : {}),
  };

  const wardBadges: Partial<Record<WardTab, number>> = { mine: role === "医師" ? unseenResults.length : 0, admit: admitDue };
  const ownerLabel = (o: Owner) => {
    const w = wardTabOf(o);
    return w ? wardTabLabel(w, floor) : o === "er" ? "救急外来" : "外来";
  };

  // The screen itself.
  const content = (
    <>
      {screen === "wardmenu" ? (
        <WardMenu options={myWardTabs} open={wardTabs} defaults={allowedWardTabs(role, defaultsOf(wardDefaults, role))} badges={wardBadges} onOpen={goWard} onToggleDefault={toggleDefault} />
      ) : screen === "new" ? (
        <NewTabPage
          patients={allPatients}
          openIds={patientTabs.map((t) => t.id)}
          under={owner ? ownerLabel(owner) : ""}
          todos={todos.map((t) => ({
            ...t,
            go: () => {
              closeNewTab();
              t.go();
            },
          }))}
          onPatient={(id) => {
            closeNewTab();
            openPatient(id);
          }}
        />
      ) : screen === "visit" && visitKey ? (
        <VisitChart
          key={visitKey}
          visit={visitOf(visitKey)!}
          nowTime={nowTime}
          fmtDay={(d) => formatShort(addDays(today, d))}
          notes={visitNotes[visitKey] ?? []}
          onNote={(text) => {
            const v = visitOf(visitKey)!;
            auditLog({ role: me.role, actor: me.name, action: "確定（受診の記録）", patient: v.kind === "er" ? v.er.name : v.op.name, detail: text.slice(0, 120) });
            setVisitNotes((all) => ({ ...all, [visitKey]: [...(all[visitKey] ?? []), { text, at: nowTime, by: me.name }] }));
          }}
          request={requests.find((r) => `${r.from.kind}:${r.from.id}` === visitKey && r.status !== "取消")}
          onRequest={(r) => {
            auditLog({ role: me.role, actor: me.name, action: "確定（入院申込）", patient: r.name, detail: `${r.urgency}　${r.ward}　${r.diagnosis}` });
            setRequests((rs) => [...rs, r]);
            if (r.from.kind === "er") setEr((list) => list.map((x) => (x.id === r.from.id && x.status !== "入院済" ? { ...x, status: "入院依頼" } : x)));
          }}
          onCancelRequest={(id) => {
            auditLog({ role: me.role, actor: me.name, action: "入院申込を取り消した", patient: requests.find((r) => r.id === id)?.name });
            setRequests((rs) => rs.map((r) => (r.id === id ? { ...r, status: "取消" } : r)));
          }}
          onOpenChart={openPatient}
          onStatus={(st) => {
            const i = visitKey.indexOf(":");
            const kind = visitKey.slice(0, i);
            const id = visitKey.slice(i + 1);
            if (kind === "er") setEr((list) => list.map((x) => (x.id === id ? { ...x, status: st as ErStatus } : x)));
            else setOpd((list) => list.map((x) => (x.id === id ? { ...x, status: st as OpdStatus } : x)));
          }}
          newId={newId}
          extraTools={(() => {
            const v = visitOf(visitKey)!;
            if (v.kind !== "opd") return [];
            const op = v.op;
            const fmt = (d: number) => formatShort(addDays(today, d));
            const rxDone = opdRx[op.id] ?? [];
            const rv = revisits[op.id];
            return [
              {
                key: "rx",
                label: "外来処方",
                icon: PillIcon,
                summary: rxDone.length ? rxDone.flatMap((r) => r.lines).map((l) => <div key={l} className="text-[12px]">{l}</div>) : undefined,
                panel: (
                  <OpdRxPanel
                    allergies={op.allergies}
                    memory={{ patterns: patternsOf(PAST_RX), previous: [], me: me.name }}
                    nowTime={nowTime}
                    newId={newId}
                    fmtDay={fmt}
                    rx={rxDone}
                    onRx={(lines) => {
                      auditLog({ role: me.role, actor: me.name, action: "確定（外来処方・院外処方せん）", patient: op.name, detail: lines.join("／").slice(0, 160) });
                      setOpdRx((all) => ({ ...all, [op.id]: [...(all[op.id] ?? []), { lines, by: me.name, at: nowTime }] }));
                      setVisitNotes((all) => ({ ...all, [visitKey]: [...(all[visitKey] ?? []), { text: `処方（院外）：\n${lines.join("\n")}`, at: nowTime, by: me.name }] }));
                    }}
                  />
                ),
              },
              {
                key: "revisit",
                label: "再診予約",
                icon: CalendarPlus,
                summary: rv ? <p className="nums text-[12px]">{fmt(rv.day)} {rv.time}　{rv.purpose}（{rv.by}）</p> : undefined,
                panel: (
                  <RevisitPanel
                    fmtDay={fmt}
                    revisit={rv}
                    onRevisit={(r) => {
                      auditLog({ role: me.role, actor: me.name, action: "確定（再診予約）", patient: op.name, detail: `${fmt(r.day)} ${r.time} ${r.purpose}` });
                      setRevisits((all) => ({ ...all, [op.id]: { ...r, by: me.name } }));
                      setVisitNotes((all) => ({ ...all, [visitKey]: [...(all[visitKey] ?? []), { text: `次回：${fmt(r.day)} ${r.time}（${r.purpose}）`, at: nowTime, by: me.name }] }));
                    }}
                  />
                ),
              },
            ];
          })()}
        />
      ) : screen === "meals" ? (
        <MealsView title={WARD_NAME} people={people} diets={diets} today={today} nowTime={nowTime} />
      ) : screen === "journal" ? (
        <JournalView
          title="看護日誌"
          pick={floorPick}
          nowTime={nowTime}
          staff={staffing(floorInfo)}
          lines={journalLines({
            floor: floorInfo,
            ward,
            beds: allBeds,
            requests,
            restrained: restraints.filter((r) => !r.end).map((r) => findPatient(r.patientId)?.name ?? ""),
            callsMet: people.filter((x) => callsMet[x.patient.id]?.length).map((x) => x.patient.name),
            surgeriesToday: surgeries.filter((x) => x.day === 0).map((x) => x.name),
            dialysisToday: people.filter((x) => x.entries.some((e) => e.status === "有効" && e.order.type === "procedure" && e.order.code === "PROC-HD" && e.order.start.day === 0)).map((x) => x.patient.name),
            incidentsToday: incidents.filter((r) => r.occurred.day === 0).length,
          })}
          saved={journal[floor] ?? []}
          onSave={(text) => {
            auditLog({ role: me.role, actor: me.name, action: "看護日誌に書き残した", detail: `${floor}　${text.slice(0, 80)}` });
            setJournal((all) => ({ ...all, [floor]: [...(all[floor] ?? []), { text, by: me.name, at: nowTime }] }));
          }}
        />
      ) : screen === "extract" ? (
        <ExtractView
          run={(q) =>
            runExtract(
              q,
              allPatients,
              (p) => currentEntries(p, sessionChanges[p.id]).filter((e): e is OrderEntry => e.kind === "order"),
              (p) => diagnoses[p.id] ?? [],
              (p) => `${floorOf(p.room).replace("病棟", "")} ${p.room}`,
            )
          }
          onExport={(n) => auditLog({ role: me.role, actor: me.name, action: "データ抽出を CSV で保存した", detail: `${n}件` })}
        />
      ) : screen === "board" ? (
        <BoardView
          notices={notices}
          reads={reads}
          today={today}
          nowTime={nowTime}
          onRead={(id, name) => setReads((r) => markRead(r, id, name))}
          onPost={(n) => setNotices((ns) => [...ns, n])}
        />
      ) : screen === "manual" ? (
        <ManualView openId={manualOpen} onOpen={setManualOpen} />
      ) : screen === "incident" ? (
        <IncidentView
          reports={incidents}
          patients={people.map((x) => ({ id: x.patient.id, name: x.patient.name, room: x.room }))}
          today={today}
          nowTime={nowTime}
          onSubmit={(r) => {
            setIncidents((rs) => [...rs, r]);
            setIncidentDraft(emptyDraft());
          }}
          onStatus={(id, _st, change) => setIncidents((rs) => applyStatus(rs, id, change))}
          draft={incidentDraft}
          onDraft={setIncidentDraft}
        />
      ) : screen === "opd" ? (
        <OpdBoard
          patients={opd}
          nowTime={nowTime}
          requests={requestFor("opd")}
          onOpen={(id) => openVisit("opd", id)}
          onStatus={(id, st) => setOpd((list) => list.map((x) => (x.id === id ? { ...x, status: st } : x)))}
          onArrive={(id) => setOpd((list) => list.map((x) => (x.id === id ? { ...x, arrived: nowTime, status: "受付済" } : x)))}
          onOpenChart={openPatient}
        />
      ) : screen === "map" ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <WardRequests floor={floor} requests={requests} ward={ward} rooms={floorInfo.rooms} fmtDay={(d) => formatShort(addDays(today, d))} onAccept={acceptRequest} />
          <WardMap
            ward={{ beds: bedsOn(floor), patient: findPatient }}
            rooms={floorInfo.rooms}
            title="病棟マップ"
            pick={floorPick}
            summaries={summaries}
            onOpen={openPatient}
            onMove={deny("bed.move") ? undefined : (patientId, to) => setMoving({ patientId, to })}
          />
        </div>
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
          onOpenChart={openPatient}
          onOpenVisit={(id) => openVisit("er", id)}
          requests={requestFor("er")}
        />
      ) : screen === "sheet" ? (
        <Worksheet
          people={people}
          today={today}
          nowTime={nowTime}
          // 指示簿の頓用: only standing orders a nurse has taken (指示受け) are used on the ward.
          standingPrn={people.flatMap((x) => {
            const s = standingNow(x.patient.id);
            return s?.taken ? s.prn.map((rule) => ({ patientId: x.patient.id, room: x.room, name: x.patient.name, rule })) : [];
          })}
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
          voided={marVoided}
          onVoid={(r, reason) => {
            const item = people.flatMap((x) => x.entries).find((e) => e.id === r.orderId);
            auditLog({ role: me.role, actor: me.name, action: `${r.status}の記録を取り消した`, patient: findPatient(r.patientId)?.name, detail: `${item ? orderLines(item.order, today).main : r.orderId}　${r.doneAt} ${r.by} の記録　理由：${reason}` });
            setMarVoided((all) => ({ ...all, [r.key]: [...(all[r.key] ?? []), { record: r, by: me.name, at: nowTime, reason }] }));
            setMar((all) => {
              const next = { ...all };
              delete next[r.key];
              return next;
            });
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
          onSave={(h) => setHandoffs((all) => ({ ...all, [handoffKey(h.patientId, h.shiftLo ?? 0)]: h }))}
          onSend={(h) => {
            auditLog({ role: me.role, actor: me.name, action: "確定（申し送りを送った）", patient: findPatient(h.patientId)?.name, detail: `${h.shift}　${h.severity}　やること ${h.actions.length}件` });
            setHandoffs((all) => ({ ...all, [handoffKey(h.patientId, h.shiftLo ?? 0)]: h }));
          }}
          onReceive={(h) => {
            auditLog({ role: me.role, actor: h.to ?? me.name, action: "確定（申し送りを受けた・復唱）", patient: findPatient(h.patientId)?.name, detail: h.synthesis });
            setHandoffs((all) => ({ ...all, [handoffKey(h.patientId, h.shiftLo ?? 0)]: h }));
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
          wardOrders={people.flatMap((x) =>
            x.entries
              .filter((e) => e.status === "有効" && e.order.type === "procedure" && e.order.code === "PROC-HD")
              .map((entry) => ({ patientId: x.patient.id, name: x.patient.name, room: x.room, entry })),
          )}
          onOpenChart={openPatient}
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
            // Into the chart as the pharmacist's note, answering an open 服薬指導 request.
            const pe = people.find((x) => x.patient.id === pid)?.entries ?? [];
            recordGuidance(pid, { kind: "服薬指導", heard: "本人", minutes: null, text: `（薬剤管理指導 区分${rec.kind}）${rec.text}`, answers: openRequests(pe, "服薬指導", guidance).map((e) => e.id) }, true);
            setShido((all) => ({ ...all, [pid]: [...(all[pid] ?? []), { ...rec, day: 0, at: nowTime }] }));
          }}
          dispensed={dispensed}
          onDispense={(key) => setDispensed((d) => ({ ...d, [key]: nowTime }))}
          txIssued={txIssued}
          onTxIssue={(entryId, lot) => {
            const who = people.find((x) => x.entries.some((e) => e.id === entryId))?.patient.name;
            auditLog({ role: me.role, actor: me.name, action: "確定（血液製剤の払出）", patient: who, detail: `製造番号 ${lot}` });
            setTxIssued((all) => ({ ...all, [entryId]: { lot, at: nowTime, by: me.name } }));
          }}
          homeRx={homeRx}
          onHomeRx={(id, patch) => setHomeRx((all) => ({ ...all, [id]: { ...all[id], ...patch } }))}
          journal={pharmJournal}
          onJournal={(text) => {
            auditLog({ role: me.role, actor: me.name, action: "病棟薬剤業務日誌に書き残した", detail: text.slice(0, 80) });
            setPharmJournal((j) => [...j, { text, at: nowTime }]);
          }}
          tdm={tdmReports}
          onTdm={(r) => {
            auditLog({ role: me.role, actor: me.name, action: "TDM を医師に報告", patient: findPatient(r.patientId)?.name, detail: `${r.drug} AUC24 ${Math.round(r.auc24)}　${r.proposal}` });
            setTdmReports((all) => [...all, { ...r, id: newId(), at: nowTime, by: me.name, status: "医師へ報告" }]);
          }}
        />
      ) : listKey ? (
        <div className="flex min-h-0 flex-1 flex-col">
        {listKey === "floor" && <WardRequests floor={floor} requests={requests} ward={ward} rooms={floorInfo.rooms} fmtDay={(d) => formatShort(addDays(today, d))} onAccept={acceptRequest} />}
        <PatientList
          key={listKey}
          ward={{ beds: lists[listKey].beds, patient: findPatient }}
          title={lists[listKey].title}
          pick={lists[listKey].pick}
          defaultGroup={lists[listKey].group}
          floor={lists[listKey].floor}
          nowTime={nowTime}
          changes={sessionChanges}
          summaries={summaries}
          waiting={waiting}
          resultState={resultState}
          extraFlags={standingFlags}
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
        </div>
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
            onPregnancy={
              deny("vitals")
                ? undefined
                : (v) => {
                    auditLog({ role: me.role, actor: me.name, action: v ? "確定（妊娠中の印）" : "妊娠中の印を外した", patient: patient.name, detail: v?.weeks ? `${v.weeks}週` : undefined });
                    setPregnancy((all) => ({ ...all, [patient.id]: v }));
                  }
            }
          />
          <StickyStrip
            stickies={stickies[patient.id] ?? []}
            nowTime={nowTime}
            newId={newId}
            onAdd={(st) => setStickies((all) => ({ ...all, [patient.id]: [...(all[patient.id] ?? []), st] }))}
            onRemove={(id) => setStickies((all) => ({ ...all, [patient.id]: (all[patient.id] ?? []).filter((x) => x.id !== id) }))}
          />
          <div
            className={`grid min-h-0 flex-1 ${
              // Narrow screens (iPad held upright) drop the date column; the record still scrolls by day.
              wideLeft
                ? "grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_60px] lg:grid-cols-[150px_minmax(0,1.6fr)_minmax(0,1fr)_68px]"
                : "grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_60px] lg:grid-cols-[150px_minmax(0,1fr)_minmax(0,1.2fr)_68px]"
            }`}
          >
            <div className="hidden min-h-0 lg:block">
              <DateTree patient={patient} entries={entries} today={today} selectedDay={chart.selectedDay} onSelect={(d) => update({ selectedDay: d })} />
            </div>
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
                  notGiven={notGivenOf(patient.id)}
                  onOptions={(next) => {
                    // What changed in the claim's options, for the audit log (医事課 and doctors change them).
                    const cur = billing[patient.id] ?? DEFAULT_OPTIONS;
                    const changed = (Object.keys(next) as (keyof typeof next)[]).filter((k) => JSON.stringify(next[k]) !== JSON.stringify(cur[k]));
                    if (changed.length) auditLog({ role: me.role, actor: me.name, action: "算定の設定を変えた", patient: patient.name, detail: changed.map((k) => `${k}: ${JSON.stringify(cur[k] ?? null)} → ${JSON.stringify(next[k])}`).join("、") });
                    setBilling((all) => ({ ...all, [patient.id]: next }));
                  }}
                  wardPayload={() =>
                    allPatients.map((p) => {
                      const c = charts[p.id];
                      return patientMonthPayload(p, currentEntries(p, c ? { added: c.added, stopped: c.stopped, stopTimes: c.stopTimes, extended: c.extended, notes: notes[p.id], revised: revised[p.id] } : undefined), diagnoses[p.id] ?? [], billing[p.id] ?? DEFAULT_OPTIONS, { diets, letters: lettersOf(p.id), notGiven: notGivenOf(p.id) });
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
              onExtendDraft={extendDraft}
              pendingExtends={pendingExtends}
              onModify={modifyOrder}
              draftedStops={chart.drafts.flatMap((d) => (d.kind === "stop" && d.targetOrderId ? [d.targetOrderId] : []))}
              onInsertVitals={(text) => update((c) => ({ note: insertIntoO(c.note, text), rightTab: "note" }))}
              onDo={doFromHistory}
              diets={diets}
              onOpenDiet={() => setPanel("diet")}
              moves={moveEventsOf(patient.id)}
              onBook={(day: number, what: BookWhat) => {
                if (what === "move" || what === "dept") setBooking({ day, what });
                else if (what === "退院" || what === "外泊") {
                  setLeavePreset(day);
                  setPanel(what === "退院" ? "add-discharge" : "add-leave");
                }
              }}
              onDoMove={doMove}
              bookings={bookingsOf(
                entries.filter((e): e is OrderEntry => e.kind === "order"),
                surgeries.filter((x) => x.patientId === patient.id),
                today,
                abs(0, nowTime),
              )}
              onOpenImage={(id) => {
                setImageFocus(id);
                setPanel("imaging");
              }}
              onReviseNote={(e, text, reason) => {
                const next = reviseNote(e, text, me.name, { day: 0, time: nowTime }, reason);
                setRevised((all) => ({ ...all, [patient.id]: { ...(all[patient.id] ?? {}), [noteKey(e)]: next } }));
                auditLog({ role: me.role, actor: me.name, action: `確定（記事の修正・第${next.versions!.length}版）`, patient: patient.name, detail: `${e.time} の記事　理由：${reason.trim()}` });
              }}
            />
            <div
              className={`relative flex min-h-0 flex-col ${dropping ? "ring-2 ring-inset ring-ai" : ""}`}
              onDragOver={(e) => {
                if (!e.dataTransfer.types.includes(DO_MIME)) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "copy";
                if (!dropping) setDropping(true);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropping(false);
              }}
              onDrop={(e) => {
                const d = readDo(e);
                setDropping(false);
                if (!d) return;
                e.preventDefault();
                doFromHistory(d);
              }}
            >
              {dropping && <div className="pointer-events-none absolute inset-x-0 top-0 z-30 bg-ai px-3 py-1 text-center text-[12px] font-bold text-white">ここで離すと写します（Do）</div>}
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
                  // The choices become drafts: they get the same checks (allergy, duplicate, maximum) and the same 確定.
                  const made = draftsFromReport({ ...r, rows }, nowTime, newId);
                  const stopped = rows.filter((x) => x.decision === "中止").map((x) => `・持参薬 ${x.said} ${x.strength}：中止（鑑別報告より）`);
                  updateFor(patient.id, (c) => ({
                    drafts: [...c.drafts, ...made],
                    note: stopped.length ? `${c.note.replace(/\s*$/, "")}\n${stopped.join("\n")}\n` : c.note,
                    flash: `持参薬の指示を下書きにしました（${made.length}件${stopped.length ? `・中止 ${stopped.length}件は記事に追記` : ""}）。下書きの確認を見て、まとめて確定してください。`,
                  }));
                  auditLog({ role: me.role, actor: me.name, action: "持参薬の指示を決めた（下書き）", patient: patient.name, detail: rows.map((x) => `${x.said}：${x.decision}`).join("、") });
                  setReports((rs) => rs.map((x) => (x.id === r.id ? { ...x, rows, status: "指示済" } : x)));
                }}
              />
              <RightTabs
                open={chart.openTabs}
                value={chart.rightTab}
                floating={(Object.keys(floating) as RightTab[]).filter((t) => floating[t])}
                onChange={(t) => {
                  if (floating[t]) return toFront(t);
                  update({ rightTab: t });
                  focusRightTab(t);
                }}
                onOpen={openRight}
                onFloat={(t) => {
                  const n = Object.values(floating).filter(Boolean).length;
                  setFloating((f) => ({ ...f, [t]: defaultWin(n) }));
                  toFront(t);
                  // The right side shows another tab that is still docked.
                  update((c) => {
                    const docked = (["note", ...c.openTabs] as RightTab[]).find((x) => x !== t && !floating[x]);
                    return c.rightTab === t && docked ? { rightTab: docked } : {};
                  });
                }}
                canOrder={!orderBlock}
                onClose={(t) => {
                  setFloating((f) => ({ ...f, [t]: undefined }));
                  update((c) => ({ openTabs: c.openTabs.filter((x) => x !== t), rightTab: c.rightTab === t ? "note" : c.rightTab }));
                }}
                counts={{
                  note: chart.drafts.length,
                  injection: chart.drafts.filter((d) => d.kind === "injection").length,
                  rx: chart.drafts.filter((d) => d.kind === "prescription").length,
                  injcal: chart.drafts.filter((d) => d.kind === "extend").length,
                }}
              />
              {(() => {
                // Which tab the right side shows: the chosen one, unless it is in its own window.
                const docked = ([chart.rightTab, "note", ...chart.openTabs] as RightTab[]).find((t) => (t === "note" || chart.openTabs.includes(t)) && !floating[t]) ?? null;
                const dock = (t: RightTab, title: string, dockedClass: string, children: React.ReactNode) => (
                  <Dockable
                    key={t}
                    tab={t}
                    title={`${title}：${patient.name}さん`}
                    active={docked === t}
                    win={floating[t]}
                    z={Math.max(0, zOrder.indexOf(t))}
                    dockedClass={dockedClass}
                    onMove={(w) => setFloating((f) => ({ ...f, [t]: w }))}
                    onDock={() => {
                      setFloating((f) => ({ ...f, [t]: undefined }));
                      update({ rightTab: t });
                    }}
                    onFront={() => toFront(t)}
                  >
                    {children}
                  </Dockable>
                );
                const pane = "scroll-thin min-h-0 flex-1 overflow-y-auto bg-sheet px-4 py-3";
                return (
                  <>
                    {docked === null && <p className="flex-1 bg-sheet p-6 text-sm text-ink-faint">右の欄のタブは、すべて別ウインドウで表示しています。ウインドウの「右の欄に戻す」で戻せます。</p>}
                    {dock(
                      "note",
                      "記事作成",
                      "flex min-h-0 flex-1 flex-col",
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
                          const n: NoteEntry = { kind: "note", id: newId(), day: 0, time: nowTime, author: me.name, role: me.role, ...parseNote(chart.note), ...(chart.figures?.length ? { figures: chart.figures } : {}) };
                          setNotes((all) => ({ ...all, [patient.id]: [...(all[patient.id] ?? []), n] }));
                          auditLog({ role: me.role, actor: me.name, action: "確定（記事）", patient: patient.name, detail: chart.note.replace(/\s+/g, " ").slice(0, 120) });
                          update({ note: noteTemplate(me.role), figures: [], flash: "記事を確定しました。左の経過に入りました。" });
                        }}
                      />,
                    )}
                    {/* Kept mounted while hidden, so an Rp being written survives a tab switch. */}
                    {chart.openTabs.includes("injection") &&
                      dock(
                        "injection",
                        "注射",
                        "flex min-h-0 flex-1 flex-col",
                        <div data-right-tab="injection" className={pane}>
                          <fieldset disabled={!!orderBlock} className="m-0 min-w-0 border-0 p-0">
                            <AddInjectionPanel
                              key={patient.id}
                              newId={newId}
                              drafts={chart.drafts}
                              seed={chart.injSeed}
                              memory={{
                                patterns: injPatternsOf([...PAST_INJ, ...allPatients.flatMap((x) => currentEntries(x, sessionChanges[x.id]).flatMap((entry) => (entry.kind === "order" && entry.author === me.name ? [{ patientId: x.id, entry }] : [])))]),
                                previous: injPreviousOf(patient.id, entries.filter((x): x is OrderEntry => x.kind === "order")),
                              }}
                              onAdd={(ds) => update((c) => ({ drafts: [...c.drafts, ...ds], rightTab: floating.note ? c.rightTab : "note", flash: `注射 ${ds.length} Rp を記事の下に入れました。確かめて確定してください。` }))}
                            />
                          </fieldset>
                        </div>,
                      )}
                    {chart.openTabs.includes("rx") &&
                      dock(
                        "rx",
                        "内服",
                        "flex min-h-0 flex-1 flex-col",
                        <div data-right-tab="rx" className={pane}>
                          <fieldset disabled={!!orderBlock} className="m-0 min-w-0 border-0 p-0">
                            <AddRxPanel
                              key={patient.id}
                              newId={newId}
                              drafts={chart.drafts}
                              seed={chart.rxSeed}
                              memory={{
                                patterns: patternsOf([...PAST_RX, ...allPatients.flatMap((x) => currentEntries(x, sessionChanges[x.id]).flatMap((entry) => (entry.kind === "order" && entry.author === me.name ? [{ patientId: x.id, entry }] : [])))]),
                                previous: previousOf(patient.id, entries.filter((x): x is OrderEntry => x.kind === "order")),
                                me: me.name,
                              }}
                              onAdd={(ds) => update((c) => ({ drafts: [...c.drafts, ...ds], rightTab: floating.note ? c.rightTab : "note", flash: `内服 ${ds.length} Rp を記事の下に入れました。確かめて確定してください。` }))}
                            />
                          </fieldset>
                        </div>,
                      )}
                    {chart.openTabs.includes("injcal") &&
                      dock(
                        "injcal",
                        "注射カレンダー",
                        "flex min-h-0 flex-1 flex-col bg-sheet",
                        <InjectionCalendar
                          patient={patient}
                          entries={entries}
                          today={today}
                          nowTime={nowTime}
                          selectedDay={chart.selectedDay}
                          onSelectDay={(d) => update({ selectedDay: d })}
                          onStopDraft={addStopDraft}
                          draftedStops={chart.drafts.flatMap((d) => (d.kind === "stop" && d.targetOrderId ? [d.targetOrderId] : []))}
                          onExtendDraft={!deny("order") ? extendDraft : undefined}
                          onModify={!deny("order") ? modifyOrder : undefined}
                          pendingExtends={pendingExtends}
                        />,
                      )}
                  </>
                );
              })()}
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
                  <ImagingPanel patient={patient} today={today} entries={entries} nowAbs={abs(0, nowTime)} focus={imageFocus ?? undefined} />
                </Drawer>
              )}
              {panel === "active-orders" && (
                <Drawer title="有効なオーダ" onClose={closePanel}>
                  <ActiveOrdersPanel entries={entries} today={today} />
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
                <Drawer title="生理検査・内視鏡" onClose={closePanel} locked={orderBlock}>
                  <AddPhysioPanel onAdd={(d) => { addManualLab(d); closePanel(); }} newId={newId} />
                </Drawer>
              )}
              {panel === "add-procedure" && (
                <Drawer title="処置（マスターから選ぶ）" onClose={closePanel} locked={orderBlock}>
                  <AddProcedurePanel onAdd={(d) => { addManualLab(d); closePanel(); }} newId={newId} />
                </Drawer>
              )}
              {panel === "add-leave" && (
                <Drawer title="外泊・外出" onClose={closePanel} locked={orderBlock}>
                  <AddLeavePanel
                    key={`leave-${leavePreset}`}
                    newId={newId}
                    kinds={["外泊", "外出"]}
                    initialDay={leavePreset}
                    onAdd={(d) => {
                      addManualLab(d);
                      closePanel();
                    }}
                  />
                </Drawer>
              )}
              {panel === "add-discharge" && (
                <Drawer title="退院オーダ" onClose={closePanel} locked={orderBlock}>
                  <AddLeavePanel
                    key={`discharge-${leavePreset}`}
                    newId={newId}
                    kinds={["退院"]}
                    initialDay={leavePreset}
                    onAdd={(d) => {
                      addManualLab(d);
                      closePanel();
                    }}
                  />
                </Drawer>
              )}
              {panel === "add-guide" && (
                <Drawer title="指導の依頼" onClose={closePanel} locked={orderBlock}>
                  <AddGuidePanel
                    newId={newId}
                    onAdd={(d) => {
                      addManualLab(d);
                      closePanel();
                    }}
                  />
                </Drawer>
              )}
              {panel === "add-rehab" && (
                <Drawer title="リハビリ処方" onClose={closePanel} locked={orderBlock}>
                  <AddRehabPanel
                    newId={newId}
                    admittedOn={patient.admittedOn}
                    rest={standing[patient.id]?.at(-1)?.rest ?? null}
                    onAdd={(d) => {
                      addManualLab(d);
                      closePanel();
                    }}
                  />
                </Drawer>
              )}
              {panel === "add-consult" && (
                <Drawer title="他科依頼" onClose={closePanel} wide>
                  <AddConsultPanel
                    newId={newId}
                    consults={entries.filter((e): e is OrderEntry => e.kind === "order" && e.order.type === "procedure" && e.order.code === "PROC-CONSULT")}
                    replies={consultReplies}
                    onReply={(entryId, text, by) => {
                      const e = entries.find((x) => x.kind === "order" && x.id === entryId);
                      const dept = e && e.kind === "order" && e.order.type === "procedure" ? e.order.consult?.dept : "";
                      auditLog({ role: "医師", actor: by, action: "確定（他科依頼の返書）", patient: patient.name, detail: `${dept}　${text.slice(0, 80)}` });
                      setConsultReplies((all) => ({ ...all, [entryId]: { text, by, at: nowTime } }));
                      update((c) => ({ note: `${c.note.replace(/\s*$/, "")}\n・${dept}から返書（${by}）：${text}\n` }));
                    }}
                    onAdd={(d) => {
                      if (orderBlock) return;
                      addManualLab(d);
                      closePanel();
                    }}
                  />
                </Drawer>
              )}
              {panel === "guide-record" && (
                <Drawer title="指導の記録" onClose={closePanel}>
                  <GuideRecordPanel
                    role={role}
                    entries={entries.filter((e): e is OrderEntry => e.kind === "order")}
                    records={guidance.filter((r) => r.patientId === patient.id)}
                    today={today}
                    onSave={(r) => recordGuidance(patient.id, r)}
                  />
                </Drawer>
              )}
              {panel === "labels" && (
                <Drawer title="ラベルの発行" onClose={closePanel} wide>
                  {(() => {
                    const person = people.find((x) => x.patient.id === patient.id);
                    const items = person ? labelItems(person, today, abs(0, nowTime)) : { specimens: [], drugs: [] };
                    return (
                      <LabelsPanel
                        p={{ id: patient.id, name: patient.name, kana: patient.kana, ageSex: ageSex(patient), where: `${patient.ward} ${patient.room}`, allergies: patient.allergies, blood: patient.blood ? `${patient.blood.abo}型 Rh${patient.blood.rh === "+" ? "(+)" : "(−)"}` : undefined }}
                        specimens={items.specimens}
                        drugs={items.drugs}
                        onPrint={(what, n) => auditLog({ role: me.role, actor: me.name, action: `${what}を印刷した`, patient: patient.name, detail: `${n}枚` })}
                      />
                    );
                  })()}
                </Drawer>
              )}
              {panel === "docs" && (
                <Drawer title="書類作成" onClose={closePanel} wide>
                  <DocsPanel
                    patient={patient}
                    today={formatShort(today)}
                    saved={documents.filter((d) => d.patientId === patient.id)}
                    onOpenReferral={() => setPanel("discharge")}
                    initial={(k: DocKind): Record<string, string> => {
                      const pl = evals[patient.id]?.plan;
                      return k === "入院診療計画書" && pl ? { symptoms: pl.symptoms, treatment: pl.treatment, tests: pl.tests, surgery: pl.surgery, days: String(pl.days), nutrition: pl.nutritionNeeded, other: pl.other, explainedTo: pl.explainedTo } : {};
                    }}
                    auto={(k: DocKind) => {
                      const fmt = (d: number) => formatShort(addDays(today, d));
                      const dx = (diagnoses[patient.id] ?? []).filter((d) => d.outcome === "継続").map(diagnosisLabel).join("、") || patient.admissionDiagnosis;
                      const leave = entries.find((e): e is OrderEntry => e.kind === "order" && e.status === "有効" && e.order.type === "procedure" && e.order.leave?.kind === "退院");
                      const dDay = leave && leave.order.type === "procedure" ? leave.order.leave!.from.day : null;
                      const drugs = entries.filter((e): e is OrderEntry => e.kind === "order" && e.status === "有効" && e.order.type === "prescription").map((e) => orderLines(e.order, today).main).join("、");
                      const base = { name: `${patient.name}（${ageSex(patient)}）`, diagnosis: dx, admitted: fmt(patient.admittedOn) };
                      if (k === "入院診療計画書") return { ...base, ward: `${patient.ward} ${patient.room}号室`, attending: patient.attending, staff: `${nurseFor(patient.room)}（看護）` };
                      if (k === "退院証明書") return { ...base, discharge: dDay !== null ? fmt(dDay) : "（退院オーダがありません）", stay: dDay !== null ? `${stayDays(patient.admittedOn, dDay)}日` : "—", fee: "急性期一般入院料４（架空の病院の届出）" };
                      if (k === "退院療養計画書") return { ...base, discharge: dDay !== null ? fmt(dDay) : "（退院オーダがありません）", drugs: drugs || "なし" };
                      return base;
                    }}
                    onSave={(k, v) => {
                      auditLog({ role: me.role, actor: me.name, action: `確定（${k}を作成）`, patient: patient.name });
                      setDocuments((all) => [...all, { id: newId(), patientId: patient.id, kind: k, values: v, by: me.name, at: { day: 0, time: nowTime } }]);
                      update((c) => ({ note: `${c.note.replace(/\s*$/, "")}\n・${k}を作成（${me.name}）\n` }));
                      if (k === "入院診療計画書")
                        setEvals((all) => ({
                          ...all,
                          [patient.id]: {
                            ...(all[patient.id] ?? { patientId: patient.id }),
                            plan: { days: Number(v.days) || 0, symptoms: v.symptoms, treatment: v.treatment, tests: v.tests, surgery: v.surgery ?? "", other: v.other ?? "", nutritionNeeded: v.nutrition === "有" ? "有" : "無", explainedTo: v.explainedTo, explainedBy: me.name, explainedAt: { day: 0, time: nowTime } },
                          },
                        }));
                    }}
                  />
                </Drawer>
              )}
              {panel === "schema" && (
                <Drawer title="シェーマ" onClose={closePanel}>
                  <SchemaPanel
                    onAttach={(f) => {
                      update((c) => ({ figures: [...(c.figures ?? []), f], note: insertIntoO(c.note, `シェーマ（${f.caption}）`), flash: "シェーマを今日の記事に貼りました。記事を確定すると一緒に残ります。" }));
                      openRight("note");
                    }}
                  />
                  {(chart.figures ?? []).length > 0 && (
                    <div className="mt-3 border-t border-rule pt-2 text-[12px]">
                      <div className="mb-1 text-ink-soft">今日の記事に貼ったシェーマ（確定前）</div>
                      <div className="flex flex-wrap gap-2">
                        {chart.figures!.map((f, i) => (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img key={i} src={f.dataUrl} alt={f.caption} title={f.caption} className="size-24 rounded border border-rule" />
                        ))}
                      </div>
                    </div>
                  )}
                </Drawer>
              )}
              {panel === "sets" && (
                <Drawer title="セット展開" onClose={closePanel} locked={orderBlock}>
                  <SetPanel
                    newId={newId}
                    onAdd={(ds) => {
                      update((c) => ({ drafts: [...c.drafts, ...ds], rightTab: floating.note ? c.rightTab : "note", flash: `セットから ${ds.length}件を下書きにしました。それぞれ確かめて確定してください。` }));
                      closePanel();
                    }}
                  />
                </Drawer>
              )}
              {panel === "summary" && (
                <Drawer title="連携サマリ・看護サマリ" onClose={closePanel} wide>
                  <SummaryPanel
                    patient={patient}
                    today={formatShort(today)}
                    nowTime={nowTime}
                    facts={summaryFacts(patient, entries.filter((e): e is OrderEntry => e.kind === "order"), today, { diagnoses: diagnoses[patient.id] ?? [], standing: standing[patient.id]?.at(-1), dietNow: patient.dietNow, evals: evals[patient.id] })}
                    onSave={(to, words) => {
                      auditLog({ role: me.role, actor: me.name, action: "確定（連携サマリ）", patient: patient.name, detail: `宛先：${to}` });
                      update((c) => ({ note: `${c.note.replace(/\s*$/, "")}\n・連携サマリを作成（宛先：${to}）${words ? `。申し送り：${words}` : ""}\n` }));
                    }}
                  />
                </Drawer>
              )}
              {panel === "regimen" && (
                <Drawer title="レジメン（化学療法）" onClose={closePanel} locked={orderBlock} wide>
                  <RegimenPanel
                    patient={{ sex: patient.sex, age: patient.age, heightCm: patient.heightCm, weightKg: patient.weightKg, cre: latestValue(patient, "Cre")?.value ?? null }}
                    newId={newId}
                    onAdd={(ds) => {
                      update((c) => ({ drafts: [...c.drafts, ...ds], rightTab: floating.note ? c.rightTab : "note", flash: `レジメンの注射 ${ds.length}本を記事の下に入れました。確かめて確定してください。` }));
                      closePanel();
                    }}
                  />
                </Drawer>
              )}
              {panel === "restraint" && (
                <Drawer title="身体的拘束" onClose={closePanel} wide>
                  <RestraintPanel
                    records={restraints.filter((r) => r.patientId === patient.id)}
                    nowAbs={abs(0, nowTime)}
                    nowTime={nowTime}
                    fmtDay={(d) => formatShort(addDays(today, d))}
                    onStart={(d) => {
                      auditLog({ role: me.role, actor: me.name, action: "確定（身体的拘束の開始）", patient: patient.name, detail: `${d.devices.join("・")}　理由：${d.why}` });
                      setRestraints((all) => [...all, { ...d, id: newId(), patientId: patient.id, start: { day: 0, time: nowTime }, reviews: [] }]);
                      update((c) => ({ note: `${c.note.replace(/\s*$/, "")}\n・身体的拘束を開始（${nowTime}）：${d.devices.join("・")}。理由：${d.why}。心身の状況：${d.state}\n` }));
                    }}
                    onReview={(id, decision, note) => {
                      auditLog({ role: me.role, actor: me.name, action: decision === "やめる" ? "確定（身体的拘束の解除）" : "身体的拘束の見直し（続ける）", patient: patient.name, detail: note });
                      setRestraints((all) => all.map((r) => (r.id !== id ? r : { ...r, reviews: [...r.reviews, { at: { day: 0, time: nowTime }, by: me.name, decision, note }], ...(decision === "やめる" ? { end: { at: { day: 0, time: nowTime }, by: me.name, note } } : {}) })));
                      if (decision === "やめる") update((c) => ({ note: `${c.note.replace(/\s*$/, "")}\n・身体的拘束を解除（${nowTime}）：${note}\n` }));
                    }}
                  />
                </Drawer>
              )}
              {panel === "standing" && (
                <Drawer title="指示簿（約束指示）" onClose={closePanel} wide>
                  <StandingPanel
                    versions={standing[patient.id] ?? []}
                    allergies={patient.allergies}
                    nowTime={nowTime}
                    fmtDay={(d) => formatShort(addDays(today, d))}
                    newId={newId}
                    onSave={(st) => {
                      auditLog({ role: me.role, actor: me.name, action: "確定（指示簿）", patient: patient.name, detail: `第${(standing[patient.id]?.length ?? 0) + 1}版` });
                      setStanding((all) => ({ ...all, [patient.id]: [...(all[patient.id] ?? []), st] }));
                      update((c) => ({ note: `${c.note.replace(/\s*$/, "")}\n・指示簿を変更（第${(standing[patient.id]?.length ?? 0) + 1}版）\n` }));
                    }}
                    onTake={() => {
                      auditLog({ role: me.role, actor: me.name, action: "確定（指示簿の指示受け）", patient: patient.name });
                      setStanding((all) => {
                        const vs = all[patient.id] ?? [];
                        return { ...all, [patient.id]: vs.map((v, i) => (i === vs.length - 1 ? { ...v, taken: { by: me.name, time: nowTime } } : v)) };
                      });
                    }}
                  />
                </Drawer>
              )}
              {panel === "add-transfusion" && (
                <Drawer title="輸血" onClose={closePanel} locked={orderBlock}>
                  <AddTransfusionPanel
                    onAdd={(d) => {
                      addManualLab(d);
                      closePanel();
                    }}
                    newId={newId}
                    blood={patient.blood}
                    weightKg={patient.weightKg}
                    latest={{ Hb: latestValue(patient, "Hb"), Plt: latestValue(patient, "Plt"), "PT-INR": latestValue(patient, "PT-INR") }}
                  />
                </Drawer>
              )}
              {panel === "add-dialysis" && (
                <Drawer title="透析指示" onClose={closePanel} locked={orderBlock}>
                  <AddDialysisPanel onAdd={(d) => { addManualLab(d); closePanel(); }} newId={newId} weightKg={patient.weightKg} />
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
              open={panel ?? (chart.rightTab === "injection" ? "add-injection" : chart.rightTab === "rx" ? "add-rx" : null)}
              onOpen={(p) => {
                // 注射 and 内服 are tabs on the right, not panels.
                if (p === "add-injection" || p === "add-rx") {
                  const t: RightTab = p === "add-injection" ? "injection" : "rx";
                  setPanel(null);
                  update((c) => ({ openTabs: c.openTabs.includes(t) ? c.openTabs : [...c.openTabs, t], rightTab: t }));
                  focusRightTab(t);
                } else if (p === null && !panel) update({ rightTab: "note" });
                else {
                  if (p === "imaging") setImageFocus(null);
                  setPanel(p);
                }
              }}
              blocked={blocked}
              leftView={chart.leftView}
              onLeftView={(v) => update({ leftView: v })}
              injectionCalendar={{ on: chart.openTabs.includes("injcal") && (chart.rightTab === "injcal" || !!floating.injcal), open: () => openRight("injcal") }}
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
    </>
  );

  // The rows of tabs on top: ② (病棟's screens, or the list and the patients of 救急外来・外来), and ③
  // inside 病棟 (the ② screen itself, then the charts opened from it).
  function tabRows(): TabRow[] {
    const chartItem = (t: PatientTab): TabItem[] => {
      const v = visitOf(t.id);
      if (v) {
        const x = v.kind === "er" ? v.er : v.op;
        return [{ key: t.id, label: x.name, patient: { sex: x.sex, age: x.age }, active: front[t.owner] === t.id, onSelect: () => show(t.owner, t.id), onClose: () => closePatient(t.id), closeLabel: `${x.name} のタブを閉じる` }];
      }
      const p = findPatient(t.id);
      if (!p) return [];
      return [{ key: t.id, label: p.name, patient: { sex: p.sex, age: p.age, room: p.room, infections: p.infections }, active: front[t.owner] === t.id, onSelect: () => show(t.owner, t.id), onClose: () => closePatient(t.id), closeLabel: `${p.name} のカルテを閉じる` }];
    };
    const under = (o: Owner): TabItem[] => [
      ...patientTabs.filter((t) => t.owner === o).flatMap(chartItem),
      ...(newTabFor === o ? [{ key: "new", label: "新しいタブ", icon: Plus, menu: true, active: front[o] === NEW_TAB, onSelect: () => show(o, NEW_TAB), onClose: closeNewTab, closeLabel: "新しいタブを閉じる" }] : []),
    ];
    const newTab = (o: Owner) => ({ label: "新しいタブ", title: "新しいタブ（患者を探して、ここにカルテを開く）", onClick: () => openNewTab(o) });
    if (area === "ward") {
      const second: TabItem[] = wardTabs.map((t) => ({
        key: t,
        label: wardTabLabel(t, floor),
        icon: WARD_ICON[t],
        active: wardTab === t,
        badge: wardBadges[t],
        charts: patientTabs.filter((x) => x.owner === wardOwner(t)).length,
        title: wardTabInfo(t).hint,
        onSelect: () => setWardTab(t),
        onClose: () => closeWardTab(t),
      }));
      if (wardTab === "menu" || !wardTabs.length)
        second.push({ key: "menu", label: "画面を選ぶ", icon: LayoutList, menu: true, active: wardTab === "menu", onSelect: () => setWardTab("menu"), onClose: wardTabs.length ? () => setWardTab(wardTabs[wardTabs.length - 1]) : undefined, closeLabel: "画面を選ぶメニューを閉じる" });
      const rows: TabRow[] = [{ label: "病棟の画面", items: second, plus: { label: "画面を開く", title: "病棟の画面を開く（病棟マップ・◯階・受け持ち患者・科別・患者一覧・主治医別・ワークシート…）", onClick: () => setWardTab("menu") } }];
      if (wardTab !== "menu") {
        const o = wardOwner(wardTab);
        const self: TabItem = { key: "self", label: wardTabLabel(wardTab, floor), icon: WARD_ICON[wardTab], active: !front[o], title: "この画面に戻る", onSelect: () => show(o, undefined) };
        rows.push({ label: `${wardTabLabel(wardTab, floor)}から開いたカルテ`, items: [self, ...under(o)], plus: newTab(o) });
      }
      return rows;
    }
    if (area === "er" || area === "opd") {
      const o: Owner = area;
      const self: TabItem = { key: "self", label: area === "er" ? "救急の患者一覧" : "外来の受付一覧", icon: AREA_ICON[area], active: !front[o], onSelect: () => show(o, undefined) };
      return [{ label: `${ownerLabel(o)}のタブ`, items: [self, ...under(o)], plus: newTab(o) }];
    }
    const a = AREAS.find((x) => x.key === area);
    return [{ label: "画面", items: [{ key: area, label: a?.label ?? "", icon: AREA_ICON[area], active: true, onSelect: () => undefined }] }];
  }

  return (
    <RoleProvider value={role}>
    <div className="flex h-screen flex-col print:hidden">
      <div aria-hidden className="standalone-edge" />
      <AppFrame
        role={role}
        onRole={switchRole}
        areas={areas}
        area={area}
        onArea={openArea}
        rows={tabRows()}
        chartShown={screen === "chart"}
        onOpenPicker={() => setPickerOpen(true)}
        areaBadges={{ ward: (wardBadges.mine ?? 0) + (wardBadges.admit ?? 0), lab: uncalled(wardResults.filter((i) => i.day === 0), calls).length, board: unreadCount(notices, reads, me.name) }}
        todos={todos}
      >
        {content}
      </AppFrame>
      {Number(nowTime.slice(0, 2)) >= 24 && (
        <p role="status" className="fixed bottom-2 right-2 z-40 max-w-xs rounded-md border border-yamabuki bg-sheet px-3 py-1.5 text-[11px] text-ink shadow print:hidden">
          日付が変わりました。この画面は {formatShort(today)} を「今日」として続けているので、{nowTime.slice(0, 2)}:{nowTime.slice(3)}（翌{Number(nowTime.slice(0, 2)) - 24}:{nowTime.slice(3)}）のように時刻を付けます。
        </p>
      )}

      {dischargeAsk &&
        (() => {
          const x = people.find((y) => y.patient.id === dischargeAsk);
          if (!x) return null;
          const pid = x.patient.id;
          const items = dischargeChecklist({
            entries: x.entries,
            homeRx: { exists: bagsOf(x.entries).length > 0, handed: !!homeRx[pid]?.handed },
            documents: documents.filter((d) => d.patientId === pid).map((d) => d.kind),
            guidance: guidance.filter((g) => g.patientId === pid).map((g) => g.kind),
            restrained: !!activeOf(restraints, pid),
          });
          return (
            <DischargeDialog
              name={x.patient.name}
              items={items}
              onClose={() => setDischargeAsk(null)}
              onDo={() => {
                const left = items.filter((i) => i.state === "todo").map((i) => i.label);
                auditLog({ role: me.role, actor: me.name, action: "確定（退院の実施）", patient: x.patient.name, detail: left.length ? `済んでいないもの：${left.join("・")}` : "準備はすべて済み" });
                setDischarged((all) => ({ ...all, [pid]: { day: 0, time: nowTime, by: me.name } }));
                updateFor(pid, (c) => ({ note: `${c.note.replace(/\s*$/, "")}\n・退院を実施（${nowTime}）${left.length ? `。済んでいないもの：${left.join("・")}` : ""}\n` }));
                setDischargeAsk(null);
              }}
            />
          );
        })()}

      {moving && findPatient(moving.patientId) && (
        <BedMoveDialog
          patient={findPatient(moving.patientId)!}
          from={(() => {
            const b = ward.beds.find((x) => x.patientId === moving.patientId)!;
            return { room: b.room, bed: b.bed };
          })()}
          initial={moving.to}
          allBeds={{ beds: allBeds, patient: findPatient }}
          onCancel={() => setMoving(null)}
          onMove={(m) => {
            const who = findPatient(m.patientId)!;
            const at = (b: { room: string; bed: string }) => `${floorOf(b.room)} ${b.room}${b.bed ? `-${b.bed}` : ""}`;
            auditLog({ role: me.role, actor: me.name, action: `確定（${m.kind}）`, patient: who.name, detail: `${at(m.from)} → ${at(m.to)}　理由：${m.reason}` });
            setMoves((all) => ({ ...all, [m.patientId]: m.to }));
            setMoveLog((l) => [...l, { patientId: m.patientId, label: `${m.kind} ${m.from.room}→${m.to.room}${m.to.bed ? `-${m.to.bed}` : ""}`, time: nowTime }]);
            updateFor(m.patientId, (c) => ({ note: `${c.note.replace(/\s*$/, "")}\n・${m.kind}：${at(m.from)} → ${at(m.to)}（${m.reason}）\n` }));
            setMoving(null);
          }}
        />
      )}
      {booking?.what === "move" && patient && (
        <BedMoveDialog
          patient={patient}
          from={(() => {
            const b = ward.beds.find((x) => x.patientId === patient.id)!;
            return { room: b.room, bed: b.bed };
          })()}
          allBeds={{ beds: allBeds, patient: findPatient }}
          reserve={{ label: formatShort(addDays(today, booking.day)) }}
          onCancel={() => setBooking(null)}
          onMove={(m) => {
            addManualLab({ ...newProcedureDraft("PROC-MOVE", newId()), sourceText: "（移動・食事カレンダーから）", move: { kind: m.kind, to: m.to, reason: m.reason }, schedule: { kind: "once" }, start: { day: booking.day, time: m.time ?? null } });
            update({ flash: `${m.kind}の予約を下書きにしました。確かめて確定してください。` });
            openRight("note");
            setBooking(null);
          }}
        />
      )}
      {booking?.what === "dept" && patient && (
        <DeptMoveDialog
          patient={patient}
          dayLabel={formatShort(addDays(today, booking.day))}
          onCancel={() => setBooking(null)}
          onBook={(m) => {
            addManualLab({ ...newProcedureDraft("PROC-MOVE", newId()), sourceText: "（移動・食事カレンダーから）", move: { kind: "転科", toDept: m.toDept, toDoctor: m.toDoctor, reason: m.reason }, schedule: { kind: "once" }, start: { day: booking.day, time: m.time } });
            update({ flash: "転科の予約を下書きにしました。確かめて確定してください。" });
            openRight("note");
            setBooking(null);
          }}
        />
      )}
      {pickerOpen && <PatientPicker patients={allPatients} openIds={patientTabs.map((t) => t.id)} onOpen={openPatient} onClose={() => setPickerOpen(false)} />}
    </div>
    </RoleProvider>
  );
}
