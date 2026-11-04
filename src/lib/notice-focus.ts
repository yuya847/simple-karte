export const NOTICE_FOCUS_EVENT = "karte-notice-focus";
export const NOTICE_HIGHLIGHT_MS = 2000;
export type NoticeDestination = "sheet" | "phs";

/** Compare data attributes directly: ids need no CSS selector escaping. */
export function noticePatientIndex(rows: readonly { patient: string | undefined; destination: string | undefined }[], patientId: string, destination: NoticeDestination): number {
  if (!patientId) return -1;
  return rows.findIndex((row) => row.patient === patientId && row.destination === destination);
}
