"use client";

// What the tabs of ICU 記録 share: the props the shell (IcuPanel) hands each tab, the field and button looks,
// and the small helpers for reading a form and showing a value.

import type { ReactNode } from "react";
import type { Patient } from "@/lib/types";
import type { Action, Role, Staff } from "@/lib/roles";
import type { CalendarDate } from "@/lib/dates";
import type { At, IcuRecords } from "@/lib/icu";

/** What the shell hands every tab. */
export interface IcuPaneProps {
  patient: Patient;
  records: IcuRecords;
  role: Role;
  me: Staff;
  today: CalendarDate | null;
  nowTime: string;
  newId(): string;
  /** Now: as a moment of today, and in minutes from today's 0:00 (abs). */
  at: At;
  now: number;
  /** 医師の指示（設定・速さ）, 看護の記録, ポンプの速さ, 呼吸器の実測. */
  doc: boolean;
  nurse: boolean;
  pump: boolean;
  measured: boolean;
  /** Saves the records and writes the audit line; clears the error. */
  commit(next: IcuRecords, action: string, detail?: string): void;
  /** True when allowed; otherwise shows why and returns false. */
  permit(ok: boolean, action: Action): boolean;
  setError(message: string): void;
}

export const input = "rounded border border-rule bg-sheet px-2 py-1 w-full min-w-0";
export const button = "rounded border border-rule px-3 py-1 hover:bg-paper disabled:opacity-40";
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="grid gap-1 text-xs">{label}{children}</label>;
}
export const n = (f: FormData, k: string) => (String(f.get(k) ?? "").trim() === "" ? undefined : Number(f.get(k)));
export const s = (f: FormData, k: string) => String(f.get(k) ?? "");
export const stamp = (a: { day: number; time: string }) => `${a.day === 0 ? "今日" : `${a.day}日`} ${a.time}`;
export const show = (v: number | null | undefined) => (v === undefined || v === null ? "—" : Number(v.toFixed(1)));
