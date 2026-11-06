"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { LAB_PASTE_EVENT, readLabTransfer, type LabTransfer } from "@/lib/lab-transfer";

export function requestLabPaste(payload: LabTransfer, shift = false) {
  window.dispatchEvent(new CustomEvent(LAB_PASTE_EVENT, { detail: { payload, shift } }));
}
export function LabPasteReceiver({ patientId, onPaste }: { patientId: string; onPaste: (text: string) => void }) {
  const [pending, setPending] = useState<{ payload: LabTransfer; format: "text" | "table" } | null>(null);
  useEffect(() => {
    const receive = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      const payload = readLabTransfer(JSON.stringify(detail?.payload));
      if (!payload || payload.patientId !== patientId || !payload.text) return;
      let format: "text" | "table" = "text";
      try { if (localStorage.getItem("lab-paste-format") === "table") format = "table"; } catch {}
      if (detail.shift) format = "table";
      setPending({ payload, format });
    };
    window.addEventListener(LAB_PASTE_EVENT, receive);
    return () => window.removeEventListener(LAB_PASTE_EVENT, receive);
  }, [patientId]);
  if (!pending || pending.payload.patientId !== patientId) return null;
  return createPortal(<div role="dialog" aria-label="検査結果を記事に貼る" className="fixed right-4 top-20 z-[1000] flex gap-2 border border-rule bg-sheet p-2 text-xs shadow">
    {(["text", "table"] as const).map(format => <button autoFocus={pending.format === format} key={format} type="button" className={`rounded border px-3 py-1 ${pending.format === format ? "border-ai text-ai" : "border-rule"}`} onClick={() => {
      onPaste(pending.payload[format]);
      try { localStorage.setItem("lab-paste-format", format); } catch {}
      setPending(null);
    }}>{format === "text" ? "テキスト" : "表"}</button>)}
    <button type="button" onClick={() => setPending(null)}>取消</button>
  </div>, document.body);
}
