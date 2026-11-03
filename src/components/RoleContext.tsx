"use client";

import { Lock } from "lucide-react";
import { createContext, useContext } from "react";
import { STAFF, denyReason, type Action, type Role, type Staff } from "@/lib/roles";

const RoleCtx = createContext<Role>("医師");

export const RoleProvider = RoleCtx.Provider;

/** The person using the chart now. */
export function useMe(): Staff {
  return STAFF[useContext(RoleCtx)];
}

/** Returns why an action is locked for the current role, or null when it is allowed. */
export function useDeny(): (a: Action) => string | null {
  const role = useContext(RoleCtx);
  return (a) => denyReason(role, a);
}

/** A one-line note next to a locked button. */
export function DenyNote({ action, className = "" }: { action: Action; className?: string }) {
  const why = useDeny()(action);
  if (!why) return null;
  return (
    <p className={`flex items-center gap-1 text-xs text-ink-soft ${className}`}>
      <Lock size={12} className="shrink-0" />
      {why}
    </p>
  );
}
