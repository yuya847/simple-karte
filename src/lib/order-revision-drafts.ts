import type { OrderEntry } from "./types";
import type { Draft } from "./drafts";
export function replacementConflict(drafts: Draft[], entries: OrderEntry[] = []): string | null {
  const seen = new Set(entries.flatMap(e => "replaces" in e.order && e.order.replaces ? [e.order.replaces] : []));
  for (const d of drafts) {
    if (!("duplicate" in d) || d.duplicate?.action !== "replace") continue;
    if (seen.has(d.duplicate.orderId)) return "同じ指示への変更が重なっています。変更を1つにしてください。";
    seen.add(d.duplicate.orderId);
  }
  return null;
}
