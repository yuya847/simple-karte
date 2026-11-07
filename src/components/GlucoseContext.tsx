"use client";
import { createContext, useContext } from "react";
import type { CareOrder, CareRecord } from "@/lib/care-orders";
import { recentGlucose } from "@/lib/flow-meds";

export const GlucoseContext = createContext<{ orders: CareOrder[]; records: CareRecord[] }>({ orders: [], records: [] });
export function useRecentGlucose(patientId: string, at: number) {
  const { orders, records } = useContext(GlucoseContext);
  return recentGlucose(orders, records, patientId, at);
}
