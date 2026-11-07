// Where a press in a ward screen (a mark of the patient list, a card's menu on the map, a worksheet row) takes you:
// the patient's chart with one of its tools open, or 実施入力 of the ward (it has no tool in the chart).

export type OpenAt = "standing" | "results" | "take" | "execute" | "rxcal" | "flowsheet" | "directive" | "profile" | "report-list";
