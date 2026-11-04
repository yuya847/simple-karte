import type { RightTab } from "@/components/RightTabs";

export const orderWindows = ["add-injection", "add-rx"] as const;

/** Opening another tool must leave these entry forms and their unfinished inputs alive. */
export function showOrderWindow(open: string[], key: string): string[] {
  return open.includes(key) ? open : [...open, key];
}

const tabs: readonly string[] = ["note", "injcal", "flowsheet", "rxcal", "proccal", "dietcal", "standingcal", "bookings"];
const isTab = (t: unknown): t is RightTab => typeof t === "string" && tabs.includes(t);

/** Read older saved desks without restoring the removed injection/prescription tabs. */
export function normalizeRightState(saved: { rightTab?: unknown; openTabs?: unknown }): { rightTab: RightTab; openTabs: RightTab[] } {
  return {
    rightTab: isTab(saved.rightTab) ? saved.rightTab : "note",
    openTabs: Array.isArray(saved.openTabs) ? saved.openTabs.filter(isTab) : [],
  };
}
