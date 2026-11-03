"use client";

import { Printer } from "lucide-react";
import { useState } from "react";
import { createPortal, flushSync } from "react-dom";

export interface BedsideInfo {
  room: string;
  name: string;
  kana: string;
  doctor: string;
  nurse: string;
  rest: string | null;
  diet: string | null;
  marks: { label: string; tone: "shu" | "yamabuki" | "ai" | "fuji" }[];
  today: { when: string; what: string }[];
}

const TONE = { shu: "bg-shu text-white", yamabuki: "bg-yamabuki text-white", ai: "bg-ai text-white", fuji: "bg-fuji text-white" } as const;

function Board({ b }: { b: BedsideInfo }) {
  return (
    <div className="w-full max-w-[720px] rounded-xl border-2 border-ink bg-white p-6 text-ink">
      <div className="flex items-baseline justify-between border-b-2 border-ink pb-2">
        <span className="nums text-3xl font-bold">{b.room}</span>
        <span className="text-right">
          <span className="block text-sm">{b.kana}</span>
          <span className="text-4xl font-bold">{b.name} 様</span>
        </span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-xl">
        <div>
          <span className="text-sm text-ink-soft">主治医</span>
          <div className="font-bold">{b.doctor}</div>
        </div>
        <div>
          <span className="text-sm text-ink-soft">担当看護師（今日）</span>
          <div className="font-bold">{b.nurse}</div>
        </div>
        <div>
          <span className="text-sm text-ink-soft">安静度</span>
          <div className="font-bold">{b.rest ?? "—"}</div>
        </div>
        <div>
          <span className="text-sm text-ink-soft">食事</span>
          <div className="font-bold">{b.diet ?? "—"}</div>
        </div>
      </div>
      {b.marks.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {b.marks.filter((m, i) => b.marks.findIndex((x) => x.label === m.label) === i).map((m, i) => (
            <span key={`${m.label}-${i}`} className={`rounded-lg px-3 py-1.5 text-xl font-bold ${TONE[m.tone]}`}>
              {m.label}
            </span>
          ))}
        </div>
      )}
      <div className="mt-4">
        <span className="text-sm text-ink-soft">今日と明日の予定</span>
        {b.today.length ? (
          <ul className="nums text-lg">
            {b.today.map((t, i) => (
              <li key={i}>
                <b>{t.when}</b>　{t.what}
              </li>
            ))}
          </ul>
        ) : (
          <div className="text-lg">—</div>
        )}
      </div>
    </div>
  );
}

/**
 * ベッドサイド表示: what staff need at the bed, in large letters, from the chart. Diagnoses, the code status
 * and the names of infections are left out (visitors can see the bed).
 */
export function BedsidePanel({ b }: { b: BedsideInfo }) {
  const [printing, setPrinting] = useState(false);
  return (
    <div className="space-y-3">
      <Board b={b} />
      <button
        type="button"
        onClick={() => {
          flushSync(() => setPrinting(true));
          const done = () => {
            setPrinting(false);
            window.removeEventListener("afterprint", done);
          };
          window.addEventListener("afterprint", done);
          window.print();
        }}
        className="flex items-center gap-1.5 rounded-md border border-rule px-3 py-1.5 text-sm hover:border-ai hover:text-ai"
      >
        <Printer size={14} />
        印刷する（ベッドの横の掲示に）
      </button>
      <p className="text-[11px] text-ink-faint">カルテからコードで作っています。ベッドの横は面会の人も見るので、病名・蘇生の方針（DNAR など）・感染症の名前は出しません。端末につなぐ機能はありません（試作）。</p>
      {printing && typeof document !== "undefined" && createPortal(<div className="hidden bg-white p-[10mm] print:block"><Board b={b} /></div>, document.body)}
    </div>
  );
}
