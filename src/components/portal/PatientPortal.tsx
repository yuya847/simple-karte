"use client";

// 患者さんのページ (/patient): opened from the QR of the 診察券 or the bedside. The birth date opens it; the tab
// keeps the session until it is closed. Everything comes from the server's API, which reads only this patient's
// records: the 外来's call (asked every few seconds), the signed consents, the papers handed over, the lab results
// the patient agreed to see, and the admission questions. No AI, no explanation of results.

import { BellRing, ChevronLeft, ClipboardList, FileText, FlaskConical, LogOut, PenLine } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { IntakeAnswers } from "@/lib/portal/intake";
import type { PortalCall, PortalPaper, PortalView, PortalVisit } from "@/lib/portal/view";
import { IntakeForm } from "./IntakeForm";

type View = PortalView & { canSend: boolean; draftKey: string };
type Screen = "home" | "consents" | "papers" | "labs" | "intake";

const SESSION = "simple-karte:portal-session";
const TOKEN = "simple-karte:portal-token";
const DRAFT = "simple-karte:portal-draft:";
const TITLE = "患者さんのページ";
const POLL_MS = 4000;

const store = {
  get: (s: Storage | undefined, k: string) => {
    try {
      return s?.getItem(k) ?? null;
    } catch {
      return null;
    }
  },
  set: (s: Storage | undefined, k: string, v: string | null) => {
    try {
      if (v === null) s?.removeItem(k);
      else s?.setItem(k, v);
    } catch {}
  },
};

async function post<T>(url: string, body: unknown): Promise<{ ok: true; data: T } | { ok: false; status: number; error: string; left?: number; expired?: boolean }> {
  try {
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), cache: "no-store" });
    const json = (await res.json().catch(() => ({}))) as T & { error?: string; left?: number; expired?: boolean };
    return res.ok ? { ok: true, data: json } : { ok: false, status: res.status, error: json.error ?? "うまくいきませんでした。", left: json.left, expired: json.expired };
  } catch {
    return { ok: false, status: 0, error: "つながりません。電波のよいところでもう一度。" };
  }
}

const ERAS: [number, string][] = [[2019, "令和"], [1989, "平成"], [1926, "昭和"], [1912, "大正"]];
/** 「1948年（昭和23年）」 (the era by the year only: the year of a change shows the new era). */
const yearLabel = (y: number) => {
  const e = ERAS.find(([from]) => y >= from);
  return e ? `${y}年（${e[1]}${y - e[0] + 1 === 1 ? "元" : y - e[0] + 1}年）` : `${y}年`;
};

function Login({ onDone, onNoQr }: { onDone: (session: string) => void; onNoQr: () => void }) {
  const [y, setY] = useState("");
  const [m, setM] = useState("");
  const [d, setD] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const thisYear = new Date().getFullYear();
  const sel = "min-h-12 rounded-lg border border-rule bg-sheet px-2 text-[18px]";
  const send = async () => {
    setBusy(true);
    setError(null);
    const r = await post<{ session: string }>("/api/portal/login", { token: store.get(globalThis.sessionStorage, TOKEN), birth: `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}` });
    setBusy(false);
    if (r.ok) return onDone(r.data.session);
    if (r.expired) return onNoQr();
    setError(r.left ? `${r.error}（あと ${r.left} 回）` : r.error);
  };
  return (
    <main className="mx-auto max-w-md space-y-5 px-4 py-10">
      <h1 className="text-[22px] font-bold">生年月日を入れてください</h1>
      <div className="grid grid-cols-2 gap-2">
        <select aria-label="年" value={y} onChange={(e) => setY(e.target.value)} className={`${sel} col-span-2`}>
          <option value="">年</option>
          {Array.from({ length: 111 }, (_, i) => thisYear - i).map((n) => (
            <option key={n} value={n}>
              {yearLabel(n)}
            </option>
          ))}
        </select>
        <select aria-label="月" value={m} onChange={(e) => setM(e.target.value)} className={sel}>
          <option value="">月</option>
          {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>
              {n}月
            </option>
          ))}
        </select>
        <select aria-label="日" value={d} onChange={(e) => setD(e.target.value)} className={sel}>
          <option value="">日</option>
          {Array.from({ length: 31 }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>
              {n}日
            </option>
          ))}
        </select>
      </div>
      {error && <p className="rounded-lg bg-shu-soft p-3 text-[16px] font-bold text-shu">{error}</p>}
      <button type="button" disabled={!y || !m || !d || busy} onClick={() => void send()} className="min-h-14 w-full rounded-xl bg-ai text-[19px] font-bold text-white disabled:opacity-40">
        開く
      </button>
    </main>
  );
}

function CallBanner({ call, onSeen }: { call: PortalCall; onSeen: () => void }) {
  return (
    <section role="alert" className="space-y-3 rounded-2xl bg-shu p-5 text-white">
      <div className="flex items-center gap-2 text-[17px] font-bold">
        <BellRing size={22} />
        お呼びしています
      </div>
      <div className="nums text-[44px] font-bold leading-none">{call.ticket}番</div>
      <div className="text-[24px] font-bold leading-snug">{call.to === "会計" ? "会計へお越しください" : `${call.room ?? "診察室"}へお入りください`}</div>
      <button type="button" onClick={onSeen} className="min-h-12 w-full rounded-xl bg-white text-[18px] font-bold text-shu">
        わかりました
      </button>
    </section>
  );
}

function VisitCard({ visits, call }: { visits: PortalVisit[]; call: PortalCall | null }) {
  if (!visits.length) return null;
  return (
    <section className="space-y-2 rounded-2xl border border-rule bg-sheet p-4">
      {visits.map((v, i) => (
        <div key={i} className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          {v.ticket && <span className="nums text-[28px] font-bold">{v.ticket}番</span>}
          <span className="text-[16px] text-ink-soft">{v.dept}</span>
          <span className="text-[18px] font-bold">{call && call.ticket === v.ticket ? (call.to === "会計" ? "会計へお越しください" : `${call.room ?? "診察室"}へお入りください`) : v.state}</span>
        </div>
      ))}
    </section>
  );
}

function Tile({ icon: Icon, label, n, onClick }: { icon: typeof FileText; label: string; n?: number; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex min-h-16 w-full items-center gap-3 rounded-2xl border border-rule bg-sheet px-4 py-3 text-left text-[18px] font-bold">
      <Icon size={24} className="shrink-0 text-ai" />
      <span className="flex-1">{label}</span>
      {n !== undefined && <span className="nums rounded-full bg-ai-soft px-2.5 text-[15px] text-ai">{n}</span>}
    </button>
  );
}

function Back({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="flex items-center gap-2">
      <button type="button" onClick={onBack} className="flex min-h-11 items-center gap-1 rounded-lg border border-rule bg-sheet px-3 text-[16px]">
        <ChevronLeft size={18} />
        もどる
      </button>
      <h2 className="text-[20px] font-bold">{title}</h2>
    </div>
  );
}

function Papers({ items, empty }: { items: PortalPaper[]; empty: string }) {
  const [open, setOpen] = useState<string | null>(null);
  if (!items.length) return <p className="py-6 text-[17px] text-ink-soft">{empty}</p>;
  return (
    <ul className="space-y-3">
      {items.map((p) => (
        <li key={p.id} className="rounded-2xl border border-rule bg-sheet">
          <button type="button" aria-expanded={open === p.id} onClick={() => setOpen(open === p.id ? null : p.id)} className="w-full space-y-1 px-4 py-3 text-left">
            <div className="text-[18px] font-bold">{p.title}</div>
            <div className="nums text-[15px] text-ink-soft">
              {p.date}
              {p.by ? `　${p.by}` : ""}
              {p.status ? `　${p.status}` : ""}
            </div>
          </button>
          {open === p.id && (
            <div className="space-y-3 border-t border-rule px-4 py-3 text-[16px] leading-relaxed">
              {p.sections.map((s, i) => (
                <div key={i}>
                  {s.heading && <h3 className="font-bold">{s.heading}</h3>}
                  {s.lines.map((l, j) => (
                    <p key={j} className="whitespace-pre-wrap">
                      {l}
                    </p>
                  ))}
                </div>
              ))}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

function Labs({ view, onAgree }: { view: View; onAgree: (agree: boolean) => Promise<string | null> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const press = async (agree: boolean) => {
    setBusy(true);
    setError(await onAgree(agree));
    setBusy(false);
  };
  if (!view.labs.agreed)
    return (
      <div className="space-y-4">
        <p className="text-[17px]">検査の結果をこのページで見ますか。いつでもやめられます。</p>
        {error && <p className="rounded-lg bg-shu-soft p-3 text-[16px] font-bold text-shu">{error}</p>}
        <button type="button" disabled={busy || !view.canSend} onClick={() => void press(true)} className="min-h-14 w-full rounded-xl bg-ai text-[19px] font-bold text-white disabled:opacity-40">
          {view.canSend ? "見る" : "この環境では送れません"}
        </button>
      </div>
    );
  return (
    <div className="space-y-4">
      <p className="text-[16px] text-ink-soft">結果の説明は担当医からします。</p>
      {view.labs.sets.length === 0 && <p className="py-4 text-[17px] text-ink-soft">いま見られる結果はありません。</p>}
      {view.labs.sets.map((s) => (
        <section key={s.key} className="rounded-2xl border border-rule bg-sheet">
          <h3 className="nums border-b border-rule px-4 py-2 text-[17px] font-bold">
            {s.date} {s.time}
          </h3>
          <table className="w-full text-[16px]">
            <thead className="text-left text-[13px] text-ink-faint">
              <tr>
                <th className="px-4 py-1 font-normal">項目</th>
                <th className="px-2 py-1 text-right font-normal">値</th>
                <th className="px-4 py-1 font-normal">基準範囲</th>
              </tr>
            </thead>
            <tbody>
              {s.rows.map((r) => (
                <tr key={r.name} className="border-t border-rule-soft align-baseline">
                  <td className="px-4 py-1.5">{r.name}</td>
                  <td className={`nums whitespace-nowrap px-2 py-1.5 text-right font-bold ${r.flag ? "text-shu" : ""}`}>
                    {r.value}
                    {r.flag && <span className="ml-1 text-[13px]">{r.flag}</span>}
                    <span className="ml-1 text-[12px] font-normal text-ink-faint">{r.unit}</span>
                  </td>
                  <td className="nums px-4 py-1.5 text-[14px] text-ink-soft">{r.range}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
      {error && <p className="rounded-lg bg-shu-soft p-3 text-[16px] font-bold text-shu">{error}</p>}
      <button type="button" disabled={busy || !view.canSend} onClick={() => void press(false)} className="min-h-12 w-full rounded-xl border border-rule bg-sheet text-[17px] disabled:opacity-40">
        見るのをやめる
      </button>
    </div>
  );
}

function Intake({ view, session, onSent }: { view: View; session: string; onSent: () => void }) {
  const key = DRAFT + view.draftKey;
  const [answers, setAnswers] = useState<IntakeAnswers>(() => {
    try {
      return JSON.parse(store.get(globalThis.localStorage, key) ?? "{}") as IntakeAnswers;
    } catch {
      return {};
    }
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const change = (a: IntakeAnswers) => {
    setAnswers(a);
    setMsg(null);
    store.set(globalThis.localStorage, key, JSON.stringify(a));
  };
  const any = Object.values(answers).some((v) => (Array.isArray(v) ? v.length : !!v?.trim()));
  const send = async () => {
    setBusy(true);
    const r = await post<{ ok: true }>("/api/portal/send", { session, kind: "intake", answers });
    setBusy(false);
    if (!r.ok) return setMsg({ ok: false, text: r.error });
    store.set(globalThis.localStorage, key, null);
    setAnswers({});
    setMsg({ ok: true, text: "送りました。看護師が確かめます。" });
    onSent();
  };
  return (
    <div className="space-y-4 pb-28">
      {view.intake?.sent.map((s, i) => (
        <p key={i} className="nums text-[15px] text-ink-soft">
          {s.at} 送信　{s.done ? "看護師が確認しました" : "看護師の確認待ち"}
        </p>
      ))}
      {msg && <p className={`rounded-lg p-3 text-[16px] font-bold ${msg.ok ? "bg-wakatake-soft text-wakatake" : "bg-shu-soft text-shu"}`}>{msg.text}</p>}
      <IntakeForm value={answers} onChange={change} />
      <div className="fixed inset-x-0 bottom-0 border-t border-rule bg-paper/95 px-4 py-3">
        <div className="mx-auto max-w-xl">
          <button type="button" disabled={!any || busy || !view.canSend} onClick={() => void send()} className="min-h-14 w-full rounded-xl bg-ai text-[19px] font-bold text-white disabled:opacity-40">
            {view.canSend ? "病院に送る" : "この環境では送れません"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function PatientPortal() {
  const [phase, setPhase] = useState<"start" | "noqr" | "login" | "in">("start");
  const [session, setSession] = useState<string | null>(null);
  const [view, setView] = useState<View | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [screen, setScreen] = useState<Screen>("home");
  const [seen, setSeen] = useState<string | null>(null);
  const sessionRef = useRef(session);
  useEffect(() => {
    sessionRef.current = session;
  });

  const leave = useCallback((noQr = false) => {
    store.set(globalThis.sessionStorage, SESSION, null);
    if (noQr) store.set(globalThis.sessionStorage, TOKEN, null);
    setSession(null);
    setView(null);
    setScreen("home");
    setPhase(noQr || !store.get(globalThis.sessionStorage, TOKEN) ? "noqr" : "login");
  }, []);

  const load = useCallback(async () => {
    const s = sessionRef.current;
    if (!s) return;
    const r = await post<View>("/api/portal/me", { session: s });
    if (r.ok) {
      setView(r.data);
      setError(null);
    } else if (r.status === 401) leave(true);
    else setError(r.error);
  }, [leave]);

  // The QR's token (after # in the address) is kept for this tab and taken out of the address.
  useEffect(() => {
    const t = /(?:^#|&)t=([^&]+)/.exec(window.location.hash)?.[1];
    if (t) {
      const fresh = t !== store.get(globalThis.sessionStorage, TOKEN);
      store.set(globalThis.sessionStorage, TOKEN, t);
      if (fresh) store.set(globalThis.sessionStorage, SESSION, null);
      window.history.replaceState(null, "", window.location.pathname);
    }
    const s = store.get(globalThis.sessionStorage, SESSION);
    // Reading the browser's storage once after the first render (the server renders nothing of it).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSession(s);
    setPhase(s ? "in" : store.get(globalThis.sessionStorage, TOKEN) ? "login" : "noqr");
  }, []);

  useEffect(() => {
    if (phase !== "in") return;
    void load();
    const t = setInterval(() => void load(), 60_000);
    const back = () => !document.hidden && void load();
    document.addEventListener("visibilitychange", back);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", back);
    };
  }, [phase, load]);

  // 外来: the call, every few seconds while the page is open.
  const outpatient = view?.place === "外来";
  useEffect(() => {
    if (phase !== "in" || !outpatient) return;
    let gone = false;
    const tick = async () => {
      const s = sessionRef.current;
      if (!s) return;
      const r = await post<{ call: PortalCall | null; visits: PortalVisit[] }>("/api/portal/me", { session: s, only: "call" });
      if (gone) return;
      if (r.ok) setView((v) => (v ? { ...v, call: r.data.call, visits: r.data.visits } : v));
      else if (r.status === 401) leave(true);
    };
    const t = setInterval(() => void tick(), POLL_MS);
    return () => {
      gone = true;
      clearInterval(t);
    };
  }, [phase, outpatient, leave]);

  const call = view?.call ?? null;
  const fresh = !!call && call.key !== seen;
  useEffect(() => {
    document.title = call ? `【呼出】${call.ticket}番 ${call.to === "会計" ? "会計へ" : `${call.room ?? "診察室"}へ`}` : TITLE;
  }, [call]);
  useEffect(() => {
    if (fresh) navigator.vibrate?.([400, 200, 400, 200, 400]);
  }, [fresh, call?.key]);

  const agree = async (a: boolean) => {
    const r = await post("/api/portal/send", { session, kind: "labs", agree: a });
    if (!r.ok) return r.error;
    await load();
    return null;
  };

  if (phase === "start") return <main className="min-h-dvh bg-paper" />;
  if (phase === "noqr")
    return (
      <main className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="text-[22px] font-bold">診察券の QR を読み取ってください</h1>
      </main>
    );
  if (phase === "login")
    return (
      <Login
        onNoQr={() => leave(true)}
        onDone={(s) => {
          store.set(globalThis.sessionStorage, SESSION, s);
          setSession(s);
          setPhase("in");
        }}
      />
    );
  return (
    <div className="min-h-dvh bg-paper text-ink">
      <header className="sticky top-0 z-10 border-b border-rule bg-paper/95 px-4 py-3">
        <div className="mx-auto flex max-w-xl items-center gap-2">
          <div className="min-w-0 flex-1">
            <div className="truncate text-[20px] font-bold">{view ? `${view.name} 様` : "　"}</div>
          </div>
          <button type="button" onClick={() => leave()} className="flex min-h-11 items-center gap-1 rounded-lg border border-rule bg-sheet px-3 text-[15px]">
            <LogOut size={16} />
            終わる
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-xl space-y-4 px-4 py-4">
        {error && <p className="rounded-lg bg-yamabuki-soft p-3 text-[16px] font-bold text-yamabuki">{error}</p>}
        {!view ? (
          <p className="py-10 text-center text-[17px] text-ink-soft">読み込み中…</p>
        ) : screen === "home" ? (
          <>
            {call && fresh && <CallBanner call={call} onSeen={() => setSeen(call.key)} />}
            <VisitCard visits={view.visits} call={call} />
            <Tile icon={PenLine} label="同意書の控え" n={view.consents.length} onClick={() => setScreen("consents")} />
            <Tile icon={FileText} label="お渡しした書類" n={view.papers.length} onClick={() => setScreen("papers")} />
            <Tile icon={FlaskConical} label="検査の結果" onClick={() => setScreen("labs")} />
            {view.intake && <Tile icon={ClipboardList} label="入院のときの質問" onClick={() => setScreen("intake")} />}
          </>
        ) : (
          <>
            {call && fresh && <CallBanner call={call} onSeen={() => setSeen(call.key)} />}
            <Back title={{ consents: "同意書の控え", papers: "お渡しした書類", labs: "検査の結果", intake: "入院のときの質問" }[screen]} onBack={() => setScreen("home")} />
            {screen === "consents" && <Papers items={view.consents} empty="まだありません。" />}
            {screen === "papers" && <Papers items={view.papers} empty="まだありません。" />}
            {screen === "labs" && <Labs view={view} onAgree={agree} />}
            {screen === "intake" && session && <Intake view={view} session={session} onSent={() => void load()} />}
          </>
        )}
      </main>
    </div>
  );
}
