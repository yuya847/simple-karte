/** Personal display state must never travel with chart records, including legacy saves. */
const DEVICE_KEYS = new Set(["role", "me", "doctorName", "area", "wardTabs", "wardTab", "patientTabs", "front", "display", "wardDefaults", "listWard", "floor"]);
export function workspaceRecords<T>(data: Record<string, T>): Record<string, T> {
  return Object.fromEntries(Object.entries(data).filter(([key]) => !DEVICE_KEYS.has(key)));
}
