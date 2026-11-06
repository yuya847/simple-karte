"use client";

import { displayText } from "@/lib/display-text";
import { UserCheck } from "lucide-react";
import { createContext, useContext, useState } from "react";
import { COSIGN_RULES, COSIGN_SOURCES, confirmDeny, cosignLabel, pendingOf, signerLabel, type CosignItem } from "@/lib/cosign";

// 研修医の記録の確認: the mark on each record, the strip in the chart, and the ward's list.

const CosignCtx = createContext<Record<string, CosignItem>>({});

/** The items by record id (note id, order id), for the marks in the record. */
export const CosignRefs = CosignCtx.Provider;

/** 「指導医の確認待ち」 or 「確認 指導医 高橋 10:30」 next to a record a 研修医 wrote. */
export function CosignMark({ refId, pendingLabel }: { refId?: string; pendingLabel?: string }) {
  const item = useContext(CosignCtx)[refId ?? ""];
  if (!refId || !item) return null;
  const c = item.confirmed;
  return (
    <span
      title={displayText(c ? `${item.by}（${item.at.time}）の${item.kind}。${signerLabel(c.by, c.as)}が ${c.at.time} に確認${c.comment ? `：${c.comment}` : ""}` : `${item.by}（${item.at.time}）の${item.kind}。同じチームの指導医か上級医の確認がまだです`)}
      className={`rounded px-1 text-[10px] ${c ? "border border-wakatake/50 text-wakatake" : "bg-yamabuki-soft font-bold text-yamabuki"}`}
    >
      {!c && pendingLabel ? pendingLabel : cosignLabel(item)}
    </span>
  );
}

const clamp = "line-clamp-3 whitespace-pre-wrap break-words";

/** In the chart: this patient's records by a 研修医 still waiting, with 確認 for the 指導医 or 上級医. */
export function CosignStrip({ items, meName, onConfirm }: { items: CosignItem[]; meName: string; onConfirm: (ids: string[], comment: string) => void }) {
  const [comment, setComment] = useState("");
  const list = pendingOf(items);
  if (!list.length) return null;
  const mine = list.filter((i) => !confirmDeny(meName, i));
  const go = (ids: string[]) => {
    onConfirm(ids, comment);
    setComment("");
  };
  return (
    <section aria-label="指導医の確認待ち" className="border-b border-rule bg-yamabuki-soft/60 px-4 py-2 text-[12px]">
      <div className="flex flex-wrap items-center gap-2">
        <UserCheck size={14} className="text-yamabuki" />
        <b className="text-yamabuki">指導医の確認待ち {list.length}件</b>
        <span className="text-ink-soft">{mine.length ? "研修医が書いた記事・オーダ・指示簿です。内容を読んでから確かめてください。" : "研修医が書いた記事・オーダ・指示簿です。同じチームの指導医か上級医が確かめます。"}</span>
        {mine.length > 1 && (
          <button type="button" onClick={() => go(mine.map((i) => i.id))} className="ml-auto rounded bg-yamabuki px-2 py-0.5 text-xs font-bold text-white">
            表示中の{mine.length}件をまとめて確認
          </button>
        )}
      </div>
      <ul className="mt-1 space-y-1">
        {list.map((i) => {
          const why = confirmDeny(meName, i);
          return (
            <li key={i.id} className="flex items-start gap-2 border-t border-yamabuki/20 pt-1">
              <span className="shrink-0 rounded border border-yamabuki/50 px-1 text-[11px] text-yamabuki">{i.kind}</span>
              <span className={`min-w-0 flex-1 ${clamp}`} title={displayText(i.text)}>
                {displayText(i.text)}
              </span>
              <span className="nums shrink-0 text-ink-soft">
                {i.at.time} {displayText(i.by)}
                {displayText(i.version && i.version > 1 ? `（第${i.version}版）` : "")}
              </span>
              {!why && (
                <button type="button" onClick={() => go([i.id])} className="shrink-0 rounded border border-yamabuki px-1.5 text-[11px] text-yamabuki hover:bg-sheet">
                  確認
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {mine.length > 0 && (
        <input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="指導の内容・コメント（任意。確認に添えて残ります）" aria-label="指導の内容・コメント" className="mt-1.5 w-full rounded border border-rule bg-sheet px-1.5 py-0.5" />
      )}
      {!mine.length && list[0] && <p className="mt-1 text-[11px] text-ink-soft">{confirmDeny(meName, list[0])}</p>}
      <p className="mt-1 text-[10px] text-ink-faint">{COSIGN_RULES.effect}</p>
    </section>
  );
}

/**
 * The right-end tool 文書 > 研修医の記録の確認 (its drawer): this patient's waiting records with 確認, or a
 * line saying nothing waits, and the confirmed ones of today (who and when) under it.
 */
export function CosignPanel({ items, meName, onConfirm }: { items: CosignItem[]; meName: string; onConfirm: (ids: string[], comment: string) => void }) {
  const waiting = pendingOf(items);
  const done = items.filter((i) => i.confirmed).toReversed();
  return (
    <div className="space-y-3 text-[12px]">
      {waiting.length ? <CosignStrip items={items} meName={meName} onConfirm={onConfirm} /> : <p className="rounded-md border border-rule bg-sheet px-3 py-2 text-ink-soft">この患者の研修医の記録に、確認待ちはありません。</p>}
      {done.length > 0 && (
        <section aria-label="確認済み">
          <h3 className="mb-1 font-bold text-ink-soft">確認済み {done.length}件</h3>
          <ul className="space-y-1">
            {done.map((i) => (
              <li key={i.id} className="flex items-start gap-2 border-t border-rule-soft pt-1">
                <span className="shrink-0 rounded border border-rule px-1 text-[11px] text-ink-soft">{i.kind}</span>
                <span className={`min-w-0 flex-1 ${clamp}`} title={displayText(i.text)}>
                  {displayText(i.text)}
                </span>
                <span className="nums shrink-0 text-wakatake">{cosignLabel(i)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="hint text-[11px] text-ink-faint">研修医が書いた記事・オーダ・指示簿は、同じチームの指導医か上級医が内容を読んで「確認」します。件数は右端ツール「文書」のアイコンの赤い数字に出ます。</p>
    </div>
  );
}

type Show = "pending" | "done" | "all";

/** 病棟 > 研修医の記録の確認: every record of a 研修医, waiting or confirmed (who and when). */
export function CosignList({ items, meName, patientOf, onConfirm, onOpen }: { items: CosignItem[]; meName: string; patientOf: (id: string) => { name: string; room: string } | undefined; onConfirm: (ids: string[], comment: string) => void; onOpen: (patientId: string) => void }) {
  const [show, setShow] = useState<Show>("pending");
  const [picked, setPicked] = useState<string[]>([]);
  const [comment, setComment] = useState("");
  const shown = items.filter((i) => (show === "all" ? true : show === "pending" ? !i.confirmed : !!i.confirmed)).toReversed();
  const can = shown.filter((i) => !confirmDeny(meName, i));
  const chosen = picked.filter((id) => can.some((i) => i.id === id));
  const waiting = pendingOf(items).length;
  const go = (ids: string[]) => {
    onConfirm(ids, comment);
    setPicked([]);
    setComment("");
  };
  return (
    <main className="mx-auto max-w-6xl px-6 py-5 text-[13px]">
      <header className="mb-2 flex flex-wrap items-baseline gap-3">
        <h1 className="text-lg font-bold">研修医の記録の確認</h1>
        <span className="text-ink-soft">
          確認待ち <b className="text-yamabuki">{waiting}</b>件　確認済み {items.length - waiting}件
        </span>
        <div className="ml-auto flex gap-1" role="radiogroup" aria-label="表示">
          {(
            [
              ["pending", "確認待ち"],
              ["done", "確認済み"],
              ["all", "すべて"],
            ] as const
          ).map(([k, l]) => (
            <button key={k} type="button" role="radio" aria-checked={show === k} onClick={() => setShow(k)} className={`rounded border px-2 py-0.5 text-xs ${show === k ? "border-ai bg-ai text-white" : "border-rule bg-sheet"}`}>
              {l}
            </button>
          ))}
        </div>
      </header>
      <p className="mb-3 text-[12px] text-ink-soft">
        研修医が確定した記事とオーダ（新規・中止・延長）・指示簿（追加・修正・中止）を1件ずつ並べます。確かめるのは同じチームの指導医か上級医で、確かめた人と時刻が記録とこの一覧に残ります。どれを直すか・指導するかは確かめる医師が決めます。
      </p>
      {can.length > 0 && (
        <div className="mb-2 flex flex-wrap items-center gap-2 rounded-md border border-rule bg-sheet px-3 py-2">
          <input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="指導の内容・コメント（任意。確認に添えて残ります）" aria-label="指導の内容・コメント" className="min-w-0 flex-1 rounded border border-rule bg-paper px-1.5 py-0.5" />
          <button type="button" disabled={!chosen.length} onClick={() => go(chosen)} className="rounded bg-yamabuki px-2 py-0.5 text-xs font-bold text-white disabled:opacity-40">
            選んだ{chosen.length}件を確認
          </button>
          <button type="button" onClick={() => go(can.map((i) => i.id))} className="rounded border border-yamabuki px-2 py-0.5 text-xs font-bold text-yamabuki">
            表示中の{can.length}件をまとめて確認
          </button>
        </div>
      )}
      {!can.length && waiting > 0 && show !== "done" && items.find((i) => !i.confirmed) && <p className="mb-2 text-[12px] text-ink-soft">{confirmDeny(meName, items.find((i) => !i.confirmed)!)}</p>}
      {shown.length === 0 ? (
        <p className="text-ink-faint">{show === "pending" ? "確認待ちはありません。研修医 田中で入って記事・オーダ・指示簿を確定すると、ここに並びます。" : "まだありません。"}</p>
      ) : (
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-rule text-left text-[11px] text-ink-faint">
              <th className="w-6 py-1 pr-2 font-normal">
                <span className="sr-only">選ぶ</span>
              </th>
              <th className="py-1 pr-2 font-normal">患者</th>
              <th className="py-1 pr-2 font-normal">種類</th>
              <th className="py-1 pr-2 font-normal">内容</th>
              <th className="py-1 pr-2 font-normal">書いた人</th>
              <th className="py-1 font-normal">確認</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((i) => {
              const p = patientOf(i.patientId);
              const ok = !confirmDeny(meName, i);
              return (
                <tr key={i.id} className={`border-b border-rule-soft align-top ${i.confirmed ? "" : "bg-yamabuki-soft/40"}`}>
                  <td className="py-1 pr-2">
                    {ok && <input type="checkbox" aria-label="選ぶ" checked={picked.includes(i.id)} onChange={(e) => setPicked((xs) => (e.target.checked ? [...xs, i.id] : xs.filter((x) => x !== i.id)))} className="accent-yamabuki" />}
                  </td>
                  <td className="whitespace-nowrap py-1 pr-2">
                    <button type="button" onClick={() => onOpen(i.patientId)} className="text-ai underline-offset-2 hover:underline">
                      {displayText(p ? `${p.room} ${p.name}` : i.patientId)}
                    </button>
                  </td>
                  <td className="whitespace-nowrap py-1 pr-2">
                    {i.kind}
                    {displayText(i.version && i.version > 1 ? `（第${i.version}版）` : "")}
                  </td>
                  <td className={`py-1 pr-2 ${clamp}`} title={displayText(i.text)}>
                    {displayText(i.text)}
                  </td>
                  <td className="nums whitespace-nowrap py-1 pr-2">
                    {i.at.time} {displayText(i.by)}
                  </td>
                  <td className="py-1">
                    {i.confirmed ? (
                      <span className="text-wakatake">
                        {cosignLabel(i)}
                        {i.confirmed.comment && <span className="block text-[11px] text-ink-soft">{i.confirmed.comment}</span>}
                      </span>
                    ) : ok ? (
                      <button type="button" onClick={() => go([i.id])} className="rounded border border-yamabuki px-1.5 text-[11px] text-yamabuki hover:bg-sheet">
                        確認
                      </button>
                    ) : (
                      <span className="text-yamabuki">確認待ち</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <CosignBasis />
    </main>
  );
}

/** The sources, and what this fictional hospital decided where they say nothing. */
export function CosignBasis() {
  return (
    <section className="hint mt-5 space-y-1 border-t border-rule pt-3 text-[11px] text-ink-soft">
      <h2 className="font-bold text-ink">根拠</h2>
      <ul className="list-disc space-y-0.5 pl-5">
        {Object.values(COSIGN_SOURCES).map((s) => (
          <li key={s.url + s.label}>
            <a href={s.url} target="_blank" rel="noreferrer" className="text-ai underline-offset-2 hover:underline">
              {s.label}
            </a>
          </li>
        ))}
      </ul>
      <h2 className="pt-1 font-bold text-ink">院内の取り決め</h2>
      <ul className="list-disc space-y-0.5 pl-5">
        {Object.values(COSIGN_RULES).map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
    </section>
  );
}
