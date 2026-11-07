// 画面・パネルと、説明の移動元の部品の対応。
export const helpRoutes: Record<string, string[]> = {
  "screen:icu": ["IcuBoard"],
  "panel:icu": ["IcuPanel"],
  "panel:calc": ["CalcWindow"],
  "screen:chart": [],
  "screen:visit": [],
  "screen:endo": [
    "EndoView"
  ],
  "screen:kitchen": [
    "KitchenView"
  ],
  "screen:teams": [
    "TeamsView"
  ],
  "screen:path": [
    "PathologyView"
  ],
  "screen:wardmenu": [
    "WardMenu"
  ],
  "screen:new": [
    "NewTabPage"
  ],
  "screen:beds": [
    "BedControlView"
  ],
  "screen:equipment": [
    "SpecialistBoard"
  ],
  "screen:infection": [
    "SpecialistBoard"
  ],
  "screen:oral": [
    "SpecialistBoard"
  ],
  "screen:iji": [
    "IjiBoard"
  ],
  "screen:support": [
    "SupportBoard"
  ],
  "screen:ulcers": [
    "UlcerBoard"
  ],
  "screen:assign": [
    "AssignBoard"
  ],
  "screen:monitor": [
    "CentralMonitor"
  ],
  "screen:vitals": [
    "VitalsBulk"
  ],
  "screen:falls": [
    "FallBoard"
  ],
  "screen:nsummaries": [
    "SummaryApprovals"
  ],
  "screen:status": [
    "StatusBoard"
  ],
  "screen:meals": [
    "MealsView"
  ],
  "screen:journal": [
    "JournalView"
  ],
  "screen:cosign": [
    "Cosign"
  ],
  "screen:narcotic": [
    "NarcoticSlips"
  ],
  "screen:paths": [
    "PathList"
  ],
  "screen:summaries": [
    "SummaryList"
  ],
  "screen:io": [
    "IoBoard",
    "IoPanel"
  ],
  "screen:consults": [
    "ConsultPanel"
  ],
  "screen:reports": [
    "ReportList"
  ],
  "screen:undone": [
    "UndoneView"
  ],
  "screen:roster": [
    "RosterView"
  ],
  "screen:extract": [
    "ExtractView"
  ],
  "screen:phs": [
    "PhsView"
  ],
  "screen:board": [
    "BoardView"
  ],
  "screen:druginfo": [
    "FormularyView"
  ],
  "screen:manual": [
    "ManualView"
  ],
  "screen:incident": [
    "IncidentView"
  ],
  "screen:opd": [
    "OpdDesk"
  ],
  "screen:map": [
    "WardRequests",
    "WardMap"
  ],
  "screen:er": [
    "EmergencyBoard"
  ],
  "screen:take": [
    "TakeDesk"
  ],
  "screen:execute": [
    "ExecuteDesk"
  ],
  "screen:sheet": [
    "Worksheet"
  ],
  "screen:receipt": [
    "ReceiptDesk"
  ],
  "screen:stats": [
    "StatsView"
  ],
  "screen:liaison": [
    "LiaisonView"
  ],
  "screen:bcp": [
    "DowntimeView"
  ],
  "screen:system": [
    "SystemView",
    "LoginSettingsView",
    "MasterView"
  ],
  "screen:audit": [
    "AuditView"
  ],
  "screen:admit": [
    "AdmitEvalView"
  ],
  "screen:lab": [
    "LabView"
  ],
  "screen:blood": [
    "BloodBankView"
  ],
  "screen:physio": [
    "PhysioView"
  ],
  "screen:radiology": [
    "RadiologyView"
  ],
  "screen:rehab": [
    "RehabView"
  ],
  "screen:handoff": [
    "HandoffView"
  ],
  "screen:acuity": [
    "AcuityView"
  ],
  "screen:chat": [
    "ChatView"
  ],
  "screen:or": [
    "SurgeryView"
  ],
  "screen:dialysis": [
    "DialysisView"
  ],
  "screen:pharmacy": [
    "PharmacyView"
  ],
  "screen:recent": [
    "RecentPatients"
  ],
  "screen:favorites": [
    "FavoritePatients"
  ],
  "panel:billing": [
    "BillingView",
    "KisaiPanel",
    "InsurancePanel",
    "ReceiptPanel",
    "DpcPanel"
  ],
  "panel:add-discharge": [
    "InlineOrder",
    "AddPanels"
  ],
  "panel:diagnoses": [
    "Drawer",
    "DiagnosisPanel"
  ],
  "panel:add-pathology": [
    "Drawer",
    "PathRequestPanel",
    "PathologyView"
  ],
  "panel:team": [
    "Drawer",
    "TeamPanel"
  ],
  "panel:rehab-progress": [
    "Drawer",
    "RehabProgressPanel"
  ],
  "panel:reports": [
    "Drawer",
    "DeptReportsPanel",
    "ReportList"
  ],
  "panel:report-list": [
    "Drawer",
    "ReportList"
  ],
  "panel:visit-request": [
    "Drawer",
    "VisitChart"
  ],
  "panel:visit-rx": [
    "Drawer",
    "OpdOrders",
    "ErxPanel"
  ],
  "panel:opd-bill": [
    "Drawer",
    "OpdBillPanel"
  ],
  "panel:opd-booking": [
    "Drawer",
    "OpdBookingPanel"
  ],
  "panel:results": [
    "Drawer",
    "ResultBrowser",
    "ResultsPanel"
  ],
  "panel:results-timeline": [
    "Drawer",
    "ResultsPanel"
  ],
  "panel:imaging": [
    "Drawer",
    "RisChartStrip",
    "ImagingPanel"
  ],
  "panel:active-orders": [
    "Drawer",
    "VerbalInbox",
    "ActiveOrdersPanel",
    "HistoryPane"
  ],
  "panel:monitor": [
    "Drawer",
    "MonitorPanel"
  ],
  "panel:take": [
    "Drawer",
    "TakeStatus",
    "TakeDesk"
  ],
  "panel:cosign": [
    "Drawer",
    "Cosign"
  ],
  "panel:vitals": [
    "Drawer",
    "VitalsPanel"
  ],
  "panel:tx-bedside": [
    "Drawer",
    "TxBedsidePanel"
  ],
  "panel:io": [
    "Drawer",
    "IoPanel"
  ],
  "panel:flow-entry": [
    "Drawer",
    "FlowEntryPanel"
  ],
  "panel:discharge": [
    "Drawer",
    "DischargePanel",
    "SignBox"
  ],
  "panel:nutrition": [
    "Drawer",
    "NutritionPanel"
  ],
  "panel:diet": [
    "Drawer",
    "DietWindow"
  ],
  "panel:chat": [
    "Drawer",
    "ChatView"
  ],
  "panel:access-limit": [
    "Drawer",
    "AccessLimit"
  ],
  "panel:directive": [
    "Drawer",
    "DirectivePanel"
  ],
  "panel:consents": [
    "Drawer",
    "ConsentPanel"
  ],
  "panel:add-imaging": [
    "Drawer",
    "AddImagingPanel"
  ],
  "panel:add-physio": [
    "Drawer",
    "AddPanels"
  ],
  "panel:add-surgery": [
    "Drawer",
    "AddSurgeryPanel"
  ],
  "panel:add-procedure": [
    "Drawer",
    "AddPanels"
  ],
  "panel:add-leave": [
    "Drawer",
    "AddPanels"
  ],
  "panel:add-guide": [
    "Drawer",
    "AddPanels"
  ],
  "panel:add-rehab": [
    "Drawer",
    "AddPanels"
  ],
  "panel:add-consult": [
    "Drawer",
    "ConsultPanel"
  ],
  "panel:bedside": [
    "Drawer",
    "BedsidePanel"
  ],
  "panel:transfer": [
    "Drawer",
    "TransferPanel"
  ],
  "panel:guide-record": [
    "Drawer",
    "GuideRecordPanel"
  ],
  "panel:scans": [
    "Drawer",
    "ScanPanel"
  ],
  "panel:pharmacy-brought": [
    "Drawer",
    "BroughtDesk"
  ],
  "panel:labels": [
    "Drawer",
    "LabelsPanel"
  ],
  "panel:templates": [
    "Drawer",
    "RecordTemplatesPanel"
  ],
  "panel:docs": [
    "Drawer",
    "DocsPanel"
  ],
  "panel:letter": [
    "Drawer",
    "LetterPanel"
  ],
  "panel:schema": [
    "Drawer",
    "SchemaPanel"
  ],
  "panel:sets": [
    "Drawer",
    "SetPanel"
  ],
  "panel:path": [
    "Drawer",
    "PathPanel"
  ],
  "panel:discharge-stop": [
    "Drawer",
    "DischargeStops"
  ],
  "panel:summary": [
    "Drawer",
    "SummaryPanel",
    "SummaryList"
  ],
  "panel:pressure": [
    "Drawer",
    "PressurePanel"
  ],
  "panel:regimen": [
    "Drawer",
    "RegimenPanel"
  ],
  "panel:restraint": [
    "Drawer",
    "RestraintPanel"
  ],
  "panel:care-orders": [
    "Drawer",
    "NursingPanel"
  ],
  "panel:nursing-plan": [
    "Drawer",
    "NursingPanel"
  ],
  "panel:anamnesis": [
    "Drawer",
    "AnamnesisPanel"
  ],
  "panel:national": [
    "Drawer",
    "NationalPanel"
  ],
  "panel:patient-info": [
    "Drawer",
    "PatientInfoPanel"
  ],
  "panel:profile": [
    "Drawer",
    "ProfilePanel"
  ],
  "panel:standing": [
    "Drawer",
    "StandingPanel"
  ],
  "panel:add-transfusion": [
    "Drawer",
    "AddPanels"
  ],
  "panel:add-dialysis": [
    "Drawer",
    "AddPanels",
    "AddDialysisPanel"
  ],
  "panel:add-lab": [
    "Drawer",
    "AddLabPanel"
  ],
  "panel:flowsheet": [
    "FlowSheet",
    "FlowLayoutPanel",
    "FlowMedRows"
  ],
  "panel:dietcal": [
    "DietCalendar",
    "DietWindow"
  ],
  "panel:standingcal": [
    "StandingCalendar"
  ]
};
