import type { ReactNode } from "react";
import type { InjStep } from "@/lib/inj-entry";

/** すべての欄を表示し、入力中の段だけを枠で示す。 */
export function InjectionEntryRow({ step, active, className, children }: { step: InjStep; active?: InjStep; className?: string; children: ReactNode }) {
  return <div data-step={step} data-active={active === step} className={`${className ?? ""} rounded border p-1 ${active === step ? "border-ai" : "border-transparent"}`}>{children}</div>;
}
