"use client";

// Parts shared by the simulated national services (模擬): the 模擬 mark, the spec that was followed (name,
// version, URL) with the fields this app cannot fill, and the JSON that would be sent.

import { Copy, Download } from "lucide-react";
import { useState } from "react";
import type { SpecRef, Unfilled } from "@/lib/national/spec";
import { saveFile } from "../DeskParts";

/** The 模擬 mark: these screens never connect to the real service. */
export function MockMark({ text = "模擬" }: { text?: string }) {
  return <span className="ml-1 rounded border border-dashed border-shu/60 bg-shu-soft px-1.5 py-0.5 align-middle text-[10px] font-bold text-shu">{text}</span>;
}

/** One line under a title: what is simulated and that nothing is sent. */
export function MockNote({ children }: { children: React.ReactNode }) {
  return <p className="rounded border border-dashed border-shu/40 bg-paper px-2 py-1 text-[11px] leading-relaxed text-ink-soft">{children}</p>;
}

/** The specs followed (always shown) and what the app cannot fill. */
export function SpecBox({ specs, unfilled }: { specs: SpecRef[]; unfilled?: Unfilled[] }) {
  return (
    <section aria-label="従った仕様" className="space-y-2 rounded-md border border-rule bg-paper p-2.5 text-[11px]">
      <div>
        <h4 className="mb-1 font-bold text-ink-soft">従った仕様（公開されている文書）</h4>
        <ul className="space-y-0.5 text-ink-faint">
          {specs.map((s) => (
            <li key={s.url + s.name}>
              {s.name}
              {s.version ? `（${s.version}）` : ""}{" "}
              <a href={s.url} target="_blank" rel="noreferrer" className="break-all text-ai underline">
                {s.url}
              </a>
              {s.note ? <span className="block pl-3">{s.note}</span> : null}
            </li>
          ))}
        </ul>
      </div>
      {unfilled && unfilled.length > 0 && (
        <div>
          <h4 className="mb-1 font-bold text-ink-soft">この試作では埋められない項目（{unfilled.length}）</h4>
          <ul className="space-y-0.5 text-ink-soft">
            {unfilled.map((u) => (
              <li key={u.field}>
                <code className="rounded bg-sheet px-1 text-[10px]">{u.field}</code> {u.why}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/** The JSON that would be sent: shown folded, copied or saved as a file. */
export function JsonView({ value, name, label = "送る JSON（FHIR）" }: { value: unknown; name: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const text = JSON.stringify(value, null, 2);
  return (
    <div className="rounded-md border border-rule bg-sheet">
      <div className="flex flex-wrap items-center gap-2 px-2.5 py-1.5 text-[12px]">
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="font-bold text-ai hover:underline">
          {open ? "▼" : "▶"} {label}
        </button>
        <span className="nums text-[11px] text-ink-faint">{text.length.toLocaleString()} 文字</span>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard?.writeText(text).then(
              () => setCopied(true),
              () => setCopied(false),
            );
          }}
          className="ml-auto flex items-center gap-1 rounded border border-rule px-1.5 py-0.5 text-[11px] hover:border-ai hover:text-ai"
        >
          <Copy size={11} />
          {copied ? "写しました" : "写す"}
        </button>
        <button type="button" onClick={() => saveFile(name, text, "application/fhir+json;charset=utf-8")} className="flex items-center gap-1 rounded border border-rule px-1.5 py-0.5 text-[11px] hover:border-ai hover:text-ai">
          <Download size={11} />
          保存
        </button>
      </div>
      {open && <pre className="scroll-thin max-h-[50vh] overflow-auto border-t border-rule px-2.5 py-2 font-mono text-[10.5px] leading-snug whitespace-pre">{text}</pre>}
    </div>
  );
}
