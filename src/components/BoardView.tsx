"use client";

import { Check, Megaphone, Plus, Search, X } from "lucide-react";
import { useState } from "react";
import { auditLog } from "@/lib/audit";
import { DEPTS, ROLE_DEPT, UNTIL_CHOICES, fillDates, isExpired, isRead, postProblems, searchText, sortNotices, unreadCount, untilLabel, type Dept, type Notice, type Reads } from "@/lib/board";
import { addDays, formatShort, type CalendarDate } from "@/lib/dates";
import { kanaMatch } from "@/lib/kana";
import { useMe } from "./RoleContext";
import { TabChoice } from "./TabChoice";

interface Props {
  notices: Notice[];
  /** Notice id → names of the staff who opened it. */
  reads: Reads;
  today: CalendarDate;
  nowTime: string;
  /** A notice was opened by this person (the parent adds the name, e.g. with markRead). */
  onRead: (id: string, name: string) => void;
  /** A new notice was put up. */
  onPost: (n: Notice) => void;
  /** Everyone the notice is for (to show who has not read it), and the reminders sent (notice id → names, time). */
  staff?: string[];
  reminded?: Record<string, { names: string[]; at: string; by: string }>;
  onRemind?: (id: string, names: string[]) => void;
}

let seq = 0;
const newId = () => `n-${Date.now()}-${++seq}`;

const input = "rounded-md border border-rule bg-sheet px-2 py-1.5 text-[13px] text-ink outline-none focus:border-ai pointer-coarse:py-2";
const postedAt = (n: Notice, today: CalendarDate) => `${formatShort(addDays(today, n.posted.day))} ${n.posted.time}`;

/** 掲示板: notices from the departments of the fictional hospital, with who has read each one. */
export function BoardView({ notices, reads, today, nowTime, onRead, onPost, staff = [], reminded = {}, onRemind }: Props) {
  const me = useMe();
  const [dept, setDept] = useState<Dept | "">("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [showExpired, setShowExpired] = useState(false);
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);

  const unread = unreadCount(notices, reads, me.name);
  const expired = notices.filter((n) => isExpired(n)).length;
  const shown = sortNotices(notices, reads, me.name).filter(
    (n) => (showExpired || !isExpired(n)) && (!dept || n.from === dept) && (!unreadOnly || !isRead(reads, n.id, me.name) || n.id === openId) && (!q.trim() || kanaMatch(searchText(n), q)),
  );
  const open = openId ? (notices.find((n) => n.id === openId) ?? null) : null;

  const choose = (n: Notice) => {
    setOpenId(n.id);
    setPosting(false);
    if (!isRead(reads, n.id, me.name)) onRead(n.id, me.name);
  };

  return (
    <section aria-label="掲示板" className="flex min-h-0 flex-1 flex-col bg-paper text-[13px]">
      <header className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-rule bg-sheet px-5 py-3">
        <h1 className="flex items-center gap-2 text-lg font-bold">
          <Megaphone size={20} className="text-ai" />
          掲示板
          <span className="rounded border border-dashed border-ink-faint px-1.5 py-0.5 text-[10px] font-normal text-ink-soft">架空</span>
        </h1>
        <p className="nums text-sm text-ink-soft">
          {me.name}の未読 <b className={unread ? "text-shu" : "text-ink"}>{unread}</b>件
        </p>
        <button
          type="button"
          onClick={() => {
            setPosting(true);
            setOpenId(null);
          }}
          className="ml-auto flex items-center gap-1.5 rounded-md bg-ink px-3 py-1.5 text-sm font-bold text-white hover:bg-ink/90 pointer-coarse:py-2"
        >
          <Plus size={15} />
          掲示する
        </button>
      </header>

      <div className="flex min-h-0 flex-1">
        <nav aria-label="掲示の一覧" className="flex min-h-0 w-[min(400px,42%)] shrink-0 flex-col border-r border-rule bg-sheet">
          <div className="space-y-2 border-b border-rule-soft p-3">
            <label className="flex items-center gap-1.5 rounded-md border border-rule bg-paper px-2 focus-within:border-ai">
              <Search size={14} className="shrink-0 text-ink-faint" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="題名・本文で探す（ひらがなでも）" aria-label="掲示を探す" className="min-w-0 flex-1 bg-transparent py-1.5 outline-none pointer-coarse:py-2" />
              {q && (
                <button type="button" onClick={() => setQ("")} aria-label="検索を消す" className="text-ink-faint hover:text-ink">
                  <X size={14} />
                </button>
              )}
            </label>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12px] text-ink-soft">
              <select value={dept} onChange={(e) => setDept(e.target.value as Dept | "")} aria-label="部署で絞り込む" className="rounded-md border border-rule bg-sheet px-1.5 py-1 text-[12px] text-ink pointer-coarse:py-1.5">
                <option value="">すべての部署</option>
                {DEPTS.map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </select>
              <label className="flex items-center gap-1">
                <input type="checkbox" checked={unreadOnly} onChange={(e) => setUnreadOnly(e.target.checked)} className="accent-ai pointer-coarse:size-4" />
                未読だけ
              </label>
              <label className="flex items-center gap-1">
                <input type="checkbox" checked={showExpired} onChange={(e) => setShowExpired(e.target.checked)} className="accent-ai pointer-coarse:size-4" />
                期限切れも出す（{expired}件）
              </label>
            </div>
          </div>
          <ul className="scroll-thin min-h-0 flex-1 overflow-y-auto">
            {shown.length === 0 && <li className="px-4 py-6 text-ink-faint">当てはまる掲示はありません。</li>}
            {shown.map((n) => {
              const read = isRead(reads, n.id, me.name);
              const old = isExpired(n);
              return (
                <li key={n.id} className="border-b border-rule-soft">
                  <button
                    type="button"
                    onClick={() => choose(n)}
                    aria-current={n.id === openId ? "true" : undefined}
                    className={`flex w-full flex-col gap-0.5 px-4 py-2.5 text-left pointer-coarse:py-3.5 ${n.id === openId ? "bg-ai-soft" : "hover:bg-paper"} ${old ? "text-ink-faint" : ""}`}
                  >
                    <span className="flex flex-wrap items-center gap-1.5 text-[11px]">
                      {!read && (
                        <>
                          <span aria-hidden className="size-2 shrink-0 rounded-full bg-ai" />
                          <span className="sr-only">未読</span>
                        </>
                      )}
                      {n.important && <span className="rounded bg-shu-soft px-1 font-bold text-shu">重要</span>}
                      <span className="text-ink-soft">{n.from}</span>
                      <span className="nums ml-auto text-ink-faint">{postedAt(n, today)}</span>
                    </span>
                    <span className={`leading-snug ${read ? "" : "font-bold"}`}>{n.title}</span>
                    {old && <span className="text-[11px]">{untilLabel(n, today)}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="border-t border-rule-soft px-4 py-2 text-[10px] text-ink-faint">
            架空の病院の掲示板です。並べ方（重要で未読 → 未読 → 既読、それぞれ新しい順）と期限切れを隠すのはコードで行います。AI は使っていません。試作なので、掲示と既読はこのブラウザの中だけにあります。
          </p>
        </nav>

        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto p-5">
          {posting ? (
            <PostForm
              dept={ROLE_DEPT[me.role]}
              onCancel={() => setPosting(false)}
              onPost={(f) => {
                const n: Notice = { id: newId(), from: ROLE_DEPT[me.role], title: f.title.trim(), body: f.body.trim(), by: me.name, posted: { day: 0, time: nowTime }, important: f.important, until: f.until };
                onPost(n);
                onRead(n.id, me.name);
                auditLog({ role: me.role, actor: me.name, action: "掲示板に掲示した", detail: `${n.from}「${n.title}」${n.important ? "（重要）" : ""}・${untilLabel(n, today)}` });
                setPosting(false);
                setOpenId(n.id);
              }}
            />
          ) : open ? (
            <NoticeDetail notice={open} readers={reads[open.id] ?? []} today={today} staff={staff} reminded={reminded[open.id]} onRemind={onRemind ? (names) => onRemind(open.id, names) : undefined} />
          ) : (
            <p className="text-ink-faint">左の一覧から掲示を選ぶと、ここに出ます。開くと既読になります。</p>
          )}
        </div>
      </div>
    </section>
  );
}

function NoticeDetail({ notice: n, readers, today, staff, reminded, onRemind }: { notice: Notice; readers: string[]; today: CalendarDate; staff: string[]; reminded?: { names: string[]; at: string; by: string }; onRemind?: (names: string[]) => void }) {
  const notYet = staff.filter((s) => !readers.includes(s));
  return (
    <article className="mx-auto max-w-3xl rounded-lg border border-rule bg-sheet p-5">
      <div className="mb-1 flex flex-wrap items-center gap-2 text-[12px]">
        {n.important && <span className="rounded bg-shu-soft px-1.5 py-0.5 font-bold text-shu">重要</span>}
        <span className="rounded bg-tab px-1.5 py-0.5 text-ink">{n.from}</span>
        {isExpired(n) && <span className="rounded border border-rule px-1.5 py-0.5 text-ink-faint">期限切れ</span>}
      </div>
      <h2 className="text-base font-bold leading-snug">{n.title}</h2>
      <p className="nums mt-1 text-[12px] text-ink-soft">
        掲示 {postedAt(n, today)}・{n.by}・掲示期限 {untilLabel(n, today)}
      </p>
      <p className="mt-4 whitespace-pre-wrap leading-relaxed text-ink">{fillDates(n.body, today)}</p>
      {n.source && (
        <p className="mt-4 border-t border-rule-soft pt-2 text-[11px] text-ink-soft">
          出典：<Linkified text={n.source} />
        </p>
      )}
      <p className="mt-4 flex flex-wrap items-center gap-1 border-t border-rule-soft pt-2 text-[11px] text-ink-soft">
        <Check size={12} className="text-wakatake" />
        開いた人（{readers.length}人）：{readers.length ? readers.join("、") : "まだいません"}
      </p>
      {notYet.length > 0 && (
        <p className="mt-1 flex flex-wrap items-center gap-1 text-[11px] text-ink-soft">
          まだの人（{notYet.length}人）：{notYet.join("、")}
          {onRemind && (
            <button type="button" onClick={() => onRemind(notYet)} className="ml-1 rounded border border-yamabuki px-1.5 py-0.5 font-bold text-yamabuki hover:bg-yamabuki hover:text-white">
              まだの人に知らせる
            </button>
          )}
          {reminded && (
            <span className="nums">
              （{reminded.at} {reminded.by} が {reminded.names.length}人に知らせました）
            </span>
          )}
        </p>
      )}
    </article>
  );
}

/** Text with its https:// addresses as links. */
function Linkified({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/\S+)/);
  return (
    <>
      {parts.map((p, i) =>
        /^https?:\/\//.test(p) ? (
          <a key={i} href={p} target="_blank" rel="noreferrer" className="break-all text-ai underline">
            {p}
          </a>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

interface PostDraft {
  title: string;
  body: string;
  important: boolean;
  until: number | null;
}

function PostForm({ dept, onCancel, onPost }: { dept: Dept; onCancel: () => void; onPost: (f: PostDraft) => void }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [important, setImportant] = useState(false);
  const [until, setUntil] = useState("7");
  const missing = postProblems({ title, body });
  const days = UNTIL_CHOICES.find((c) => c.value === until)?.days ?? null;
  return (
    <form
      className="mx-auto max-w-3xl space-y-3 rounded-lg border border-rule bg-sheet p-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!missing.length) onPost({ title, body, important, until: days });
      }}
    >
      <div className="flex items-center justify-between">
        <h2 className="font-bold">掲示する</h2>
        <button type="button" onClick={onCancel} aria-label="やめる" className="rounded p-1 text-ink-faint hover:bg-paper hover:text-ink">
          <X size={16} />
        </button>
      </div>
      <p className="rounded-md bg-yamabuki-soft px-3 py-2 text-[12px] text-yamabuki">架空の病院の掲示です。実在の人・患者・院の情報は書かないでください。</p>
      <p className="text-[12px] text-ink-soft">
        部署：<b className="text-ink">{dept}</b>（いま入っている職種から決まります）
      </p>
      <label className="flex flex-col gap-1 text-[12px] text-ink-soft">
        題名
        <input value={title} onChange={(e) => setTitle(e.target.value)} className={input} />
      </label>
      <label className="flex flex-col gap-1 text-[12px] text-ink-soft">
        本文
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={7} className={`${input} resize-y leading-relaxed`} />
      </label>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[12px] text-ink-soft">
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={important} onChange={(e) => setImportant(e.target.checked)} className="accent-shu pointer-coarse:size-4" />
          重要（一覧の上に出ます）
        </label>
        <span className="flex items-center gap-2">
          掲示期限
          <TabChoice label="掲示期限" options={UNTIL_CHOICES.map((c) => ({ value: c.value, label: c.label }))} value={until} onChange={setUntil} />
        </span>
      </div>
      <div className="flex items-center gap-3 border-t border-rule-soft pt-3">
        {missing.length > 0 && <span className="text-[12px] text-yamabuki">まだ：{missing.join("・")}</span>}
        <button type="submit" disabled={missing.length > 0} className="ml-auto flex items-center gap-1.5 rounded-md bg-ai px-4 py-1.5 font-bold text-white disabled:opacity-40 pointer-coarse:py-2">
          <Megaphone size={14} />
          掲示する
        </button>
      </div>
    </form>
  );
}
