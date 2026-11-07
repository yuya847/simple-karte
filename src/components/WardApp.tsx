"use client";
import { useTransferSummaryPersistence } from "@/lib/use-transfer-summary-persistence";
import { pendingChartDrafts } from "@/lib/confirmed-drafts";
import { currentOxygen, patientForCurrentDisplay } from "@/lib/icu/current-oxygen";
import { moveConflict } from "@/lib/icu/move-conflict";
import { moveBedPlans } from "@/lib/icu/move-plans";
import { IcuBoard } from "./IcuBoard";
import { moveAdministration } from "@/lib/move-administration";
import { stayOnMove } from "@/lib/icu/stays";
import { unitOf } from "@/lib/icu/types";
import { useMcpReceiver } from "@/lib/mcp/receive";
import { GlucoseContext } from "./GlucoseContext";
import { useAnesthesiaPersistence } from "@/lib/use-anesthesia-persistence";
import { pendingAnesthesiaPreop, upsertAnesthesiaNote, anesthesiaIo } from "@/lib/anesthesia";
import { MswInterview } from "./MswInterview";
import { LifeSupportForm, LifeSupportOverview } from "./LifeSupport";
import { lifeWithIntake, lifeLines } from "@/lib/life-support";
import { DischargeForm } from "./AdmitEvalView";

import { CarryNote, NoteOverviewContext } from "./NoteOverview";
import { noteChanged } from "@/lib/note-overview";
import type { TodoCompletions } from "@/lib/note-overview";
import { labWindowWidth } from "@/lib/panel-size";
import { CardiacCathPanel } from "./panels/CardiacCathPanel";
import { toggleInjectionDose, injectionRateDraft, stopTimesOf, type InjectionChange } from "@/lib/injection-change";
import { LabPasteReceiver, requestLabPaste } from "./LabPasteReceiver";
import { LAB_RESULT_MIME, readLabTransfer } from "@/lib/lab-transfer";
import type { NoteTemplate } from "@/lib/note-templates";

import { hasActiveCancer, hasPlannedSurgery, suggestedDocuments } from "@/lib/document-catalog";
import { orderConsentDrafts, surgeryConsentDrafts } from "@/lib/consent-drafts";
import { RxExpiryInbox } from "./RxExpiryInbox";
import { expiryInbox, expiryCounts, receivesExpiry, expiryExtension } from "@/lib/rx-expiry-workflow";
import { RxExpiryNotice } from "./RxExpiryNotice";
import { RxExpiryStrip } from "./RxExpiryStrip";
import { rxExpiries, visibleExpiryStickies } from "@/lib/rx-expiry";
import { historyOrderHandlers } from "@/lib/history-order";
import { OrderHistoryContext, useOrderUnlocks } from "./OrderHistoryActions";
import { glucoseEntry } from "@/lib/insulin-intervention";
import { demoInsulinRecords } from "@/lib/insulin-demo";
import { insulinGivenForBilling } from "@/lib/insulin-billing";
import { standingPending } from "@/lib/standing-pending";
import { roomLabel } from "@/lib/place-label";
import { scenarioHandoffs } from "@/lib/scenarios/handoffs";
import { nursingOxygen } from "@/lib/scenarios/nursing";
import { replacementConflict } from "@/lib/order-revision-drafts";
import { RehabPatients } from "./RehabPatients";
import { rehabPrescriptions } from "@/lib/rehab";
import { wardRehabDesk } from "@/lib/rehab-workflow";
import { nursingShiftStart } from "@/lib/nursing-shift";
import { SpecialistBoard } from "./SpecialistBoard";
import { specialistTileBlocks } from "@/lib/specialist-tools";

import { usePanelWindows } from "@/lib/use-panel-windows";
import { PatientWindowProvider, WindowTray } from "./WindowTray";

import { AddSurgeryPanel } from "./panels/AddSurgeryPanel";
import { examReservationProblem } from "@/lib/exam-slots";
import { upsertSessionNote } from "@/lib/rehab-record";

import { ScenarioSaveProvider } from "./ScenarioSwitch";
import { SCENARIOS } from "@/lib/scenarios";
import { scenarioMode, scenarioStorageKey } from "@/lib/scenarios/mode";
import { workspaceOn } from "@/lib/workspace";
import { useNavHistory } from "@/lib/use-nav-history";
import { migrateStandingLines, migrateStandingVersions } from "@/lib/standing-seeds";
import { patientPlace } from "@/lib/patient-place";
import { DEFAULT_NURSE, NURSES } from "@/lib/nurses";
import { teamIdsFor } from "@/lib/team-ids";
import { useDisplayState } from "@/lib/use-display-state";
import { useStandingCosign } from "@/lib/use-standing-cosign";
import { markStandingTake } from "@/lib/standing-cosign";
import { attendingDesk, dietProposal, dietProposalCount } from "@/lib/diet-workflow";
import { focusDraftLine } from "@/lib/order-windows";

import { emergencyRegistrationSection, pendingDraftCount, transferEmergencyOrders } from "@/lib/billing/emergency-visit";
import { insulinAdjustmentEntries } from "@/lib/insulin";
import { nutritionPlanDraft, nutritionPressure, saveNutritionPlan } from "@/lib/nutrition-plan";
import { nutritionTileBlocks } from "@/lib/nutrition-access";
import { NutritionPanel } from "./NutritionPanel";
import { kitchenWaiting } from "@/lib/kitchen";
import { useKitchenAllergies } from "@/lib/use-kitchen-allergies";

import { useNoticeFocus } from "./useNoticeFocus";
import { calendarDietDrafts } from "@/lib/diet-calendar-edit";
import { usePatientWindows } from "@/lib/use-patient-windows";
import { repairPharmacyFixtures } from "@/lib/pharmacy-fixtures";
import { WindowEntryContext, type WindowEntries } from "@/lib/window-entry";
import { normalizeRightState, orderWindows, showOrderWindow } from "@/lib/order-windows";
import { ConsultContext } from "./ConsultContext";
import { ConsultPanel, ConsultBanner, ConsultInboxView } from "./ConsultPanel";
import { consultInbox, consultNotifications, referralDraft, consultReplyNote, replyConsult, closeConsult, type ConsultReplies } from "@/lib/consult";
import { recordsForCompletedOrders } from "@/lib/completed-orders";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { AiDraftResponse } from "@/lib/ai-schema";
import { addDays, continuedTime, formatShort, isoDate, nowTimeInTokyo, todayInTokyo, type CalendarDate } from "@/lib/dates";
import { checkDraft, draftsFromAi, isReady, newProcedureDraft, orderEndDay, toOrder, type CheckContext, type Draft, type ExtendDraft, type InjectionDraft, type Issue, type StopDraft } from "@/lib/drafts";
import { resolveDraftCodes } from "@/lib/resolve-codes";
import type { InjSeed, InjStart } from "@/lib/inj-calendar";
import { bigWin, keepWin, keptWin } from "@/lib/win-prefs";
import { orderLines, procedureTitle } from "@/lib/format";
import { anyDrugName } from "@/lib/master";
import { standingFromRequest, standingTakeLines, admissionMissingNow } from "@/lib/admission-orders";
import { INITIAL_REQUESTS, admissionIcuRecords, admitExistingPatient, admitFromEr, admitFromOpd, type AdmissionRequest } from "@/lib/admission";
import { OPD_PATIENTS, type OpdPatient, type OpdStatus } from "@/lib/opd";
import { INITIAL_DIAGNOSES, UNCODED, type Diagnosis } from "@/lib/diagnoses";
import { DEFAULT_OPTIONS, type BillingOptions } from "@/lib/billing/model";
import { patientMonthPayload } from "@/lib/billing/payload";
import { currentInsurance, insuranceRecords, linkInsurance } from "@/lib/billing/registration";
import { INITIAL_DESK, withInitialInsurance, withInsurance, withSettlement, type IjiDesk } from "@/lib/billing/worklist";
import { unpaidVisits, type OpdSettleBook } from "@/lib/billing/opd-settle";
import { visitPrescriptions } from "@/lib/billing/opd-visit";
import { OpdRxAfter } from "./OpdRxAfter";
import { OpdBillPanel } from "./billing/OpdBillPanel";
import { BillingView } from "./BillingView";
import { IjiBoard } from "./IjiBoard";
import { initialErPatients, type ErPatient, type ErStatus } from "@/lib/er";
import { abs } from "@/lib/flowsheet";
import { PATIENTS as DEMO_PATIENTS } from "@/lib/patients";
import { FLOORS, WARD_NAME, WARD_PLANS, floorOf, nurseFor, type BedAssignment, type Floor, type WardState } from "@/lib/ward";
import { BEDS_WITH_CHARTS as DEMO_BEDS_WITH_CHARTS, OTHER_FLOOR_BEDS_WITH_CHARTS as DEMO_OTHER_FLOOR_BEDS_WITH_CHARTS, WARD_CHART_DIETS, WARD_CHART_PATIENTS as DEMO_WARD_CHART_PATIENTS, withChartDiagnoses, withChartDiets } from "@/lib/ward-charts";
import { admissionPlans, bedsAsOf, dayRange, dischargePlans, type WardAsOf } from "@/lib/ward-asof";
import { currentEntries, ordersOf } from "@/lib/record";
import { risRows, withExamRecords } from "@/lib/ris";
import { risTodo } from "@/lib/ris-take";
import type { DayOffset, HistoryEntry, InjectionOrder, NoteEntry, OrderEntry, Patient, VitalSign } from "@/lib/types";
import { ResizableChart } from "./ResizableChart";
import { DateTree } from "./DateTree";
import { readDo, DO_MIME, type DoPayload } from "./HistoryPane";
import { prescriptionCalendarSeed, type PrescriptionSeed } from "@/lib/prescription-calendar";
import { calendarChange } from "@/lib/calendar-change";
import { PAST_RX, patternsOf, previousOf } from "@/lib/rx-memory";
import { PAST_INJ, injPatternsOf, injPreviousOf } from "@/lib/inj-memory";
import { EmergencyBoard } from "./EmergencyBoard";
import { EMPTY_OPD_DESK, OpdDesk, type OpdDeskBook } from "./OpdDesk";
import { OTHER_DEPT_TODAY } from "@/lib/opd-desk";
import { RequestForm, type Visit, type VisitNote } from "./VisitChart";
import { VisitStrip } from "./VisitStrip";
import { OpdRxPanel, type OpdRx, type Revisit } from "./OpdOrders";
import { OpdBookingPanel } from "./panels/OpdBookingPanel";
import { insuranceFor, NationalPanel } from "./national/NationalPanel";
import { ErxPanel } from "./national/ErxPanel";
import { nextSerial, recordsOf, type NationalRecord } from "@/lib/national/log";
import { joinLines } from "@/lib/national/rx-lines";
import { birthDateOf } from "@/lib/national/fictional";
import { WardRequests } from "./WardRequests";
import { BedMoveDialog } from "./BedMoveDialog";
import { DeptMoveDialog } from "./DeptMoveDialog";
import type { BookWhat, MoveEvent } from "./DietCalendar";
import { moveText } from "@/lib/procedures";
import { bedProblem } from "@/lib/admission";
import { withDiseaseRequest, visibleDiseaseStickies, diseaseRequestInput, diseaseRequestTodos } from "@/lib/billing/disease-request";
import type { DiseaseCandidate } from "@/lib/billing/disease-check";
import { StickyStrip, type Sticky } from "./StickyStrip";
import { BoardView } from "./BoardView";
import { ExtractView } from "./ExtractView";
import { JournalView } from "./JournalView";
import { RosterView } from "./RosterView";
import type { RosterBook } from "@/lib/roster";
import { MealsView } from "./MealsView";
import { journalLines, staffing } from "@/lib/journal";
import { GUIDE_TO } from "@/lib/procedures";
import { bookingsOf } from "@/lib/bookings";
import { plannedItems } from "@/lib/schedule-days";
import { visitsFromOpd, visitsOf } from "@/lib/opd-history";
import { runExtract } from "@/lib/extract";
import { ManualView } from "./ManualView";
import { IncidentView } from "./IncidentView";
import { INITIAL_NOTICES, INITIAL_READS, markRead, unreadCount, type Notice, type Reads } from "@/lib/board";
import { INITIAL_INCIDENTS, applyStatus, emptyDraft, type IncidentDraft, type IncidentReport } from "@/lib/incident";
import { StandingPanel } from "./panels/StandingPanel";
import { templateStamp } from "@/lib/record-filter";
import { BUILTIN_RECORD_TEMPLATES, loadMyRecordTemplates } from "@/lib/record-templates";
import { RecordTemplatesPanel } from "./panels/RecordTemplatesPanel";
import { RestraintPanel } from "./panels/RestraintPanel";
import { RegimenPanel } from "./panels/RegimenPanel";
import { SummaryPanel } from "./panels/SummaryPanel";
import { SetPanel } from "./panels/SetPanel";
import { SchemaPanel } from "./panels/SchemaPanel";
import { DocsPanel } from "./panels/DocsPanel";
import { LabelsPanel } from "./panels/LabelsPanel";
import { PhsView } from "./PhsView";
import { TakeStatus } from "./TakeStatus";
import { TakeDesk } from "./TakeDesk";
import { ExecuteDesk } from "./ExecuteDesk";
import { orderTakeBadge, unconfirmed, type Confirms } from "@/lib/order-confirm";
import { entryOfRow, takeRowOnDay, waitingToday } from "@/lib/order-sheet";
import { markRemeasured, type RecordedVital } from "@/lib/take-desk-remeasure";
import { contactDraft, vitalsContact, vitalsContactTodos } from "@/lib/vitals-contact";
import { vitalsFlash, type Flash } from "@/lib/flash";
import { takeRows, type TakeHold, type TakeRow } from "@/lib/order-take";
import { useInfusionPersistence } from "@/lib/icu/use-infusion-persistence";
import { IcuPanel } from "./IcuPanel";
import { emptyIcuRecords, type IcuRecords } from "@/lib/icu/types";
import { useWorkspace } from "@/lib/use-workspace";
import { WorkspaceStatus } from "./WorkspaceStatus";
import { TransferPanel } from "./panels/TransferPanel";
import { BedsidePanel } from "./panels/BedsidePanel";
import { SupportBoard } from "./SupportBoard";
import { BedControlView } from "./BedControlView";
import { transferAdl, transferSummary, type TransferAsk } from "@/lib/transfer";
import { callTarget, onDuty, slide, teamOf, type BedInfo, type CallNote, type Emergency, type NurseCall, type PhsNotice } from "@/lib/phs";
import type { ScheduleItem } from "./PhsView";
import { addDaily, prevWeightOf, withToday, type DailyAdd } from "@/lib/daily-input";
import { initialIo, ioMissing, transfusionIoIds, windowText, withIcuUrine, withIoUrine, type IoEntry } from "@/lib/io-balance";
import { DischargeDialog } from "./DischargeDialog";
import { dischargeChecklist } from "@/lib/discharge-check";
import { chosenStops, endedStanding, remainingGroups, type StopGroupKey } from "@/lib/discharge-stop";
import { DischargeStops } from "./DischargeStops";
import { billingGaps, undoneRows } from "@/lib/undone";
import { UndoneView } from "./UndoneView";
import { PAST_SUMMARIES, approveDeny, summaryRows } from "@/lib/summary-approval";
import { SummaryList } from "./SummaryList";
import { EMPTY_PATHS, activePath, dueOutcomes, findPath, pathDayOf, type PathBook, type PathWho } from "@/lib/pathway";
import { PathPanel } from "./panels/PathPanel";
import { PathList } from "./PathList";
import { bagsOf } from "@/lib/discharge-rx";
import { GuideRecordPanel, type GuidanceInput } from "./panels/GuideRecordPanel";
import { guidanceNoteText, nutritionCountNote, nutritionTimeNote, openRequests, type GuidanceRecord } from "@/lib/guidance";
import { labelItems } from "@/lib/labels";
import { ageSex } from "@/lib/person";
import { stayDays, type DocKind, type DocRecord } from "@/lib/documents";
import { diagnosisLabel } from "@/lib/diagnoses";
import { summaryFacts } from "@/lib/summary";
import { INITIAL_RESTRAINTS, activeOf, durationText, minutesOf, reviewDue, type Restraint } from "@/lib/restraint";
import { INITIAL_CARE_ORDERS, careActive, initialCareRecords, lateCare, voidCare, type CareOrder, type CareRecord } from "@/lib/care-orders";
import { INITIAL_PLANS, dueEvaluations, evalStatus, problemTitle, type NursingProblem } from "@/lib/nursing-plan";
import { NursingPanel } from "./panels/NursingPanel";
import { ProfilePanel } from "./panels/ProfilePanel";
import { applyProfile, careNow, checkList, type ProfileChange } from "@/lib/profile";
import { AnamnesisPanel } from "./panels/AnamnesisPanel";
import { careToProfile, evalHints, saveAnamnesis, type AnamnesisRecord } from "@/lib/anamnesis";
import { worksheetPrnLines } from "@/lib/standing-form";
import { endStandingBlocks, standingFromBlocks } from "@/lib/standing-blocks";
import { callHits, confirmStanding, initialStanding, type StandingOrders } from "@/lib/standing";
import { ackLine, condHits, openHits, type CondAck } from "@/lib/cond-orders";
import { standingLineActions } from "@/lib/standing-actions";
import { fieldChangeText } from "@/lib/standing-history";
import { INITIAL_LINE_IDS, initialLines, lineChanges, linesFromFields, type StandingLine } from "@/lib/standing-lines";
import { leaveFlags, type Flag } from "@/lib/patient-flags";
import { HistoryPane, type LeftView } from "./HistoryPane";
import type { FlowScale } from "@/lib/flow-scale";
import { emptyCalendar } from "@/lib/active-orders";
import { RefWindow, REF_TABS, isRefTab, type RefWindowProps } from "./RefWindows";
import { PatientBar } from "./PatientBar";
import { PatientSwitchFlash } from "./PatientSwitchFlash";
import { PatientPicker } from "./PatientPicker";
import { PatientList, type GroupBy } from "./PatientList";
import { AppFrame, type Crumb, type TabGroup, type TabItem, type TabRow, type Todo } from "./AppFrame";
import { groupByPlace, type Place } from "@/lib/tab-groups";
import { PullToRefresh } from "./PullToRefresh";
import { RecentPatients } from "./RecentPatients";
import { FavoritePatients } from "./FavoritePatients";
import { loadRecent, pushRecent, saveRecent, type RecentOpen } from "@/lib/recent";
import { NewTabPage } from "./NewTabPage";
import { WardMenu } from "./WardMenu";
import { AREA_ICON, WARD_ICON } from "./nav-icons";
import { Building2, LayoutList, Plus, Save, Send } from "lucide-react";
import {
  AREAS,
  allowedWardTabs,
  areasFor,
  homeArea,
  homeScreen,
  ownerFor,
  readWardTab,
  rehome,
  wardOwner,
  wardTabInfo,
  wardTabOf,
  wardTabsFor,
  type AreaKey,
  type Owner,
  type PatientTab,
  type WardTab,
} from "@/lib/nav";
import { WARD_MENU_OPTION, WARD_SCREENS_PLUS } from "@/lib/place-menu";
import { useVerbalConfirmation, VerbalReviewProvider } from "./VerbalControls";
import { canReviewVerbal, verbalConfirmationProblems, type VerbalConfirmation, verbalUnsigned } from "@/lib/verbal";
import { TodayPane, type DraftMeta } from "./TodayPane";
import { ToolRail, type PanelKind } from "./ToolRail";
import type { OpenAt } from "@/lib/open-at";
import { RIGHT_TABS, RightTabs, WINDOW_TABS, type RightTab } from "./RightTabs";
import { Dockable, defaultWin, type Win } from "./Dockable";
import { InjectionCalendar } from "./Calendars";
import type { ExecuteProps } from "./ExecuteMenu";
import { WardMap, type ChartSummary, type Pick } from "./WardMap";
import type { DayNavProps } from "./DayNav";
import { Worksheet } from "./Worksheet";
import { PharmacyView, type HomeRxRecord, type ShidoRecord } from "./PharmacyView";
import type { OralRecord } from "@/lib/oral-dispense";
import { PharmacyInbox } from "./PharmacyInbox";
import { DialysisView } from "./DialysisView";
import { SurgeryView } from "./SurgeryView";
import { initialSurgeries, type Surgery } from "@/lib/surgery";
import type { FlowEvent } from "@/lib/flow-days";
import { dayTime, ioTimeFor, untakenOf, type FlowEntry } from "@/lib/flow-entry";
import type { GraphNote } from "@/lib/flow-stickies";
import { HD_PATIENTS, initialHdSessions, type HdPatient, type HdSession } from "@/lib/dialysis";
import { b008Check, draftsFromReport, queryOpen, type BroughtReport, type Query } from "@/lib/pharmacy";
import { orderChanges, otherChanges, sessionChangeKeys, type WorkPatient } from "@/lib/worksheet";
import { ActiveOrdersPanel } from "./panels/ActiveOrdersPanel";
import { AddGuidePanel, AddLeavePanel, AddRehabPanel, AddDialysisPanel, AddTransfusionPanel, AddImagingPanel, AddInjectionPanel, AddLabPanel, AddPhysioPanel, AddProcedurePanel, AddRxPanel } from "./panels/AddPanels";
import { latestCre } from "@/lib/exams";
import { latestValue } from "@/lib/clinical";
import { ImagingConsentProvider } from "./ImagingConsent";
import { consentDone } from "@/lib/consent";
import { ConsentPanel } from "./panels/ConsentPanel";
import { VitalsPanel } from "./panels/VitalsPanel";
import { IoPanel } from "./IoPanel";
import { FlowEntryPanel } from "./FlowEntryPanel";
import { IoBoard } from "./IoBoard";
import { VerbalInbox } from "./VerbalInbox";
import { DirectivePanel } from "./panels/DirectivePanel";
import { AbxRenalWindow } from "./AbxRenalWindow";
import { CalcWindow } from "./CalcWindow";
import { DietWindow } from "./DietWindow";
import { DischargePanel } from "./panels/DischargePanel";
import type { DischargeDraft } from "@/lib/discharge";
import type { TdmReport } from "@/lib/tdm";
import { INITIAL_DIETS, MEALS, currentDiet, dietAt, dietLabel, type DietOrder } from "@/lib/diet";
import { INITIAL_DIRECTIVES, bandLabel, current as currentDirective, directiveLine, type AdvanceDirective } from "@/lib/directives";
import { AuditView } from "./AuditView";
import { ChatThread, ChatView } from "./ChatView";
import { AcuityView } from "./AcuityView";
import { HandoffView } from "./HandoffView";
import { LabView } from "./LabView";
import { AdmitEvalView } from "./AdmitEvalView";
import { deliriumBillable, dischargeSupportMet, duesOf, initialEvals, type AdmitEval } from "@/lib/admit-eval";
import { ResultBrowser } from "./ResultBrowser";
import { PANIC_LIMITS, PANIC_SOURCE, callLine, cultureArrivals, hitLine, mergeCultures, resultsOf, uncalled, unseen, type Ack, type PanicCall, type ResultItem } from "@/lib/results";
import { EMPTY_DESK, demoLabOrders, deskLabs, drawRows, redrawChangeKeys, withRedraws, type LabDesk } from "@/lib/lab-desk";
import { pendingDraws } from "@/lib/lab-table";
import { visitLabOrders, visitPerson } from "@/lib/lab-visits";
import { deskCultures } from "@/lib/lab-culture";
import { handoffKey, type Handoff } from "@/lib/handoff";
import { FICTIONAL_AMBULANCE, INITIAL_B, type BRecord } from "@/lib/acuity";
import { patientChannel } from "@/lib/chat";
import { CLAUDE, auditLog } from "@/lib/audit";
import { cancelAdministration, overdue, type AdminRecord, type VoidReason, type VoidedRecord } from "@/lib/mar";
import { clockText, dripAction, endText } from "@/lib/drip-course";
import { recordedVitals, visibleIcuRecords, retainFutureHourly } from "@/lib/record-time";
import { buildWorksheet } from "@/lib/worksheet";
import { news2 } from "@/lib/news2";
import { findConsent, type ConsentCode, type ConsentRecord } from "@/lib/consent";
import { resolveNoteDiagnoses } from "@/lib/auto-diagnoses";
import { DiagnosisPanel } from "./panels/DiagnosisPanel";
import { MeProvider, RoleProvider } from "./RoleContext";
import { DEFAULT_DOCTOR, DOCTORS, isResident, onTeamOf } from "@/lib/doctors";
import { addDoctor, consultDoctors, doctorsOf, INITIAL_DOCTOR_BOOK, involved, removeDoctor, type DoctorBook } from "@/lib/patient-doctors";
import { DoctorsPanel } from "./panels/DoctorsPanel";
import { PatientInfoPanel, patientInfoTitle } from "./panels/PatientInfoPanel";
import { INITIAL_CONTACTS, type ContactsBook } from "@/lib/patient-contacts";
import { INITIAL_ANAMNESIS } from "@/lib/anamnesis-initial";
import { COSIGN_RULES, byRef, confirmDeny, confirmItems, newItems, noteRevised, pendingOf, residentBlock, type CosignItem } from "@/lib/cosign";
import { CosignList, CosignPanel, CosignRefs } from "./Cosign";
import { INITIAL_LIMITS, currentLimit, grantOf, inCareTeam, limitDeny, openEvent, type AccessLimit, type GlassEntry } from "@/lib/access-limit";
import { GlassStep, LimitPanel, LimitStrip } from "./AccessLimit";
import { eventTimeProblem, isBlankNote, nextFrame, noteKey, noteText, parseNote, reviseNote } from "@/lib/notes";
import { ROLES, STAFF, TABS, can, denyReason, type Role } from "@/lib/roles";
import { insertIntoO } from "@/lib/vitals-text";
import { narcoticBlock } from "@/lib/narcotics";
import { INITIAL_BOOK, slipsDue, type NarcoticBook } from "@/lib/narcotic-book";
import { NarcoticSlips } from "./NarcoticSlips";
import { FormularyView } from "./FormularyView";
import { Drawer, DrawerDefaults } from "./panels/Drawer";
import { InlineOrder } from "./InlineOrder";
import { levelDrugsFrom } from "@/lib/lab-catalog";
import { ImagingPanel } from "./panels/ImagingPanel";

/**
 * Panels that open in their own window first (about 80% of the screen; moved by the title bar,
 * resized from the corner, put back into the drawer with a button). Every other panel opens as the
 * drawer on the right. Each Drawer has a 別ウインドウ button either way; the last choice and the
 * window's place are remembered per panel on this device only.
 */
// Every tool opens as its own window, except the three order entries that belong beside the note:
// 内服・注射・処置 (ユーザー 2026-11-06：「右側のアイコンは処置・点滴・内服以外は独立したウインドウで」).
const DRAWER_PANELS: ReadonlySet<string> = new Set(["add-rx", "add-injection", "add-procedure", "add-discharge"]);
const WINDOW_PANELS = { has: (k: string) => !DRAWER_PANELS.has(k) } as unknown as ReadonlySet<PanelKind>;
import { RisChartStrip } from "./panels/RisChartStrip";
import { ResultsPanel } from "./panels/ResultsPanel";
import { TxBedsidePanel } from "./panels/TxBedsidePanel";
import { BloodBankView } from "./BloodBankView";
import { PathologyView } from "./PathologyView";
import { PhysioView } from "./PhysioView";
import { EndoView } from "./EndoView";
import { KitchenView } from "./KitchenView";
import { TeamsView } from "./TeamsView";
import { TeamPanel } from "./panels/TeamPanel";
import { RadiologyView } from "./RadiologyView";
import { RehabView } from "./RehabView";
import { RehabProgressPanel } from "./panels/RehabProgressPanel";
import { PathRequestPanel } from "./panels/PathRequestPanel";
import { DeptReportsPanel } from "./panels/DeptReportsPanel";
import { ReportList, WardReportList } from "./ReportList";
import { ReportContext } from "./ReportMark";
import { reportsOf, unreadReports, wardReportRows } from "@/lib/reports";
import { bloodOf } from "@/lib/blood-bank";
import { useDepartments } from "@/lib/use-departments";
import { bedPeople, useCareDepts } from "@/lib/use-care-depts";
import { useNursingMgmt } from "@/lib/use-nursing-mgmt";
import { pressurePlanAuto, riskFromEval } from "@/lib/pressure-course";
import { UlcerBoard } from "./UlcerBoard";
import { StatusBoard } from "./StatusBoard";
import { currentShift, shiftKey } from "@/lib/ward-status";
import { AssignBoard } from "./AssignBoard";
import { SummaryApprovals } from "./SummaryApprovals";
import { FallBoard } from "./FallBoard";
import { fallTriggers } from "@/lib/fall-reassess";
import { assignKey, crewOn, nurseOfBed, planLines, roomNurses } from "@/lib/assignments";
import { VitalsBulk } from "./VitalsBulk";
import { CentralMonitor } from "./CentralMonitor";
import { MonitorPanel } from "./panels/MonitorPanel";
import { EMPTY_MANUAL, toggleMonitor, type MonitorManual } from "@/lib/monitor";
import { initialRosterBook } from "@/lib/roster";
import { PressurePanel } from "./panels/PressurePanel";
import { useInfra } from "@/lib/use-infra";
import { masterIssues } from "@/lib/master-local";
import { SystemView } from "./SystemView";
import { DowntimeView } from "./DowntimeView";
import { usePresence } from "@/lib/use-presence";
import { thisTab } from "@/lib/presence";
import { chartDeskOf } from "@/lib/merge-workspace";
import { liveLabel, MergedNotice, PresenceStrip } from "./Presence";
import { ScanPanel } from "./panels/ScanPanel";
import { withdraw } from "@/lib/scans";
import { SignBox } from "./panels/SignBox";
import { useLogin } from "@/lib/use-login";
import type { LoginUser } from "@/lib/login";
import { LoginGate } from "./LoginGate";
import { LiaisonView } from "./LiaisonView";
import { StatsView } from "./StatsView";
import { ReceiptDesk } from "./ReceiptDesk";
import { EMPTY_RETURNS, type ReturnDesk } from "@/lib/billing/returns";
import { EMPTY_LIAISON, type LiaisonBook } from "@/lib/liaison";

const NOTE_TEMPLATE = "";
/** The attending doctor of the four ward patients (fictional). */
const DOCTOR = STAFF.医師.name;

/** Per-patient working state. Kept while the tab is open, so switching tabs loses nothing. */
interface ChartState {
  contactVital?: VitalSign;
  selectedDay: DayOffset | null;
  showStopped: boolean;
  /** The left tab (経過・経過表・内服歴・注射歴・検査結果). */
  leftView: LeftView;
  /** A 記録 mark of the flow sheet: the left record shows that kind of note only (n renews it each time). */
  recordFocus?: { kind: string; n: number; noteId?: string };
  /** The flow sheet's zoom, shared by the left tab and its own window. */
  flowScale?: FlowScale;
  /** The right side: writing the note, or entering injections / oral drugs by Rp. */
  rightTab: RightTab;
  /** Tabs open on the right besides 記事作成 (opened from the tools, closed with ×). */
  openTabs: RightTab[];
  note: string;
  noteInitial?: string;
  noteTemplate?: { templateId: string; templateName: string } | null;
  instruction: string;
  drafts: Draft[];
  /** Orders confirmed today in this session. */
  added: OrderEntry[];
  /** Orders stopped today in this session. */
  stopped: string[];
  /** When each of them was stopped ("HH:MM"). */
  stopTimes: Record<string, string>;
  stopDays?: Record<string, number>;
  /** 延長 confirmed today: order id → its new 日数. */
  extended: Record<string, number>;
  /** What the calendar hands to the 注射 tab: an order for 修正 (the old one gets a stop draft) or Do, or only the start of a new injection. */
  injSeed?: InjSeed;
  /** シェーマ attached to today's note (kept with it when confirmed). */
  figures?: { caption: string; dataUrl: string }[];
  /** 記録時刻 of today's note when it is written late (null/absent = the time it is confirmed). */
  noteAt?: { day: DayOffset; time: string } | null;
  /** Do of a past prescription (or one picked from 処方の記憶): copied into the 内服 tab. */
  rxSeed?: PrescriptionSeed;
  confirmedDraftIds?: string[];
  drafting: boolean;
  error: string | null;
  meta: DraftMeta | null;
  flash: Flash | null;
}

/**
 * What a chart holds for everyone (today's confirmed orders, stops and extensions) is kept under the
 * patient id; what one person is writing (the note, the instruction, drafts, what is on screen) under
 * "id|role", so that a nurse never confirms a doctor's half-written note or drafts as their own.
 */
const SHARED_KEYS = ["added", "stopped", "stopTimes", "stopDays", "extended", "confirmedDraftIds"] as const;
type SharedKey = (typeof SHARED_KEYS)[number];
const isShared = (k: string): k is SharedKey => (SHARED_KEYS as readonly string[]).includes(k);
const deskKeyOf = (id: string, role: string) => `${id}|${role}`;
function mergedChart(all: Record<string, ChartState>, id: string, role: string): ChartState {
  const base = all[id] ?? newChart();
  const desk = all[deskKeyOf(id, role)] ?? newChart();
  return { ...desk, ...normalizeRightState(desk), drafts: pendingChartDrafts(desk.drafts, base.confirmedDraftIds), confirmedDraftIds: base.confirmedDraftIds, added: base.added, stopped: base.stopped, stopTimes: base.stopTimes, stopDays: base.stopDays, extended: base.extended };
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
  // Entry forms open from the tools; only optional reference tabs are kept here.
  openTabs: [],
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
/** Saturday or Sunday at this time (minutes from the page's first day, which may run past midnight). */
const weekendAt = (absMin: number) => {
  const t = parseIso(clientToday());
  const d = new Date(Date.UTC(t.y, t.m - 1, t.d + Math.floor(absMin / 1440))).getUTCDay();
  return d === 0 || d === 6;
};
const serverNull = () => null;

function parseIso(s: string): CalendarDate {
  const [y, m, d] = s.split("-").map(Number);
  return { y, m, d };
}

const newId = () => crypto.randomUUID();
const anamnesisVersionsCount = (r?: AnamnesisRecord) => (r ? (r.earlier?.length ?? 0) + 1 : 0);

/** The admission consent of the team's patients (15:00) and of the other charts (at their admission note). */
const admissionConsents = (): ConsentRecord[] =>
  [...DEMO_PATIENTS, ...DEMO_WARD_CHART_PATIENTS].map((p) => {
    const at = DEMO_PATIENTS.includes(p) ? ["15:00", "15:30"] : [p.history[0]?.time ?? "15:00", p.history[0]?.time ?? "15:30"];
    return { id: `consent-adm-${p.id}`, patientId: p.id, code: "CONSENT-ADMISSION", status: "同意", createdAt: { day: p.admittedOn, time: at[0] }, explainedAt: { day: p.admittedOn, time: at[1] }, explainedBy: p.attending, witness: "看護師", answers: {} };
  });

/** Short line for the P) section of today's note, written by code from the confirmed order. */
function planLine(entry: OrderEntry, today: CalendarDate): string {
  const { main, detail } = orderLines(entry.order, today);
  return `・${main}　${detail}`;
}

/** What the main area shows: a ② screen, a place, a chart, 新しいタブ, or 病棟's menu of screens. */
type Screen = WardTab | AreaKey | "chart" | "new" | "wardmenu" | "visit";
/** front[owner] when the tab shows 新しいタブ. */
const NEW_TAB = "__new__";
const ALL_WARDS = "全病棟";
const LIST_TABS = ["mine", "all"] as const;

// 病棟's screens to open first (最初に開く), per role. A convenience kept in this browser only.
// v2 (2026-11-04): the menu is shown first unless the user checks a screen again (older saved choices are not read).
// A saved screen that was renamed since (◯階の患者一覧 → 入院患者一覧) is read as the screen it became.
const WARD_DEFAULTS_KEY = "simple-karte:ward-defaults-v2";
function loadWardDefaults(): Record<string, WardTab[]> {
  try {
    const v = typeof window === "undefined" ? null : window.localStorage.getItem(scenarioStorageKey(WARD_DEFAULTS_KEY));
    const o: unknown = v ? JSON.parse(v) : {};
    if (!o || typeof o !== "object") return {};
    return Object.fromEntries(Object.entries(o as Record<string, unknown>).map(([role, tabs]) => [role, Array.isArray(tabs) ? [...new Set(tabs.flatMap((t) => (typeof t === "string" ? readWardTab(t) ?? [] : [])))] : []]));
  } catch {
    return {};
  }
}
function saveWardDefaults(v: Record<string, WardTab[]>) {
  try {
    window.localStorage.setItem(scenarioStorageKey(WARD_DEFAULTS_KEY), JSON.stringify(v));
  } catch {
    // Storage blocked (private window): the check works until the page is closed.
  }
}
const defaultsOf = (all: Record<string, WardTab[]>, role: Role): WardTab[] => (Array.isArray(all[role]) ? all[role] : []);

export default function WardApp() {
  const scenario = useSyncExternalStore<boolean | null>(noSubscribe, scenarioMode, () => null);
  if (scenario === null) return null;
  return <WardAppContent key={String(scenario)} scenario={scenario} />;
}

const NO_SCENARIO_PATIENTS: Patient[] = [];
const NO_SCENARIO_BEDS: BedAssignment[] = [];

function WardAppContent({ scenario }: { scenario: boolean }) {
  const PATIENTS = scenario ? SCENARIOS.patients : DEMO_PATIENTS;
  const WARD_CHART_PATIENTS = scenario ? NO_SCENARIO_PATIENTS : DEMO_WARD_CHART_PATIENTS;
  const BEDS_WITH_CHARTS = scenario ? SCENARIOS.beds : DEMO_BEDS_WITH_CHARTS;
  const OTHER_FLOOR_BEDS_WITH_CHARTS = scenario ? NO_SCENARIO_BEDS : DEMO_OTHER_FLOOR_BEDS_WITH_CHARTS;
  const todayKey = useSyncExternalStore(noSubscribe, clientToday, serverNull);
  const nowTime = useSyncExternalStore(everyFifteenSeconds, clientNow, serverNull);
  const [windowEntries, setWindowEntries] = useState<WindowEntries>({});
  const [noteTodoDone, setNoteTodoDone] = useState<TodoCompletions>({});
  const [charts, setCharts] = useState<Record<string, ChartState>>({});
  const [pickerOpen, setPickerOpen] = useState(false);
  const [orderWins, setOrderWins] = useState<string[]>([]);
  // 内服・注射 open inside 記事作成 (under the note): bring that tab to the front and show the entry.
  const openOrder = (key: string) => {
    setOrderWins((v) => showOrderWindow(v, key));
    update((c) => ({ rightTab: "note", openTabs: c.openTabs }));
    requestAnimationFrame(() => document.querySelector(`[aria-label^="${key === "add-rx" ? "内服" : key === "add-discharge" ? "退院オーダ" : "注射"}："]`)?.scrollIntoView({ block: "nearest" }));
  };
  const { panel, setPanel, open: panelWindows, activation: panelActivation, close: closePanelWindow } = usePanelWindows<PanelKind>(DRAWER_PANELS);
  /** The record template a pinned tile on the rail asked to open (テンプレート panel). */
  const [templateFocus, setTemplateFocus] = useState<string | null>(null);
  // 未確認の結果の窓: shown for a chart with unseen results until closed (per patient, this page).
  // 結果を表示 from a lab order in the record: the draw to show in the results table.
  const [resultFocus, setResultFocus] = useState<{ day: number; time: string } | null>(null);
  // The records left by the 経過 filter/search (null = not narrowed): the date tree lists only their days.
  const [shownEntries, setShownEntries] = useState<HistoryEntry[] | null>(null);
  // What a pressed cell of the flow sheet asked for (the time for バイタル・水分出納, the rows for the others).
  const [flowReq, setFlowReq] = useState<FlowEntry | null>(null);
  // Who is using the chart. The demo picks a role instead of logging in.
  const [role, setRole] = useState<Role>("医師");
  // Inside 医師, the person too (研修医・専攻医・指導医・ほかのチームの医師; all fictional).
  const [doctorName, setDoctorName] = useState(DEFAULT_DOCTOR);
  const [nurseName, setNurseName] = useState(DEFAULT_NURSE);
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
  const [reloadNote, setReloadNote] = useState<string | null>(null);
  // 戻る (the app installed from Chrome has no browser buttons): the place, the ward tab and what is in front.
  const nav = useNavHistory({ area, wardTab, front }, (t) => {
    // Back/forward also leaves the field first, as show() and openPatient() do (no half-typed word follows to the next patient).
    if (typeof document !== "undefined" && document.activeElement instanceof HTMLElement) document.activeElement.blur();
    setArea(t.area);
    setWardTab(t.wardTab);
    setFront(t.front);
  });
  const [newTabFor, setNewTabFor] = useState<Owner | null>(null);
  // The floor shown on 病棟マップ (and 看護日誌) and the day it shows (0 = today; not saved), and the ward chosen on 入院患者一覧 (全病棟 or one ward).
  const [floor, setFloor] = useState(WARD_NAME);
  const [asOfDay, setAsOfDay] = useState(0);
  const [listWard, setListWard] = useState(ALL_WARDS);
  const [recentByPerson, setRecentByPerson] = useState<Record<string, RecentOpen[]>>({});
  // 受け持ち患者 of a nurse: the team chosen for this shift (5階東 A = 501–508, B = 510–516), or the whole ward.
  const [myTeam, setMyTeam] = useState("");
  const me = useMemo(() => (role === "医師" ? { role, name: doctorName } : role === "看護師" ? { role, name: nurseName } : STAFF[role]), [role, doctorName, nurseName]);
  // ログインの仕組み（既定はオフ。この端末だけ）: when on, the role follows the person who logged in.
  const login = useLogin();
  const loginUsers: LoginUser[] = useMemo(() => [...DOCTORS.map((d) => ({ name: d.name, role: "医師" as const })), ...ROLES.filter((r) => r !== "医師").map((r) => ({ name: STAFF[r].name, role: r }))], []);
  // What one person is writing is kept apart per doctor too (山本 keeps the key he had before).
  const desk = role === "医師" && doctorName !== DEFAULT_DOCTOR ? `医師:${doctorName}` : role;
  // A 研修医's notes and orders wait for the 指導医 or 上級医 (they take effect at once: 架空の病院の取り決め).
  const resident = role === "医師" && isResident(doctorName);
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
  const [discharged, setDischarged] = useState<Record<string, { day: number; time: string; by: string }>>(() => scenario ? SCENARIOS.discharged : {});
  // 今日の尿量・排便・食事・体重 entered on the ward (added to each patient's record of today).
  const [extraDaily, setExtraDaily] = useState<Record<string, DailyAdd>>({});
  // 延長 confirmed in this session (for 指示受け), and the diet orders there were at the start.
  const [extendLog, setExtendLog] = useState<{ orderId: string; patientId: string; days: number; at: number; by: string; text: string }[]>([]);
  const [initialDietIds] = useState(() => new Set([...INITIAL_DIETS, ...WARD_CHART_DIETS].map((d) => d.id)));
  // 院内連絡: nurse calls, emergency calls and call notes (院内PHS の代わり).
  const [nurseCalls, setNurseCalls] = useState<NurseCall[]>([]);
  const [emergencies, setEmergencies] = useState<Emergency[]>([]);
  const [callNotes, setCallNotes] = useState<CallNote[]>([]);
  // お知らせ on the nurses' phones (オーダ変更・一斉連絡), and what nurses registered per bed (救護区分・センサー).
  const focusNotice = useNoticeFocus();
  const [phsNotices, setPhsNotices] = useState<PhsNotice[]>([]);
  const [bedInfo, setBedInfo] = useState<Record<string, BedInfo>>({});
  // 転院・施設の調整: what was asked where, and each answer.
  const [transferAsks, setTransferAsks] = useState<TransferAsk[]>(() => scenario ? SCENARIOS.asks : []);
  // 指示受け: changes a nurse held to ask the doctor (by row key), with the doctor's answer.
  const [takeHolds, setTakeHolds] = useState<Record<string, TakeHold>>({});
  // 指示確認: after taking a change, the nurse looked at the schedule it makes (row key → "HH:MM 看護師 ◯◯").
  const [takeConfirms, setTakeConfirms] = useState<Confirms>({});
  // 研修医の記事とオーダ, each waiting for the 指導医 or 上級医 to confirm it (who and when).
  const [cosign, setCosign] = useState<CosignItem[]>([]);
  // 閲覧制限 (every setting kept), and the reasons given to open a limited chart from outside its care team.
  const [limits, setLimits] = useState<AccessLimit[]>(INITIAL_LIMITS);
  const [glass, setGlass] = useState<GlassEntry[]>([]);
  // 掲示板: reminders sent to those who have not read a notice (notice id → names).
  const [boardReminders, setBoardReminders] = useState<Record<string, { names: string[]; at: string; by: string }>>({});
  const [dischargeAsk, setDischargeAsk] = useState<string | null>(null);
  const [deptChanges, setDeptChanges] = useState<Record<string, { dept: string; doctor: string }>>({});
  const [moveLog, setMoveLog] = useState<{ patientId: string; label: string; time: string }[]>([]);
  // Registered diagnoses per patient (official 傷病名マスター codes). Kept in this browser only.
  const [diagnosisUnmatched, setDiagnosisUnmatched] = useState<Record<string, string[]>>({});
  const [diagnoses, setDiagnoses] = useState<Record<string, Diagnosis[]>>(() => scenario ? SCENARIOS.diagnoses : withChartDiagnoses(INITIAL_DIAGNOSES));
  // 加算 that depend on the patient's state, entered by a person on the 算定 screen. Kept in this browser only.
  const [billing, setBilling] = useState<Record<string, BillingOptions>>({});
  // 医事課: the insurance registered per patient (every version) and 退院時の会計. Kept in this browser only.
  const [iji, setIji] = useState<IjiDesk>(() => scenario ? { insurance: SCENARIOS.insurance, settled: {} } : INITIAL_DESK);
  // Consent forms (fictional). Every inpatient gave the admission consent on their admission day.
  const [consentSelection, setConsentSelection] = useState<string | null>(null);
  const [consents, setConsents] = useState<ConsentRecord[]>(() => scenario ? SCENARIOS.consents : admissionConsents());
  // 指示受け by a nurse: change key → time. Kept in this browser only.
  const [taken, setTaken] = useState<Record<string, string>>({});
  // Pharmacy work (all kept in this browser only).
  const [audited, setAudited] = useState<Record<string, string>>({});
  const [queries, setQueries] = useState<Query[]>([]);
  const [reports, setReports] = useState<BroughtReport[]>([]);
  const [shido, setShido] = useState<Record<string, ShidoRecord[]>>({});
  const [dispensed, setDispensed] = useState<Record<string, string>>({});
  const orderUnlocks = useOrderUnlocks(audited, dispensed);
  const [oralRx, setOralRx] = useState<Record<string, OralRecord>>({});
  // 麻薬の管理（受払簿・施用票・返納・廃棄・事故）: narcotic-book.ts.
  const [narcBook, setNarcBookState] = useState<NarcoticBook>(() => scenario ? SCENARIOS.narcBook : INITIAL_BOOK);
  const setNarcBook = useCallback((next: React.SetStateAction<NarcoticBook>) => setNarcBookState(current => {
    const book = typeof next === "function" ? next(current) : next;
    return scenario ? repairPharmacyFixtures(book) : book;
  }), [scenario]);
  const [pharmacyFocus, setPharmacyFocus] = useState<{ tab: import("./PharmacyView").Tab; patientId: string } | null>(null);
  // Dialysis unit (fictional; kept in this browser only).
  const [hdPatients, setHdPatients] = useState<HdPatient[]>(HD_PATIENTS);
  const [hdSessions, setHdSessions] = useState<Record<string, HdSession>>(() => (typeof window === "undefined" ? {} : initialHdSessions(nowTimeInTokyo())));
  // Operating rooms (fictional schedule relative to now; kept in this browser only).
  const [anesthesiaTab, setAnesthesiaTab] = useState<{tab: string; patientId: string} | undefined>(undefined);
  const [surgeries, setSurgeries] = useState<Surgery[]>(() => (scenario ? SCENARIOS.surgeries : typeof window === "undefined" ? [] : initialSurgeries(abs(0, nowTimeInTokyo()))));
  const [er, setEr] = useState<ErPatient[]>(() => (scenario ? SCENARIOS.er : typeof window === "undefined" ? [] : initialErPatients(abs(0, nowTimeInTokyo()))));
  // 外来 today, the record written in each ED/outpatient tab, and the 入院申込 waiting on the wards.
  const [opd, setOpd] = useState<OpdPatient[]>(() => scenario ? SCENARIOS.opd : [...OPD_PATIENTS, ...OTHER_DEPT_TODAY]);
  // 外来の受付: bookings on later days and the 診察券 issued today.
  const [opdDesk, setOpdDesk] = useState<OpdDeskBook>(EMPTY_OPD_DESK);
  // Orders confirmed on a visit's screen (救急外来・外来) in this session, by visit key; merged with the demo's.
  const [visitOrders, setVisitOrders] = useState<Record<string, OrderEntry[]>>(() => scenario ? SCENARIOS.visitOrders : {});
  const [visitNotes, setVisitNotes] = useState<Record<string, VisitNote[]>>(() => scenario ? SCENARIOS.visitNotes : {});
  const [requests, setRequests] = useState<AdmissionRequest[]>(INITIAL_REQUESTS);
  // 外来処方（院外処方せん）と再診予約, per outpatient.
  const [opdRx, setOpdRx] = useState<Record<string, OpdRx[]>>({});
  const [revisits, setRevisits] = useState<Record<string, Revisit>>({});
  // 外来の会計（入金の記録）, by visit key "opd:◯".
  const [opdBills, setOpdBills] = useState<OpdSettleBook>({});
  // 掲示板 (notices and who read them), 院内マニュアル (the one open), インシデントレポート (and the draft).
  const [notices, setNotices] = useState<Notice[]>(INITIAL_NOTICES);
  const [reads, setReads] = useState<Reads>(INITIAL_READS);
  const [manualOpen, setManualOpen] = useState<string | null>(null);
  const [incidents, setIncidents] = useState<IncidentReport[]>(INITIAL_INCIDENTS);
  const [incidentDraft, setIncidentDraft] = useState<IncidentDraft>(emptyDraft);
  // 薬剤部：血液製剤の払出（製造番号）と病棟薬剤業務日誌.
  const [txIssued, setTxIssued] = useState<Record<string, { lot: string; at: string; by: string }>>(() => scenario ? SCENARIOS.txIssued : {});
  const [pharmJournal, setPharmJournal] = useState<{ text: string; at: string }[]>([]);
  const [homeRx, setHomeRx] = useState<Record<string, HomeRxRecord>>({});
  // 指導の記録 (栄養食事指導・服薬指導・退院時の生活指導): each answers the 指導の依頼 and goes into the chart.
  const [guidance, setGuidance] = useState<GuidanceRecord[]>([]);
  // 書類作成で作った書類.
  const [documents, setDocuments] = useState<DocRecord[]>([]);
  // 他科依頼の返書 (by order id).
  const [consultReplies, setConsultReplies] = useState<ConsultReplies>({});
  // 看護日誌: the charge nurse's words, per floor.
  const [journal, setJournal] = useState<Record<string, { text: string; by: string; at: string }[]>>({});
  // 勤務表と様式9 (5階東): null = the fictional draft, until the 看護師長 changes it.
  const [rosterBook, setRosterBook] = useState<RosterBook | null>(null);
  // 妊娠中の印 and 付箋, per patient.
  const [pregnancy, setPregnancy] = useState<Record<string, Patient["pregnancy"]>>({});
  // 担当医・コンサルト医 per patient (the attending is in the record); the list opens from the patient bar.
  const [doctorBook, setDoctorBook] = useState<DoctorBook>(INITIAL_DOCTOR_BOOK);
  // 患者基本情報 (住所・連絡先・家族・公費・介護・かかりつけ), per patient id (patient-contacts.ts).
  const [contactsBook, setContactsBook] = useState<ContactsBook>(INITIAL_CONTACTS);
  const [doctorsOpen, setDoctorsOpen] = useState(false);
  const [expiryOpen, setExpiryOpen] = useState(false);
  const [stickies, setStickies] = useState<Record<string, Sticky[]>>({ "90010231": [{ id: "st-1", text: "明日の血液培養の結果を家族に説明する", by: "山本（専攻医）", at: "17:40", shared: true }] });
  // 経過表: the days a nurse or doctor chose to count from (イベント日数).
  const [flowEvents, setFlowEvents] = useState<FlowEvent[]>([]);
  // 経過表のグラフの付箋 (a note at a time point; its author takes it off).
  const [graphNotes, setGraphNotes] = useState<GraphNote[]>([]);
  // 身体的拘束 records (start, reviews each shift, end).
  const [restraints, setRestraints] = useState<Restraint[]>(() => scenario ? SCENARIOS.restraints : INITIAL_RESTRAINTS);
  // 看護ケア指示 (care and observation orders by nurses), their 実施 records, and the 看護計画.
  const [careOrders, setCareOrders] = useState<CareOrder[]>(() => scenario ? SCENARIOS.nursing.careOrders : INITIAL_CARE_ORDERS);
  const [careRecords, setCareRecords] = useState<CareRecord[]>(initialCareRecords);
  const [nursingPlans, setNursingPlans] = useState<NursingProblem[]>(() => scenario ? SCENARIOS.nursing.nursingPlans : INITIAL_PLANS);
  // 指示簿 per patient, every version kept (the last one is in force).
  const [standing, setStanding] = useState<Record<string, StandingOrders[]>>(() => scenario ? SCENARIOS.standing : initialStanding());
  // 条件付き指示 (指示簿): what a nurse did for each value that met one, by hit key.
  const [condAcks, setCondAcks] = useState<Record<string, CondAck>>({});
  // クリティカルパス: paths applied to patients, the outcome evaluations and the variances.
  const [paths, setPaths] = useState<PathBook>(EMPTY_PATHS);
  // 指示簿の行 (free-text lines) per patient; a stopped line stays as history.
  const [standingLines, setStandingLines] = useState<Record<string, StandingLine[]>>(() => scenario ? SCENARIOS.standingLines : initialLines());

  // Vital signs entered in this session (kept in this browser only), merged into each patient.
  const [extraVitals, setExtraVitals] = useState<Record<string, RecordedVital[]>>({});
  // 患者モニター（模擬）: put on or taken off by hand by the nurses (the rule's choice is code; lib/monitor.ts).
  const [monitorManual, setMonitorManual] = useState<MonitorManual>(EMPTY_MANUAL);
  // 与薬・実施の記録 (eMAR). Items due before this session are taken as recorded by the earlier shift.
  const [mar, setMar] = useState<Record<string, AdminRecord>>(() => scenario ? {} : demoInsulinRecords(WARD_CHART_PATIENTS));
  // 実施・未実施 records taken back (with who, when and why), by dose key.
  const [marVoided, setMarVoided] = useState<Record<string, VoidedRecord[]>>({});
  // 水分出納 (IN/OUT) typed by the nurses; 点滴 comes from the drip records. Fictional records since yesterday 09:00.
  const [icu, setIcu] = useState<IcuRecords>(() => scenarioMode() ? ((SCENARIOS as { icu?: IcuRecords }).icu ?? emptyIcuRecords()) : emptyIcuRecords());
  const [io, setIo] = useState<IoEntry[]>(() => (typeof window === "undefined" ? [] : initialIo(abs(0, nowTimeInTokyo()))));
  // A nurse confirming orders is always entering a doctor's spoken order (口頭指示).
  const verbalMode = role === "看護師";
  const verbalConfirmation = useVerbalConfirmation();
  const [sessionStart, setSessionStart] = useState<number | null>(null);
  if (sessionStart === null && nowTime) setSessionStart(nursingShiftStart(nowTime));
  // Advance directives (history kept) and warnings added on the band.
  const [directives, setDirectives] = useState<AdvanceDirective[]>(() => scenario ? SCENARIOS.directives : INITIAL_DIRECTIVES);
  const [diets, setDiets] = useState<DietOrder[]>(() => scenario ? SCENARIOS.diets : [...INITIAL_DIETS, ...WARD_CHART_DIETS]);
  const [tdmReports, setTdmReports] = useState<TdmReport[]>([]);
  const [bRecords, setBRecords] = useState<BRecord[]>(INITIAL_B);
  const [discharges, setDischarges] = useState<Record<string, DischargeDraft>>(() => scenario ? SCENARIOS.discharges : {});
  const [extraCautions, setExtraCautions] = useState<Record<string, string[]>>({});
  // 患者プロファイルの変更（アレルギー・感染症・禁忌・血液型・身長体重・介助）, every change kept.
  const [profileLog, setProfileLog] = useState<ProfileChange[]>([]);
  // 入院時の情報収集（アナムネーシス）, by patient id (earlier versions inside).
  const [anamnesis, setAnamnesis] = useState<Record<string, AnamnesisRecord>>(INITIAL_ANAMNESIS);
  // Notes confirmed in this session, and corrected notes (by key, earlier versions inside).
  const [standingEdit, setStandingEdit] = useState<(StandingLine & { endSelected?: boolean; patientId: string }) | undefined>();
  const [notes, setNotes] = useState<Record<string, NoteEntry[]>>(() => scenario ? SCENARIOS.visitChartNotes : {});
  const [revised, setRevised] = useState<Record<string, Record<string, NoteEntry>>>({});
  const [handoffs, setHandoffs] = useState<Record<string, Handoff>>(() => scenario ? scenarioHandoffs(SCENARIOS.patients) : {});
  // Right-side tabs shown in their own window (別ウインドウ), and which window is in front.
  const [floating, setFloating] = useState<Partial<Record<RightTab, Win>>>({});
  // A past note or order is being dragged over the right side (Do).
  const [dropping, setDropping] = useState(false);
  // The imaging order opened from the left (its study comes first in the PACS viewer).
  const [imageFocus, setImageFocus] = useState<string | null>(null);
  const [zOrder, setZOrder] = useState<RightTab[]>([]);
  // 入院時の評価（計画書・栄養・褥瘡・転倒転落・せん妄・退院支援）.
  const [nutritionDoc, setNutritionDoc] = useState(false);
  const [supportDoc, setSupportDoc] = useState(false);
  const [admitSelection, setAdmitSelection] = useState<{ pid: string; key: import("@/lib/admit-eval").ItemKey }>();
  const [evals, setEvals] = useState<Record<string, AdmitEval>>(() => scenario ? SCENARIOS.evals : Object.fromEntries(initialEvals().map((e) => [e.patientId, e])));
  // Results the doctor marked as seen, and panic values phoned in by the laboratory.
  const [acks, setAcks] = useState<Record<string, Ack>>({});
  const [calls, setCalls] = useState<Record<string, PanicCall>>({});
  // 検査室: samples taken in, results confirmed (merged into each patient's labs), tries to reach a doctor.
  const [labDesk, setLabDesk] = useState<LabDesk>(EMPTY_DESK);
  // 輸血部門 (and the records of the other laboratory departments).
  const dept = useDepartments();
  // 給食・内視鏡室・チーム医療.
  const care = useCareDepts();
  // 看護管理（褥瘡の経過 …）: kept in its own hook, saved with the rest.
  const nm = useNursingMgmt(scenario ? SCENARIOS.nursing : undefined);
  const infra = useInfra();
  // 地域医療連携: the 連携室's entries, 返書 sent/received and facilities chosen.
  const [liaison, setLiaison] = useState<LiaisonBook>(EMPTY_LIAISON);
  // レセプト点検・返戻: the 返戻・査定 files read in and the 再請求 decided.
  const [returns, setReturns] = useState<ReturnDesk>(EMPTY_RETURNS);
  // 国のサービス（模擬）: what was registered with or sent to the simulated services.
  const [national, setNational] = useState<NationalRecord[]>([]);
  // 同時利用: after each save the other tabs and devices are told (usePresence fills this in).
  const onSaved = useRef<(() => void) | null>(null);
  // Who saved the records last (this tab), for the other devices.
  const writer = useMemo(() => ({ tab: thisTab(), by: me.name, role: me.role }), [me]);
  useAnesthesiaPersistence({surgeries,notes,io}, todayKey, setSurgeries, setNotes, setIo);
  // 記録の保存 (Supabase, when configured): every record of the session, read back the same day.
  const [sharedNoteTemplates, setSharedNoteTemplates] = useState<NoteTemplate[]>([]);
  const workspace = useWorkspace(
    {
      icu: [icu, setIcu],
      sharedNoteTemplates: [sharedNoteTemplates, setSharedNoteTemplates],
      windowEntries: [windowEntries, setWindowEntries],
      charts: [charts, setCharts],
      admitted: [admitted, setAdmitted],
      newBeds: [newBeds, setNewBeds],
      moves: [moves, setMoves],
      movesDone: [movesDone, setMovesDone],
      discharged: [discharged, setDischarged],
      extraDaily: [extraDaily, setExtraDaily],
      extendLog: [extendLog, setExtendLog],
      nurseCalls: [nurseCalls, setNurseCalls],
      emergencies: [emergencies, setEmergencies],
      callNotes: [callNotes, setCallNotes],
      phsNotices: [phsNotices, setPhsNotices],
      bedInfo: [bedInfo, setBedInfo],
      transferAsks: [transferAsks, setTransferAsks],
      boardReminders: [boardReminders, setBoardReminders],
      deptChanges: [deptChanges, setDeptChanges],
      moveLog: [moveLog, setMoveLog],
      // A save from before every inpatient had a chart gets those charts' diagnoses, diets and consent back.
      diagnosisUnmatched: [diagnosisUnmatched, setDiagnosisUnmatched],
      diagnoses: [diagnoses, (v: Record<string, Diagnosis[]>) => setDiagnoses(withChartDiagnoses(v))],
      billing: [billing, setBilling],
      consents: [consents, (v: ConsentRecord[]) => setConsents([...v, ...admissionConsents().filter((c) => !v.some((x) => x.id === c.id))])],
      taken: [taken, setTaken],
      audited: [audited, setAudited],
      orderUnlocks: [orderUnlocks.state, orderUnlocks.restore],
      queries: [queries, setQueries],
      reports: [reports, setReports],
      shido: [shido, setShido],
      dispensed: [dispensed, setDispensed],
      hdPatients: [hdPatients, setHdPatients],
      hdSessions: [hdSessions, setHdSessions],
      surgeries: [surgeries, setSurgeries],
      er: [er, setEr],
      opd: [opd, setOpd],
      opdDesk: [opdDesk, setOpdDesk],
      visitNotes: [visitNotes, setVisitNotes],
      visitOrders: [visitOrders, setVisitOrders],
      requests: [requests, setRequests],
      opdRx: [opdRx, setOpdRx],
      revisits: [revisits, setRevisits],
      opdBills: [opdBills, setOpdBills],
      notices: [notices, setNotices],
      reads: [reads, setReads],
      incidents: [incidents, setIncidents],
      txIssued: [txIssued, setTxIssued],
      pharmJournal: [pharmJournal, setPharmJournal],
      homeRx: [homeRx, setHomeRx],
      guidance: [guidance, setGuidance],
      documents: [documents, setDocuments],
      consultReplies: [consultReplies, setConsultReplies],
      journal: [journal, setJournal],
      pregnancy: [pregnancy, setPregnancy],
      doctorBook: [doctorBook, setDoctorBook],
      contactsBook: [contactsBook, setContactsBook],
      stickies: [stickies, setStickies],
      flowEvents: [flowEvents, setFlowEvents],
      graphNotes: [graphNotes, setGraphNotes],
      restraints: [restraints, setRestraints],
      careOrders: [careOrders, setCareOrders],
      careRecords: [careRecords, setCareRecords],
      nursingPlans: [nursingPlans, setNursingPlans],
      // Records saved before the standing orders became blocks are moved into the blocks as they are read back.
      standing: [standing, (v: Record<string, StandingOrders[]>) => setStanding(migrateStandingVersions(v))],
      condAcks: [condAcks, setCondAcks],
      paths: [paths, setPaths],
      standingLines: [standingLines, (v: Record<string, StandingLine[]>) => setStandingLines(migrateStandingLines(v))],
      extraVitals: [extraVitals, setExtraVitals],
      monitorManual: [monitorManual, setMonitorManual],
      mar: [mar, setMar],
      marVoided: [marVoided, setMarVoided],
      io: [io, setIo],
      sessionStart: [sessionStart, setSessionStart],
      directives: [directives, setDirectives],
      diets: [diets, (v: DietOrder[]) => setDiets(withChartDiets(v))],
      tdmReports: [tdmReports, setTdmReports],
      bRecords: [bRecords, setBRecords],
      discharges: [discharges, setDischarges],
      extraCautions: [extraCautions, setExtraCautions],
      profileLog: [profileLog, setProfileLog],
      anamnesis: [anamnesis, setAnamnesis],
      noteTodoDone: [noteTodoDone, setNoteTodoDone],
      notes: [notes, setNotes],
      revised: [revised, setRevised],
      handoffs: [handoffs, setHandoffs],
      evals: [evals, setEvals],
      acks: [acks, setAcks],
      calls: [calls, setCalls],
      labDesk: [labDesk, setLabDesk],
      liaison: [liaison, setLiaison],
      returns: [returns, setReturns],
      national: [national, setNational],
      // A save from before an outpatient's registration existed gets the demo registrations back (records in the save win).
      iji: [iji, (v: IjiDesk) => setIji(withInitialInsurance(v))],
      takeHolds: [takeHolds, setTakeHolds],
      takeConfirms: [takeConfirms, setTakeConfirms],
      oralRx: [oralRx, setOralRx],
      narcBook: [narcBook, setNarcBook],
      rosterBook: [rosterBook, setRosterBook],
      cosign: [cosign, setCosign],
      limits: [limits, setLimits],
      glass: [glass, setGlass],
      ...dept.states,
      ...care.states,
      ...nm.states,
      ...infra.states,
      __writer: [writer, () => {}],
    } as unknown as Record<string, [unknown, (v: never) => void]>,
    todayKey,
    // Records saved elsewhere are merged in: this role's desk (note, drafts) stays; the audit log's setter merges itself.
    { onSaved: () => onSaved.current?.(), merge: { local: chartDeskOf(me.role, desk), theirs: ["audit"], mine: ["__writer"] } },
  );
  const [demoLabs] = useState(() => (typeof window === "undefined" ? {} : demoLabOrders(abs(0, nowTimeInTokyo()))));
  // Lab orders of today's 救急外来・外来 visits (fictional), by visit key "er:◯" / "opd:◯".
  const [visitLabs] = useState(() => (typeof window === "undefined" ? {} : visitLabOrders(abs(0, nowTimeInTokyo()))));
  const visitEntries = useMemo(() => {
    const all: Record<string, OrderEntry[]> = { ...visitLabs };
    for (const [k, v] of Object.entries(visitOrders)) all[k] = [...(all[k] ?? []), ...v];
    return all;
  }, [visitLabs, visitOrders]);
  const [arrivedCultures] = useState(() => (typeof window === "undefined" ? {} : cultureArrivals(abs(0, nowTimeInTokyo()))));
  const allPatients = useMemo(
    () =>
      [...new Map([...PATIENTS, ...WARD_CHART_PATIENTS, ...admitted].map(p => [p.id, p])).values()].map((p0) => {
        const p = applyProfile(p0, profileLog);
        const d = currentDirective(directives, p.id);
        const diet = currentDiet(diets, p.id, nowTime || "00:00");
        return {
          ...p,
          currentOxygen: currentOxygen(icu, p.id, abs(0, nowTime || "00:00")),
          // In time order: a measurement may be entered later with its own time (from the flow sheet).
          vitals: recordedVitals([...p.vitals, ...(extraVitals[p.id] ?? [])], abs(0, nowTime || "00:00")).sort((a, b) => abs(a.day, a.time) - abs(b.day, b.time)),
          history: [...p.history, ...(demoLabs[p.id] ?? []), ...(dept.demoOrders[p.id] ?? []), ...(care.demoEndo[p.id] ?? [])],
          labs: [...p.labs, ...deskLabs(labDesk, p.id)],
          cultures: mergeCultures(mergeCultures(p.cultures, arrivedCultures[p.id]), deskCultures(labDesk, p.id)),
          cautions: [...p.cautions, ...(extraCautions[p.id] ?? [])],
          room: moves[p.id]?.room ?? p.room,
          department: deptChanges[p.id]?.dept ?? p.department,
          attending: deptChanges[p.id]?.doctor ?? p.attending,
          pregnancy: pregnancy[p.id] ?? p.pregnancy ?? null,
          ...(discharged[p.id] ? { dischargedAt: discharged[p.id] } : {}),
          daily: withIoUrine(withIcuUrine(withToday(p.daily, extraDaily[p.id]), icu, p.id, abs(0, nowTime || "00:00")), io.filter((e) => e.patientId === p.id)),
          ward: p.room ? floorOf(moves[p.id]?.room ?? p.room) : p.ward,
          codeStatus: d && d.cpr !== "未確認" ? bandLabel(d) : undefined,
          dietNow: diet ? dietLabel(diet) : undefined,
          blood: bloodOf(p.blood, dept.bloodBank.typings.filter((t) => t.patientId === p.id)),
        };
      }),
    [PATIENTS, WARD_CHART_PATIENTS, admitted, extraVitals, extraCautions, directives, diets, nowTime, arrivedCultures, moves, pregnancy, deptChanges, discharged, labDesk, demoLabs, extraDaily, io, icu, dept.bloodBank, dept.demoOrders, profileLog, care.demoEndo],
  );
  /** The blood type in the record before this session (輸血部門 adds its typings to it). */
  const recordBlood = (id: string) => new Map([...PATIENTS, ...WARD_CHART_PATIENTS, ...admitted].map(p => [p.id, p])).get(id)?.blood;
  // 救急外来・外来 of today: each visit is a (small) patient too, so it opens in the same chart screen as a
  // ward patient (its record is the visit's orders and notes; a chart opened for the visit keeps the rest).
  useInfusionPersistence(icu, charts, allPatients, todayKey, setIcu, setCharts, newChart);
  useTransferSummaryPersistence(charts, nm.summaries, todayKey, setCharts, nm.setSummaries, newChart);
  useKitchenAllergies(allPatients, care.kitchen, care.setKitchen, me, nowTime ?? "");
  const visitPatientsAll: WorkPatient[] = useMemo(
    () =>
      [...er.map((v) => visitPerson("er", v, visitEntries[`er:${v.id}`] ?? [], labDesk, PATIENTS.find(p => p.id === v.id))), ...opd.map((v) => visitPerson("opd", v, visitEntries[`opd:${v.id}`] ?? [], labDesk))].map((x) => ({
        ...x,
        patient: { ...x.patient, vitals: recordedVitals([...x.patient.vitals, ...(extraVitals[x.patient.id] ?? [])], abs(0, nowTime || "00:00")).sort((a, b) => abs(a.day, a.time) - abs(b.day, b.time)), pregnancy: pregnancy[x.patient.id] ?? null },
      })),
    [er, opd, visitEntries, labDesk, extraVitals, pregnancy, PATIENTS, nowTime],
  );
  // ~80 charts: looked up by number, not by searching the list.
  const patientById = useMemo(() => new Map([...visitPatientsAll.map((x) => x.patient), ...allPatients].map((p) => [p.id, p])), [allPatients, visitPatientsAll]);
  useDisplayState(role, me.name, setRole, setDoctorName, { area, wardTabs, wardTab, patientTabs, front }, { area: setArea, wardTabs: setWardTabs, wardTab: setWardTab, patientTabs: setPatientTabs, front: setFront }, new Set(patientById.keys()), !!todayKey && workspace.status !== "loading" && (workspace.status !== "off" || !workspaceOn()), defaultsOf(wardDefaults, role), setNurseName);
  useStandingCosign(standing, standingLines, setCosign);
  const findPatient = useCallback((id: string) => patientById.get(id), [patientById]);
  // The 山本チーム's patients (and today's admissions): the worksheet, やること and the boards are theirs.
  // A doctor's 受け持ち also has every patient they are 主治医 (team), 担当医 or コンサルト医 of, so none is missed.
  const teamIds = useMemo(() => teamIdsFor({ role, meName: me.name, patients: allPatients, basePatients: [...PATIENTS, ...admitted], beds: [...BEDS_WITH_CHARTS, ...newBeds].filter(b => !(b.patientId && discharged[b.patientId])).map(b => b.patientId && moves[b.patientId] ? { ...b, ...moves[b.patientId] } : b), doctorBook, scenario }), [PATIENTS, admitted, role, me.name, allPatients, BEDS_WITH_CHARTS, newBeds, moves, discharged, doctorBook, scenario]);
  // 医事課 and the receipt file stay the team's: the claim APIs take up to 100 patients in one request.
  const teamPatients = useMemo(() => allPatients.filter((p) => teamIds.has(p.id)), [allPatients, teamIds]);
  // 5階東 (and anyone moved from it or admitted today), and every floor's beds.
  const { ward, allBeds, everBeds } = useMemo(() => {
    // A patient whose discharge was carried out leaves the bed (the chart stays open where it is).
    const moved = (beds: BedAssignment[]) => beds.map((b) => (b.patientId && moves[b.patientId] ? { ...b, ...moves[b.patientId] } : b));
    const placed = (beds: BedAssignment[]) => moved(beds.filter((b) => !(b.patientId && discharged[b.patientId])));
    const here = placed([...BEDS_WITH_CHARTS, ...newBeds]);
    // everBeds keeps the discharged too: the map and list of a past day find them by their last bed.
    return { ward: { beds: here, patient: findPatient } as WardState, allBeds: [...here, ...placed(OTHER_FLOOR_BEDS_WITH_CHARTS)], everBeds: moved([...BEDS_WITH_CHARTS, ...newBeds, ...OTHER_FLOOR_BEDS_WITH_CHARTS]) };
  }, [BEDS_WITH_CHARTS, OTHER_FLOOR_BEDS_WITH_CHARTS, newBeds, findPatient, moves, discharged]);

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
    // An unfinished Japanese input (IME) must not carry into the next patient's field.
    if (typeof document !== "undefined" && document.activeElement instanceof HTMLElement) document.activeElement.blur();
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
    const any = (["mine", "all", "map"] as WardTab[]).find((t) => myWardTabs.includes(t));
    return wardOwner(open ?? any ?? myWardTabs[0] ?? "mine");
  };
  // A chart opens where it is already open, else under the tab in front.
  // 最近開いた患者 (per person, this browser): the list shown under ⌄ → 最近開いた患者.
  const recentList = recentByPerson[me.name] ?? (todayKey ? loadRecent(me.name, todayKey) : []);
  const setRecentList = (list: RecentOpen[]) => {
    if (todayKey) saveRecent(me.name, todayKey, list);
    setRecentByPerson((all) => ({ ...all, [me.name]: list }));
  };
  const openPatient = (id: string) => {
    // An unfinished Japanese input (IME) must not carry into the next patient's field.
    if (typeof document !== "undefined" && document.activeElement instanceof HTMLElement) document.activeElement.blur();
    setRecentList(pushRecent(recentList, id, 0, nowTime ?? ""));
    // A limited chart (閲覧制限): on the care team, with a reason given, or the reason step next.
    const p = findPatient(id);
    auditLog({ role: me.role, actor: me.name, patient: p?.name ?? id, ...openEvent(currentLimit(limits, id), !!p && inCareTeam(me, p, myTeam), grantOf(glass, id, me.name)) });
    // A ward chart opens under 病棟 even from the 救急外来・外来 area (a patient admitted from there, ⌘K there).
    const o = ownerFor(patientTabs, id, owner && wardTabOf(owner) ? owner : null, listOwner());
    // Checked inside the update: a press on a name in a list row can open the same chart twice at once.
    setPatientTabs((ts) => (ts.some((t) => t.id === id) ? ts : [...ts, { id, owner: o }]));
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
    setPatientTabs((ts) => (ts.some((t) => t.id === key) ? ts : [...ts, { id: key, owner: o }]));
    if (newTabFor === o) setNewTabFor(null);
    show(o, key);
  };

  // Closing a chart's tab shows the tab next to it in the one row of charts, else the screen it came from.
  // Closing a chart whose note is half written asks first (ユーザー 2026-11-05): the tab to close, or null.
  const [closeAsk, setCloseAsk] = useState<string | null>(null);
  const closePatient = (id: string) => {
    const half = id === activeId ? chart.note : (charts[id]?.note ?? "");
    if (!isBlankNote(half)) {
      setCloseAsk(id);
      return;
    }
    closePatientNow(id);
  };
  const closePatientNow = (id: string) => {
    setCloseAsk(null);
    const i = patientTabs.findIndex((x) => x.id === id);
    if (i < 0) return;
    const t = patientTabs[i];
    const rest = patientTabs.filter((x) => x.id !== id);
    setPatientTabs(rest);
    const shownNow = (screen === "chart" && activeId === id) || (screen === "visit" && visitKey === id);
    setFront((f) => ({ ...f, [t.owner]: f[t.owner] === id ? undefined : f[t.owner] }));
    if (shownNow) {
      const next = rest[i] ?? rest[i - 1];
      if (next) show(next.owner, next.id);
      else show(t.owner, undefined);
    }
    // The chart's state stays: today's confirmed orders and notes belong to the record, not to the tab.
  };

  // A nurse call nobody answers goes on to the ward leader (the rule in phs.ts), checked every 5 seconds.
  useEffect(() => {
    const t = setInterval(() => {
      const clock = clientNow();
      const [h, m] = clock.split(":").map(Number);
      const leader = onDuty((h * 60 + m) % 1440, weekendAt(h * 60 + m)).find((c) => c.role === "病棟リーダー")!.name;
      setNurseCalls((cs) => {
        const next = cs.map((c) => slide(c, Date.now(), `5階東 ${teamOf(c.room)} チームの看護師`, leader, clock));
        return next.some((c, i) => c !== cs[i]) ? next : cs;
      });
    }, 5000);
    return () => clearInterval(t);
  }, []);

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

  const closePanel = useCallback(() => {
    setPanel(null);
    setFlowReq(null);
  }, [setPanel]);

  usePatientWindows(activeId, [...orderWins, ...panelWindows, ...(doctorsOpen ? ["doctors"] : []), ...Object.keys(floating)], () => { setOrderWins([]); setPanel(null); setDoctorsOpen(false); setFloating({}); setZOrder([]); });
  const patient = activeId ? findPatient(activeId) : undefined;
  const chart = activeId ? mergedChart(charts, activeId, desk) : newChart();
  const today = useMemo(() => (todayKey ? parseIso(todayKey) : null), [todayKey]);
  // The 勤務表 as it stands (the fictional draft until the 看護師長 changes it), for 業務分担.
  const rosterNow = useMemo(() => (today ? (rosterBook ?? initialRosterBook(today.y, today.m)) : null), [rosterBook, today]);

  // The record as it stands now: history, with today's stops applied, plus today's confirmed orders.
  const entries: HistoryEntry[] = useMemo(
    () => (patient ? currentEntries(patient, { added: chart.added, stopped: chart.stopped, stopTimes: chart.stopTimes, stopDays: chart.stopDays, extended: chart.extended, notes: notes[patient.id], revised: revised[patient.id] }) : []),
    [patient, chart.stopped, chart.stopDays, chart.stopTimes, chart.extended, chart.added, notes, revised],
  );
  // For the claim: the team's imaging as 放射線部 recorded it (ris.ts withExamRecords).
  const billedEntries = useMemo(() => (patient && teamIds.has(patient.id) ? withExamRecords(entries, dept.ris) : entries), [patient, teamIds, entries, dept.ris]);

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
      allergies: patient ? checkList(patient) : [],
      consents: consents.filter((c) => c.patientId === patient?.id).map((c) => ({ code: c.code, status: consentDone(c) ? "同意" : c.status })),
      patientFacts: patient ? { sex: patient.sex, age: patient.age, allergies: checkList(patient), cre: latestCre(patient), heightCm: patient.heightCm, weightKg: patient.weightKg, pregnancy: patient.pregnancy ?? null } : null,
      txFacts: patient ? { blood: patient.blood, latest: { Hb: latestValue(patient, "Hb"), Plt: latestValue(patient, "Plt"), "PT-INR": latestValue(patient, "PT-INR") } } : null,
    };
  }, [entries, chart.drafts, nowTime, today, patient, consents]);

  const issues: Record<string, Issue[]> = useMemo(() => {
    if (!ctx) return {};
    // マスタ管理: an item made 中止 or 非採用 there cannot be ordered.
    return Object.fromEntries(chart.drafts.map((d) => [d.id, [...checkDraft(d, ctx), ...masterIssues(d, infra.masterOv, infra.masterLog)]]));
  }, [chart.drafts, ctx, infra.masterOv, infra.masterLog]);

  // 同時利用: the others with this chart open and who is correcting which note; records saved elsewhere are merged in.
  const presence = usePresence({
    wsId: workspace.id,
    shared: workspace.status !== "off" && workspace.status !== "loading",
    me,
    patientId: activeId,
    note: chart.note,
    drafts: chart.drafts.length,
    savedRef: onSaved,
    pull: workspace.pull,
    onMerged: (m) => auditLog({ role: me.role, actor: me.name, action: "別のタブ・端末で保存された記録を取り込んだ", detail: `${m.by}${m.role ? `（${m.role}）` : ""}が ${m.at} に保存${m.changed.length ? `　変わった記録：${m.changed.slice(0, 12).join("・")}` : ""}` }),
  });

  // Wait until the saved records and this device's tabs are back (the same moment useDisplayState restores), so they do not close the chart just opened.
  useMcpReceiver(scenario && !!todayKey && workspace.status !== "loading" && (workspace.status !== "off" || !workspaceOn()), (id, drafts) => { setTimeout(() => openPatient(id), 0); setCharts(all => applyChart(all, id, desk, c => ({ drafts: [...c.drafts, ...drafts] }))); }, newId);

  const [requestDrop, setRequestDrop] = useState<{ id: string; bed: { room: string; bed: string } } | null>(null);
  if (!today || !nowTime || (patient && !ctx)) {
    return <div className="grid h-screen place-items-center text-sm text-ink-faint">読み込み中…</div>;
  }

  // 閲覧制限 of the chart in front: the limit, whether I am on its care team, and the reason I gave.
  const limitNow = patient ? currentLimit(limits, patient.id) : null;
  const inTeamNow = !!patient && inCareTeam(me, patient, myTeam);
  const grantNow = patient ? grantOf(glass, patient.id, me.name) : undefined;

  const update = (patch: Partial<ChartState> | ((c: ChartState) => Partial<ChartState>)) => {
    if (!activeId) return;
    const id = activeId;
    setCharts((all) => applyChart(all, id, desk, (c) => (typeof patch === "function" ? patch(c) : patch)));
  };

  const updateFor = (id: string, patch: (c: ChartState) => Partial<ChartState>) => setCharts((all) => applyChart(all, id, desk, patch));

  const requestDrafts = async (command?: string) => {
    const text = (command ?? chart.instruction).trim();
    if (!text || chart.drafting) return;
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
      const drafts = resolveDraftCodes(draftsFromAi(parsed.data, newId), ctx?.activeOrders ?? []);
      auditLog({ role: "AI", actor: CLAUDE, action: "下書きを作った", patient: patient?.name, detail: `${drafts.length}件 「${text}」${json.meta?.ms ? `（${(json.meta.ms / 1000).toFixed(1)}秒）` : ""}` });
      update((c) => ({ drafts: [...c.drafts, ...drafts], instruction: command === undefined && c.instruction === chart.instruction ? "" : c.instruction, drafting: false, meta: json.meta ?? null }));
    } catch (e) {
      update({ drafting: false, error: e instanceof Error ? e.message : "下書きを作れませんでした。" });
    }
  };

  // Confirms the given drafts (the chart's, or those plus one just saved from a panel). The caller checks readiness.
  const confirmDrafts = (drafts: Draft[], verbal?: VerbalConfirmation) => {
    if (!ctx) return;
    if (verbalMode && !verbal) { verbalConfirmation.request((v) => confirmDrafts(drafts, v), nowTime, [patient!.attending, ...doctorsOf(patient!.attending, doctorBook[patient!.id]).others.map((d) => d.name)]); return; }
    if (verbal && verbalConfirmationProblems(verbal).length) return;
    const examProblem = examReservationProblem(drafts, examPeople, dept.ris);
    if (examProblem) return update({ flash: examProblem });
    const conflict = replacementConflict(drafts, entries.filter((e): e is OrderEntry => e.kind === "order"));
    if (conflict) return update({ flash: conflict });
    const added: OrderEntry[] = [];
    const completed: OrderEntry[] = [];
    const stops: string[] = [];
    const extended: Record<string, number> = {};
    const newConsents: ConsentRecord[] = [];
    const dietsAdded: DietOrder[] = [];
    for (const d of drafts) {
      if (d.kind === "diet") {
        dietsAdded.push({ ...d.diet, id: newId(), patientId: patient!.id, by: verbal?.doctor ?? me.name, at: { day: 0, time: nowTime } });
        continue;
      }
      const r = toOrder(d, ctx);
      stops.push(...r.stopIds);
      if (r.extend) extended[r.extend.orderId] = r.extend.days;
      const ids: string[] = [];
      for (const o of [...(r.order ? [r.order] : []), ...(r.orders ?? [])]) {
        const id = newId();
        ids.push(id);
        added.push({ kind: "order", id, day: 0, time: nowTime, author: verbal?.doctor ?? me.name, status: "有効", order: o, ...(d.origin === "ai" && d.sourceText.trim() ? { said: d.sourceText.trim() } : {}), ...(verbal ? { verbal: { takenBy: me.name, doctor: verbal.doctor, readBack: verbal.readBack, at: { day: 0, time: verbal.time } } } : {}) });
      }
      if ("alreadyDone" in d && d.alreadyDone) completed.push(...added.filter((e) => ids.includes(e.id)));
      // A consent form to prepare with the order (説明前): the doctor explains before it is done.
      newConsents.push(...orderConsentDrafts(added.filter(e => ids.includes(e.id)), patient!.id, nowTime, newId, r.consents));
    }
    // 抗がん薬・麻薬: a 研修医 does not confirm them (架空の病院の取り決め).
    const notMine = resident ? [...new Set(added.flatMap((e) => residentBlock(e.order) ?? []))] : [];
    if (notMine.length) return update({ flash: `確定していません（${notMine.join("・")}が入っています）。${COSIGN_RULES.blocked}` });
    // 麻薬: only a 麻薬施用者 with a valid licence (麻薬及び向精神薬取締法 第27条第1項).
    const narc = narcoticBlock(added.map((e) => e.order), verbal?.doctor ?? me.name, today);
    if (narc) return update({ flash: narc });
    for (const r of recordsForCompletedOrders(completed, patient!, nowTime, verbal?.doctor ?? me.name)) recordMar(r);
    if (dietsAdded.length) {
      setDiets((all) => [...all, ...dietsAdded]);
      const fromText = (d: DietOrder) => `${d.from.day === 0 ? "今日" : d.from.day === 1 ? "明日" : d.from.day === 2 ? "明後日" : formatShort(addDays(today!, d.from.day))}の${d.from.meal}食から`;
      for (const d of dietsAdded) auditLog({ role: me.role, actor: me.name, action: "確定（食事）", patient: patient?.name, detail: `${dietLabel(d)}（${fromText(d)}）` });
      // The left 経過 shows the change too (the diet book alone is not in the record).
      chartNote(patient!.id, ["【食事】", ...dietsAdded.map((d) => `${dietLabel(d)}（${fromText(d)}）${d.comment ? `　${d.comment}` : ""}`)].join("\n"));
    }
    if (added.some(e => e.order.type === "injection" && e.order.continuous)) setIcu(all => ({ ...all, infusions: all.infusions.map(inf => { const e = added.find(e => e.order.type === "injection" && e.order.continuous?.infusionId === inf.id); return e ? { ...inf, orderId: e.id } : inf; }) }));
    const stoppedEntries = entries.filter((e): e is OrderEntry => e.kind === "order" && stops.includes(e.id));
    const lines = [
      ...stoppedEntries.map((e) => {
        const o = e.order;
        const name =
          o.type === "injection" ? anyDrugName(o.items[0].drugCode) : o.type === "prescription" ? anyDrugName(o.drugCode) : o.type === "procedure" ? procedureTitle(o) : "";
        const stop = chart.drafts.find(d => d.kind === "stop" && d.targetOrderId === e.id);
        return `・${name} 中止${stop?.kind === "stop" && stop.effectiveDay ? `（${formatShort(addDays(today, stop.effectiveDay))}から）` : ""}`;
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
    // 持参薬 reports answered by these drafts are now 指示済.
    const answered = new Set(drafts.flatMap((d) => ((d as { reportId?: string }).reportId ? [(d as { reportId?: string }).reportId!] : [])));
    if (answered.size) setReports((rs) => rs.map((x) => (answered.has(x.id) ? { ...x, status: "指示済" } : x)));
    // オーダーアラート: a doctor's changes go to the nurses' phones of the patient's team. Only for a ward patient:
    // the 救急外来・外来 nurse works from that desk's own list, and the ward's phones have nothing to do there.
    if (role === "医師" && patientPlace(patient!.id) === "ward" && (added.length || stops.length || Object.keys(extended).length))
      setPhsNotices((ns) => [
        ...ns,
        {
          id: newId(),
          at: nowTime,
          kind: "オーダ変更",
          text: `${patient!.room} ${patient!.name}さん：${[added.length && `新規 ${added.length}件`, stops.length && `中止 ${stops.length}件`, Object.keys(extended).length && `延長 ${Object.keys(extended).length}件`].filter(Boolean).join("・")}（指示受けはワークシートで）`,
          patientId: patient!.id,
          to: teamOf(patient!.room),
          from: me.name,
          readBy: [],
        },
      ]);
    // 延長 goes to the nurses' 指示受け like a new order.
    const extLog = Object.entries(extended).flatMap(([id, days]) => {
      const e = entries.find((x): x is OrderEntry => x.kind === "order" && x.id === id);
      return e ? [{ orderId: id, patientId: patient!.id, days, at: abs(0, nowTime), by: verbal?.doctor ?? me.name, text: orderLines(e.order, today).main }] : [];
    });
    if (extLog.length) setExtendLog((all) => [...all, ...extLog]);
    auditLog(
      verbalMode
        ? { role: me.role, actor: me.name, action: `確定（口頭指示を代行入力。指示 ${DOCTOR}）`, patient: patient?.name, detail: lines.map((l) => l.replace(/^・/, "")).join("／").slice(0, 200) }
        : { role: me.role, actor: me.name, action: "確定（オーダ）", patient: patient?.name, detail: lines.map((l) => l.replace(/^・/, "")).join("／").slice(0, 200) },
    );
    // 研修医: one item per new order, stop and extension, for the 指導医 or 上級医 to confirm.
    if (resident)
      setCosign((all) => [
        ...all,
        ...newItems({ patientId: patient!.id, by: me.name, at: { day: 0, time: nowTime } }, [
          ...added.map((e) => ({ ref: e.id, kind: "オーダ" as const, text: planLine(e, today).replace(/^・/, "") })),
          ...stoppedEntries.map((e, i) => ({ ref: `stop:${e.id}`, kind: "中止" as const, text: lines[i].replace(/^・/, "") })),
          ...extLog.map((x) => ({ ref: `extend:${x.orderId}`, kind: "延長" as const, text: `${x.text} 延長 → ${x.days}日間` })),
        ], newId),
      ]);
    // 外来の患者: a confirmed 外来予約 is also the visit's 再診予約 (shown on the strip).
    if (patient!.id.startsWith("opd:"))
      for (const e of added)
        if (e.order.type === "procedure" && e.order.opd) {
          const b = e.order.opd;
          setRevisits((all) => ({ ...all, [patient!.id.slice(4)]: { day: b.day, time: b.slot === "時刻" ? (b.time ?? "") : b.slot, purpose: b.purpose, by: e.author } }));
        }
    update((c) => ({
      added: [...c.added, ...added],
      stopped: [...c.stopped, ...stops],
      stopTimes: { ...c.stopTimes, ...Object.fromEntries(stops.map((id) => [id, stopTimesOf(drafts, nowTime)[id] ?? nowTime])) },
      stopDays: { ...c.stopDays, ...Object.fromEntries(drafts.flatMap(d => d.kind === "stop" && d.targetOrderId ? [[d.targetOrderId, d.effectiveDay ?? 0]] : [])) },
      extended: { ...c.extended, ...extended },
      drafts: [],
      confirmedDraftIds: [...new Set([...(c.confirmedDraftIds ?? []), ...drafts.map(d => d.id)])],
      // The orders stay in the left 経過 only; they are not written into the note (ユーザー 2026-11-06：わかりづらい).
      note: c.note,
      flash: `${added.length + stops.length + Object.keys(extended).length + dietsAdded.length}件を確定しました。${dietsAdded.length ? `食事の変更は食事のオーダに入りました。` : ""}左の経過に入りました。${newConsents.length ? `同意書の下書き ${newConsents.length}件（右の「同意書」）。` : ""}`,
      selectedDay: 0,
    }));
  };
  const confirm = () => {
    if (chart.drafts.every((d) => isReady(issues[d.id] ?? []))) confirmDrafts(chart.drafts);
  };
  // 保存 on the bar: the note of the day (記録時刻・記載時刻 kept apart), by the person writing.
  const unseenHere: ResultItem[] = patient ? unseen([...resultsOf(patient, PANIC_LIMITS), ...dept.results.filter((i) => i.patientId === patient.id), ...care.results.filter((i) => i.patientId === patient.id)], acks) : [];
  // 口頭指示 waiting for a doctor's signature: a count on the 有効なオーダ tool, the inbox inside it (not over the note).
  const verbalHere = patient ? verbalUnsigned(entries.filter((e): e is OrderEntry => e.kind === "order")) : [];
  // レポート一覧 and the marks on the order rows (reports.ts): the same keys and 確認 as the results above.
  const reportSrc = { ris: dept.ris, physio: dept.physioDesk, pathology: dept.pathology, endo: care.endo, cultures: labDesk.cultures };
  const reportsHere = patient ? reportsOf(patient, entries, reportSrc) : [];
  const unreadHere = unreadReports(reportsHere, acks);
  const openReportImage = (id: string) => {
    setImageFocus(id);
    setPanel("imaging");
  };
  const confirmNote = () => {
    if (!patient || !noteChanged(chart.note, chart.noteInitial)) return;
                          // 記録時刻 (when it happened; set earlier when writing late) and 記載時刻 (now, kept as is).
                          const at = chart.noteAt ?? { day: 0, time: nowTime };
                          const n: NoteEntry = { kind: "note", id: newId(), day: at.day, time: at.time, writtenAt: { day: 0, time: nowTime }, recordedDepartment: patient.department, recordedPlace: patient.ward, author: me.name, role: me.role, ...parseNote(chart.note), ...(chart.figures?.length ? { figures: chart.figures } : {}) };
                          Object.assign(n, templateStamp(n, [...BUILTIN_RECORD_TEMPLATES, ...loadMyRecordTemplates(me.name)], chart.noteTemplate));
                          setNotes((all) => ({ ...all, [patient.id]: [...(all[patient.id] ?? []), n] }));
                          void resolveNoteDiagnoses(chart.note, patient.admissionDiagnosis, diagnoses[patient.id] ?? [], { day: n.day, noteId: n.id, at: new Date().toISOString() }).then(result => {
                            setDiagnoses(all => ({ ...all, [patient.id]: [...(all[patient.id] ?? []), ...result.add.filter(d => !(all[patient.id] ?? []).some(x => x.code === d.code))] }));
                            setDiagnosisUnmatched(all => ({ ...all, [patient.id]: result.unmatched }));
                          }).catch(() => updateFor(patient.id, () => ({ flash: "病名の自動登録ができませんでした" })));

                          auditLog({ role: me.role, actor: me.name, action: "確定（記事）", patient: patient.name, detail: `${chart.noteAt ? `記録時刻 ${formatShort(addDays(today, at.day))} ${at.time}　` : ""}${chart.note.replace(/\s+/g, " ").slice(0, 120)}` });
                          if (resident) setCosign((all) => [...all, ...newItems({ patientId: patient.id, by: me.name, at: { day: 0, time: nowTime } }, [{ ref: n.id!, kind: "記事", text: chart.note.trim() }], newId)]);
                          update({ note: nextFrame(me.role, chart.note, nowTime), noteInitial: nextFrame(me.role, chart.note, nowTime), figures: [], noteAt: null, noteTemplate: null, flash: chart.noteAt ? `記事を確定しました（記録時刻 ${at.time}、書いた時刻 ${nowTime}）。左の経過に入りました。` : "記事を確定しました。左の経過に入りました。" });
                          };

  // A record template's text, confirmed as a note of its own (【テンプレート名】 heading; the wording was put together by code).
  const confirmRecord = (text: string, label: string, templateId: string) => {
    if (!patient) return;
    const n: NoteEntry = { kind: "note", id: newId(), day: 0, time: nowTime, writtenAt: { day: 0, time: nowTime }, recordedDepartment: patient.department, recordedPlace: patient.ward, author: me.name, role: me.role, ...parseNote(text), templateId, templateName: label };
    setNotes((all) => ({ ...all, [patient.id]: [...(all[patient.id] ?? []), n] }));
    auditLog({ role: me.role, actor: me.name, action: `確定（記事：${label}）`, patient: patient.name, detail: text.replace(/\s+/g, " ").slice(0, 120) });
    if (resident) setCosign((all) => [...all, ...newItems({ patientId: patient.id, by: me.name, at: { day: 0, time: nowTime } }, [{ ref: n.id!, kind: "記事", text: text.trim() }], newId)]);
    update({ flash: `${label}を記事として確定しました。左の経過に入りました。` });
  };

  // 研修医の記録を、指導医か上級医が確かめる. Each confirmation goes to the audit log.
  const confirmCosign = (ids: string[], comment: string) => {
    const r = confirmItems(cosign, ids, me.name, { day: 0, time: nowTime }, comment);
    if (!r.done.length) return;
    setCosign(r.items);
    for (const i of r.done) auditLog({ role: me.role, actor: me.name, action: `確定（研修医の${i.kind}を確認）`, patient: findPatient(i.patientId)?.name, detail: `${i.by} ${i.at.time}：${i.text.replace(/\s+/g, " ").slice(0, 80)}${i.confirmed?.comment ? `　コメント：${i.confirmed.comment}` : ""}` });
  };

  const lettersOf = (pid: string) => {
    const d = discharges[pid];
    return d?.letter.issuedAt ? [{ day: d.letter.issuedAt.day, to: d.letter.to, dischargeDay: d.dischargeDay, attach: !!d.letter.attach }] : [];
  };

  const createConsent = (code: ConsentCode) => {
    if (!patient || deny("consent")) return;
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
    let id = `9002${String(admitted.length + 1).padStart(4, "0")}`;
    const vkey = `${r.from.kind}:${r.from.id}`;
    if (r.from.kind === "er" && opdBills[vkey]) { window.alert("救急外来で入金済みです。二重会計を防ぐため入院への変更を止めました。この試作では入金の取消・返金は未対応です。"); return; }
    const said = [...(visitNotes[vkey] ?? []).map((n) => n.text), ...(notes[vkey] ?? []).map((n) => noteText(n))];
    let built: ReturnType<typeof admitFromOpd> | null = null;
    let existing: Patient | undefined;
    if (r.from.kind === "er") {
      const e = er.find((x) => x.id === r.from.id);
      if (!e) return;
      existing = PATIENTS.find(p => p.id === e.id);
      if (existing) {
        id = e.id;
        built = admitExistingPatient(existing, r, bed, nowTime);
        const seeded = scenario ? SCENARIOS.visitChartNotes[vkey] ?? [] : [];
        built.patient.history.splice(-1, 0, ...(notes[vkey] ?? []).filter(n => !seeded.some(s => s.id === n.id)).map(n => ({ ...n, recordedDepartment: n.recordedDepartment ?? existing!.department, recordedPlace: n.recordedPlace ?? existing!.ward })));
      } else {
        built = admitFromEr(e, { diagnosis: r.diagnosis, department: r.department, heightCm: r.heightCm, weightKg: r.weightKg, allergies: r.allergies, room: bed.room, bed: bed.bed }, id, nowTime);
        built.patient.history.splice(1, 0, ...said.map((t) => ({ kind: "note" as const, day: 0, time: nowTime, author: r.attending, role: "医師" as const, text: `救急外来：${t}` })));
      }
      setEr((list) => list.map((x) => (x.id === e.id ? { ...x, status: "入院済", admittedAs: id } : x)));
      setIji(d => ({...d, insurance: linkInsurance(d.insurance, `er:${e.id}`, id)}));
    } else {
      const o = opd.find((x) => x.id === r.from.id);
      if (!o) return;
      built = admitFromOpd(o, r, bed, id, nowTime, said);
      setOpd((list) => list.map((x) => (x.id === o.id ? { ...x, status: "終了" } : x)));
    }
    const { patient: p, bed: b } = built;
    if (r.from.kind === "er") p.history = transferEmergencyOrders(p.history, withExamRecords(currentEntries(existing ? { ...existing, history: [] } : findPatient(vkey)!, charts[vkey]), dept.ris));
    auditLog({ role: me.role, actor: me.name, action: "確定（入院を受けた・ベッドを決めた）", patient: p.name, detail: `${b.room}${b.bed ? `${b.bed}` : ""}　${r.urgency}　${r.diagnosis}` });
    p.infections = r.isolation === "なし" || p.infections.includes(r.isolation) ? p.infections : [...p.infections, r.isolation];
    setStanding((all) => ({ ...all, [id]: [...(all[id] ?? []), standingFromRequest(r, r.by, { day: 0, time: nowTime })] }));
    setIcu(all => admissionIcuRecords(all, id, r, b.room, nowTime));
    setAdmitted((a) => [...a, p]);
    // 緊急入院 counts as emergency (退院困難な要因 イ, 栄養管理計画は7日以内).
    setEvals((all) => ({ ...all, [id]: { patientId: id, emergency: r.urgency === "緊急" } }));
    setNewBeds((x) => [...x, b]);
    // The admission diagnosis is kept as 未コード化傷病名 until a master name is chosen.
    setDiagnoses((all) => ({
      ...all,
      [id]: all[id] ?? [{ id: newId(), code: UNCODED, name: r.diagnosis.trim(), prefixes: [], suffixes: [], main: true, start: 0, outcome: "継続" }],
    }));
    setRequests((rs) => rs.map((x) => (x.id === r.id ? { ...x, status: "入院済", admittedAs: id } : x)));
    openPatient(id);
  };
  const requestFor = (kind: "er" | "opd") =>
    Object.fromEntries(requests.filter((r) => r.from.kind === kind && r.status !== "取消").map((r) => [r.from.id, r])) as Record<string, AdmissionRequest | undefined>;

  const addManualLab = (draft: Draft) => update((c) => ({ drafts: [...c.drafts, draft], flash: null }));
  // 検体検査の「保存」: when nothing needs an answer (no stop/ask on this draft or the ones already waiting), the
  // draft is confirmed at once; otherwise it waits under the note like any other draft.
  const saveLab = (d: Draft) => {
    const okNew = !!ctx && isReady([...checkDraft(d, ctx), ...masterIssues(d, infra.masterOv, infra.masterLog)]);
    const okOld = chart.drafts.every((x) => isReady(issues[x.id] ?? []));
    if (okNew && okOld) confirmDrafts([...chart.drafts, d]);
    else addManualLab(d);
    closePanel();
  };
  // A stop chosen on a calendar becomes a draft like any other; the doctor confirms it on the right.
  // お知らせ for a nurse: to everyone, or to the team chosen in 受け持ち患者 (all teams when none is chosen).
  const forMyTeam = (n: PhsNotice) => n.to === "全員" || !myTeam || n.to === myTeam;
  // A 持参薬 report whose drafts are all removed (消す・やり直す) goes back to the doctor's inbox.
  const releaseReport = (draftId: string) => {
    const rid = (chart.drafts.find((d) => d.id === draftId) as { reportId?: string } | undefined)?.reportId;
    if (rid && !chart.drafts.some((d) => d.id !== draftId && (d as { reportId?: string }).reportId === rid)) setReports((rs) => rs.map((x) => (x.id === rid && x.status === "指示の下書き" ? { ...x, status: "医師へ報告" } : x)));
  };
  // 院内連絡: the patient's cautions shown with a nurse call, and records that go into the chart.
  const cautionsOf = (pid: string) => {
    const p = findPatient(pid);
    if (!p) return [];
    return [...p.cautions, ...p.infections.map((i) => `隔離：${i}`), ...(p.allergies.length ? [`アレルギー：${p.allergies.join("、")}`] : []), ...(activeOf(restraints, pid) ? ["身体的拘束中"] : []), ...(p.codeStatus ? [p.codeStatus] : [])];
  };
  const chartNote = (pid: string, text: string, category?: NoteEntry["category"]) => setNotes((all) => ({ ...all, [pid]: [...(all[pid] ?? []), { kind: "note", id: newId(), day: 0, time: nowTime, author: me.name, role: me.role, text, category } as NoteEntry] }));
  const updateCall = (id: string, patch: (c: NurseCall) => Partial<NurseCall>) => setNurseCalls((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch(c) } : c)));
  const answerCall = (id: string) => updateCall(id, (c) => (c.answered ? {} : { answered: { at: nowTime, by: me.name } }));
  // 予定一覧 (院内連絡): today's and tomorrow's admissions and discharges, moves and leave, exams and operations.
  const scheduleItems = (): ScheduleItem[] => {
    const nowAbs = abs(0, nowTime);
    const when = (d: number, t: string | null) => `${d === 0 ? "今日" : d === 1 ? "明日" : formatShort(addDays(today, d))} ${t ?? ""}`.trim();
    const sort = (d: number, t: string | null) => d * 1440 + (t ? abs(0, t) : 0);
    const out: ScheduleItem[] = [];
    for (const x of people) {
      for (const m of moveEventsOf(x.patient.id)) if (m.day >= 0 && m.day <= 1 && m.label !== "入院") out.push({ when: when(m.day, m.time), sort: sort(m.day, m.time), room: x.room, name: x.patient.name, what: `${m.label}${m.done ? "（済）" : ""}` });
      for (const i of buildWorksheet([x], 0, 2 * 1440, nowAbs).timed.filter((t) => t.kind === "検査")) out.push({ when: when(Math.floor(i.at! / 1440), `${String(Math.floor((i.at! % 1440) / 60)).padStart(2, "0")}:${String(i.at! % 60).padStart(2, "0")}`), sort: i.at!, room: x.room, name: x.patient.name, what: `検査：${i.main}` });
    }
    for (const sx of surgeries) if (sx.patientId && sx.day >= 0 && sx.day <= 1) out.push({ when: when(sx.day, sx.start), sort: sort(sx.day, sx.start), room: findPatient(sx.patientId)?.room ?? "", name: sx.name, what: "手術" });
    for (const w of WARD_PLANS) out.push({ when: when(w.day, w.time), sort: sort(w.day, w.time), room: roomLabel(w.room, w.bed), name: w.name, what: `${w.kind}（${w.department}）${w.note ? `：${w.note}` : ""}` });
    return out.sort((a, b) => a.sort - b.sort);
  };
  // Doses the ward recorded as 未実施, for the claim ("orderId|minutes").
  const notGivenOf = (pid: string) => Object.values(mar).filter((r) => r.patientId === pid && r.status === "未実施").map((r) => r.key);
  // 放射線部 works for the team's patients: their imaging is billed from its record (done, not done, contrast).
  const withRis = (pid: string, es: HistoryEntry[]) => (teamIds.has(pid) ? withExamRecords(es, dept.ris) : es);
  // What the billing APIs get for one patient: the record as it stands, with the insurance 医事課 registered.
  const claimPayloadOf = (p: Patient) => {
    const c = charts[p.id];
    return patientMonthPayload(p, withRis(p.id, currentEntries(p, c ? { added: c.added, stopped: c.stopped, stopTimes: c.stopTimes, stopDays: c.stopDays, extended: c.extended, notes: notes[p.id], revised: revised[p.id] } : undefined)), diagnoses[p.id] ?? [], billing[p.id] ?? DEFAULT_OPTIONS, { diets, letters: lettersOf(p.id), notGiven: notGivenOf(p.id), insulinGiven: insulinGivenForBilling(mar, p.id), insuranceHistory: insuranceRecords(iji.insurance, p.id).map(r => r.insurance), insurance: currentInsurance(iji.insurance, p.id) });
  };
  // 指導の記録: kept, answers the open 指導の依頼, goes into the chart as the writer's note, and for an
  // eligible 栄養食事指導 within the fee schedule's limits (週1回・入院中2回) goes to the claim.
  const recordGuidance = (pid: string, r: GuidanceInput, fromPharmacy = false) => {
    // Billed only when the 管理栄養士 gave it on the doctor's request (医師の指示に基づき, B001 10 注1), within
    // the limits counted over the earlier billed ones (週1回・入院中2回) and the minutes (初回30・2回目20).
    let billed = false;
    if (r.kind === "栄養食事指導" && me.role === "管理栄養士" && r.answers.length > 0 && r.eligible && r.eligible !== "対象外（算定しない）") {
      const earlier = guidance.filter((g) => g.patientId === pid && g.kind === "栄養食事指導" && g.billed).map((g) => g.at.day);
      const dow = (d: number) => new Date(Date.UTC(today.y, today.m - 1, today.d + d)).getUTCDay();
      billed = !nutritionCountNote(earlier, 0, dow) && !nutritionTimeNote(r.minutes, earlier.length);
      if (billed) setBilling((all) => ({ ...all, [pid]: { ...(all[pid] ?? DEFAULT_OPTIONS), eiyoShido: [...((all[pid] ?? DEFAULT_OPTIONS).eiyoShido ?? []), { day: 0 }] } }));
    }
    const rec: GuidanceRecord = { ...r, id: newId(), patientId: pid, by: me.name, at: { day: 0, time: nowTime }, billed };
    setGuidance((all) => [...all, rec]);
    const n: NoteEntry = { kind: "note", id: newId(), day: 0, time: nowTime, author: me.name, role: me.role, text: guidanceNoteText(rec) };
    setNotes((all) => ({ ...all, [pid]: [...(all[pid] ?? []), n] }));
    if (!fromPharmacy) auditLog({ role: me.role, actor: me.name, action: `確定（${r.kind}の記録）`, patient: findPatient(pid)?.name, detail: `${r.heard}・${r.minutes ?? "？"}分${r.answers.length ? `・依頼 ${r.answers.length}件を済みに` : ""}` });
  };

  const addStopDraft = (entry: OrderEntry, source = "（カレンダーから）", day = 0, stopTime?: string) => {
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
      effectiveDay: day,
      stopTime,
      drugCode,
      ...(procCode ? { procCode } : {}),
      said: o.type === "procedure" ? procedureTitle(o) : anyDrugName(drugCode!),
      targetOrderId: entry.id,
    };
    update((c) => ({ drafts: [...c.drafts.filter(d => !(d.kind === "stop" && d.targetOrderId === entry.id)), draft], flash: entry.order.type === "injection" ? null : "記事の下の処方オーダの下書きに入りました" }));
  };
  // 延長 and 修正 from the injection calendar (left view or the right tab).
  const extendDraft = (e: OrderEntry, n: number) => {
    const draft: ExtendDraft = expiryExtension(e, n, newId());
    update((c) => ({ drafts: [...c.drafts.filter((d) => !(d.kind === "extend" && d.targetOrderId === e.id)), draft], flash: e.order.type === "prescription" ? "記事の下の処方オーダの下書きに入りました" : `延長の下書きを作りました（${n}日）。記事の下で確かめて確定してください。` }));
  };
  const modifyOrder = (e: OrderEntry, change?: InjectionChange) => {
    if (!patient || deny("order")) return;
    if (change) {
      const draft = injectionRateDraft(e, change, newId());
      update(c => ({ drafts: [...c.drafts.filter(d => !(d.kind === "injection" && d.duplicate?.orderId === e.id)), draft] }));
      return;
    }
    if (e.order.type !== "injection") {
      const change = calendarChange(e, patient.id, newId()); if (!change) return;
      addStopDraft(e, "（カレンダーから変更）");
      if (change.kind === "rx") { update({ rxSeed: { key: newId(), pattern: change.pattern } }); openOrder("add-rx"); }
      else { addManualLab(change.draft); openRight("note"); }
      return;
    }
    addStopDraft(e, "（カレンダーから修正）");
    const order = e.order;
    update({
      injSeed: { key: newId(), order },
      flash: "前のオーダの中止の下書きを入れ、同じ内容を注射のウインドウに写しました。直して下書きにし、まとめて確定してください。",
    });
    openOrder("add-injection");
  };
  const toggleDose = (e: OrderEntry, at: number) => update(c => {
    const draft = toggleInjectionDose(e, at, abs(0, nowTime), c.drafts.filter((d): d is InjectionDraft => d.kind === "injection"), newId());
    return { drafts: [...c.drafts.filter(d => !(d.kind === "injection" && d.duplicate?.orderId === e.id && d.sourceText === "（カレンダーから回を取り消し）")), ...(draft ? [draft] : [])] };
  });
  const pendingExtends: Record<string, number> = Object.fromEntries(chart.drafts.flatMap((d) => (d.kind === "extend" ? [[d.targetOrderId, d.addDays]] : [])));
  const toFront = (t: RightTab) => setZOrder((z) => [...z.filter((x) => x !== t), t]);
  const openRight = (t: RightTab) => {
    // The injection calendar and the reading tabs open in their own large window (where this browser last had it), not in the right column.
    // Always as a window, even when this browser docked it to the right column before (ユーザー 2026-11-06：「指示簿は基本新しいウインドウで」).
    const win = WINDOW_TABS.has(t) && !floating[t] ? (keptWin(t, window.innerWidth, window.innerHeight) ?? bigWin(window.innerWidth, window.innerHeight, t)) : undefined;
    if (win) setFloating((f) => ({ ...f, [t]: win }));
    const away = !!floating[t] || !!win;
    update((c) => ({ openTabs: t === "note" || c.openTabs.includes(t) ? c.openTabs : [...c.openTabs, t], rightTab: away ? c.rightTab : t }));
    if (away) toFront(t);
  };
  // The calendar sends the start and optional Do order to the injection entry window.
  const newInjection = (start: InjStart, from?: InjectionOrder) => {
    update({
      injSeed: { key: newId(), order: from, start },
      flash: from ? "同じ内容を注射のウインドウに写しました（Do）。開始日を確かめ、下書きにしてください。" : "開始の日時を注射のウインドウに入れました。薬を選んで下書きにし、記事の下で確定してください。",
    });
    // The injection form itself puts the focus on the Rp that took the start (the first box would be the wrong Rp when Rp1 is filled).
    openOrder("add-injection");
  };
  const pendingNewInj = chart.drafts.filter((d): d is InjectionDraft => d.kind === "injection");

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
      update({ injSeed: { key: newId(), order: o }, flash: "同じ注射を注射のウインドウに写しました（Do）。直して下書きにしてください。" });
      openOrder("add-injection");
    } else if (o.type === "prescription") {
      const rp = o.rp;
      const same = entries.filter((x): x is OrderEntry => x.kind === "order" && x.order.type === "prescription" && (rp ? x.order.rp === rp && x.day === e.day && x.time === e.time && x.author === e.author && x.status !== "中止" : x.id === e.id));
      const [pattern] = previousOf(patient.id, same.map((x) => (x.order.type === "prescription" && x.order.category === "持参薬" ? { ...x, order: { ...x.order, category: "定期" as const } } : x)));
      if (!pattern) return;
      update({ rxSeed: { key: newId(), pattern }, flash: "同じ処方を内服のウインドウに写しました（Do）。日数などを確かめて下書きにしてください。" });
      openOrder("add-rx");
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

  const sessionChanges = Object.fromEntries(Object.entries(charts).filter(([k]) => !k.includes("|")).map(([id, c]) => [id, { added: c.added, stopped: c.stopped, stopTimes: c.stopTimes, stopDays: c.stopDays, extended: c.extended, notes: notes[id], revised: revised[id] }]));
  const examPeople = [...patientById.values()].map((p) => ({ patient: p, room: (() => { const b = allBeds.find((b) => b.patientId === p.id); return b ? roomLabel(b.room, b.bed) : p.room; })(), entries: currentEntries(p, sessionChanges[p.id]).filter((e): e is OrderEntry => e.kind === "order") }));
  // 注射の記憶: the doctor's own injections across patients (most used first) and this patient's previous ones (Do).
  const injMemory = patient
    ? {
        patterns: injPatternsOf([...PAST_INJ, ...allPatients.flatMap((x) => currentEntries(x, sessionChanges[x.id]).flatMap((entry) => (entry.kind === "order" && entry.author === me.name ? [{ patientId: x.id, entry }] : [])))]),
        previous: injPreviousOf(patient.id, entries.filter((x): x is OrderEntry => x.kind === "order")),
      }
    : undefined;
  // Our patients with their bed and the record as it stands now (for the worksheet and the list).
  // Patients discharged in this session, with the bed they had (for 退院時の薬 and the 退院支援の一覧).
  const dischargedPeople: WorkPatient[] = allPatients.flatMap((p) => {
    if (!discharged[p.id] || !teamIds.has(p.id)) return [];
    const b = [...BEDS_WITH_CHARTS, ...newBeds].find((x) => x.patientId === p.id);
    const at = moves[p.id] ?? b;
    return [{ patient: p, room: at ? roomLabel(at.room, at.bed) : p.room, entries: currentEntries(p, sessionChanges[p.id]).filter((e): e is OrderEntry => e.kind === "order") }];
  });
  // Only the team's: the other teams' charts open from the lists, but do not fill the worksheet or やること.
  const people: WorkPatient[] = ward.beds.flatMap((b) => {
    const p = b.patientId && teamIds.has(b.patientId) ? findPatient(b.patientId) : undefined;
    if (!p) return [];
    const entries = currentEntries(p, sessionChanges[p.id]).filter((e): e is OrderEntry => e.kind === "order");
    // 再採血 sent back by the laboratory are drawn again by the ward (worksheet, labels, 照合).
    return [{ patient: p, icu, room: roomLabel(b.room, b.bed), entries: withRedraws(entries, labDesk, p.id) }];
  });

  // 指示受けがまだ: this session's new orders and stops that no nurse has taken yet.
  // 延長, 食事 and 指示簿の行 changes made in this session wait for 指示受け too.
  const others = [
    ...otherChanges(
    people,
    extendLog,
    diets
      .filter((d) => !initialDietIds.has(d.id))
      .map((d) => ({ id: d.id, patientId: d.patientId, at: d.at, by: d.by, label: dietLabel(d), from: `${d.from.day === 0 ? "今日" : d.from.day === 1 ? "明日" : "明後日"}の${d.from.meal}食から` })),
      -1440,
      abs(0, nowTime),
    ),
    ...lineChanges(people, standingTakeLines(standing, standingLines), INITIAL_LINE_IDS, -1440, abs(0, nowTime), (d) => formatShort(addDays(today, d))),
  ].sort((a, b) => a.at - b.at || a.room.localeCompare(b.room));
  const sessionKeys = new Set([...sessionChangeKeys(sessionChanges), ...others.map((c) => c.key), ...redrawChangeKeys(labDesk), ...(scenario ? SCENARIOS.nursing.pendingKeys : [])]);
  const waiting: Record<string, number> = {};
  for (const c of [...orderChanges(people, -1440, abs(0, nowTime)), ...others]) {
    if (sessionKeys.has(c.key) && !taken[c.key]) waiting[c.patientId] = (waiting[c.patientId] ?? 0) + 1;
  }

  // Results per patient on the ward: what the doctor has not seen, and panic values not yet phoned in.
  // 病理・生理 reports are read and marked like the other results.
  // 病理・生理・内視鏡 reports are read and marked like the other results.
  const deptResults = [...dept.results, ...care.results];
  const wardResults = [...people.flatMap((x) => resultsOf(x.patient, PANIC_LIMITS)), ...deptResults.filter((i) => people.some((x) => x.patient.id === i.patientId))];
  // 内視鏡室・給食・チーム医療・病理 work for every inpatient (all wards), worked out only while one of them is open.
  const everyone = screen === "endo" || screen === "kitchen" || screen === "teams" || screen === "path" || screen === "rehab" || role === "療法士" ? bedPeople(allBeds, findPatient, (p) => currentEntries(p, sessionChanges[p.id])) : [];
  // 救急外来・外来 visits with lab orders: the laboratory takes in and results their samples too.
  const labVisits: WorkPatient[] = visitPatientsAll
    .map((x) => ({ ...x, entries: withRedraws(currentEntries(x.patient, sessionChanges[x.patient.id]).filter((e): e is OrderEntry => e.kind === "order"), labDesk, x.patient.id) }))
    .filter((x) => x.entries.length > 0);
  const labItems = [...wardResults, ...labVisits.flatMap((x) => resultsOf(x.patient, PANIC_LIMITS))];
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
  // A mark of a list, a card's menu, a worksheet row: the chart, then its tool after the switch render (it closes the previous patient's windows; a reading tab opens as its window).
  const openAt = (id: string, where?: OpenAt) => { if (where === "execute") return goWard("execute"); openPatient(id); if (where) setTimeout(() => { if (where !== "rxcal" && where !== "flowsheet") return setPanel(where); setFloating((f) => (f[where] ? f : { ...f, [where]: keptWin(where, window.innerWidth, window.innerHeight) ?? bigWin(window.innerWidth, window.innerHeight, where) })); updateFor(id, (c) => ({ openTabs: c.openTabs.includes(where) ? c.openTabs : [...c.openTabs, where] })); toFront(where); }, 0); };
  const openArea = (k: AreaKey) => {
    setPharmacyFocus(null);
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
  // Closing a screen tab keeps the charts opened from it: they move under another open patient list (or
  // stay as they are when none is open; opening one brings its screen back).
  const closeWardTab = (t: WardTab) => {
    const o = wardOwner(t);
    const rest = wardTabs.filter((x) => x !== t);
    const i = wardTabs.indexOf(t);
    const nextTab = rest[Math.min(i, rest.length - 1)];
    const home = rest.find((x) => wardTabInfo(x).group === "patients") ?? nextTab;
    setWardTabs(rest);
    if (home) setPatientTabs((ts) => ts.map((x) => (x.owner === o ? { ...x, owner: wardOwner(home) } : x)));
    setFront((f) => ({ ...f, [o]: undefined }));
    if (newTabFor === o) setNewTabFor(null);
    if (wardTab === t) setWardTab(nextTab ?? "menu");
  };
  // ⌄ on a patient view: the tab becomes the chosen view where it is (or, when that one is open, it is shown).
  const swapWardView = (from: WardTab, to: WardTab) => {
    if (from === to) return;
    if (!wardTabs.includes(to)) {
      setWardTabs((ts) => ts.map((t) => (t === from ? to : t)));
      setPatientTabs((ts) => ts.map((x) => (x.owner === wardOwner(from) ? { ...x, owner: wardOwner(to) } : x)));
    }
    show(wardOwner(to), undefined);
  };
  const toggleDefault = (t: WardTab) =>
    setWardDefaults((all) => {
      const cur = defaultsOf(all, role);
      const next = { ...all, [role]: cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t] };
      saveWardDefaults(next);
      return next;
    });
  // The lists of 病棟: 入院患者一覧 (全病棟, or one ward with its empty beds and today's and tomorrow's
  // admissions and discharges) and 受け持ち. The map and the journal show one floor (5階東 at first).
  const floorInfo: Floor = FLOORS.find((f) => f.name === floor) ?? FLOORS[0];
  // 受け持ち (it stands out on the list and the map): a doctor's own patients (主治医のチーム・担当医・コンサルト医), else the team's.
  const isMine = (pid: string) => (role === "医師" ? involved(me.name, doctorsFor(pid, findPatient(pid) ? currentEntries(findPatient(pid)!, sessionChanges[pid]) : [])) : teamIds.has(pid));
  // 主治医・担当医・コンサルト医 of a patient as the record stands (a consult order not yet answered adds the asked doctor as 依頼中).
  const doctorsFor = (pid: string, es: HistoryEntry[]) => doctorsOf(findPatient(pid)?.attending ?? "", doctorBook[pid], consultDoctors(es, consultReplies));
  // Any patient on a bed with the record as it stands (the team's from `people`; another team's opened from a list).
  const workOf = (pid: string): WorkPatient | undefined => {
    const x = people.find((y) => y.patient.id === pid);
    const p = x ? undefined : findPatient(pid);
    const b = p && allBeds.find((y) => y.patientId === pid);
    return x ?? (p && b ? { patient: p, room: roomLabel(b.room, b.bed), entries: withRedraws(currentEntries(p, sessionChanges[pid]).filter((e): e is OrderEntry => e.kind === "order"), labDesk, pid) } : undefined);
  };
  const bedsOn = (name: string) => allBeds.filter((b) => floorOf(b.room) === name);
  // 病棟マップ・入院患者一覧 of one ward on the day chosen (ward-asof.ts): today as it stands, a later day from the plans, a past day from the record.
  const asOfPlans = { admissions: admissionPlans(WARD_PLANS, requests), discharges: dischargePlans(everBeds, findPatient, (p) => currentEntries(p, sessionChanges[p.id])) };
  const asOfOn = (name: string): WardAsOf => {
    const floors = name === ALL_WARDS ? FLOORS : FLOORS.filter((f) => f.name === name);
    return bedsAsOf(asOfDay, { beds: everBeds.filter((b) => floors.some((f) => f.name === floorOf(b.room))), rooms: floors.flatMap((f) => f.rooms), floors: floors.map((f) => f.name), patient: findPatient, ...asOfPlans });
  };
  const dayNavFor = (asOf: WardAsOf): DayNavProps => ({ day: asOfDay, ...dayRange(asOf), onChange: setAsOfDay, fmtDay: (d) => formatShort(addDays(today, d)), counts: { admit: asOf.counts.admit, discharge: asOf.counts.discharge } });
  const mapAsOf = asOfOn(floor);
  // Every patient of the floor shown, by room (状態の一括登録・業務分担・バイタルの一括入力).
  const floorPeople = bedsOn(floor)
    .flatMap((b) => {
      const p = b.patientId ? findPatient(b.patientId) : undefined;
      return p ? [{ id: p.id, name: p.name, room: roomLabel(b.room, b.bed), infections: p.infections, rescue: bedInfo[p.id]?.rescue, patient: p }] : [];
    })
    .sort((a, b) => a.room.localeCompare(b.room));
  // 業務分担 of the shift going on now (5階東 has the 勤務表), for the map's rooms.
  const shiftNow = currentShift(nowTime);
  const planNow = nm.assignBook[assignKey(WARD_NAME, shiftNow.day, shiftNow.shift)];
  const floorPick: Pick = { label: "階", value: floor, options: FLOORS.map((f) => ({ value: f.name, label: f.name })), onChange: setFloor };
  const listPick: Pick = { label: "病棟", value: listWard, options: [{ value: ALL_WARDS, label: "全病棟" }, ...FLOORS.map((f) => ({ value: f.name, label: f.name }))], onChange: setListWard };
  const allWards = listWard === ALL_WARDS;
  const lists: Record<(typeof LIST_TABS)[number], { beds: BedAssignment[]; title: string; pick?: Pick; group: GroupBy; floor?: Floor }> = {
    // 入院患者一覧: every ward grouped by ward, or the ward chosen by room (with its empty beds and 入退院).
    all: allWards
      ? { beds: allBeds, title: "入院患者一覧", pick: listPick, group: "floor" }
      : { beds: bedsOn(listWard), title: "入院患者一覧", pick: listPick, group: "room", floor: FLOORS.find((f) => f.name === listWard) },
    // 受け持ち: a doctor's own patients (主治医); a nurse's team for this shift; others the whole ward.
    mine:
      role === "医師"
        ? { beds: ward.beds.filter((b) => b.patientId && isMine(b.patientId)), title: "受け持ち患者（主治医・担当医・コンサルト医）", group: "room" }
        : role === "看護師"
          ? {
              // Teams are 5階東's: a patient moved to another floor is in neither team (shown under すべて).
              beds: ward.beds.filter((b) => b.patientId && teamIds.has(b.patientId) && (!myTeam || (floorOf(b.room) === WARD_NAME && teamOf(b.room) === myTeam))),
              title: "受け持ち患者",
              group: "room",
              pick: {
                label: "チーム",
                value: myTeam,
                options: [
                  { value: "", label: "5階東すべて" },
                  { value: "A", label: "A チーム（501〜508）" },
                  { value: "B", label: "B チーム（510〜516）" },
                ],
                onChange: setMyTeam,
              },
            }
          : { beds: ward.beds.filter((b) => b.patientId && teamIds.has(b.patientId)), title: "受け持ち患者", group: "room" },
  };
  const listKey = LIST_TABS.find((k) => k === screen);
  // A list of one ward moves over the days like the map (全病棟 and the team's lists stay on today).
  const listFloor = listKey ? lists[listKey].floor : undefined;
  const listAsOf = listFloor && listFloor.name !== ALL_WARDS ? asOfOn(listFloor.name) : null;
  // 水分出納: typed IN/OUT (who and when are added by code), and taking one back with a reason (it stays).
  const addIo = (es: IoEntry[]) => {
    for (const e of es) auditLog({ role: me.role, actor: me.name, action: "確定（水分出納）", patient: findPatient(e.patientId)?.name, detail: `${e.side} ${e.kind} ${e.ml}mL（${clockText(e.at)}）${e.note ? `　${e.note}` : ""}` });
    setIo((all) => [...all, ...es]);
  };
  const voidIo = (id: string, reason: string) => {
    const e = io.find((x) => x.id === id);
    auditLog({ role: me.role, actor: me.name, action: "水分出納の記録を取り消した", patient: e ? findPatient(e.patientId)?.name : undefined, detail: e ? `${e.side} ${e.kind} ${e.ml}mL　${e.by} の記録　理由：${reason}` : reason });
    setIo((all) => all.map((x) => (x.id === id ? { ...x, voided: { by: me.name, at: nowTime, reason } } : x)));
  };
  // やること: what waits for this role, from everywhere, each with where to go.
  const consultPeople = bedPeople(allBeds, findPatient, (p) => currentEntries(p, sessionChanges[p.id]));
  const inbox = consultInbox(consultPeople, me.name, consultReplies);
  const kitchenPending = kitchenWaiting(diets, care.kitchen);
  const requestDisease = (pid: string, c: DiseaseCandidate) => { const p = findPatient(pid); if (!p || deny("billing")) return; setStickies(all => ({ ...all, [pid]: withDiseaseRequest(all[pid] ?? [], c, p.attending, me.name, nowTime, isoDate(today)) })); };
  const expiryNotice = <RxExpiryNotice people={people} today={today} sender={me.name.includes(role) ? me.name : `${role} ${me.name}`} stickies={stickies} onSend={(pid, st) => setStickies(all => ({ ...all, [pid]: [...(all[pid] ?? []).filter(s => s.id !== st.id), st] }))} />;
  const todos: Todo[] = [];
  const expiryPatients = expiryInbox(consultPeople, today, stickies, (p, es) => receivesExpiry(me.name, doctorsFor(p.id, es)));
  const expiryN = expiryCounts(expiryPatients);
  if (role === "医師" && expiryN.total) todos.push({ key: "rx-expiry", label: `処方切れ（今日 ${expiryN.today}・明日 ${expiryN.tomorrow}）`, detail: expiryPatients.flatMap(x => x.messages).join("、"), count: expiryN.total, tone: expiryN.today ? "shu" : "yamabuki", go: () => setExpiryOpen(true) });
  if (role === "薬剤師" && orderUnlocks.requests.length) todos.push({ key: "order-unlocks", label: "処方のロック解除の依頼", count: orderUnlocks.requests.length, tone: "yamabuki", go: () => openArea("pharmacy") });
  if (role === "医師") todos.push(...diseaseRequestTodos(allPatients, stickies, me.name, id => diseaseRequestInput(claimPayloadOf(findPatient(id)!), isoDate(today), nowTime), id => { openPatient(id); setTimeout(() => setPanel("diagnoses"), 0); }));
  if (role === "医師") todos.push(...vitalsContactTodos(callNotes).map((n) => ({ ...n, go: () => { if (n.patientId) { openPatient(n.patientId); updateFor(n.patientId, () => ({ leftView: "flowsheet", flowScale: "all" })); } } })));
  if (role === "管理栄養士" && kitchenPending) todos.push({ key: "kitchen", label: "給食の変更が未受け", count: kitchenPending, tone: "shu", go: () => openArea("kitchen") });
  if (!deny("consult")) todos.push(...consultNotifications(consultPeople, me.name, consultReplies).map(n => ({ ...n, tone: "shu" as const, go: () => { if (n.patientId) { openPatient(n.patientId); setPanel("add-consult"); } else goWard("consults"); } })));
  for (const x of people) {
    const pid = x.patient.id;
    const proposals = dietProposalCount(mergedChart(charts, pid, desk).drafts);
    if (role === "医師" && proposals) todos.push({ key: `diet-${pid}`, label: `食事の変更の提案：${x.patient.name}さん`, count: proposals, tone: "yamabuki", go: () => openPatient(pid) });
    const r = resultState[pid];
    if (!deny("result.ack") && r?.panic) todos.push({ key: `panic-${pid}`, label: `パニック値：${x.patient.name}さん`, detail: "対応を書いて確認する", count: r.panic, tone: "shu", go: () => openPatient(pid) });
    if (!deny("result.ack") && r && r.unseen > r.panic) todos.push({ key: `unseen-${pid}`, label: `未確認の結果：${x.patient.name}さん`, count: r.unseen - r.panic, tone: "ai", go: () => openPatient(pid) });
    const v = verbalUnsigned(x.entries).filter((e) => canReviewVerbal(e, me)).length;
    if (!deny("order.sign") && v) todos.push({ key: `verbal-${pid}`, label: `口頭指示の承認待ち：${x.patient.name}さん`, count: v, tone: "yamabuki", go: () => openPatient(pid) });
  }
  // 指示簿: the latest vitals against the call criteria, and versions no nurse has taken yet.
  const standingNow = (pid: string) => standingFromBlocks(standingLines[pid] ?? [], standing[pid]?.at(-1), 0, nowTime);
  const callsMet: Record<string, string[]> = Object.fromEntries(people.map((x) => [x.patient.id, callHits(standingNow(x.patient.id), x.patient.vitals.at(-1))]));
  // 条件付き指示: the latest lab and vital values against the doctor's conditions (code compares only).
  const condsAll = (pid: string) => condHits(pid, standingNow(pid)?.conds, findPatient(pid) ?? { labs: [], vitals: [] });
  const condsMet = Object.fromEntries(people.map((x) => [x.patient.id, openHits(condsAll(x.patient.id), condAcks)]));
  const standingFlags: Record<string, Flag[]> = Object.fromEntries(
    people.map((x) => {
      const pid = x.patient.id;
      const out: Flag[] = callsMet[pid].length ? [{ label: "医師を呼ぶ基準", tone: "shu", title: `指示簿の基準に当たる：${callsMet[pid].join("、")}` }] : [];
      if (condsMet[pid].length) out.push({ label: `条件付き指示 ${condsMet[pid].length}`, tone: "shu", title: condsMet[pid].map((h) => h.text).join("、") });
      const pa = activePath(paths, pid);
      if (pa) out.push({ label: `パス ${pathDayOf(pa, 0)}日目`, tone: "ai", title: `${findPath(pa.code)?.name ?? ""}（標準 ${findPath(pa.code)?.length ?? "?"}日）` });
      if (standingNow(pid) && standingPending(pid, others, taken, !!standingNow(pid)!.taken)) out.push({ label: "指示簿 指示受けがまだ", tone: "yamabuki", title: "指示簿が変わりました" });
      out.push(...leaveFlags(x.entries));
      const rs = activeOf(restraints, pid);
      if (rs) out.push({ label: `身体的拘束中 ${durationText(minutesOf(rs, abs(0, nowTime)))}`, tone: "shu", title: `${rs.devices.join("・")}　${reviewDue(rs, abs(0, nowTime))?.text ?? ""}` });
      return [pid, out];
    }),
  );
  // Marks on the patient lists: 指示簿 and 外泊 etc., and records of a 研修医 still waiting (for doctors).
  const listFlags: Record<string, Flag[]> = Object.fromEntries(
    allPatients.map((p) => {
      const n = role === "医師" ? pendingOf(cosign, p.id).length : 0;
      const lim = currentLimit(limits, p.id);
      const team = inCareTeam(me, p, myTeam);
      return [
        p.id,
        [
          ...(lim ? [{ label: "閲覧制限", tone: "fuji" as const, title: team ? "担当チームとして開けます。開いた記録は監査ログに残ります" : "担当チームのほかの人は、理由を残してから開きます" }] : []),
          // Another team's patient: 退院・外泊 from the orders (指示簿 is the team's).
          ...(standingFlags[p.id] ?? (teamIds.has(p.id) ? [] : leaveFlags(ordersOf(currentEntries(p, sessionChanges[p.id]))))),
          ...(n ? [{ label: `指導医の確認待ち ${n}`, tone: "yamabuki" as const, title: "研修医が書いた記事・オーダで、指導医か上級医の確認がまだのもの" }] : []),
        ],
      ];
    }),
  );
  // The 移動 row of the 移動・食事 calendar: admission, booked and done moves, discharge and leave.
  const moveEventsOf = (pid: string): MoveEvent[] => {
    const p = findPatient(pid);
    const es = (workOf(pid)?.entries ?? []).filter((e) => e.status === "有効" && e.order.type === "procedure");
    return [
      ...(p ? [{ day: p.admittedOn, time: null, label: "入院", tone: "ink" as const }] : []),
      ...es.flatMap((e): MoveEvent[] => {
        const o = e.order;
        if (o.type !== "procedure") return [];
        if (o.move) return [{ day: o.start.day, time: o.start.time ?? null, label: [moveText(o.move), moveConflict(pid, o, allBeds, allPatients, Object.fromEntries(allPatients.map(p => [p.id, workOf(p.id)?.entries ?? []])))].filter(Boolean).join("・"), tone: "ai", entryId: e.id, done: !!movesDone[e.id] }];
        if (o.leave) return [{ day: o.leave.from.day, time: o.leave.from.time, label: `${o.leave.kind}（${o.leave.destination}）`, tone: o.leave.kind === "退院" ? "wakatake" : "yamabuki", ...(o.leave.kind === "退院" ? { entryId: e.id, done: !!discharged[pid] } : {}) }, ...(o.leave.back ? [{ day: o.leave.back.day, time: o.leave.back.time, label: `${o.leave.kind}から帰院`, tone: "yamabuki" as const }] : [])];
        return [];
      }),
      ...moveLog.filter((m) => m.patientId === pid).map((m) => ({ day: 0, time: m.time, label: m.label, tone: "ai" as const, done: true })),
    ];
  };
  // 実施: carry out a booked move now (the bed is checked again: still empty, the room's sex).
  const doMove = (entryId: string, administration?: AdminRecord) => {
    if (movesDone[entryId]) return true;
    if (deny("bed.move")) return;
    const x = people.find((y) => y.entries.some((e) => e.id === entryId)) ?? (activeId ? workOf(activeId) : undefined);
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
      setIcu(all => stayOnMove(all, pid, x.patient.ward, floorOf(to.room), { day: 0, time: nowTime }));
      setMoves((all) => ({ ...all, [pid]: to }));
    }
    auditLog({ role: me.role, actor: me.name, action: `確定（${m.kind}の実施）`, patient: x.patient.name, detail: moveText(m) });
    setMovesDone((all) => ({ ...all, [entryId]: nowTime }));
    const record = moveAdministration(e, pid, nowTime, me.name, administration);
    setMar(all => ({ ...all, [record.key]: record }));
    updateFor(pid, (c) => ({ note: `${c.note.replace(/\s*$/, "")}\n・${m.kind}を実施（${nowTime}）：${moveText(m)}\n` }));
    return true;
  };
  const openStanding = (pid: string) => {
    openPatient(pid);
    setPanel("standing");
  };
  // 退院時の一括中止: what still runs (by group), and the groups the doctor confirmed, stopped now.
  const stopGroupsOf = (pid: string) => {
    const p = findPatient(pid);
    return p ? remainingGroups(ordersOf(currentEntries(p, sessionChanges[pid])), abs(0, nowTime), standingNow(pid)) : [];
  };
  const stopAtDischarge = (pid: string, keys: StopGroupKey[]) => {
    if (deny("order")) return;
    const r = chosenStops(stopGroupsOf(pid), keys);
    const infusionIds = new Set(r.groups.flatMap(g => g.entries.flatMap(e => e.order.type === "injection" && e.order.continuous ? [e.order.continuous.infusionId] : [])));
    if (infusionIds.size) setIcu(all => ({ ...all, infusions: all.infusions.map(inf => infusionIds.has(inf.id) ? { ...inf, end: { day: 0, time: nowTime } } : inf) }));
    const what = (g: (typeof r.groups)[number]) => (g.key === "指示簿" ? "指示簿を終了" : g.entries.map((e) => orderLines(e.order, today).main).join("、"));
    for (const g of r.groups) auditLog({ role: me.role, actor: me.name, action: "確定（退院時の一括中止）", patient: findPatient(pid)?.name, detail: `${g.key}：${what(g)}`.slice(0, 200) });
    if (r.standing) setStandingLines(all => ({ ...all, [pid]: endStandingBlocks(all[pid] ?? [], me.name, 0, nowTime) }));
    if (r.standing) setStanding((all) => ({ ...all, [pid]: [...(all[pid] ?? []), endedStanding(me.name, { day: 0, time: nowTime })] }));
    if (resident) setCosign((all) => [...all, ...newItems({ patientId: pid, by: me.name, at: { day: 0, time: nowTime } }, r.groups.flatMap((g) => g.entries.map((e) => ({ ref: `stop:${e.id}`, kind: "中止" as const, text: `${orderLines(e.order, today).main} 中止（退院時の一括中止）` }))), newId)]);
    updateFor(pid, (c) => ({
      stopped: [...c.stopped, ...r.ids.filter((id) => !c.stopped.includes(id))],
      stopTimes: { ...c.stopTimes, ...Object.fromEntries(r.ids.map((id) => [id, nowTime])) },
      note: `${c.note.replace(/\s*$/, "")}\n${r.groups.map((g) => `・退院のため一括中止（${g.key}）：${what(g)}`).join("\n")}\n`,
      flash: `退院時の一括中止：${r.ids.length}件のオーダを中止しました${r.standing ? "（指示簿も終了）" : ""}。看護師の指示受けに入ります。`,
    }));
  };
  if (role === "医師")
    for (const x of dischargedPeople) {
      const n = stopGroupsOf(x.patient.id).length;
      if (n) todos.push({ key: `dc-stop-${x.patient.id}`, label: `退院した患者に有効な指示が残っている：${x.patient.name}さん`, detail: stopGroupsOf(x.patient.id).map((g) => g.key).join("・"), count: n, tone: "yamabuki", go: () => (openPatient(x.patient.id), setPanel("discharge-stop")) });
    }
  const { addStandingLine, stopStandingLine, bulkStopStandingLines } = standingLineActions({ lines: standingLines, setLines: setStandingLines, me, nowTime, fmtDay: (d) => formatShort(addDays(today, d)), patientName: (pid) => findPatient(pid)?.name, chartNote, blocked: !!deny("order"), draftNote: (pid, text) => updateFor(pid, (c) => ({ note: `${c.note.replace(/\s*$/, "")}\n・${text}\n` })) });
  for (const x of people) {
    const pid = x.patient.id;
    if (callsMet[pid].length && (role === "看護師" || role === "医師")) todos.push({ key: `call-${pid}`, label: `医師を呼ぶ基準に当たる：${x.patient.name}さん`, detail: callsMet[pid].join("、"), count: callsMet[pid].length, tone: "shu", go: () => openStanding(pid) });
    if (condsMet[pid].length && (role === "看護師" || role === "医師")) todos.push({ key: `cond-${pid}`, label: `条件付き指示に当たる：${x.patient.name}さん`, detail: condsMet[pid].map((h) => h.text).join("、"), count: condsMet[pid].length, tone: "shu", go: () => openStanding(pid) });
    // クリティカルパス: outcomes due by today that this profession evaluates.
    const pa = activePath(paths, pid);
    const pathDue = pa && (role === "看護師" || role === "医師") ? dueOutcomes(paths, pa, pathDayOf(pa, 0), role as PathWho) : [];
    if (pathDue.length) todos.push({ key: `path-${pid}`, label: `パスのアウトカムの評価：${x.patient.name}さん（${findPath(pa!.code)?.name} ${pathDayOf(pa!, 0)}日目）`, detail: pathDue.map((d) => d.outcome.text).join("、"), count: pathDue.length, tone: "yamabuki", go: () => (openPatient(pid), setPanel("path")) });
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
    if (role === "看護師" && standingNow(pid) && standingPending(pid, others, taken, !!standingNow(pid)!.taken)) todos.push({ key: `standing-${pid}`, label: `指示簿の指示受けがまだ：${x.patient.name}さん`, count: 1, tone: "yamabuki", go: () => openStanding(pid) });
    // 看護計画: evaluations due today or late (the day after midnight counts as the next day).
    const planDay = Math.floor(abs(0, nowTime) / 1440);
    if (role === "看護師") for (const np of dueEvaluations(nursingPlans, [pid], planDay)) todos.push({ key: `nplan-${np.id}`, label: `看護計画の評価：${x.patient.name}さん ${problemTitle(np)}`, detail: evalStatus(np, planDay)?.text, count: 1, tone: evalStatus(np, planDay)?.late ? "shu" : "yamabuki", go: () => (openPatient(pid), setPanel("nursing-plan")) });
    for (const m of role === "看護師" ? ioMissing([{ id: pid, io: standingNow(pid)?.io }], io, abs(0, nowTime)) : []) todos.push({ key: `io-${pid}`, label: `水分出納の記録がまだ：${x.patient.name}さん`, detail: `指示簿「${standingNow(pid)?.io}」・${windowText(m.shift)}に入れた IN/OUT がありません`, count: 1, tone: "yamabuki", go: () => goWard("io") });
  }
  // 看護ケア・観察: tasks more than an hour past their time without a record.
  const careLateN = role === "看護師" && sessionStart !== null ? lateCare(careOrders, careRecords, people.map((x) => x.patient.id), sessionStart, abs(0, nowTime)).length : 0;
  if (careLateN) todos.push({ key: "care-late", label: "看護ケア・観察の記録がまだ（1時間を過ぎたもの）", detail: "ワークシートで記録する", count: careLateN, tone: "yamabuki", go: () => goWard("sheet") });
  // 未実施の一覧: 実施漏れ (nurses) and the records the claim reads differently (医事課).
  const undoneNow = undoneRows(people, mar, sessionStart ?? abs(0, nowTime), abs(0, nowTime));
  const gapsNow = billingGaps(people, mar, abs(0, nowTime));
  if (role === "看護師" && undoneNow.length) todos.push({ key: "undone", label: "実施の記録がないまま時刻を過ぎたもの", detail: "未実施の一覧で確かめる", count: undoneNow.length, tone: "shu", go: () => goWard("undone") });
  if (role === "医事課" && undoneNow.length + gapsNow.length) todos.push({ key: "undone", label: "未実施・算定と記録の食い違い", detail: `実施の記録なし ${undoneNow.length}件・食い違い ${gapsNow.length}件`, count: undoneNow.length + gapsNow.length, tone: "yamabuki", go: () => goWard("undone") });
  // 退院サマリ: summaries this doctor may approve, and the team's discharged patients without one yet (charts only).
  const summaryNow = summaryRows(allPatients, discharges, PAST_SUMMARIES);
  const toApprove = role === "医師" ? summaryNow.filter((r) => r.chart && r.state === "承認待ち" && !approveDeny(me.name, r.record, r.attending)) : [];
  const toWrite = role === "医師" ? summaryNow.filter((r) => r.chart && ["未作成", "作成中", "差し戻し"].includes(r.state) && onTeamOf(me.name, r.attending)) : [];
  if (toApprove.length) todos.push({ key: "summary-approve", label: "退院サマリの承認待ち", detail: toApprove.map((r) => `${r.name}さん`).join("、"), count: toApprove.length, tone: "ai", go: () => goWard("summaries") });
  if (toWrite.length) todos.push({ key: "summary-write", label: "退院サマリがまだ（退院した患者）", detail: toWrite.map((r) => `${r.name}さん ${r.state}${r.left !== null && r.left < 0 ? "・期限切れ" : `・あと${r.left}日`}`).join("、"), count: toWrite.length, tone: toWrite.some((r) => r.late) ? "shu" : "yamabuki", go: () => goWard("summaries") });
  // 指示受け rows of the ward (for the doctor's view, the handoff and the todo).
  const allTakeRows = markStandingTake(takeRows([...orderChanges(people, -1440, abs(0, nowTime)), ...others], people, today), cosign);
  const isRowTaken = (r: TakeRow) => r.keys.every((k) => !sessionKeys.has(k) || !!taken[k]);
  // The tab's badge and 「やること」 count today's untaken rows, as the 指示受け screen lists them (other days: 「ほかの日に N件」).
  const takeWaitingRows = waitingToday(allTakeRows, people, isRowTaken);
  const takeWaiting = takeWaitingRows.length;
  // 看護ケアの記録・与薬の記録・指示受け: the worksheet and the cells of the flow sheet record through these.
  const recordCare = (r: CareRecord) => {
    const o = careOrders.find((x) => x.id === r.orderId);
    auditLog({ role: me.role, actor: me.name, action: r.status === "実施" ? "確定（看護ケアの実施）" : "確定（看護ケアの未実施）", patient: findPatient(r.patientId)?.name, detail: `${o?.item ?? r.orderId}　${r.doneAt}${r.value ? `　${r.value}${o?.unit ?? ""}` : ""}${r.reason ? `　${r.reason}` : ""}` });
    setCareRecords((all) => [...all, r]);
  };
  const voidCareRecord = (r: CareRecord, reason: string) => {
    auditLog({ role: me.role, actor: me.name, action: `看護ケアの${r.status}の記録を取り消した`, patient: findPatient(r.patientId)?.name, detail: `${careOrders.find((x) => x.id === r.orderId)?.item ?? r.orderId}　${r.doneAt} ${r.by} の記録　理由：${reason}` });
    setCareRecords((all) => voidCare(all, r.key, me.name, nowTime, reason));
  };
  const takeOrders = (keys: string[], second?: string) => {
    // Who took which change, and when (shown on the worksheet and in the audit log).
    const what = [...orderChanges(people, -1440, abs(0, nowTime)), ...others]
      .filter((c) => keys.includes(c.key))
      .map((c) => `${c.name}：${c.kind} ${"entry" in c ? orderLines(c.entry.order, today).main : c.text.main}`);
    auditLog({ role: me.role, actor: me.name, action: second ? "指示受け（2人で確認）" : "指示受け", detail: `${keys.length}件　${what.join("／")}${second ? `　2人目：${second}` : ""}`.slice(0, 400) });
    setTaken((t) => ({ ...t, ...Object.fromEntries(keys.map((k) => [k, `${nowTime} ${me.name}${second ? `・確認 ${second}` : ""}`])) }));
  };
  const holdOrder = (key: string, reason: TakeHold["reason"], note: string) => {
    const r = allTakeRows.find((x) => x.key === key);
    auditLog({ role: me.role, actor: me.name, action: "指示受けを保留して医師に確認", patient: r?.name, detail: `${r?.main ?? key}　${reason}${note ? `：${note}` : ""}` });
    setTakeHolds((all) => ({ ...all, [key]: { by: me.name, at: nowTime, reason, note } }));
  };
  // 指示確認: the nurse looked at the doses and tasks the taken change makes for today and tomorrow.
  const takeCtx = { taken, isTaken: isRowTaken, holds: takeHolds, confirms: takeConfirms };
  const confirmOrder = (key: string) => {
    const r = allTakeRows.find((x) => x.key === key);
    auditLog({ role: me.role, actor: me.name, action: "指示確認（指示が作る予定を確かめた）", patient: r?.name, detail: `${r ? `${r.kind === "変更" ? "【変】" : r.kind} ${r.main}` : key}` });
    setTakeConfirms((all) => ({ ...all, [key]: `${nowTime} ${me.name}` }));
  };
  const takeNotConfirmed = unconfirmed(allTakeRows, takeCtx).length;
  const recordMar = (r: AdminRecord) => {
    const who = findPatient(r.patientId);
    const item = people.flatMap((x) => x.entries).find((e) => e.id === r.orderId);
    if (item?.order.type === "procedure" && item.order.code === "PROC-MOVE" && r.status === "実施") { doMove(item.id, r); return; }
    // 点滴 (2回実施): the 開始, the 終了 with what went in, or the 終了 taken back.
    const drip = dripAction(r, mar[r.key]);
    auditLog({
      // The record names who did it; from the order's menu that is the person using the chart (a doctor too).
      role: r.by === me.name ? me.role : "看護師",
      actor: drip ? me.name : r.by,
      action: drip ?? (r.status === "実施" ? "確定（実施）" : "確定（未実施）"),
      patient: who?.name,
      detail: `${item ? orderLines(item.order, today).main : r.orderId}　${r.status === "実施" ? `リストバンド${r.checked.patient ? "一致" : "—"}${r.checked.label === null ? "" : `・ラベル${r.checked.label ? "一致" : "—"}`}${r.offBy !== undefined ? `・予定より${Math.abs(r.offBy)}分${r.offBy > 0 ? "遅れ" : "早め"}` : ""}` : r.reason}${r.end ? `　${endText(r)}` : ""}`,
    });
    setMar((all) => ({ ...all, [r.key]: r }));
  };
  const voidMar = (r: AdminRecord, reason: VoidReason) => {
    if (!can(me.role, "mar") || mar[r.key] !== r || r.cancellation) return;
    const item = people.flatMap((x) => x.entries).find((e) => e.id === r.orderId);
    auditLog({ role: me.role, actor: me.name, action: `${r.status}の記録を取り消した`, patient: findPatient(r.patientId)?.name, detail: `${item ? orderLines(item.order, today).main : r.orderId}　${r.doneAt} ${r.by} の記録　理由：${reason}` });
    setMarVoided((all) => ({ ...all, [r.key]: [...(all[r.key] ?? []), { record: r, by: me.name, at: new Date().toISOString(), reason }] }));
    setMar((all) => {
      const next = { ...all };
      next[r.key] = cancelAdministration(r, me.name, new Date().toISOString(), reason);
      return next;
    });
  };
  // 実施・未実施 from an order row or a calendar cell (ExecuteMenu): the same records and audit lines as the worksheet.
  const executeProps: ExecuteProps = { records: mar, sessionStart: sessionStart ?? abs(0, nowTime), nowTime, onRecord: recordMar, onVoid: voidMar };
  // A nurse's question answered by the doctor: back to the nurse to take it.
  if (role === "看護師")
    for (const r of allTakeRows) {
      const hold = takeHolds[r.key];
      if (hold?.answer && !isRowTaken(r)) todos.push({ key: `answered-${r.key}`, label: `医師が回答：${r.name}さんの指示`, detail: hold.answer.text, count: 1, tone: "ai", go: () => goWard("sheet") });
    }
  if (role === "医師") {
    for (const r of allTakeRows) {
      const hold = takeHolds[r.key];
      if (hold && !hold.answer && !isRowTaken(r)) todos.push({ key: `hold-${r.key}`, label: `看護師から指示の確認：${r.name}さん`, detail: `${r.main}　${hold.reason}`, count: 1, tone: "yamabuki", go: () => openPatient(r.patientId) });
      else if (r.flags.urgent && !isRowTaken(r) && r.keys.some((k) => sessionKeys.has(k)) && abs(0, nowTime) - r.at >= 15) todos.push({ key: `urgent-${r.key}`, label: `至急の指示がまだ受けられていない：${r.name}さん`, detail: `${r.main}（${abs(0, nowTime) - r.at}分）`, count: 1, tone: "shu", go: () => openPatient(r.patientId) });
    }
  }
  if (role === "看護師" && takeWaiting) todos.push({ key: "take", label: "指示受けがまだ", detail: "指示受けの画面で受ける（ワークシートでも）", count: takeWaiting, tone: "yamabuki", go: () => goWard("take") });
  if (role === "看護師" && takeNotConfirmed) todos.push({ key: "take-confirm", label: "受けた指示の予定の確認がまだ", detail: "指示が今日と明日に作る予定を見て「予定を確認した」", count: takeNotConfirmed, tone: "yamabuki", go: () => goWard("take") });
  const toCosign = role === "医師" ? pendingOf(cosign).filter((i) => !confirmDeny(me.name, i)) : [];
  if (toCosign.length) todos.push({ key: "cosign", label: "研修医の記録の確認待ち", detail: `${new Set(toCosign.map((i) => i.patientId)).size}人の患者`, count: toCosign.length, tone: "yamabuki", go: () => goWard("cosign") });
  if (admitDue) todos.push({ key: "admit", label: "入院時の評価：期限切れ・今日まで", count: admitDue, tone: "shu", go: () => goWard("admit") });
  // 麻薬: the ward writes the 施用票 and returns the ampoules; the pharmacy receives them (narcotic-book.ts).
  const slipsToWrite = role === "看護師" ? slipsDue(people, mar, narcBook).length : 0;
  if (slipsToWrite) todos.push({ key: "narc-slip", label: "麻薬の施用票がまだ", detail: "施用量と残量を書いて残液・空アンプルを薬剤部へ返す", count: slipsToWrite, tone: "shu", go: () => goWard("narcotic") });
  const slipsToReceive = role === "薬剤師" ? narcBook.slips.filter((s) => !s.received).length : 0;
  if (slipsToReceive) todos.push({ key: "narc-receive", label: "麻薬の施用票と残液の受け取り", detail: "薬剤部の「麻薬」タブで受け取る", count: slipsToReceive, tone: "yamabuki", go: () => openArea("pharmacy") });
  const toCall = uncalled(labItems, calls).length;
  // 掲示板: notices someone asked me to read, still unread.
  for (const n of notices) {
    const r = boardReminders[n.id];
    if (r && r.names.includes(me.name) && !(reads[n.id] ?? []).includes(me.name)) todos.push({ key: `board-${n.id}`, label: `掲示を読む：${n.title}`, detail: `${r.at} ${r.by}から`, count: 1, tone: "yamabuki", go: () => openArea("board") });
  }
  if (!deny("panic.call") && toCall) todos.push({ key: "call", label: "パニック値の連絡がまだ", detail: "検査室で連絡を記録する", count: toCall, tone: "shu", go: () => openArea("lab") });
  // 放射線部 (診療放射線技師): 指示受けがまだ, 造影・MRI の確認がまだ, 今日の未撮影 (ris-take.ts).
  if (!deny("ris.exam")) {
    const rt = risTodo(risRows(people, dept.ris));
    if (rt.untaken) todos.push({ key: "ris-take", label: "画像検査の指示受けがまだ", detail: "放射線部の「指示受け」で受ける", count: rt.untaken, tone: "yamabuki", go: () => openArea("radiology") });
    if (rt.unconfirmed) todos.push({ key: "ris-confirm", label: "造影・MRI の指示確認がまだ", detail: "同意・腎機能・アレルギー・体内金属を見て「確認した」", count: rt.unconfirmed, tone: "yamabuki", go: () => openArea("radiology") });
    if (rt.notDoneToday) todos.push({ key: "ris-today", label: "今日の未撮影の画像検査", detail: "放射線部の「当日の予定」で呼出・撮影を記録する", count: rt.notDoneToday, tone: "ai", go: () => openArea("radiology") });
  }

  const summaries: Record<string, ChartSummary> = Object.fromEntries(
    Object.entries(charts)
      .filter(([k]) => !k.includes("|"))
      .map(([id, c]) => [id, { drafts: charts[deskKeyOf(id, desk)]?.drafts.length ?? 0, confirmedToday: c.added.length + c.stopped.length, waiting: waiting[id] ?? 0 }]),
  );

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

  const switchRole = (r: Role, who?: string) => {
    auditLog({ role: r, actor: who ?? (r === "医師" ? doctorName : r === "看護師" ? nurseName : STAFF[r].name), action: "職種を選んで入った（デモではログインの代わり）" });
    setRole(r);
    // Charts stay open; those under a screen the role cannot open move to its first patient list.
    const moved = rehome(patientTabs, wardTabsFor(r));
    // The role's own first screen (看護師 → ワークシート, 医事課 → 医事課の仕事 …) opens first; 医師 keeps the ward's 最初に開く.
    const home = homeScreen(r);
    const keep = allowedWardTabs(r, [...(home.wardTab ? [home.wardTab] : []), ...defaultsOf(wardDefaults, r), ...wardTabs, ...moved.flatMap((t) => wardTabOf(t.owner) ?? [])]);
    setPatientTabs(moved);
    setWardTabs(keep);
    setWardTab(home.wardTab ?? keep[0] ?? "menu");
    setArea(home.area);
    setFront({});
    setNewTabFor(null);
    setPanel(null);
  };
  // 医師 as another person (研修医・指導医…): a login stand-in like the role.
  const switchDoctor = (name: string) => {
    if (role !== "医師") switchRole("医師", name);
    else if (name !== doctorName) auditLog({ role: "医師", actor: name, action: "医師を選んで入った（デモではログインの代わり）" });
    setDoctorName(name);
    setPanel(null);
  };
  const switchNurse = (name: string) => {
    if (role !== "看護師") switchRole("看護師", name);
    else if (name !== nurseName) auditLog({ role: "看護師", actor: name, action: "看護師を選んで入った（デモではログインの代わり）" });
    setNurseName(name);
    setPanel(null);
  };
  const orderMode = !deny("order") ? "doctor" : !deny("order.verbal") ? "verbal" : "none";
  const noteReady = !!patient && noteChanged(chart.note, chart.noteInitial) && !deny("note") && !(chart.noteAt && eventTimeProblem(chart.noteAt, { day: 0, time: nowTime }, patient.admittedOn));
  const ordersReady = !!ctx && orderMode !== "none" && chart.drafts.length > 0 && chart.drafts.every((d) => isReady(issues[d.id] ?? []));

  const orderBlock = orderMode === "none" ? deny("order") ?? undefined : undefined;
  const blocked: Partial<Record<PanelKind, string>> = {
    ...nutritionTileBlocks(role),
    ...specialistTileBlocks(role),
    ...(orderBlock ? { "add-surgery": orderBlock, "add-injection": orderBlock, "add-rx": orderBlock, "add-lab": orderBlock, "add-imaging": orderBlock, "add-physio": orderBlock, "add-cath": orderBlock, "add-procedure": orderBlock, "add-dialysis": orderBlock, "add-transfusion": orderBlock, regimen: orderBlock, sets: orderBlock, "add-rehab": orderBlock, "add-consult": orderBlock, "add-leave": orderBlock, "add-discharge": orderBlock, "add-guide": orderBlock } : {}),
    ...(deny("order") ? { "add-pathology": deny("order")! } : {}),
    ...(deny("billing") ? { billing: deny("billing")! } : {}),
    ...(resident ? { regimen: COSIGN_RULES.blocked } : {}),
  };

  // 受け持ち患者 of a doctor are their own patients (主治医): the badge counts only theirs.
  const wardReports = wardReportRows(people, reportSrc, acks);
  const wardBadges: Partial<Record<WardTab, number>> = { take: role === "看護師" ? takeWaiting : 0, mine: role === "療法士" ? rehabPrescriptions(everyone).length : lists.mine.beds.filter(b => b.patientId).length, admit: admitDue, cosign: toCosign.length, summaries: toApprove.length, undone: undoneNow.length, reports: wardReports.filter((r) => isMine(r.patientId)).reduce((n, r) => n + r.unread, 0) };
  const ownerLabel = (o: Owner) => {
    const w = wardTabOf(o);
    return w ? wardTabInfo(w).label : o === "er" ? "救急外来" : "外来";
  };

  // The screen itself.
  // 外来の受診歴 for the left record: a ward patient's visits before the admission (fictional), an outpatient's past visits.
  const opdVisitsOf = (p: Patient) => {
    const v = visitOf(p.id);
    return v ? (v.kind === "opd" ? visitsFromOpd(v.op) : []) : visitsOf(p.id, p.admittedOn);
  };
  /** What the left tabs (経過表・内服歴・注射歴) and the reading windows show and do, for the chart in front. */
  const refPropsOf = (patient: Patient): RefWindowProps => ({
    icu: visibleIcuRecords(icu, abs(0, nowTime)),
    onNewPrescription: deny("order") ? undefined : (day, from) => { update({ rxSeed: prescriptionCalendarSeed(newId(), day, patient.id, from) }); openOrder("add-rx"); },
    onPrescriptionStop: deny("order") ? undefined : (entry, day) => addStopDraft(entry, "（内服カレンダーから）", day),
    insulinEdit: { onDraft: deny("order") ? undefined : d => update(c => ({ drafts: [...c.drafts, d], flash: "インスリンの変更を下書きに入れました。保存で確定します。" })), onGlucose: deny("vitals") ? undefined : (day, time) => { const entry = glucoseEntry(careOrders, patient.id, day, time, me.name, newId()); if (entry.order) setCareOrders(all => [...all, entry.order!]); setFlowReq(entry.request); setPanel("flow-entry"); } },
    onNewOrder: deny("order") ? undefined : (tab) => { if (tab === "rxcal") openOrder("add-rx"); else setPanel("add-procedure"); },
    patient,
    entries,
    today,
    nowTime,
    selectedDay: chart.selectedDay,
    onSelectDay: (d) => update({ selectedDay: d }),
    onAdjustInsulin: !deny("order") ? (e, change) => { const next = insulinAdjustmentEntries(e, change, 0, newId(), me.name, nowTime); update(c => ({ added: [...c.added, next], flash: "明日からのインスリンを保存しました。看護師の指示受けに変更として出ます。" })); auditLog({role:me.role,actor:me.name,action:"確定（インスリンを調整）",patient:patient.name,detail:orderLines(next.order,today).main}); chartNote(patient.id, `インスリンを調整：${orderLines(next.order,today).main}（元の指示は今日まで、明日から）`); } : undefined,
    onStopDraft: (e, time) => addStopDraft(e, undefined, 0, time),
    onExtendDraft: deny("order") ? undefined : extendDraft,
    onToggleDose: deny("order") ? undefined : toggleDose,
    pendingExtends: pendingExtends,
    pendingStopTimes: stopTimesOf(chart.drafts, nowTime),
    marOf: (id, at) => mar[`${id}|${at}`],
    execute: executeProps,
    io: { icu, typed: io.filter((e) => e.patientId === patient.id), records: mar, sessionStart: sessionStart ?? abs(0, nowTime), standingIo: standingNow(patient.id)?.io ?? null, onAdd: deny("vitals") ? undefined : addIo },
    onModify: modifyOrder,
    care: { orders: careOrders.filter((o) => o.patientId === patient.id), records: careRecords, sessionStart: sessionStart ?? abs(0, nowTime), onRecord: deny("mar") ? undefined : recordCare, onVoid: deny("mar") ? undefined : voidCareRecord, onAdd: deny("mar") ? undefined : (o) => { setCareOrders(all => [...all, o]); auditLog({ role: me.role, actor: me.name, action: "確定（経過表の観察項目）", patient: patient.name, detail: o.item }); }, onLimits: deny("mar") ? undefined : (id, glucoseLimits) => setCareOrders(all => all.map(o => o.id === id ? { ...o, glucoseLimits } : o)) },
    standingCal: { onAdd: (l) => addStandingLine(patient.id, l), lines: [...(standingLines[patient.id] ?? []), ...linesFromFields(standing[patient.id] ?? [])], onStop: deny("order") ? undefined : (id, reason, day, kind) => stopStandingLine(patient.id, id, reason, day, kind), onEndField: (l) => { setStandingEdit({ ...l, patientId: patient.id, endSelected: true }); setPanel("standing"); }, onEdit: (l) => { setStandingEdit({ ...l, patientId: patient.id }); setPanel("standing"); }, onOpenPanel: () => { setStandingEdit(undefined); setPanel("standing"); } },
    flowDays: {
      surgeries: surgeries.filter((x) => x.patientId === patient.id),
      events: flowEvents.filter((x) => x.patientId === patient.id),
      meName: me.name,
      onAddEvent: deny("vitals")
        ? undefined
        : (ev) => {
            auditLog({ role: me.role, actor: me.name, action: "経過表に数える日を足した", patient: patient.name, detail: `${ev.label}（${formatShort(addDays(today, ev.day))}）` });
            setFlowEvents((all) => [...all, { ...ev, id: newId(), patientId: patient.id, by: me.name, at: { day: 0, time: nowTime } }]);
          },
      onRemoveEvent: (id) => setFlowEvents((all) => all.filter((x) => x.id !== id || x.by !== me.name)),
    },
    flow:
      chart.leftView === "flowsheet" || chart.openTabs.includes("flowsheet")
        ? {
            onSaveVital: deny("vitals") ? undefined : (v) => { setExtraVitals(all => ({ ...all, [patient.id]: [...(all[patient.id] ?? []), { ...v, recordedTime: nowTime }] })); auditLog({ role: me.role, actor: me.name, action: "確定（経過表のバイタル）", patient: patient.name, detail: `${v.time} JCS ${v.jcs?.score ?? "—"}` }); },
            standingMeasurements: { lines: standingLines[patient.id] ?? [], fields: standing[patient.id]?.at(-1) },
            scale: chart.flowScale ?? "all",
            onScale: (s) => update({ flowScale: s }),
            onOpenRecord: (day, kind, noteId) => update((c) => ({ leftView: "record", selectedDay: day, recordFocus: { kind, noteId, n: (c.recordFocus?.n ?? 0) + 1 } })),
            pendingLabs: pendingDraws(drawRows(people, mar, labDesk, sessionStart ?? abs(0, nowTime), abs(0, nowTime)), patient.id, abs(0, nowTime)),
            mar: { records: mar, sessionStart: sessionStart ?? abs(0, nowTime) },
            // セルから入力: the same entries as the worksheet and the tools (the drawer checks the role again).
            onEntry: (req) => {
              setFlowReq(req);
              setPanel(req.kind === "vitals" ? "vitals" : req.kind === "io" ? "io" : "flow-entry");
            },
            onPrint: () => auditLog({ role: me.role, actor: me.name, action: "経過表（温度板）を印刷", patient: patient.name }),
            graphNotes: graphNotes.filter((n) => n.patientId === patient.id),
            onAddNote: deny("note")
              ? undefined
              : (n) => {
                  auditLog({ role: me.role, actor: me.name, action: "経過表に付箋を貼った", patient: patient.name, detail: n.text });
                  setGraphNotes((all) => [...all, { ...n, id: newId(), patientId: patient.id, by: me.name, role: me.role, written: { day: 0, time: nowTime } }]);
                },
            onRemoveNote: (id) => {
              const n = graphNotes.find((x) => x.id === id);
              if (!n || n.by !== me.name) return;
              auditLog({ role: me.role, actor: me.name, action: "経過表の付箋をはがした", patient: patient.name, detail: n.text });
              setGraphNotes((all) => all.filter((x) => x.id !== id));
            },
            untaken: untakenOf(allTakeRows.filter((r) => r.patientId === patient.id && !isRowTaken(r) && r.keys.some((k) => sessionKeys.has(k))).flatMap((r) => r.keys)),
            onWriteNote: deny("note")
              ? undefined
              : () => {
                  update((c) => ({ rightTab: floating.note ? c.rightTab : "note" }));
                  requestAnimationFrame(() => document.querySelector<HTMLTextAreaElement>('textarea[aria-label="記事"]')?.focus());
                },
          }
        : undefined,
    draftedStops: chart.drafts.flatMap((d) => (d.kind === "stop" && d.targetOrderId ? [d.targetOrderId] : [])),
    onInsertVitals: (text) => update((c) => ({ note: insertIntoO(c.note, text), rightTab: "note" })),
    diets: diets,
    dietEdit: { denied: deny("diet"), doctor: me.name, onAdjust: role === "管理栄養士" ? (orders) => { setDiets(all => [...all, ...orders]); chartNote(patient!.id, `食事の調整：${orders.map(dietLabel).join("、")}`); } : undefined, onDraft: (orders) => { if (role === "管理栄養士") { setCharts(all => applyChart(all, patient!.id, attendingDesk(patient!.attending), c => ({ drafts: [...c.drafts, ...orders.map(d => dietProposal(d, newId()))] }))); return; } if (!deny("diet")) update((c) => ({ drafts: [...c.drafts, ...calendarDietDrafts(orders, newId)], flash: "食事の変更を下書きにしました。「オーダー」か「保存して閉じる」で確定します。" })); } },
    onOpenDiet: () => setPanel("diet"),
    moves: moveEventsOf(patient.id),
    onBook: (day: number, what: BookWhat) => {
      // A discharged patient has no bed to move from.
      if (patient.dischargedAt) return update({ flash: "この患者は退院済みです。移動や退院の予約はできません。" });
      if (what === "move" || what === "dept") setBooking({ day, what });
      else if (what === "退院" || what === "外泊") {
        setLeavePreset(day);
        if (what === "退院") openOrder("add-discharge"); else setPanel("add-leave");
      }
    },
    onDoMove: deny("bed.move") ? undefined : doMove,
    bookings: bookingsOf(
      entries.filter((e): e is OrderEntry => e.kind === "order"),
      surgeries.filter((x) => x.patientId === patient.id),
      today,
      abs(0, nowTime),
    ),
  });

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
      ) : screen === "beds" ? (
        <BedControlView
          floors={FLOORS}
          beds={allBeds}
          patient={findPatient}
          plans={[
            ...moveBedPlans(allPatients, Object.fromEntries(allPatients.map(p => [p.id, ordersOf(currentEntries(p, sessionChanges[p.id])).filter(e => !movesDone[e.id])])), allBeds),
            ...WARD_PLANS.filter((w) => w.day >= 0 && w.day <= 1).map((w) => ({ floor: WARD_NAME, day: w.day, kind: w.kind })),
            ...requests.filter((r) => r.status === "申込" && r.when.day >= 0 && r.when.day <= 1).map((r) => ({ floor: r.ward, day: r.when.day, kind: "入院" as const })),
            ...people.flatMap((x) =>
              x.entries.flatMap((e) => (e.status === "有効" && e.order.type === "procedure" && e.order.leave?.kind === "退院" && e.order.leave.from.day >= 0 && e.order.leave.from.day <= 1 ? [{ floor: floorOf(x.room.replace(/[A-Z]$/, "")), day: e.order.leave.from.day, kind: "退院" as const }] : [])),
            ),
          ]}
          requests={requests}
          moves={scheduleItems()
            .filter((x) => /入院|退院|転床|転棟|転科/.test(x.what))
            .map((x) => ({ day: x.sort < 1440 ? 0 : 1, time: x.when.split(" ")[1] ?? null, who: `${x.room} ${x.name}`, what: x.what }))}
          fmtDay={(d) => formatShort(addDays(today, d))}
          onAccept={acceptRequest}
        />
      ) : screen === "equipment" || screen === "infection" || screen === "oral" ? (
        <SpecialistBoard onReview={id => { openPatient(id); setTimeout(() => setPanel("active-orders"), 0); }} beds={allBeds} icu={icu} vents={icu.vents} diagnoses={diagnoses} standingLines={standingLines} nowTime={nowTime} administrations={Object.values(mar)} screen={screen} people={allPatients.filter(p => !p.dischargedAt).map(patient => ({ patient, entries: ordersOf(currentEntries(patient, sessionChanges[patient.id])) }))} surgeryIds={surgeries.filter(s => s.day >= 0 && s.patientId).map(s => s.patientId!)} me={me} onOpen={openPatient} onNote={chartNote} onRound={(pid, text) => setStickies(all => ({ ...all, [pid]: [...(all[pid] ?? []), { id: newId(), text: `ICT：${text}`, by: me.name, at: nowTime, shared: true }] }))} />
      ) : screen === "iji" ? (
        <IjiBoard diseaseRequests={stickies} onDiseaseRequest={requestDisease} outpatient={{ visits: opd.map((patient) => ({ patient, entries: ordersOf(withExamRecords(currentEntries(findPatient(`opd:${patient.id}`)!, sessionChanges[`opd:${patient.id}`]), dept.ris)), rx: opdRx[patient.id] ?? [], drafts: pendingDraftCount(charts, `opd:${patient.id}`) })), book: opdBills, onSettle: (s) => { if (!deny("settle")) { setOpdBills((all) => ({ ...all, [s.visitId]: s })); setOpd((all) => all.map((p) => `opd:${p.id}` === s.visitId ? { ...p, status: "終了" } : p)); } } }} charts={charts} emergency={{ visits: er.filter((p) => p.status !== "搬送中").map((patient) => ({ patient, entries: ordersOf(withExamRecords(currentEntries(findPatient(`er:${patient.id}`)!, sessionChanges[`er:${patient.id}`]), dept.ris)), drafts: pendingDraftCount(charts, `er:${patient.id}`) })), book: opdBills, onSettle: (s) => { if (!deny("settle")) setOpdBills((all) => ({ ...all, [s.visitId]: s })); } }} patients={teamPatients} dischargePlanOf={(id) => { const x = findPatient(id); if (!x) return null; const o = ordersOf(currentEntries(x, sessionChanges[id])).find((e) => e.status === "有効" && e.order.type === "procedure" && e.order.leave?.kind === "退院"); return o && o.order.type === "procedure" && o.order.leave ? o.order.leave.from : null; }} desk={iji} diagnoses={diagnoses} today={today} nowTime={nowTime} payload={() => teamPatients.map(claimPayloadOf)} onOpen={(id, where) => { openPatient(id); /* after the switch render (it closes the previous patient's windows) */ setTimeout(() => setPanel(id.startsWith("er:") || id.startsWith("opd:") ? "patient-info" : where), 0); }} />
      ) : screen === "support" ? (
        <SupportBoard intakes={anamnesis} people={[...people, ...dischargedPeople]} evals={evals} documents={documents} asks={transferAsks} today={today} discharged={discharged} onOpen={openPatient} onStep={(pid, step) => { if (step === "docs" || step === "transfer" || step === "add-discharge") { if (step === "add-discharge" && role !== "医師") return; setSupportDoc(step === "docs"); openPatient(pid); /* after the switch: windows of the previous patient close on the switch render */ setTimeout(() => { if (step === "add-discharge") openOrder(step); else setPanel(step); }, 0); } else { setAdmitSelection({ pid, key: step }); goWard("admit"); } }} />
      ) : screen === "ulcers" ? (
        <UlcerBoard
          pick={floorPick}
          ulcers={nm.ulcers}
          fmtDay={(d) => formatShort(addDays(today, d))}
          where={(pid) => {
            const b = bedsOn(floor).find((x) => x.patientId === pid);
            const p = b && findPatient(pid);
            return p ? { name: p.name, room: roomLabel(b.room, b.bed) } : undefined;
          }}
          onOpen={(id) => (openPatient(id), setPanel("pressure"))}
        />
      ) : screen === "assign" ? (
        <AssignBoard
          pick={floorPick}
          hasRoster={floor === WARD_NAME}
          rooms={floorInfo.rooms}
          beds={floorPeople.map((x) => ({ key: x.room, patientId: x.id, name: x.name }))}
          nurses={rosterNow!.nurses}
          crewOf={(d, s) => crewOn(rosterNow!, today, d, s)}
          sheetOf={(d, s) => nm.assignBook[assignKey(floor, d, s)]}
          nowTime={nowTime}
          canEdit={!deny("nursing.manage")}
          onChange={(d, s, sheet, what) => {
            auditLog({ role: me.role, actor: me.name, action: "業務分担", detail: `${floor} ${shiftKey(d, s)}　${what}` });
            nm.setAssignBook((all) => ({ ...all, [assignKey(floor, d, s)]: sheet }));
          }}
        />
      ) : screen === "icu" ? (
        <IcuBoard patients={allPatients} beds={allBeds} records={icu} today={today} nowTime={nowTime} orders={Object.fromEntries(allPatients.map(p => [p.id, ordersOf(currentEntries(p, sessionChanges[p.id])).filter(e => !movesDone[e.id])]))} onOpen={id => { openPatient(id); setTimeout(() => setPanel("icu"), 0); }} />
      ) : screen === "monitor" ? (
        <CentralMonitor
          candidates={[...people, ...allPatients.filter(p => unitOf(p.ward) && !p.dischargedAt && !people.some(x => x.patient.id === p.id)).map(patient => ({ patient, room: patient.room }))].map((x) => ({ ward: x.patient.ward, id: x.patient.id, name: x.patient.name, room: x.room, admittedOn: x.patient.admittedOn, latest: patientForCurrentDisplay(x.patient).vitals.at(-1) }))}
          manual={monitorManual}
          lockedWhy={role === "看護師" ? null : "モニターの付け外しは看護師が行います。"}
          nowTime={nowTime}
          onToggle={(pid, on) => {
            auditLog({ role: me.role, actor: me.name, action: on ? "モニターを付けた（模擬）" : "モニターを外した（模擬）", patient: findPatient(pid)?.name });
            setMonitorManual((m) => toggleMonitor(m, pid, on));
          }}
          onOpen={(id) => (openPatient(id), setPanel("monitor"))}
        />
      ) : screen === "vitals" ? (
        <VitalsBulk
          pick={floorPick}
          patients={floorPeople.map((x) => ({ id: x.id, name: x.name, room: x.room, last: x.patient.vitals.at(-1), standing: standingNow(x.id) }))}
          mine={floor === WARD_NAME ? floorPeople.filter((x) => nurseOfBed(planNow, x.room, rosterNow!.nurses) === me.name).map((x) => x.id) : []}
          team={floorPeople.filter((x) => teamIds.has(x.id)).map((x) => x.id)}
          nowTime={nowTime}
          canType={!deny("vitals")}
          onSave={(list) => {
            for (const { patientId, vital: v } of list) auditLog({ role: me.role, actor: me.name, action: "確定（バイタル・一括入力）", patient: findPatient(patientId)?.name, detail: `${v.time} BT ${v.bt ?? "—"} HR ${v.hr ?? "—"} BP ${v.sbp ?? "—"}/${v.dbp ?? "—"} RR ${v.rr ?? "—"} SpO2 ${v.spo2 ?? "—"}　NEWS2 ${news2(v).total}` });
            setExtraVitals((all) => list.reduce((acc, { patientId, vital }) => ({ ...acc, [patientId]: [...(acc[patientId] ?? []), { ...vital, recordedTime: nowTime }] }), all));
          }}
        />
      ) : screen === "falls" ? (
        <FallBoard
          patients={people.map((x) => ({ id: x.patient.id, name: x.patient.name, room: x.room, admittedOn: x.patient.admittedOn, first: evals[x.patient.id]?.fall, reviews: nm.fallReviews[x.patient.id] ?? [], triggers: fallTriggers(x.patient.id, moveLog, surgeries, nowTime) }))}
          nowTime={nowTime}
          canRecord={!deny("assess.nursing")}
          onReview={(pid, r) => {
            auditLog({ role: me.role, actor: me.name, action: "確定（転倒・転落の再評価）", patient: findPatient(pid)?.name, detail: `危険因子：${r.checked.join("、") || "なし"}${r.plan ? `　対策：${r.plan}` : ""}` });
            nm.addFallReview(pid, r);
          }}
          onOpen={openPatient}
        />
      ) : screen === "nsummaries" ? (
        <SummaryApprovals
          pick={floorPick}
          patients={floorPeople.map((x) => ({ id: x.id, name: x.name, room: x.room, admittedOn: x.patient.admittedOn }))}
          summaries={nm.summaries}
          canReview={!deny("nursing.manage")}
          onApprove={(s) => {
            const why = nm.review(s, { day: 0, time: nowTime });
            if (why) return window.alert(why);
            auditLog({ role: me.role, actor: me.name, action: "看護サマリを承認した（看護師長として）", patient: findPatient(s.patientId)?.name, detail: s.kind });
          }}
          onReturn={(s, comment) => {
            const why = nm.review(s, { day: 0, time: nowTime }, comment);
            if (why) return window.alert(why);
            auditLog({ role: me.role, actor: me.name, action: "看護サマリを差し戻した（看護師長として）", patient: findPatient(s.patientId)?.name, detail: `${s.kind}　${comment}` });
          }}
          onOpen={(id) => (openPatient(id), setPanel("summary"))}
        />
      ) : screen === "status" ? (
        <StatusBoard
          pick={floorPick}
          patients={floorPeople}
          book={nm.statusBook[floor] ?? {}}
          nowTime={nowTime}
          canType={!deny("nursing.manage")}
          onRegister={(day, shift, sheet, changed) => {
            auditLog({ role: me.role, actor: me.name, action: "確定（状態の一括登録）", detail: `${floor} ${shiftKey(day, shift)}　${changed.length}人を登録` });
            nm.setStatusBook((all) => ({ ...all, [floor]: { ...all[floor], [shiftKey(day, shift)]: [...(all[floor]?.[shiftKey(day, shift)] ?? []), sheet] } }));
            // 救護区分 is the bed's record too (院内連絡).
            setBedInfo((all) => ({ ...all, ...Object.fromEntries(changed.filter((id) => sheet.rows[id]?.rescue).map((id) => [id, { sensors: all[id]?.sensors ?? [], rescue: sheet.rows[id].rescue }])) }));
          }}
        />
      ) : screen === "meals" ? (
        <MealsView title={`受け持ち ${people.length}人`} people={people} diets={diets} today={today} nowTime={nowTime} />
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
      ) : screen === "cosign" ? (
        <CosignList
          items={cosign}
          meName={me.name}
          patientOf={(id) => {
            const p = findPatient(id);
            return p ? { name: p.name, room: p.room } : undefined;
          }}
          onConfirm={confirmCosign}
          onOpen={openPatient}
        />
      ) : screen === "narcotic" ? (
        <NarcoticSlips people={people} records={mar} book={narcBook} onBook={setNarcBook} today={today} nowTime={nowTime} newId={newId} />
      ) : screen === "paths" ? (
        <PathList
          book={paths}
          patientOf={(id) => {
            const x = people.find((y) => y.patient.id === id) ?? dischargedPeople.find((y) => y.patient.id === id);
            return x ? { name: x.patient.name, room: x.room } : undefined;
          }}
          fmt={(d) => formatShort(addDays(today, d))}
          onOpen={(pid) => (openPatient(pid), setPanel("path"))}
        />
      ) : screen === "summaries" ? (
        <SummaryList rows={summaryNow} today={today} onOpen={(id) => (openPatient(id), setPanel("discharge"))} />
      ) : screen === "io" ? (
        <IoBoard icu={icu} people={people} typed={io} records={mar} sessionStart={sessionStart ?? abs(0, nowTime)} nowTime={nowTime} today={today} standingIoOf={(pid) => standingNow(pid)?.io ?? null} onAdd={addIo} newId={newId} onOpen={openPatient} canType={!deny("vitals")} />
      ) : screen === "consults" ? (
        <ConsultInboxView rows={inbox} onOpen={(id) => { openPatient(id); setPanel("add-consult"); }} />
      ) : screen === "reports" ? (
        <WardReportList rows={wardReports} mine={isMine} acks={acks} today={today} onSeen={deny("result.ack") ? undefined : (pid, keys) => markSeen(pid, keys)} onOpen={openAt} onOpenImage={(pid, id) => { openPatient(pid); setTimeout(() => openReportImage(id), 0); }} />
      ) : screen === "undone" ? (
        <UndoneView rows={undoneNow} gaps={gapsNow} clock={clockText} forBilling={role === "医事課"} onOpen={openPatient} onSheet={TABS[role].includes("sheet") ? () => goWard("sheet") : undefined} onBilling={role === "医事課" ? (pid) => { openPatient(pid); setTimeout(() => setPanel("billing"), 0); } : undefined} />
      ) : screen === "roster" ? (
        <RosterView book={rosterBook} today={today} nowTime={nowTime} onChange={setRosterBook} />
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
      ) : screen === "phs" ? (
        <PhsView
          people={people}
          nowTime={nowTime}
          contacts={onDuty(abs(0, nowTime) % 1440, weekendAt(abs(0, nowTime)))}
          cautionsOf={cautionsOf}
          calls={nurseCalls}
          emergencies={emergencies}
          notes={callNotes}
          notices={role === "看護師" ? phsNotices.filter(forMyTeam) : phsNotices}
          beds={bedInfo}
          schedule={scheduleItems()}
          onRing={(pid, kind) => {
            const x = people.find((y) => y.patient.id === pid);
            if (!x) return;
            setNurseCalls((cs) => [...cs, { id: newId(), kind, patientId: pid, room: x.room, bed: "", at: nowTime, ms: Date.now(), to: nurseFor(x.room.replace(/[A-Z]$/, "")), slides: [] }]);
          }}
          onBroadcast={(to, text) => {
            auditLog({ role: me.role, actor: me.name, action: "一斉連絡", detail: `${to === "全員" ? "看護師全員" : `${to} チーム`}：${text}` });
            setPhsNotices((ns) => [...ns, { id: newId(), at: nowTime, kind: "一斉連絡", text, to, from: me.name, readBy: [] }]);
          }}
          onReadNotice={(id) => setPhsNotices((ns) => ns.map((n) => (n.id === id && !n.readBy.includes(me.name) ? { ...n, readBy: [...n.readBy, me.name] } : n)))}
          onBed={(pid, info) => {
            auditLog({ role: me.role, actor: me.name, action: "ベッドの情報を登録", patient: findPatient(pid)?.name, detail: `救護区分 ${info.rescue ?? "未登録"}・センサー ${info.sensors.join("、") || "なし"}` });
            setBedInfo((all) => ({ ...all, [pid]: info }));
          }}
          onAnswer={answerCall}
          onArrive={(id) => updateCall(id, (c) => ({ arrived: { at: nowTime, by: me.name }, ...(c.answered ? {} : { answered: { at: nowTime, by: me.name } }) }))}
          onDone={(id, reason, memo) => {
            const c = nurseCalls.find((x) => x.id === id);
            updateCall(id, () => ({ done: { at: nowTime, by: me.name, reason, memo } }));
            if (c) {
              auditLog({ role: me.role, actor: me.name, action: "ナースコールに対応した", patient: findPatient(c.patientId)?.name, detail: `${c.at} 呼出 → 応答 ${c.answered?.at ?? nowTime} → 完了 ${nowTime}　${reason}${memo ? `：${memo}` : ""}` });
              chartNote(c.patientId, `【ナースコール】${c.at} 呼出、${c.arrived?.at ?? nowTime} 訪室。${reason}${memo ? `：${memo}` : ""}`);
            }
          }}
          onRaise={(kind, place, pid) => {
            auditLog({ role: me.role, actor: me.name, action: `緊急通報（${kind}）`, patient: pid ? findPatient(pid)?.name : undefined, detail: place });
            setEmergencies((es) => [...es, { id: newId(), kind, place, patientId: pid, at: nowTime, by: me.name, came: [] }]);
          }}
          onCome={(id) => setEmergencies((es) => es.map((e) => (e.id === id ? { ...e, came: [...e.came, { name: me.name, at: nowTime }] } : e)))}
          onClose={(id, note) => {
            const e = emergencies.find((x) => x.id === id);
            setEmergencies((es) => es.map((x) => (x.id === id ? { ...x, closed: { at: nowTime, by: me.name, note } } : x)));
            if (e) {
              auditLog({ role: me.role, actor: me.name, action: `緊急通報を解除（${e.kind}）`, patient: e.patientId ? findPatient(e.patientId)?.name : undefined, detail: note });
              if (e.patientId) chartNote(e.patientId, `【緊急通報】${e.kind}　${e.at} 発信（${e.by}）〜 ${nowTime} 解除。到着：${e.came.map((c) => `${c.name} ${c.at}`).join("、") || "記録なし"}。経過：${note}`);
            }
          }}
          onNote={(n) => {
            setCallNotes((all) => [...all, { ...n, id: newId(), at: nowTime, from: me.name }]);
            auditLog({ role: me.role, actor: me.name, action: "通話メモを残した", patient: n.patientId ? findPatient(n.patientId)?.name : undefined, detail: `→ ${n.to}：${n.text}`.slice(0, 200) });
            if (n.patientId) chartNote(n.patientId, `【通話】${nowTime} ${me.name} → ${n.to}：${n.text}`);
          }}
        />
      ) : screen === "board" ? (
        <BoardView
          notices={notices}
          reads={reads}
          today={today}
          nowTime={nowTime}
          onRead={(id, name) => setReads((r) => markRead(r, id, name))}
          onPost={(n) => setNotices((ns) => [...ns, n])}
          staff={Object.values(STAFF).map((x) => x.name)}
          reminded={boardReminders}
          onRemind={(id, names) => {
            auditLog({ role: me.role, actor: me.name, action: "掲示の未読者に知らせた", detail: `${notices.find((n) => n.id === id)?.title ?? id}　${names.join("、")}` });
            setBoardReminders((all) => ({ ...all, [id]: { names, at: nowTime, by: me.name } }));
          }}
        />
      ) : screen === "druginfo" ? (
        <FormularyView notices={notices} reads={reads} today={today} nowTime={nowTime} staff={Object.values(STAFF).map((x) => x.name)} onRead={(id, name) => setReads((r) => markRead(r, id, name))} onPost={(n) => setNotices((ns) => [...ns, n])} />
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
        <OpdDesk
          patients={opd}
          onPatients={setOpd}
          desk={opdDesk}
          onDesk={setOpdDesk}
          revisits={Object.entries(revisits).flatMap(([id, r]) => {
            const p = opd.find((x) => x.id === id);
            return p ? [{ day: r.day, time: r.time, name: p.name, doctor: p.doctor }] : [];
          })}
          today={today}
          nowTime={nowTime}
          requests={requestFor("opd")}
          onOpen={(id) => openVisit("opd", id)}
          onOpenChart={openPatient}
          newId={newId}
          insuranceBook={iji.insurance}
          onInsurance={(key, r) => setIji((d) => withInsurance(d, key, r))}
        />
      ) : screen === "map" ? (
        <div className="flex min-h-0 flex-1 flex-col">
          {asOfDay === 0 && <WardRequests floor={floor} requests={requests} ward={ward} rooms={floorInfo.rooms} fmtDay={(d) => formatShort(addDays(today, d))} onAccept={acceptRequest} dropped={requestDrop} />}
          <WardMap
            ward={{ beds: mapAsOf.beds, patient: id => { const p = findPatient(id); return p ? patientForCurrentDisplay(p) : undefined; } }}
            rooms={floorInfo.rooms}
            title="病棟マップ"
            pick={floorPick}
            dayNav={dayNavFor(mapAsOf)}
            asOf={mapAsOf}
            summaries={summaries}
            mine={isMine}
            onOpen={openPatient}
            // 転棟・転床 is today's work: another day is for looking only.
            onMove={asOfDay !== 0 || deny("bed.move") ? undefined : (patientId, to) => setMoving({ patientId, to })}
            onOpenAt={openAt} onDropRequest={asOfDay === 0 ? (id, bed) => setRequestDrop({ id, bed }) : undefined}
            roomNote={floor === WARD_NAME ? (r) => roomNurses(planNow, r.no, r.beds, rosterNow!.nurses).map((n) => n.replace(/^(看護師長|准看護師|看護師) /, "")).join("・") || undefined : undefined}
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
      ) : screen === "take" ? (
        <TakeDesk
          people={people}
          rows={allTakeRows}
          taken={taken}
          isTaken={isRowTaken}
          holds={takeHolds}
          confirms={takeConfirms}
          nurses={[...new Set([...people.map((x) => nurseFor(x.room.replace(/[A-Z]$/, ""))), "看護師 田中", "看護師 渡辺", "看護師 佐藤"])]}
          today={today}
          nowTime={nowTime}
          onTake={takeOrders}
          onHold={holdOrder}
          onConfirm={confirmOrder}
          // 自分の受け持ち: the shift's 業務分担 when one is set, else the ward's fixed teams (架空の病院の取り決め).
          isMine={(room) => (planNow ? nurseOfBed(planNow, room, rosterNow!.nurses) === me.name : nurseFor(room.replace(/[A-Z]$/, "")) === me.name)}
          onOpen={openPatient}
          onSheet={() => goWard("sheet")}
          onExecute={() => goWard("execute")}
          onVoid={voidMar}
          records={mar}
        />
      ) : screen === "execute" ? (
        <ExecuteDesk onVoid={voidMar} people={people} today={today} nowTime={nowTime} records={mar} sessionStart={sessionStart ?? abs(0, nowTime)} onRecord={recordMar} taken={taken} sessionKeys={sessionKeys} nurses={[...new Set([...people.map((x) => nurseFor(x.room.replace(/[A-Z]$/, ""))), "看護師 田中", "看護師 渡辺", "看護師 佐藤"])]} onOpen={openPatient} onSheet={() => goWard("sheet")} onTakeDesk={() => goWard("take")} />
      ) : screen === "sheet" ? (
        <Worksheet expiryNotice={expiryNotice} onOpen={openAt}
          standingMeasurements={Object.fromEntries(people.map(x => [x.patient.id, { lines: standingLines[x.patient.id] ?? [], fields: standing[x.patient.id]?.at(-1) }]))}
          remeasureVitals={extraVitals}
          onMeasure={(id) => setExtraVitals((all) => ({ ...all, [id]: markRemeasured(all[id] ?? []) }))}
          people={people}
          today={today}
          nowTime={nowTime}
          others={others}
          care={{
            orders: careOrders,
            records: careRecords,
            plans: nursingPlans,
            onRecord: recordCare,
            onVoid: voidCareRecord,
          }}
          queried={Object.fromEntries(queries.filter((q) => queryOpen(q, people.find((x) => x.patient.id === q.patientId)?.entries ?? [])).map((q) => [q.orderId, q.question]))}
          // 指示簿の頓用: the latest version a nurse has taken (指示受け); a newer one waits for 指示受け.
          standingFreePrn={people.flatMap((x) => worksheetPrnLines(standingLines[x.patient.id] ?? [], x, abs(0, nowTime), taken, sessionKeys))}
          standingPrn={people.flatMap((x) => {
            const s = standingFromBlocks(standingLines[x.patient.id] ?? [], [...(standing[x.patient.id] ?? [])].reverse().find((v) => v.taken), 0, nowTime);
            return s ? s.prn.map((rule) => ({ patientId: x.patient.id, room: x.room, name: x.patient.name, rule })) : [];
          })}
          taken={taken}
          sessionKeys={sessionKeys}
          onTake={takeOrders}
          holds={takeHolds}
          onHold={holdOrder}
          confirm={{ confirms: takeConfirms, onConfirm: confirmOrder }}
          nurses={[...new Set([...people.map((x) => nurseFor(x.room.replace(/[A-Z]$/, ""))), "看護師 田中", "看護師 渡辺", "看護師 佐藤"])]}
          records={mar}
          sessionStart={sessionStart ?? abs(0, nowTime)}
          onRecord={recordMar}
          voided={marVoided}
          onVoid={voidMar}
          assigned={(d, s) => planLines(nm.assignBook[assignKey(WARD_NAME, d, s)], people.map((x) => ({ key: x.room, patientId: x.patient.id, name: x.patient.name })), rosterNow!.nurses)}
        />
      ) : screen === "receipt" ? (
        <ReceiptDesk patients={teamPatients} diagnoses={diagnoses} today={today} nowTime={nowTime} payload={() => teamPatients.map(claimPayloadOf)} onOpen={(id, where) => { openPatient(id); setTimeout(() => setPanel(where), 0); }} desk={returns} onDesk={setReturns} />
      ) : screen === "stats" ? (
        <StatsView today={today} nowTime={nowTime} floors={FLOORS} beds={[...BEDS_WITH_CHARTS, ...newBeds, ...OTHER_FLOOR_BEDS_WITH_CHARTS]} moves={moves} patient={findPatient} opd={opd} er={er} />
      ) : screen === "liaison" ? (
        <LiaisonView
          today={today}
          nowTime={nowTime}
          book={liaison}
          onBook={setLiaison}
          opd={opd}
          er={er}
          letters={Object.entries(discharges).flatMap(([pid, d]) => {
            const p = findPatient(pid);
            return p && d.letter.issuedAt ? [{ patientId: pid, name: p.name, kana: p.kana, department: p.department, doctor: p.attending, to: d.letter.to, purpose: d.letter.purpose, issuedDay: d.letter.issuedAt.day }] : [];
          })}
        />
      ) : screen === "endo" ? (
        <EndoView people={everyone} desk={care.endo} onDesk={care.setEndo} pathology={dept.pathology} onAddPath={(c) => dept.setPathology((cs) => [...cs, c])} onGoPath={() => openArea("path")} acks={acks} today={today} nowTime={nowTime} />
      ) : screen === "kitchen" ? (
        <KitchenView people={everyone} evaluations={evals} work={{ teams: care.teams, guidance, onOpen: (id, panel) => { openPatient(id); setTimeout(() => setPanel(panel), 0); } }} diets={diets} desk={care.kitchen} onDesk={care.setKitchen} today={today} nowTime={nowTime} />
      ) : screen === "teams" ? (
        <TeamsView people={everyone} desk={care.teams} onDesk={care.setTeams} diagnoses={diagnoses} diets={diets} today={today} nowTime={nowTime} onOpen={(id) => (openPatient(id), setPanel("team"))} />
      ) : screen === "bcp" ? (
        <DowntimeView
          places={FLOORS.map((f) => f.name)}
          rowsFor={(name) => bedsOn(name).flatMap((b) => (b.patientId ? (workOf(b.patientId) ?? []) : []))}
          today={today}
          nowTime={nowTime}
          mar={mar}
          sessionStart={sessionStart ?? abs(0, nowTime)}
          limited={(id) => {
            const p = findPatient(id);
            return !!currentLimit(limits, id) && !(p && inCareTeam(me, p, myTeam));
          }}
        />
      ) : screen === "system" ? (
        <SystemView nowTime={nowTime} newId={newId} login={{ settings: login.settings, onChange: (s) => login.change(s, me), users: loginUsers }} />
      ) : screen === "audit" ? (
        <AuditView />
      ) : screen === "admit" ? (
        <AdmitEvalView
          key={JSON.stringify(admitSelection)} initialSelection={admitSelection}
          people={people}
          evals={evals}
          today={today}
          nowTime={nowTime}
          hints={Object.fromEntries(Object.entries(anamnesis).map(([id, r]) => [id, evalHints(r.fields)]))}
          onSave={(e, what) => {
            const p = findPatient(e.patientId);
            auditLog({ role: me.role, actor: me.name, action: `確定（入院時の評価：${what}）`, patient: p?.name });
            setEvals((all) => ({ ...all, [e.patientId]: e }));
            chartNote(e.patientId, what);
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
          onOpen={(id) => id.startsWith("er:") ? openVisit("er", id.slice(3)) : id.startsWith("opd:") ? openVisit("opd", id.slice(4)) : openPatient(id)}
          people={[...people, ...labVisits]}
          items={labItems}
          calls={calls}
          acks={acks}
          limits={PANIC_LIMITS}
          limitsSource={PANIC_SOURCE}
          nowTime={nowTime}
          attending={DOCTOR}
          onCall={(c) => {
            auditLog({ role: me.role, actor: me.name, action: "確定（パニック値を電話で連絡）", patient: findPatient(c.patientId)?.name, detail: `${c.hits.map(hitLine).join("、")}　${callLine(c)}` });
            setCalls((all) => ({ ...all, [c.key]: c }));
          }}
          records={mar}
          sessionStart={sessionStart ?? abs(0, nowTime)}
          desk={labDesk}
          onDesk={setLabDesk}
        />
      ) : screen === "blood" ? (
        <BloodBankView people={people} bank={dept.bloodBank} onBank={dept.setBloodBank} recordBlood={recordBlood} nowTime={nowTime} today={today} onIssued={(id, rec) => setTxIssued((all) => Object.fromEntries([...Object.entries(all).filter(([k]) => k !== id), ...(rec ? [[id, rec] as const] : [])]))} />
      ) : screen === "physio" ? (
        <PhysioView people={examPeople} desk={dept.physioDesk} onDesk={dept.setPhysioDesk} acks={acks} nowTime={nowTime} />
      ) : screen === "radiology" ? (
        <RadiologyView people={examPeople} desk={dept.ris} onDesk={dept.setRis} acks={acks} nowTime={nowTime} today={today} consents={consents} />
      ) : screen === "rehab" ? (
        <RehabView onNote={(pid, note) => setNotes((all) => ({ ...all, [pid]: upsertSessionNote(all[pid] ?? [], note) }))} onOpen={openPatient} people={everyone} desk={wardRehabDesk(dept.rehab, everyone)} onDesk={dept.setRehab} nowTime={nowTime} today={today} />
      ) : screen === "path" ? (
        <PathologyView people={everyone} cases={dept.pathology} onCases={dept.setPathology} acks={acks} nowTime={nowTime} today={today} />
      ) : screen === "handoff" ? (
        <HandoffView
          people={people}
          today={today}
          nowTime={nowTime}
          handoffs={handoffs}
          saved={workspace.isSaved("handoffs", handoffs)}
          extraFacts={Object.fromEntries(
            people.map((x) => {
              const pid = x.patient.id;
              const r = resultState[pid];
              const notTaken = allTakeRows.filter((t) => t.patientId === pid && !isRowTaken(t));
              return [
                pid,
                [
                  ...(r?.unseen ? [`医師が未確認の結果：${r.unseen}件${r.panic ? `（パニック値 ${r.panic}件）` : ""}`] : []),
                  ...(notTaken.length ? [`指示受けがまだ：${notTaken.length}件（${notTaken.map((t) => `${t.kind === "変更" ? "【変】" : t.kind} ${t.main}${t.flags.urgent ? "・至急" : ""}${takeHolds[t.key] && !takeHolds[t.key].answer ? "・医師に確認中" : ""}`).join("／")}）`] : []),
                ],
              ];
            }),
          )}
          onSave={(h) => setHandoffs((all) => ({ ...all, [handoffKey(h.patientId, h.shiftLo ?? 0, h.role)]: h }))}
          onSend={(h) => {
            auditLog({ role: me.role, actor: me.name, action: "確定（申し送りを送った）", patient: findPatient(h.patientId)?.name, detail: `${h.shift}　${h.severity}　やること ${h.actions.length}件` });
            setHandoffs((all) => ({ ...all, [handoffKey(h.patientId, h.shiftLo ?? 0, h.role)]: h }));
          }}
          onReceive={(h) => {
            auditLog({ role: me.role, actor: h.to ?? me.name, action: "確定（申し送りを受けた・復唱）", patient: findPatient(h.patientId)?.name, detail: h.synthesis });
            setHandoffs((all) => ({ ...all, [handoffKey(h.patientId, h.shiftLo ?? 0, h.role)]: h }));
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
          diagnoses={diagnoses} today={today}
          nowAbs={abs(0, nowTime)}
          surgeries={surgeries} initialAnesthesiaTab={anesthesiaTab?.tab} initialAnesthesiaPatientId={anesthesiaTab?.patientId}
          onRecord={(pid, text, sid) => setNotes(all => ({...all,[pid]:upsertAnesthesiaNote(all[pid]??[],{kind:"note",id:`anesthesia:${sid}`,day:0,time:nowTime,author:me.name,role:me.role,text})}))}
          postopOrders={{lines:standingLines,onAdd:(pid,text,cat)=>addStandingLine(pid,{id:newId(),cat,text,start:{day:0,time:nowTime},by:me.name,at:{day:0,time:nowTime}})}}
          onNote={chartNote} physio={dept.physioDesk} consents={consents} onConsent={(r) => setConsents(all => all.some(c => c.id === r.id) ? all.map(c => c.id === r.id ? r : c) : [...all, r])}
          onFasting={(pid, text) => addStandingLine(pid, { id: newId(), cat: "食事", text, start: { day: 0, time: nowTime }, by: me.name, at: { day: 0, time: nowTime } })}
          people={examPeople}
          onSave={(x) => {
            auditLog({ role: me.role, actor: me.name, action: x.status === "申込" ? "確定（手術申込）" : "手術室の記録", patient: x.name, detail: `${x.procedure} ${x.room ?? ""} ${x.start ?? ""}` });
            if (x.anesthesiaCase) setIo(all => [...all.filter(e=>!e.id.startsWith(`anesthesia:${x.id}:`)),...anesthesiaIo(x,me.name,nowTime)]);
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
      ) : screen === "pharmacy" || pharmacyFocus ? (
        <PharmacyView expiryNotice={expiryNotice} key={pharmacyFocus ? `${pharmacyFocus.patientId}:${pharmacyFocus.tab}` : "department"} initialTab={pharmacyFocus?.tab} patientId={pharmacyFocus?.patientId} onClose={pharmacyFocus ? () => setPharmacyFocus(null) : undefined}
          people={people}
          dischargedPeople={dischargedPeople}
          today={today}
          nowTime={nowTime}
          audited={audited}
          onAudit={(id) => {
            orderUnlocks.relock(id);
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
                return { ...all, [pid]: { ...cur, yakuzaiShido: [...cur.yakuzaiShido, { day: 0, kind: rec.kind, ...(rec.mayaku ? { mayaku: true } : {}) }] } };
              });
            }
            auditLog({ role: me.role, actor: me.name, action: "確定（服薬指導）", patient: findPatient(pid)?.name, detail: `区分${rec.kind}${rec.mayaku ? "・麻薬管理指導加算" : ""}` });
            // Into the chart as the pharmacist's note, answering an open 服薬指導 request.
            const pe = people.find((x) => x.patient.id === pid)?.entries ?? [];
            recordGuidance(pid, { kind: "服薬指導", heard: "本人", minutes: null, text: `（薬剤管理指導 区分${rec.kind}）${rec.text}`, answers: openRequests(pe, "服薬指導", guidance).map((e) => e.id) }, true);
            setShido((all) => ({ ...all, [pid]: [...(all[pid] ?? []), { ...rec, day: 0, at: nowTime }] }));
          }}
          dispensed={dispensed}
          onDispense={(key) => { orderUnlocks.relock(key.split("|")[0]); setDispensed((d) => ({ ...d, [key]: nowTime })); }}
          oralRx={oralRx}
          onOralRx={(key, rec) => setOralRx((all) => ({ ...all, [key]: rec }))}
          narcoticPatientNames={Object.fromEntries([...patientById.values()].map(p => [p.id, p.name]))}
          narcBook={narcBook}
          onNarcBook={setNarcBook}
          newId={newId}
          txIssued={txIssued}
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
      ) : screen === "recent" ? (
        <RecentPatients list={recentList} patient={findPatient} onOpen={openPatient} onClear={() => setRecentList([])} />
      ) : screen === "favorites" ? (
        <FavoritePatients patient={findPatient} nowTime={nowTime} changes={sessionChanges} waiting={waiting} resultState={resultState} extraFlags={listFlags} diagnoses={diagnoses} onOpen={openPatient} />
      ) : listKey === "mine" && role === "療法士" ? (
        <RehabPatients people={everyone} desk={dept.rehab} me={me.name} onOpen={openPatient} />
      ) : listKey ? (
        <div className="flex min-h-0 flex-1 flex-col">
        <PatientList
          // A new list when 全病棟 is chosen or left, so it starts grouped by ward (or by room).
          key={listKey === "all" && !allWards ? "all-one" : listKey}
          ward={{ beds: listAsOf ? listAsOf.beds : lists[listKey].beds, patient: findPatient }}
          title={lists[listKey].title}
          pick={lists[listKey].pick}
          doctorsOf={doctorsFor}
          viewer={role === "医師" ? me.name : undefined}
          defaultGroup={lists[listKey].group}
          dayNav={listAsOf ? dayNavFor(listAsOf) : undefined}
          asOf={listAsOf ?? undefined}
          nowTime={nowTime}
          changes={sessionChanges}
          summaries={summaries}
          waiting={waiting}
          resultState={resultState}
          extraFlags={listFlags}
          expiryDone={stickies}
          mine={isMine}
          today={today}
          dpcPayload={(id) => {
            const p = findPatient(id);
            return p ? claimPayloadOf(p) : null;
          }}
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
          onInfo={(id) => (openPatient(id), setPanel("patient-info"))}
          onOpenAt={openAt}
        />
        </div>
      ) : patient && limitNow && !inTeamNow && !grantNow ? (
        <GlassStep
          patient={patient}
          me={me.name}
          onOpen={(reason, note) => {
            setGlass((all) => [...all, { id: newId(), patientId: patient.id, by: me.name, role: me.role, at: { day: 0, time: nowTime }, reason, note: note.trim() }]);
            auditLog({ role: me.role, actor: me.name, action: `閲覧制限の患者を開いた（${reason}）`, patient: patient.name, detail: note.trim() || undefined, restricted: true });
          }}
          onBack={() => {
            auditLog({ role: me.role, actor: me.name, action: "閲覧制限の患者を開かずに戻った", patient: patient.name, restricted: true });
            closePatient(patient.id);
          }}
        />
      ) : patient && ctx ? (
        <>
          <PatientSwitchFlash patient={{ id: patient.id }} />
          {me.role === "診療放射線技師" && <button type="button" onClick={() => openArea("radiology")} className="self-start px-4 py-1 text-sm text-ai underline">放射線部へ戻る</button>}
          <ConsultBanner entries={entries} replies={consultReplies} onOpen={() => setPanel("add-consult")} />
          {role === "MSW" && <LifeSupportOverview coordination={evals[patient.id]?.coordination} value={lifeWithIntake(evals[patient.id]?.lifeSupport, anamnesis[patient.id]?.fields)} onOpen={() => setPanel("life-support")} adjustment={transferAsks.filter(a => a.patientId === patient.id).map(a => `${a.facility}：${a.state}`).join(" ／ ")} />}
          <PatientBar
            roomLabel={workOf(patient.id)?.room}
            rest={standingNow(patient.id)?.rest}
            admissionMissing={requests.some((r) => r.status === "入院済" && r.admittedAs === patient.id) ? admissionMissingNow(standing[patient.id] ?? [], standingLines[patient.id] ?? [], diets.filter((d) => d.patientId === patient.id), nowTime) : []}
            onOpenStanding={role === "医師" ? () => setPanel("standing") : undefined}
            patient={patient}
            today={today}
            diagnoses={diagnoses[patient.id] ?? []}
            directive={currentDirective(directives, patient.id)}
            onOpenDiagnoses={() => setPanel("diagnoses")}
            onOpenDirective={() => setPanel("directive")}
            onOpenDiet={() => setPanel("diet")}
            onOpenProfile={() => setPanel("profile")}
            doctors={doctorsFor(patient.id, entries)}
            onOpenDoctors={() => setDoctorsOpen(true)}
            onOpenInfo={() => setPanel("patient-info")}
            insurance={insuranceRecords(iji.insurance, patient.id).at(-1)?.insurance ?? null}
            actions={
              <>
                {orderMode !== "none" && (
                  <button type="button" disabled={!ordersReady && !noteReady} onClick={() => presence.guard(patient.id, "オーダの確定", () => { if (noteReady && !deny("note")) confirmNote(); if (ordersReady) confirm(); })} title="貯めたオーダを飛ばし、記事も保存する（カルテは開いたまま）" className={`rounded-md border px-3 py-1.5 text-sm font-bold disabled:opacity-40 ${orderMode === "verbal" ? "border-yamabuki text-yamabuki" : "border-ink text-ink hover:bg-paper"}`}>
                    <Send size={14} aria-hidden className="mr-1 inline-block align-[-2px]" />
                    {orderMode === "verbal" ? "口頭指示で" : ""}オーダー{chart.drafts.length ? ` ${chart.drafts.length}` : ""}
                  </button>
                )}
                {!deny("note") && (
                  <button
                    type="button"
                    onClick={() =>
                      presence.guard(patient.id, "保存", () => {
                        if (noteReady) confirmNote();
                        if (ordersReady) confirm();
                        // A draft with checks left stays in this chart's drafts; the chart is closed either way.
                        closePatientNow(patient.id);
                      })
                    }
                    title="記事とオーダを保存して、このカルテを閉じる"
                    className="rounded-md bg-ink px-4 py-1.5 text-sm font-bold text-white hover:bg-ink/90 disabled:opacity-40"
                  >
                    <Save size={14} aria-hidden className="mr-1 inline-block align-[-2px]" />
                    保存して閉じる
                  </button>
                )}
              </>
            }
            onPregnancy={
              deny("vitals")
                ? undefined
                : (v) => {
                    auditLog({ role: me.role, actor: me.name, action: v ? "確定（妊娠中の印）" : "妊娠中の印を外した", patient: patient.name, detail: v?.weeks ? `${v.weeks}週` : undefined });
                    setPregnancy((all) => ({ ...all, [patient.id]: v }));
                  }
            }
          />
          {(() => {
            const v = visitOf(patient.id);
            if (!v) return null;
            const vid = v.kind === "er" ? v.er.id : v.op.id;
            return (
              <VisitStrip
                visit={v}
                request={requests.find((r) => `${r.from.kind}:${r.from.id}` === patient.id && r.status !== "取消")}
                revisit={v.kind === "opd" ? revisits[v.op.id] : undefined}
                rxCount={v.kind === "opd" ? visitPrescriptions(ordersOf(entries), opdRx[v.op.id] ?? []).length : 0}
                paid={opdBills[patient.id] ? { yen: opdBills[patient.id].yen, time: opdBills[patient.id].at.time } : undefined}
                onOpenBill={v.kind === "opd" ? () => setPanel("opd-bill") : undefined}
                fmtDay={(d) => formatShort(addDays(today, d))}
                canOrder={!deny("order")}
                onStatus={(st) => {
                  if (v.kind === "er") setEr((list) => list.map((x) => (x.id === vid ? { ...x, status: st as ErStatus } : x)));
                  else setOpd((list) => list.map((x) => (x.id === vid ? { ...x, status: st as OpdStatus } : x)));
                }}
                onOpenRequest={() => setPanel("visit-request")}
                onCancelRequest={(id) => {
                  auditLog({ role: me.role, actor: me.name, action: "入院申込を取り消した", patient: patient.name });
                  setRequests((rs) => rs.map((r) => (r.id === id ? { ...r, status: "取消" } : r)));
                }}
                onOpenChart={openPatient}
                onOpenRx={() => openOrder("add-rx")}
                onOpenRevisit={() => setPanel("opd-booking")}
              />
            );
          })()}
          <PatientWindowProvider patientKey={`${patient.id}:${desk}`} key={`${patient.id}:${desk}`} focusKey={panel ? `panel:${panel}` : null} focusVersion={panelActivation} focusTabs={zOrder}><WindowTray />
          {(role === "医師" || role === "薬剤師" || role === "看護師") && <RxExpiryStrip key={patient.id} patient={patient} entries={ordersOf(entries)} today={today} doctor={role === "医師" && !deny("order")} sender={me.name.includes(role) ? me.name : `${role} ${me.name}`} stickies={stickies[patient.id] ?? []} pending={pendingExtends} onExtend={extendDraft} onSticky={st => setStickies(all => ({ ...all, [patient.id]: [...(all[patient.id] ?? []).filter(s => s.id !== st.id), st] }))} onRemove={id => setStickies(all => ({ ...all, [patient.id]: (all[patient.id] ?? []).filter(s => s.id !== id) }))} />}
          <StickyStrip
            stickies={visibleDiseaseStickies(visibleExpiryStickies(stickies[patient.id] ?? [], rxExpiries(patient, ordersOf(entries), today)), diseaseRequestInput(claimPayloadOf(patient), isoDate(today), nowTime))}
            onDiagnoses={() => setPanel("diagnoses")}
            nowTime={nowTime}
            newId={newId}
            onAdd={(st) => setStickies((all) => ({ ...all, [patient.id]: [...(all[patient.id] ?? []), st] }))}
            onRemove={(id) => setStickies((all) => ({ ...all, [patient.id]: (all[patient.id] ?? []).filter((x) => x.id !== id) }))}
          />
          {limitNow && <LimitStrip limit={limitNow} inTeam={inTeamNow} grant={grantNow} fmtDay={(d) => formatShort(addDays(today, d))} />}
          <PresenceStrip peers={presence.on(patient.id)} editors={presence.editorsOn(patient.id)} />
          <ImagingConsentProvider patient={patient} today={today} records={consents}><WindowEntryContext.Provider key={`${patient.id}:${desk}`} value={{ scope: `${patient.id}:${desk}`, entries: windowEntries, setEntries: setWindowEntries }}><DrawerDefaults.Provider value={{ panel, windowed: WINDOW_PANELS }}>
          <ResizableChart
            data-drawer-bounds
            className={`grid min-h-0 flex-1 ${
              // Narrow screens (iPad held upright) drop the date column; the record still scrolls by day. The other left tabs take more width.
              chart.leftView !== "record"
                ? "grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_auto] lg:grid-cols-[150px_minmax(0,1.6fr)_minmax(0,1fr)_auto]"
                : "grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_auto] lg:grid-cols-[150px_minmax(0,1fr)_minmax(0,1.2fr)_auto]"
            }`}
          >
            <div className="hidden min-h-0 lg:block">
              <DateTree patient={patient} entries={shownEntries ?? entries} today={today} selectedDay={chart.selectedDay} onSelect={(d) => update({ selectedDay: d })} visits={opdVisitsOf(patient)} planned={plannedItems(entries, surgeries.filter((x) => x.patientId === patient.id))} />
            </div>
            {panel === "billing" ? (
              <div className="col-span-2 flex min-h-0 flex-col">
                <BillingView surgeries={surgeries.filter(s => s.patientId === patient.id)} diseaseRequests={stickies} onDiseaseRequest={requestDisease}
                  key={patient.id}
                  patient={patient}
                  entries={billedEntries}
                  diagnoses={diagnoses[patient.id] ?? []}
                  today={today}
                  nowTime={nowTime}
                  options={billing[patient.id] ?? DEFAULT_OPTIONS}
                  diets={diets}
                  letters={lettersOf(patient.id)}
                  notGiven={notGivenOf(patient.id)}
                  insulinGiven={insulinGivenForBilling(mar, patient.id)}
                  onOptions={(next) => {
                    // What changed in the claim's options, for the audit log (医事課 and doctors change them).
                    const cur = billing[patient.id] ?? DEFAULT_OPTIONS;
                    const changed = (Object.keys(next) as (keyof typeof next)[]).filter((k) => JSON.stringify(next[k]) !== JSON.stringify(cur[k]));
                    if (changed.length) auditLog({ role: me.role, actor: me.name, action: "算定の設定を変えた", patient: patient.name, detail: changed.map((k) => `${k}: ${JSON.stringify(cur[k] ?? null)} → ${JSON.stringify(next[k])}`).join("、") });
                    setBilling((all) => ({ ...all, [patient.id]: next }));
                  }}
                  wardPayload={() => teamPatients.map(claimPayloadOf)}
                  insurance={insuranceRecords(iji.insurance, patient.id)}
                  onRegister={(r) => setIji((d) => withInsurance(d, patient.id, r))}
                  settlement={iji.settled[patient.id]}
                  onSettle={(s) => setIji((d) => withSettlement(d, patient.id, s))}
                />
              </div>
            ) : (
              <>
            <ConsultContext.Provider value={consultReplies}><ReportContext.Provider value={{ ris: dept.ris, reports: reportsHere, labs: deskLabs(labDesk, patient.id).map((lab) => ({ lab, orderId: labDesk.reports[lab.id!].orderId })), acks, today, onSeen: deny("result.ack") ? undefined : (keys) => markSeen(patient.id, keys), onOpenImage: openReportImage }}>
            <HistoryPane
              onShown={setShownEntries}
              patient={patient}
              coedit={presence.coedit}
              entries={entries}
              today={today}
              selectedDay={chart.selectedDay}
              showStopped={chart.showStopped}
              onToggleStopped={() => update({ showStopped: !chart.showStopped })}
              focus={chart.recordFocus}
              visits={opdVisitsOf(patient)}
              planned={plannedItems(entries, surgeries.filter((x) => x.patientId === patient.id))}
              nowTime={nowTime}
              view={chart.leftView}
              onView={(v) => update({ leftView: v })}
              onFloat={(v) => (v === "results" ? setPanel("results") : openRight(v === "flowsheet" ? "flowsheet" : v === "rx-history" ? "rxcal" : "injcal"))}
              views={{
                ...refPropsOf(patient),
                onNewInjection: !deny("order") ? newInjection : undefined,
                pendingNew: pendingNewInj,
                results: {
                  pending: pendingDraws(drawRows(people, mar, labDesk, sessionStart ?? abs(0, nowTime), abs(0, nowTime)), patient.id, abs(0, nowTime)),
                  onExport: (what, n) => auditLog({ role: me.role, actor: me.name, action: `検査結果の${what}`, patient: patient.name, detail: `${n}回分` }),
                  focusAt: resultFocus ?? undefined,
                },
              }}
              onDo={doFromHistory}
              execute={executeProps}
              takeBadgeOf={(id) => orderTakeBadge(id, allTakeRows.filter((r) => r.patientId === patient.id && r.keys.some((k) => sessionKeys.has(k))), takeCtx)}
              onOpenImage={(id) => {
                setImageFocus(id);
                setPanel("imaging");
              }}
              onOpenResult={(at) => {
                setResultFocus(at);
                setPanel("results-timeline");
              }}
              onReviseNote={(e, text, reason, by) => {
                const next = reviseNote(e, text, by ?? me.name, { day: 0, time: nowTime }, reason);
                setRevised((all) => ({ ...all, [patient.id]: { ...(all[patient.id] ?? {}), [noteKey(e)]: next } }));
                auditLog({ role: me.role, actor: me.name, action: `確定（記事の修正・第${next.versions!.length}版）`, patient: patient.name, detail: `${e.time} の記事　理由：${reason.trim()}${by ? `　一緒に直した人：${by}` : ""}` });
                if (resident) setCosign((all) => noteRevised(all, { ref: noteKey(e), patientId: patient.id, by: me.name, at: { day: 0, time: nowTime }, text: text.trim() }, newId));
              }}
            />
            </ReportContext.Provider></ConsultContext.Provider>
            <div
              className={`relative flex min-h-0 flex-col ${dropping ? "ring-2 ring-inset ring-ai" : ""}`}
              onDragOver={(e) => {
                if (!e.dataTransfer.types.includes(DO_MIME) && !e.dataTransfer.types.includes(LAB_RESULT_MIME)) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "copy";
                if (!dropping) setDropping(true);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropping(false);
              }}
              onDrop={(e) => {
                const result = readLabTransfer(e.dataTransfer.getData(LAB_RESULT_MIME));
                if (result) { e.preventDefault(); setDropping(false); requestLabPaste(result, e.shiftKey); return; }
                const d = readDo(e);
                setDropping(false);
                if (!d) return;
                e.preventDefault();
                doFromHistory(d);
              }}
            >
              <LabPasteReceiver key={patient.id} patientId={patient.id} onPaste={text => { update(c => ({ note: `${c.note.replace(/\s*$/, "")}\n${text}\n` })); openRight("note"); setPanel(null); }} />
              {dropping && <div className="pointer-events-none absolute inset-x-0 top-0 z-30 bg-ai px-3 py-1 text-center text-[12px] font-bold text-white">ここで離すと記事へ写します</div>}
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
                  // All 中止 (or nothing to order): nothing to confirm, so it is 指示済 now.
                  setReports((rs) => rs.map((x) => (x.id === r.id ? { ...x, rows, status: made.length ? "指示の下書き" : "指示済" } : x)));
                }}
              />
              <RightTabs
                open={chart.openTabs}
                value={chart.rightTab}
                floating={(Object.keys(floating) as RightTab[]).filter((t) => floating[t])}
                onChange={(t) => {
                  if (floating[t]) return toFront(t);
                  update({ rightTab: t });
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
                onClose={(t) => {
                  setFloating((f) => ({ ...f, [t]: undefined }));
                  update((c) => ({ openTabs: c.openTabs.filter((x) => x !== t), rightTab: c.rightTab === t ? "note" : c.rightTab }));
                }}
                counts={{
                  note: chart.drafts.length,
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
                    compact={emptyCalendar(t, entries)}
                    win={floating[t]}
                    z={Math.max(0, zOrder.indexOf(t))}
                    dockedClass={dockedClass}
                    onMove={(w) => {
                      setFloating((f) => ({ ...f, [t]: w }));
                      // A calendar's window is remembered in this browser only (this device).
                      if (WINDOW_TABS.has(t)) keepWin(t, w);
                    }}
                    onClose={() => {
                      setFloating((f) => ({ ...f, [t]: undefined }));
                      update((c) => ({ openTabs: c.openTabs.filter((x) => x !== t), rightTab: c.rightTab === t ? "note" : c.rightTab }));
                    }}
                    onFront={() => toFront(t)}
                  >
                    {children}
                  </Dockable>
                );

                // The reading windows (経過表・内服・処置・移動・食事・指示簿・予約): what each shows and does.
                const refProps = refPropsOf(patient);
                return (
                  <>
                    {docked === null && <p className="flex-1 bg-sheet p-6 text-sm text-ink-faint">右の欄のタブは、別ウインドウで表示しています。</p>}
                    {dock(
                      "note",
                      "記事作成",
                      "flex min-h-0 flex-1 flex-col",
                      <TodayPane
                        orderSlot={<>
                    {/* Other tools can open while these entry windows keep their unfinished Rp. */}
                    {orderWins.includes("add-injection") && (
                      <InlineOrder key={`injection:${patient.id}:${desk}`} title="注射オーダ" onClose={() => setOrderWins((v) => v.filter((k) => k !== "add-injection"))}>
                          <fieldset disabled={!!orderBlock} className="m-0 min-w-0 border-0 p-0">
                            <AddInjectionPanel
                              patientId={patient.id}
                              key={patient.id}
                              newId={newId}
                              drafts={chart.drafts}
                              seed={chart.injSeed}
                              memory={injMemory}
                              onAdd={(ds) => { setOrderWins((v) => v.filter((k) => k !== "add-injection")); update((c) => ({ drafts: [...c.drafts, ...ds], rightTab: floating.note ? c.rightTab : "note", flash: `注射 ${ds.length} Rp を記事の下に入れました。確かめて確定してください。` })); if (ds[0]) focusDraftLine(ds[0].id); }}
                            />
                          </fieldset>
                      </InlineOrder>
                    )}
                    {orderWins.includes("add-rx") && (
                      <InlineOrder key={`rx:${patient.id}:${desk}`} title="処方オーダ" onClose={() => setOrderWins((v) => v.filter((k) => k !== "add-rx"))}>
                          <fieldset disabled={!!orderBlock} className="m-0 min-w-0 border-0 p-0">
                            <AddRxPanel
                              patient={patient}
                              outpatient={visitOf(patient.id)?.kind === "opd"}
                              ward={patient.ward}
                              key={patient.id}
                              newId={newId}
                              drafts={chart.drafts}
                              seed={chart.rxSeed}
                              memory={{
                                patterns: patternsOf([...PAST_RX, ...allPatients.flatMap((x) => currentEntries(x, sessionChanges[x.id]).flatMap((entry) => (entry.kind === "order" && entry.author === me.name ? [{ patientId: x.id, entry }] : [])))]),
                                previous: previousOf(patient.id, entries.filter((x): x is OrderEntry => x.kind === "order")),
                                me: me.name,
                              }}
                              onAdd={(ds) => { if (visitOf(patient.id)?.kind !== "opd") setOrderWins((v) => v.filter((k) => k !== "add-rx")); update((c) => ({ drafts: [...c.drafts, ...ds], rightTab: floating.note ? c.rightTab : "note", flash: "記事の下の処方オーダの下書きに入りました" })); if (ds[0]) focusDraftLine(ds[0].id); }}
                            />
                          </fieldset>
                          {(() => { const v = visitOf(patient.id); return v?.kind === "opd" ? <OpdRxAfter op={v.op} entries={entries.filter((e): e is OrderEntry => e.kind === "order")} legacy={opdRx[v.op.id] ?? []} insuranceBook={iji.insurance} today={today} nowTime={nowTime} national={national} onRegistered={(r) => setNational((all) => [...all, r])} /> : null; })()}
                      </InlineOrder>
                    )}
                    {(orderWins.includes("add-discharge") || panel === "add-discharge") && <InlineOrder title="退院オーダ" onClose={() => { setOrderWins(v => v.filter(k => k !== "add-discharge")); closePanelWindow("add-discharge"); }}>
                      <fieldset disabled={!!orderBlock} className="m-0 min-w-0 border-0 p-0">
                        <AddLeavePanel key={`discharge-${leavePreset}`} newId={newId} kinds={["退院"]} initialDay={leavePreset} onAdd={d => { addManualLab(d); setOrderWins(v => v.filter(k => k !== "add-discharge")); closePanelWindow("add-discharge"); }} />
                      </fieldset>
                    </InlineOrder>}
                        </>}
                        sharedNoteTemplates={sharedNoteTemplates} onSharedNoteTemplates={setSharedNoteTemplates}
                        onOpenRecordTemplates={() => setPanel("templates")}
                        patient={patient}
                        icu={visibleIcuRecords(icu, abs(0, nowTime))}
                        today={today}
                        nowTime={nowTime}
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
                        onContactDoctor={() => {
                          if (!chart.contactVital) return;
                          const n = vitalsContact(chart.flash, patient, me.name, nowTime, newId(), chart.contactVital);
                          if (!n) return;
                          setCallNotes((all) => [...all, n]);
                          auditLog({ role: me.role, actor: me.name, action: "主治医へ連絡（模擬）", patient: patient.name, detail: n.text });
                          chartNote(patient.id, `【通話・模擬】${n.from} → ${n.to}：${n.text}`);
                          update({ note: contactDraft(chart.note, chart.contactVital, news2(chart.contactVital).total, patient.attending), rightTab: "note", flash: "主治医への連絡を記録しました（模擬）。記事の下書きを確かめて保存してください。" });
                        }}
                        onDraft={requestDrafts}
                        onApply={(next) => update((c) => ({ drafts: c.drafts.map((d) => (d.id === next.id ? next : d)), flash: null }))}
                        onReorder={(ids) => update((c) => ({ drafts: ids.map((id) => c.drafts.find((d) => d.id === id)!).filter(Boolean) }))}
                        onRemove={(id) => {
                          auditLog({ role: me.role, actor: me.name, action: "下書きを消した", patient: patient.name, detail: chart.drafts.find((d) => d.id === id)?.sourceText });
                          update((c) => ({ drafts: c.drafts.filter((d) => d.id !== id) }));
                          releaseReport(id);
                        }}
                        onRedo={(id) => {
                          releaseReport(id);
                          update((c) => {
                            const d = c.drafts.find((x) => x.id === id);
                            return {
                              drafts: c.drafts.filter((x) => x.id !== id),
                              instruction: d ? (c.instruction ? `${c.instruction}。${d.sourceText}` : d.sourceText) : c.instruction,
                            };
                          });
                        }}
                        onConfirm={() => presence.guard(patient.id, "オーダの確定", confirm)}
                        orderMode={orderMode}
                        noteAt={chart.noteAt ?? null}
                        onNoteAt={(a) => update({ noteAt: a })}
                        onConfirmNote={() => presence.guard(patient.id, "記事の確定", confirmNote)}
                      />,
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
                          onAdjustInsulin={refProps.onAdjustInsulin}
                          onStopDraft={(e, time) => addStopDraft(e, undefined, 0, time)}
                          draftedStops={chart.drafts.flatMap((d) => (d.kind === "stop" && d.targetOrderId ? [d.targetOrderId] : []))}
                          onExtendDraft={!deny("order") ? extendDraft : undefined}
                          onModify={!deny("order") ? modifyOrder : undefined}
                          pendingExtends={pendingExtends}
                          pendingStopTimes={stopTimesOf(chart.drafts, nowTime)}
                          marOf={(id, at) => mar[`${id}|${at}`]}
                          execute={executeProps}
                          onNewInjection={!deny("order") ? newInjection : undefined}
                          pendingNew={pendingNewInj}
                          onToggleDose={deny("order") ? undefined : toggleDose}

                        />,
                      )}
                    {chart.openTabs.filter(isRefTab).map((t) => dock(t, RIGHT_TABS[t].label, "flex min-h-0 flex-1 flex-col bg-sheet", <RefWindow tab={t} {...refProps} />))}
                  </>
                );
              })()}
              {panelWindows.map((panel) => {
                const closePanel = () => { closePanelWindow(panel); setFlowReq(null); };
                return <DrawerDefaults.Provider key={panel} value={{ panel, windowed: WINDOW_PANELS }}>
              {panel === "life-support" && <Drawer title="生活・制度" onClose={closePanel} locked={deny("assess.discharge")} wide><LifeSupportForm key={patient.id} value={lifeWithIntake(evals[patient.id]?.lifeSupport, anamnesis[patient.id]?.fields)} onSave={v => { if (deny("assess.discharge")) return; setEvals(all => ({ ...all, [patient.id]: { ...(all[patient.id] ?? { patientId: patient.id }), lifeSupport: v } })); chartNote(patient.id, `生活・制度\n${lifeLines(v).join("\n")}\n返答待ち：${v.waiting ? "あり" : "なし"}`); }} /></Drawer>}
              {panel === "msw-support" && <Drawer title="退院支援" onClose={closePanel} locked={deny("assess.discharge")} wide><DischargeForm key={patient.id} w={workOf(patient.id) ?? { patient, room: patient.room, entries: [] }} ev={evals[patient.id] ?? { patientId: patient.id }} today={today} nowTime={nowTime} onSave={(e, what) => { if (deny("assess.discharge")) return; setEvals(all => ({ ...all, [patient.id]: e })); chartNote(patient.id, what); }} /></Drawer>}
              {panel === "msw-interview" && <Drawer title="面談記録" onClose={closePanel} wide><MswInterview onSave={text => { if (!deny("note")) chartNote(patient.id, text); }} today={isoDate(today)} nowTime={nowTime} /></Drawer>}
              {panel === "diagnoses" && (
                <Drawer title="病名" onClose={closePanel} wide locked={deny("diagnosis")}>
                  <DiagnosisPanel
                    diagnoses={diagnoses[patient.id] ?? []}
                    department={patient.department}
                    canConfirm={me.role === "医師"}
                    unmatched={diagnosisUnmatched[patient.id] ?? []}
                    admittedOn={patient.admittedOn}
                    today={today}
                    newId={newId}
                    onChange={(next) => setDiagnoses((all) => ({ ...all, [patient.id]: next }))}
                  />
                </Drawer>
              )}
              {panel === "add-pathology" && (
                <Drawer title="病理の依頼" onClose={closePanel} locked={deny("order")}>
                  <PathRequestPanel patientId={patient.id} patientName={patient.name} cases={dept.pathology} onAdd={(c) => dept.setPathology((cs) => [...cs, c])} nowTime={nowTime} />
                </Drawer>
              )}
              {panel === "team" && (
                <Drawer title="チーム医療（依頼・回診・提案の採否）" onClose={closePanel} wide>
                  <TeamPanel patientId={patient.id} patientName={patient.name} desk={care.teams} onDesk={care.setTeams} today={today} nowTime={nowTime} />
                </Drawer>
              )}
              {panel === "rehab-progress" && (
                <Drawer title="リハビリの経過" onClose={closePanel} wide>
                  <RehabProgressPanel onNote={(pid, note) => setNotes(all => ({ ...all, [pid]: upsertSessionNote(all[pid] ?? [], note) }))} patient={patient} entries={entries} desk={dept.rehab} onDesk={dept.setRehab} today={today} nowTime={nowTime} />
                </Drawer>
              )}
              {panel === "reports" && (
                <Drawer title="病理・生理検査の報告" onClose={closePanel} wide>
                  <DeptReportsPanel patientId={patient.id} patientName={patient.name} entries={entries.filter((e): e is OrderEntry => e.kind === "order")} physio={dept.physioDesk} pathology={dept.pathology} acks={acks} today={today} onSeen={(keys) => markSeen(patient.id, keys)} />
                </Drawer>
              )}
              {panel === "report-list" && (
                <Drawer title="レポート一覧" onClose={closePanel} wide>
                  <ReportList reports={reportsHere} acks={acks} today={today} onSeen={deny("result.ack") ? undefined : (keys) => markSeen(patient.id, keys)} onOpenImage={openReportImage} />
                </Drawer>
              )}
              {panel === "visit-request" && visitOf(patient.id) && (
                <Drawer title="入院申込" onClose={closePanel}>
                  <RequestForm
                    visit={visitOf(patient.id)!}
                    me={me.name}
                    nowTime={nowTime}
                    newId={newId}
                    onCancel={closePanel}
                    onSend={(r) => {
                      auditLog({ role: me.role, actor: me.name, action: "確定（入院申込）", patient: r.name, detail: `${r.urgency}　${r.ward}　${r.diagnosis}` });
                      setRequests((rs) => [...rs, r]);
                      if (r.from.kind === "er") setEr((list) => list.map((x) => (x.id === r.from.id && x.status !== "入院済" ? { ...x, status: "入院依頼" } : x)));
                      closePanel();
                    }}
                  />
                </Drawer>
              )}
              {panel === "visit-rx" && visitOf(patient.id)?.kind === "opd" && (
                <Drawer title="外来処方" onClose={closePanel}>
                  <OpdRxPanel
                    allergies={patient.allergies}
                    memory={{ patterns: patternsOf(PAST_RX), previous: [], me: me.name }}
                    nowTime={nowTime}
                    newId={newId}
                    fmtDay={(d) => formatShort(addDays(today, d))}
                    rx={opdRx[patient.id.slice(4)] ?? []}
                    onRx={(lines, items) => {
                      const oid = patient.id.slice(4);
                      auditLog({ role: me.role, actor: me.name, action: "確定（外来処方・院外処方せん）", patient: patient.name, detail: lines.join("／").slice(0, 160) });
                      setOpdRx((all) => ({ ...all, [oid]: [...(all[oid] ?? []), { lines, items, by: me.name, at: nowTime }] }));
                      setNotes((all) => ({ ...all, [patient.id]: [...(all[patient.id] ?? []), { kind: "note", id: newId(), day: 0, time: nowTime, author: me.name, role: me.role, text: `処方（院外）：\n${lines.join("\n")}` }] }));
                    }}
                  />
                  {(() => {
                    // 電子処方箋（模擬）of the visit's confirmed prescriptions.
                    const v = visitOf(patient.id);
                    if (!v || v.kind !== "opd") return null;
                    const op = v.op;
                    const items = joinLines((opdRx[op.id] ?? []).map((r) => r.items ?? []));
                    // The visit's insurance is keyed by the chart id ("opd:◯"), like the 患者基本情報 window.
                    const { insurance, assumed } = insuranceFor(iji.insurance, { id: patient.id, age: op.age }, today);
                    return (
                      <div className="mt-4">
                        <ErxPanel key={JSON.stringify(items)} patient={{ id: op.id, name: op.name, kana: op.kana, sex: op.sex, birthDate: birthDateOf(op, today) }} patientKey={op.id} department={op.department} insurance={insurance} insuranceAssumed={assumed} lines={items} today={today} nowTime={nowTime} mode="外来" serial={nextSerial(national, today.y)} done={recordsOf(national, op.id)} onRegistered={(r) => setNational((all) => [...all, r])} />
                      </div>
                    );
                  })()}
                </Drawer>
              )}
              {panel === "opd-bill" && visitOf(patient.id)?.kind === "opd" && (
                <Drawer title={`外来の会計　${patient.name}`} onClose={closePanel} wide>
                  {(() => {
                    const v = visitOf(patient.id);
                    if (!v || v.kind !== "opd") return null;
                    return (
                      <OpdBillPanel
                        key={patient.id}
                        visit={v.op}
                        visitKey={patient.id}
                        entries={entries.filter((e): e is OrderEntry => e.kind === "order")}
                        rx={opdRx[v.op.id] ?? []}
                        records={insuranceRecords(iji.insurance, patient.id)}
                        today={today}
                        nowTime={nowTime}
                        settlement={opdBills[patient.id]}
                        book={opdBills}
                        unpaid={unpaidVisits(opd, opdBills)}
                        onOpenVisit={(id) => openVisit("opd", id)}
                        onOpenInsurance={() => setPanel("patient-info")}
                        onSettle={(s) => {
                          if (deny("settle")) return;
                          setOpdBills((all) => ({ ...all, [s.visitId]: s }));
                          setOpd((list) => list.map((x) => (x.id === v.op.id ? { ...x, status: "終了" } : x)));
                        }}
                      />
                    );
                  })()}
                </Drawer>
              )}
              {panel === "opd-booking" && (
                <Drawer title="外来予約" onClose={closePanel} locked={deny("order")}>
                  <OpdBookingPanel
                    today={today}
                    entries={entries.filter((e): e is OrderEntry => e.kind === "order")}
                    defaultDept={patient.department}
                    newId={newId}
                    fmtDay={(d) => formatShort(addDays(today, d))}
                    onAdd={(d) => {
                      update((c) => ({ drafts: [...c.drafts, d], rightTab: floating.note ? c.rightTab : "note", flash: "外来予約を記事の下に入れました。確かめて確定してください。" }));
                      closePanel();
                    }}
                  />
                </Drawer>
              )}
              {panel === "results" && (
                <Drawer title="検査結果" onClose={closePanel} wide expandable>
                  <ResultBrowser key={patient.id} patient={patient} today={today} items={unseenHere} extra={[...dept.results, ...care.results]} calls={calls} onSeen={(keys, response) => markSeen(patient.id, keys, response)} onTimeline={() => setPanel("results-timeline")} />
                </Drawer>
              )}
              {panel === "results-timeline" && (
                <Drawer title="検査時系列" onClose={closePanel} initialWidth={labWindowWidth(patient.labs.length)} expandable>
                  <button type="button" className="mb-3 rounded border border-rule px-3 py-1 text-sm" onClick={() => setPanel("results")}>検査結果一覧へ戻る</button>
                  <ResultsPanel
                    patient={patient}
                    today={today}
                    focusAt={resultFocus ?? undefined}
                    pending={pendingDraws(drawRows(people, mar, labDesk, sessionStart ?? abs(0, nowTime), abs(0, nowTime)), patient.id, abs(0, nowTime))}
                    onExport={(what, n) => auditLog({ role: me.role, actor: me.name, action: `検査結果の${what}`, patient: patient.name, detail: `${n}回分` })}
                  />
                </Drawer>
              )}
              {panel === "imaging" && (
                <Drawer title="放射線画像" onClose={closePanel} wide={!!patient.imaging.length || entries.some((e) => e.kind === "order" && !!dept.ris[e.id]?.images)}>
                  {teamIds.has(patient.id) && <RisChartStrip patient={patient} entries={entries} desk={dept.ris} onDesk={dept.setRis} acks={acks} nowTime={nowTime} onSeen={(keys) => markSeen(patient.id, keys)} />}
                  <ImagingPanel patient={patient} today={today} entries={entries} nowAbs={abs(0, nowTime)} focus={imageFocus ?? undefined} ris={dept.ris} />
                </Drawer>
              )}
              {panel === "active-orders" && (
                <Drawer title="有効なオーダ" onClose={closePanel}>
                  {verbalHere.length > 0 && !deny("order.sign") && (
                    <div className="mb-3 rounded-lg border border-rule bg-paper">
                  <VerbalInbox
                entries={entries.filter((e): e is OrderEntry => e.kind === "order")}
                today={today}
                nowAbs={abs(0, nowTime)}
              />
                    </div>
                  )}
                  <ActiveOrdersPanel entries={entries} today={today} lines={refPropsOf(patient).standingCal?.lines} />
                </Drawer>
              )}
              {panel === "monitor" && (
                <Drawer title="患者モニター" onClose={closePanel}>
                  <MonitorPanel
                    patient={patient}
                    nowTime={nowTime}
                    lockedWhy={deny("vitals")}
                    fmtDay={(d) => formatShort(addDays(today, d))}
                    onRecord={(v) => setExtraVitals((all) => ({ ...all, [patient.id]: [...(all[patient.id] ?? []), { ...v, recordedTime: nowTime }] }))}
                  />
                </Drawer>
              )}
              {panel === "take" && (
                <Drawer title="指示受け（この患者）" onClose={closePanel} wide locked={deny("mar")}>
                  {/* The doctor's view first (who took which change, questions to answer, the 指示票), then the nurses' table. */}
                  {role === "医師" && (
                    <TakeStatus
                      inDrawer
                      rows={allTakeRows.filter((r) => r.patientId === patient.id && (r.keys.some((k) => sessionKeys.has(k)) || takeRowOnDay(r, 0, entryOfRow(r, people))))}
                      taken={taken}
                      isTaken={isRowTaken}
                      holds={takeHolds}
                      confirms={takeConfirms}
                      slip={{ patient: { id: patient.id, name: patient.name, room: people.find((x) => x.patient.id === patient.id)?.room ?? patient.room }, today, nowTime, by: me.name }}
                      nowAbs={abs(0, nowTime)}
                      onAnswer={(key, text) => {
                        auditLog({ role: me.role, actor: me.name, action: "看護師の確認に回答", patient: patient.name, detail: text });
                        setTakeHolds((all) => ({ ...all, [key]: { ...all[key], answer: { by: me.name, at: nowTime, text } } }));
                      }}
                    />
                  )}
                  <TakeDesk
                    people={people.filter((x) => x.patient.id === patient.id)}
                    rows={allTakeRows.filter((r) => r.patientId === patient.id)}
                    taken={taken}
                    isTaken={isRowTaken}
                    holds={takeHolds}
                    confirms={takeConfirms}
                    nurses={[...new Set([...people.map((x) => nurseFor(x.room.replace(/[A-Z]$/, ""))), "看護師 田中", "看護師 渡辺", "看護師 佐藤"])]}
                    today={today}
                    nowTime={nowTime}
                    onTake={takeOrders}
                    onHold={holdOrder}
                    onConfirm={confirmOrder}
                    isMine={(room) => (planNow ? nurseOfBed(planNow, room, rosterNow!.nurses) === me.name : nurseFor(room.replace(/[A-Z]$/, "")) === me.name)}
                    onOpen={openPatient}
                    onSheet={() => goWard("sheet")}
                    onExecute={() => goWard("execute")}
                    records={mar}
                  />
                </Drawer>
              )}
              {panel === "cosign" && (
                <Drawer title="研修医の記録の確認（この患者）" onClose={closePanel}>
                  <CosignPanel items={cosign.filter((i) => i.patientId === patient.id)} meName={me.name} onConfirm={confirmCosign} />
                </Drawer>
              )}
              {panel === "vitals" && (
                <Drawer title="バイタル（看護師が入れる）" onClose={closePanel} locked={deny("vitals")}>
                  <VitalsPanel
                    initialOxygen={nursingOxygen({ ...patient, history: entries }, flowReq?.kind === "vitals" ? dayTime(flowReq.at).day : 0, flowReq?.kind === "vitals" ? dayTime(flowReq.at).time : nowTime)}
                    key={flowReq?.kind === "vitals" ? flowReq.at : "now"}
                    defaultAt={flowReq?.kind === "vitals" ? dayTime(flowReq.at) : undefined}
                    fmtDay={(d) => formatShort(addDays(today, d))}
                    nowTime={nowTime}
                    last={patient.vitals.at(-1)}
                    today={patient.daily.find((d) => d.day === 0)}
                    prevWeight={prevWeightOf(patient.daily)}
                    onOpenIo={() => setPanel("io")}
                    onDaily={(d) => {
                      auditLog({ role: me.role, actor: me.name, action: "確定（尿量・排便・食事・体重）", patient: patient.name, detail: [d.urineMl && `尿量 +${d.urineMl}mL`, d.stools && `排便 +${d.stools}回`, d.meal && `${["朝", "昼", "夕"][d.meal.slot]} ${d.meal.tenths}割`, d.weightKg !== undefined && `体重 ${d.weightKg}kg`].filter(Boolean).join("・") });
                      setExtraDaily((all) => ({ ...all, [patient.id]: addDaily(all[patient.id], d) }));
                    }}
                    onSave={(v) => {
                      auditLog({ role: me.role, actor: me.name, action: "確定（バイタル）", patient: patient.name, detail: `BT ${v.bt ?? "—"} HR ${v.hr ?? "—"} BP ${v.sbp ?? "—"}/${v.dbp ?? "—"} RR ${v.rr ?? "—"} SpO2 ${v.spo2 ?? "—"}　NEWS2 ${news2(v).total}` });
                      setExtraVitals((all) => ({ ...all, [patient.id]: [...(all[patient.id] ?? []), { ...v, recordedTime: nowTime }] }));
                      // 手応え: what was recorded (and NEWS2 in 朱 when 5 or more) at the foot of the right pane; the row is in 経過表.
                      update({ contactVital: v, flash: vitalsFlash(v, v.day === 0 ? undefined : formatShort(addDays(today, v.day)), standingNow(patient.id)) });
                      closePanel();
                    }}
                  />
                </Drawer>
              )}
              {panel === "tx-bedside" && (
                <Drawer title="輸血の実施（照合・観察・副反応）" onClose={closePanel} wide locked={deny("tx.bedside")}>
                  <TxBedsidePanel patient={patient} room={people.find((x) => x.patient.id === patient.id)?.room ?? patient.room} entries={entries.filter((e): e is OrderEntry => e.kind === "order")} bank={dept.bloodBank} onBank={dept.setBloodBank} recordBlood={recordBlood(patient.id)} nowTime={nowTime} onIo={addIo} onVoidIo={(lot, reason) => transfusionIoIds(io, patient.id, lot).forEach((id) => voidIo(id, reason))} />
                </Drawer>
              )}
              {panel === "icu" && <Drawer title="ICU 記録" onClose={closePanel} wide initialWidth={1200}><IcuPanel key={patient.id} patient={patient.id.startsWith("er:") && PATIENTS.some(p => p.id === patient.id.slice(3)) ? { ...patient, id: patient.id.slice(3) } : patient} records={visibleIcuRecords(icu, abs(0, nowTime))} onChange={next => setIcu(saved => retainFutureHourly(saved, next, abs(0, nowTime)))} entries={entries.filter((e): e is OrderEntry => e.kind === "order")} onOrder={ds => confirmDrafts(ds)} targets={standingNow(patient.id)?.other ?? ""} role={role} me={me} today={today} nowTime={nowTime} deny={deny} auditLog={auditLog} newId={newId}/></Drawer>}
              {panel === "io" && (
                <Drawer title="水分出納（IN/OUT）" onClose={closePanel} wide locked={deny("vitals")}>
                  <IoPanel
                    icu={icu}
                    key={flowReq?.kind === "io" ? flowReq.at : "now"}
                    defaultTime={flowReq?.kind === "io" ? ioTimeFor(flowReq.at, abs(0, nowTime)) : undefined}
                    patientId={patient.id}
                    entries={entries.filter((e): e is OrderEntry => e.kind === "order")}
                    typed={io.filter((e) => e.patientId === patient.id)}
                    records={mar}
                    sessionStart={sessionStart ?? abs(0, nowTime)}
                    nowTime={nowTime}
                    today={today}
                    standingIo={standingNow(patient.id)?.io ?? null}
                    legacyUrineMl={extraDaily[patient.id]?.urineMl}
                    onAdd={addIo}
                    onVoid={voidIo}
                    newId={newId}
                  />
                </Drawer>
              )}
              {panel === "flow-entry" && flowReq && flowReq.kind !== "vitals" && flowReq.kind !== "io" && (
                <Drawer title={flowReq.kind === "care" ? "看護ケア・観察の記録" : flowReq.kind === "mar" ? "与薬・実施の記録" : "指示受け"} onClose={closePanel} wide locked={deny("mar")}>
                  <FlowEntryPanel
                    req={flowReq}
                    person={people.find((x) => x.patient.id === patient.id) ?? { patient, room: patient.room, entries: entries.filter((e): e is OrderEntry => e.kind === "order") }}
                    today={today}
                    nowTime={nowTime}
                    sessionStart={sessionStart ?? abs(0, nowTime)}
                    interactive={!deny("mar")}
                    care={{ orders: careOrders, records: careRecords, plans: nursingPlans, onRecord: recordCare, onVoid: voidCareRecord }}
                    mar={{ records: mar, voided: marVoided, queried: Object.fromEntries(queries.filter((q) => q.patientId === patient.id && queryOpen(q, entries.filter((e): e is OrderEntry => e.kind === "order"))).map((q) => [q.orderId, q.question])), onRecord: recordMar, onVoid: voidMar }}
                    take={{
                      rows: allTakeRows.filter((r) => r.patientId === patient.id && r.keys.some((k) => sessionKeys.has(k))),
                      taken,
                      isTaken: isRowTaken,
                      holds: takeHolds,
                      nurses: [...new Set([...people.map((x) => nurseFor(x.room.replace(/[A-Z]$/, ""))), "看護師 田中", "看護師 渡辺", "看護師 佐藤"])],
                      onTake: takeOrders,
                      onHold: holdOrder,
                    }}
                  />
                </Drawer>
              )}
              {panel === "discharge" && (
                <Drawer title="退院時サマリー・診療情報提供書" onClose={closePanel} wide>
                  <DischargePanel
                    icu={icu}
                    history={entries}
                    orderDrafts={chart.drafts}
                    admissionRequest={requests.find((r) => r.admittedAs === patient.id)}
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
                    onApprove={(d) => {
                      setDischarges((all) => ({ ...all, [patient.id]: d }));
                      auditLog({ role: me.role, actor: me.name, action: "確定（退院時サマリーの承認）", patient: patient.name, detail: `確定 ${d.confirmedBy ?? ""}${d.approval?.comment ? `　コメント：${d.approval.comment}` : ""}` });
                    }}
                    onReturn={(d) => {
                      setDischarges((all) => ({ ...all, [patient.id]: d }));
                      auditLog({ role: me.role, actor: me.name, action: "退院時サマリーを差し戻した", patient: patient.name, detail: d.returned?.comment });
                    }}
                  />
                  <SignBox
                    patientId={patient.id}
                    draft={discharges[patient.id]}
                    records={infra.signatures}
                    newId={newId}
                    onSigned={(r) => {
                      infra.setSignatures((all) => [...all, r]);
                      auditLog({ role: me.role, actor: me.name, action: `確定（電子署名・模擬：${r.kind}）`, patient: patient.name, detail: `鍵の指紋 ${r.keyId.slice(0, 8)}　文書のハッシュ ${r.docHash.slice(0, 16)}` });
                    }}
                  />
                </Drawer>
              )}
              {panel === "nutrition" && <Drawer title="栄養管理" onClose={closePanel} wide locked={deny("assess.nutrition")}><NutritionPanel onPlan={() => { setNutritionDoc(true); setPanel("docs"); }} key={patient.id} patient={patient} evaluation={evals[patient.id]} diets={diets} today={today} nowTime={nowTime} onSave={(e, text) => { setEvals(all => ({ ...all, [e.patientId]: e })); chartNote(patient.id, text); }} /></Drawer>}
              {panel === "abx-renal" && (
                <Drawer title="抗菌薬の量" onClose={closePanel} wide>
                  <AbxRenalWindow key={patient.id} patient={patient} entries={entries} today={today} canOrder={role === "医師" && !deny("order")} onOrder={o => { if (role === "医師" && !deny("order")) { newInjection({ day: o.start.day, time: o.start.time ?? null }, o); closePanel(); } }} onTdm={() => setPharmacyFocus({ tab: "tdm", patientId: patient.id })} />
                </Drawer>
              )}
              {panel === "calc" && (
                <Drawer title="計算" onClose={closePanel} wide initialWidth={1080}>
                  <CalcWindow key={patient.id} patient={patient} entries={entries} today={today} nowTime={nowTime} icu={visibleIcuRecords(icu, abs(0, nowTime))} onOpenTool={setPanel} onInsert={deny("note") ? undefined : (line) => update((c) => ({ note: insertIntoO(c.note, line), rightTab: floating.note ? c.rightTab : "note", flash: `記事の O) に入れました：${line}` }))} />
                </Drawer>
              )}
              {panel === "diet" && (
                <Drawer title="食事" onClose={closePanel} wide locked={deny("diet")}>
                  <DietWindow patient={patient} today={today} nowTime={nowTime} diets={diets} entries={entries} dietEdit={refPropsOf(patient).dietEdit} />
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
              {panel === "access-limit" && (
                <Drawer title="閲覧制限" onClose={closePanel} locked={limitDeny(role)}>
                  <LimitPanel
                    history={limits.filter((l) => l.patientId === patient.id)}
                    current={limitNow}
                    fmtDay={(d) => formatShort(addDays(today, d))}
                    onSave={(on, kind, reason) => {
                      if (limitDeny(role)) return;
                      auditLog({ role: me.role, actor: me.name, action: on ? "確定（閲覧制限を設定）" : "確定（閲覧制限を外した）", patient: patient.name, detail: `${kind ? `${kind}　` : ""}理由：${reason}`, restricted: true });
                      setLimits((all) => [...all, { id: newId(), patientId: patient.id, on, ...(kind ? { kind } : {}), reason, by: me.name, at: { day: 0, time: nowTime } }]);
                    }}
                  />
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
                    doctor={me.name}
                    suggestions={suggestedDocuments(patient, entries.filter((e): e is OrderEntry => e.kind === "order"), hasPlannedSurgery(surgeries, patient.id), hasActiveCancer(diagnoses[patient.id] ?? []))}
                    records={consents.filter((c) => c.patientId === patient.id)}
                    orders={entries.filter((e): e is OrderEntry => e.kind === "order")}
                    initialRecordId={consentSelection}
                    onOpenDirective={() => setPanel("directive")}
                    onCreate={createConsent}
                    onUpdate={updateConsent}
                  />
                </Drawer>
              )}
              {panel === "add-imaging" && (
                <Drawer title="画像検査" onClose={closePanel} locked={orderBlock}>
                  <AddImagingPanel today={today} examPeople={examPeople} ris={dept.ris} patientId={patient.id} onAdd={(d) => { addManualLab(d); closePanel(); }} newId={newId} />
                </Drawer>
              )}
              {panel === "add-cath" && (
                <Drawer title="心カテ" onClose={closePanel} locked={orderBlock}>
                  <CardiacCathPanel patient={patient} entries={entries} today={today} people={examPeople} newId={newId} onAdd={d => { addManualLab(d); closePanel(); }} />
                </Drawer>
              )}
              {panel === "add-physio" && (
                <Drawer title="生理検査・内視鏡" onClose={closePanel} locked={orderBlock}>
                  <AddPhysioPanel patientId={patient.id} today={today} examPeople={examPeople} onAdd={(d) => { addManualLab(d); closePanel(); }} newId={newId} />
                </Drawer>
              )}
              {panel === "add-surgery" && (
                <Drawer title="手術申込" onClose={closePanel} locked={orderBlock} wide>
                  <AddSurgeryPanel key={patient.id} patient={patient} today={today} nowTime={nowTime} surgeries={surgeries} onSave={(s, text) => { if (deny("order")) return; setSurgeries((all) => [...all, s]); setConsents(all => [...all, ...surgeryConsentDrafts(s, patient.id, nowTime, newId)]); confirmRecord(text, "手術申込", "add-surgery"); closePanel(); }} />
                </Drawer>
              )}
              {panel === "add-procedure" && (
                <Drawer title="処置（マスターから選ぶ）" onClose={closePanel} locked={orderBlock}>
                  <AddProcedurePanel onAdd={(d) => { closePanel(); if (d.kind === "procedure" && d.code === "PROC-MOVE") { setBooking({ day: 0, what: "move" }); return; } addManualLab(d); }} newId={newId} />
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
                    rest={standingNow(patient.id)?.rest ?? null}
                    onAdd={(d) => {
                      addManualLab(d);
                      closePanel();
                    }}
                  />
                </Drawer>
              )}
              {panel === "add-consult" && (
                <Drawer title="コンサルト" onClose={closePanel} wide>
                  <ConsultPanel
                    today={today}
                    patient={patient} entries={entries}
                    onCloseConsult={(id) => { if (deny("consult")) return; setConsultReplies(all => ({ ...all, [id]: closeConsult(all[id]) })); }}
                    onRefer={(to, dept, purpose, summary) => { if (deny("consult")) return; setDischarges(all => ({ ...all, [patient.id]: referralDraft(patient.id, to, dept, purpose, summary) })); setPanel("discharge"); }}
                    newId={newId}
                    consults={entries.filter((e): e is OrderEntry => e.kind === "order" && e.order.type === "procedure" && e.order.code === "PROC-CONSULT")}
                    replies={consultReplies}
                    onReply={(entryId, text, by) => {
                      if (deny("consult")) return;
                      setNotes(all => ({ ...all, [patient.id]: [...(all[patient.id] ?? []), consultReplyNote(newId(), text, me.name, nowTime)] }));
                      const e = entries.find((x) => x.kind === "order" && x.id === entryId);
                      const dept = e && e.kind === "order" && e.order.type === "procedure" ? e.order.consult?.dept : "";
                      auditLog({ role: "医師", actor: by, action: "確定（他科依頼の返書）", patient: patient.name, detail: `${dept}　${text.slice(0, 80)}` });
                      setConsultReplies((all) => ({ ...all, [entryId]: replyConsult(all[entryId], text, by, nowTime) }));
                      // The doctor who answered is the patient's コンサルト医 from now on (the 依頼中 placeholder goes).
                      auditLog({ role: "医師", actor: by, action: "確定（コンサルト医の登録：他科依頼の返書）", patient: patient.name, detail: `${dept} ${by}` });
                      setDoctorBook((all) => ({ ...all, [patient.id]: addDoctor(all[patient.id] ?? [], { name: by, role: "コンサルト医", department: dept, since: { day: 0, time: nowTime }, by, note: "他科依頼の返書" }) }));

                    }}
                    onAdd={(d) => {
                      if (orderBlock) return;
                      addManualLab(d);
                      closePanel();
                    }}
                  />
                </Drawer>
              )}
              {panel === "bedside" && (
                <Drawer title="ベッドサイド表示" onClose={closePanel} wide>
                  <BedsidePanel
                    b={{
                      room: patient.room,
                      name: patient.name,
                      kana: patient.kana,
                      doctor: patient.attending,
                      nurse: nurseFor(patient.room.replace(/[A-Z]$/, "")),
                      rest: standingNow(patient.id)?.rest ?? null,
                      diet: patient.dietNow ?? null,
                      marks: [
                        ...patient.cautions.map((c) => ({ label: c, tone: "yamabuki" as const })),
                        ...(patient.allergies.length ? [{ label: `アレルギー：${patient.allergies.map((a) => a.replace(/（.*?）/, "")).join("・")}`, tone: "shu" as const }] : []),
                        ...(patient.infections.length ? [{ label: "感染対策あり", tone: "fuji" as const }] : []),
                        ...(bedInfo[patient.id]?.rescue ? [{ label: `救護 ${bedInfo[patient.id]!.rescue}`, tone: "ai" as const }] : []),
                        ...(bedInfo[patient.id]?.sensors ?? []).map((x) => ({ label: x, tone: "ai" as const })),
                      ],
                      today: scheduleItems()
                        .filter((x) => x.name === patient.name)
                        .map((x) => ({ when: x.when, what: x.what })),
                    }}
                  />
                </Drawer>
              )}
              {panel === "transfer" && (
                <Drawer title="転院・施設の調整" onClose={closePanel} wide>
                  <TransferPanel lifeSupport={lifeWithIntake(evals[patient.id]?.lifeSupport, anamnesis[patient.id]?.fields)}
                    summary={transferSummary(patient, entries.filter((e): e is OrderEntry => e.kind === "order"), { dietNow: patient.dietNow, restrained: !!activeOf(restraints, patient.id), adl: transferAdl(dept.rehab.bi, patient.id), rest: standingNow(patient.id)?.rest, lifeSupport: evals[patient.id]?.lifeSupport, anamnesis: anamnesis[patient.id]?.fields })}
                    asks={transferAsks.filter((a) => a.patientId === patient.id)}
                    onAsk={(fs) => {
                      auditLog({ role: me.role, actor: me.name, action: "転院・施設に打診した", patient: patient.name, detail: fs.map((f) => f.name).join("、") });
                      setTransferAsks((all) => [...all, ...fs.map((f) => ({ id: newId(), patientId: patient.id, facility: f.name, kind: f.kind, state: "打診中" as const, log: [{ at: nowTime, by: me.name, state: "打診中" as const, note: "" }] }))]);
                    }}
                    onUpdate={(id, state, note, meeting) => {
                      const a = transferAsks.find((x) => x.id === id);
                      // Only one place can be 決定.
                      if (state === "決定" && transferAsks.some((x) => x.patientId === patient.id && x.state === "決定" && x.id !== id)) return update({ flash: "ほかの病院・施設がもう「決定」です。先にそちらを取り下げてください。" });
                      auditLog({ role: me.role, actor: me.name, action: `転院・施設の調整：${state}`, patient: patient.name, detail: `${a?.facility ?? ""}　${note}` });
                      setTransferAsks((all) => all.map((x) => (x.id === id ? { ...x, state, ...(meeting ? { meeting } : {}), log: [...x.log, { at: nowTime, by: me.name, state, note }] } : x)));
                      if (state === "決定" && a) chartNote(patient.id, `【転院・施設の調整】${a.facility}（${a.kind}）に決定。${note}`);
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
              {panel === "scans" && (
                <Drawer title="スキャン取込" onClose={closePanel} wide>
                  <ScanPanel
                    patient={patient}
                    scans={infra.scans}
                    today={formatShort(today)}
                    onAdd={(s) => {
                      infra.setScans((all) => [...all, { ...s, id: newId(), patientId: patient.id, by: me.name, role: me.role, at: { day: 0, time: nowTime } }]);
                      auditLog({ role: me.role, actor: me.name, action: "確定（スキャン取込）", patient: patient.name, detail: `${s.type}　文書の日付 ${s.docDate}${s.sample ? "（見本）" : ""}` });
                    }}
                    onWithdraw={(id, reason) => {
                      infra.setScans((all) => all.map((x) => (x.id === id ? withdraw(x, me.name, { day: 0, time: nowTime }, reason) : x)));
                      auditLog({ role: me.role, actor: me.name, action: "スキャン取込を取り消した", patient: patient.name, detail: reason });
                    }}
                  />
                </Drawer>
              )}
              {panel === "labels" && (
                <Drawer title="ラベルの発行" onClose={closePanel} wide>
                  {(() => {
                    const person = workOf(patient.id);
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
              {panel === "templates" && (
                <Drawer title="テンプレート（型のある記録）" onClose={closePanel} wide>
                  <RecordTemplatesPanel
                    key={templateFocus ?? "list"}
                    initialId={templateFocus}
                    facts={{ patient, today, nowTime, standing: standingNow(patient.id), restraint: activeOf(restraints, patient.id) ?? null, ulcers: nm.ulcers.filter((u) => u.patientId === patient.id && !u.healed) }}
                    onInsert={(text, noteTemplate) => { update((c) => ({ noteTemplate, note: isBlankNote(c.note) ? `${text}\n` : `${c.note.replace(/\s*$/, "")}${c.note.trim() ? "\n" : ""}${text}\n`, rightTab: floating.note ? c.rightTab : "note", flash: `「${noteTemplate.templateName}」を記事に入れました。直してから保存してください。` })); /* the template window would hide the note it just filled */ setPanel(null); }}
                    onConfirm={confirmRecord}
                    onOpenPanel={(p) => setPanel(p)}
                  />
                </Drawer>
              )}
              {panel === "docs" && (
                <Drawer title="書類作成" onClose={() => { setSupportDoc(false); setNutritionDoc(false); closePanel(); }} wide>
                  <DocsPanel
                    key={`${patient.id}:${me.name}:${nutritionDoc ? "nutrition" : supportDoc ? "support" : "catalog"}`}
                    consents={consents.filter(c => c.patientId === patient.id)}
                    onOpenConsent={(code, recordId) => { setConsentSelection(recordId ?? null); if (code) createConsent(code); setPanel("consents"); }}
                    suggestions={suggestedDocuments(patient, entries.filter((e): e is OrderEntry => e.kind === "order"), hasPlannedSurgery(surgeries, patient.id), hasActiveCancer(diagnoses[patient.id] ?? []))}
                    initialKind={nutritionDoc ? "栄養管理計画書" : supportDoc ? "退院支援計画書" : undefined}
                    patient={patient}
                    today={formatShort(today)}
                    saved={documents.filter((d) => d.patientId === patient.id)}
                    onOpenReferral={() => setPanel("discharge")}
                    initial={(k: DocKind): Record<string, string> => {
                      if (k === "栄養管理計画書") return { ...nutritionPlanDraft(patient, patient.labs, currentDiet(diets, patient.id, nowTime), evals[patient.id]?.nutrition, me), ...nutritionPressure(nm.ulcers, patient.id) };
                      const pl = evals[patient.id]?.plan;
                      if (k === "褥瘡対策に関する診療計画書") return { ulcerPast: nm.ulcers.some((u) => u.patientId === patient.id && u.healed) ? "あり（この入院で治癒）" : "", nurse: me.role === "看護師" ? me.name : "", doctor: me.role === "医師" ? me.name : "" };
                      return k === "入院診療計画書" && pl ? { symptoms: pl.symptoms, treatment: pl.treatment, tests: pl.tests, surgery: pl.surgery, days: String(pl.days), nutrition: pl.nutritionNeeded, other: pl.other, explainedTo: pl.explainedTo } : {};
                    }}
                    auto={(k: DocKind) => {
                      const fmt = (d: number) => formatShort(addDays(today, d));
                      const dx = (diagnoses[patient.id] ?? []).filter((d) => d.outcome === "継続").map(diagnosisLabel).join("、") || patient.admissionDiagnosis;
                      const leave = entries.find((e): e is OrderEntry => e.kind === "order" && e.status === "有効" && e.order.type === "procedure" && e.order.leave?.kind === "退院");
                      const dDay = leave && leave.order.type === "procedure" ? leave.order.leave!.from.day : null;
                      const drugs = entries.filter((e): e is OrderEntry => e.kind === "order" && e.status === "有効" && e.order.type === "prescription").map((e) => orderLines(e.order, today).main).join("、");
                      const base = { name: `${patient.name}（${ageSex(patient)}）`, diagnosis: dx, admitted: fmt(patient.admittedOn) };
                      if (k === "栄養管理計画書") return { ...base, madeAt: fmt(0), ward: `${patient.ward} ${workOf(patient.id)?.room ?? patient.room}` };
                      if (k === "入院診療計画書") return { ...base, ward: `${patient.ward} ${workOf(patient.id)?.room ?? patient.room}`, attending: patient.attending, staff: `${nurseFor(patient.room)}（看護）` };
                      if (k === "褥瘡対策に関する診療計画書") return { ...base, ward: `${patient.ward} ${workOf(patient.id)?.room ?? patient.room}`, ...pressurePlanAuto({ ulcers: nm.ulcers.filter((u) => u.patientId === patient.id), risk: riskFromEval(evals[patient.id]?.pressure), fmt }) };
                      if (k === "退院証明書") return { ...base, discharge: dDay !== null ? fmt(dDay) : "（退院オーダがありません）", stay: dDay !== null ? `${stayDays(patient.admittedOn, dDay)}日` : "—", fee: "急性期一般入院料４" };
                      if (k === "退院療養計画書") return { ...base, discharge: dDay !== null ? fmt(dDay) : "（退院オーダがありません）", drugs: drugs || "なし" };
                      if (k === "退院支援計画書") {
                        const ds = evals[patient.id]?.discharge;
                        return { ...base, startedAt: ds?.planStartedAt ? fmt(ds.planStartedAt.day) : "（入院時の評価で「退院支援計画の着手」がまだ）", madeAt: fmt(0), factors: ds?.factors.length ? ds.factors.join("・") : "（入院時の評価で退院困難な要因がまだ）" };
                      }
                      return base;
                    }}
                    onSave={(k, v) => {
                      auditLog({ role: me.role, actor: me.name, action: `確定（${k}を作成）`, patient: patient.name });
                      setDocuments((all) => [...all, { id: newId(), patientId: patient.id, kind: k, values: v, by: me.name, at: { day: 0, time: nowTime } }]);
                      update((c) => ({ note: `${c.note.replace(/\s*$/, "")}\n・${k}を作成（${me.name}）\n` }));
                      if (k === "栄養管理計画書") setEvals(all => ({ ...all, [patient.id]: saveNutritionPlan(all[patient.id], patient.id, v, me.name, nowTime) }));
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
              {panel === "path" && (
                <Drawer title="クリティカルパス" onClose={closePanel} wide expandable>
                  <PathPanel
                    patient={patient}
                    book={paths}
                    onBook={setPaths}
                    entries={entries.filter((e): e is OrderEntry => e.kind === "order")}
                    today={today}
                    nowTime={nowTime}
                    newId={newId}
                    onDrafts={(ds, flash) => update((c) => ({ drafts: [...c.drafts, ...ds], rightTab: floating.note ? c.rightTab : "note", flash }))}
                    onNote={(line) => chartNote(patient.id, line)}
                  />
                </Drawer>
              )}
              {panel === "discharge-stop" && (
                <Drawer title="退院時の一括中止" onClose={closePanel} wide>
                  <DischargeStops groups={stopGroupsOf(patient.id)} today={today} canStop={!deny("order")} why={deny("order") ?? undefined} onStop={(keys) => stopAtDischarge(patient.id, keys)} />
                </Drawer>
              )}
              {panel === "summary" && (
                <Drawer title="連携サマリ・看護サマリ" onClose={closePanel} wide>
                  <SummaryPanel
                    room={workOf(patient.id)?.room}
                    patient={patient}
                    today={formatShort(today)}
                    nowTime={nowTime}
                    facts={summaryFacts(patient, entries.filter((e): e is OrderEntry => e.kind === "order"), today, { icu, now: abs(0, nowTime), standingLines: standingLines[patient.id], rehab: dept.rehab, diagnoses: diagnoses[patient.id] ?? [], standing: standingNow(patient.id), dietNow: patient.dietNow, evals: evals[patient.id], nursing: { problems: nursingPlans, care: careOrders.filter((o) => careActive(o, abs(0, nowTime))) }, anamnesis: anamnesis[patient.id]?.fields })}
                    coordination={evals[patient.id]?.coordination}
                    onSave={(to, words, facts, coordination) => {
                      if (coordination) setEvals(all => ({ ...all, [patient.id]: { ...(all[patient.id] ?? { patientId: patient.id }), coordination } }));
                      auditLog({ role: me.role, actor: me.name, action: "確定（連携サマリ）", patient: patient.name, detail: `宛先：${to}` });
                      chartNote(patient.id, `連携サマリ（宛先：${to}）\n${facts.map(s => `${s.heading}：${s.lines.join("、")}`).join("\n")}\n申し送り：${words}`);
                    }}
                    nursing={{
                      summaries: nm.summaries,
                      onSubmit: (kind, to, words, sections, again) => {
                        const why = nm.handIn(newId(), patient.id, kind, { sections, words, to, by: me.name, at: { day: 0, time: nowTime } }, again);
                        if (why) return window.alert(why);
                        auditLog({ role: me.role, actor: me.name, action: again ? "看護サマリを直して出し直した" : "看護サマリを看護師長に提出した", patient: patient.name, detail: `${kind}${to ? `　宛先：${to}` : ""}` });
                        update((c) => ({ note: `${c.note.replace(/\s*$/, "")}\n・${kind === "中間" ? "中間サマリ" : `看護サマリ（${kind}）`}を看護師長に${again ? "出し直した" : "提出"}${to ? `（宛先：${to}）` : ""}\n` }));
                      },
                    }}
                  />
                </Drawer>
              )}
              {panel === "pressure" && (
                <Drawer title="褥瘡の経過（DESIGN-R®2020）" onClose={closePanel} wide>
                  <PressurePanel
                    patientId={patient.id}
                    ulcers={nm.ulcers}
                    nowTime={nowTime}
                    fmtDay={(d) => formatShort(addDays(today, d))}
                    newId={newId}
                    canRecord={!deny("pressure")}
                    onChange={(u, what) => {
                      auditLog({ role: me.role, actor: me.name, action: "確定（褥瘡の経過）", patient: patient.name, detail: what });
                      nm.setUlcers((all) => (all.some((x) => x.id === u.id) ? all.map((x) => (x.id === u.id ? u : x)) : [...all, u]));
                    }}
                  />
                </Drawer>
              )}
              {panel === "regimen" && (
                <Drawer title="レジメン（化学療法）" onClose={closePanel} locked={orderBlock ?? (resident ? COSIGN_RULES.blocked : undefined)} wide>
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
              {(panel === "care-orders" || panel === "nursing-plan") && (
                <Drawer title="看護ケア指示・看護計画" onClose={closePanel} wide>
                  <NursingPanel
                    key={`${patient.id}-${panel}`}
                    start={panel === "care-orders" ? "care" : "plan"}
                    patientId={patient.id}
                    orders={careOrders.filter((o) => o.patientId === patient.id)}
                    records={careRecords.filter((r) => r.patientId === patient.id)}
                    plans={nursingPlans.filter((p) => p.patientId === patient.id)}
                    nowTime={nowTime}
                    sessionStart={sessionStart ?? abs(0, nowTime)}
                    fmtDay={(d) => formatShort(addDays(today, d))}
                    newId={newId}
                    onOrders={(f, what) => (auditLog({ role: me.role, actor: me.name, action: "確定（看護ケア指示）", patient: patient.name, detail: what }), setCareOrders(f))}
                    onPlans={(f, what) => (auditLog({ role: me.role, actor: me.name, action: "確定（看護計画）", patient: patient.name, detail: what }), setNursingPlans(f))}
                  />
                </Drawer>
              )}
              {panel === "anamnesis" && (
                <Drawer title="入院時の情報収集（アナムネーシス）" onClose={closePanel} wide>
                  <AnamnesisPanel
                    key={`${patient.id}-${anamnesisVersionsCount(anamnesis[patient.id])}`}
                    patient={patient}
                    record={anamnesis[patient.id]}
                    care={careNow(profileLog, patient.id)}
                    fmtDay={(d) => formatShort(addDays(today, d))}
                    onSave={(fields, reason) => {
                      const at = { day: 0, time: nowTime };
                      const prev = anamnesis[patient.id];
                      setAnamnesis((all) => ({ ...all, [patient.id]: saveAnamnesis(all[patient.id], patient.id, fields, me.name, at, reason) }));
                      // 介助 goes on into the patient profile (only where it differs), as the nurse's change.
                      const cs = careToProfile(fields, careNow(profileLog, patient.id));
                      if (cs.length) setProfileLog((all) => [...all, ...cs.map((c) => ({ ...c, id: newId(), patientId: patient.id, by: me.name, role: me.role, at }) as ProfileChange)]);
                      auditLog({ role: me.role, actor: me.name, action: prev ? "確定（入院時の情報収集の更新）" : "確定（入院時の情報収集）", patient: patient.name, detail: reason.trim() || undefined });
                    }}
                  />
                </Drawer>
              )}
              {panel === "national" && (
                <Drawer title="国のサービス（模擬）：電子処方箋・電子カルテ情報共有サービス" onClose={closePanel} wide>
                  <NationalPanel patient={patient} entries={entries.filter((e): e is OrderEntry => e.kind === "order")} diagnoses={diagnoses[patient.id] ?? []} draft={discharges[patient.id]} book={iji.insurance} today={today} nowTime={nowTime} log={national} onRecord={(r) => setNational((all) => [...all, r])} />
                </Drawer>
              )}
              {panel === "patient-info" && (
                <Drawer title={patientInfoTitle(patient)} onClose={closePanel} wide>
                  <PatientInfoPanel
                    roomLabel={workOf(patient.id)?.room}
                    initialSection={emergencyRegistrationSection(role, patient.id)}
                    key={patient.id}
                    patient={patient}
                    today={today}
                    nowTime={nowTime}
                    fmtDay={(d) => formatShort(addDays(today, d))}
                    contacts={contactsBook[patient.id]}
                    insurance={insuranceRecords(iji.insurance, patient.id)}
                    onRegisterInsurance={(r) => {
                      if (deny("insurance")) return;
                      setIji((d) => withInsurance(d, patient.id, r));
                    }}
                    doctors={doctorsFor(patient.id, entries)}
                    anamnesis={anamnesis[patient.id]}
                    directive={currentDirective(directives, patient.id)}
                    onOpen={(where) => (where === "doctors" ? setDoctorsOpen(true) : setPanel(where))}
                    onSave={(r) => {
                      if (deny("profile.contacts")) return;
                      auditLog({ role: me.role, actor: me.name, action: contactsBook[patient.id] ? "確定（患者基本情報の変更）" : "確定（患者基本情報の登録）", patient: patient.name, detail: r.reason || undefined });
                      setContactsBook((all) => ({ ...all, [patient.id]: r }));
                    }}
                  />
                </Drawer>
              )}
              {panel === "profile" && (
                <Drawer title="患者プロファイル" onClose={closePanel} wide>
                  <ProfilePanel
                    base={[...PATIENTS, ...admitted].find((p) => p.id === patient.id) ?? patient}
                    log={profileLog.filter((c) => c.patientId === patient.id)}
                    fmtDay={(d) => formatShort(addDays(today, d))}
                    onChange={(c) => {
                      const full = { ...c, id: newId(), patientId: patient.id, by: me.name, role: me.role, at: { day: 0, time: nowTime } } as ProfileChange;
                      auditLog({ role: me.role, actor: me.name, action: "確定（患者プロファイル）", patient: patient.name, detail: JSON.stringify(c) });
                      setProfileLog((all) => [...all, full]);
                    }}
                  />
                </Drawer>
              )}
              {panel === "standing" && (
                <Drawer title="指示簿（約束指示）" onClose={closePanel} wide initialWidth={1100}>
                  <StandingPanel initialEnd={standingEdit?.endSelected} key={`${patient.id}:${standingEdit?.id ?? "new"}:${standingEdit?.endSelected ?? false}`} initialSelection={standingEdit?.patientId === patient.id ? standingEdit : undefined}
                    versions={standing[patient.id] ?? []}
                    allergies={patient.allergies}
                    nowTime={nowTime}
                    fmtDay={(d) => formatShort(addDays(today, d))}
                    newId={newId}
                    condHits={condsAll(patient.id)}
                    condAcks={condAcks}
                    onCondRecord={(h, note) => {
                      auditLog({ role: me.role, actor: me.name, action: "確定（条件付き指示への対応）", patient: patient.name, detail: `${h.text}　対応：${note}` });
                      setCondAcks((all) => ({ ...all, [h.key]: { key: h.key, by: me.name, at: { day: 0, time: nowTime }, note } }));
                      chartNote(patient.id, ackLine(h, note, nowTime));
                    }}
                    lines={{ patient, lines: standingLines[patient.id] ?? [], today, onBulkStop: (draft) => bulkStopStandingLines(patient.id, draft), onAdd: (l) => addStandingLine(patient.id, l), onStop: (id, reason, day, kind) => stopStandingLine(patient.id, id, reason, day, kind) }}
                    onSave={(draft) => {
                      const st = confirmStanding(draft, me.name, { day: 0, time: nowTime });
                      auditLog({ role: me.role, actor: me.name, action: "確定（指示簿）", patient: patient.name, detail: `第${(standing[patient.id]?.length ?? 0) + 1}版` });
                      chartNote(patient.id, `【指示簿】${fieldChangeText(standing[patient.id] ?? [], st, (d) => formatShort(addDays(today, d)))} ${me.name} ${formatShort(today)} ${nowTime}`, "指示簿");
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
                  <AddLabPanel patientId={patient.id} onAdd={(d) => { addManualLab(d); closePanel(); }} onSave={saveLab} newId={newId} today={today} levelDrugs={levelDrugsFrom(entries.filter((e): e is OrderEntry => e.kind === "order"), anyDrugName)} />
                </Drawer>
              )}
                </DrawerDefaults.Provider>;
              })}
              {doctorsOpen && (
                <Drawer windowKey="doctors" title="主治医・担当医・コンサルト医" onClose={() => setDoctorsOpen(false)}>
                  <DoctorsPanel
                    doctors={doctorsFor(patient.id, entries)}
                    fmtDay={(d) => formatShort(addDays(today, d))}
                    onAdd={(d) => {
                      if (deny("profile.doctors")) return;
                      auditLog({ role: me.role, actor: me.name, action: `確定（${d.role}の登録）`, patient: patient.name, detail: `${d.name}${d.department ? `（${d.department}）` : ""}${d.note ? `　${d.note}` : ""}` });
                      setDoctorBook((all) => ({ ...all, [patient.id]: addDoctor(all[patient.id] ?? [], { ...d, since: { day: 0, time: nowTime }, by: me.name }) }));
                    }}
                    onRemove={(name, r) => {
                      if (deny("profile.doctors")) return;
                      auditLog({ role: me.role, actor: me.name, action: `${r}を外した`, patient: patient.name, detail: name });
                      setDoctorBook((all) => ({ ...all, [patient.id]: removeDoctor(all[patient.id] ?? [], name, r) }));
                    }}
                  />
                </Drawer>
              )}
            </div>
              </>
            )}
            <ToolRail key={patient.id}
              onAnesthesia={(tab) => { setAnesthesiaTab({tab, patientId: patient.id}); openArea("or"); setFront(f => ({ ...f, or: undefined })); }}
              open={panel}
              badges={{ results: { n: unseenHere.length, urgent: unseenHere.some((i) => i.panic.length > 0) }, "active-orders": { n: deny("order.sign") ? 0 : verbalHere.length }, take: { n: deny("mar") ? 0 : takeWaitingRows.filter((r) => r.patientId === patient.id).length, urgent: allTakeRows.some((r) => r.patientId === patient.id && r.keys.some((k) => sessionKeys.has(k) && !taken[k]) && !!r.flags.urgent) }, "report-list": { n: unreadHere.length }, cosign: { n: role === "医師" ? pendingOf(cosign, patient.id).filter((i) => !confirmDeny(me.name, i)).length : 0 } }}
              openTemplate={panel === "templates" ? templateFocus : null}
              onOpen={(p, o) => {
                if (p?.startsWith("pharmacy-")) { setPharmacyFocus({ tab: p.slice(9) as import("./PharmacyView").Tab, patientId: patient.id }); return; }
                setTemplateFocus(p === "templates" ? (o?.templateId ?? null) : null);
                if (p === "insulin") openRight("insulin");
                else if (p === "add-injection" || p === "add-rx" || p === "add-discharge") openOrder(p);
                else {
                  if (p === "imaging") setImageFocus(null);
                  setFlowReq(null);
                  setPanel(p === "billing" && visitOf(patient.id)?.kind === "opd" ? "opd-bill" : p);
                }
              }}
              blocked={blocked}
              injectionCalendar={{ on: chart.openTabs.includes("injcal") && (chart.rightTab === "injcal" || !!floating.injcal), open: () => openRight("injcal") }}
              calendars={REF_TABS.filter(t => t !== "insulin").map((t) => ({ key: t, label: RIGHT_TABS[t].label, title: RIGHT_TABS[t].title, icon: RIGHT_TABS[t].icon, on: chart.openTabs.includes(t) && (chart.rightTab === t || !!floating[t]), open: () => openRight(t) }))}
            />
          </ResizableChart>
          </DrawerDefaults.Provider></WindowEntryContext.Provider></ImagingConsentProvider></PatientWindowProvider>
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

  // The tabs on top: the screens of the place (病棟: the screens chosen from its menu; 救急外来・外来: the
  // list; other places: their page), and one row of every open chart wherever it was opened from, in
  // groups by where the patient is (病棟・救急外来・外来; the heading opens that place's list).
  function tabRows(): { screens: TabRow; patients: TabRow | null; crumbs: Crumb[] } {
    const inFront = screen === "chart" ? activeId : screen === "visit" ? visitKey : null;
    const chartItem = (t: PatientTab): TabItem[] => {
      const from = ownerLabel(t.owner);
      const v = visitOf(t.id);
      if (v) {
        const x = v.kind === "er" ? v.er : v.op;
        return [{ key: t.id, label: x.name, patient: { sex: x.sex, age: x.age }, title: `${from}から開いた`, active: inFront === t.id, onSelect: () => show(t.owner, t.id), onClose: () => closePatient(t.id), closeLabel: `${x.name} のタブを閉じる` }];
      }
      const p = findPatient(t.id);
      if (!p) return [];
      // A ward chart opened from the 救急外来・外来 list shows in 病棟 (the place of the patient), so the breadcrumb and the
      // area pulldown say 病棟, not the list it was opened from.
      const ownerToShow = wardTabOf(t.owner) ? t.owner : listOwner();
      return [{ key: t.id, label: p.name, patient: { sex: p.sex, age: p.age, room: p.room, infections: p.infections }, title: `${from}から開いた`, active: inFront === t.id, onSelect: () => show(ownerToShow, t.id), onClose: () => closePatient(t.id), closeLabel: `${p.name} のカルテを閉じる` }];
    };
    // An ED patient admitted today has a ward chart of its own (病棟); the visit's tab stays 救急外来's.
    const placeOfTab = (t: PatientTab): Place => visitOf(t.id)?.kind ?? "ward";
    const listOf: Record<Place, () => void> = { ward: () => show(listOwner(), undefined), er: () => show("er", undefined), opd: () => show("opd", undefined) };
    const groups: TabGroup[] = groupByPlace(patientTabs, placeOfTab)
      .map((g) => ({ key: g.key, label: g.label, onSelect: listOf[g.key], items: g.items.flatMap(chartItem) }))
      .filter((g) => g.items.length > 0);
    const charts: TabItem[] = newTabFor ? [{ key: "new", label: "新しいタブ", icon: Plus, menu: true, active: screen === "new", onSelect: () => show(newTabFor, NEW_TAB), onClose: closeNewTab, closeLabel: "新しいタブを閉じる" }] : [];
    const patients: TabRow | null = groups.length || charts.length ? { label: "開いているカルテ", items: charts, groups, plus: { label: "新しいタブ", title: "新しいタブ（患者を探して開く）", onClick: () => openNewTab(owner ?? listOwner()) } } : null;
    // Over a chart: where it was opened from (the screen is a link back to it).
    const shownTab = patientTabs.find((t) => t.id === inFront);
    const crumbs: Crumb[] = [];
    if (shownTab || screen === "new") {
      const o = shownTab?.owner ?? newTabFor ?? owner;
      if (o) {
        const w = wardTabOf(o);
        crumbs.push({ label: w ? "病棟" : (AREAS.find((x) => x.key === o)?.label ?? "") });
        crumbs.push({ label: w ? wardTabInfo(w).label : o === "er" ? "救急の患者一覧" : "外来の受付一覧", onClick: () => show(o, undefined) });
        const p = shownTab ? findPatient(shownTab.id) : undefined;
        const v = shownTab ? visitOf(shownTab.id) : null;
        crumbs.push({ label: p ? `${p.room} ${p.name}` : v ? (v.kind === "er" ? v.er.name : v.op.name) : "新しいタブ" });
      }
    }
    if (area === "ward") {
      const onScreen = screen !== "chart" && screen !== "visit" && screen !== "new";
      const patientViews = myWardTabs.filter((v) => wardTabInfo(v).group === "patients");
      const items: TabItem[] = wardTabs.map((t) => ({
        key: t,
        label: wardTabInfo(t).label,
        icon: WARD_ICON[t],
        active: onScreen && wardTab === t,
        badge: wardBadges[t],
        title: wardTabInfo(t).hint,
        onSelect: () => show(wardOwner(t), undefined),
        onClose: () => closeWardTab(t),
        // ⌄ on a patient view (入院患者一覧・病棟マップ・受け持ち患者・最近開いた患者): switch it in place.
        // ⌄: the other patient views, and 入院患者一覧 of one ward by name (5階東病棟・5階南病棟・6階東病棟).
        switcher:
          wardTabInfo(t).group === "patients"
            ? {
                options: [
                  ...patientViews.map((v) => ({ key: v, label: wardTabInfo(v).label, icon: WARD_ICON[v] })),
                  ...(patientViews.includes("all") ? FLOORS.map((f) => ({ key: `ward:${f.name}`, label: f.name, icon: Building2, group: "病棟ごとの入院患者一覧" })) : []),
                  { ...WARD_MENU_OPTION, icon: LayoutList },
                ],
                current: t === "all" && !allWards ? `ward:${listWard}` : t,
                onPick: (k: string) => {
                  if (k === WARD_MENU_OPTION.key) setWardTab("menu");
                  else if (k.startsWith("ward:")) {
                    setListWard(k.slice(5));
                    if (t !== "all") swapWardView(t, "all");
                    else show(wardOwner("all"), undefined);
                  } else {
                    if (k === "all") setListWard(ALL_WARDS);
                    if (k === t) show(wardOwner(t), undefined);
                    else swapWardView(t, k as WardTab);
                  }
                },
              }
            : undefined,
      }));
      if (wardTab === "menu" || !wardTabs.length)
        items.push({ key: "menu", label: "画面を選ぶ", icon: LayoutList, menu: true, active: wardTab === "menu", onSelect: () => setWardTab("menu"), onClose: wardTabs.length ? () => setWardTab(wardTabs[wardTabs.length - 1]) : undefined, closeLabel: "画面を選ぶメニューを閉じる" });
      return { screens: { label: "病棟の画面", items, plus: { ...WARD_SCREENS_PLUS, onClick: () => setWardTab("menu") } }, patients, crumbs };
    }
    if (area === "er" || area === "opd") {
      const o: Owner = area;
      const self: TabItem = { key: "self", label: area === "er" ? "救急の患者一覧" : "外来の受付一覧", icon: AREA_ICON[area], active: !front[o], onSelect: () => show(o, undefined) };
      return { screens: { label: `${ownerLabel(o)}の画面`, items: [self] }, patients, crumbs };
    }
    const a = AREAS.find((x) => x.key === area);
    return { screens: { label: "画面", items: [{ key: area, label: a?.label ?? "", icon: AREA_ICON[area], active: true, onSelect: () => undefined }] }, patients, crumbs };
  }
  const rows = tabRows();


  return (
    <NoteOverviewContext.Provider value={{ patientId: patient?.id, entriesOf: id => { const p = findPatient(id); return p ? currentEntries(p, { ...(sessionChanges[id] ?? { added: [], stopped: [] }), notes: notes[id], revised: revised[id] }) : []; }, role, done: noteTodoDone, complete: key => setNoteTodoDone(all => ({ ...all, [key]: all[key] ?? { by: me.name, at: new Date().toISOString() } })) }}>
    <ScenarioSaveProvider value={workspace.status === "off" ? null : workspace.saveNow}>
    <OrderHistoryContext.Provider value={{ ...orderUnlocks, entries: entries.filter((e): e is OrderEntry => e.kind === "order"), canEdit: role === "医師" && !deny("order"), ...historyOrderHandlers({ entries: entries.filter((e): e is OrderEntry => e.kind === "order"), locked: orderUnlocks.locked, canEdit: role === "医師" && !deny("order"), modifyInjection: modifyOrder, stopDraft: addStopDraft, load: e => doFromHistory({ kind: "order", entryId: e.id }) }) }}>
    <WindowEntryContext.Provider value={{ scope: `department:${desk}`, entries: windowEntries, setEntries: setWindowEntries }}><RoleProvider value={role}>
    <MeProvider value={me}><GlucoseContext.Provider value={{ orders: careOrders, records: careRecords }}>
    <VerbalReviewProvider nowTime={nowTime} patientName={patient?.name} onReview={(f) => update((c) => ({ added: f(c.added) }))}>
    {patient && <CarryNote id={patient.id} value={chart.note} initial={chart.noteInitial} onChange={note => update({ note, noteInitial: note })} />}
    {verbalConfirmation.dialog}
    <CosignRefs value={byRef(cosign)}>
    <div className="flex h-screen flex-col print:hidden">
      <div aria-hidden className="standalone-edge" />
      {/* 引っ張って更新 (iPad): save the records first, then reload; not when they cannot be kept. */}
      <PullToRefresh
        refresh={async () => {
          await workspace.saveNow();
          window.location.reload();
        }}
        blocked={
          workspace.status === "off"
            ? "記録の保存が設定されていないので、更新すると入力が消えます。更新はしません"
            : workspace.status === "error"
              ? "記録を保存できていないので、更新しませんでした（入力が消えないように）"
              : workspace.status === "loading"
                ? "記録を読み込んでいるところです"
                : null
        }
      />
      <AppFrame
        onBack={nav.canBack ? nav.back : undefined}
        onReload={async () => {
          // Keep what was entered: save first; when the records are not kept, say so instead of reloading.
          if (workspace.status === "off" || workspace.status === "error" || workspace.status === "loading") { setReloadNote("記録を保存できていないので、更新しませんでした（入力が消えないように）。"); setTimeout(() => setReloadNote(null), 5000); return; }
          await workspace.saveNow();
          window.location.reload();
        }}
        reloadNote={reloadNote}
        role={role}
        onRole={switchRole}
        meName={me.name}
        doctors={DOCTORS}
        onDoctor={switchDoctor}
        nurses={NURSES.map(n => ({ name: n.name, note: n.note }))}
        onNurse={switchNurse}
        areas={areas}
        helpScreen={screen}
        helpPanel={panel ?? chart.rightTab}
        area={area}
        onArea={openArea}
        onWardMenu={() => {
          openArea("ward");
          setWardTab("menu");
        }}
        screens={rows.screens}
        patients={rows.patients}
        crumbs={rows.crumbs}
        onOpenPicker={() => setPickerOpen(true)}
        areaBadges={{ kitchen: role === "管理栄養士" ? kitchenPending : 0, ward: (wardBadges.mine ?? 0) + (wardBadges.admit ?? 0), lab: uncalled(labItems, calls).length, phs: nurseCalls.filter((c) => !c.answered).length + emergencies.filter((e) => !e.closed).length + (role === "看護師" ? phsNotices.filter((n) => !n.readBy.includes(me.name) && forMyTeam(n)).length : 0), board: unreadCount(notices, reads, me.name) }}
        todos={todos}
        session={login.settings.on && login.session ? { onLogout: login.logout, onLock: login.lock } : undefined}
      >
        {content}
      {expiryOpen && role === "医師" && <RxExpiryInbox inbox={expiryPatients} onOpen={openPatient} onClose={() => setExpiryOpen(false)} />}
      </AppFrame>
      {/* 緊急通報 on every screen until it is closed. */}
      {emergencies.some((e) => !e.closed) && (
        <div className="fixed inset-x-0 top-0 z-50 flex flex-col print:hidden">
      {emergencies
        .filter((e) => !e.closed)
        .map((e) => (
          <div key={e.id} role="alert" className="flex flex-wrap items-center justify-center gap-3 border-b border-white/40 bg-shu px-4 py-1.5 text-sm font-bold text-white shadow">
            <span>
              {e.kind}　{e.place}　{e.at} 発信（{e.by}）
            </span>
            {!e.came.some((c) => c.name === me.name) && (
              <button type="button" onClick={() => setEmergencies((es) => es.map((x) => (x.id === e.id ? { ...x, came: [...x.came, { name: me.name, at: nowTime }] } : x)))} className="rounded bg-white px-2 py-0.5 text-shu">
                駆けつけた
              </button>
            )}
            <button type="button" onClick={() => openArea("phs")} className="rounded border border-white px-2 py-0.5">
              院内連絡を開く
            </button>
          </div>
        ))}
        </div>
      )}
      {/* A nurse call rings on the nurses' screens (as on their phones): bottom right, above the save status, off the screen's content. */}
      {closeAsk && (
        <div role="dialog" aria-modal="true" aria-label="記事の入力が途中です" className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 p-4 print:hidden" onClick={() => setCloseAsk(null)}>
          <div className="w-full max-w-md rounded-lg border border-rule bg-sheet p-4 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-1 font-bold">記事の入力が途中です</h2>
            <p className="mb-3 text-sm text-ink-soft">{(() => { const v = visitOf(closeAsk); return findPatient(closeAsk)?.name ?? (v ? (v.kind === "er" ? v.er.name : v.op.name) : ""); })()}さんの記事を保存しますか？保存しないで閉じても、書きかけはこのカルテを次に開いたときに残っています。</p>
            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" onClick={() => setCloseAsk(null)} className="rounded border border-rule px-3 py-1.5 text-sm">やめる</button>
              <button type="button" onClick={() => closePatientNow(closeAsk)} className="rounded border border-rule px-3 py-1.5 text-sm">保存しないで閉じる</button>
              {closeAsk === activeId ? (
                <button type="button" disabled={!noteReady} title={noteReady ? undefined : "記事を保存できる状態ではありません（記録時刻や権限を確かめてください）"} onClick={() => { confirmNote(); closePatientNow(closeAsk); }} className="rounded bg-ai px-3 py-1.5 text-sm font-bold text-white disabled:opacity-40">保存して閉じる</button>
              ) : (
                <button type="button" onClick={() => { const t = patientTabs.find((x) => x.id === closeAsk); setCloseAsk(null); if (t) show(t.owner, t.id); }} className="rounded bg-ai px-3 py-1.5 text-sm font-bold text-white">開いて確かめる</button>
              )}
            </div>
          </div>
        </div>
      )}
      {role === "看護師" && (
        <div className="fixed bottom-10 right-2 z-40 flex flex-col items-end gap-1.5 print:hidden">
          {phsNotices
            .filter((n) => !n.readBy.includes(me.name) && forMyTeam(n))
            .slice(-3)
            .map((n) => (
              <div key={n.id} role="status" className="flex max-w-md items-center gap-2 rounded-md border border-yamabuki bg-sheet px-3 py-1.5 text-[13px] shadow">
                <b className="shrink-0 text-yamabuki">{n.kind}</b>
                <span className="min-w-0">{n.text}</span>
                {n.patientId && <button type="button" onClick={() => { goWard("sheet"); focusNotice(n.patientId!, "sheet"); }} className="shrink-0 text-xs text-ai underline">見る</button>}
                <button type="button" onClick={() => setPhsNotices((ns) => ns.map((x) => (x.id === n.id ? { ...x, readBy: [...x.readBy, me.name] } : x)))} className="shrink-0 rounded border border-rule px-1.5 text-xs">
                  見た
                </button>
              </div>
            ))}
          {nurseCalls
            .filter((c) => !c.answered)
            .map((c) => (
              <div key={c.id} role="alert" className="flex items-center gap-2 rounded-md border border-shu bg-sheet px-3 py-1.5 text-[13px] shadow">
                <b className="text-shu">ナースコール</b>
                <span>
                  {c.kind !== "通常" && <span className="mr-1 rounded border border-shu px-1 text-[11px] text-shu">{c.kind}</span>}
                  {c.room} {findPatient(c.patientId)?.name}さん → {callTarget(c)}
                </span>
                <button type="button" onClick={() => answerCall(c.id)} className="rounded bg-yamabuki px-2 py-0.5 text-xs font-bold text-white">
                  応答
                </button>
                <button type="button" onClick={() => { openArea("phs"); focusNotice(c.patientId, "phs"); }} className="text-xs text-ai underline">
                  開く
                </button>
              </div>
            ))}
        </div>
      )}
      <WorkspaceStatus pending={pendingAnesthesiaPreop(windowEntries,surgeries,today)} status={workspace.status} id={workspace.id} onReset={workspace.reset} onRetry={() => { void workspace.saveNow().catch(() => undefined); }} live={liveLabel(presence.live)} />
      {login.gate && (
        <LoginGate
          users={loginUsers}
          locked={login.locked}
          current={login.session}
          onLogin={(u) => {
            if (u.role === "医師") switchDoctor(u.name);
            else if (u.role !== role || !login.session) switchRole(u.role, u.name);
            login.start(u);
          }}
          onTurnOff={() => login.change({ ...login.settings, on: false }, me)}
        />
      )}
      {presence.merged && <MergedNotice by={presence.merged.by} where={presence.merged.where} at={presence.merged.at} onClose={presence.dismiss} />}

      {dischargeAsk &&
        (() => {
          const x = workOf(dischargeAsk);
          if (!x) return null;
          const pid = x.patient.id;
          const items = dischargeChecklist({
            entries: x.entries,
            homeRx: { exists: bagsOf(x.entries).length > 0, handed: !!homeRx[pid]?.handed },
            documents: documents.filter((d) => d.patientId === pid).map((d) => d.kind),
            answeredGuides: guidance.filter((g) => g.patientId === pid).flatMap((g) => g.answers),
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
            >
              <DischargeStops groups={stopGroupsOf(pid)} today={today} canStop={!deny("order")} why={deny("order") ?? undefined} onStop={(keys) => stopAtDischarge(pid, keys)} />
            </DischargeDialog>
          );
        })()}

      {moving && findPatient(moving.patientId) && ward.beds.some((x) => x.patientId === moving.patientId) && (
        <BedMoveDialog
          patient={findPatient(moving.patientId)!}
          from={(() => {
            const b = allBeds.find((x) => x.patientId === moving.patientId)!;
            return { room: b.room, bed: b.bed };
          })()}
          initial={moving.to}
          allBeds={{ beds: allBeds, patient: findPatient }}
          nowTime={nowTime}
          onCancel={() => setMoving(null)}
          onMove={(m) => {
            // 今日・明日の時刻: the same 移動 order draft as the calendar's booking, in that patient's chart to confirm.
            if (m.time) { openPatient(m.patientId); updateFor(m.patientId, (c) => ({ drafts: [...c.drafts, { ...newProcedureDraft("PROC-MOVE", newId()), sourceText: "（病棟マップから）", move: { kind: m.kind, to: m.to, reason: m.reason }, schedule: { kind: "once" }, start: { day: m.day ?? 0, time: m.time ?? null } }], flash: `${m.kind}の予約を下書きにしました。確かめて確定してください。`, rightTab: floating.note ? c.rightTab : "note" })); return setMoving(null); }
            const who = findPatient(m.patientId)!;
            const at = (b: { room: string; bed: string }) => `${floorOf(b.room)} ${b.room}${b.bed ? `${b.bed}` : ""}`;
            auditLog({ role: me.role, actor: me.name, action: `確定（${m.kind}）`, patient: who.name, detail: `${at(m.from)} → ${at(m.to)}　理由：${m.reason}` });
            setIcu(all => stayOnMove(all, m.patientId, floorOf(m.from.room), floorOf(m.to.room), { day: 0, time: nowTime }));
            setMoves((all) => ({ ...all, [m.patientId]: m.to }));
            setMoveLog((l) => [...l, { patientId: m.patientId, label: `${m.kind} ${m.from.room}→${m.to.room}${m.to.bed ? `${m.to.bed}` : ""}`, time: nowTime }]);
            updateFor(m.patientId, (c) => ({ note: `${c.note.replace(/\s*$/, "")}\n・${m.kind}：${at(m.from)} → ${at(m.to)}（${m.reason}）\n` }));
            setMoving(null);
          }}
        />
      )}
      {booking?.what === "move" && patient && ward.beds.some((x) => x.patientId === patient.id) && (
        <BedMoveDialog
          patient={patient}
          from={(() => {
            const b = ward.beds.find((x) => x.patientId === patient.id)!;
            return { room: b.room, bed: b.bed };
          })()}
          allBeds={{ beds: allBeds, patient: findPatient }}
          reserve={{ label: formatShort(addDays(today, booking.day)), day: booking.day }}
          onCancel={() => setBooking(null)}
          onMove={(m) => {
            addManualLab({ ...newProcedureDraft("PROC-MOVE", newId()), sourceText: "（移動・食事カレンダーから）", move: { kind: m.kind, to: m.to, reason: m.reason }, schedule: { kind: "once" }, start: { day: m.day ?? booking.day, time: m.time ?? null } });
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
          initialDay={booking.day}
          onCancel={() => setBooking(null)}
          onBook={(m) => {
            addManualLab({ ...newProcedureDraft("PROC-MOVE", newId()), sourceText: "（移動・食事カレンダーから）", move: { kind: "転科", toDept: m.toDept, toDoctor: m.toDoctor, reason: m.reason }, schedule: { kind: "once" }, start: { day: m.day ?? booking.day, time: m.time } });
            update({ flash: "転科の予約を下書きにしました。確かめて確定してください。" });
            openRight("note");
            setBooking(null);
          }}
        />
      )}
      {pickerOpen && <PatientPicker beds={allBeds} patients={allPatients} openIds={patientTabs.map((t) => t.id)} onOpen={openPatient} onInfo={(id) => (openPatient(id), setPanel("patient-info"))} onClose={() => setPickerOpen(false)} />}
    </div>
    </CosignRefs>
    </VerbalReviewProvider>
    </GlucoseContext.Provider></MeProvider>
    </RoleProvider></WindowEntryContext.Provider>
    </OrderHistoryContext.Provider>
    </ScenarioSaveProvider>
    </NoteOverviewContext.Provider>
  );
}
