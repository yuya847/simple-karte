"use client";

import { KeyRound, LockKeyhole, LogIn } from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import { auditLog } from "@/lib/audit";
import { afterFail, checkPassword, forgetPassword, hashPassword, loadFails, loadPasswords, lockedFor, LOCK_RULE, passwordProblem, PASSWORD_RULE, saveFails, savePassword, type LoginUser } from "@/lib/login";
import { ROLE_LONG } from "@/lib/roles";

interface Props {
  users: LoginUser[];
  /** Locked after some minutes without use (the person stays chosen). */
  locked: { at: string; minutes: number } | null;
  current: LoginUser | null;
  onLogin: (u: LoginUser) => void;
  /** デモ用：ログインの仕組みを切る（この端末）. */
  onTurnOff: () => void;
}

/**
 * The login screen (only when ログインの仕組み is on for this device): choose the person, enter the password;
 * the first time on this device the person sets one. Nothing of the chart is shown behind it.
 */
export function LoginGate({ users, locked, current, onLogin, onTurnOff }: Props) {
  const [who, setWho] = useState<LoginUser | null>(locked ? current : null);
  const [pw, setPw] = useState("");
  const [again, setAgain] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [, rerender] = useState(0);
  const known = loadPasswords();
  const first = !!who && !known[who.name];

  const pick = (u: LoginUser) => {
    setWho(u);
    setPw("");
    setAgain("");
    setProblem(null);
  };
  const submit = async () => {
    if (!who || busy) return;
    setBusy(true);
    setProblem(null);
    try {
      if (first) {
        const why = passwordProblem(pw, again, who.name);
        if (why) return setProblem(why);
        savePassword(who.name, await hashPassword(pw, who.role));
        auditLog({ role: who.role, actor: who.name, action: "この端末でパスワードを決めてログインした" });
        return onLogin(who);
      }
      const fails = loadFails();
      const stopped = lockedFor(fails[who.name], Date.now());
      if (stopped) return setProblem(`続けて違ったため、あと${stopped}分はログインできません。`);
      if (await checkPassword(pw, known[who.name])) {
        saveFails({ ...fails, [who.name]: { count: 0 } });
        auditLog({ role: who.role, actor: who.name, action: locked ? "画面のロックを解いた（ログイン）" : "ログインした" });
        return onLogin(who);
      }
      const next = afterFail(fails[who.name], Date.now());
      saveFails({ ...fails, [who.name]: next });
      auditLog({ role: who.role, actor: who.name, action: next.until ? `ログインに${LOCK_RULE.tries}回続けて失敗した（${LOCK_RULE.minutes}分止めた）` : "ログインに失敗した" });
      setProblem(next.until ? `${LOCK_RULE.tries}回続けて違ったので、${LOCK_RULE.minutes}分はログインできません。` : `パスワードが違います（あと${LOCK_RULE.tries - next.count}回違うと${LOCK_RULE.minutes}分止まります）。`);
      setPw("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="ログイン" className="fixed inset-0 z-[100] grid place-items-center overflow-auto bg-paper p-4 print:hidden">
      <div className="w-full max-w-lg space-y-3 rounded-lg border border-rule bg-sheet p-5 text-[13px] shadow">
        <div className="flex items-center gap-2">
          <Image src="/simple-karte-logo-small.svg" alt="SimpleKarte" width={110} height={19} priority />
          <span className="rounded border border-dashed border-ink-faint px-1.5 py-0.5 text-[10px] text-ink-soft">ログインの仕組み（試し）</span>
        </div>
        {locked && (
          <p className="flex items-center gap-1 rounded-md border border-yamabuki bg-yamabuki-soft px-3 py-1.5">
            <LockKeyhole size={14} />
            {locked.minutes ? `${locked.minutes}分操作がなかったので、${locked.at} に画面をロックしました。` : `${locked.at} に画面をロックしました。`}パスワードを入れると続きから使えます。
          </p>
        )}
        {!who ? (
          <section>
            <h1 className="mb-2 text-base font-bold">だれが使いますか</h1>
            <ul className="grid grid-cols-2 gap-1.5">
              {users.map((u) => (
                <li key={u.name}>
                  <button type="button" onClick={() => pick(u)} className="w-full rounded-md border border-rule bg-paper px-2 py-1.5 text-left hover:border-ai pointer-coarse:py-2.5">
                    <b className="block">{u.name}</b>
                    <span className="text-[11px] text-ink-soft">{ROLE_LONG[u.role]}{loadPasswords()[u.name] ? "" : "（この端末では初めて）"}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
            className="space-y-2"
          >
            <h1 className="text-base font-bold">
              {who.name}
              <span className="ml-2 text-[12px] font-normal text-ink-soft">{ROLE_LONG[who.role]}</span>
            </h1>
            {first && <p className="text-ink-soft">この端末では初めてです。パスワードを決めてください（{PASSWORD_RULE.min}文字以上、英字と数字を混ぜる。推測されやすい言葉や名前は使えません）。この端末のブラウザに、元に戻せない形（ハッシュ）でだけ残ります。</p>}
            <label className="flex items-center gap-2">
              <span className="w-28 shrink-0 text-ink-soft">パスワード</span>
              <input type="password" autoComplete={first ? "new-password" : "current-password"} value={pw} onChange={(e) => setPw(e.target.value)} className="min-w-0 flex-1 rounded border border-rule bg-paper px-2 py-1" />
            </label>
            {first && (
              <label className="flex items-center gap-2">
                <span className="w-28 shrink-0 text-ink-soft">もう一度</span>
                <input type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} className="min-w-0 flex-1 rounded border border-rule bg-paper px-2 py-1" />
              </label>
            )}
            {problem && <p className="text-yamabuki">{problem}</p>}
            <div className="flex flex-wrap items-center gap-2">
              <button type="submit" disabled={busy || !pw} className="flex items-center gap-1 rounded-md bg-ai px-4 py-1.5 font-bold text-white disabled:opacity-40">
                {first ? <KeyRound size={14} /> : <LogIn size={14} />}
                {busy ? "確かめています…" : first ? "パスワードを決めてログイン" : "ログイン"}
              </button>
              <button type="button" onClick={() => setWho(null)} className="rounded px-2 py-1 text-ink-soft hover:text-ink">
                {locked ? "別の人でログイン" : "人を選び直す"}
              </button>
            </div>
          </form>
        )}
        <div className="space-y-1 border-t border-rule-soft pt-2 text-[11px] text-ink-faint">
          <p>この病院の職員だけです。パスワードは本物のものを使わないでください。二要素認証はありません（実際の電子カルテには要ります）。</p>
          <p className="flex flex-wrap gap-x-3">
            <button type="button" onClick={onTurnOff} className="underline hover:text-ai">
              ログインの仕組みを切る（この端末・デモ用）
            </button>
            {who && known[who.name] && (
              <button
                type="button"
                onClick={() => {
                  forgetPassword(who.name);
                  auditLog({ role: who.role, actor: who.name, action: "この端末のパスワードを消した（デモ用）" });
                  rerender((n) => n + 1);
                }}
                className="underline hover:text-shu"
              >
                {who.name}のこの端末のパスワードを消す（デモ用：忘れたとき）
              </button>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
