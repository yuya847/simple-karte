"use client";

// スマートフォンへの通知 inside the chart (nothing is drawn): results confirmed on this page are sent, and a pressed
// notification opens the results. Components, so the chart can put them after it has loaded.

import type { ResultItem } from "@/lib/results";
import type { PushAbout } from "@/lib/push/targets";
import { usePushLanding, usePushResults, type PushRecords } from "@/lib/push/use-push";

export function PushResults({ ws, items, push, about }: { ws: string | null; items: ResultItem[]; push: Pick<PushRecords, "subs" | "prefs" | "armedRef">; about: (patientId: string) => PushAbout }) {
  usePushResults(ws, items, push, about);
  return null;
}

export function PushLanding({ ready, go }: { ready: boolean; go: () => void }) {
  usePushLanding(ready, go);
  return null;
}
