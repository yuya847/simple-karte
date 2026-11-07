"use client";

// 直したい（上の帯）: a request to change the app itself, sent from where it is used — the screen and the 職種 are
// put on by the app, the words typed or spoken. Claude Code reads it (MCP list_requests), fixes the code and
// writes back the commit (resolve_request). 最近の変更: the public repository's commits, newest first, with
// 「要望から」 on those that fixed a request. The words of the help are in lib/help/content.ts (その場で直す).

import { CircleHelp, Mic, Square, Wrench } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { barButton, Popover } from "./AppFrame";
import { openHelp } from "@/lib/help/events";
import { useSpeech } from "@/lib/use-speech";
import { CHANGES_EVENT, openChanges } from "@/lib/improve/events";
import { byDay, commitUrl, dayCounts, loadChanges, timeOf, type Changes } from "@/lib/improve/changes";
import { IMPROVE_TEXT_MAX, fixSeen, mineOf, newRequest, requestOfCommit, type ImproveRequest, type ImproveStatus } from "@/lib/improve/requests";
import type { Patient } from "@/lib/types";

type View = "send" | "changes";

const STATUS_TONE: Record<ImproveStatus, string> = {
  受付: "border border-rule bg-paper text-ink-soft",
  作業中: "bg-yamabuki-soft text-yamabuki",
  直った: "bg-wakatake-soft text-wakatake",
};

function Status({ s }: { s: ImproveStatus }) {
  return <span className={`shrink-0 rounded px-1.5 text-[11px] font-bold leading-5 ${STATUS_TONE[s]}`}>{s}</span>;
}

export function ImproveButton({ requests, onRequests, me, screen, patients }: {
  requests: ImproveRequest[];
  onRequests: Dispatch<SetStateAction<ImproveRequest[]>>;
  me: { name: string; role: string };
  /** The screen as words (screenLabel): no patient. */
  screen: string;
  /** For the replacement of names and numbers before the request is kept. */
  patients: Patient[];
}) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>("send");
  const [highlight, setHighlight] = useState<string | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useEffect(() => {
    const show = (e: Event) => {
      setHighlight((e as CustomEvent<string | undefined>).detail ?? null);
      setView("changes");
      setOpen(true);
    };
    window.addEventListener(CHANGES_EVENT, show);
    return () => window.removeEventListener(CHANGES_EVENT, show);
  }, []);
  const tab = (v: View, label: string) => (
    <button type="button" role="tab" aria-selected={view === v} onClick={() => { setView(v); setHighlight(null); }} className={`rounded px-2 py-0.5 text-[13px] ${view === v ? "bg-ai-soft font-bold text-ai" : "text-ink-soft hover:bg-paper"}`}>
      {label}
    </button>
  );
  return (
    <>
      <button ref={btn} type="button" onClick={() => { setView("send"); setHighlight(null); setOpen((o) => !o); }} aria-expanded={open} aria-haspopup="dialog" aria-label="ここを直したい" title="ここを直したい（この画面への要望）・最近の変更" className={barButton}>
        <Wrench size={16} />
        <span className="hidden lg:inline">直したい</span>
      </button>
      <Popover open={open} onClose={close} anchor={btn} place="below-right" width={view === "send" ? 360 : 440}>
        <div role="dialog" aria-label={view === "send" ? "ここを直したい" : "最近の変更"} className="p-1">
          <div className="mb-2 flex items-center gap-1" role="tablist">
            {tab("send", "直したい")}
            {tab("changes", "最近の変更")}
            <button type="button" onClick={() => { setOpen(false); openHelp("Improve"); }} aria-label="使い方" title="使い方" className="ml-auto rounded p-1 text-ink-faint hover:bg-paper hover:text-ink">
              <CircleHelp size={15} />
            </button>
          </div>
          {view === "send" ? (
            <SendForm requests={requests} onRequests={onRequests} me={me} screen={screen} patients={patients} onShowFix={(r) => { if (r.commit) openChanges(r.commit); onRequests((all) => fixSeen(all, r.id)); }} />
          ) : (
            <ChangeList requests={requests} highlight={highlight} />
          )}
        </div>
      </Popover>
    </>
  );
}

function SendForm({ requests, onRequests, me, screen, patients, onShowFix }: {
  requests: ImproveRequest[];
  onRequests: Dispatch<SetStateAction<ImproveRequest[]>>;
  me: { name: string; role: string };
  screen: string;
  patients: Patient[];
  onShowFix: (r: ImproveRequest) => void;
}) {
  const [text, setText] = useState("");
  const [sent, setSent] = useState(false);
  const speech = useSpeech((t) => setText((x) => (x ? `${x}${t}` : t).slice(0, IMPROVE_TEXT_MAX)));
  const { stop } = speech;
  useEffect(() => () => stop(), [stop]);
  useEffect(() => {
    if (!sent) return;
    const t = window.setTimeout(() => setSent(false), 2500);
    return () => window.clearTimeout(t);
  }, [sent]);
  const send = () => {
    if (speech.listening) speech.stop();
    const r = newRequest({ id: crypto.randomUUID(), by: me.name, role: me.role, screen, text, now: new Date(), patients });
    if (!r) return;
    onRequests((all) => [...all, r]);
    setText("");
    setSent(true);
  };
  const mine = mineOf(requests, me.name).slice(0, 3);
  return (
    <div className="space-y-2">
      <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[12px]">
        <dt className="text-ink-faint">画面</dt>
        <dd className="min-w-0 truncate">{screen}</dd>
        <dt className="text-ink-faint">職種</dt>
        <dd>{me.role}</dd>
      </dl>
      <div className="relative">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={IMPROVE_TEXT_MAX}
          rows={3}
          aria-label="要望"
          placeholder="どこを、どう直したいか"
          className="block w-full resize-none rounded border border-rule bg-sheet px-2 py-1.5 pr-9 text-sm focus:border-ai focus:outline-none"
        />
        {speech.supported && (
          <button type="button" onClick={speech.listening ? speech.stop : speech.start} aria-pressed={speech.listening} aria-label={speech.listening ? "話すのを止める" : "話して入れる"} title={speech.listening ? "止める" : "話して入れる"} className={`absolute right-1 top-1 rounded p-1 ${speech.listening ? "bg-shu text-white" : "text-ink-soft hover:bg-paper hover:text-ai"}`}>
            {speech.listening ? <Square size={14} /> : <Mic size={14} />}
          </button>
        )}
        {speech.interim && <p className="mt-0.5 text-[12px] text-ink-faint">{speech.interim}</p>}
        {speech.error && <p className="mt-0.5 text-[12px] text-shu">{speech.error}</p>}
      </div>
      <div className="flex items-center justify-end gap-2">
        {sent && <span role="status" className="text-[12px] text-wakatake">送りました</span>}
        <button type="button" disabled={!text.trim()} onClick={send} className="rounded bg-ai px-3 py-1 text-sm font-bold text-white hover:opacity-90 disabled:opacity-40">
          送る
        </button>
      </div>
      {mine.length > 0 && (
        <section aria-label="送った要望" className="border-t border-rule-soft pt-1.5">
          <ul className="space-y-1">
            {mine.map((r) => {
              const body = (
                <>
                  <Status s={r.status} />
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 text-[12px]">{r.text}</span>
                    {r.status === "直った" && <span className="block text-[11px] text-ink-faint">{[r.commit?.slice(0, 7), r.note].filter(Boolean).join("、")}</span>}
                  </span>
                </>
              );
              return (
                <li key={r.id}>
                  {r.status === "直った" ? (
                    <button type="button" onClick={() => onShowFix(r)} className="flex w-full items-start gap-1.5 rounded px-1 py-0.5 text-left hover:bg-paper">{body}</button>
                  ) : (
                    <div className="flex items-start gap-1.5 px-1 py-0.5">{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}

function ChangeList({ requests, highlight }: { requests: ImproveRequest[]; highlight: string | null }) {
  const [changes, setChanges] = useState<Changes | null>(null);
  const [now] = useState(() => new Date());
  const marked = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    let alive = true;
    let store: Storage | null = null;
    try {
      store = window.localStorage;
    } catch {}
    loadChanges(window.fetch.bind(window), store).then((c) => alive && setChanges(c));
    return () => {
      alive = false;
    };
  }, []);
  useLayoutEffect(() => {
    marked.current?.scrollIntoView({ block: "center" });
  }, [changes, highlight]);
  if (!changes) return <p className="px-1 py-2 text-[12px] text-ink-faint">…</p>;
  const counts = dayCounts(changes.rows, now);
  return (
    <div>
      <p className="nums mb-1 px-1 text-[12px] text-ink-soft">
        今日 {counts.today} 件・昨日 {counts.yesterday} 件{changes.later && <span className="ml-2 text-ink-faint">あとで</span>}
      </p>
      <div className="scroll-thin max-h-[min(70vh,640px)] overflow-y-auto">
      {byDay(changes.rows, now).map((g) => (
        <section key={g.day} aria-label={g.label} className="mb-1">
          <h3 className="sticky top-0 bg-sheet px-1 pb-0.5 pt-1 text-[11px] font-bold text-ink-faint">{g.label}</h3>
          <ul>
            {g.rows.map((r) => {
              const on = !!highlight && r.sha.startsWith(highlight.toLowerCase());
              const fixed = requestOfCommit(requests, r.sha);
              return (
                <li key={r.sha}>
                  <a ref={on ? marked : undefined} href={commitUrl(r.sha)} target="_blank" rel="noreferrer" aria-current={on ? "true" : undefined} className={`flex items-start gap-2 rounded px-1 py-1 text-[13px] hover:bg-paper ${on ? "bg-ai-soft" : ""}`}>
                    <span className="nums w-10 shrink-0 text-[12px] text-ink-faint">{timeOf(r.iso)}</span>
                    <span className="min-w-0 flex-1 leading-snug">{r.title}</span>
                    {fixed && <span className="shrink-0 rounded border border-ai bg-sheet px-1.5 text-[11px] font-bold leading-[18px] text-ai" title={fixed.text}>要望から</span>}
                  </a>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      </div>
    </div>
  );
}
