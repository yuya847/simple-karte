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

/** Initial order window leaves the chart's right column visible on a desktop. */
export function orderWindowSize(width: number, height: number) {
  return { x: 16, y: Math.max(8, Math.round((height - 520) / 2)), w: Math.min(760, width - 32), h: Math.min(520, height - 16) };
}

export function focusDraftLine(id: string) {
  requestAnimationFrame(() => {
    const line = document.getElementById(`draft-line-${id}`);
    line?.focus();
    line?.scrollIntoView({ block: "nearest" });
  });
}
