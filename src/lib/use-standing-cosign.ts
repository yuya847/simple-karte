"use client";
import { useEffect, type Dispatch, type SetStateAction } from "react";
import { syncStandingCosign } from "./standing-cosign";
import type { CosignItem } from "./cosign";
import type { StandingOrders } from "./standing";
import type { StandingLine } from "./standing-lines";
export function useStandingCosign(fields: Record<string, StandingOrders[]>, lines: Record<string, StandingLine[]>, setItems: Dispatch<SetStateAction<CosignItem[]>>) {
  useEffect(() => { setItems((items) => syncStandingCosign(items, fields, lines)); }, [fields, lines, setItems]);
}
