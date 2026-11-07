"use client";

// 病棟の iPad を患者さんに渡す: only the admission questions, full screen; the chart is not shown. The answers go in
// as 患者さんの入力 like the ones from the patient's phone. Back to the chart: a staff member holds the corner.

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { answeredCount, type IntakeAnswers } from "@/lib/portal/intake";
import { IntakeForm } from "./IntakeForm";

const HOLD_MS = 1500;

export function PortalHandover({ name, onSend, onExit }: { name: string; onSend: (a: IntakeAnswers) => void; onExit: () => void }) {
  const [answers, setAnswers] = useState<IntakeAnswers>({});
  const [sent, setSent] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stop = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => stop, []);
  if (typeof document === "undefined") return null;
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="入院のときの質問" className="fixed inset-0 z-[200] overflow-y-auto bg-paper text-ink print:hidden">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-rule bg-paper/95 px-5 py-3">
        <div className="flex-1 text-[20px] font-bold">{name} 様　入院のときの質問</div>
        <button
          type="button"
          aria-label="職員：長押しで戻る"
          onPointerDown={() => {
            stop();
            timer.current = setTimeout(onExit, HOLD_MS);
          }}
          onPointerUp={stop}
          onPointerLeave={stop}
          onPointerCancel={stop}
          onContextMenu={(e) => e.preventDefault()}
          className="select-none rounded-lg border border-rule px-3 py-2 text-[12px] text-ink-faint"
        >
          職員：長押しで戻る
        </button>
      </header>
      <main className="mx-auto max-w-2xl space-y-4 px-5 py-5 pb-28">
        {sent ? (
          <p className="rounded-xl bg-wakatake-soft p-5 text-[20px] font-bold text-wakatake">送りました。看護師に端末をお返しください。</p>
        ) : (
          <IntakeForm value={answers} onChange={setAnswers} />
        )}
      </main>
      {!sent && (
        <div className="fixed inset-x-0 bottom-0 border-t border-rule bg-paper/95 px-5 py-3">
          <div className="mx-auto max-w-2xl">
            <button
              type="button"
              disabled={answeredCount(answers) === 0}
              onClick={() => {
                onSend(answers);
                setAnswers({});
                setSent(true);
              }}
              className="min-h-14 w-full rounded-xl bg-ai text-[20px] font-bold text-white disabled:opacity-40"
            >
              看護師に送る
            </button>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}
