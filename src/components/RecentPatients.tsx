"use client";

import { History } from "lucide-react";
import type { RecentOpen } from "@/lib/recent";
import type { Patient } from "@/lib/types";
import { ageSex } from "@/lib/person";
import { PatientAvatar } from "./PatientAvatar";

/** 最近開いた患者: the charts this person opened, newest first; press one to open it again. */
export function RecentPatients({ list, patient, onOpen, onClear }: { list: RecentOpen[]; patient: (id: string) => Patient | undefined; onOpen: (id: string) => void; onClear: () => void }) {
  const rows = list.flatMap((r) => {
    const p = patient(r.id);
    return p ? [{ r, p }] : [];
  });
  return (
    <section aria-label="最近開いた患者" className="scroll-thin min-h-0 flex-1 overflow-y-auto bg-paper">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-rule bg-sheet px-5 py-3">
        <h1 className="flex items-center gap-1.5 text-lg font-bold">
          <History size={18} />
          最近開いた患者
          <span className="nums ml-1 text-sm font-normal text-ink-soft">{rows.length}人</span>
        </h1>

        {rows.length > 0 && (
          <button type="button" onClick={onClear} className="ml-auto rounded border border-rule px-2 py-0.5 text-xs text-ink-soft hover:text-ink">
            この一覧を空にする
          </button>
        )}
      </header>
      {rows.length === 0 ? (
        <p className="px-5 py-6 text-sm text-ink-faint">まだカルテを開いていません。</p>
      ) : (
        <ul className="divide-y divide-rule-soft bg-sheet">
          {rows.map(({ r, p }) => (
            <li key={r.id}>
              <button type="button" onClick={() => onOpen(r.id)} className="flex w-full items-center gap-3 px-5 py-2.5 text-left hover:bg-ai-soft/40 pointer-coarse:py-3.5">
                <PatientAvatar sex={p.sex} age={p.age} size={30} className="rounded-full" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[10px] text-ink-faint">{p.kana}</span>
                  <span className="font-bold text-ai">{p.name}</span>
                  <span className="ml-2 text-[12px] text-ink-soft">
                    {ageSex(p)}　{p.ward ? `${p.ward}・` : ""}
                    {p.room}　{p.admissionDiagnosis}
                  </span>
                </span>
                <span className="nums shrink-0 text-[12px] text-ink-faint">{r.day === 0 ? `今日 ${r.time}` : "前日以前"}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* Help migration source (references and dynamic wording):
<p >自分がカルテを開いた患者を、新しい順に並べます（最大20人、この端末のみに保存）。誰がいつ開いたかの正式な記録は監査ログにあります。</p>
*/
