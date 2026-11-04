"use client";

import { FileText, Hash, Mic, Send, Square, User } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { FIXED_CHANNELS, markCharted, markRead, patientChannel, postMessage, unreadCount, useChat, type Channel, type ChatMessage, type ChatRole } from "@/lib/chat";
import { addDays, formatShort, type CalendarDate } from "@/lib/dates";
import { useSpeech } from "@/lib/use-speech";
import type { Patient } from "@/lib/types";
import { useMe } from "./RoleContext";

const ROLE_STYLE: Record<ChatRole, string> = {
  医師: "bg-ai-soft text-ai",
  看護師: "bg-wakatake-soft text-wakatake",
  薬剤師: "bg-fuji-soft text-fuji",
  臨床検査技師: "bg-fuji-soft text-fuji",
  診療放射線技師: "bg-fuji-soft text-fuji",
  療法士: "bg-wakatake-soft text-wakatake",
  管理栄養士: "bg-yamabuki-soft text-yamabuki",
  MSW: "bg-fuji-soft text-fuji",
  臨床工学技士: "bg-tab text-ink",
  医事課: "bg-tab text-ink",
  管理者: "bg-yamabuki-soft text-yamabuki",
};

let seq = 0;
const newId = () => `chat-${Date.now()}-${++seq}`;

interface ThreadProps {
  channel: Channel;
  today: CalendarDate;
  nowTime: string;
  /** For a patient thread: copy a message into that patient's chart note. */
  onChart?: (m: ChatMessage, line: string) => void;
}

/** One channel or patient thread: messages and a box to write (typed or spoken). */
export function ChatThread({ channel, today, nowTime, onChart }: ThreadProps) {
  const state = useChat();
  const list = state.messages.filter((m) => m.channel === channel.id).sort((a, b) => a.at.day - b.at.day || a.at.time.localeCompare(b.at.time));
  const me = useMe();
  const [text, setText] = useState("");
  const [urgent, setUrgent] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const speech = useSpeech((t) => setText((x) => (x ? `${x}${t}` : t)));
  useEffect(() => {
    markRead(channel.id);
    end.current?.scrollIntoView({ block: "end" });
  }, [channel.id, list.length]);
  const send = () => {
    const t = text.trim();
    if (!t) return;
    postMessage({ id: newId(), channel: channel.id, at: { day: 0, time: nowTime }, author: me.name, role: me.role, text: t, urgent: urgent || undefined });
    setText("");
    setUrgent(false);
  };
  return (
    <div className="flex h-full min-h-0 flex-col text-[13px]">
      <div className="scroll-thin min-h-0 flex-1 space-y-2 overflow-y-auto px-1 py-2">
        {list.length === 0 && <p className="text-ink-faint">まだメッセージはありません。</p>}
        {list.map((m, i) => {
          const dayHead = i === 0 || list[i - 1].at.day !== m.at.day ? <div className="my-2 text-center text-[11px] text-ink-faint">{formatShort(addDays(today, m.at.day))}</div> : null;
          return (
            <div key={m.id}>
              {dayHead}
              <div className={`rounded-lg border px-3 py-2 ${m.urgent ? "border-shu bg-shu-soft/50" : "border-rule bg-sheet"}`}>
                <div className="flex flex-wrap items-baseline gap-2 text-[11px]">
                  <span className={`rounded px-1 font-bold ${ROLE_STYLE[m.role]}`}>{m.role}</span>
                  <b className="text-ink">{m.author}</b>
                  <span className="nums text-ink-faint">{m.at.time}</span>
                  {m.urgent && <span className="font-bold text-shu">至急</span>}
                  {onChart && (
                    <button
                      type="button"
                      disabled={m.charted}
                      onClick={() => {
                        onChart(m, `・チャット（${formatShort(addDays(today, m.at.day))} ${m.at.time} ${m.author}）：${m.text}`);
                        markCharted(m.id);
                      }}
                      className="ml-auto flex items-center gap-0.5 rounded border border-rule px-1.5 text-[11px] text-ink-soft hover:border-ai hover:text-ai disabled:opacity-50"
                      title="この内容をカルテの記事に入れる（誰が・いつ書いたかも入る）"
                    >
                      <FileText size={11} />
                      {m.charted ? "カルテに転記済み" : "カルテに転記"}
                    </button>
                  )}
                </div>
                <p className="mt-0.5 whitespace-pre-wrap text-ink">{m.text}</p>
              </div>
            </div>
          );
        })}
        <div ref={end} />
      </div>
      <div className="border-t border-rule pt-2">
        <div className="mb-1 flex flex-wrap items-center gap-2 text-[11px] text-ink-soft">
          <span className="flex items-center gap-1" title="書く人は右上で選んだ職種です">
            <User size={12} />
            {me.role}：{me.name}
          </span>
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} className="accent-shu" />
            至急
          </label>
          {channel.kind === "患者" && <span className="text-ink-faint">チャットは連絡用です。決めたことはカルテに書くか「カルテに転記」してください。</span>}
        </div>
        <div className="flex gap-1.5">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send();
            }}
            rows={2}
            placeholder={`${channel.name} に書く（⌘↵ で送る）`}
            className="flex-1 resize-none rounded border border-rule bg-sheet px-2 py-1 outline-none focus:border-ai"
          />
          {speech.supported && (
            <button type="button" onClick={speech.listening ? speech.stop : speech.start} className="rounded border border-rule px-2" title="話して入力（ブラウザの音声認識）">
              {speech.listening ? <Square size={14} /> : <Mic size={14} />}
            </button>
          )}
          <button type="button" disabled={!text.trim()} onClick={send} className="flex items-center gap-1 rounded bg-ai px-3 font-bold text-white disabled:opacity-40">
            <Send size={14} />
            送る
          </button>
        </div>
      </div>
    </div>
  );
}

interface Props {
  patients: { patient: Patient; room: string }[];
  today: CalendarDate;
  nowTime: string;
  onChart: (patientId: string, m: ChatMessage, line: string) => void;
}

/** The chat screen: hospital-wide and department channels, and one thread per patient. */
export function ChatView({ patients, today, nowTime, onChart }: Props) {
  const state = useChat();
  const patientChannels: Channel[] = patients.map(({ patient: p, room }) => ({ id: patientChannel(p.id), name: `${room} ${p.name}`, kind: "患者", patientId: p.id, description: `${p.name}さんについての連絡（医師・看護師・薬剤師）` }));
  const [active, setActive] = useState(FIXED_CHANNELS[0].id);
  const channel = [...FIXED_CHANNELS, ...patientChannels].find((c) => c.id === active) ?? FIXED_CHANNELS[0];
  const item = (c: Channel) => {
    const n = c.id === active ? 0 : unreadCount(state, c.id);
    const urgentUnread = c.id !== active && state.messages.filter((m) => m.channel === c.id).slice(state.read.get(c.id) ?? 0).some((m) => m.urgent);
    return (
      <li key={c.id}>
        <button type="button" onClick={() => setActive(c.id)} className={`flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-[13px] ${c.id === active ? "bg-ai-soft font-bold" : "hover:bg-paper"}`}>
          {c.kind === "患者" ? <User size={13} className="text-ink-faint" /> : <Hash size={13} className="text-ink-faint" />}
          <span className="truncate">{c.name}</span>
          {n > 0 && <span className={`ml-auto rounded-full px-1.5 text-[10px] font-bold text-white ${urgentUnread ? "bg-shu" : "bg-ai"}`}>{n}</span>}
        </button>
      </li>
    );
  };
  return (
    <main className="mx-auto grid h-full min-h-0 w-full max-w-6xl grid-cols-[220px_1fr] gap-4 px-5 py-4">
      <nav className="scroll-thin min-h-0 space-y-3 overflow-y-auto">
        <div>
          <h2 className="mb-1 text-xs font-bold text-ink-soft">院内・部署</h2>
          <ul>{FIXED_CHANNELS.map(item)}</ul>
        </div>
        <div>
          <h2 className="mb-1 text-xs font-bold text-ink-soft">患者別</h2>
          <ul>{patientChannels.map(item)}</ul>
        </div>
        <p className="text-[10px] text-ink-faint">架空の病院のチャットです。試作なので、このブラウザの中だけで共有されます（同じブラウザの別のタブにも出ます）。AI は使っていません。</p>
      </nav>
      <section className="flex min-h-0 flex-col rounded-lg border border-rule bg-paper p-3">
        <header className="mb-1 border-b border-rule pb-1">
          <b>{channel.name}</b>
          <span className="ml-2 text-[11px] text-ink-faint">{channel.description}</span>
        </header>
        <ChatThread key={channel.id} channel={channel} today={today} nowTime={nowTime} onChart={channel.patientId ? (m, line) => onChart(channel.patientId!, m, line) : undefined} />
      </section>
    </main>
  );
}
