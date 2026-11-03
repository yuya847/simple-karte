"use client";

import { useState } from "react";
import { addDays, formatShort, type CalendarDate } from "@/lib/dates";
import { DIRECTIVE_ITEMS, DNAR_NOTE, DNAR_SOURCE, directiveLine, emptyItems, type AdvanceDirective, type CprChoice, type DirectiveItem, type ItemChoice } from "@/lib/directives";

interface Props {
  patientId: string;
  today: CalendarDate;
  nowTime: string;
  doctor: string;
  history: AdvanceDirective[];
  cautions: string[];
  onSave: (d: AdvanceDirective) => void;
  onAddCaution: (text: string) => void;
}

const CPR: CprChoice[] = ["未確認", "行う", "行わない（DNAR）"];
const ITEM: ItemChoice[] = ["未確認", "行う", "行わない"];

/** Advance directive (decided by the doctor with the patient or family) and warnings on the band. */
export function DirectivePanel({ patientId, today, nowTime, doctor, history, cautions, onSave, onAddCaution }: Props) {
  const cur = history.filter((d) => d.status === "有効").at(-1);
  const [cpr, setCpr] = useState<CprChoice>(cur?.cpr ?? "未確認");
  const [items, setItems] = useState(cur?.items ?? emptyItems());
  const [withWhom, setWithWhom] = useState(cur?.discussedWith ?? "");
  const [review, setReview] = useState(cur?.reviewOn === undefined ? "" : String(cur.reviewOn));
  const [note, setNote] = useState(cur?.note ?? "");
  const [caution, setCaution] = useState("");
  const changed = !cur || cur.cpr !== cpr || DIRECTIVE_ITEMS.some((k) => cur.items[k] !== items[k]) || cur.discussedWith !== withWhom || String(cur.reviewOn ?? "") !== review || (cur.note ?? "") !== note;
  const pick = (value: string, options: string[], on: (v: string) => void, danger?: string) => (
    <div className="flex gap-1">
      {options.map((o) => (
        <button key={o} type="button" onClick={() => on(o)} className={`rounded border px-2 py-0.5 text-xs ${value === o ? (o === danger ? "border-shu bg-shu text-white" : "border-ai bg-ai text-white") : "border-rule bg-sheet"}`}>
          {o}
        </button>
      ))}
    </div>
  );
  return (
    <div className="space-y-4 text-[13px]">
      <section className="space-y-2">
        <h3 className="font-bold">事前指示（患者・家族と話し合って医師が決めたこと）</h3>
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-36">心停止時の心肺蘇生</span>
          {pick(cpr, CPR, (v) => setCpr(v as CprChoice), "行わない（DNAR）")}
        </div>
        {DIRECTIVE_ITEMS.map((k) => (
          <div key={k} className="flex flex-wrap items-center gap-2">
            <span className="w-36">{k}</span>
            {pick(items[k], ITEM, (v) => setItems({ ...items, [k as DirectiveItem]: v as ItemChoice }))}
          </div>
        ))}
        <p className="rounded bg-paper p-2 text-[11px] text-ink-soft">
          {DNAR_NOTE}
          <br />
          <span className="text-ink-faint">（{DNAR_SOURCE}）</span>
        </p>
        <label className="block text-xs text-ink-soft">
          話し合った人
          <input value={withWhom} onChange={(e) => setWithWhom(e.target.value)} placeholder="本人、長女（キーパーソン）など" className="mt-0.5 w-full rounded border border-rule bg-sheet px-2 py-1 text-[13px] text-ink" />
        </label>
        <label className="block text-xs text-ink-soft">
          経過・本人の意向（医師が書く）
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="mt-0.5 w-full rounded border border-rule bg-sheet px-2 py-1 text-[13px] text-ink" />
        </label>
        <label className="flex items-center gap-2 text-xs text-ink-soft">
          見直す日
          <select value={review} onChange={(e) => setReview(e.target.value)} className="rounded border border-rule bg-sheet px-1 py-0.5 text-ink">
            <option value="">決めない</option>
            {[1, 3, 7, 14].map((n) => (
              <option key={n} value={n}>
                {formatShort(addDays(today, n))}（{n}日後）
              </option>
            ))}
            {cur?.reviewOn !== undefined && ![1, 3, 7, 14].includes(cur.reviewOn) && <option value={cur.reviewOn}>{formatShort(addDays(today, cur.reviewOn))}</option>}
          </select>
        </label>
        <button
          type="button"
          disabled={!changed}
          onClick={() =>
            onSave({ id: `ad-${Date.now()}`, patientId, cpr, items, discussedWith: withWhom.trim(), decidedAt: { day: 0, time: nowTime }, by: doctor, reviewOn: review === "" ? undefined : Number(review), note: note.trim() || undefined, status: "有効" })
          }
          className="w-full rounded-md bg-ai px-3 py-2 font-bold text-white disabled:opacity-40"
        >
          確定（{nowTime}　{doctor}）
        </button>
      </section>
      {history.length > 0 && (
        <section>
          <h4 className="text-xs font-bold text-ink-soft">これまでの記録</h4>
          <ul className="mt-1 space-y-1 text-[12px]">
            {[...history].reverse().map((d) => (
              <li key={d.id} className={d.status === "有効" && d === cur ? "" : "text-ink-faint line-through"}>
                {formatShort(addDays(today, d.decidedAt.day))} {d.decidedAt.time} {d.by}：{directiveLine(d)}
                {d.note && <div className="pl-3 text-ink-soft no-underline">{d.note}</div>}
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className="space-y-1 border-t border-rule pt-3">
        <h3 className="font-bold">注意の掲示</h3>
        <div className="flex flex-wrap gap-1">
          {cautions.map((c) => (
            <span key={c} className="rounded border border-yamabuki/40 bg-yamabuki-soft px-1.5 text-xs text-yamabuki">
              {c}
            </span>
          ))}
        </div>
        <div className="flex gap-1">
          <input value={caution} onChange={(e) => setCaution(e.target.value)} placeholder="例：同姓同名の患者あり／ルート自己抜去に注意" className="flex-1 rounded border border-rule bg-sheet px-2 py-1" />
          <button
            type="button"
            disabled={!caution.trim() || cautions.includes(caution.trim())}
            onClick={() => {
              onAddCaution(caution.trim());
              setCaution("");
            }}
            className="rounded border border-ai px-2 text-xs font-bold text-ai disabled:opacity-40"
          >
            掲示する
          </button>
        </div>
      </section>
    </div>
  );
}
