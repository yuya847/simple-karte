"use client";
import { createContext, useContext, useReducer } from "react";
import type { OrderEntry } from "@/lib/types";
import { useMe } from "./RoleContext";
import { orderLocked, unlockReducer, type UnlockRequest, type UnlockState } from "@/lib/history-order";

export function useOrderUnlocks(audited: Record<string, string>, dispensed: Record<string, string>) {
  const [state, dispatch] = useReducer(unlockReducer, { requests: [], released: [] });
  const { requests, released } = state;
  return { state, restore: (state: UnlockState) => dispatch({ type: "restore", state }), requests, locked: (id: string) => orderLocked(id, audited, dispensed, released),
    request: (request: UnlockRequest) => dispatch({ type: "request", request }),
    relock: (id: string) => dispatch({ type: "relock", id }),
    release: (id: string) => dispatch({ type: "release", id }),
  };
}
type Actions = ReturnType<typeof useOrderUnlocks> & { modify: (entry: OrderEntry) => void; stop: (entry: OrderEntry) => void; canEdit: boolean; entries: OrderEntry[] };
export const OrderHistoryContext = createContext<Actions | null>(null);
export const useOrderHistoryActions = () => useContext(OrderHistoryContext);
export function UnlockRequests() {
  const actions = useOrderHistoryActions();
  const me = useMe();
  return <div className="space-y-2">{actions?.requests.map(r => <div key={r.orderId} className="rounded border border-rule bg-sheet p-3 text-sm"><strong>{r.patientName}：ロック解除の依頼</strong><p>{r.reason}</p><button type="button" disabled={me.role !== "薬剤師"} className="rounded border border-ai px-2 py-1 text-ai" onClick={() => actions.release(r.orderId)}>解除する</button></div>)}</div>;
}
