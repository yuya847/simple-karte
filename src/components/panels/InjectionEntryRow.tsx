import type { ReactNode } from "react";
import type { InjStep } from "@/lib/inj-entry";

/** 入力中の欄だけを罫線内に表示し、ほかの欄はフォーカス順からも外す。 */
export function InjectionEntryRow({ step, active, className, children }: { step: InjStep; active?: InjStep; className?: string; children: ReactNode }) {
  return <div data-step={step} hidden={active !== step} style={{ display: active !== step ? "none" : undefined }} className={className}>{children}</div>;
}
