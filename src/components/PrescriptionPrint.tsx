"use client";
import { useState } from "react";
import { createPortal, flushSync } from "react-dom";
import { Printer } from "lucide-react";
import { prescriptionLineText, type RxLine } from "@/lib/national/rx-lines";
export function PrescriptionPrintSheet({ patient, date, doctor, lines }: { patient: { id: string; name: string }; date: string; doctor: string; lines: RxLine[] }) {
  return <article className="bg-white p-[10mm] text-ink">
    <h1 className="mb-4 text-center text-xl font-bold">処方せん（模擬）</h1>
    <p>{patient.name} 様　ID {patient.id}</p><p>発行日 {date}　処方医 {doctor}</p>
    <ol className="mt-4 space-y-3 border-y border-ink py-4">{lines.map((line, i) => <li key={i}>{prescriptionLineText(line)}</li>)}</ol>
  </article>;
}
export function PrescriptionPrintButton(props: { patient: { id: string; name: string }; date: string; doctor: string; lines: RxLine[]; disabled?: boolean }) {
  const [printing, setPrinting] = useState(false);
  const print = () => {
    flushSync(() => setPrinting(true));
    window.addEventListener("afterprint", () => setPrinting(false), { once: true });
    window.print();
  };
  return <><button type="button" disabled={props.disabled || !props.lines.length} onClick={print} className="inline-flex items-center gap-1 rounded border border-rule px-2 py-1 disabled:opacity-40"><Printer size={14} />処方せんを印刷（模擬）</button>
    {printing && typeof document !== "undefined" && createPortal(<div className="hidden print:block"><PrescriptionPrintSheet {...props} /></div>, document.body)}
  </>;
}
