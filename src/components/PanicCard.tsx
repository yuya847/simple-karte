"use client";

import { displayText } from "@/lib/display-text";
import { PhoneCall, PhoneOff } from "lucide-react";
import { useState } from "react";
import { auditLog } from "@/lib/audit";
import { addTry, type LabDesk } from "@/lib/lab-desk";
import { callLine, canReport, hitLine, reachList, reachState, reportBlocker, reportCall, type Ack, type ContactAttempt, type PanicCall, type ResultItem } from "@/lib/results";
import { useDeny, useMe } from "./RoleContext";

interface Props {
  item: ResultItem;
  who: string;
  /** The patient's name, for the audit log. */
  name: string;
  /** When the sample was taken (or the culture reported), in words. */
  when: string;
  script: string[];
  call?: PanicCall;
  ack?: Ack;
  /** Tries that did not reach anyone yet. */
  tries: ContactAttempt[];
  nowTime: string;
  attending: string;
  onCall: (c: PanicCall) => void;
  onDesk: (f: (d: LabDesk) => LabDesk) => void;
}

const MISSES = ["つながらない（不在・話し中）", "伝言・折り返しを頼んだ"] as const;

/** One panic value: what to say, each try, and the report (read back, or why not). */
export function PanicCard({ item, who, name, when, script, call, ack, tries, nowTime, attending, onCall, onDesk }: Props) {
  const me = useMe();
  const deny = useDeny()("panic.call");
  const targets = reachList(attending);
  const [to, setTo] = useState(targets[0]);
  const [means, setMeans] = useState<PanicCall["means"]>("電話");
  const [readBack, setReadBack] = useState(false);
  const [noReadBack, setNoReadBack] = useState("");
  const [miss, setMiss] = useState<(typeof MISSES)[number]>(MISSES[0]);
  const reach = reachState(tries);
  const history = call?.attempts ?? tries;
  const at = { day: 0, time: nowTime };
  const blocker = reportBlocker(to, readBack, noReadBack);
  const listId = `reach-${item.key}`;
  return (
    <div className={`rounded-lg border p-3 ${call ? "border-rule bg-sheet text-ink-soft" : "border-shu/50 bg-shu-soft/50"}`}>
      <div className="flex flex-wrap items-baseline gap-2">
        <b>{who}</b>
        <span className="nums text-ink-soft">
          {item.kind === "培養" ? "報告" : "採取"} {when}
        </span>
        <b className={call ? "text-ink-soft" : "text-shu"}>{item.panic.map(hitLine).join("、")}</b>
      </div>
      {item.corrected && <p className="text-[11px] font-bold text-yamabuki">{item.corrected}。訂正した値として伝えます。</p>}
      {history.length > (call ? 1 : 0) && (
        <ol className="nums mt-1 space-y-0.5 text-[11px]">
          {history.map((t, n) => (
            <li key={n} className={`flex items-center gap-1 ${t.result === "伝えた" ? "font-bold text-wakatake" : "text-yamabuki"}`}>
              {t.result === "伝えた" ? <PhoneCall size={11} /> : <PhoneOff size={11} />}
              {n + 1}回目 {t.at.time} {t.means} {t.to}：{t.result}（{displayText(t.by)}）
            </li>
          ))}
        </ol>
      )}
      {call ? (
        <div className="mt-1 space-y-0.5 text-xs">
          <p className="flex items-center gap-1 text-wakatake">
            <PhoneCall size={12} />
            連絡 {callLine(call)}
          </p>
          {ack ? (
            <p className="text-wakatake">
              医師の対応：{ack.at.time} {displayText(ack.by)}「{ack.response ?? "確認した"}」
            </p>
          ) : (
            <p className="text-ink-soft">検査室の連絡済み・医師の対応待ち</p>
          )}
        </div>
      ) : (
        <fieldset disabled={!!deny} className="m-0 mt-1 min-w-0 space-y-1.5 border-0 p-0 text-xs">
          <div className="rounded border border-rule bg-sheet px-2 py-1 text-ink-soft">
            <span className="font-bold">伝える内容：</span>
            {script.join("　")}
          </div>
          {reach.goOthers && (
            <p className="flex flex-wrap items-center gap-1 font-bold text-yamabuki">
              {reach.failed}回つながりませんでした。取り決めでは、同じ科の医師へ、それでもつながらなければ管理当直へ連絡します。
              {targets.slice(1).map((t) => (
                <button key={t} type="button" onClick={() => setTo(t)} className="rounded border border-yamabuki px-1.5 font-normal hover:bg-yamabuki hover:text-white">
                  {t}へ
                </button>
              ))}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1">
              相手
              <input value={to} onChange={(e) => setTo(e.target.value)} list={listId} className="w-64 rounded border border-rule bg-sheet px-1.5 py-0.5" />
              <datalist id={listId}>
                {targets.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </label>
            <select value={means} onChange={(e) => setMeans(e.target.value as PanicCall["means"])} aria-label="手段" className="rounded border border-rule bg-sheet px-1 py-0.5">
              <option>電話</option>
              <option>対面</option>
            </select>
            <span className="ml-auto flex items-center gap-1">
              <select value={miss} onChange={(e) => setMiss(e.target.value as (typeof MISSES)[number])} aria-label="つながらなかったとき" className="rounded border border-rule bg-sheet px-1 py-0.5">
                {MISSES.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
              <button
                type="button"
                disabled={!to.trim()}
                onClick={() => {
                  const t: ContactAttempt = { at, by: me.name, to: to.trim(), means, result: miss };
                  onDesk((d) => addTry(d, item.key, t));
                  auditLog({ role: me.role, actor: me.name, action: "パニック値の連絡（報告できず）", patient: name, detail: `${tries.length + 1}回目 ${t.means} ${t.to}：${t.result}` });
                }}
                className="flex items-center gap-1 rounded border border-yamabuki px-2 py-0.5 font-bold text-yamabuki disabled:opacity-40"
              >
                <PhoneOff size={12} />
                記録してかけ直す
              </button>
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1">
              <input type="checkbox" checked={readBack} onChange={(e) => setReadBack(e.target.checked)} className="accent-shu" />
              相手が値を復唱した
            </label>
            {!readBack && (
              <label className="flex min-w-0 flex-1 items-center gap-1">
                復唱できなかった理由
                <input value={noReadBack} onChange={(e) => setNoReadBack(e.target.value)} placeholder="例：処置中で、聞いてすぐ電話が切れた" className="min-w-0 flex-1 rounded border border-rule bg-sheet px-1.5 py-0.5" />
              </label>
            )}
            <span className="ml-auto flex flex-wrap items-center justify-end gap-2">
              {blocker && <span className="text-[11px] font-bold text-yamabuki">{blocker}</span>}
              <button
                type="button"
                disabled={!canReport(to, readBack, noReadBack)}
                onClick={() => onCall(reportCall(item, tries, { by: me.name, to, means, readBack, noReadBack, at }))}
                title={blocker ?? undefined}
                className="flex items-center gap-1 whitespace-nowrap rounded bg-shu px-3 py-1 font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                <PhoneCall size={12} />
                報告した（{nowTime}）
              </button>
            </span>
          </div>
        </fieldset>
      )}
    </div>
  );
}
